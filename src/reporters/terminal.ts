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
  console.log(chalk.bold.white('mcp-check') + '  ' + chalk.dim(report.target));
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

  console.log('');
  const status = report.overallStatus;
  const label = COLORS[status](chalk.bold(status.toUpperCase()));
  const total = chalk.dim(`  ${report.totalLatencyMs}ms total`);
  console.log(`  ${ICONS[status]}  ${label}${total}`);
  console.log('');
}
