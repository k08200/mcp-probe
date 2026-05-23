import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'fixture-server', version: '1.0.0' });

server.registerTool(
  'echo',
  {
    description: 'Echoes a message',
    inputSchema: { message: z.string() },
  },
  async ({ message }) => ({
    content: [{ type: 'text', text: message }],
  })
);

server.registerTool(
  'auth_check',
  {
    description: 'Simulates a browser auth failure',
    inputSchema: { query: z.string() },
  },
  async () => ({
    isError: true,
    content: [{ type: 'text', text: '401 Unauthorized: browser auth required' }],
  })
);

server.registerTool(
  'db_query',
  {
    description: 'Simulates a read-only database query result',
    inputSchema: { sql: z.string() },
  },
  async () => ({
    content: [{
      type: 'text',
      text: JSON.stringify({
        rowCount: 1,
        limit: 100,
        source: 'fixture-db',
        freshness: '2026-05-24T00:00:00.000Z',
        rows: [{ ok: 1 }],
      }),
    }],
  })
);

server.registerTool(
  'db_write',
  {
    description: 'Simulates a denied database write',
    inputSchema: { sql: z.string() },
  },
  async () => ({
    isError: true,
    content: [{
      type: 'text',
      text: JSON.stringify({
        code: 'WRITE_NOT_ALLOWED',
        message: 'Write operations are blocked for this role',
      }),
    }],
  })
);

await server.connect(new StdioServerTransport());
