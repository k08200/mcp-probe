import type { BatchReport, CheckReport } from '../types.js';
import { redactUnknown } from '../redact.js';

export function renderJson(report: CheckReport | BatchReport): void {
  process.stdout.write(JSON.stringify(redactUnknown(report), null, 2) + '\n');
}
