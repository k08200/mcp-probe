# Changelog

## 1.1.0

### Added

- `mcp-probe init` scaffolding command.
- Generated `mcp-probe.config.json` for batch CI checks.
- Generated `.mcp-probe.json` sidecar template for real tool-call samples.
- Optional generated GitHub Actions workflow via `--github-actions`.
- `--config-file`, `--sidecar-file`, `--workflow-file`, `--header-env`, and `--force` options for init scaffolding.

### Changed

- Requires Node.js 20.19 or newer.
- Updated test tooling to remove all npm audit vulnerabilities.
- CI now runs on Node.js 20, 22, and 24.

### Security

- Redacts common secret patterns from terminal, JSON, GitHub Actions summaries, annotations, and tool-call errors.
- Added `SECURITY.md`.

## 1.0.0

### Added

- CI-ready MCP readiness gate.
- Tool-call dry-runs with `--probe-tools`.
- Sidecar tool inputs via `.mcp-probe.json` and `--tools-file`.
- Batch config checks with `--config`.
- Streamable HTTP and legacy SSE transport support.
- GitHub Actions summaries and annotations with `--github-summary`.
- Shields-compatible badge JSON output with `--badge-file`.
- Structured stderr classification with `--stderr-allow` and `--stderr-fatal`.
- Datadog, Supabase, and Gmail starter recipes.
- Self-check workflow fixture.
