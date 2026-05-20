# mcp-probe v1.2.0

This release focuses on making CI setup almost automatic.

## Highlights

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
- `npm test` (58 tests)
- `npm run build`
- `npm audit` (0 vulnerabilities)
- GitHub Actions CI passing on Node.js 20, 22, and 24
