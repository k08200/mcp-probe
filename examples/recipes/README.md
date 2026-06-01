# Tool dry-run recipes

These sidecar files show the shape of production-oriented `tools/call` probes.

Tool names differ between MCP server implementations. Treat these as starting
points: run `mcp-probe <server> --output json`, inspect the discovered tool
names and schemas, then adjust the recipe to match your server.

For a full contribution checklist, see [`docs/RECIPE_GUIDE.md`](../../docs/RECIPE_GUIDE.md).

Start a new recipe from the template:

```bash
cp examples/recipes/TEMPLATE.tools.json examples/recipes/<server>.tools.json
```

## Datadog

```bash
mcp-probe https://mcp.example.com/mcp \
  --header "Authorization: Bearer $DATADOG_MCP_TOKEN" \
  --tools-file examples/recipes/datadog.tools.json
```

Focus: auth handoff and downstream API reachability for logs and metrics.

## Everything

```bash
mcp-probe --config examples/recipes/everything.config.json \
  --receipt-file mcp-probe.everything.receipt.json \
  --fail-on-warn
```

Focus: an executable public contract recipe. This probes the official
`@modelcontextprotocol/server-everything` package with sidecar inputs,
`tools/call` dry-runs, catalog policy, JSON Schema assertions, and a receipt
artifact.

## Supabase

```bash
mcp-probe @your-org/supabase-mcp \
  --tools-file examples/recipes/supabase.tools.json
```

Focus: token validity, project visibility, and a harmless SQL call path.

## Gmail

```bash
mcp-probe @your-org/gmail-mcp \
  --tools-file examples/recipes/gmail.tools.json
```

Focus: OAuth/token handoff and read-only mailbox access.
