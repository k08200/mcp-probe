#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import { checkMcpServer } from './checker.js';
import { checkConfigFile } from './config.js';
import { renderBatchTerminal, renderTerminal } from './reporters/terminal.js';
import { renderJson } from './reporters/json-reporter.js';
import { renderGithubActions } from './reporters/github.js';
import type { TransportMode } from './types.js';

const program = new Command();

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parseHeaders(values: string[]): Record<string, string> | undefined {
  if (values.length === 0) return undefined;
  const headers: Record<string, string> = {};
  for (const value of values) {
    const colon = value.indexOf(':');
    if (colon <= 0) {
      throw new Error(`Invalid header: ${value}. Use "Name: value".`);
    }
    const name = value.slice(0, colon).trim();
    const headerValue = value.slice(colon + 1).trim();
    if (!name || !headerValue) {
      throw new Error(`Invalid header: ${value}. Use "Name: value".`);
    }
    headers[name] = headerValue;
  }
  return headers;
}

function parseTransport(value: string | undefined): TransportMode | undefined {
  if (!value) return undefined;
  if (value === 'stdio' || value === 'http' || value === 'sse') return value;
  throw new Error('Transport must be "stdio", "http", or "sse".');
}

program
  .name('mcp-probe')
  .description('Quality checker for MCP servers')
  .version('0.7.0')
  .argument('[target]', 'npm package, local file path, or remote MCP URL')
  .argument('[server-args...]', 'extra arguments passed directly to the MCP server')
  .option('-o, --output <format>', 'output format: terminal | json', 'terminal')
  .option('-t, --timeout <ms>', 'connection timeout in ms', '10000')
  .option('-c, --config <path>', 'batch config JSON file')
  .option('--transport <mode>', 'transport mode: stdio | http | sse')
  .option('-H, --header <header>', 'HTTP header for remote MCP servers, e.g. "Authorization: Bearer TOKEN"', collect, [])
  .option('--github-summary', 'write GitHub Actions job summary and annotations')
  .option('--probe-tools', 'call each tool to validate the full call path (auto-discovers .mcp-probe.json)')
  .option('--tools-file <path>', 'path to sidecar JSON with declared tool inputs (implies --probe-tools)')
  .action(async (
    target: string | undefined,
    serverArgs: string[],
    opts: { output: string; timeout: string; config?: string; transport?: string; header: string[]; githubSummary?: boolean; probeTools?: boolean; toolsFile?: string }
  ) => {
    const timeoutMs = parseInt(opts.timeout, 10);
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      console.error('Timeout must be a positive integer.');
      process.exit(1);
    }
    if (!['terminal', 'json'].includes(opts.output)) {
      console.error('Output format must be "terminal" or "json".');
      process.exit(1);
    }

    let transport: TransportMode | undefined;
    let headers: Record<string, string> | undefined;
    try {
      transport = parseTransport(opts.transport);
      headers = parseHeaders(opts.header);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (opts.config) {
      if (target) {
        console.error('Use either --config or a target, not both.');
        process.exit(1);
      }

      if (opts.output === 'json') {
        try {
          const report = await checkConfigFile(opts.config, timeoutMs);
          if (opts.githubSummary) renderGithubActions(report);
          renderJson(report);
          process.exit(report.overallStatus === 'fail' ? 1 : 0);
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }
        return;
      }

      const spinner = ora(`Checking config ${opts.config}`).start();
      try {
        const report = await checkConfigFile(opts.config, timeoutMs);
        spinner.stop();
        if (opts.githubSummary) renderGithubActions(report);
        renderBatchTerminal(report);
        process.exit(report.overallStatus === 'fail' ? 1 : 0);
      } catch (err) {
        spinner.fail('Unexpected error');
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }

    if (!target) {
      console.error('Missing target. Pass a target or --config <path>.');
      process.exit(1);
    }

    const probeTools = opts.probeTools || !!opts.toolsFile;
    const toolsFile = opts.toolsFile;

    if (opts.output === 'json') {
      const report = await checkMcpServer({ target, serverArgs, timeoutMs, transport, headers, probeTools, toolsFile });
      if (opts.githubSummary) renderGithubActions(report);
      renderJson(report);
      process.exit(report.overallStatus === 'fail' ? 1 : 0);
      return;
    }

    const spinner = ora(`Checking ${target}`).start();
    try {
      const report = await checkMcpServer({ target, serverArgs, timeoutMs, transport, headers, probeTools, toolsFile });
      spinner.stop();
      if (opts.githubSummary) renderGithubActions(report);
      renderTerminal(report);
      process.exit(report.overallStatus === 'fail' ? 1 : 0);
    } catch (err) {
      spinner.fail('Unexpected error');
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
