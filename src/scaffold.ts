import type { ToolInfo, TransportMode } from './types.js';

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

function minimalInputFromSchema(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') return {};
  const typed = schema as Record<string, unknown>;
  const properties = typed.properties as Record<string, unknown> | undefined;
  if (!properties) return {};

  const required = (typed.required as string[] | undefined) ?? Object.keys(properties);
  const input: Record<string, unknown> = {};

  for (const key of required) {
    const property = properties[key] as Record<string, unknown> | undefined;
    const type = Array.isArray(property?.type) ? property?.type[0] : property?.type;

    switch (type) {
      case 'string':
        input[key] = '';
        break;
      case 'number':
      case 'integer':
        input[key] = 0;
        break;
      case 'boolean':
        input[key] = false;
        break;
      case 'array':
        input[key] = [];
        break;
      case 'object':
        input[key] = {};
        break;
      default:
        input[key] = null;
    }
  }

  return input;
}

function sidecarEntryForTool(tool: ToolInfo): unknown {
  return {
    input: minimalInputFromSchema(tool.inputSchema),
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
            --badge-file mcp-probe-badge.json
`;
}
