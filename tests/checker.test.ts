import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { checkMcpServer, resolveTarget } from '../src/checker.js';

vi.mock('../src/protocols/mcp-client.js', () => ({
  probeMcpServer: vi.fn(),
}));

import { probeMcpServer } from '../src/protocols/mcp-client.js';

const mockedProbe = vi.mocked(probeMcpServer);

const makeProbeResult = (overrides = {}) => ({
  serverInfo: { name: 'test-server', version: '1.0.0', capabilities: ['tools'] },
  tools: [{ name: 'read_file', description: 'Reads a file' }],
  resources: [],
  prompts: [],
  connectLatencyMs: 120,
  toolsLatencyMs: 40,
  resourcesLatencyMs: undefined,
  promptsLatencyMs: undefined,
  ...overrides,
});

describe('resolveTarget', () => {
  it('uses node for local relative paths', () => {
    expect(resolveTarget('./server.js')).toEqual({ transport: 'stdio', command: 'node', args: ['./server.js'] });
  });

  it('uses node for absolute paths', () => {
    expect(resolveTarget('/usr/local/bin/server.js')).toEqual({
      transport: 'stdio',
      command: 'node',
      args: ['/usr/local/bin/server.js'],
    });
  });

  it('uses npx for npm package names', () => {
    expect(resolveTarget('@scope/mcp-server')).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['--yes', '@scope/mcp-server'],
    });
  });

  it('uses npx for plain package names', () => {
    expect(resolveTarget('mcp-server-filesystem')).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['--yes', 'mcp-server-filesystem'],
    });
  });

  it('uses HTTP transport for URL targets', () => {
    expect(resolveTarget('https://mcp.example.com/mcp')).toEqual({
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
    });
  });

  it('can force SSE transport for URL targets', () => {
    expect(resolveTarget('https://mcp.example.com/sse', 'sse')).toEqual({
      transport: 'sse',
      url: 'https://mcp.example.com/sse',
    });
  });
});

describe('checkMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns pass when server responds with tools', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    expect(report.overallStatus).toBe('pass');
    expect(report.tools).toHaveLength(1);
    expect(report.serverInfo?.name).toBe('test-server');
    expect(report.checks.every((c) => c.status === 'pass')).toBe(true);
  });

  it('returns fail when connection throws', async () => {
    mockedProbe.mockRejectedValue(new Error('ENOENT: spawn failed'));

    const report = await checkMcpServer({ target: '@broken/server', timeoutMs: 5000 });

    expect(report.overallStatus).toBe('fail');
    expect(report.tools).toHaveLength(0);
    expect(report.checks.some((c) => c.status === 'fail')).toBe(true);
    expect(report.checks.find((c) => c.name === 'MCP protocol handshake')?.message).toContain(
      'ENOENT'
    );
  });

  it('redacts secrets from failed probe messages and target URLs', async () => {
    mockedProbe.mockRejectedValue(new Error('upstream failed with Bearer abcdefghijklmnop'));

    const report = await checkMcpServer({
      target: 'https://mcp.example.com/mcp?token=abc123456789',
      timeoutMs: 5000,
      headers: { Authorization: 'Bearer abcdefghijklmnop' },
    });

    expect(report.target).toBe('https://mcp.example.com/mcp?token=[REDACTED]');
    expect(report.checks.find((c) => c.status === 'fail')?.message).toContain('Bearer [REDACTED]');
    expect(JSON.stringify(report)).not.toContain('abcdefghijklmnop');
    expect(JSON.stringify(report)).not.toContain('abc123456789');
  });

  it('returns warn when server has no tools', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult({ tools: [] }));

    const report = await checkMcpServer({ target: '@empty/server', timeoutMs: 5000 });

    expect(report.overallStatus).toBe('warn');
    expect(report.tools).toHaveLength(0);
    expect(report.checks.find((c) => c.name === 'Tools discovery')?.status).toBe('warn');
  });

  it('includes latency in tool-related checks', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult({ connectLatencyMs: 200, toolsLatencyMs: 80 }));

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    const handshake = report.checks.find((c) => c.name === 'MCP protocol handshake');
    const tools = report.checks.find((c) => c.name === 'Tools discovery');

    expect(handshake?.latencyMs).toBe(200);
    expect(tools?.latencyMs).toBe(80);
  });

  it('warns when a tool is missing its name field', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({ tools: [{ name: '' }, { name: 'valid_tool' }] })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    expect(report.overallStatus).toBe('warn');
    const schemaCheck = report.checks.find((c) => c.name === 'Tool schema validation');
    expect(schemaCheck?.status).toBe('warn');
  });

  it('passes probe options with correct command for npm packages', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    await checkMcpServer({ target: '@scope/mcp-pkg', timeoutMs: 8000 });

    expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({
      transport: 'stdio',
      command: 'npx',
      args: ['--yes', '@scope/mcp-pkg'],
      timeoutMs: 8000,
    }));
  });

  it('forwards remote transport options and headers', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    await checkMcpServer({
      target: 'https://mcp.example.com/mcp',
      timeoutMs: 8000,
      transport: 'http',
      headers: { Authorization: 'Bearer token' },
    });

    expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      headers: { Authorization: 'Bearer token' },
      timeoutMs: 8000,
    }));
  });

  it('forwards stderr classification rules', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    await checkMcpServer({
      target: '@test/server',
      timeoutMs: 8000,
      stderr: {
        allow: ['^Warning:'],
        fatal: ['panic'],
      },
    });

    expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({
      stderr: {
        allow: ['^Warning:'],
        fatal: ['panic'],
      },
    }));
  });

  it('forwards probeTools flag to probe', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    await checkMcpServer({ target: '@scope/mcp-pkg', timeoutMs: 8000, probeTools: true });

    expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({ probeTools: true }));
  });

  it('adds tool call dry-run check when toolCallResults present', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({
        toolCallResults: [
          { tool: 'read_file', status: 'pass', latencyMs: 50 },
          { tool: 'write_file', status: 'fail', latencyMs: 10, error: 'Permission denied' },
        ],
      })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000, probeTools: true });

    const check = report.checks.find((c) => c.name === 'Tool call dry-run');
    expect(check).toBeDefined();
    expect(check?.status).toBe('fail');
    expect(check?.message).toContain('1 passed');
    expect(check?.message).toContain('1 failed');
  });

  it('tool call dry-run is warn when only auth errors occur', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({
        toolCallResults: [
          { tool: 'search', status: 'warn', latencyMs: 20, error: '401 Unauthorized' },
        ],
      })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000, probeTools: true });

    const check = report.checks.find((c) => c.name === 'Tool call dry-run');
    expect(check?.status).toBe('warn');
    expect(check?.message).toContain('auth/permission');
  });

  it('does not add dry-run check when probeTools is false', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    expect(report.checks.find((c) => c.name === 'Tool call dry-run')).toBeUndefined();
  });

  it('shows sidecar vs auto counts in dry-run message', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({
        toolCallResults: [
          { tool: 'read_file', status: 'pass', latencyMs: 30, source: 'sidecar' },
          { tool: 'write_file', status: 'pass', latencyMs: 20, source: 'auto' },
        ],
      })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000, probeTools: true });

    const check = report.checks.find((c) => c.name === 'Tool call dry-run');
    expect(check?.message).toContain('1 sidecar');
    expect(check?.message).toContain('1 auto');
  });

  it('fails cleanly when an explicit toolsFile is missing', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000, toolsFile: '/nonexistent.json' });

    expect(report.overallStatus).toBe('fail');
    expect(report.checks.find((c) => c.name === 'Tool sidecar')?.message).toContain(
      'Cannot read tools file'
    );
    expect(mockedProbe).not.toHaveBeenCalled();
  });

  it('loads toolsFile and implies probeTools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-test-'));
    const toolsFile = join(dir, 'tools.json');
    writeFileSync(
      toolsFile,
      JSON.stringify({
        tools: {
          search: {
            input: { query: 'hello' },
            expect: { not_error_code: [401, 403] },
          },
        },
      })
    );
    mockedProbe.mockResolvedValue(makeProbeResult());

    try {
      await checkMcpServer({ target: '@test/server', timeoutMs: 5000, toolsFile });

      expect(mockedProbe).toHaveBeenCalledWith(expect.objectContaining({
        probeTools: true,
        sidecar: {
          tools: {
            search: {
              input: { query: 'hello' },
              expect: { not_error_code: [401, 403] },
            },
          },
        },
      }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails cleanly for invalid toolsFile schema', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-test-'));
    const toolsFile = join(dir, 'tools.json');
    writeFileSync(toolsFile, JSON.stringify({ tools: { search: { input: [] } } }));

    try {
      const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000, toolsFile });

      expect(report.overallStatus).toBe('fail');
      expect(report.checks.find((c) => c.name === 'Tool sidecar')?.message).toContain(
        'search.input must be an object'
      );
      expect(mockedProbe).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('includes resources check when server has resources capability', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({
        serverInfo: { name: 'server', version: '1.0.0', capabilities: ['tools', 'resources'] },
        resources: [{ uri: 'file:///readme.md', name: 'readme' }],
        resourcesLatencyMs: 25,
      })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    expect(report.resources).toHaveLength(1);
    const check = report.checks.find((c) => c.name === 'Resources discovery');
    expect(check?.status).toBe('pass');
    expect(check?.latencyMs).toBe(25);
  });

  it('includes prompts check when server has prompts capability', async () => {
    mockedProbe.mockResolvedValue(
      makeProbeResult({
        serverInfo: { name: 'server', version: '1.0.0', capabilities: ['tools', 'prompts'] },
        prompts: [{ name: 'summarize', description: 'Summarize text' }],
        promptsLatencyMs: 30,
      })
    );

    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });

    expect(report.prompts).toHaveLength(1);
    const check = report.checks.find((c) => c.name === 'Prompts discovery');
    expect(check?.status).toBe('pass');
  });

  it('records timestamp and totalLatencyMs in report', async () => {
    mockedProbe.mockResolvedValue(makeProbeResult());

    const before = Date.now();
    const report = await checkMcpServer({ target: '@test/server', timeoutMs: 5000 });
    const after = Date.now();

    expect(new Date(report.timestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(report.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(report.totalLatencyMs).toBeLessThanOrEqual(after - before + 10);
  });
});
