import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { issueForCheck, issueForToolCall } from '../src/issues.js';

const README = readFileSync('README.md', 'utf8');

function headingAnchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function readmeAnchors(): Set<string> {
  const anchors = new Set<string>();
  for (const line of README.split('\n')) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) anchors.add(headingAnchor(match[1]));
  }
  return anchors;
}

function assertReadmeUrl(url: string | undefined): void {
  expect(url).toBeDefined();
  const anchor = url?.split('#')[1];
  expect(readmeAnchors()).toContain(anchor);
}

describe('issue docs links', () => {
  it('points check issue docs URLs at existing README headings', () => {
    const checks = [
      { name: 'Tools discovery', status: 'warn' as const, message: 'No tools registered' },
      { name: 'Tool schema validation', status: 'warn' as const, message: '1 tool missing name' },
      { name: 'Tool sidecar', status: 'fail' as const, message: 'Cannot read tools file: missing.json' },
      { name: 'MCP protocol handshake', status: 'fail' as const, message: 'Connection timed out after 1000ms' },
      { name: 'Tool call dry-run', status: 'fail' as const, message: '1 contract assertion failed' },
    ];

    for (const check of checks) {
      assertReadmeUrl(issueForCheck(check)?.docsUrl);
    }
  });

  it('points tool-call issue docs URLs at existing README headings', () => {
    const toolResults = [
      { tool: 'search', status: 'warn' as const, latencyMs: 1, source: 'sidecar' as const, error: '401 Unauthorized' },
      { tool: 'search', status: 'fail' as const, latencyMs: 1, source: 'auto' as const, error: 'Bad input' },
      {
        tool: 'query',
        status: 'fail' as const,
        latencyMs: 1,
        source: 'sidecar' as const,
        assertions: [{ name: 'requiredFields.rowCount', status: 'fail' as const, message: 'Missing rowCount' }],
      },
    ];

    for (const result of toolResults) {
      assertReadmeUrl(issueForToolCall(result)?.docsUrl);
    }
  });
});
