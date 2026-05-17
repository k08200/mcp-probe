import { describe, it, expect, vi, beforeEach } from 'vitest';
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
    expect(resolveTarget('./server.js')).toEqual({ command: 'node', args: ['./server.js'] });
  });

  it('uses node for absolute paths', () => {
    expect(resolveTarget('/usr/local/bin/server.js')).toEqual({
      command: 'node',
      args: ['/usr/local/bin/server.js'],
    });
  });

  it('uses npx for npm package names', () => {
    expect(resolveTarget('@scope/mcp-server')).toEqual({
      command: 'npx',
      args: ['--yes', '@scope/mcp-server'],
    });
  });

  it('uses npx for plain package names', () => {
    expect(resolveTarget('mcp-server-filesystem')).toEqual({
      command: 'npx',
      args: ['--yes', 'mcp-server-filesystem'],
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

    expect(mockedProbe).toHaveBeenCalledWith({
      command: 'npx',
      args: ['--yes', '@scope/mcp-pkg'],
      timeoutMs: 8000,
    });
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
