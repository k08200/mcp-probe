import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  buildTrendReport,
  renderTrendDashboard,
  renderTrendMarkdown,
  writeTrendDashboard,
} from '../src/trends.js';
import type { BatchReport, CheckReport } from '../src/types.js';

const makeReport = (overrides: Partial<CheckReport> = {}): CheckReport => ({
  target: '@test/server',
  timestamp: '2026-06-12T10:00:00.000Z',
  overallStatus: 'pass',
  checks: [],
  serverInfo: { name: 'test-server', version: '1.0.0', capabilities: ['tools'] },
  tools: [{ name: 'flaky_read' }],
  resources: [],
  prompts: [],
  totalLatencyMs: 100,
  ...overrides,
});

function writeReceipt(dir: string, name: string, report: CheckReport | BatchReport): string {
  const file = join(dir, name);
  writeFileSync(file, `${JSON.stringify({
    formatVersion: 1,
    generatedBy: { name: 'mcp-probe', version: '1.12.0' },
    generatedAt: report.timestamp,
    receiptType: 'mcp-readiness',
    report,
  }, null, 2)}\n`);
  return file;
}

describe('trend aggregation', () => {
  it('aggregates retry receipts by day and tool', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-trends-'));

    try {
      writeReceipt(dir, 'single.receipt.json', makeReport({
        toolCallResults: [
          {
            tool: 'flaky_read',
            status: 'pass',
            latencyMs: 20,
            source: 'sidecar',
            attempts: [
              { attempt: 1, status: 'fail', latencyMs: 5, error: '503 Service Unavailable' },
              { attempt: 2, status: 'pass', latencyMs: 7 },
            ],
          },
        ],
      }));

      const batch: BatchReport = {
        target: 'mcp-probe.config.json',
        timestamp: '2026-06-13T10:00:00.000Z',
        overallStatus: 'fail',
        servers: [
          { name: 'memory', report: makeReport({ target: '@memory', timestamp: '2026-06-13T10:00:00.000Z' }) },
          {
            name: 'datadog',
            report: makeReport({
              target: '@datadog',
              timestamp: '2026-06-13T10:05:00.000Z',
              overallStatus: 'fail',
              toolCallResults: [
                {
                  tool: 'logs_query',
                  status: 'fail',
                  latencyMs: 55,
                  source: 'sidecar',
                  error: '503 Service Unavailable after retry',
                  attempts: [
                    { attempt: 1, status: 'fail', latencyMs: 10, error: '503 Service Unavailable' },
                    { attempt: 2, status: 'fail', latencyMs: 11, error: '503 Service Unavailable' },
                    { attempt: 3, status: 'fail', latencyMs: 12, error: '503 Service Unavailable' },
                  ],
                },
              ],
            }),
          },
        ],
        totalLatencyMs: 200,
      };
      writeReceipt(dir, 'batch.receipt.json', batch);

      const report = buildTrendReport([dir]);

      expect(report.receiptCount).toBe(2);
      expect(report.runCount).toBe(3);
      expect(report.retryEvents).toBe(2);
      expect(report.recovered).toBe(1);
      expect(report.unresolved).toBe(1);
      expect(report.retryAttempts).toBe(3);
      expect(report.days).toEqual([
        { date: '2026-06-12', retryEvents: 1, recovered: 1, unresolved: 0, retryAttempts: 1 },
        { date: '2026-06-13', retryEvents: 1, recovered: 0, unresolved: 1, retryAttempts: 2 },
      ]);
      expect(report.tools.find((tool) => tool.tool === 'logs_query')).toMatchObject({
        server: 'datadog',
        retryEvents: 1,
        unresolved: 1,
        lastStatus: 'fail',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('renders markdown and an HTML dashboard', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-trends-'));

    try {
      const receipt = writeReceipt(dir, 'single.receipt.json', makeReport({
        toolCallResults: [
          {
            tool: 'flaky_read',
            status: 'pass',
            latencyMs: 20,
            source: 'sidecar',
            attempts: [
              { attempt: 1, status: 'fail', latencyMs: 5, error: '503 Service Unavailable' },
              { attempt: 2, status: 'pass', latencyMs: 7 },
            ],
          },
        ],
      }));
      const report = buildTrendReport([receipt]);

      const markdown = renderTrendMarkdown(report);
      expect(markdown).toContain('## mcp-probe retry trends');
      expect(markdown).toContain('| test-server | flaky_read | sidecar | 1 | 1 | 0 | pass |');

      const html = renderTrendDashboard(report);
      expect(html).toContain('<title>mcp-probe retry trends</title>');
      expect(html).toContain('Daily trend');

      const dashboardFile = join(dir, 'dashboard', 'trends.html');
      writeTrendDashboard(report, dashboardFile);
      expect(existsSync(dashboardFile)).toBe(true);
      expect(readFileSync(dashboardFile, 'utf8')).toContain('flaky_read');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
