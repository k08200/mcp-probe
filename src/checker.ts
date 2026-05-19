import { existsSync, readFileSync } from 'fs';
import { probeMcpServer } from './protocols/mcp-client.js';
import type { CheckItem, CheckOptions, CheckReport, CheckStatus, ResolvedTarget, ToolSidecar, TransportMode } from './types.js';

const SIDECAR_FILENAME = '.mcp-probe.json';

function isUrlTarget(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

export function resolveTarget(target: string, transport?: TransportMode): ResolvedTarget {
  if (transport === 'http' || transport === 'sse') {
    return { transport, url: target };
  }

  if (isUrlTarget(target)) {
    return { transport: 'http', url: target };
  }

  if (target.startsWith('.') || target.startsWith('/')) {
    return { transport: 'stdio', command: 'node', args: [target] };
  }
  return { transport: 'stdio', command: 'npx', args: ['--yes', target] };
}

function loadSidecar(toolsFile?: string): ToolSidecar | undefined {
  const path = toolsFile ?? SIDECAR_FILENAME;
  if (!existsSync(path)) {
    if (!toolsFile) return undefined;
    throw new Error(`Cannot read tools file: ${path}`);
  }

  let parsed: unknown;
  try {
    const raw = readFileSync(path, 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid tools file JSON: ${path}`);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid tools file: ${path} must be an object`);
  }

  const sidecar = parsed as Partial<ToolSidecar>;
  if (!sidecar.tools || typeof sidecar.tools !== 'object' || Array.isArray(sidecar.tools)) {
    throw new Error(`Invalid tools file: ${path} must contain a tools object`);
  }

  for (const [toolName, entry] of Object.entries(sidecar.tools)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`Invalid tools file: ${toolName} entry must be an object`);
    }
    const toolEntry = entry as { input?: unknown; expect?: { not_error_code?: unknown } };
    if (!toolEntry.input || typeof toolEntry.input !== 'object' || Array.isArray(toolEntry.input)) {
      throw new Error(`Invalid tools file: ${toolName}.input must be an object`);
    }
    const codes = toolEntry.expect?.not_error_code;
    if (codes !== undefined && (!Array.isArray(codes) || !codes.every((c) => typeof c === 'number'))) {
      throw new Error(`Invalid tools file: ${toolName}.expect.not_error_code must be a number array`);
    }
  }

  return sidecar as ToolSidecar;
}

function deriveOverallStatus(checks: CheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}

export async function checkMcpServer(options: CheckOptions): Promise<CheckReport> {
  const startTime = Date.now();
  const checks: CheckItem[] = [];
  const resolved = resolveTarget(options.target, options.transport);
  const args = [...(resolved.args ?? []), ...(options.serverArgs ?? [])];
  const probeTools = options.probeTools || Boolean(options.toolsFile);
  const resolutionMessage = resolved.transport === 'stdio'
    ? `${resolved.command} ${args.join(' ')}`
    : `${resolved.transport} ${resolved.url}`;

  checks.push({
    name: 'Target resolution',
    status: 'pass',
    message: resolutionMessage,
  });

  try {
    const sidecar = probeTools ? loadSidecar(options.toolsFile) : undefined;
    const probe = await probeMcpServer({
      transport: resolved.transport,
      command: resolved.command,
      args,
      url: resolved.url,
      headers: options.headers,
      stderr: options.stderr,
      timeoutMs: options.timeoutMs,
      probeTools,
      sidecar,
    });

    checks.push({
      name: 'MCP protocol handshake',
      status: 'pass',
      message: `${probe.serverInfo.name} v${probe.serverInfo.version}`,
      latencyMs: probe.connectLatencyMs,
    });

    const toolsStatus: CheckStatus = probe.tools.length > 0 ? 'pass' : 'warn';
    checks.push({
      name: 'Tools discovery',
      status: toolsStatus,
      message: probe.tools.length > 0
        ? `Found ${probe.tools.length} tool${probe.tools.length !== 1 ? 's' : ''}`
        : 'No tools registered — server may be resources/prompts-only',
      latencyMs: probe.toolsLatencyMs,
    });

    const toolsMissingName = probe.tools.filter((t) => !t.name);
    if (probe.tools.length > 0) {
      checks.push({
        name: 'Tool schema validation',
        status: toolsMissingName.length > 0 ? 'warn' : 'pass',
        message: toolsMissingName.length > 0
          ? `${toolsMissingName.length} tool(s) missing required name field`
          : 'All tool schemas are valid',
      });
    }

    if (probe.resources.length > 0 || probe.resourcesLatencyMs !== undefined) {
      checks.push({
        name: 'Resources discovery',
        status: 'pass',
        message: `Found ${probe.resources.length} resource${probe.resources.length !== 1 ? 's' : ''}`,
        latencyMs: probe.resourcesLatencyMs,
      });
    }

    if (probe.prompts.length > 0 || probe.promptsLatencyMs !== undefined) {
      checks.push({
        name: 'Prompts discovery',
        status: 'pass',
        message: `Found ${probe.prompts.length} prompt${probe.prompts.length !== 1 ? 's' : ''}`,
        latencyMs: probe.promptsLatencyMs,
      });
    }

    if (probe.toolCallResults && probe.toolCallResults.length > 0) {
      const failed = probe.toolCallResults.filter((r) => r.status === 'fail');
      const warned = probe.toolCallResults.filter((r) => r.status === 'warn');
      const passed = probe.toolCallResults.filter((r) => r.status === 'pass');
      const sidecarCount = probe.toolCallResults.filter((r) => r.source === 'sidecar').length;
      const status: CheckStatus = failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass';
      const parts: string[] = [];
      if (passed.length > 0) parts.push(`${passed.length} passed`);
      if (warned.length > 0) parts.push(`${warned.length} auth/permission errors`);
      if (failed.length > 0) parts.push(`${failed.length} failed`);
      const sourceNote = sidecarCount > 0 ? ` (${sidecarCount} sidecar, ${probe.toolCallResults.length - sidecarCount} auto)` : '';
      checks.push({
        name: 'Tool call dry-run',
        status,
        message: parts.join(', ') + sourceNote,
      });
    }

    return {
      target: options.target,
      timestamp: new Date().toISOString(),
      overallStatus: deriveOverallStatus(checks),
      checks,
      serverInfo: probe.serverInfo,
      tools: probe.tools,
      resources: probe.resources,
      prompts: probe.prompts,
      toolCallResults: probe.toolCallResults,
      totalLatencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isSidecarError = message.includes('tools file');
    checks.push({
      name: isSidecarError ? 'Tool sidecar' : 'MCP protocol handshake',
      status: 'fail',
      message,
    });

    return {
      target: options.target,
      timestamp: new Date().toISOString(),
      overallStatus: 'fail',
      checks,
      tools: [],
      resources: [],
      prompts: [],
      totalLatencyMs: Date.now() - startTime,
    };
  }
}
