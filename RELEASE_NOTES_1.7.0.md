# mcp-probe v1.7.0

This release adds automatic setup repair:

```bash
mcp-probe doctor --fix --target @your-org/your-mcp-server
```

`doctor --fix` can now create the missing pieces needed to run mcp-probe in CI:

- `mcp-probe.config.json`
- `.mcp-probe.json`
- `.github/workflows/mcp-probe.yml`

If a config file already exists, `doctor --fix` can create missing sidecar files and the GitHub Actions workflow without requiring `--target`.

Existing files are not overwritten unless `--force` is passed.

This moves `doctor` from diagnosis to repair: users can go from an empty project to a CI-ready MCP readiness gate with one command, then run `mcp-probe doctor` to verify the result.
