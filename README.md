# mcp-probe

[![CI](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml/badge.svg)](https://github.com/k08200/mcp-probe/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-probe)](https://www.npmjs.com/package/mcp-probe)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/node/v/mcp-probe)](package.json)

**Quality checker for MCP servers.** Validates protocol handshake, tool discovery, and response latency in one command.

The `npm audit` for the [MCP](https://modelcontextprotocol.io) ecosystem — because [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) lists 200+ servers and there was no way to know if they actually worked.

```bash
npx mcp-probe @modelcontextprotocol/server-memory
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
npx mcp-probe <target>

# Or install globally
npm install -g mcp-probe
```

## Usage

```bash
# Check an npm package
mcp-probe @modelcontextprotocol/server-memory

# Check a server that requires arguments (e.g. directories to serve)
mcp-probe @modelcontextprotocol/server-filesystem /tmp /Users/me/projects

# Check a local server file
mcp-probe ./my-server.js

# JSON output for CI / scripting
mcp-probe @scope/server --output json

# Custom timeout (default: 10000ms)
mcp-probe @scope/server --timeout 30000
```

## What it checks

| Check | Description |
|-------|-------------|
| **Target resolution** | Can the package be located and spawned? |
| **MCP protocol handshake** | Does the server respond to `initialize`? Measures connect latency. |
| **Tools discovery** | Does `tools/list` return results? Measures list latency. |
| **Tool schema validation** | Are all tool schemas well-formed? |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (or warnings only) |
| `1` | One or more checks failed |

## CI integration

```yaml
# .github/workflows/mcp-probe.yml
- name: Validate MCP server
  run: npx mcp-probe @your-org/your-mcp-server
  timeout-minutes: 2
```

## JSON output

```bash
mcp-probe @modelcontextprotocol/server-memory --output json
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
    { "name": "Tool schema validation", "status": "pass", "message": "All tool schemas are valid" }
  ],
  "serverInfo": { "name": "memory-server", "version": "0.6.3", "capabilities": ["tools"] },
  "tools": [{ "name": "create_entities", "description": "Create multiple new entities in the knowledge graph" }],
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

- [ ] `resources/list` and `prompts/list` checks
- [ ] HTTP/SSE transport support
- [ ] Batch checking from a file (`mcp-probe --list servers.txt`)
- [ ] Badge generation (`mcp-probe --badge > badge.json`)
- [ ] Weekly quality report for awesome-mcp-servers

## Contributing

Issues and PRs are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
