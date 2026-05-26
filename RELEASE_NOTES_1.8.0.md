# mcp-probe v1.8.0

This release expands `mcp-probe doctor` from setup creation into setup repair.

## Highlights

- `doctor --fix` now updates incomplete existing mcp-probe workflows.
- Sidecar validation now checks expectation field types.
- Doctor warnings now include concrete next-command suggestions.
- mcp-probe's own CI now dogfoods `mcp-probe doctor`.

## Existing workflow repair

Previously, `doctor --fix` could create a missing workflow. Now it can also repair an incomplete one.

If a workflow mentions `mcp-probe` but misses the recommended CI gate shape, doctor rewrites it to include:

- `actions/checkout@v6`
- `--config <config-file>`
- `--github-summary`

Example:

```bash
mcp-probe doctor --fix
```

## Stronger sidecar validation

Doctor now validates expectation field types in `.mcp-probe.json`:

- `status`
- `not_error_code`
- `requiredFields`
- `maxRows`
- `errorCode`
- `contains`
- `notContains`

This catches broken contract assertion files before CI reaches the MCP server.

## Dogfooding

The mcp-probe repository now runs:

```bash
node dist/cli.js doctor --config-file examples/self-check.config.json --output json
```

as part of its own CI matrix.

The direction stays the same: make MCP readiness boring, reproducible, and CI-native.
