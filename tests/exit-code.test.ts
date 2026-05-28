import { describe, expect, it } from 'vitest';
import { exitCodeForStatus } from '../src/exit-code.js';

describe('exitCodeForStatus', () => {
  it('returns zero for pass', () => {
    expect(exitCodeForStatus('pass')).toBe(0);
    expect(exitCodeForStatus('pass', true)).toBe(0);
  });

  it('allows warnings by default and fails them in strict mode', () => {
    expect(exitCodeForStatus('warn')).toBe(0);
    expect(exitCodeForStatus('warn', true)).toBe(1);
  });

  it('always fails failures', () => {
    expect(exitCodeForStatus('fail')).toBe(1);
  });
});
