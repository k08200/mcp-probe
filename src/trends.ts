import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { redactText, redactUnknown } from './redact.js';
import type { BatchReport, CheckReport, CheckStatus, ToolCallAttempt, ToolCallResult } from './types.js';

type AnyReport = CheckReport | BatchReport;

type ParsedReceipt = {
  file: string;
  generatedAt?: string;
  report: AnyReport;
};

type ServerRun = {
  receiptFile: string;
  generatedAt?: string;
  server: string;
  target: string;
  report: CheckReport;
};

export type TrendEvent = {
  receiptFile: string;
  timestamp: string;
  date: string;
  server: string;
  target: string;
  tool: string;
  source: ToolCallResult['source'];
  finalStatus: CheckStatus;
  attempts: ToolCallAttempt[];
  retryAttempts: number;
  firstError?: string;
  finalError?: string;
};

export type TrendDay = {
  date: string;
  retryEvents: number;
  recovered: number;
  unresolved: number;
  retryAttempts: number;
};

export type TrendToolSummary = {
  server: string;
  tool: string;
  source: ToolCallResult['source'];
  retryEvents: number;
  recovered: number;
  unresolved: number;
  retryAttempts: number;
  firstSeen: string;
  lastSeen: string;
  lastStatus: CheckStatus;
};

export type TrendReport = {
  generatedAt: string;
  inputs: {
    paths: string[];
    files: string[];
  };
  receiptCount: number;
  runCount: number;
  retryEvents: number;
  recovered: number;
  unresolved: number;
  retryAttempts: number;
  days: TrendDay[];
  tools: TrendToolSummary[];
  events: TrendEvent[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCheckReport(value: unknown): value is CheckReport {
  return isObject(value) &&
    typeof value.target === 'string' &&
    Array.isArray(value.checks) &&
    Array.isArray(value.tools) &&
    Array.isArray(value.resources) &&
    Array.isArray(value.prompts);
}

function isBatchReport(value: unknown): value is BatchReport {
  return isObject(value) &&
    typeof value.target === 'string' &&
    Array.isArray(value.servers);
}

function isAnyReport(value: unknown): value is AnyReport {
  return isCheckReport(value) || isBatchReport(value);
}

function collectJsonFiles(directory: string, files: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      collectJsonFiles(path, files);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(path);
    }
  }
}

function collectReceiptFiles(paths: string[]): string[] {
  const files: string[] = [];

  for (const path of paths) {
    const stat = statSync(path);
    if (stat.isDirectory()) {
      collectJsonFiles(path, files);
    } else if (stat.isFile()) {
      files.push(path);
    }
  }

  const unique = [...new Set(files)].sort();
  if (unique.length === 0) {
    throw new Error('No receipt JSON files found.');
  }
  return unique;
}

function parseReceiptFile(file: string): ParsedReceipt {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid receipt JSON ${file}: ${message}`);
  }

  if (isObject(parsed) && isAnyReport(parsed.report)) {
    return {
      file,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      report: parsed.report,
    };
  }

  if (isAnyReport(parsed)) {
    return { file, report: parsed };
  }

  throw new Error(`Invalid receipt ${file}: expected an mcp-probe receipt or report JSON.`);
}

function normalizeTimestamp(...candidates: Array<string | undefined>): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date(0).toISOString();
}

function runsFromReceipt(receipt: ParsedReceipt): ServerRun[] {
  if (isBatchReport(receipt.report)) {
    return receipt.report.servers
      .filter((server) => isCheckReport(server.report))
      .map((server) => ({
        receiptFile: receipt.file,
        generatedAt: receipt.generatedAt ?? receipt.report.timestamp,
        server: redactText(server.name),
        target: redactText(server.report.target),
        report: server.report,
      }));
  }

  return [{
    receiptFile: receipt.file,
    generatedAt: receipt.generatedAt,
    server: redactText(receipt.report.serverInfo?.name ?? receipt.report.target),
    target: redactText(receipt.report.target),
    report: receipt.report,
  }];
}

function lastAttemptError(attempts: ToolCallAttempt[]): string | undefined {
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const error = attempts[index]?.error;
    if (error) return redactText(error);
  }
  return undefined;
}

function eventsFromRun(run: ServerRun): TrendEvent[] {
  return (run.report.toolCallResults ?? [])
    .filter((result) => (result.attempts?.length ?? 0) > 1)
    .map((result) => {
      const attempts = (result.attempts ?? []).map((attempt) => ({
        ...attempt,
        error: attempt.error ? redactText(attempt.error) : undefined,
      }));
      const timestamp = normalizeTimestamp(run.report.timestamp, run.generatedAt);
      return {
        receiptFile: run.receiptFile,
        timestamp,
        date: timestamp.slice(0, 10),
        server: run.server,
        target: run.target,
        tool: redactText(result.tool),
        source: result.source,
        finalStatus: result.status,
        attempts,
        retryAttempts: Math.max(0, attempts.length - 1),
        firstError: attempts.find((attempt) => attempt.error)?.error,
        finalError: result.error ? redactText(result.error) : lastAttemptError(attempts),
      };
    });
}

function emptyDay(date: string): TrendDay {
  return { date, retryEvents: 0, recovered: 0, unresolved: 0, retryAttempts: 0 };
}

function summarizeDays(events: TrendEvent[]): TrendDay[] {
  const days = new Map<string, TrendDay>();
  for (const event of events) {
    const day = days.get(event.date) ?? emptyDay(event.date);
    day.retryEvents += 1;
    day.retryAttempts += event.retryAttempts;
    if (event.finalStatus === 'pass') day.recovered += 1;
    else day.unresolved += 1;
    days.set(event.date, day);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeTools(events: TrendEvent[]): TrendToolSummary[] {
  const tools = new Map<string, TrendToolSummary>();
  for (const event of events) {
    const key = JSON.stringify([event.server, event.tool, event.source]);
    const existing = tools.get(key);
    if (!existing) {
      tools.set(key, {
        server: event.server,
        tool: event.tool,
        source: event.source,
        retryEvents: 1,
        recovered: event.finalStatus === 'pass' ? 1 : 0,
        unresolved: event.finalStatus === 'pass' ? 0 : 1,
        retryAttempts: event.retryAttempts,
        firstSeen: event.timestamp,
        lastSeen: event.timestamp,
        lastStatus: event.finalStatus,
      });
      continue;
    }

    existing.retryEvents += 1;
    existing.retryAttempts += event.retryAttempts;
    if (event.finalStatus === 'pass') existing.recovered += 1;
    else existing.unresolved += 1;
    if (event.timestamp < existing.firstSeen) existing.firstSeen = event.timestamp;
    if (event.timestamp >= existing.lastSeen) {
      existing.lastSeen = event.timestamp;
      existing.lastStatus = event.finalStatus;
    }
  }

  return [...tools.values()].sort((a, b) =>
    b.retryEvents - a.retryEvents ||
    b.unresolved - a.unresolved ||
    b.retryAttempts - a.retryAttempts ||
    a.server.localeCompare(b.server) ||
    a.tool.localeCompare(b.tool)
  );
}

export function buildTrendReport(paths: string[]): TrendReport {
  const files = collectReceiptFiles(paths);
  const receipts = files.map(parseReceiptFile);
  const runs = receipts.flatMap(runsFromReceipt);
  const events = runs
    .flatMap(eventsFromRun)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.server.localeCompare(b.server));
  const recovered = events.filter((event) => event.finalStatus === 'pass').length;
  const retryAttempts = events.reduce((sum, event) => sum + event.retryAttempts, 0);

  return redactUnknown({
    generatedAt: new Date().toISOString(),
    inputs: { paths, files },
    receiptCount: receipts.length,
    runCount: runs.length,
    retryEvents: events.length,
    recovered,
    unresolved: events.length - recovered,
    retryAttempts,
    days: summarizeDays(events),
    tools: summarizeTools(events),
    events,
  });
}

function markdownCell(value: unknown): string {
  return redactText(String(value ?? ''))
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>');
}

function markdownRow(values: unknown[]): string {
  return `| ${values.map(markdownCell).join(' | ')} |`;
}

export function renderTrendMarkdown(report: TrendReport): string {
  const lines = [
    '## mcp-probe retry trends',
    '',
    `**Receipts:** ${report.receiptCount}  `,
    `**Server runs:** ${report.runCount}  `,
    `**Retry events:** ${report.retryEvents} (${report.recovered} recovered, ${report.unresolved} unresolved)  `,
    `**Retry attempts:** ${report.retryAttempts}`,
  ];

  if (report.retryEvents === 0) {
    lines.push('', 'No retry receipts found.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(
    '',
    '### Daily Trend',
    '',
    markdownRow(['Date', 'Retry Events', 'Recovered', 'Unresolved', 'Retry Attempts']),
    markdownRow(['---', '---', '---', '---', '---']),
    ...report.days.map((day) => markdownRow([
      day.date,
      day.retryEvents,
      day.recovered,
      day.unresolved,
      day.retryAttempts,
    ])),
    '',
    '### Flaky Tools',
    '',
    markdownRow(['Server', 'Tool', 'Source', 'Retry Events', 'Recovered', 'Unresolved', 'Last Status']),
    markdownRow(['---', '---', '---', '---', '---', '---', '---']),
    ...report.tools.slice(0, 10).map((tool) => markdownRow([
      tool.server,
      tool.tool,
      tool.source,
      tool.retryEvents,
      tool.recovered,
      tool.unresolved,
      tool.lastStatus,
    ]))
  );

  return `${lines.join('\n')}\n`;
}

export function renderTrendTerminal(report: TrendReport): string {
  const lines = [
    '',
    'mcp-probe retry trends',
    '────────────────────────────────────────────────────',
    `Receipts: ${report.receiptCount}  Server runs: ${report.runCount}`,
    `Retry events: ${report.retryEvents} (${report.recovered} recovered, ${report.unresolved} unresolved)`,
    `Retry attempts: ${report.retryAttempts}`,
  ];

  if (report.retryEvents === 0) {
    lines.push('No retry receipts found.', '');
    return lines.join('\n');
  }

  lines.push('', 'Daily trend');
  for (const day of report.days) {
    lines.push(`  ${day.date}  retry=${day.retryEvents} recovered=${day.recovered} unresolved=${day.unresolved} attempts=${day.retryAttempts}`);
  }

  lines.push('', 'Top flaky tools');
  for (const tool of report.tools.slice(0, 10)) {
    lines.push(`  ${tool.server} / ${tool.tool} [${tool.source}]  retry=${tool.retryEvents} recovered=${tool.recovered} unresolved=${tool.unresolved} last=${tool.lastStatus}`);
  }

  lines.push('');
  return lines.join('\n');
}

function escapeHtml(value: unknown): string {
  return redactText(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dashboardRows(report: TrendReport): string {
  if (report.retryEvents === 0) {
    return '<p class="empty">No retry receipts found in the selected artifacts.</p>';
  }

  const maxDaily = Math.max(...report.days.map((day) => day.retryEvents), 1);
  const dayRows = report.days.map((day) => {
    const width = Math.max(4, Math.round((day.retryEvents / maxDaily) * 100));
    return `<tr><td>${escapeHtml(day.date)}</td><td><span class="bar" style="width: ${width}%"></span>${day.retryEvents}</td><td>${day.recovered}</td><td>${day.unresolved}</td><td>${day.retryAttempts}</td></tr>`;
  }).join('\n');

  const toolRows = report.tools.slice(0, 20).map((tool) =>
    `<tr><td>${escapeHtml(tool.server)}</td><td>${escapeHtml(tool.tool)}</td><td>${escapeHtml(tool.source)}</td><td>${tool.retryEvents}</td><td>${tool.recovered}</td><td>${tool.unresolved}</td><td><span class="status ${tool.lastStatus}">${tool.lastStatus}</span></td><td>${escapeHtml(tool.lastSeen.slice(0, 10))}</td></tr>`
  ).join('\n');

  const eventRows = report.events.slice(-25).reverse().map((event) => {
    const firstError = event.firstError ? escapeHtml(event.firstError) : '';
    return `<tr><td>${escapeHtml(event.timestamp.slice(0, 19))}</td><td>${escapeHtml(event.server)}</td><td>${escapeHtml(event.tool)}</td><td><span class="status ${event.finalStatus}">${event.finalStatus}</span></td><td>${event.attempts.length}</td><td>${firstError}</td></tr>`;
  }).join('\n');

  return `
    <section>
      <h2>Daily trend</h2>
      <table>
        <thead><tr><th>Date</th><th>Retry events</th><th>Recovered</th><th>Unresolved</th><th>Retry attempts</th></tr></thead>
        <tbody>${dayRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Flaky tools</h2>
      <table>
        <thead><tr><th>Server</th><th>Tool</th><th>Source</th><th>Retry events</th><th>Recovered</th><th>Unresolved</th><th>Last status</th><th>Last seen</th></tr></thead>
        <tbody>${toolRows}</tbody>
      </table>
    </section>
    <section>
      <h2>Recent retry receipts</h2>
      <table>
        <thead><tr><th>Timestamp</th><th>Server</th><th>Tool</th><th>Final status</th><th>Attempts</th><th>First error</th></tr></thead>
        <tbody>${eventRows}</tbody>
      </table>
    </section>
  `;
}

export function renderTrendDashboard(report: TrendReport): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mcp-probe retry trends</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f6f7f9; color: #18202a; }
    body { margin: 0; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
    header { margin-bottom: 24px; }
    h1 { margin: 0 0 8px; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 18px; letter-spacing: 0; }
    p { margin: 0; color: #536071; }
    .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 24px 0; }
    .metric { background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; padding: 14px 16px; }
    .metric span { display: block; color: #667383; font-size: 12px; text-transform: uppercase; }
    .metric strong { display: block; margin-top: 6px; font-size: 26px; }
    section { margin-top: 18px; background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; padding: 18px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; color: #536071; font-weight: 600; border-bottom: 1px solid #dfe4ea; padding: 10px 8px; white-space: nowrap; }
    td { border-bottom: 1px solid #edf0f3; padding: 10px 8px; vertical-align: top; }
    tr:last-child td { border-bottom: 0; }
    .bar { display: inline-block; height: 8px; min-width: 12px; margin-right: 8px; border-radius: 999px; background: #3b82f6; }
    .status { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .status.pass { color: #166534; background: #dcfce7; }
    .status.warn { color: #92400e; background: #fef3c7; }
    .status.fail { color: #991b1b; background: #fee2e2; }
    .empty { padding: 20px; background: #fff; border: 1px solid #dfe4ea; border-radius: 8px; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>mcp-probe retry trends</h1>
      <p>Generated ${escapeHtml(report.generatedAt)} from ${report.receiptCount} receipt artifact${report.receiptCount === 1 ? '' : 's'}.</p>
    </header>
    <div class="metrics">
      <div class="metric"><span>Server runs</span><strong>${report.runCount}</strong></div>
      <div class="metric"><span>Retry events</span><strong>${report.retryEvents}</strong></div>
      <div class="metric"><span>Recovered</span><strong>${report.recovered}</strong></div>
      <div class="metric"><span>Unresolved</span><strong>${report.unresolved}</strong></div>
      <div class="metric"><span>Retry attempts</span><strong>${report.retryAttempts}</strong></div>
    </div>
    ${dashboardRows(report)}
  </main>
</body>
</html>
`;
}

export function writeTrendDashboard(report: TrendReport, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, renderTrendDashboard(report));
}
