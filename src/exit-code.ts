import type { CheckStatus } from './types.js';

export function exitCodeForStatus(status: CheckStatus, failOnWarn = false): number {
  if (status === 'fail') return 1;
  if (failOnWarn && status === 'warn') return 1;
  return 0;
}
