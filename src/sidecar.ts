import { existsSync, readFileSync } from 'fs';
import type { ToolSidecar } from './types.js';

export const DEFAULT_SIDECAR_FILENAME = '.mcp-probe.json';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseToolSidecar(parsed: unknown, label: string): ToolSidecar {
  if (!isObject(parsed)) {
    throw new Error(`Invalid tools file: ${label} must be an object`);
  }

  if (!isObject(parsed.tools)) {
    throw new Error(`Invalid tools file: ${label} must contain a tools object`);
  }

  for (const [toolName, entry] of Object.entries(parsed.tools)) {
    if (!isObject(entry)) {
      throw new Error(`Invalid tools file: ${toolName} entry must be an object`);
    }
    if (!isObject(entry.input)) {
      throw new Error(`Invalid tools file: ${toolName}.input must be an object`);
    }

    if (entry.expect !== undefined) {
      if (!isObject(entry.expect)) {
        throw new Error(`Invalid tools file: ${toolName}.expect must be an object`);
      }
      const expect = entry.expect;
      if (expect.status !== undefined && expect.status !== 'pass' && expect.status !== 'fail' && expect.status !== 'warn') {
        throw new Error(`Invalid tools file: ${toolName}.expect.status must be pass, fail, or warn`);
      }
      if (expect.not_error_code !== undefined && (!Array.isArray(expect.not_error_code) || !expect.not_error_code.every((code) => Number.isInteger(code)))) {
        throw new Error(`Invalid tools file: ${toolName}.expect.not_error_code must be an integer array`);
      }
      for (const key of ['requiredFields', 'contains', 'notContains'] as const) {
        const value = expect[key];
        if (value !== undefined && (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))) {
          throw new Error(`Invalid tools file: ${toolName}.expect.${key} must be a string array`);
        }
      }
      if (expect.maxRows !== undefined && (typeof expect.maxRows !== 'number' || expect.maxRows < 0)) {
        throw new Error(`Invalid tools file: ${toolName}.expect.maxRows must be a non-negative number`);
      }
      if (expect.errorCode !== undefined && typeof expect.errorCode !== 'string') {
        throw new Error(`Invalid tools file: ${toolName}.expect.errorCode must be a string`);
      }
    }
  }

  return parsed as ToolSidecar;
}

export function readToolSidecar(path: string): ToolSidecar {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`Invalid tools file JSON: ${path}`);
  }
  return parseToolSidecar(parsed, path);
}

export function loadOptionalSidecar(toolsFile?: string): ToolSidecar | undefined {
  const path = toolsFile ?? DEFAULT_SIDECAR_FILENAME;
  if (!existsSync(path)) {
    if (!toolsFile) return undefined;
    throw new Error(`Cannot read tools file: ${path}`);
  }
  return readToolSidecar(path);
}
