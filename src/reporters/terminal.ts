import chalk from 'chalk';
import type { CheckReport, CheckStatus } from '../types.js';

const ICONS: Record<CheckStatus, string> = {
  pass: chalk.green('✓'),
  fail: chalk.red('✗'),
  warn: chalk.yellow('⚠'),
};

const COLORS: Record<CheckStatus, (s: string) => string> = {
  pass: chalk.green,
  fail: chalk.red,
  warn: chalk.yellow,
};

const DIVIDER = chalk.dim('─'.repeat(52));

export function renderTerminal(report: CheckReport): void {
  console.log('');
  console.log(chalk.bold.white('mcp-probe') + '  ' + chalk.dim(report.target));
  console.log(DIVIDER);

  for (const check of report.checks) {
    const latency = check.latencyMs !== undefined
      ? chalk.dim(` ${check.latencyMs}ms`)
      : '';
    console.log(`  ${ICONS[check.status]}  ${chalk.bold(check.name)}${latency}`);
    console.log(`     ${chalk.dim(check.message)}`);
  }

  console.log(DIVIDER);

  if (report.serverInfo) {
    const { name, version, capabilities } = report.serverInfo;
    console.log(chalk.dim(`  Server   ${name} v${version}`));
    if (capabilities.length > 0) {
      console.log(chalk.dim(`  Caps     ${capabilities.join(', ')}`));
    }
  }

  if (report.tools.length > 0) {
    console.log('');
    console.log(chalk.bold('  Tools'));
    for (const tool of report.tools) {
      const desc = tool.description ? chalk.dim(`  ${tool.description}`) : '';
      console.log(`    ${chalk.cyan('▸')} ${chalk.bold(tool.name)}${desc}`);
    }
  }

  if (report.resources.length > 0) {
    console.log('');
    console.log(chalk.bold('  Resources'));
    for (const res of report.resources) {
      const label = res.name ?? res.uri;
      const desc = res.description ? chalk.dim(`  ${res.description}`) : '';
      console.log(`    ${chalk.magenta('▸')} ${chalk.bold(label)}${desc}`);
    }
  }

  if (report.prompts.length > 0) {
    console.log('');
    console.log(chalk.bold('  Prompts'));
    for (const prompt of report.prompts) {
      const desc = prompt.description ? chalk.dim(`  ${prompt.description}`) : '';
      console.log(`    ${chalk.yellow('▸')} ${chalk.bold(prompt.name)}${desc}`);
    }
  }

  if (report.toolCallResults && report.toolCallResults.length > 0) {
    console.log('');
    console.log(chalk.bold('  Tool Call Dry-run'));
    for (const r of report.toolCallResults) {
      const icon = ICONS[r.status];
      const latency = chalk.dim(` ${r.latencyMs}ms`);
      const err = r.error ? chalk.dim(`  — ${r.error.slice(0, 80)}`) : '';
      console.log(`    ${icon} ${chalk.bold(r.tool)}${latency}${err}`);
    }
  }

  console.log('');
  const status = report.overallStatus;
  const label = COLORS[status](chalk.bold(status.toUpperCase()));
  const total = chalk.dim(`  ${report.totalLatencyMs}ms total`);
  console.log(`  ${ICONS[status]}  ${label}${total}`);
  console.log('');
}
