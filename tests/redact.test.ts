import { describe, expect, it } from 'vitest';
import { redactText, redactUnknown } from '../src/redact.js';

describe('redactText', () => {
  it('redacts bearer and basic auth tokens', () => {
    expect(redactText('Authorization: Bearer abcdefghijklmnop')).toBe('Authorization: Bearer [REDACTED]');
    expect(redactText('Authorization: Basic dXNlcjpwYXNzMTIz')).toBe('Authorization: Basic [REDACTED]');
  });

  it('redacts query-string and flag secrets', () => {
    expect(redactText('https://api.example.com/mcp?api_key=sk_live_123&foo=bar')).toBe(
      'https://api.example.com/mcp?api_key=[REDACTED]&foo=bar'
    );
    expect(redactText('server --token supersecrettoken')).toBe('server --token [REDACTED]');
  });

  it('redacts JSON-looking secret fields', () => {
    expect(redactText('{"access_token":"abc123456789","ok":true}')).toBe(
      '{"access_token":"[REDACTED]","ok":true}'
    );
  });

  it('redacts explicit secret values', () => {
    expect(redactText('upstream echoed secret-value-123', ['secret-value-123'])).toBe(
      'upstream echoed [REDACTED]'
    );
  });
});

describe('redactUnknown', () => {
  it('redacts recursively', () => {
    const value = redactUnknown({
      target: 'https://example.com/mcp?token=abc123456789',
      nested: [{ error: 'Bearer abcdefghijklmnop' }],
    });

    expect(value).toEqual({
      target: 'https://example.com/mcp?token=[REDACTED]',
      nested: [{ error: 'Bearer [REDACTED]' }],
    });
  });
});
