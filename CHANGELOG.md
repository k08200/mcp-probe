# Changelog

## 1.12.0

### Added

- Sidecar-level `retry` policy for transient downstream tool-call failures.
- Retry attempts are recorded in tool-call results, JSON output, terminal output, and receipt artifacts.
- Sidecar schema and `doctor` validation for `retry.attempts`, `retry.delayMs`, and `retry.retryOn`.
- Fixture coverage for a tool that fails with a transient `503` and succeeds on retry.

### Changed

- Tool dry-runs only retry when the sidecar explicitly opts into retry behavior.
- Retry defaults target transient failures such as `429`, `500`, `502`, `503`, `504`, timeout, unavailable, and rate-limit errors.

## 1.11.0

### Added

- Schema-aware sidecar sample generation for `init --discover` and auto dry-runs.
- Generated samples now use JSON Schema defaults, enum values, numeric minimums, string minimum lengths, nested objects, and array minimum sizes when available.
- `mcp-probe init --discover` now writes discovered tool names into `expectedTools`.
- `mcp-probe init --discover --lock-tools` writes discovered tool names into `allowedTools` as an exact catalog lock.

### Changed

- Auto dry-run fallback inputs are now schema-derived instead of schema-minimum empty strings and zero values.
- README now recommends `init --discover --lock-tools` for CI scaffolding and warns against running generated sidecars against production credentials before review.

## 1.10.0

### Added

- `expect.jsonSchema` for validating observed tool result shapes in sidecar contracts.
- `expect.jsonSchema` range and string constraints: `minimum`, `maximum`, `minLength`, `maxLength`, and `pattern`.
- Sidecar schema and doctor validation for `expect.jsonSchema`.
- Strict self-check coverage for JSON Schema result assertions.

## 1.9.0

### Added

- `--receipt-file <path>` writes a redacted JSON readiness receipt artifact.
- Receipt artifacts include the observed report in a stable envelope with `formatVersion`, generator metadata, timestamp, and `receiptType`.
- Generated GitHub Actions workflows now upload `mcp-probe.receipt.json` as an artifact.
- Example GitHub Actions workflows now persist receipt artifacts.
- Project CI now dogfoods receipt generation and validates receipt artifacts.
- `doctor` now warns when workflows do not generate receipt files or upload them as artifacts.

## 1.8.0

### Added

- Tool catalog policy checks with `expectedTools`, `allowedTools`, and `forbiddenTools`.
- Dry-run coverage checks now fail when an expected tool has no sidecar sample input.
- Doctor now preflights `expectedTools` sidecar sample coverage before runtime checks.
- Doctor now verifies that `mcp-probe` is executed from a GitHub Actions `run:` step, not merely mentioned in comments or workflow metadata.
- `mcp-probe doctor --fix` now detects incomplete existing mcp-probe workflows and reports them without rewriting by default.
- Doctor sidecar validation now checks expectation field types, including `status`, `not_error_code`, `requiredFields`, `maxRows`, `errorCode`, `contains`, and `notContains`.
- Doctor warning messages now include concrete next-command suggestions for common setup issues.
- The project CI now dogfoods `mcp-probe doctor` on every Node.js test matrix run.
- `doctor --fix` now scaffolds missing sidecar files from configured `expectedTools` when available.
- `--fail-on-warn` for CI workflows that should treat warnings as blocking readiness failures.
- Doctor workflow checks now require the CI flags to appear on the same actual mcp-probe run step, avoiding false receipts from split commands or filenames.
- Added a strict self-check fixture used by the project CI to dogfood `--fail-on-warn` without relying on the warning fixture.

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
