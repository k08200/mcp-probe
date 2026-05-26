import { describe, expect, it } from 'vitest';
import { probeMcpServer } from '../src/protocols/mcp-client.js';

const fixtureServer = new URL('./fixtures/stdio-mcp-server.js', import.meta.url).pathname;
const stderrWarningServer = new URL('./fixtures/stderr-warning-server.js', import.meta.url).pathname;

describe('probeMcpServer stdio integration', () => {
  it('discovers tools and classifies tool result errors from sidecar dry-runs', async () => {
    const result = await probeMcpServer({
      command: process.execPath,
      args: [fixtureServer],
      timeoutMs: 5000,
      probeTools: true,
      sidecar: {
        tools: {
          echo: { input: { message: 'hello' } },
          auth_check: {
            input: { query: 'errors' },
            expect: { not_error_code: [401] },
          },
          db_query: {
            input: { sql: 'select 1 as ok' },
            expect: {
              status: 'pass',
              requiredFields: ['rowCount', 'limit', 'source', 'freshness'],
              maxRows: 100,
            },
          },
          db_write: {
            input: { sql: 'delete from users where id = 1' },
            expect: {
              status: 'fail',
              errorCode: 'WRITE_NOT_ALLOWED',
              notContains: ['DATABASE_URL', 'password', 'stack'],
            },
          },
        },
      },
    });

    expect(result.serverInfo).toEqual({ name: 'fixture-server', version: '1.0.0', capabilities: ['tools'] });
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(['auth_check', 'db_query', 'db_write', 'echo']);
    expect(result.toolCallResults).toHaveLength(4);

    const echo = result.toolCallResults?.find((tool) => tool.tool === 'echo');
    expect(echo).toMatchObject({ status: 'pass', source: 'sidecar' });

    const auth = result.toolCallResults?.find((tool) => tool.tool === 'auth_check');
    expect(auth).toMatchObject({
      status: 'warn',
      source: 'sidecar',
      error: '401 Unauthorized: browser auth required',
    });

    const dbQuery = result.toolCallResults?.find((tool) => tool.tool === 'db_query');
    expect(dbQuery).toMatchObject({ status: 'pass', source: 'sidecar' });
    expect(dbQuery?.assertions?.every((assertion) => assertion.status === 'pass')).toBe(true);

    const dbWrite = result.toolCallResults?.find((tool) => tool.tool === 'db_write');
    expect(dbWrite).toMatchObject({ status: 'pass', source: 'sidecar' });
    expect(dbWrite?.assertions?.every((assertion) => assertion.status === 'pass')).toBe(true);
  }, 10000);

  it('calls only sidecar-listed tools when sidecar inputs are provided', async () => {
    const result = await probeMcpServer({
      command: process.execPath,
      args: [fixtureServer],
      timeoutMs: 5000,
      probeTools: true,
      sidecar: {
        tools: {
          echo: { input: { message: 'safe read-only sample' } },
        },
      },
    });

    expect(result.toolCallResults).toEqual([
      expect.objectContaining({
        tool: 'echo',
        status: 'pass',
        source: 'sidecar',
      }),
    ]);
  }, 10000);

  it('fails when a sidecar references a tool the server does not expose', async () => {
    const result = await probeMcpServer({
      command: process.execPath,
      args: [fixtureServer],
      timeoutMs: 5000,
      probeTools: true,
      sidecar: {
        tools: {
          missing_tool: { input: {} },
        },
      },
    });

    expect(result.toolCallResults).toEqual([
      expect.objectContaining({
        tool: 'missing_tool',
        status: 'fail',
        source: 'sidecar',
        error: 'Sidecar references a tool that was not discovered: missing_tool',
      }),
    ]);
  }, 10000);

  it('does not report allowed stderr warnings as the startup failure reason', async () => {
    await expect(probeMcpServer({
      transport: 'stdio',
      command: process.execPath,
      args: [stderrWarningServer],
      timeoutMs: 3000,
    })).rejects.not.toThrow('missing optional config');
  }, 10000);

  it('uses custom fatal stderr patterns as the startup failure reason', async () => {
    await expect(probeMcpServer({
      transport: 'stdio',
      command: process.execPath,
      args: [stderrWarningServer],
      timeoutMs: 3000,
      stderr: {
        fatal: ['missing optional config'],
      },
    })).rejects.toThrow('missing optional config');
  }, 10000);
});
