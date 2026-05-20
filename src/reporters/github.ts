import { appendFileSync } from 'fs';
import { redactText } from '../redact.js';
import type { BatchReport, CheckItem, CheckReport, CheckStatus, ToolCallResult } from '../types.js';

type AnyReport = CheckReport | BatchReport;

const STATUS_ICON: Record<CheckStatus, string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
};

function isBatchReport(report: AnyReport): report is BatchReport {
  return 'servers' in report;
}

function escapeCell(value: unknown): string {
  return redactText(String(value ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function escapeCommand(value: string): string {
  return value
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
}

function row(values: unknown[]): string {
  return `| ${values.map(escapeCell).join(' | ')} |`;
}

function checksTable(checks: CheckItem[]): string {
  return [
    row(['Status', 'Check', 'Message', 'Latency']),
    row(['---', '---', '---', '---']),
    ...checks.map((check) => row([
      STATUS_ICON[check.status],
      check.name,
      check.message,
      check.latencyMs !== undefined ? `${check.latencyMs}ms` : '',
    ])),
  ].join('\n');
}

function toolCallsTable(results: ToolCallResult[] | undefined): string {
  if (!results || results.length === 0) return '';
  return [
    '',
    '### Tool Call Dry-run',
    '',
    row(['Status', 'Tool', 'Source', 'Latency', 'Error']),
    row(['---', '---', '---', '---', '---']),
    ...results.map((result) => row([
      STATUS_ICON[result.status],
      result.tool,
      result.source,
      `${result.latencyMs}ms`,
      result.error ?? '',
    ])),
  ].join('\n');
}

function singleSummary(report: CheckReport): string {
  const lines = [
    `## mcp-probe: ${redactText(report.target)}`,
    '',
    `**Status:** ${STATUS_ICON[report.overallStatus]}  `,
    `**Total:** ${report.totalLatencyMs}ms`,
    '',
    checksTable(report.checks),
  ];

  const toolCalls = toolCallsTable(report.toolCallResults);
  if (toolCalls) lines.push(toolCalls);

  return lines.join('\n') + '\n';
}

function batchSummary(report: BatchReport): string {
  const passed = report.servers.filter((server) => server.report.overallStatus === 'pass').length;
  const warned = report.servers.filter((server) => server.report.overallStatus === 'warn').length;
  const failed = report.servers.filter((server) => server.report.overallStatus === 'fail').length;

  const lines = [
    `## mcp-probe batch: ${redactText(report.target)}`,
    '',
    `**Status:** ${STATUS_ICON[report.overallStatus]}  `,
    `**Servers:** ${passed} passed, ${warned} warned, ${failed} failed  `,
    `**Total:** ${report.totalLatencyMs}ms`,
    '',
    row(['Status', 'Server', 'Target', 'Tools', 'Latency']),
    row(['---', '---', '---', '---', '---']),
    ...report.servers.map((server) => row([
      STATUS_ICON[server.report.overallStatus],
      server.name,
      server.report.target,
      server.report.tools.length,
      `${server.report.totalLatencyMs}ms`,
    ])),
  ];

  for (const server of report.servers) {
    if (server.report.overallStatus === 'pass') continue;
    lines.push('', `### ${server.name}`, '', checksTable(server.report.checks));
    const toolCalls = toolCallsTable(server.report.toolCallResults);
    if (toolCalls) lines.push(toolCalls);
  }

  return lines.join('\n') + '\n';
}

export function buildGithubSummary(report: AnyReport): string {
  return isBatchReport(report) ? batchSummary(report) : singleSummary(report);
}

function annotation(level: 'warning' | 'error', title: string, message: string): string {
  return `::${level} title=${escapeCommand(title)}::${escapeCommand(message)}`;
}

function annotationsForCheck(prefix: string, check: CheckItem): string[] {
  if (check.status === 'pass') return [];
  const level = check.status === 'fail' ? 'error' : 'warning';
  return [annotation(level, `${redactText(prefix)}: ${check.name}`, redactText(check.message))];
}

function annotationsForToolCall(prefix: string, result: ToolCallResult): string[] {
  if (result.status === 'pass') return [];
  const level = result.status === 'fail' ? 'error' : 'warning';
  const message = result.error ?? `${result.tool} returned ${result.status}`;
  return [annotation(level, `${redactText(prefix)}: ${result.tool}`, redactText(message))];
}

export function buildGithubAnnotations(report: AnyReport): string[] {
  if (!isBatchReport(report)) {
    return [
      ...report.checks.flatMap((check) => annotationsForCheck(report.target, check)),
      ...(report.toolCallResults ?? []).flatMap((result) => annotationsForToolCall(report.target, result)),
    ];
  }

  return report.servers.flatMap((server) => [
    ...server.report.checks.flatMap((check) => annotationsForCheck(server.name, check)),
    ...(server.report.toolCallResults ?? []).flatMap((result) => annotationsForToolCall(server.name, result)),
  ]);
}

export function renderGithubActions(report: AnyReport, summaryPath = process.env.GITHUB_STEP_SUMMARY): void {
  for (const line of buildGithubAnnotations(report)) {
    process.stdout.write(`${line}\n`);
  }

  if (summaryPath) {
    appendFileSync(summaryPath, buildGithubSummary(report));
  }
}
