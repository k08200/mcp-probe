#!/usr/bin/env node
import { Command } from 'commander';
import ora from 'ora';
import { checkMcpServer } from './checker.js';
import { renderTerminal } from './reporters/terminal.js';
import { renderJson } from './reporters/json-reporter.js';

const program = new Command();

program
  .name('mcp-check')
  .description('Quality checker for MCP servers')
  .version('0.1.0')
  .argument('<target>', 'npm package, npx-style command, or local file path')
  .argument('[server-args...]', 'extra arguments passed directly to the MCP server')
  .option('-o, --output <format>', 'output format: terminal | json', 'terminal')
  .option('-t, --timeout <ms>', 'connection timeout in ms', '10000')
  .action(async (
    target: string,
    serverArgs: string[],
    opts: { output: string; timeout: string }
  ) => {
    const timeoutMs = parseInt(opts.timeout, 10);

    if (opts.output === 'json') {
      const report = await checkMcpServer({ target, serverArgs, timeoutMs });
      renderJson(report);
      process.exit(report.overallStatus === 'fail' ? 1 : 0);
      return;
    }

    const spinner = ora(`Checking ${target}`).start();
    try {
      const report = await checkMcpServer({ target, serverArgs, timeoutMs });
      spinner.stop();
      renderTerminal(report);
      process.exit(report.overallStatus === 'fail' ? 1 : 0);
    } catch (err) {
      spinner.fail('Unexpected error');
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program.parse();
