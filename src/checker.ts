import { probeMcpServer } from './protocols/mcp-client.js';
import type { CheckItem, CheckReport, CheckStatus } from './types.js';

type CheckOptions = {
  target: string;
  serverArgs?: string[];
  timeoutMs: number;
};

export function resolveTarget(target: string): { command: string; args: string[] } {
  if (target.startsWith('.') || target.startsWith('/')) {
    return { command: 'node', args: [target] };
  }
  return { command: 'npx', args: ['--yes', target] };
}

function deriveOverallStatus(checks: CheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}

export async function checkMcpServer(options: CheckOptions): Promise<CheckReport> {
  const startTime = Date.now();
  const checks: CheckItem[] = [];
  const resolved = resolveTarget(options.target);
  const args = [...resolved.args, ...(options.serverArgs ?? [])];
  const { command } = resolved;

  checks.push({
    name: 'Target resolution',
    status: 'pass',
    message: `${command} ${args.join(' ')}`,
  });

  try {
    const probe = await probeMcpServer({ command, args, timeoutMs: options.timeoutMs });

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

    return {
      target: options.target,
      timestamp: new Date().toISOString(),
      overallStatus: deriveOverallStatus(checks),
      checks,
      serverInfo: probe.serverInfo,
      tools: probe.tools,
      totalLatencyMs: Date.now() - startTime,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({
      name: 'MCP protocol handshake',
      status: 'fail',
      message,
    });

    return {
      target: options.target,
      timestamp: new Date().toISOString(),
      overallStatus: 'fail',
      checks,
      tools: [],
      totalLatencyMs: Date.now() - startTime,
    };
  }
}
