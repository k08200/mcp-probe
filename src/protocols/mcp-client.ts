import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ProbeOptions, ProbeResult, ToolCallResult } from '../types.js';

// Known startup warning patterns from official MCP servers — not fatal errors
const STDERR_WARNING_PATTERNS = [
  /^warn(?:ing)?:/i,
  /deprecat/i,
  /optional.*not found/i,
  /version.*mismatch/i,
  /missing optional/i,
  /checking for updates/i,
  /update available/i,
];

function isStderrNoise(line: string): boolean {
  return STDERR_WARNING_PATTERNS.some((p) => p.test(line));
}

function firstMeaningfulLine(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // Filter out known startup warnings before looking for errors
  const nonNoise = lines.filter((l) => !isStderrNoise(l));
  const target = nonNoise.length > 0 ? nonNoise : lines;

  // Prefer explicit "Error: ..." lines
  const errorLine = target.find((l) => /^Error:/i.test(l));
  if (errorLine) return errorLine;

  // Skip stack frames, node internals, carets, bare code fragments
  const skip = /^at |^node:|^\^$|^const |^throw |^Require stack/;
  return target.find((l) => !skip.test(l) && l.length > 3) ?? target[0] ?? text;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

// Generate minimal valid inputs from a JSON Schema to exercise the tool call path
function generateMinimalInput(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {};
  const s = schema as Record<string, unknown>;
  const props = s['properties'] as Record<string, unknown> | undefined;
  if (!props) return {};

  const required = (s['required'] as string[] | undefined) ?? [];
  const input: Record<string, unknown> = {};

  for (const key of required) {
    const prop = props[key] as Record<string, unknown> | undefined;
    if (!prop) continue;
    switch (prop['type'] as string | undefined) {
      case 'string':  input[key] = ''; break;
      case 'number':
      case 'integer': input[key] = 0; break;
      case 'boolean': input[key] = false; break;
      case 'array':   input[key] = []; break;
      case 'object':  input[key] = {}; break;
      default:        input[key] = null;
    }
  }

  return input;
}

export async function probeMcpServer(options: ProbeOptions): Promise<ProbeResult> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: { ...process.env } as Record<string, string>,
    stderr: 'pipe',
  });

  const stderrChunks: Buffer[] = [];
  transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

  const client = new Client(
    { name: 'mcp-probe', version: '0.1.0' },
    { capabilities: { roots: { listChanged: false } } }
  );

  const connectStart = Date.now();
  try {
    await withTimeout(client.connect(transport), options.timeoutMs, 'Connection');
  } catch (err) {
    const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
    const reason = stderrText
      ? firstMeaningfulLine(stderrText)
      : err instanceof Error ? err.message : String(err);
    throw new Error(reason);
  }
  const connectLatencyMs = Date.now() - connectStart;

  const rawServerInfo = client.getServerVersion();
  const rawCaps = client.getServerCapabilities();
  const capabilities = Object.keys(rawCaps ?? {});

  const toolsStart = Date.now();
  const toolsResult = await withTimeout(client.listTools(), options.timeoutMs, 'tools/list');
  const toolsLatencyMs = Date.now() - toolsStart;

  let resourcesLatencyMs: number | undefined;
  let promptsLatencyMs: number | undefined;

  const resourcesList: ProbeResult['resources'] = [];
  const promptsList: ProbeResult['prompts'] = [];

  if (rawCaps?.resources) {
    const t = Date.now();
    const result = await withTimeout(client.listResources(), options.timeoutMs, 'resources/list');
    resourcesLatencyMs = Date.now() - t;
    for (const r of result.resources) {
      resourcesList.push({ uri: r.uri, name: r.name, description: r.description });
    }
  }

  if (rawCaps?.prompts) {
    const t = Date.now();
    const result = await withTimeout(client.listPrompts(), options.timeoutMs, 'prompts/list');
    promptsLatencyMs = Date.now() - t;
    for (const p of result.prompts) {
      promptsList.push({ name: p.name, description: p.description });
    }
  }

  // Tool dry-run: call each tool with minimal auto-generated inputs
  let toolCallResults: ToolCallResult[] | undefined;
  if (options.probeTools && toolsResult.tools.length > 0) {
    toolCallResults = [];
    for (const tool of toolsResult.tools) {
      const input = generateMinimalInput(tool.inputSchema);
      const start = Date.now();
      try {
        await withTimeout(
          client.callTool({ name: tool.name, arguments: input }),
          options.timeoutMs,
          `callTool(${tool.name})`
        );
        toolCallResults.push({ tool: tool.name, status: 'pass', latencyMs: Date.now() - start });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // Auth errors are expected during dry-run — surface as warn not fail
        const isAuthError = /401|403|unauthorized|forbidden|auth/i.test(msg);
        toolCallResults.push({
          tool: tool.name,
          status: isAuthError ? 'warn' : 'fail',
          latencyMs: Date.now() - start,
          error: msg,
        });
      }
    }
  }

  await client.close();

  return {
    serverInfo: {
      name: rawServerInfo?.name ?? 'unknown',
      version: rawServerInfo?.version ?? 'unknown',
      capabilities,
    },
    tools: toolsResult.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
    resources: resourcesList,
    prompts: promptsList,
    connectLatencyMs,
    toolsLatencyMs,
    resourcesLatencyMs,
    promptsLatencyMs,
    toolCallResults,
  };
}
