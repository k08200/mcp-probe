# mcp-probe v1.4.1

This patch release packages the contract-assertion dogfood fixtures and removes GitHub Actions runtime warning noise from CI.

## Highlights

- Added a contract-failure self-check fixture that intentionally triggers `CONTRACT_ASSERTION_FAILED`.
- Added `examples/contract-failure.tools.json` to demonstrate missing metadata, row-limit violation, and safe denied-write probes.
- Added CI coverage for the negative contract path, not only the happy path.
- Upgraded CI to `actions/checkout@v6` and `actions/setup-node@v6`.
- Added sidecar contract assertions:
  - `expect.status`
  - `expect.requiredFields`
  - `expect.maxRows`
  - `expect.errorCode`
  - `expect.contains`
  - `expect.notContains`
- Added negative probes for expected denied writes and stable error codes.
- Added leak checks for raw internals such as `DATABASE_URL`, `password`, and stack traces.
- Added DB-oriented recipe updates for read-only query metadata and write-denial checks.
- Added stable `issue.code` and `issue.hint` metadata for warning and failed checks.
- Added remediation hints to terminal output, JSON output, GitHub Actions summaries, and workflow annotations.
- Classifies tool-call dry-run failures into auth handoff, timeout, auto-input, and sidecar-input problems.
- Classifies handshake failures into missing target, timeout, auth-like initialization, and generic MCP initialize failures.
- Added `mcp-probe init --discover` to connect to a target MCP server and pre-populate sidecar entries from discovered tool names.
- Added JSON Schema files for `mcp-probe.config.json` and `.mcp-probe.json`.
- Generated config and sidecar files now include `$schema` references for editor validation and autocomplete.
- `schemas` are included in the npm package.
- Kept the v1.1 onboarding improvements:
  - `mcp-probe.config.json`
  - `.mcp-probe.json`
  - `.github/workflows/mcp-probe.yml`

## Quick Start

```bash
npx @k08200/mcp-probe@latest init \
  --target @your-org/your-mcp-server \
  --discover \
  --github-actions
```

Then edit `.mcp-probe.json` with real read-only tool-call samples and run:

```bash
npx @k08200/mcp-probe@latest --config mcp-probe.config.json --github-summary
```

## Validation

- `npm run typecheck`
- `npm test` (64 tests)
- `npm run build`
- `npm audit` (0 vulnerabilities)
- GitHub Actions CI passing on Node.js 20, 22, and 24
