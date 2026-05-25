# Changelog

## 1.4.1

### Added

- CI self-check fixture that intentionally fails contract assertions and verifies `CONTRACT_ASSERTION_FAILED` is emitted.
- Contract failure sidecar example covering missing metadata, row-limit violation, and denied-write success.

### Changed

- Upgraded GitHub Actions workflows to `actions/checkout@v6` and `actions/setup-node@v6` to avoid Node 20 action-runtime deprecation noise.

## 1.4.0

### Added

- Sidecar contract assertions for production MCP checks.
- `expect.status` for positive and negative probes, including expected write denials.
- `expect.requiredFields` for validating result metadata such as `rowCount`, `limit`, `source`, and `freshness`.
- `expect.maxRows` for row-limit checks on database-backed tools.
- `expect.errorCode` for stable structured error-code checks.
- `expect.contains` and `expect.notContains` for output and leak checks.
- Contract assertion results in terminal, JSON, and GitHub Actions summaries.

## 1.3.0

### Added

- Stable `issue.code` and `issue.hint` metadata for failed and warning checks.
- Remediation hints in terminal output, JSON output, GitHub Actions summaries, and workflow annotations.
- Tool-call issue classification for auth handoff failures, timeouts, auto-generated dry-run input failures, and sidecar input failures.
- Handshake issue classification for target resolution failures, timeouts, auth-like initialization failures, and generic MCP initialize failures.

## 1.2.0

### Added

- `mcp-probe init --discover` to connect to a target MCP server and pre-populate sidecar entries from discovered tool names.
- JSON Schema files for `mcp-probe.config.json` and `.mcp-probe.json`.
- Generated `$schema` references in scaffolded config and sidecar files.

### Changed

- `schemas` are now included in the npm package.

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
