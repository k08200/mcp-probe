import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../src/doctor.js';

describe('runDoctor', () => {
  it('warns when config is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('warn');
      expect(report.checks.find((check) => check.name === 'Config file')?.status).toBe('warn');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes when config, sidecar, and workflow are present', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      writeFileSync('mcp-probe.config.json', JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            toolsFile: '.mcp-probe.json',
          },
        ],
      }));
      writeFileSync('.mcp-probe.json', JSON.stringify({
        tools: {
          echo: {
            input: { message: 'hello' },
          },
        },
      }));
      mkdirSync(join('.github', 'workflows'), { recursive: true });
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), 'run: npx @k08200/mcp-probe --config mcp-probe.config.json');

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('pass');
      expect(report.checks.map((check) => check.status)).toEqual(['pass', 'pass', 'pass', 'pass']);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('resolves sidecar paths relative to the config file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const nested = join(dir, 'ci');
    const cwd = process.cwd();
    mkdirSync(nested, { recursive: true });
    process.chdir(dir);

    try {
      writeFileSync(join(nested, 'mcp-probe.config.json'), JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            toolsFile: './tools.json',
          },
        ],
      }));
      writeFileSync(join(nested, 'tools.json'), JSON.stringify({
        tools: {
          echo: {
            input: { message: 'hello' },
          },
        },
      }));

      const report = runDoctor({ configFile: join(nested, 'mcp-probe.config.json') });
      expect(report.checks.find((check) => check.name.includes('tools.json'))?.status).toBe('pass');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails for invalid sidecar files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      writeFileSync('mcp-probe.config.json', JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            toolsFile: '.mcp-probe.json',
          },
        ],
      }));
      writeFileSync('.mcp-probe.json', JSON.stringify({
        tools: {
          echo: {
            input: [],
          },
        },
      }));

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('fail');
      expect(report.checks.find((check) => check.name.includes('.mcp-probe.json'))?.message).toContain('echo.input must be an object');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
