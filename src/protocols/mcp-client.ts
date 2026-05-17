import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ProbeOptions, ProbeResult } from '../types.js';

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

  const client = new Client(
    { name: 'mcp-probe', version: '0.1.0' },
    { capabilities: {} }
  );

  const connectStart = Date.now();
  await withTimeout(client.connect(transport), options.timeoutMs, 'Connection');
  const connectLatencyMs = Date.now() - connectStart;

  const rawServerInfo = client.getServerVersion();
  const rawCaps = client.getServerCapabilities();
  const capabilities = Object.keys(rawCaps ?? {});

  const toolsStart = Date.now();
  const toolsResult = await withTimeout(
    client.listTools(),
    options.timeoutMs,
    'tools/list'
  );
  const toolsLatencyMs = Date.now() - toolsStart;

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
    connectLatencyMs,
    toolsLatencyMs,
  };
}
