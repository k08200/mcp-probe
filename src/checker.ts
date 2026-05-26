import { withIssue } from './issues.js';
import { probeMcpServer } from './protocols/mcp-client.js';
import { redactText, redactUnknown } from './redact.js';
import { loadOptionalSidecar } from './sidecar.js';
import type { CheckItem, CheckOptions, CheckReport, CheckStatus, ResolvedTarget, TransportMode } from './types.js';

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

function deriveOverallStatus(checks: CheckItem[]): CheckStatus {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}

export async function checkMcpServer(options: CheckOptions): Promise<CheckReport> {
  const startTime = Date.now();
  const checks: CheckItem[] = [];
  const secretValues = Object.values(options.headers ?? {});
  const resolved = resolveTarget(options.target, options.transport);
  const args = [...(resolved.args ?? []), ...(options.serverArgs ?? [])];
  const probeTools = options.probeTools || Boolean(options.toolsFile);
  const resolutionMessage = resolved.transport === 'stdio'
    ? `${resolved.command} ${args.join(' ')}`
    : `${resolved.transport} ${resolved.url}`;

  checks.push(withIssue({
    name: 'Target resolution',
    status: 'pass',
    message: redactText(resolutionMessage, secretValues),
  }));

  try {
    const sidecar = probeTools ? loadOptionalSidecar(options.toolsFile) : undefined;
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

    checks.push(withIssue({
      name: 'MCP protocol handshake',
      status: 'pass',
      message: `${probe.serverInfo.name} v${probe.serverInfo.version}`,
      latencyMs: probe.connectLatencyMs,
    }));

    const toolsStatus: CheckStatus = probe.tools.length > 0 ? 'pass' : 'warn';
    checks.push(withIssue({
      name: 'Tools discovery',
      status: toolsStatus,
      message: probe.tools.length > 0
        ? `Found ${probe.tools.length} tool${probe.tools.length !== 1 ? 's' : ''}`
        : 'No tools registered — server may be resources/prompts-only',
      latencyMs: probe.toolsLatencyMs,
    }));

    const toolsMissingName = probe.tools.filter((t) => !t.name);
    if (probe.tools.length > 0) {
      checks.push(withIssue({
        name: 'Tool schema validation',
        status: toolsMissingName.length > 0 ? 'warn' : 'pass',
        message: toolsMissingName.length > 0
          ? `${toolsMissingName.length} tool(s) missing required name field`
          : 'All tool schemas are valid',
      }));
    }

    if (probe.resources.length > 0 || probe.resourcesLatencyMs !== undefined) {
      checks.push(withIssue({
        name: 'Resources discovery',
        status: 'pass',
        message: `Found ${probe.resources.length} resource${probe.resources.length !== 1 ? 's' : ''}`,
        latencyMs: probe.resourcesLatencyMs,
      }));
    }

    if (probe.prompts.length > 0 || probe.promptsLatencyMs !== undefined) {
      checks.push(withIssue({
        name: 'Prompts discovery',
        status: 'pass',
        message: `Found ${probe.prompts.length} prompt${probe.prompts.length !== 1 ? 's' : ''}`,
        latencyMs: probe.promptsLatencyMs,
      }));
    }

    if (probe.toolCallResults && probe.toolCallResults.length > 0) {
      const failed = probe.toolCallResults.filter((r) => r.status === 'fail');
      const warned = probe.toolCallResults.filter((r) => r.status === 'warn');
      const passed = probe.toolCallResults.filter((r) => r.status === 'pass');
      const sidecarCount = probe.toolCallResults.filter((r) => r.source === 'sidecar').length;
      const contractFailed = failed.filter((r) => r.issue?.code === 'CONTRACT_ASSERTION_FAILED').length;
      const status: CheckStatus = failed.length > 0 ? 'fail' : warned.length > 0 ? 'warn' : 'pass';
      const parts: string[] = [];
      if (passed.length > 0) parts.push(`${passed.length} passed`);
      if (warned.length > 0) parts.push(`${warned.length} auth/permission errors`);
      if (contractFailed > 0) parts.push(`${contractFailed} contract assertion failed`);
      if (failed.length - contractFailed > 0) parts.push(`${failed.length - contractFailed} failed`);
      const sourceNote = sidecarCount > 0 ? ` (${sidecarCount} sidecar, ${probe.toolCallResults.length - sidecarCount} auto)` : '';
      checks.push(withIssue({
        name: 'Tool call dry-run',
        status,
        message: parts.join(', ') + sourceNote,
      }));
    }

    return redactUnknown({
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
    }, secretValues);
  } catch (error) {
    const message = redactText(error instanceof Error ? error.message : String(error), secretValues);
    const isSidecarError = message.includes('tools file');
    checks.push(withIssue({
      name: isSidecarError ? 'Tool sidecar' : 'MCP protocol handshake',
      status: 'fail',
      message,
    }));

    return redactUnknown({
      target: options.target,
      timestamp: new Date().toISOString(),
      overallStatus: 'fail',
      checks,
      tools: [],
      resources: [],
      prompts: [],
      totalLatencyMs: Date.now() - startTime,
    }, secretValues);
  }
}
