# mcp-check

**Quality checker for MCP servers.** Validates protocol handshake, tool discovery, and response latency in one command.

```
npx mcp-check @modelcontextprotocol/server-filesystem
```

```
mcp-check  @modelcontextprotocol/server-filesystem
────────────────────────────────────────────────────
  ✓  Target resolution
     npx --yes @modelcontextprotocol/server-filesystem
  ✓  MCP protocol handshake  120ms
     filesystem v0.6.2
  ✓  Tools discovery  40ms
     Found 8 tools
  ✓  Tool schema validation
     All tool schemas are valid
────────────────────────────────────────────────────
  Server   filesystem v0.6.2
  Caps     tools

  Tools
    ▸ read_file  — Read the complete contents of a file
    ▸ write_file  — Create a new file or overwrite an existing file
    ▸ list_directory  — Get a listing of all files and directories
    ▸ ...and 5 more

  ✓  PASS  412ms total
```

---

## Why

[awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) lists 200+ MCP servers. There was no way to know if they actually work until now.

`mcp-check` is the `npm audit` for the MCP ecosystem — a single command that tells you if a server is production-ready.

## Install

```bash
# One-shot (no install)
npx mcp-check <target>

# Global install
npm install -g mcp-check
```

## Usage

```bash
# Check an npm package
mcp-check @modelcontextprotocol/server-filesystem

# Check a scoped package
mcp-check @upstash/mcp-server-redis

# Check a local server
mcp-check ./my-server.js

# JSON output (for CI)
mcp-check @scope/server --output json

# Custom timeout
mcp-check @scope/server --timeout 30000
```

## What it checks

| Check | Description |
|-------|-------------|
| **Target resolution** | Can the package be found and spawned? |
| **MCP protocol handshake** | Does the server respond to `initialize`? |
| **Tools discovery** | Does `tools/list` return results? |
| **Tool schema validation** | Are all tool schemas well-formed? |

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | All checks passed (or warnings only) |
| `1` | One or more checks failed |

## CI integration

```yaml
# .github/workflows/mcp-check.yml
- name: Validate MCP server
  run: npx mcp-check @your-org/your-mcp-server
```

## JSON output

```bash
mcp-check @scope/server --output json
```

```json
{
  "target": "@scope/server",
  "timestamp": "2026-05-17T12:00:00.000Z",
  "overallStatus": "pass",
  "checks": [
    { "name": "MCP protocol handshake", "status": "pass", "latencyMs": 120 }
  ],
  "serverInfo": { "name": "my-server", "version": "1.0.0", "capabilities": ["tools"] },
  "tools": [{ "name": "read_file", "description": "..." }],
  "totalLatencyMs": 412
}
```

## Roadmap

- [ ] `resources/list` and `prompts/list` checks
- [ ] HTTP/SSE transport support
- [ ] Batch checking from a list file (`mcp-check --list servers.txt`)
- [ ] Badge generation for README (`mcp-check --badge`)
- [ ] Weekly CI for awesome-mcp-servers quality report

## Contributing

Issues and PRs welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first.

## License

MIT
