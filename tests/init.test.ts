import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { initProject } from '../src/init.js';

describe('initProject', () => {
  it('creates config and sidecar files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-init-'));
    const configFile = join(dir, 'mcp-probe.config.json');
    const toolsFile = join(dir, '.mcp-probe.json');

    try {
      const result = initProject({
        target: '@modelcontextprotocol/server-memory',
        configFile,
        toolsFile,
        githubActions: false,
        force: false,
      });

      expect(result.files).toEqual([
        { path: configFile, status: 'created' },
        { path: toolsFile, status: 'created' },
      ]);

      const config = JSON.parse(readFileSync(configFile, 'utf8'));
      expect(config).toEqual({
        $schema: 'https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.config.schema.json',
        timeoutMs: 10000,
        servers: [
          {
            name: 'server-memory',
            target: '@modelcontextprotocol/server-memory',
            probeTools: true,
            toolsFile,
          },
        ],
      });

      const sidecar = JSON.parse(readFileSync(toolsFile, 'utf8'));
      expect(sidecar.$schema).toBe('https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.sidecar.schema.json');
      expect(sidecar.tools.replace_with_tool_name.input).toEqual({});
      expect(sidecar.tools.replace_with_tool_name.expect.not_error_code).toEqual([401, 403]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses discovered tools when provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-init-'));
    const configFile = join(dir, 'mcp-probe.config.json');
    const toolsFile = join(dir, '.mcp-probe.json');

    try {
      initProject({
        target: '@test/server',
        configFile,
        toolsFile,
        githubActions: false,
        force: false,
        discoveredTools: [
          {
            name: 'search',
            inputSchema: {
              type: 'object',
              required: ['query', 'limit'],
              properties: {
                query: { type: 'string' },
                limit: { type: 'integer' },
              },
            },
          },
          {
            name: 'list',
            inputSchema: {
              type: 'object',
              properties: {
                includeArchived: { type: 'boolean' },
              },
            },
          },
        ],
      });

      const sidecar = JSON.parse(readFileSync(toolsFile, 'utf8'));
      expect(sidecar.tools).toEqual({
        search: {
          input: { query: '', limit: 0 },
          expect: { not_error_code: [401, 403] },
        },
        list: {
          input: { includeArchived: false },
          expect: { not_error_code: [401, 403] },
        },
      });
      expect(sidecar.tools).not.toHaveProperty('replace_with_tool_name');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a GitHub Actions workflow when requested', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-init-'));
    const configFile = join(dir, 'mcp-probe.config.json');
    const toolsFile = join(dir, '.mcp-probe.json');
    const workflowFile = join(dir, '.github', 'workflows', 'mcp-probe.yml');

    try {
      initProject({
        target: 'https://mcp.example.com/mcp',
        name: 'remote',
        configFile,
        toolsFile,
        workflowFile,
        githubActions: true,
        force: false,
        transport: 'http',
        headerEnv: 'REMOTE_MCP_TOKEN',
      });

      expect(existsSync(workflowFile)).toBe(true);
      expect(readFileSync(workflowFile, 'utf8')).toContain(`--config ${configFile}`);

      const config = JSON.parse(readFileSync(configFile, 'utf8'));
      expect(config.servers[0]).toEqual({
        name: 'remote',
        target: 'https://mcp.example.com/mcp',
        probeTools: true,
        toolsFile,
        transport: 'http',
        headers: {
          Authorization: 'Bearer ${REMOTE_MCP_TOKEN}',
        },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skips existing files unless force is enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-init-'));
    const configFile = join(dir, 'mcp-probe.config.json');
    const toolsFile = join(dir, '.mcp-probe.json');
    writeFileSync(configFile, 'keep');

    try {
      const skipped = initProject({
        target: '@test/server',
        configFile,
        toolsFile,
        githubActions: false,
        force: false,
      });
      expect(skipped.files[0]).toEqual({ path: configFile, status: 'skipped' });
      expect(readFileSync(configFile, 'utf8')).toBe('keep');

      const overwritten = initProject({
        target: '@test/server',
        configFile,
        toolsFile,
        githubActions: false,
        force: true,
      });
      expect(overwritten.files[0]).toEqual({ path: configFile, status: 'created' });
      expect(readFileSync(configFile, 'utf8')).not.toBe('keep');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
