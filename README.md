# mcp-probe

[![CI](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml/badge.svg)](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@k08200/mcp-probe)](https://www.npmjs.com/package/@k08200/mcp-probe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@k08200/mcp-probe)](package.json)

**CI readiness gate for MCP servers.** Validates protocol handshake, discovery, optional tool-call dry-runs, stderr noise, and response latency in one command.

The `npm audit` for the [MCP](https://modelcontextprotocol.io) ecosystem — because an MCP server can start, pass `tools/list`, and still fail every real tool call when auth handoff, browser OAuth, or downstream permissions are broken.

Read the v1 launch post: [mcp-probe v1.0.0: A CI readiness gate for MCP servers](https://dev.to/k08200/mcp-probe-v100-a-ci-readiness-gate-for-mcp-servers-4ch0)

## Quick Start for CI

Scaffold the config, sidecar, and GitHub Actions workflow:

```bash
npx @k08200/mcp-probe@latest init \
  --target @your-org/your-mcp-server \
  --discover \
  --github-actions
```

Add this workflow to any project that depends on MCP servers:

```yaml
name: MCP Probe

on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-probe:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - name: Validate MCP server
        run: |
          npx @k08200/mcp-probe @your-org/your-mcp-server \
            --probe-tools \
            --github-summary
```

For teams running several MCP servers, use a config file:

```bash
npx @k08200/mcp-probe --config mcp-probe.config.json --github-summary
```

For production CI, add sidecar inputs so dry-runs call real read-only paths instead of schema-minimum placeholders:

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

```bash
npx @k08200/mcp-probe @modelcontextprotocol/server-memory
```

```
mcp-probe  @modelcontextprotocol/server-memory
────────────────────────────────────────────────────
  ✓  Target resolution
     npx --yes @modelcontextprotocol/server-memory
  ✓  MCP protocol handshake  1392ms
     memory-server v0.6.3
  ✓  Tools discovery  33ms
     Found 9 tools
  ✓  Tool schema validation
     All tool schemas are valid
────────────────────────────────────────────────────
  Server   memory-server v0.6.3
  Caps     tools

  Tools
    ▸ create_entities  Create multiple new entities in the knowledge graph
    ▸ create_relations  Create multiple new relations between entities
    ▸ add_observations  Add new observations to existing entities
    ▸ delete_entities  Delete entities and their associated relations
    ▸ read_graph  Read the entire knowledge graph
    ▸ search_nodes  Search for nodes in the knowledge graph
    ▸ ...and 3 more

  ✓  PASS  1455ms total
```

---

## Install

Requires Node.js 20.19 or newer.

```bash
# No install needed
npx @k08200/mcp-probe <target>

# Or install globally
npm install -g @k08200/mcp-probe
```

## Usage

```bash
# Check an npm package
mcp-probe @modelcontextprotocol/server-memory

# Scaffold config + .mcp-probe.json + optional GitHub Actions workflow
mcp-probe init --target @modelcontextprotocol/server-memory --github-actions

# Discover tool names first and scaffold sidecar entries automatically
mcp-probe init --target @modelcontextprotocol/server-memory --discover --github-actions

# Scaffold a remote server config with auth from an env var
mcp-probe init \
  --target https://mcp.example.com/mcp \
  --transport http \
  --header-env MCP_TOKEN \
  --github-actions

# Choose custom scaffold paths
mcp-probe init \
  --target @your-org/your-mcp-server \
  --config-file ci/mcp-probe.config.json \
  --sidecar-file ci/mcp-tools.json

# Check a server that requires arguments (e.g. directories to serve)
mcp-probe @modelcontextprotocol/server-filesystem /tmp /Users/me/projects

# Check a local server file
mcp-probe ./my-server.js

# Check a remote Streamable HTTP MCP server
mcp-probe https://mcp.example.com/mcp

# Check a legacy HTTP+SSE MCP server
mcp-probe https://mcp.example.com/sse --transport sse

# Pass headers to remote servers
mcp-probe https://mcp.example.com/mcp --header "Authorization: Bearer $TOKEN"

# Ignore known noisy stderr lines when classifying startup failures
mcp-probe @scope/server --stderr-allow "^Warning:" --stderr-fatal "panic|FATAL"

# JSON output for CI / scripting
mcp-probe @scope/server --output json

# Custom timeout (default: 10000ms)
mcp-probe @scope/server --timeout 30000

# Batch-check several servers from a config file
mcp-probe --config mcp-probe.config.json

# Write GitHub Actions summary and annotations
mcp-probe --config mcp-probe.config.json --github-summary

# Write shields.io endpoint JSON for a status badge
mcp-probe --config mcp-probe.config.json --badge-file mcp-probe-badge.json

# Call tools with generated minimal inputs
mcp-probe @scope/server --probe-tools

# Call tools with real sample inputs from a sidecar file
mcp-probe @scope/server --tools-file .mcp-probe.json
```

## What it checks

| Check | Description |
|-------|-------------|
| **Target resolution** | Can the package be located and spawned? |
| **MCP protocol handshake** | Does the server respond to `initialize`? Measures connect latency. |
| **Tools discovery** | Does `tools/list` return results? Measures list latency. |
| **Tool schema validation** | Are all tool schemas well-formed? |
| **Resources discovery** | Runs `resources/list` when the server advertises resources. |
| **Prompts discovery** | Runs `prompts/list` when the server advertises prompts. |
| **Tool call dry-run** | Optional `tools/call` checks via `--probe-tools` or `--tools-file`. |

## Issue codes and remediation hints

When a check warns or fails, mcp-probe attaches stable issue metadata:

```json
{
  "name": "Tool call dry-run",
  "status": "warn",
  "message": "1 auth/permission errors (1 sidecar, 0 auto)",
  "issue": {
    "code": "TOOL_CALL_AUTH",
    "hint": "At least one tool call hit auth or permission handling. This often means CI needs tokens or the server needs non-browser auth."
  }
}
```

These hints appear in terminal output, JSON output, GitHub Actions summaries, and workflow annotations so PR failures point at the likely fix instead of only showing raw MCP errors.

Common issue codes:

| Code | Meaning |
|------|---------|
| `TARGET_NOT_FOUND` | The npm package, local file, or executable could not be started. |
| `HANDSHAKE_TIMEOUT` | The server did not complete MCP `initialize` before the timeout. |
| `HANDSHAKE_AUTH` | Initialization failed with an auth-like error. |
| `NO_TOOLS` | The server responded but did not expose tools. |
| `TOOL_SCHEMA_INVALID` | A discovered tool has an invalid schema. |
| `TOOL_CALL_AUTH` | A real tool call reached auth or permission handling. |
| `CONTRACT_ASSERTION_FAILED` | A tool call completed but failed one or more sidecar assertions. |
| `AUTO_DRY_RUN_INPUT` | Auto-generated schema-minimum input failed; add sidecar inputs. |
| `TOOL_CALL_FAILED` | A sidecar tool call returned a non-auth error. |

## Batch CI gate

If you are starting from scratch, generate the files:

```bash
mcp-probe init --target @your-org/your-mcp-server --discover --github-actions
```

This creates:

| File | Purpose |
|------|---------|
| `mcp-probe.config.json` | Batch config with one server and `probeTools: true`. |
| `.mcp-probe.json` | Sidecar template for real tool-call sample inputs. |
| `.github/workflows/mcp-probe.yml` | GitHub Actions readiness gate. |

Existing files are skipped unless you pass `--force`.

Generated config and sidecar files include JSON Schema references:

| Schema | File |
|--------|------|
| [`mcp-probe.config.schema.json`](schemas/mcp-probe.config.schema.json) | `mcp-probe.config.json` |
| [`mcp-probe.sidecar.schema.json`](schemas/mcp-probe.sidecar.schema.json) | `.mcp-probe.json` |

When `--discover` is enabled, mcp-probe connects to the target server, runs discovery, and pre-populates `.mcp-probe.json` with the discovered tool names and schema-minimum sample inputs. Review those values before using them as a production CI gate.

Use `--config` when a project depends on several MCP servers and you want one CI command to validate all of them:

```json
{
  "timeoutMs": 10000,
  "servers": [
    {
      "name": "memory",
      "target": "@modelcontextprotocol/server-memory",
      "probeTools": true
    },
    {
      "name": "datadog",
      "target": "https://mcp.example.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${DATADOG_MCP_TOKEN}"
      },
      "stderr": {
        "allow": ["^Warning:", "missing optional config"],
        "fatal": ["panic", "FATAL"]
      },
      "toolsFile": "./recipes/datadog.tools.json"
    }
  ]
}
```

Run:

```bash
mcp-probe --config mcp-probe.config.json
```

The process exits with `1` if any configured server fails. Warnings such as auth handoff failures still exit `0`, so CI can flag degraded MCP readiness without blocking deploys unless a server is truly broken.

Config fields:

| Field | Description |
|-------|-------------|
| `timeoutMs` | Optional global timeout in milliseconds. CLI `--timeout` is used when omitted. |
| `servers[].name` | Human-readable name shown in batch output. |
| `servers[].target` | npm package, local server path, or remote MCP URL. |
| `servers[].serverArgs` | Optional arguments passed to the MCP server. |
| `servers[].transport` | Optional transport override: `stdio`, `http`, or `sse`. URL targets default to `http`; package/path targets default to `stdio`. |
| `servers[].headers` | Optional HTTP headers for remote MCP servers. `${ENV_VAR}` placeholders are expanded at runtime. |
| `servers[].stderr.allow` | Optional regex patterns for stderr lines that should be ignored when startup fails. |
| `servers[].stderr.fatal` | Optional regex patterns for stderr lines that should always be treated as the startup failure reason. |
| `servers[].probeTools` | Enables dry-run tool calls for that server. |
| `servers[].toolsFile` | Sidecar input file for meaningful `tools/call` samples. Relative paths resolve from the config file directory. |

## Stderr classification

Many MCP servers write harmless warnings to stderr during startup: optional config notices, update checks, deprecation warnings, and similar noise. If the server later fails to initialize, raw stderr can make those warnings look like the root cause.

mcp-probe has built-in warning filters and also lets you declare server-specific regexes:

```bash
mcp-probe @scope/server \
  --stderr-allow "^Warning:" \
  --stderr-allow "missing optional config" \
  --stderr-fatal "panic|FATAL"
```

For batch checks, put the rules in `mcp-probe.config.json`:

```json
{
  "name": "datadog",
  "target": "https://mcp.example.com/mcp",
  "stderr": {
    "allow": ["^Warning:", "missing optional config"],
    "fatal": ["panic", "FATAL"]
  }
}
```

`fatal` patterns win over `allow` patterns. If every stderr line is allowed noise, mcp-probe reports the actual connection/init error instead of the warning text.

## Tool call dry-runs

Discovery proves that a server starts and registers tools. It does **not** prove that the tools actually work in an agent loop. Use `--probe-tools` to call every discovered tool.

By default, mcp-probe generates minimal inputs from each tool schema. That catches broken call paths, but real CI gates should prefer a sidecar file with meaningful sample inputs:

```json
{
  "tools": {
    "logs_query": {
      "input": {
        "query": "service:web status:error",
        "timeframe": "1h"
      },
      "expect": {
        "not_error_code": [401, 403]
      }
    }
  }
}
```

Save this as `.mcp-probe.json` in your project root and run:

```bash
mcp-probe @your-org/datadog-mcp --probe-tools
```

Or pass an explicit path:

```bash
mcp-probe @your-org/datadog-mcp --tools-file ./ci/mcp-tools.json
```

Sidecar inputs are used first; generated minimal inputs are fallback only. Auth and permission failures such as 401/403 are surfaced as warnings so CI can distinguish "OAuth handoff needed" from transport or runtime failure.

## Tool call contract assertions

For production MCP servers, especially database-backed servers, a successful `tools/call` is still not enough. Agents depend on a contract: read-only roles, scoped data, stable error codes, safe limits, and no leaked internals.

Add assertions to `.mcp-probe.json` to validate that contract:

```json
{
  "tools": {
    "execute_sql": {
      "input": {
        "project_id": "YOUR_PROJECT_ID",
        "query": "select 1 as health_check"
      },
      "expect": {
        "status": "pass",
        "requiredFields": ["rowCount", "limit", "source", "freshness"],
        "maxRows": 100
      }
    },
    "execute_sql_write_denied": {
      "input": {
        "project_id": "YOUR_PROJECT_ID",
        "query": "delete from users where id = 1"
      },
      "expect": {
        "status": "fail",
        "errorCode": "WRITE_NOT_ALLOWED",
        "notContains": ["DATABASE_URL", "password", "stack"]
      }
    }
  }
}
```

Supported assertions:

| Assertion | Purpose |
|-----------|---------|
| `status` | Expected call status: `pass`, `fail`, or `warn`. Use `fail` for denied-write probes. |
| `requiredFields` | Field names that must appear anywhere in the tool result payload. |
| `maxRows` | Maximum allowed row count, using `rowCount`, `rowsReturned`, or common row arrays. |
| `errorCode` | Stable error code expected in an error response. |
| `contains` | Text snippets that must appear in the result or error payload. |
| `notContains` | Text snippets that must not appear; useful for stack traces, secrets, and raw internals. |
| `not_error_code` | HTTP/status codes that should be warnings instead of failures, usually auth handoff codes. |

If an assertion fails, mcp-probe returns `CONTRACT_ASSERTION_FAILED` and includes per-assertion details in JSON and GitHub Actions summaries.

## Status badges

Use `--badge-file` to write a [shields.io endpoint](https://shields.io/badges/endpoint-badge) JSON file:

```bash
mcp-probe --config mcp-probe.config.json --badge-file mcp-probe-badge.json
```

Example output:

```json
{
  "schemaVersion": 1,
  "label": "mcp fleet",
  "message": "2 pass, 1 warn",
  "color": "yellow"
}
```

Host that JSON file anywhere public and reference it from your README:

```markdown
![MCP readiness](https://img.shields.io/endpoint?url=https://example.com/mcp-probe-badge.json)
```

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (or warnings only) |
| `1` | One or more checks failed |

## CI integration

Single server workflow:

```yaml
# .github/workflows/mcp-probe.yml
name: MCP Probe

on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-probe:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - name: Validate MCP server
        run: |
          npx @k08200/mcp-probe @your-org/your-mcp-server \
            --probe-tools \
            --github-summary \
            --badge-file mcp-probe-badge.json
```

Fleet workflow:

```yaml
# .github/workflows/mcp-fleet.yml
name: MCP Fleet Probe

on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "0 * * * *"

jobs:
  mcp-probe:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Validate MCP fleet
        run: |
          npx @k08200/mcp-probe \
            --config mcp-probe.config.json \
            --github-summary \
            --badge-file mcp-probe-badge.json
```

When `--github-summary` is enabled in GitHub Actions, mcp-probe appends a Markdown report to `$GITHUB_STEP_SUMMARY` and emits workflow annotations for failed checks, warnings, and tool-call dry-run errors. This makes PR failures point directly at the broken MCP server or tool call instead of burying the signal in raw logs.

Copy-ready examples live in [`examples/github-actions`](examples/github-actions):

| Example | Use case |
|---------|----------|
| [`single-server.yml`](examples/github-actions/single-server.yml) | Validate one stdio MCP package. |
| [`fleet.yml`](examples/github-actions/fleet.yml) | Validate several MCP servers from `mcp-probe.config.json` on PRs and hourly schedules. |
| [`remote-server.yml`](examples/github-actions/remote-server.yml) | Validate a remote Streamable HTTP MCP server with auth headers. |

mcp-probe also dogfoods itself in CI with [`examples/self-check.config.json`](examples/self-check.config.json), which validates batch mode, sidecar inputs, GitHub summaries, and badge output against a local fixture MCP server.

## Recipes

Production MCP checks work best with sidecar inputs that exercise real call paths instead of generated empty values. Copy-ready starting points live in [`examples/recipes`](examples/recipes):

| Recipe | Focus |
|--------|-------|
| [`datadog.tools.json`](examples/recipes/datadog.tools.json) | Logs/metrics queries that reveal auth handoff and downstream API failures. |
| [`supabase.tools.json`](examples/recipes/supabase.tools.json) | Project visibility and a harmless `select 1` SQL path. |
| [`gmail.tools.json`](examples/recipes/gmail.tools.json) | OAuth/token handoff and read-only mailbox access. |

Tool names vary by MCP server implementation. Run your server once with `--output json`, inspect the discovered tool names and schemas, then adjust the recipe file to match.

## JSON output

```bash
mcp-probe @your-org/datadog-mcp --tools-file .mcp-probe.json --output json
```

```json
{
  "target": "@your-org/datadog-mcp",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "overallStatus": "warn",
  "checks": [
    { "name": "Target resolution", "status": "pass", "message": "npx --yes @your-org/datadog-mcp" },
    { "name": "MCP protocol handshake", "status": "pass", "message": "datadog-mcp v1.0.0", "latencyMs": 1392 },
    { "name": "Tools discovery", "status": "pass", "message": "Found 12 tools", "latencyMs": 33 },
    { "name": "Tool schema validation", "status": "pass", "message": "All tool schemas are valid" },
    {
      "name": "Tool call dry-run",
      "status": "warn",
      "message": "1 auth/permission errors (1 sidecar, 0 auto)",
      "issue": {
        "code": "TOOL_CALL_AUTH",
        "hint": "At least one tool call hit auth or permission handling. This often means CI needs tokens or the server needs non-browser auth."
      }
    }
  ],
  "serverInfo": { "name": "datadog-mcp", "version": "1.0.0", "capabilities": ["tools"] },
  "tools": [{ "name": "logs_query", "description": "Query Datadog logs" }],
  "toolCallResults": [
    {
      "tool": "logs_query",
      "status": "warn",
      "latencyMs": 41,
      "source": "sidecar",
      "error": "401 Unauthorized",
      "issue": {
        "code": "TOOL_CALL_AUTH",
        "hint": "The server registered this tool, but the call path hit auth or permission handling. Check OAuth/browser handoff, service tokens, and CI secrets."
      }
    }
  ],
  "totalLatencyMs": 1455
}
```

## Status values

| Status | Icon | Meaning |
|--------|------|---------|
| `pass` | ✓ | Check succeeded |
| `warn` | ⚠ | Non-fatal issue (e.g. no tools registered) |
| `fail` | ✗ | Check failed — exits with code 1 |

## Roadmap

- [x] Self-check batch workflow for mcp-probe itself
- [x] HTTP/SSE transport support
- [x] Batch checking from a config file (`mcp-probe --config mcp-probe.config.json`)
- [x] GitHub Actions summary and annotations
- [x] Badge generation (`mcp-probe --badge-file mcp-probe-badge.json`)
- [x] Structured stderr classification rules
- [x] Server-specific recipe examples for Datadog, Supabase, and Gmail MCP servers

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
