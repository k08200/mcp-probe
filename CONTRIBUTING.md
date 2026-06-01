# Contributing to mcp-probe

## Setup

```bash
git clone https://github.com/k08200/mcp-probe.git
cd mcp-probe
npm install
```

## Development

```bash
npm run dev -- @modelcontextprotocol/server-memory   # run without build
npm test                                              # run unit tests
npm run test:watch                                    # watch mode
npm run typecheck                                     # type check only
```

## Adding a new check

1. Add the check logic in `src/checker.ts` inside `checkMcpServer()`
2. Add a test case in `tests/checker.test.ts`
3. Update the README check table

## Adding a server recipe

Recipes live in `examples/recipes`. They should be safe to run in CI and must not require destructive tool calls.
Read the full checklist in [`docs/RECIPE_GUIDE.md`](docs/RECIPE_GUIDE.md) before submitting a real-server recipe.

Open recipe requests:

- Datadog: https://github.com/k08200/mcp-probe/issues/1
- Supabase: https://github.com/k08200/mcp-probe/issues/2
- Gmail: https://github.com/k08200/mcp-probe/issues/3

1. Bootstrap from live discovery:

   ```bash
   npx @k08200/mcp-probe@latest init \
     --target <server> \
     --discover \
     --lock-tools \
     --github-actions
   ```

2. Pick read-only or harmless tools that exercise the real downstream call path.
3. Add or update a `*.tools.json` sidecar with realistic sample inputs.
4. Add assertions for result shape, row limits, stable error codes, and leak checks.
5. Document required environment variables in `examples/recipes/README.md`.
6. Redact tokens, tenant IDs, private URLs, and customer data.

Good recipes are boring: they prove auth and connectivity without modifying user data.

## Commit style

Conventional commits: `feat|fix|refactor|docs|test|chore: description`

## Pull requests

- Keep PRs focused on one thing
- Tests must pass: `npm test`
- TypeScript must compile: `npm run typecheck`
- Do not include secrets in fixtures, screenshots, logs, or JSON output
