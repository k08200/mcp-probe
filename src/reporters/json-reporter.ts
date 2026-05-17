import type { CheckReport } from '../types.js';

export function renderJson(report: CheckReport): void {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
}
