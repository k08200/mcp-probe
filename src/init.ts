import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { ToolInfo, TransportMode } from './types.js';
import { buildConfig, buildToolsFile, buildWorkflow, json } from './scaffold.js';

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
  discoveredTools?: ToolInfo[];
  lockTools?: boolean;
};

export type InitFileResult = {
  path: string;
  status: 'created' | 'skipped';
};

export type InitResult = {
  files: InitFileResult[];
};

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

export function initProject(options: InitOptions): InitResult {
  const files: InitFileResult[] = [];

  files.push(writeFileIfAllowed(
    options.configFile,
    json(buildConfig(options)),
    options.force
  ));

  files.push(writeFileIfAllowed(
    options.toolsFile,
    json(buildToolsFile(options.discoveredTools)),
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
