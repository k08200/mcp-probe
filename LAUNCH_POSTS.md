# mcp-probe Launch Posts

각 플랫폼 복붙용 포스팅 모음. 위에서 아래로 순서대로 올리세요.

---

## 1. Reddit — r/LocalLLaMA
URL: https://www.reddit.com/r/LocalLLaMA/submit

**제목:**
```
I built mcp-probe: validates any MCP server in one command — like npm audit but for MCP
```

**본문:**
```
Been using awesome-mcp-servers for a while and kept running into servers that just... didn't work. No way to know until you tried to wire them up.

So I built mcp-probe — a CLI that validates MCP servers in one shot:

    npx @k08200/mcp-probe @modelcontextprotocol/server-memory

It checks:
- MCP protocol handshake (initialize request)
- Tools / Resources / Prompts discovery
- Tool schema validity
- Response latency per step

Real output:

    mcp-probe  @modelcontextprotocol/server-everything
    ────────────────────────────────────────────────────
      ✓  MCP protocol handshake  1601ms — mcp-servers/everything v2.0.0
      ✓  Tools discovery  22ms — Found 14 tools
      ✓  Tool schema validation — All tool schemas are valid
      ✓  Resources discovery  2ms — Found 7 resources
      ✓  Prompts discovery  5ms — Found 4 prompts
    ────────────────────────────────────────────────────
      ✓  PASS  3661ms total

It also catches broken servers with a real error message. For example, @modelcontextprotocol/server-filesystem currently has a broken dep:

    ✗  MCP protocol handshake — Error: Cannot find module 'ajv'

JSON output + exit code 1 on failure, so it works as a CI gate:

    - run: npx @k08200/mcp-probe @your-org/your-mcp-server

GitHub: https://github.com/k08200/mcp-probe

Would love feedback — especially if you hit a server where the output is confusing.
```

---

## 2. Reddit — r/javascript
URL: https://www.reddit.com/r/javascript/submit

**제목:**
```
mcp-probe – zero-config CLI for validating MCP servers (TypeScript, works with npx)
```

**본문:**
```
Built a small CLI tool that validates MCP (Model Context Protocol) servers — checks the handshake, tool/resource/prompt discovery, and schema validity in one command.

    npx @k08200/mcp-probe @modelcontextprotocol/server-memory

Output:

    mcp-probe  @modelcontextprotocol/server-memory
    ────────────────────────────────────────────────────
      ✓  MCP protocol handshake  1392ms — memory-server v0.6.3
      ✓  Tools discovery  33ms — Found 9 tools
      ✓  Tool schema validation — All tool schemas are valid
    ────────────────────────────────────────────────────
      ✓  PASS  1455ms total

It captures stderr from the server process so when something crashes you see the actual reason, not "connection closed".

    ✗  MCP protocol handshake — Error: Cannot find module 'ajv'

JSON output for CI pipelines, exit code 1 on failure.

Stack: TypeScript + @modelcontextprotocol/sdk + commander + chalk + ora.
Tests: Vitest, 16 tests passing.

GitHub: https://github.com/k08200/mcp-probe
```

---

## 3. Reddit — r/ClaudeAI
URL: https://www.reddit.com/r/ClaudeAI/submit

**제목:**
```
Built a tool to validate MCP servers before adding them to Claude — mcp-probe
```

**본문:**
```
If you're adding MCP servers to Claude Desktop and want to verify they actually work before configuring them, I built mcp-probe for exactly this:

    npx @k08200/mcp-probe @modelcontextprotocol/server-memory

It runs the full MCP handshake and shows you what the server exposes — tools, resources, prompts — with latency timings.

Turns out @modelcontextprotocol/server-filesystem currently has a broken dependency (missing `ajv`) so it silently fails. mcp-probe catches it:

    ✗  MCP protocol handshake — Error: Cannot find module 'ajv'

Useful for:
- Validating servers from awesome-mcp-servers before wiring them up
- CI checks to make sure your own MCP server still works after changes
- Debugging why a server isn't responding in Claude Desktop

GitHub: https://github.com/k08200/mcp-probe
```

---

## 4. Reddit — r/node
URL: https://www.reddit.com/r/node/submit

**제목:**
```
mcp-probe: CLI that validates MCP servers via the official SDK (handshake + tool/resource discovery)
```

**본문:**
```
Built a developer tool for the MCP (Model Context Protocol) ecosystem.

    npx @k08200/mcp-probe <npm-package-or-local-file>

Under the hood it uses @modelcontextprotocol/sdk to run the actual handshake, then calls tools/list, resources/list, and prompts/list depending on what capabilities the server advertises.

It pipes stderr from the spawned process so crashes surface real error messages instead of generic "connection closed".

Works as a CI gate (exit code 1 on failure):

    # .github/workflows/validate.yml
    - run: npx @k08200/mcp-probe @your-org/your-mcp-server

GitHub: https://github.com/k08200/mcp-probe
```

---

## 5. Dev.to 아티클
URL: https://dev.to/new

**제목:**
```
I built the npm audit for MCP servers
```

**태그:** `mcp`, `typescript`, `cli`, `ai`

**본문 (마크다운):**
```markdown
The [MCP (Model Context Protocol)](https://modelcontextprotocol.io) ecosystem has exploded. [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) lists 200+ servers — but there was no way to know if any of them actually worked.

So I built **mcp-probe**: a zero-config CLI that validates MCP servers in one command.

## The problem

You add a server to Claude Desktop, it silently fails. You look at logs, get "connection closed". You have no idea if it's a network issue, a broken dependency, or the server just doesn't implement the protocol correctly.

## What mcp-probe does

```bash
npx @k08200/mcp-probe @modelcontextprotocol/server-memory
```

```
mcp-probe  @modelcontextprotocol/server-memory
────────────────────────────────────────────────────
  ✓  MCP protocol handshake  1392ms — memory-server v0.6.3
  ✓  Tools discovery  33ms — Found 9 tools
  ✓  Tool schema validation — All tool schemas are valid
────────────────────────────────────────────────────
  Server   memory-server v0.6.3
  Caps     tools

  Tools
    ▸ create_entities  Create multiple new entities in the knowledge graph
    ▸ read_graph  Read the entire knowledge graph
    ▸ search_nodes  Search for nodes in the knowledge graph
    ▸ ...and 6 more

  ✓  PASS  1455ms total
```

For a server with resources and prompts too (`server-everything`):

```
  ✓  Tools discovery  22ms — Found 14 tools
  ✓  Resources discovery  2ms — Found 7 resources
  ✓  Prompts discovery  5ms — Found 4 prompts
```

## It catches real bugs

`@modelcontextprotocol/server-filesystem` — one of the most well-known MCP servers — currently has a broken dependency:

```
  ✗  MCP protocol handshake — Error: Cannot find module 'ajv'
```

Before mcp-probe, this would show as "connection closed" with no indication of why.

## CI integration

Exit code 1 on failure means it works as a CI gate:

```yaml
- name: Validate MCP server
  run: npx @k08200/mcp-probe @your-org/your-mcp-server
  timeout-minutes: 2
```

JSON output for scripting:

```bash
npx @k08200/mcp-probe @scope/server --output json
```

## How it works

Under the hood it uses the official `@modelcontextprotocol/sdk` to run the actual protocol handshake. It pipes `stderr` from the spawned process so when a server crashes on startup, you see the real error.

```typescript
const transport = new StdioClientTransport({
  command: 'npx',
  args: ['--yes', target],
  stderr: 'pipe',  // capture crash output
});

const client = new Client(
  { name: 'mcp-probe', version: '0.1.0' },
  { capabilities: { roots: { listChanged: false } } }
);

await client.connect(transport);
const tools = await client.listTools();
// also listResources() and listPrompts() if server advertises them
```

## Get it

```bash
npx @k08200/mcp-probe @modelcontextprotocol/server-memory
```

GitHub: [k08200/mcp-probe](https://github.com/k08200/mcp-probe)

Would love to hear what servers you try it on — especially if you find one where the output is confusing or wrong.
```

---

## 6. X (트위터) — 스레드
URL: https://x.com/compose/post

**트윗 1/4:**
```
I built mcp-probe — validates any MCP server in one command:

npx @k08200/mcp-probe @modelcontextprotocol/server-memory

Like npm audit, but for the MCP ecosystem.

🧵
```

**트윗 2/4:**
```
It runs the full MCP handshake then checks tools, resources, and prompts — with latency on every step:

✓ MCP protocol handshake  1392ms
✓ Tools discovery  33ms — Found 9 tools
✓ Resources discovery  2ms — Found 7 resources
✓ PASS  1455ms total
```

**트윗 3/4:**
```
It also captures server stderr so broken servers show the real reason:

@modelcontextprotocol/server-filesystem has a busted dep right now:

✗ MCP protocol handshake
  Error: Cannot find module 'ajv'

Before: just "connection closed" with no context
```

**트윗 4/4:**
```
JSON output + exit code 1 on failure → works as a CI gate:

- run: npx @k08200/mcp-probe @your-org/your-mcp-server

GitHub: github.com/k08200/mcp-probe

If you try it on a server and something looks off, open an issue 🙏
```

---

## 7. Product Hunt
URL: https://www.producthunt.com/posts/new

**이름:** `mcp-probe`

**태그라인 (60자):**
```
Zero-config quality checker for MCP servers
```

**설명:**
```
mcp-probe validates MCP servers in one command — no config needed.

It runs the full MCP protocol handshake, then checks tools, resources, and prompts discovery with latency timings. When a server crashes on startup, it shows you the actual error from stderr instead of a generic "connection closed".

Works as a CI gate: JSON output, exit code 1 on failure.

npx @k08200/mcp-probe @modelcontextprotocol/server-memory
```

**링크:** `https://github.com/k08200/mcp-probe`

---

## 8. MCP 공식 Discord — #showcase
URL: https://discord.gg/modelcontextprotocol (또는 공식 채널 찾기)

**메시지:**
```
Hey! I built **mcp-probe** — a zero-config CLI for validating MCP servers 🔍

`npx @k08200/mcp-probe @modelcontextprotocol/server-memory`

Checks: protocol handshake, tools/resources/prompts discovery, schema validity. Surfaces real crash reasons from stderr (found that `server-filesystem` has a broken `ajv` dep this way).

Works as a CI gate (exit code 1 on failure, JSON output).

GitHub: https://github.com/k08200/mcp-probe

Would love feedback from folks who maintain MCP servers — does the output make sense for your server?
```

---

## 올리는 순서 추천

1. **Dev.to** (계정 있으면 즉시, SEO 장기 효과)
2. **r/LocalLLaMA** (가장 반응 빠름)
3. **X 스레드** (동시에)
4. **r/ClaudeAI**, **r/javascript**, **r/node** (같은 날)
5. **MCP Discord** (다음날)
6. **Product Hunt** (월요일 오전 6시 PST가 최적)
