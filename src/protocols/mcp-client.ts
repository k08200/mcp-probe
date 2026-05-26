import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { assertionFailureMessage, evaluateToolAssertions } from '../assertions.js';
import { withIssue } from '../issues.js';
import { redactText } from '../redact.js';
import type { CheckStatus, ProbeOptions, ProbeResult, StderrRules, ToolCallResult, ToolExpectations } from '../types.js';

const VERSION = '1.8.0';

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

function compilePatterns(patterns: string[] | undefined): RegExp[] {
  return (patterns ?? []).map((pattern) => new RegExp(pattern, 'i'));
}

function isStderrNoise(line: string, rules?: StderrRules): boolean {
  return STDERR_WARNING_PATTERNS.some((p) => p.test(line))
    || compilePatterns(rules?.allow).some((p) => p.test(line));
}

function firstMeaningfulLine(text: string, fallback: string, rules?: StderrRules): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const fatalLine = lines.find((l) => compilePatterns(rules?.fatal).some((p) => p.test(l)));
  if (fatalLine) return fatalLine;

  const nonNoise = lines.filter((l) => !isStderrNoise(l, rules));
  if (nonNoise.length === 0) return fallback;

  const target = nonNoise;
  const errorLine = target.find((l) => /^Error:/i.test(l));
  if (errorLine) return errorLine;
  const skip = /^at |^node:|^\^$|^const |^throw |^Require stack/;
  return target.find((l) => !skip.test(l) && l.length > 3) ?? target[0] ?? fallback;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

// Fallback: generate minimal inputs from JSON Schema when no sidecar entry exists
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

function isAuthError(message: string, notErrorCodes?: number[]): boolean {
  if (/401|403|unauthorized|forbidden/i.test(message)) return true;
  if (notErrorCodes) {
    return notErrorCodes.some((code) => message.includes(String(code)));
  }
  return false;
}

function toolResultErrorMessage(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const toolResult = result as { isError?: unknown; content?: unknown };
  if (toolResult.isError !== true) return undefined;

  if (!Array.isArray(toolResult.content)) return 'Tool returned an error result';
  const textParts = toolResult.content
    .map((part) => {
      if (!part || typeof part !== 'object') return undefined;
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === 'string' ? maybeText : undefined;
    })
    .filter((part): part is string => Boolean(part));

  return textParts.join('\n') || 'Tool returned an error result';
}

function finalToolResult(
  tool: string,
  actualStatus: CheckStatus,
  latencyMs: number,
  source: ToolCallResult['source'],
  expect: ToolExpectations | undefined,
  result?: unknown,
  error?: string
): ToolCallResult {
  const assertions = evaluateToolAssertions({ result, error, actualStatus, expect });
  const assertionError = assertionFailureMessage(assertions);
  const expectedStatusMatched = expect?.status !== undefined && actualStatus === expect.status;
  const finalStatus: CheckStatus = assertionError
    ? 'fail'
    : expectedStatusMatched
      ? 'pass'
      : actualStatus;
  const finalError = assertionError
    ? `Contract assertion failed: ${assertionError}${error ? `; original error: ${error}` : ''}`
    : finalStatus === 'pass'
      ? undefined
      : error;
  const payload: ToolCallResult = {
    tool,
    status: finalStatus,
    latencyMs,
    source,
  };
  if (finalError) payload.error = finalError;
  if (assertions.length > 0) payload.assertions = assertions;
  return withIssue(payload);
}

function makeRequestInit(headers?: Record<string, string>): RequestInit | undefined {
  if (!headers || Object.keys(headers).length === 0) return undefined;
  return { headers };
}

function createTransport(options: ProbeOptions): { transport: Transport; stderrChunks: Buffer[] } {
  const mode = options.transport ?? 'stdio';

  if (mode === 'stdio') {
    if (!options.command) {
      throw new Error('stdio transport requires a command');
    }
    const transport = new StdioClientTransport({
      command: options.command,
      args: options.args ?? [],
      env: { ...process.env } as Record<string, string>,
      stderr: 'pipe',
    });
    const stderrChunks: Buffer[] = [];
    transport.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    return { transport, stderrChunks };
  }

  if (!options.url) {
    throw new Error(`${mode} transport requires a URL target`);
  }

  const url = new URL(options.url);
  const requestInit = makeRequestInit(options.headers);
  const transport = mode === 'sse'
    ? new SSEClientTransport(url, { requestInit })
    : new StreamableHTTPClientTransport(url, { requestInit });

  return { transport, stderrChunks: [] };
}

export async function probeMcpServer(options: ProbeOptions): Promise<ProbeResult> {
  const { transport, stderrChunks } = createTransport(options);
  const secretValues = Object.values(options.headers ?? {});

  const client = new Client(
    { name: 'mcp-probe', version: VERSION },
    { capabilities: { roots: { listChanged: false } } }
  );

  const connectStart = Date.now();
  try {
    await withTimeout(client.connect(transport), options.timeoutMs, 'Connection');
  } catch (err) {
    const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
    const fallback = err instanceof Error ? err.message : String(err);
    const reason = stderrText
      ? firstMeaningfulLine(stderrText, fallback, options.stderr)
      : fallback;
    await client.close().catch(() => undefined);
    throw new Error(redactText(reason, secretValues));
  }
  const connectLatencyMs = Date.now() - connectStart;

  try {
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

    let toolCallResults: ToolCallResult[] | undefined;
    if (options.probeTools && toolsResult.tools.length > 0) {
      toolCallResults = [];
      for (const tool of toolsResult.tools) {
        const sidecarEntry = options.sidecar?.tools[tool.name];

        // Sidecar input beats auto-generated because it can reach the real call path.
        const input = sidecarEntry?.input ?? generateMinimalInput(tool.inputSchema);
        const source: ToolCallResult['source'] = sidecarEntry ? 'sidecar' : 'auto';
        const notErrorCodes = sidecarEntry?.expect?.not_error_code;
        const expectations = sidecarEntry?.expect;

        const start = Date.now();
        try {
          const result = await withTimeout(
            client.callTool({ name: tool.name, arguments: input }),
            options.timeoutMs,
            `callTool(${tool.name})`
          );
          const toolError = toolResultErrorMessage(result);
          if (toolError) {
            const error = redactText(toolError, secretValues);
            const status = isAuthError(error, notErrorCodes) ? 'warn' : 'fail';
            toolCallResults.push(finalToolResult(tool.name, status, Date.now() - start, source, expectations, result, error));
            continue;
          }
          toolCallResults.push(finalToolResult(tool.name, 'pass', Date.now() - start, source, expectations, result));
        } catch (err) {
          const msg = redactText(err instanceof Error ? err.message : String(err), secretValues);
          const status = isAuthError(msg, notErrorCodes) ? 'warn' : 'fail';
          toolCallResults.push(finalToolResult(tool.name, status, Date.now() - start, source, expectations, undefined, msg));
        }
      }
    }

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
  } finally {
    await client.close().catch(() => undefined);
  }
}
