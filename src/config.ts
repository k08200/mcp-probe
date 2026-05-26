import { dirname, isAbsolute, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { checkMcpServer } from './checker.js';
import type { BatchReport, CheckOptions, CheckStatus, ConfigServer, ProbeConfig } from './types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new Error(`Invalid config: ${label} contains unknown field${unknown.length === 1 ? '' : 's'} ${unknown.join(', ')}`);
  }
}

function validateServer(server: unknown, index: number): ConfigServer {
  if (!isObject(server)) {
    throw new Error(`Invalid config: servers[${index}] must be an object`);
  }

  rejectUnknownKeys(
    server,
    ['name', 'target', 'serverArgs', 'timeoutMs', 'transport', 'headers', 'stderr', 'probeTools', 'toolsFile'],
    `servers[${index}]`
  );

  if (typeof server.name !== 'string' || server.name.length === 0) {
    throw new Error(`Invalid config: servers[${index}].name must be a non-empty string`);
  }
  if (typeof server.target !== 'string' || server.target.length === 0) {
    throw new Error(`Invalid config: servers[${index}].target must be a non-empty string`);
  }
  if (server.serverArgs !== undefined && (!Array.isArray(server.serverArgs) || !server.serverArgs.every((arg) => typeof arg === 'string'))) {
    throw new Error(`Invalid config: servers[${index}].serverArgs must be a string array`);
  }
  if (server.timeoutMs !== undefined && (typeof server.timeoutMs !== 'number' || server.timeoutMs <= 0)) {
    throw new Error(`Invalid config: servers[${index}].timeoutMs must be a positive number`);
  }
  if (server.transport !== undefined && !['stdio', 'http', 'sse'].includes(String(server.transport))) {
    throw new Error(`Invalid config: servers[${index}].transport must be stdio, http, or sse`);
  }
  if (server.headers !== undefined) {
    if (!isObject(server.headers)) {
      throw new Error(`Invalid config: servers[${index}].headers must be an object`);
    }
    for (const [key, value] of Object.entries(server.headers)) {
      if (typeof value !== 'string') {
        throw new Error(`Invalid config: servers[${index}].headers.${key} must be a string`);
      }
    }
  }
  if (server.stderr !== undefined) {
    if (!isObject(server.stderr)) {
      throw new Error(`Invalid config: servers[${index}].stderr must be an object`);
    }
    const stderr = server.stderr as Record<string, unknown>;
    rejectUnknownKeys(stderr, ['allow', 'fatal'], `servers[${index}].stderr`);
    for (const key of ['allow', 'fatal']) {
      const value = stderr[key];
      if (value !== undefined && (!Array.isArray(value) || !value.every((pattern) => typeof pattern === 'string'))) {
        throw new Error(`Invalid config: servers[${index}].stderr.${key} must be a string array`);
      }
      for (const pattern of (value as string[] | undefined) ?? []) {
        try {
          new RegExp(pattern);
        } catch {
          throw new Error(`Invalid config: servers[${index}].stderr.${key} contains invalid regex: ${pattern}`);
        }
      }
    }
  }
  if (server.probeTools !== undefined && typeof server.probeTools !== 'boolean') {
    throw new Error(`Invalid config: servers[${index}].probeTools must be a boolean`);
  }
  if (server.toolsFile !== undefined && typeof server.toolsFile !== 'string') {
    throw new Error(`Invalid config: servers[${index}].toolsFile must be a string`);
  }

  return server as ConfigServer;
}

export function loadConfig(configFile: string): ProbeConfig {
  if (!existsSync(configFile)) {
    throw new Error(`Cannot read config file: ${configFile}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configFile, 'utf8'));
  } catch {
    throw new Error(`Invalid config JSON: ${configFile}`);
  }

  if (!isObject(parsed)) {
    throw new Error(`Invalid config: root must be an object`);
  }
  rejectUnknownKeys(parsed, ['$schema', 'timeoutMs', 'servers'], 'root');
  if (parsed.timeoutMs !== undefined && (typeof parsed.timeoutMs !== 'number' || parsed.timeoutMs <= 0)) {
    throw new Error(`Invalid config: timeoutMs must be a positive number`);
  }
  if (!Array.isArray(parsed.servers) || parsed.servers.length === 0) {
    throw new Error(`Invalid config: servers must be a non-empty array`);
  }

  return {
    timeoutMs: parsed.timeoutMs as number | undefined,
    servers: parsed.servers.map(validateServer),
  };
}

function deriveOverallStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes('fail')) return 'fail';
  if (statuses.includes('warn')) return 'warn';
  return 'pass';
}

function resolveConfigPath(configFile: string, maybeRelative: string | undefined): string | undefined {
  if (!maybeRelative || isAbsolute(maybeRelative)) return maybeRelative;
  return resolve(dirname(configFile), maybeRelative);
}

function expandEnvVars(value: string): string {
  return value.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/gi, (match, name: string) => {
    const envValue = process.env[name];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${name} is not set`);
    }
    return envValue;
  });
}

function expandHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!headers) return undefined;
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, expandEnvVars(value)])
  );
}

export async function checkConfigFile(configFile: string, defaultTimeoutMs = 10000): Promise<BatchReport> {
  const startTime = Date.now();
  const config = loadConfig(configFile);
  const servers = [];

  for (const server of config.servers) {
    const options: CheckOptions = {
      target: server.target,
      serverArgs: server.serverArgs,
      timeoutMs: server.timeoutMs ?? config.timeoutMs ?? defaultTimeoutMs,
      transport: server.transport,
      headers: expandHeaders(server.headers),
      stderr: server.stderr,
      probeTools: server.probeTools,
      toolsFile: resolveConfigPath(configFile, server.toolsFile),
    };

    servers.push({
      name: server.name,
      report: await checkMcpServer(options),
    });
  }

  return {
    target: configFile,
    timestamp: new Date().toISOString(),
    overallStatus: deriveOverallStatus(servers.map((server) => server.report.overallStatus)),
    servers,
    totalLatencyMs: Date.now() - startTime,
  };
}
