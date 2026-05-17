import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ProbeOptions, ProbeResult } from '../types.js';

function firstMeaningfulLine(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  // 1. "Error: ..." lines are most informative
  const errorColonLine = lines.find((l) => /^Error:/.test(l));
  if (errorColonLine) return errorColonLine;
  // 2. Skip stack frames, node internals, carets, and bare code fragments
  const skip = /^at |^node:|^\^$|^const |^throw |^Require stack/;
  const meaningful = lines.find((l) => !skip.test(l) && l.length > 3);
  return meaningful ?? lines[0] ?? text;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

export async function probeMcpServer(options: ProbeOptions): Promise<ProbeResult> {
  const transport = new StdioClientTransport({
    command: options.command,
    args: options.args,
    env: { ...process.env } as Record<string, string>,
    stderr: 'pipe',
  });

  // Collect stderr so we can surface crash reasons in error messages
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
  };
}
