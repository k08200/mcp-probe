# mcp-probe v1.5.0

This release adds a project preflight command:

```bash
mcp-probe doctor
```

`doctor` checks whether a repository is ready to run mcp-probe in CI:

- Node.js runtime satisfies mcp-probe's required version.
- `mcp-probe.config.json` exists and parses.
- Configured sidecar files exist and have valid `tools.*.input` objects.
- GitHub Actions workflows are present and mention `mcp-probe`.

JSON output is available for scripts:

```bash
mcp-probe doctor --config-file ci/mcp-probe.config.json --output json
```

This is a small but important usability step: before validating external MCP servers, teams can now validate that their own probe setup is sane.
