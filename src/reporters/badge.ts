import { dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import type { BatchReport, CheckReport, CheckStatus } from '../types.js';

type AnyReport = CheckReport | BatchReport;

export type ShieldsBadge = {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
};

const COLORS: Record<CheckStatus, string> = {
  pass: 'brightgreen',
  warn: 'yellow',
  fail: 'red',
};

function isBatchReport(report: AnyReport): report is BatchReport {
  return 'servers' in report;
}

function batchMessage(report: BatchReport): string {
  const passed = report.servers.filter((server) => server.report.overallStatus === 'pass').length;
  const warned = report.servers.filter((server) => server.report.overallStatus === 'warn').length;
  const failed = report.servers.filter((server) => server.report.overallStatus === 'fail').length;

  const parts = [`${passed} pass`];
  if (warned > 0) parts.push(`${warned} warn`);
  if (failed > 0) parts.push(`${failed} fail`);
  return parts.join(', ');
}

export function buildBadge(report: AnyReport): ShieldsBadge {
  return {
    schemaVersion: 1,
    label: isBatchReport(report) ? 'mcp fleet' : 'mcp probe',
    message: isBatchReport(report) ? batchMessage(report) : report.overallStatus,
    color: COLORS[report.overallStatus],
  };
}

export function writeBadgeFile(report: AnyReport, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(buildBadge(report), null, 2)}\n`);
}
