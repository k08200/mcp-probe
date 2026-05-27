import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkConfigFile, loadConfig } from '../src/config.js';

vi.mock('../src/checker.js', () => ({
  checkMcpServer: vi.fn(),
}));

import { checkMcpServer } from '../src/checker.js';

const mockedCheck = vi.mocked(checkMcpServer);

const makeReport = (target: string, overallStatus: 'pass' | 'warn' | 'fail' = 'pass') => ({
  target,
  timestamp: '2026-05-19T00:00:00.000Z',
  overallStatus,
  checks: [],
  tools: [],
  resources: [],
  prompts: [],
  totalLatencyMs: 10,
});

describe('loadConfig', () => {
  it('loads a valid config', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      timeoutMs: 1234,
      servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory' }],
    }));

    try {
      expect(loadConfig(file)).toEqual({
        timeoutMs: 1234,
        servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory' }],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects configs without servers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({ servers: [] }));

    try {
      expect(() => loadConfig(file)).toThrow('servers must be a non-empty array');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unknown root fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory' }],
      typo: true,
    }));

    try {
      expect(() => loadConfig(file)).toThrow('root contains unknown field typo');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unknown server fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory', toolFile: './tools.json' }],
    }));

    try {
      expect(() => loadConfig(file)).toThrow('servers[0] contains unknown field toolFile');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid tool catalog policy fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory', forbiddenTools: 'delete_file' }],
    }));

    try {
      expect(() => loadConfig(file)).toThrow('servers[0].forbiddenTools must be a string array');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('checkConfigFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs every configured server and resolves local paths relative to the config file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      timeoutMs: 8000,
      servers: [
        {
          name: 'local',
          target: './fixtures/server.js',
          expectedTools: ['read_file'],
          allowedTools: ['read_file', 'search'],
          forbiddenTools: ['delete_file'],
          probeTools: true,
        },
        {
          name: 'datadog',
          target: 'https://mcp.example.com/mcp',
          transport: 'http',
          headers: { Authorization: 'Bearer test' },
          stderr: { allow: ['^Warning:'], fatal: ['panic'] },
          toolsFile: './recipes/datadog.json',
        },
      ],
    }));
    mockedCheck
      .mockResolvedValueOnce(makeReport(join(dir, 'fixtures/server.js'), 'pass'))
      .mockResolvedValueOnce(makeReport('https://mcp.example.com/mcp', 'warn'));

    try {
      const report = await checkConfigFile(file, 5000);

      expect(report.overallStatus).toBe('warn');
      expect(report.servers.map((server) => server.name)).toEqual(['local', 'datadog']);
      expect(mockedCheck).toHaveBeenNthCalledWith(1, {
        target: join(dir, 'fixtures/server.js'),
        serverArgs: undefined,
        timeoutMs: 8000,
        transport: undefined,
        headers: undefined,
        stderr: undefined,
        expectedTools: ['read_file'],
        allowedTools: ['read_file', 'search'],
        forbiddenTools: ['delete_file'],
        probeTools: true,
        toolsFile: undefined,
      });
      expect(mockedCheck).toHaveBeenNthCalledWith(2, {
        target: 'https://mcp.example.com/mcp',
        serverArgs: undefined,
        timeoutMs: 8000,
        transport: 'http',
        headers: { Authorization: 'Bearer test' },
        stderr: { allow: ['^Warning:'], fatal: ['panic'] },
        expectedTools: undefined,
        allowedTools: undefined,
        forbiddenTools: undefined,
        probeTools: undefined,
        toolsFile: join(dir, 'recipes/datadog.json'),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('expands environment variables in headers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [
        {
          name: 'remote',
          target: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer ${MCP_PROBE_TEST_TOKEN}' },
        },
      ],
    }));
    mockedCheck.mockResolvedValue(makeReport('https://mcp.example.com/mcp'));
    process.env.MCP_PROBE_TEST_TOKEN = 'test-token';

    try {
      await checkConfigFile(file, 5000);

      expect(mockedCheck).toHaveBeenCalledWith(expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      }));
    } finally {
      delete process.env.MCP_PROBE_TEST_TOKEN;
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a header references a missing environment variable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [
        {
          name: 'remote',
          target: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'Bearer ${MISSING_MCP_PROBE_TOKEN}' },
        },
      ],
    }));

    try {
      await expect(checkConfigFile(file, 5000)).rejects.toThrow(
        'Environment variable MISSING_MCP_PROBE_TOKEN is not set'
      );
      expect(mockedCheck).not.toHaveBeenCalled();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid transport values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [{ name: 'remote', target: 'https://mcp.example.com/mcp', transport: 'websocket' }],
    }));

    try {
      expect(() => loadConfig(file)).toThrow('transport must be stdio, http, or sse');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects invalid stderr regex values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [
        {
          name: 'memory',
          target: '@modelcontextprotocol/server-memory',
          stderr: { allow: ['[invalid'] },
        },
      ],
    }));

    try {
      expect(() => loadConfig(file)).toThrow('stderr.allow contains invalid regex');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses CLI default timeout when config omits timeoutMs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-config-'));
    const file = join(dir, 'mcp-probe.config.json');
    writeFileSync(file, JSON.stringify({
      servers: [{ name: 'memory', target: '@modelcontextprotocol/server-memory' }],
    }));
    mockedCheck.mockResolvedValue(makeReport('@modelcontextprotocol/server-memory'));

    try {
      await checkConfigFile(file, 4321);

      expect(mockedCheck).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 4321 }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
