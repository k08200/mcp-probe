import type { BatchReport, CheckReport } from '../types.js';

export function renderJson(report: CheckReport | BatchReport): void {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
