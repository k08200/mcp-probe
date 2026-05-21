import type { CheckItem, Issue, ToolCallResult } from './types.js';

const DOCS_BASE = 'https://github.com/k08200/mcp-probe#';

function lower(value: string | undefined): string {
  return (value ?? '').toLowerCase();
}

function isAuthLike(message: string | undefined): boolean {
  return /401|403|unauthorized|forbidden|oauth|auth|permission/i.test(message ?? '');
}

function isTimeout(message: string | undefined): boolean {
  return /timed out|timeout/i.test(message ?? '');
}

export function issueForToolCall(result: ToolCallResult): Issue | undefined {
  if (result.status === 'pass') return undefined;

  if (isAuthLike(result.error)) {
    return {
      code: 'TOOL_CALL_AUTH',
      hint: 'The server registered this tool, but the call path hit auth or permission handling. Check OAuth/browser handoff, service tokens, and CI secrets.',
      docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
    };
  }

  if (isTimeout(result.error)) {
    return {
      code: 'TOOL_CALL_TIMEOUT',
      hint: 'The tool call timed out. Increase --timeout if the downstream service is slow, or add a safer sidecar input that reaches a fast read-only path.',
      docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
    };
  }

  if (result.source === 'auto') {
    return {
      code: 'AUTO_DRY_RUN_INPUT',
      hint: 'The auto-generated schema-minimum input failed. Add a .mcp-probe.json sidecar with realistic read-only sample inputs for this tool.',
      docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
    };
  }

  return {
    code: 'TOOL_CALL_FAILED',
    hint: 'The sidecar input reached tools/call but returned an error. Verify the sample input is safe, valid for this environment, and exercises a real read-only path.',
    docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
  };
}

export function issueForCheck(check: CheckItem): Issue | undefined {
  if (check.status === 'pass') return undefined;

  const message = lower(check.message);

  if (check.name === 'Tools discovery') {
    return {
      code: 'NO_TOOLS',
      hint: 'The server responded but did not expose tools. If this is expected, it may be a resources/prompts-only server; otherwise check the server registration code.',
      docsUrl: `${DOCS_BASE}what-it-checks`,
    };
  }

  if (check.name === 'Tool schema validation') {
    return {
      code: 'TOOL_SCHEMA_INVALID',
      hint: 'At least one discovered tool has an invalid schema. Make sure every MCP tool has a stable name and valid input schema.',
      docsUrl: `${DOCS_BASE}what-it-checks`,
    };
  }

  if (check.name === 'Tool sidecar') {
    if (message.includes('cannot read')) {
      return {
        code: 'SIDECAR_MISSING',
        hint: 'The configured tools file does not exist. Run mcp-probe init --discover or fix the --tools-file / toolsFile path.',
        docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
      };
    }

    return {
      code: 'SIDECAR_INVALID',
      hint: 'The tools sidecar is not valid JSON or does not match the expected shape. Validate it against schemas/mcp-probe.sidecar.schema.json.',
      docsUrl: `${DOCS_BASE}batch-ci-gate`,
    };
  }

  if (check.name === 'MCP protocol handshake') {
    if (isTimeout(check.message)) {
      return {
        code: 'HANDSHAKE_TIMEOUT',
        hint: 'The server did not complete initialize before the timeout. Increase --timeout or inspect server startup latency and dependency loading.',
        docsUrl: `${DOCS_BASE}usage`,
      };
    }

    if (isAuthLike(check.message)) {
      return {
        code: 'HANDSHAKE_AUTH',
        hint: 'The server failed during initialization with an auth-like error. Check required environment variables, tokens, or remote headers.',
        docsUrl: `${DOCS_BASE}usage`,
      };
    }

    if (message.includes('enoent') || message.includes('spawn') || message.includes('not found')) {
      return {
        code: 'TARGET_NOT_FOUND',
        hint: 'mcp-probe could not start the target. Check the package name, local path, executable, and server arguments.',
        docsUrl: `${DOCS_BASE}usage`,
      };
    }

    return {
      code: 'HANDSHAKE_FAILED',
      hint: 'The target started but did not complete the MCP initialize handshake. Run with the same server arguments locally and inspect stderr.',
      docsUrl: `${DOCS_BASE}stderr-classification`,
    };
  }

  if (check.name === 'Tool call dry-run') {
    return {
      code: check.status === 'warn' ? 'TOOL_CALL_AUTH' : 'TOOL_CALL_FAILED',
      hint: check.status === 'warn'
        ? 'At least one tool call hit auth or permission handling. This often means CI needs tokens or the server needs non-browser auth.'
        : 'At least one tool call failed. Inspect toolCallResults in JSON output for the exact tool and add or refine sidecar inputs.',
      docsUrl: `${DOCS_BASE}tool-call-dry-runs`,
    };
  }

  return undefined;
}

export function withIssue<T extends CheckItem | ToolCallResult>(item: T): T {
  const issue = 'name' in item ? issueForCheck(item) : issueForToolCall(item);
  return issue ? { ...item, issue } : item;
}
