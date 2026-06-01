#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import { checkMcpServer } from './checker.js';
import { checkConfigFile } from './config.js';
import { renderBatchTerminal, renderTerminal } from './reporters/terminal.js';
import { renderJson } from './reporters/json-reporter.js';
import { renderGithubActions } from './reporters/github.js';
import { writeBadgeFile } from './reporters/badge.js';
import { writeReceiptFile } from './reporters/receipt.js';
import { initProject } from './init.js';
import { runDoctor } from './doctor.js';
import { exitCodeForStatus } from './exit-code.js';
import { VERSION } from './version.js';
import type { TransportMode } from './types.js';

const program = new Command();

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function validateRegex(pattern: string, label: string): void {
  try {
    new RegExp(pattern);
  } catch {
    throw new Error(`Invalid ${label} regex: ${pattern}`);
  }
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

function argValue(long: string, short?: string): string | undefined {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === long || (short && arg === short)) {
      return args[i + 1];
    }
    if (arg.startsWith(`${long}=`)) {
      return arg.slice(long.length + 1);
    }
  }
  return undefined;
}

program
  .name('mcp-probe')
  .description('Quality checker for MCP servers')
  .version(VERSION);

program
  .command('init')
  .description('scaffold mcp-probe config, sidecar inputs, and optional GitHub Actions workflow')
  .requiredOption('--target <target>', 'npm package, local file path, or remote MCP URL')
  .option('--name <name>', 'server name in the generated config')
  .option('--config-file <path>', 'config file to write', 'mcp-probe.config.json')
  .option('--sidecar-file <path>', 'sidecar tools file to write', '.mcp-probe.json')
  .option('--transport <mode>', 'transport mode: stdio | http | sse')
  .option('--header-env <name>', 'environment variable used for Authorization: Bearer ${NAME}')
  .option('--discover', 'connect to the target and scaffold sidecar entries from discovered tools')
  .option('--lock-tools', 'when used with --discover, generate allowedTools to fail on unexpected tool additions')
  .option('--github-actions', 'write .github/workflows/mcp-probe.yml')
  .option('--workflow-file <path>', 'GitHub Actions workflow file to write', '.github/workflows/mcp-probe.yml')
  .option('--force', 'overwrite existing files')
  .action(async (opts: {
    target: string;
    name?: string;
    configFile: string;
    sidecarFile: string;
    transport?: string;
    headerEnv?: string;
    discover?: boolean;
    lockTools?: boolean;
    githubActions?: boolean;
    workflowFile: string;
    force?: boolean;
  }) => {
    try {
      const transport = parseTransport(opts.transport);
      const headers = opts.headerEnv && process.env[opts.headerEnv]
        ? { Authorization: `Bearer ${process.env[opts.headerEnv]}` }
        : undefined;
      const discoveredTools = opts.discover
        ? (await checkMcpServer({
            target: opts.target,
            timeoutMs: 10000,
            transport,
            headers,
          })).tools
        : undefined;

      const result = initProject({
        target: opts.target,
        name: opts.name,
        configFile: opts.configFile,
        toolsFile: opts.sidecarFile,
        workflowFile: opts.workflowFile,
        githubActions: Boolean(opts.githubActions),
        force: Boolean(opts.force),
        transport,
        headerEnv: opts.headerEnv,
        discoveredTools,
        lockTools: Boolean(opts.lockTools),
      });

      for (const file of result.files) {
        console.log(`${file.status === 'created' ? 'created' : 'skipped'} ${file.path}`);
      }
      console.log('');
      const next = opts.discover
        ? `Next: review ${opts.sidecarFile} and replace schema-derived samples with safe real inputs.`
        : `Next: edit ${opts.sidecarFile} with real tool names and safe sample inputs.`;
      console.log(next);
      console.log(`Run:  npx @k08200/mcp-probe@latest --config ${opts.configFile} --github-summary --fail-on-warn --receipt-file mcp-probe.receipt.json`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('check whether the current project is ready to use mcp-probe in CI')
  .option('--config-file <path>', 'config file to inspect', 'mcp-probe.config.json')
  .option('--fix', 'create missing config, sidecar, and GitHub Actions workflow files when possible')
  .option('--target <target>', 'server target to use when --fix creates a missing config file')
  .option('--tools-file <path>', 'sidecar tools file to create when --fix creates a missing config file', '.mcp-probe.json')
  .option('--workflow-file <path>', 'GitHub Actions workflow file to create when --fix is enabled', '.github/workflows/mcp-probe.yml')
  .option('--force', 'overwrite existing workflow/config/sidecar files when fixing')
  .option('--fail-on-warn', 'exit non-zero when doctor reports warnings')
  .option('-o, --output <format>', 'output format: terminal | json', 'terminal')
  .action((opts: {
    configFile?: string;
    fix?: boolean;
    target?: string;
    toolsFile?: string;
    workflowFile?: string;
    force?: boolean;
    output?: string;
    failOnWarn?: boolean;
  }) => {
    const configFile = opts.configFile ?? 'mcp-probe.config.json';
    const output = argValue('--output', '-o') ?? opts.output ?? 'terminal';
    if (!['terminal', 'json'].includes(output)) {
      console.error('Output format must be "terminal" or "json".');
      process.exit(1);
    }

    const report = runDoctor({
      configFile,
      fix: Boolean(opts.fix),
      target: opts.target,
      toolsFile: opts.toolsFile,
      workflowFile: opts.workflowFile,
      force: Boolean(opts.force),
    });
    if (output === 'json') {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      console.log('');
      console.log('mcp-probe doctor');
      console.log('────────────────────────────────────────────────────');
      for (const check of report.checks) {
        const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
        console.log(`  ${icon}  ${check.name}`);
        console.log(`     ${check.message}`);
      }
      console.log('────────────────────────────────────────────────────');
      console.log(`  ${report.overallStatus.toUpperCase()}`);
      console.log('');
    }
    process.exit(exitCodeForStatus(report.overallStatus, Boolean(opts.failOnWarn)));
  });

program
  .argument('[target]', 'npm package, local file path, or remote MCP URL')
  .argument('[server-args...]', 'extra arguments passed directly to the MCP server')
  .option('-o, --output <format>', 'output format: terminal | json', 'terminal')
  .option('-t, --timeout <ms>', 'connection timeout in ms', '10000')
  .option('-c, --config <path>', 'batch config JSON file')
  .option('--transport <mode>', 'transport mode: stdio | http | sse')
  .option('-H, --header <header>', 'HTTP header for remote MCP servers, e.g. "Authorization: Bearer TOKEN"', collect, [])
  .option('--stderr-allow <pattern>', 'stderr regex to ignore when classifying startup failures', collect, [])
  .option('--stderr-fatal <pattern>', 'stderr regex to always treat as the startup failure reason', collect, [])
  .option('--expect-tool <name>', 'tool name that must be present in tools/list', collect, [])
  .option('--allow-tool <name>', 'tool name allowed in tools/list; when present, unlisted tools fail the catalog check', collect, [])
  .option('--forbid-tool <name>', 'tool name that must not be present in tools/list', collect, [])
  .option('--github-summary', 'write GitHub Actions job summary and annotations')
  .option('--badge-file <path>', 'write shields.io endpoint JSON for README/status badges')
  .option('--receipt-file <path>', 'write an independent JSON readiness receipt artifact')
  .option('--fail-on-warn', 'exit non-zero when the report contains warnings')
  .option('--probe-tools', 'call each tool to validate the full call path (auto-discovers .mcp-probe.json)')
  .option('--tools-file <path>', 'path to sidecar JSON with declared tool inputs (implies --probe-tools)')
  .action(async (
    target: string | undefined,
    serverArgs: string[],
    opts: {
      output: string;
      timeout: string;
      config?: string;
      transport?: string;
      header: string[];
      stderrAllow: string[];
      stderrFatal: string[];
      expectTool: string[];
      allowTool: string[];
      forbidTool: string[];
      githubSummary?: boolean;
      badgeFile?: string;
      receiptFile?: string;
      failOnWarn?: boolean;
      probeTools?: boolean;
      toolsFile?: string;
    }
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
      for (const pattern of opts.stderrAllow) validateRegex(pattern, '--stderr-allow');
      for (const pattern of opts.stderrFatal) validateRegex(pattern, '--stderr-fatal');
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    const stderr = opts.stderrAllow.length > 0 || opts.stderrFatal.length > 0
      ? { allow: opts.stderrAllow, fatal: opts.stderrFatal }
      : undefined;

    if (opts.config) {
      if (target) {
        console.error('Use either --config or a target, not both.');
        process.exit(1);
      }

      if (opts.output === 'json') {
        try {
          const report = await checkConfigFile(opts.config, timeoutMs);
          if (opts.githubSummary) renderGithubActions(report);
          if (opts.badgeFile) writeBadgeFile(report, opts.badgeFile);
          if (opts.receiptFile) writeReceiptFile(report, opts.receiptFile);
          renderJson(report);
          process.exit(exitCodeForStatus(report.overallStatus, Boolean(opts.failOnWarn)));
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
        if (opts.badgeFile) writeBadgeFile(report, opts.badgeFile);
        if (opts.receiptFile) writeReceiptFile(report, opts.receiptFile);
        renderBatchTerminal(report);
        process.exit(exitCodeForStatus(report.overallStatus, Boolean(opts.failOnWarn)));
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
    const checkOptions = {
      target,
      serverArgs,
      timeoutMs,
      transport,
      headers,
      stderr,
      expectedTools: opts.expectTool,
      allowedTools: opts.allowTool,
      forbiddenTools: opts.forbidTool,
      probeTools,
      toolsFile,
    };

    if (opts.output === 'json') {
      const report = await checkMcpServer(checkOptions);
      if (opts.githubSummary) renderGithubActions(report);
      if (opts.badgeFile) writeBadgeFile(report, opts.badgeFile);
      if (opts.receiptFile) writeReceiptFile(report, opts.receiptFile);
      renderJson(report);
      process.exit(exitCodeForStatus(report.overallStatus, Boolean(opts.failOnWarn)));
      return;
    }

    const spinner = ora(`Checking ${target}`).start();
    try {
      const report = await checkMcpServer(checkOptions);
      spinner.stop();
      if (opts.githubSummary) renderGithubActions(report);
      if (opts.badgeFile) writeBadgeFile(report, opts.badgeFile);
      if (opts.receiptFile) writeReceiptFile(report, opts.receiptFile);
      renderTerminal(report);
      process.exit(exitCodeForStatus(report.overallStatus, Boolean(opts.failOnWarn)));
    } catch (err) {
      spinner.fail('Unexpected error');
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
