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
npx @k08200/mcp-probe@latest --config mcp-probe.config.json --github-summary
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

# Call tools, not just tools/list
mcp-probe @scope/server --probe-tools

# Use meaningful sidecar inputs
mcp-probe @scope/server --tools-file .mcp-probe.json

# Preflight local mcp-probe setup
mcp-probe doctor

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
      "toolsFile": "./datadog.tools.json"
    }
  ]
}
```

Relative local `target` and `toolsFile` paths are resolved from the config file directory.

Run:

```bash
mcp-probe --config mcp-probe.config.json --github-summary
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
- GitHub Actions workflow presence and recommended flags

`doctor --fix` creates missing files. It does **not** rewrite existing workflows unless `--force` is explicitly passed.

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
      - run: npx @k08200/mcp-probe@latest --config mcp-probe.config.json --github-summary
```

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Passed, or warnings only |
| `1` | One or more checks failed |

Warnings do not fail CI by default. They are intended for degraded states such as OAuth handoff or permission issues that should be visible but may not block every deploy.

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

## License

MIT
