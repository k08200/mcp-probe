# mcp-probe v1.1.0

This release focuses on onboarding and CI hardening.

## Highlights

- Added `mcp-probe init` to scaffold:
  - `mcp-probe.config.json`
  - `.mcp-probe.json`
  - `.github/workflows/mcp-probe.yml`
- Added secret redaction across terminal, JSON, GitHub summary, annotations, and tool-call errors.
- Updated test dependencies to eliminate npm audit vulnerabilities.
- CI now validates Node.js 20, 22, and 24.

## Quick Start

```bash
npx @k08200/mcp-probe@latest init \
  --target @your-org/your-mcp-server \
  --github-actions
```

Then edit `.mcp-probe.json` with real read-only tool-call samples and run:

```bash
npx @k08200/mcp-probe@latest --config mcp-probe.config.json --github-summary
```

## Validation

- `npm run typecheck`
- `npm test` (57 tests)
- `npm run build`
- `npm audit` (0 vulnerabilities)
- GitHub Actions CI passing on Node.js 20, 22, and 24
