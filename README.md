# mcp-probe

[![CI](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml/badge.svg)](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@k08200/mcp-probe)](https://www.npmjs.com/package/@k08200/mcp-probe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/@k08200/mcp-probe)](package.json)

**Quality checker for MCP servers.** Validates protocol handshake, discovery, optional tool-call dry-runs, and response latency in one command.

The `npm audit` for the [MCP](https://modelcontextprotocol.io) ecosystem — because [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) lists 200+ servers and there was no way to know if they actually worked.

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

## Batch CI gate

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
| `servers[].probeTools` | Enables dry-run tool calls for that server. |
| `servers[].toolsFile` | Sidecar input file for meaningful `tools/call` samples. Relative paths resolve from the config file directory. |

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

## JSON output

```bash
mcp-probe @modelcontextprotocol/server-memory --probe-tools --output json
```

```json
{
  "target": "@modelcontextprotocol/server-memory",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "overallStatus": "pass",
  "checks": [
    { "name": "Target resolution", "status": "pass", "message": "npx --yes @modelcontextprotocol/server-memory" },
    { "name": "MCP protocol handshake", "status": "pass", "message": "memory-server v0.6.3", "latencyMs": 1392 },
    { "name": "Tools discovery", "status": "pass", "message": "Found 9 tools", "latencyMs": 33 },
    { "name": "Tool schema validation", "status": "pass", "message": "All tool schemas are valid" },
    { "name": "Tool call dry-run", "status": "pass", "message": "9 passed (2 sidecar, 7 auto)" }
  ],
  "serverInfo": { "name": "memory-server", "version": "0.6.3", "capabilities": ["tools"] },
  "tools": [{ "name": "create_entities", "description": "Create multiple new entities in the knowledge graph" }],
  "toolCallResults": [
    { "tool": "read_graph", "status": "pass", "latencyMs": 41, "source": "auto" }
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

- [x] HTTP/SSE transport support
- [x] Batch checking from a config file (`mcp-probe --config mcp-probe.config.json`)
- [x] GitHub Actions summary and annotations
- [x] Badge generation (`mcp-probe --badge-file mcp-probe-badge.json`)
- [ ] Structured stderr conventions for MCP server authors
- [ ] Server-specific recipe examples for Datadog, Supabase, and Gmail MCP servers

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
