import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderJson } from '../src/reporters/json-reporter.js';
import { buildGithubAnnotations, buildGithubSummary } from '../src/reporters/github.js';
import type { BatchReport, CheckReport } from '../src/types.js';

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

describe('github reporter', () => {
  it('builds a markdown summary for a single report', () => {
    const summary = buildGithubSummary(makeReport({
      toolCallResults: [
        { tool: 'read_file', status: 'pass', latencyMs: 12, source: 'sidecar' },
      ],
    }));

    expect(summary).toContain('## mcp-probe: @test/server');
    expect(summary).toContain('| Status | Check | Message | Latency |');
    expect(summary).toContain('Tool Call Dry-run');
    expect(summary).toContain('read_file');
  });

  it('builds annotations for failing checks and tool calls', () => {
    const annotations = buildGithubAnnotations(makeReport({
      overallStatus: 'fail',
      checks: [
        { name: 'MCP protocol handshake', status: 'fail', message: 'connection closed' },
      ],
      toolCallResults: [
        { tool: 'logs_query', status: 'warn', latencyMs: 50, error: '401 Unauthorized', source: 'sidecar' },
      ],
    }));

    expect(annotations).toEqual([
      '::error title=@test/server: MCP protocol handshake::connection closed',
      '::warning title=@test/server: logs_query::401 Unauthorized',
    ]);
  });

  it('escapes GitHub workflow command characters', () => {
    const annotations = buildGithubAnnotations(makeReport({
      overallStatus: 'fail',
      checks: [
        { name: 'Tool | check', status: 'fail', message: 'line1\nline2 % done' },
      ],
    }));

    expect(annotations[0]).toContain('line1%0Aline2 %25 done');
  });

  it('builds a batch summary with per-server details for non-pass servers', () => {
    const batch: BatchReport = {
      target: 'mcp-probe.config.json',
      timestamp: '2026-05-17T00:00:00.000Z',
      overallStatus: 'warn',
      servers: [
        { name: 'memory', report: makeReport({ target: '@memory', overallStatus: 'pass' }) },
        {
          name: 'datadog',
          report: makeReport({
            target: 'https://mcp.example.com/mcp',
            overallStatus: 'warn',
            checks: [{ name: 'Tool call dry-run', status: 'warn', message: '1 auth/permission errors' }],
          }),
        },
      ],
      totalLatencyMs: 200,
    };

    const summary = buildGithubSummary(batch);

    expect(summary).toContain('## mcp-probe batch: mcp-probe.config.json');
    expect(summary).toContain('| WARN | datadog | https://mcp.example.com/mcp | 1 | 150ms |');
    expect(summary).toContain('### datadog');
    expect(summary).not.toContain('### memory');
  });
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
