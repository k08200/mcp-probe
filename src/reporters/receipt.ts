import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { redactUnknown } from '../redact.js';
import { VERSION } from '../version.js';
import type { BatchReport, CheckReport } from '../types.js';

type AnyReport = CheckReport | BatchReport;

export type ProbeReceipt = {
  formatVersion: 1;
  generatedBy: {
    name: 'mcp-probe';
    version: string;
  };
  generatedAt: string;
  receiptType: 'mcp-readiness';
  report: AnyReport;
};

export function buildReceipt(report: AnyReport): ProbeReceipt {
  return {
    formatVersion: 1,
    generatedBy: {
      name: 'mcp-probe',
      version: VERSION,
    },
    generatedAt: new Date().toISOString(),
    receiptType: 'mcp-readiness',
    report: redactUnknown(report) as AnyReport,
  };
}

export function writeReceiptFile(report: AnyReport, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(buildReceipt(report), null, 2)}\n`);
}
