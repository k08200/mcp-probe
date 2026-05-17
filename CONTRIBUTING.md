# Contributing to mcp-check

## Setup

```bash
git clone https://github.com/k08200/mcp-check.git
cd mcp-check
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

## Commit style

Conventional commits: `feat|fix|refactor|docs|test|chore: description`

## Pull requests

- Keep PRs focused on one thing
- Tests must pass: `npm test`
- TypeScript must compile: `npm run typecheck`
