import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { loadConfig } from './config.js';
import type { CheckStatus, ConfigServer } from './types.js';

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

function workflowStatus(): DoctorCheck {
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
  const matching = workflowFiles.filter((file) => readFileSync(file, 'utf8').includes('mcp-probe'));

  return matching.length > 0
    ? {
        name: 'GitHub Actions workflow',
        status: 'pass',
        message: `Found ${matching.length} workflow file${matching.length === 1 ? '' : 's'} mentioning mcp-probe`,
      }
    : {
        name: 'GitHub Actions workflow',
        status: 'warn',
        message: 'No workflow file mentions mcp-probe',
      };
}

function uniqueToolsFiles(servers: ConfigServer[]): string[] {
  return [...new Set(servers.map((server) => server.toolsFile).filter((value): value is string => Boolean(value)))];
}

function resolveConfigPath(configFile: string, maybeRelative: string): string {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(configFile), maybeRelative);
}

export function runDoctor(options: DoctorOptions): DoctorReport {
  const checks: DoctorCheck[] = [nodeVersionStatus()];

  if (!existsSync(options.configFile)) {
    checks.push({
      name: 'Config file',
      status: 'warn',
      message: `${options.configFile} not found. Run "mcp-probe init --target <server> --github-actions".`,
    });
    checks.push(workflowStatus());
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

  checks.push(workflowStatus());
  return { overallStatus: deriveOverallStatus(checks), checks };
}
