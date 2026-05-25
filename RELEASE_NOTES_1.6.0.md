# mcp-probe v1.6.0

This release makes `mcp-probe doctor` stricter about GitHub Actions workflow quality.

Previously, doctor only checked whether any workflow file mentioned `mcp-probe`. That caught missing workflows, but it could still pass a workflow that did not actually run the CI gate correctly.

Now doctor warns when matching workflows are missing:

- `actions/checkout@v6`
- `--config <config-file>`
- `--github-summary`

Example:

```bash
mcp-probe doctor
```

If a workflow calls `mcp-probe` directly but does not use the configured fleet gate, doctor now reports the missing pieces so the repository can fix CI before relying on the result.

This keeps mcp-probe moving toward the real goal: a boring, reliable MCP readiness gate that checks both the MCP server contract and the CI setup around it.
