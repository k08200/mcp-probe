import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { loadConfig } from './config.js';
import type { CheckStatus, ConfigServer } from './types.js';

const CONFIG_SCHEMA_URL = 'https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.config.schema.json';
const SIDECAR_SCHEMA_URL = 'https://raw.githubusercontent.com/k08200/mcp-probe/main/schemas/mcp-probe.sidecar.schema.json';
const DEFAULT_TOOLS_FILE = '.mcp-probe.json';
const DEFAULT_WORKFLOW_FILE = '.github/workflows/mcp-probe.yml';

export type DoctorCheck = {
  name: string;
  status: CheckStatus;
  message: string;
};

export type DoctorReport = {
  overallStatus: CheckStatus;
  checks: DoctorCheck[];
};

export type DoctorOptions = {
  configFile: string;
  fix?: boolean;
  target?: string;
  toolsFile?: string;
  workflowFile?: string;
  force?: boolean;
};

function deriveOverallStatus(checks: DoctorCheck[]): CheckStatus {
  if (checks.some((check) => check.status === 'fail')) return 'fail';
  if (checks.some((check) => check.status === 'warn')) return 'warn';
  return 'pass';
}

function nodeVersionStatus(): DoctorCheck {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  const ok = major > 20 || (major === 20 && minor >= 19);
  return {
    name: 'Node.js version',
    status: ok ? 'pass' : 'fail',
    message: ok
      ? `Node ${process.versions.node} satisfies >=20.19.0`
      : `Node ${process.versions.node} is below required >=20.19.0`,
  };
}

function validateSidecar(path: string): DoctorCheck {
  if (!existsSync(path)) {
    return {
      name: `Sidecar ${path}`,
      status: 'fail',
      message: 'File does not exist',
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('root must be an object');
    }
    const tools = (parsed as { tools?: unknown }).tools;
    if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
      throw new Error('tools must be an object');
    }
    const entries = Object.entries(tools as Record<string, unknown>);
    if (entries.length === 0) {
      return {
        name: `Sidecar ${path}`,
        status: 'warn',
        message: 'No tool entries found',
      };
    }
    for (const [toolName, entry] of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`${toolName} entry must be an object`);
      }
      const input = (entry as { input?: unknown }).input;
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(`${toolName}.input must be an object`);
      }
    }
    return {
      name: `Sidecar ${path}`,
      status: 'pass',
      message: `Found ${entries.length} tool entr${entries.length === 1 ? 'y' : 'ies'}`,
    };
  } catch (err) {
    return {
      name: `Sidecar ${path}`,
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function workflowStatus(configFile: string): DoctorCheck {
  const dir = '.github/workflows';
  if (!existsSync(dir)) {
    return {
      name: 'GitHub Actions workflow',
      status: 'warn',
      message: 'No .github/workflows directory found',
    };
  }

  const workflowFiles = readdirSync(dir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => join(dir, file));
  const matching = workflowFiles
    .map((file) => ({ file, content: readFileSync(file, 'utf8') }))
    .filter(({ content }) => content.includes('mcp-probe'));

  if (matching.length === 0) {
    return {
      name: 'GitHub Actions workflow',
      status: 'warn',
      message: 'No workflow file mentions mcp-probe',
    };
  }

  const combined = matching.map(({ content }) => content).join('\n');
  const missing: string[] = [];
  const normalizedConfigFile = configFile.replaceAll('\\', '/');

  if (!combined.includes('actions/checkout@v6')) {
    missing.push('actions/checkout@v6');
  }
  if (!/--config(?:=|\s+)/.test(combined) || !combined.replaceAll('\\', '/').includes(normalizedConfigFile)) {
    missing.push(`--config ${configFile}`);
  }
  if (!combined.includes('--github-summary')) {
    missing.push('--github-summary');
  }

  return missing.length === 0
    ? {
        name: 'GitHub Actions workflow',
        status: 'pass',
        message: `Found ${matching.length} workflow file${matching.length === 1 ? '' : 's'} mentioning mcp-probe`,
      }
    : {
        name: 'GitHub Actions workflow',
        status: 'warn',
        message: `Found ${matching.length} workflow file${matching.length === 1 ? '' : 's'} mentioning mcp-probe, but missing ${missing.join(', ')}`,
      };
}

function uniqueToolsFiles(servers: ConfigServer[]): string[] {
  return [...new Set(servers.map((server) => server.toolsFile).filter((value): value is string => Boolean(value)))];
}

function resolveConfigPath(configFile: string, maybeRelative: string): string {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(configFile), maybeRelative);
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function ensureParentDir(path: string): void {
  const dir = dirname(path);
  if (dir && dir !== '.') {
    mkdirSync(dir, { recursive: true });
  }
}

function writeIfAllowed(path: string, content: string, force: boolean): DoctorCheck {
  if (existsSync(path) && !force) {
    return {
      name: `Fix ${path}`,
      status: 'warn',
      message: 'File already exists; pass --force to overwrite',
    };
  }

  ensureParentDir(path);
  writeFileSync(path, content);
  return {
    name: `Fix ${path}`,
    status: 'pass',
    message: existsSync(path) && force ? 'Wrote file' : 'Created file',
  };
}

function serverNameFromTarget(target: string): string {
  const withoutProtocol = target.replace(/^https?:\/\//i, '');
  const last = withoutProtocol.split('/').filter(Boolean).pop() ?? 'mcp-server';
  return last
    .replace(/^@/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'mcp-server';
}

function buildConfig(target: string, toolsFile: string): string {
  return json({
    $schema: CONFIG_SCHEMA_URL,
    timeoutMs: 10000,
    servers: [
      {
        name: serverNameFromTarget(target),
        target,
        probeTools: true,
        toolsFile,
      },
    ],
  });
}

function buildSidecar(): string {
  return json({
    $schema: SIDECAR_SCHEMA_URL,
    tools: {
      replace_with_tool_name: {
        input: {},
        expect: {
          not_error_code: [401, 403],
        },
      },
    },
  });
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
      - uses: actions/checkout@v6

      - name: Validate MCP readiness
        run: |
          npx @k08200/mcp-probe@latest \\
            --config ${configFile} \\
            --github-summary \\
            --badge-file mcp-probe-badge.json
`;
}

function applyFixes(options: DoctorOptions): DoctorCheck[] {
  if (!options.fix) return [];

  const checks: DoctorCheck[] = [];
  const toolsFile = options.toolsFile ?? DEFAULT_TOOLS_FILE;
  const workflowFile = options.workflowFile ?? DEFAULT_WORKFLOW_FILE;
  const force = Boolean(options.force);

  if (!existsSync(options.configFile)) {
    if (!options.target) {
      checks.push({
        name: 'Fix config file',
        status: 'warn',
        message: 'Cannot create config without --target <server>',
      });
    } else {
      checks.push(writeIfAllowed(options.configFile, buildConfig(options.target, toolsFile), force));
    }
  }

  if (existsSync(options.configFile)) {
    try {
      const config = loadConfig(options.configFile);
      for (const configuredToolsFile of uniqueToolsFiles(config.servers)) {
        const sidecarPath = resolveConfigPath(options.configFile, configuredToolsFile);
        if (!existsSync(sidecarPath)) {
          checks.push(writeIfAllowed(sidecarPath, buildSidecar(), force));
        }
      }
    } catch {
      // The normal validation pass will report the config parse/shape error.
    }
  } else if (options.target) {
    const sidecarPath = resolveConfigPath(options.configFile, toolsFile);
    if (!existsSync(sidecarPath)) {
      checks.push(writeIfAllowed(sidecarPath, buildSidecar(), force));
    }
  }

  const workflow = workflowStatus(options.configFile);
  if (workflow.status !== 'pass') {
    checks.push(writeIfAllowed(workflowFile, buildWorkflow(options.configFile), force));
  }

  return checks;
}

export function runDoctor(options: DoctorOptions): DoctorReport {
  const checks: DoctorCheck[] = [nodeVersionStatus(), ...applyFixes(options)];

  if (!existsSync(options.configFile)) {
    checks.push({
      name: 'Config file',
      status: 'warn',
      message: `${options.configFile} not found. Run "mcp-probe init --target <server> --github-actions".`,
    });
    checks.push(workflowStatus(options.configFile));
    return { overallStatus: deriveOverallStatus(checks), checks };
  }

  try {
    const config = loadConfig(options.configFile);
    checks.push({
      name: 'Config file',
      status: 'pass',
      message: `${options.configFile} contains ${config.servers.length} server${config.servers.length === 1 ? '' : 's'}`,
    });

    const toolsFiles = uniqueToolsFiles(config.servers);
    if (toolsFiles.length === 0) {
      checks.push({
        name: 'Sidecar files',
        status: 'warn',
        message: 'No toolsFile entries found; tool calls will use schema-minimum generated inputs',
      });
    } else {
      for (const toolsFile of toolsFiles) {
        checks.push(validateSidecar(resolveConfigPath(options.configFile, toolsFile)));
      }
    }
  } catch (err) {
    checks.push({
      name: 'Config file',
      status: 'fail',
      message: err instanceof Error ? err.message : String(err),
    });
  }

  checks.push(workflowStatus(options.configFile));
  return { overallStatus: deriveOverallStatus(checks), checks };
}
