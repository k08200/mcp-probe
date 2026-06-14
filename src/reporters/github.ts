import { appendFileSync } from 'fs';
import { redactText } from '../redact.js';
import type { BatchReport, CheckItem, CheckReport, CheckStatus, ToolCallResult } from '../types.js';

type AnyReport = CheckReport | BatchReport;
type RetryReceiptRow = {
  server?: string;
  result: ToolCallResult;
};

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
    row(['Status', 'Check', 'Issue', 'Message', 'Latency']),
    row(['---', '---', '---', '---', '---']),
    ...checks.map((check) => row([
      STATUS_ICON[check.status],
      check.name,
      check.issue ? `${check.issue.code}: ${check.issue.hint}` : '',
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
    row(['Status', 'Tool', 'Source', 'Issue', 'Assertions', 'Latency', 'Error']),
    row(['---', '---', '---', '---', '---', '---', '---']),
    ...results.map((result) => row([
      STATUS_ICON[result.status],
      result.tool,
      result.source,
      result.issue ? `${result.issue.code}: ${result.issue.hint}` : '',
      (result.assertions ?? []).map((assertion) => `${STATUS_ICON[assertion.status]} ${assertion.name}: ${assertion.message}`).join('<br>'),
      `${result.latencyMs}ms`,
      result.error ?? '',
    ])),
  ].join('\n');
}

function retryReceiptRows(report: CheckReport, server?: string): RetryReceiptRow[] {
  return (report.toolCallResults ?? [])
    .filter((result) => (result.attempts?.length ?? 0) > 1)
    .map((result) => ({ server, result }));
}

function attemptReceipt(result: ToolCallResult): string {
  return (result.attempts ?? [])
    .map((attempt) => {
      const detail = `${attempt.attempt} ${STATUS_ICON[attempt.status]} (${attempt.latencyMs}ms)`;
      return attempt.error ? `${detail}: ${attempt.error}` : detail;
    })
    .join('<br>');
}

function retryReceiptsTable(rows: RetryReceiptRow[], includeServer: boolean): string {
  if (rows.length === 0) return '';
  const header = includeServer
    ? ['Status', 'Server', 'Tool', 'Source', 'Attempts', 'Latency']
    : ['Status', 'Tool', 'Source', 'Attempts', 'Latency'];

  return [
    '',
    '### Retry Receipts',
    '',
    row(header),
    row(header.map(() => '---')),
    ...rows.map(({ server, result }) => {
      const values = [
        STATUS_ICON[result.status],
        result.tool,
        result.source,
        attemptReceipt(result),
        `${result.latencyMs}ms`,
      ];
      return row(includeServer ? [values[0], server, ...values.slice(1)] : values);
    }),
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

  const retryReceipts = retryReceiptsTable(retryReceiptRows(report), false);
  if (retryReceipts) lines.push(retryReceipts);

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

  const retryReceipts = retryReceiptsTable(
    report.servers.flatMap((server) => retryReceiptRows(server.report, server.name)),
    true
  );
  if (retryReceipts) lines.push(retryReceipts);

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
  const hint = check.issue ? `\n\n${check.issue.code}: ${check.issue.hint}` : '';
  return [annotation(level, `${redactText(prefix)}: ${check.name}`, redactText(`${check.message}${hint}`))];
}

function annotationsForToolCall(prefix: string, result: ToolCallResult): string[] {
  if (result.status === 'pass') return [];
  const level = result.status === 'fail' ? 'error' : 'warning';
  const message = result.error ?? `${result.tool} returned ${result.status}`;
  const hint = result.issue ? `\n\n${result.issue.code}: ${result.issue.hint}` : '';
  return [annotation(level, `${redactText(prefix)}: ${result.tool}`, redactText(`${message}${hint}`))];
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
