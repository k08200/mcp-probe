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
        },
      },
    });

    expect(result.serverInfo).toEqual({ name: 'fixture-server', version: '1.0.0', capabilities: ['tools'] });
    expect(result.tools.map((tool) => tool.name).sort()).toEqual(['auth_check', 'echo']);
    expect(result.toolCallResults).toHaveLength(2);

    const echo = result.toolCallResults?.find((tool) => tool.tool === 'echo');
    expect(echo).toMatchObject({ status: 'pass', source: 'sidecar' });

    const auth = result.toolCallResults?.find((tool) => tool.tool === 'auth_check');
    expect(auth).toMatchObject({
      status: 'warn',
      source: 'sidecar',
      error: '401 Unauthorized: browser auth required',
    });
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
