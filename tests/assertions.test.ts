import { describe, expect, it } from 'vitest';
import { assertionFailureMessage, evaluateToolAssertions } from '../src/assertions.js';

const resultWithTextJson = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
});

describe('tool contract assertions', () => {
  it('passes required metadata and row limit checks for DB read probes', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'pass',
      result: resultWithTextJson({
        rowCount: 1,
        limit: 100,
        source: 'fixture-db',
        freshness: '2026-05-24T00:00:00.000Z',
        rows: [{ ok: 1 }],
      }),
      expect: {
        status: 'pass',
        requiredFields: ['rowCount', 'limit', 'source', 'freshness'],
        maxRows: 100,
      },
    });

    expect(assertions.every((assertion) => assertion.status === 'pass')).toBe(true);
    expect(assertionFailureMessage(assertions)).toBeUndefined();
  });

  it('fails when required result metadata is missing', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'pass',
      result: resultWithTextJson({ rows: [{ ok: 1 }] }),
      expect: {
        requiredFields: ['rowCount', 'source'],
      },
    });

    expect(assertions.filter((assertion) => assertion.status === 'fail').map((assertion) => assertion.name)).toEqual([
      'requiredFields.rowCount',
      'requiredFields.source',
    ]);
    expect(assertionFailureMessage(assertions)).toContain('Missing required field "rowCount"');
  });

  it('passes denied-write probes when stable error code and leak checks match', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'fail',
      error: JSON.stringify({
        code: 'WRITE_NOT_ALLOWED',
        message: 'Write operations are blocked for this role',
      }),
      expect: {
        status: 'fail',
        errorCode: 'WRITE_NOT_ALLOWED',
        notContains: ['DATABASE_URL', 'password', 'stack'],
      },
    });

    expect(assertions.every((assertion) => assertion.status === 'pass')).toBe(true);
  });

  it('fails leak checks when raw internals appear in errors', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'fail',
      error: 'WRITE_NOT_ALLOWED: stack trace included DATABASE_URL=postgres://secret',
      expect: {
        status: 'fail',
        errorCode: 'WRITE_NOT_ALLOWED',
        notContains: ['DATABASE_URL', 'stack'],
      },
    });

    expect(assertions.filter((assertion) => assertion.status === 'fail').map((assertion) => assertion.name)).toEqual([
      'notContains.DATABASE_URL',
      'notContains.stack',
    ]);
  });

  it('passes jsonSchema checks for matching tool output', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'pass',
      result: resultWithTextJson({
        rowCount: 1,
        source: 'fixture-db',
        rows: [{ id: 'user_1', email: 'a@example.com' }],
      }),
      expect: {
        jsonSchema: {
          type: 'object',
          required: ['rowCount', 'source', 'rows'],
          properties: {
            rowCount: { type: 'integer' },
            source: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id', 'email'],
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                },
              },
            },
          },
        },
      },
    });

    expect(assertions).toContainEqual({
      name: 'jsonSchema',
      status: 'pass',
      message: 'Output matched expected JSON schema',
    });
  });

  it('fails jsonSchema checks for mismatched tool output', () => {
    const assertions = evaluateToolAssertions({
      actualStatus: 'pass',
      result: resultWithTextJson({
        rowCount: '1',
        rows: [{ id: 123 }],
      }),
      expect: {
        jsonSchema: {
          type: 'object',
          required: ['rowCount', 'source', 'rows'],
          properties: {
            rowCount: { type: 'integer' },
            source: { type: 'string' },
            rows: {
              type: 'array',
              items: {
                type: 'object',
                required: ['id'],
                properties: {
                  id: { type: 'string' },
                },
              },
            },
          },
        },
      },
    });

    const schemaAssertion = assertions.find((assertion) => assertion.name === 'jsonSchema');
    expect(schemaAssertion?.status).toBe('fail');
    expect(schemaAssertion?.message).toContain('$.source: required property missing');
  });
});
