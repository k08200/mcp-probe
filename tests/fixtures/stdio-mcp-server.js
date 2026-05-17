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

await server.connect(new StdioServerTransport());
