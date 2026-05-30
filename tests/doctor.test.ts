import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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

  it('fixes a missing project setup when target is provided', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      const report = runDoctor({
        configFile: 'mcp-probe.config.json',
        fix: true,
        target: '@modelcontextprotocol/server-memory',
      });

      expect(report.overallStatus).toBe('pass');
      expect(existsSync('mcp-probe.config.json')).toBe(true);
      expect(existsSync('.mcp-probe.json')).toBe(true);
      expect(existsSync(join('.github', 'workflows', 'mcp-probe.yml'))).toBe(true);
      expect(readFileSync(join('.github', 'workflows', 'mcp-probe.yml'), 'utf8')).toContain('--github-summary');
      expect(readFileSync(join('.github', 'workflows', 'mcp-probe.yml'), 'utf8')).toContain('--fail-on-warn');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not create a missing config without a target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      const report = runDoctor({ configFile: 'mcp-probe.config.json', fix: true });
      expect(report.overallStatus).toBe('warn');
      expect(existsSync('mcp-probe.config.json')).toBe(false);
      expect(report.checks.find((check) => check.name === 'Fix config file')?.message).toContain('--target');
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
            expectedTools: ['echo'],
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
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  - run: npx @k08200/mcp-probe --config mcp-probe.config.json --github-summary --fail-on-warn --receipt-file mcp-probe.receipt.json
  - uses: actions/upload-artifact@v4
    with:
      name: mcp-probe-receipt
      path: mcp-probe.receipt.json
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('pass');
      expect(report.checks.map((check) => check.status)).toEqual(['pass', 'pass', 'pass', 'pass', 'pass']);
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when workflow mentions mcp-probe but misses recommended CI flags', () => {
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
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v4
  - run: npx @k08200/mcp-probe ./server.js
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const workflow = report.checks.find((check) => check.name === 'GitHub Actions workflow');
      expect(report.overallStatus).toBe('warn');
      expect(workflow?.status).toBe('warn');
      expect(workflow?.message).toContain('actions/checkout@v6');
      expect(workflow?.message).toContain('--config mcp-probe.config.json');
      expect(workflow?.message).toContain('--github-summary');
      expect(workflow?.message).toContain('--fail-on-warn');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when workflow only mentions mcp-probe outside a run step', () => {
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
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  # mcp-probe --config mcp-probe.config.json --github-summary
  - run: echo "tests pass"
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const workflow = report.checks.find((check) => check.name === 'GitHub Actions workflow');
      expect(report.overallStatus).toBe('warn');
      expect(workflow?.status).toBe('warn');
      expect(workflow?.message).toContain('No workflow run step executes mcp-probe');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('ignores mcp-probe text when it only appears in a file argument', () => {
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
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  - run: echo mcp-probe-badge.json
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const workflow = report.checks.find((check) => check.name === 'GitHub Actions workflow');
      expect(report.overallStatus).toBe('warn');
      expect(workflow?.status).toBe('warn');
      expect(workflow?.message).toContain('No workflow run step executes mcp-probe');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns when required flags are split across different mcp-probe run steps', () => {
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
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  - run: npx @k08200/mcp-probe --config mcp-probe.config.json
  - run: npx @k08200/mcp-probe ./server.js --github-summary --fail-on-warn --receipt-file mcp-probe.receipt.json
  - uses: actions/upload-artifact@v4
    with:
      name: mcp-probe-receipt
      path: mcp-probe.receipt.json
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const workflow = report.checks.find((check) => check.name === 'GitHub Actions workflow');
      expect(report.overallStatus).toBe('warn');
      expect(workflow?.status).toBe('warn');
      expect(workflow?.message).toContain('no single run step includes');
      expect(workflow?.message).toContain('--config mcp-probe.config.json');
      expect(workflow?.message).toContain('--github-summary');
      expect(workflow?.message).toContain('--fail-on-warn');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not rewrite an existing incomplete mcp-probe workflow without force', () => {
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
      const workflowFile = join('.github', 'workflows', 'mcp-probe.yml');
      writeFileSync(workflowFile, `
steps:
  - uses: actions/checkout@v4
  - run: npx @k08200/mcp-probe ./server.js
`);

      const original = readFileSync(workflowFile, 'utf8');
      const report = runDoctor({ configFile: 'mcp-probe.config.json', fix: true });
      const workflow = readFileSync(workflowFile, 'utf8');

      expect(report.overallStatus).toBe('warn');
      expect(workflow).toBe(original);
      expect(report.checks.find((check) => check.name === `Fix ${workflowFile}`)?.message).toContain('not rewriting');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fixes missing sidecar and workflow files for an existing config', () => {
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

      const report = runDoctor({ configFile: 'mcp-probe.config.json', fix: true });
      expect(report.overallStatus).toBe('pass');
      expect(existsSync('.mcp-probe.json')).toBe(true);
      expect(existsSync(join('.github', 'workflows', 'mcp-probe.yml'))).toBe(true);

      const sidecar = JSON.parse(readFileSync('.mcp-probe.json', 'utf8'));
      expect(sidecar.tools.replace_with_tool_name.input).toEqual({});
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fixes missing sidecar files with configured expected tool names', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      writeFileSync('mcp-probe.config.json', JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            expectedTools: ['query', 'search'],
            toolsFile: '.mcp-probe.json',
          },
        ],
      }));

      const report = runDoctor({ configFile: 'mcp-probe.config.json', fix: true });
      expect(report.overallStatus).toBe('pass');

      const sidecar = JSON.parse(readFileSync('.mcp-probe.json', 'utf8'));
      expect(sidecar.tools.query.input).toEqual({});
      expect(sidecar.tools.search.input).toEqual({});
      expect(sidecar.tools.replace_with_tool_name).toBeUndefined();
      expect(report.checks.find((check) => check.name === 'Expected tool coverage fixture')?.status).toBe('pass');
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

  it('fails for invalid sidecar expectation fields', () => {
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
            input: {},
            expect: {
              maxRows: '100',
            },
          },
        },
      }));

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('fail');
      expect(report.checks.find((check) => check.name.includes('.mcp-probe.json'))?.message).toContain('echo.expect.maxRows');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails for unknown sidecar fields', () => {
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
            input: {},
            expectations: {
              status: 'pass',
            },
          },
        },
      }));

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      expect(report.overallStatus).toBe('fail');
      expect(report.checks.find((check) => check.name.includes('.mcp-probe.json'))?.message).toContain('echo contains unknown field expectations');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when expectedTools are configured without a toolsFile', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      writeFileSync('mcp-probe.config.json', JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            expectedTools: ['query'],
          },
        ],
      }));
      mkdirSync(join('.github', 'workflows'), { recursive: true });
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  - run: npx @k08200/mcp-probe --config mcp-probe.config.json --github-summary --fail-on-warn
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const coverage = report.checks.find((check) => check.name === 'Expected tool coverage fixture');
      expect(report.overallStatus).toBe('fail');
      expect(coverage?.status).toBe('fail');
      expect(coverage?.message).toContain('expectedTools configured but no toolsFile is set');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when expectedTools are missing sidecar samples', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mcp-probe-doctor-'));
    const cwd = process.cwd();
    process.chdir(dir);

    try {
      writeFileSync('mcp-probe.config.json', JSON.stringify({
        servers: [
          {
            name: 'fixture',
            target: './server.js',
            expectedTools: ['query', 'search'],
            toolsFile: '.mcp-probe.json',
          },
        ],
      }));
      writeFileSync('.mcp-probe.json', JSON.stringify({
        tools: {
          query: {
            input: { sql: 'select 1' },
          },
        },
      }));
      mkdirSync(join('.github', 'workflows'), { recursive: true });
      writeFileSync(join('.github', 'workflows', 'mcp-probe.yml'), `
steps:
  - uses: actions/checkout@v6
  - run: npx @k08200/mcp-probe --config mcp-probe.config.json --github-summary --fail-on-warn
`);

      const report = runDoctor({ configFile: 'mcp-probe.config.json' });
      const coverage = report.checks.find((check) => check.name === 'Expected tool coverage fixture');
      expect(report.overallStatus).toBe('fail');
      expect(coverage?.status).toBe('fail');
      expect(coverage?.message).toContain('missing sidecar samples for expected tools: search');
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
