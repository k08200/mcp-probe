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

Open recipe requests:

- Datadog: https://github.com/k08200/mcp-probe/issues/1
- Supabase: https://github.com/k08200/mcp-probe/issues/2
- Gmail: https://github.com/k08200/mcp-probe/issues/3

1. Run the target server with `mcp-probe --output json`
2. Pick read-only or harmless tools that exercise the real downstream call path
3. Add a `*.tools.json` sidecar with realistic sample inputs
4. Document required environment variables in `examples/recipes/README.md`
5. Redact tokens, tenant IDs, private URLs, and customer data

Good recipes are boring: they prove auth and connectivity without modifying user data.

## Commit style

Conventional commits: `feat|fix|refactor|docs|test|chore: description`

## Pull requests

- Keep PRs focused on one thing
- Tests must pass: `npm test`
- TypeScript must compile: `npm run typecheck`
- Do not include secrets in fixtures, screenshots, logs, or JSON output
