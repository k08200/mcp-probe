# mcp-probe

[![CI](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml/badge.svg)](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@k08200/mcp-probe)](https://www.npmjs.com/package/@k08200/mcp-probe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**CI readiness gate for MCP servers.**

`tools/list` is not enough. An MCP server can start, advertise a clean schema, and still fail every real tool call because auth, scopes, downstream permissions, or environment setup are broken.

`mcp-probe` checks the path an agent actually depends on:

- MCP `initialize` handshake
- `tools/list` discovery
- optional real `tools/call` dry-runs
- sidecar sample inputs for meaningful calls
- contract assertions for result shape, row limits, stable error codes, and leak checks
- GitHub Actions summaries and machine-readable JSON output
- optional JSON receipt artifacts for independent CI evidence

## Looking For Real-World Recipes

The core tool is useful only if it reflects real MCP failure modes. If you run MCP servers in agent workflows, recipe contributions are especially useful for:

| Server | What to validate | Issue |
|---|---|---|
| Datadog | OAuth/scopes, logs/metrics read paths, auth handoff failures | [#1](https://github.com/k08200/mcp-probe/issues/1) |
| Supabase | read-only roles, row limits, tenant/project scope, denied writes | [#2](https://github.com/k08200/mcp-probe/issues/2) |
| Gmail | OAuth browser handoff, stable auth errors, no private email leaks | [#3](https://github.com/k08200/mcp-probe/issues/3) |

Do not paste secrets. Recipes should use placeholders such as `${DATADOG_MCP_TOKEN}` and read-only sample calls.

## Quick Start

```bash
npx @k08200/mcp-probe@latest @modelcontextprotocol/server-memory
```

For CI, scaffold a config, sidecar, and workflow:

```bash
npx @k08200/mcp-probe@latest init \
  --target @your-org/your-mcp-server \
  --discover \
  --github-actions
```

Then run:

```bash
npx @k08200/mcp-probe@latest --config mcp-probe.config.json --github-summary --fail-on-warn
```

## Commands

```bash
# Check one server
mcp-probe @modelcontextprotocol/server-memory

# Check a local server
mcp-probe ./server.js

# Check a remote Streamable HTTP server
mcp-probe https://mcp.example.com/mcp --header "Authorization: Bearer $TOKEN"

# Batch-check from config
mcp-probe --config mcp-probe.config.json

# Persist an independent readiness receipt artifact
mcp-probe --config mcp-probe.config.json --receipt-file mcp-probe.receipt.json

# Call tools, not just tools/list
mcp-probe @scope/server --probe-tools

# Use meaningful sidecar inputs
mcp-probe @scope/server --tools-file .mcp-probe.json

# Preflight local mcp-probe setup
mcp-probe doctor

# Make warnings fail CI too
mcp-probe --config mcp-probe.config.json --fail-on-warn

# Create missing config/sidecar/workflow files
mcp-probe doctor --fix --target @scope/server
```

## Config

Use `mcp-probe.config.json` when a repository depends on one or more MCP servers:

```json
{
  "timeoutMs": 10000,
  "servers": [
    {
      "name": "datadog",
      "target": "https://mcp.example.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${DATADOG_MCP_TOKEN}"
      },
      "expectedTools": ["logs_query"],
      "forbiddenTools": ["delete_dashboard", "rotate_api_key"],
      "toolsFile": "./datadog.tools.json"
    }
  ]
}
```

Relative local `target` and `toolsFile` paths are resolved from the config file directory.

Use `expectedTools` for tools that must be advertised, `allowedTools` for an exact allow-list, and `forbiddenTools` for dangerous tools that must not appear in low-trust configs.
When `expectedTools` and a `toolsFile` are both set, every expected tool must also have a sidecar sample input so CI proves the tool is actually dry-run.

Run:

```bash
mcp-probe --config mcp-probe.config.json --github-summary --fail-on-warn
```

## Sidecar Inputs

Auto-generated tool inputs mostly test schema validation. Production CI should use sidecar inputs that reach real read-only paths.

When a sidecar is provided, mcp-probe calls only the tools listed in that file. Tools that are discovered but not listed are not called.

```json
{
  "tools": {
    "logs_query": {
      "input": {
        "query": "service:web status:error",
        "timeframe": "1h"
      },
      "expect": {
        "status": "pass",
        "not_error_code": [401, 403],
        "requiredFields": ["source", "freshness"],
        "maxRows": 100
      }
    }
  }
}
```

Supported assertions:

| Assertion | Purpose |
|---|---|
| `status` | Expected call status: `pass`, `fail`, or `warn`. |
| `requiredFields` | Fields that must appear somewhere in the result payload. |
| `maxRows` | Maximum allowed row count from metadata or row arrays. |
| `errorCode` | Stable error code expected in an error response. |
| `contains` | Text snippets that must appear. |
| `notContains` | Text snippets that must not appear, useful for leak checks. |
| `not_error_code` | HTTP/status codes treated as warnings, usually auth handoff codes. |

## Doctor

`doctor` checks whether the repository is ready to run mcp-probe in CI:

```bash
mcp-probe doctor
```

It validates:

- Node.js version
- config file shape
- sidecar file shape
- `expectedTools` sidecar sample coverage
- GitHub Actions workflow presence, strict CI flags, receipt generation, and artifact upload
- whether mcp-probe is actually executed from a workflow `run:` step

`doctor --fix` creates missing files. It does **not** rewrite existing workflows unless `--force` is explicitly passed.
When a config already declares `expectedTools`, missing sidecar files are scaffolded with those tool names instead of a generic placeholder.

```bash
mcp-probe doctor --fix --target @your-org/your-mcp-server
```

## GitHub Actions

```yaml
name: MCP Probe

on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-probe:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 20
      - run: |
          npx @k08200/mcp-probe@latest \
            --config mcp-probe.config.json \
            --github-summary \
            --fail-on-warn \
            --receipt-file mcp-probe.receipt.json
      - uses: actions/upload-artifact@v4
        with:
          name: mcp-probe-receipt
          path: mcp-probe.receipt.json
```

## Receipt Artifacts

`--receipt-file` writes a redacted JSON artifact containing the observed handshake, tool catalog, dry-run calls, contract assertions, and final status.

Use it when CI needs durable evidence of what actually happened, not just terminal output:

```bash
mcp-probe --config mcp-probe.config.json --receipt-file mcp-probe.receipt.json
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Passed, or warnings only unless `--fail-on-warn` is set |
| `1` | One or more checks failed |

Warnings do not fail CI by default. They are intended for degraded states such as OAuth handoff or permission issues that should be visible but may not block every deploy.
Use `--fail-on-warn` for production readiness gates where auth handoff, permission warnings, or incomplete receipts should block the workflow.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
