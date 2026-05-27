import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import { loadConfig } from './config.js';
import { buildConfig, buildToolsFile, buildToolsFileFromNames, buildWorkflow, json } from './scaffold.js';
import { readToolSidecar } from './sidecar.js';
import type { CheckStatus, ConfigServer } from './types.js';

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
    const sidecar = readToolSidecar(path);
    const entries = Object.entries(sidecar.tools);
    if (entries.length === 0) {
      return {
        name: `Sidecar ${path}`,
        status: 'warn',
        message: 'No tool entries found',
      };
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

function validateExpectedToolCoverage(configFile: string, server: ConfigServer): DoctorCheck | undefined {
  if (!server.expectedTools?.length) return undefined;

  const name = `Expected tool coverage ${server.name}`;
  if (!server.toolsFile) {
    return {
      name,
      status: 'fail',
      message: `expectedTools configured but no toolsFile is set; add sidecar samples for ${server.expectedTools.join(', ')}`,
    };
  }

  const sidecarPath = resolveConfigPath(configFile, server.toolsFile);
  try {
    const sidecar = readToolSidecar(sidecarPath);
    const sampled = new Set(Object.keys(sidecar.tools));
    const missing = server.expectedTools.filter((tool) => !sampled.has(tool));
    if (missing.length > 0) {
      return {
        name,
        status: 'fail',
        message: `missing sidecar samples for expected tools: ${missing.join(', ')}`,
      };
    }

    return {
      name,
      status: 'pass',
      message: 'All expected tools have sidecar sample inputs',
    };
  } catch {
    // validateSidecar reports the parse or read failure; avoid duplicate noise.
    return undefined;
  }
}

function uncommentWorkflowLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#')) return '';
  const commentIndex = line.indexOf('#');
  return commentIndex === -1 ? line : line.slice(0, commentIndex);
}

function workflowRunCommands(content: string): string[] {
  const lines = content.split(/\r?\n/);
  const commands: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = uncommentWorkflowLine(lines[index]);
    const inlineRun = line.match(/^\s*-\s*run:\s*(.+)$/) ?? line.match(/^\s*run:\s*(.+)$/);
    if (!inlineRun) continue;

    const value = inlineRun[1].trim();
    if (value !== '|' && value !== '>') {
      commands.push(value);
      continue;
    }

    const blockIndent = line.search(/\S/);
    const blockLines: string[] = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const blockLine = uncommentWorkflowLine(lines[cursor]);
      if (!blockLine.trim()) {
        blockLines.push(blockLine);
        continue;
      }
      const indent = blockLine.search(/\S/);
      if (indent <= blockIndent) break;
      blockLines.push(blockLine.trim());
      index = cursor;
    }
    commands.push(blockLines.join('\n'));
  }

  return commands;
}

function workflowStatus(configFile: string): DoctorCheck {
  const dir = '.github/workflows';
  if (!existsSync(dir)) {
    return {
      name: 'GitHub Actions workflow',
      status: 'warn',
      message: 'No .github/workflows directory found. Next: run "mcp-probe doctor --fix --target <server>".',
    };
  }

  const workflowFiles = readdirSync(dir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => join(dir, file));
  const matching = workflowFiles
    .map((file) => ({ file, content: readFileSync(file, 'utf8') }))
    .map(({ file, content }) => ({ file, content, commands: workflowRunCommands(content) }))
    .filter(({ commands }) => commands.some((command) => command.includes('mcp-probe')));

  if (matching.length === 0) {
    return {
      name: 'GitHub Actions workflow',
      status: 'warn',
      message: 'No workflow run step executes mcp-probe. Next: run "mcp-probe doctor --fix".',
    };
  }

  const combinedWorkflow = matching.map(({ content }) => content).join('\n');
  const combinedCommands = matching.flatMap(({ commands }) => commands).join('\n');
  const missing: string[] = [];
  const normalizedConfigFile = configFile.replaceAll('\\', '/');

  if (!combinedWorkflow.includes('actions/checkout@v6')) {
    missing.push('actions/checkout@v6');
  }
  if (!/--config(?:=|\s+)/.test(combinedCommands) || !combinedCommands.replaceAll('\\', '/').includes(normalizedConfigFile)) {
    missing.push(`--config ${configFile}`);
  }
  if (!combinedCommands.includes('--github-summary')) {
    missing.push('--github-summary');
  }

  return missing.length === 0
    ? {
        name: 'GitHub Actions workflow',
        status: 'pass',
        message: `Found ${matching.length} workflow file${matching.length === 1 ? '' : 's'} with an mcp-probe run step`,
      }
    : {
        name: 'GitHub Actions workflow',
        status: 'warn',
        message: `Found ${matching.length} workflow file${matching.length === 1 ? '' : 's'} with an mcp-probe run step, but missing ${missing.join(', ')}. Next: run "mcp-probe doctor --fix".`,
      };
}

function uniqueToolsFiles(servers: ConfigServer[]): string[] {
  return [...new Set(servers.map((server) => server.toolsFile).filter((value): value is string => Boolean(value)))];
}

function expectedToolsForToolsFile(servers: ConfigServer[], toolsFile: string): string[] {
  return [
    ...new Set(
      servers
        .filter((server) => server.toolsFile === toolsFile)
        .flatMap((server) => server.expectedTools ?? []),
    ),
  ];
}

function resolveConfigPath(configFile: string, maybeRelative: string): string {
  if (isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(configFile), maybeRelative);
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

function workflowFiles(): Array<{ file: string; content: string }> {
  const dir = '.github/workflows';
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
    .map((file) => join(dir, file))
    .map((file) => ({ file, content: readFileSync(file, 'utf8') }));
}

function matchingWorkflowFiles(): Array<{ file: string; content: string }> {
  return workflowFiles().filter(({ content }) => workflowRunCommands(content).some((command) => command.includes('mcp-probe')));
}

function buildSidecar(toolNames: string[] = []): string {
  return json(toolNames.length > 0 ? buildToolsFileFromNames(toolNames) : buildToolsFile());
}

function fixWorkflow(configFile: string, workflowFile: string, force: boolean): DoctorCheck {
  if (existsSync(workflowFile)) {
    const content = readFileSync(workflowFile, 'utf8');
    const hasProbeRunStep = workflowRunCommands(content).some((command) => command.includes('mcp-probe'));
    if (hasProbeRunStep && !force) {
      return {
        name: `Fix ${workflowFile}`,
        status: 'warn',
        message: 'Existing mcp-probe workflow is incomplete; not rewriting it automatically',
      };
    }
    if (!force) {
      return {
        name: `Fix ${workflowFile}`,
        status: 'warn',
        message: 'Workflow already exists; review the suggested workflow in the README or pass --force to replace it',
      };
    }
    ensureParentDir(workflowFile);
    writeFileSync(workflowFile, buildWorkflow(configFile));
    return {
      name: `Fix ${workflowFile}`,
      status: 'warn',
      message: 'Replaced workflow because --force was provided',
    };
  }

  const match = matchingWorkflowFiles()[0];
  if (match) {
    return {
      name: `Fix ${match.file}`,
      status: 'warn',
      message: 'Existing mcp-probe workflow is incomplete; not rewriting it automatically',
    };
  }

  return writeIfAllowed(workflowFile, buildWorkflow(configFile), force);
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
        message: 'Cannot create config without --target <server>. Next: run "mcp-probe doctor --fix --target <server>".',
      });
    } else {
      checks.push(writeIfAllowed(options.configFile, json(buildConfig({ target: options.target, toolsFile })), force));
    }
  }

  if (existsSync(options.configFile)) {
    try {
      const config = loadConfig(options.configFile);
      for (const configuredToolsFile of uniqueToolsFiles(config.servers)) {
        const sidecarPath = resolveConfigPath(options.configFile, configuredToolsFile);
        if (!existsSync(sidecarPath)) {
          checks.push(writeIfAllowed(
            sidecarPath,
            buildSidecar(expectedToolsForToolsFile(config.servers, configuredToolsFile)),
            force,
          ));
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
    checks.push(fixWorkflow(options.configFile, workflowFile, force));
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

    for (const server of config.servers) {
      const coverage = validateExpectedToolCoverage(options.configFile, server);
      if (coverage) checks.push(coverage);
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
