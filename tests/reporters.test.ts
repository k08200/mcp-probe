import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderJson } from '../src/reporters/json-reporter.js';
import type { CheckReport } from '../src/types.js';

const makeReport = (overrides: Partial<CheckReport> = {}): CheckReport => ({
  target: '@test/server',
  timestamp: '2026-05-17T00:00:00.000Z',
  overallStatus: 'pass',
  checks: [{ name: 'MCP protocol handshake', status: 'pass', message: 'test-server v1.0.0', latencyMs: 100 }],
  serverInfo: { name: 'test-server', version: '1.0.0', capabilities: ['tools'] },
  tools: [{ name: 'read_file', description: 'Reads a file' }],
  totalLatencyMs: 150,
  ...overrides,
});

describe('renderJson', () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('outputs valid JSON to stdout', () => {
    const report = makeReport();
    renderJson(report);

    expect(writeSpy).toHaveBeenCalledOnce();
    const output = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.target).toBe('@test/server');
    expect(parsed.overallStatus).toBe('pass');
  });

  it('includes all report fields in output', () => {
    const report = makeReport();
    renderJson(report);

    const output = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveProperty('checks');
    expect(parsed).toHaveProperty('tools');
    expect(parsed).toHaveProperty('serverInfo');
    expect(parsed).toHaveProperty('totalLatencyMs');
  });

  it('serializes fail status correctly', () => {
    const report = makeReport({ overallStatus: 'fail', tools: [] });
    renderJson(report);

    const output = writeSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.overallStatus).toBe('fail');
  });
});
