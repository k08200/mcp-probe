import type { ToolInfo, TransportMode } from './types.js';
import { sampleObjectFromSchema } from './schema-sample.js';

export const CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.config.schema.json';
export const SIDECAR_SCHEMA_URL = 'https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.sidecar.schema.json';

export type BuildConfigOptions = {
  target: string;
  name?: string;
  toolsFile: string;
  transport?: TransportMode;
  headerEnv?: string;
};

export function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

export function serverNameFromTarget(target: string): string {
  const withoutProtocol = target.replace(/^https?:\/\//i, '');
  const last = withoutProtocol.split('/').filter(Boolean).pop() ?? 'mcp-server';
  return last
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mcp-server';
}

export function buildConfig(options: BuildConfigOptions): unknown {
  const server: Record<string, unknown> = {
    name: options.name ?? serverNameFromTarget(options.target),
    target: options.target,
    probeTools: true,
    toolsFile: options.toolsFile,
  };

  if (options.transport) {
    server.transport = options.transport;
  }

  if (options.headerEnv) {
    server.headers = {
      Authorization: `Bearer \${${options.headerEnv}}`,
    };
  }

  return {
    $schema: CONFIG_SCHEMA_URL,
    timeoutMs: 10000,
    servers: [server],
  };
}

function sidecarEntryForTool(tool: ToolInfo): unknown {
  return {
    input: sampleObjectFromSchema(tool.inputSchema),
    expect: {
      not_error_code: [401, 403],
    },
  };
}

export function buildToolsFile(discoveredTools?: ToolInfo[]): unknown {
  const tools = discoveredTools && discoveredTools.length > 0
    ? Object.fromEntries(discoveredTools.map((tool) => [tool.name, sidecarEntryForTool(tool)]))
    : {
        replace_with_tool_name: {
          input: {},
          expect: {
            not_error_code: [401, 403],
          },
        },
      };

  return {
    $schema: SIDECAR_SCHEMA_URL,
    tools,
  };
}

export function buildToolsFileFromNames(toolNames: string[]): unknown {
  const unique = [...new Set(toolNames)].filter(Boolean);
  const tools = unique.length > 0
    ? Object.fromEntries(unique.map((name) => [
        name,
        {
          input: {},
          expect: {
            not_error_code: [401, 403],
          },
        },
      ]))
    : {
        replace_with_tool_name: {
          input: {},
          expect: {
            not_error_code: [401, 403],
          },
        },
      };

  return {
    $schema: SIDECAR_SCHEMA_URL,
    tools,
  };
}

export function buildWorkflow(configFile: string): string {
  return `name: MCP Probe

on:
  pull_request:
  push:
    branches: [main]

jobs:
  mcp-probe:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v6

      - name: Validate MCP readiness
        run: |
          npx @k08200/mcp-probe@latest \\
            --config ${configFile} \\
            --github-summary \\
            --fail-on-warn \\
            --badge-file mcp-probe-badge.json \\
            --receipt-file mcp-probe.receipt.json

      - name: Upload MCP readiness receipt
        uses: actions/upload-artifact@v4
        with:
          name: mcp-probe-receipt
          path: mcp-probe.receipt.json
`;
}
