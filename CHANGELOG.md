# Changelog

## 1.8.0

### Added

- Tool catalog policy checks with `expectedTools`, `allowedTools`, and `forbiddenTools`.
- Doctor now verifies that `mcp-probe` is executed from a GitHub Actions `run:` step, not merely mentioned in comments or workflow metadata.
- `mcp-probe doctor --fix` now detects incomplete existing mcp-probe workflows and reports them without rewriting by default.
- Doctor sidecar validation now checks expectation field types, including `status`, `not_error_code`, `requiredFields`, `maxRows`, `errorCode`, `contains`, and `notContains`.
- Doctor warning messages now include concrete next-command suggestions for common setup issues.
- The project CI now dogfoods `mcp-probe doctor` on every Node.js test matrix run.

### Changed

- When sidecar inputs are provided, tool dry-runs now call only sidecar-listed tools. Auto-generated calls remain fallback behavior for `--probe-tools` without a sidecar.
- Shared config, sidecar, and workflow scaffolding between `init` and `doctor`.
- Shared sidecar validation between runtime checks and `doctor`.
- Reduced README scope to the core CI readiness gate workflow.

### Removed

- Removed per-version release note files from the repository; `CHANGELOG.md` is now the source of release history.

## 1.7.0

### Added

- `mcp-probe doctor --fix` to create missing config, sidecar, and GitHub Actions workflow files when possible.
- `mcp-probe doctor --fix --target <server>` for bootstrapping an empty project into a CI-ready mcp-probe setup.
- `--tools-file`, `--workflow-file`, and `--force` options for doctor fixes.

## 1.6.0

### Changed

- `mcp-probe doctor` now validates GitHub Actions workflow quality instead of only checking whether a workflow mentions `mcp-probe`.
- Doctor now warns when workflows miss `actions/checkout@v6`, `--config <config-file>`, or `--github-summary`.

## 1.5.0

### Added

- `mcp-probe doctor` project preflight command for CI readiness checks.
- Doctor checks for Node.js version, config file validity, sidecar JSON shape, and GitHub Actions workflow presence.
- `mcp-probe doctor --output json` for scripted preflight usage.

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
