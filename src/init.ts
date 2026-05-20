import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { TransportMode } from './types.js';

export type InitOptions = {
  target: string;
  name?: string;
  configFile: string;
  toolsFile: string;
  workflowFile?: string;
  githubActions: boolean;
  force: boolean;
  transport?: TransportMode;
  headerEnv?: string;
};

export type InitFileResult = {
  path: string;
  status: 'created' | 'skipped';
};

export type InitResult = {
  files: InitFileResult[];
};

function serverNameFromTarget(target: string): string {
  const withoutProtocol = target.replace(/^https?:\/\//i, '');
  const last = withoutProtocol.split('/').filter(Boolean).pop() ?? 'mcp-server';
  return last
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mcp-server';
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function writeFileIfAllowed(path: string, content: string, force: boolean): InitFileResult {
  if (existsSync(path) && !force) {
    return { path, status: 'skipped' };
  }

  const dir = dirname(path);
  if (dir && dir !== '.') {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, content);
  return { path, status: 'created' };
}

function buildConfig(options: InitOptions): unknown {
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
    timeoutMs: 10000,
    servers: [server],
  };
}

function buildToolsFile(): unknown {
  return {
    tools: {
      replace_with_tool_name: {
        input: {},
        expect: {
          not_error_code: [401, 403],
        },
      },
    },
  };
}

function buildWorkflow(configFile: string): string {
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
      - uses: actions/checkout@v4

      - name: Validate MCP readiness
        run: |
          npx @k08200/mcp-probe@latest \\
            --config ${configFile} \\
            --github-summary \\
            --badge-file mcp-probe-badge.json
`;
}

export function initProject(options: InitOptions): InitResult {
  const files: InitFileResult[] = [];

  files.push(writeFileIfAllowed(
    options.configFile,
    json(buildConfig(options)),
    options.force
  ));

  files.push(writeFileIfAllowed(
    options.toolsFile,
    json(buildToolsFile()),
    options.force
  ));

  if (options.githubActions && options.workflowFile) {
    files.push(writeFileIfAllowed(
      options.workflowFile,
      buildWorkflow(options.configFile),
      options.force
    ));
  }

  return { files };
}
