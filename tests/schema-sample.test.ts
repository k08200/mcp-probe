import { describe, expect, it } from 'vitest';
import { sampleObjectFromSchema } from '../src/schema-sample.js';

describe('schema sample generation', () => {
  it('uses defaults, enums, and numeric bounds for useful sidecar samples', () => {
    expect(sampleObjectFromSchema({
      type: 'object',
      required: ['location', 'count', 'enabled'],
      properties: {
        location: { type: 'string', enum: ['Chicago', 'New York'] },
        count: { type: 'integer', minimum: 1 },
        enabled: { type: 'boolean', default: true },
      },
    })).toEqual({
      location: 'Chicago',
      count: 1,
      enabled: true,
    });
  });

  it('recurses into nested objects and arrays with minItems', () => {
    expect(sampleObjectFromSchema({
      type: 'object',
      required: ['filter', 'tags'],
      properties: {
        filter: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 8 },
          },
        },
        tags: {
          type: 'array',
          minItems: 2,
          items: { type: 'string', enum: ['safe'] },
        },
      },
    })).toEqual({
      filter: { query: 'samplexx' },
      tags: ['safe', 'safe'],
    });
  });
});
