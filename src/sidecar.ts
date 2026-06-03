import { existsSync, readFileSync } from 'fs';
import type { ToolSidecar } from './types.js';

export const DEFAULT_SIDECAR_FILENAME = '.mcp-probe.json';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`Invalid tools file: ${label} contains unknown field${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}`);
  }
}

export function parseToolSidecar(parsed: unknown, label: string): ToolSidecar {
  if (!isObject(parsed)) {
    throw new Error(`Invalid tools file: ${label} must be an object`);
  }

  rejectUnknownKeys(parsed, ['$schema', 'tools'], label);

  if (!isObject(parsed.tools)) {
    throw new Error(`Invalid tools file: ${label} must contain a tools object`);
  }

  for (const [toolName, entry] of Object.entries(parsed.tools)) {
    if (!isObject(entry)) {
      throw new Error(`Invalid tools file: ${toolName} entry must be an object`);
    }
    rejectUnknownKeys(entry, ['input', 'retry', 'expect'], toolName);
    if (!isObject(entry.input)) {
      throw new Error(`Invalid tools file: ${toolName}.input must be an object`);
    }

    if (entry.retry !== undefined) {
      if (!isObject(entry.retry)) {
        throw new Error(`Invalid tools file: ${toolName}.retry must be an object`);
      }
      const retry = entry.retry;
      rejectUnknownKeys(retry, ['attempts', 'delayMs', 'retryOn'], `${toolName}.retry`);
      const attempts = retry.attempts;
      const delayMs = retry.delayMs;
      const retryOn = retry.retryOn;
      if (!Number.isInteger(attempts) || typeof attempts !== 'number' || attempts < 1 || attempts > 10) {
        throw new Error(`Invalid tools file: ${toolName}.retry.attempts must be an integer between 1 and 10`);
      }
      if (delayMs !== undefined && (!Number.isInteger(delayMs) || typeof delayMs !== 'number' || delayMs < 0)) {
        throw new Error(`Invalid tools file: ${toolName}.retry.delayMs must be a non-negative integer`);
      }
      if (retryOn !== undefined && (!Array.isArray(retryOn) || !retryOn.every((item) => Number.isInteger(item) || typeof item === 'string'))) {
        throw new Error(`Invalid tools file: ${toolName}.retry.retryOn must be an array of integer status codes or string patterns`);
      }
    }

    if (entry.expect !== undefined) {
      if (!isObject(entry.expect)) {
        throw new Error(`Invalid tools file: ${toolName}.expect must be an object`);
      }
      const expect = entry.expect;
      rejectUnknownKeys(expect, ['status', 'not_error_code', 'requiredFields', 'maxRows', 'errorCode', 'contains', 'notContains', 'jsonSchema'], `${toolName}.expect`);
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
      if (expect.jsonSchema !== undefined && !isObject(expect.jsonSchema)) {
        throw new Error(`Invalid tools file: ${toolName}.expect.jsonSchema must be an object`);
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
