import type { AssertionResult, CheckStatus, ToolExpectations } from './types.js';

type EvaluationInput = {
  result?: unknown;
  error?: string;
  actualStatus: CheckStatus;
  expect?: ToolExpectations;
};

type ExtractedPayload = {
  values: unknown[];
  text: string;
};

function stableStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractPayload(result: unknown, error?: string): ExtractedPayload {
  const values: unknown[] = [];
  const textParts: string[] = [];
  if (error) {
    values.push(error);
    textParts.push(error);
  }

  if (result !== undefined) {
    values.push(result);
    textParts.push(stableStringify(result));
  }

  if (result && typeof result === 'object') {
    const content = (result as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== 'object') continue;
        const record = part as Record<string, unknown>;
        const text = typeof record.text === 'string' ? record.text : undefined;
        if (text !== undefined) {
          values.push(parseMaybeJson(text));
          textParts.push(text);
        }
        for (const key of ['json', 'data', 'resource']) {
          if (record[key] !== undefined) {
            values.push(record[key]);
            textParts.push(stableStringify(record[key]));
          }
        }
      }
    }
  }

  return { values, text: textParts.join('\n') };
}

function objectValues(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(objectValues);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(objectValues)];
}

function hasField(value: unknown, field: string): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((entry) => hasField(entry, field));
  const record = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, field)) return true;
  return Object.values(record).some((entry) => hasField(entry, field));
}

function findNumberField(value: unknown, field: string): number | undefined {
  for (const candidate of objectValues(value)) {
    const record = candidate as Record<string, unknown>;
    const found = record[field];
    if (typeof found === 'number') return found;
    if (typeof found === 'string' && found.trim() !== '' && Number.isFinite(Number(found))) {
      return Number(found);
    }
  }
  return undefined;
}

function findRowsLength(value: unknown): number | undefined {
  for (const candidate of objectValues(value)) {
    const record = candidate as Record<string, unknown>;
    const rows = record.rows ?? record.data ?? record.items ?? record.records;
    if (Array.isArray(rows)) return rows.length;
  }
  return undefined;
}

function includesText(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function schemaType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function expectedTypes(schema: Record<string, unknown>): string[] {
  const type = schema.type;
  if (typeof type === 'string') return [type];
  if (Array.isArray(type) && type.every((entry) => typeof entry === 'string')) return type;
  return [];
}

function valueMatchesType(value: unknown, type: string): boolean {
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return schemaType(value) === type;
}

function validateJsonSchema(value: unknown, schema: unknown, path = '$'): string[] {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [`${path}: schema must be an object`];
  }

  const typed = schema as Record<string, unknown>;
  const errors: string[] = [];
  const types = expectedTypes(typed);
  if (types.length > 0 && !types.some((type) => valueMatchesType(value, type))) {
    errors.push(`${path}: expected ${types.join('|')}, got ${schemaType(value)}`);
    return errors;
  }

  if (Array.isArray(typed.enum) && !typed.enum.some((entry) => Object.is(entry, value))) {
    errors.push(`${path}: value is not in enum`);
  }

  if (typed.type === 'object' || (value && typeof value === 'object' && !Array.isArray(value))) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path}: expected object, got ${schemaType(value)}`);
      return errors;
    }

    const record = value as Record<string, unknown>;
    const required = Array.isArray(typed.required)
      ? typed.required.filter((entry): entry is string => typeof entry === 'string')
      : [];
    for (const key of required) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        errors.push(`${path}.${key}: required property missing`);
      }
    }

    const properties = typed.properties && typeof typed.properties === 'object' && !Array.isArray(typed.properties)
      ? typed.properties as Record<string, unknown>
      : {};
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        errors.push(...validateJsonSchema(record[key], childSchema, `${path}.${key}`));
      }
    }

    if (typed.additionalProperties === false) {
      const allowed = new Set(Object.keys(properties));
      const extra = Object.keys(record).filter((key) => !allowed.has(key));
      for (const key of extra) {
        errors.push(`${path}.${key}: additional property not allowed`);
      }
    }
  }

  if (typed.type === 'array' || Array.isArray(value)) {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${schemaType(value)}`);
      return errors;
    }

    if (typed.items !== undefined) {
      for (const [index, entry] of value.entries()) {
        errors.push(...validateJsonSchema(entry, typed.items, `${path}[${index}]`));
      }
    }
  }

  return errors;
}

function pass(name: string, message: string): AssertionResult {
  return { name, status: 'pass', message };
}

function fail(name: string, message: string): AssertionResult {
  return { name, status: 'fail', message };
}

export function evaluateToolAssertions(input: EvaluationInput): AssertionResult[] {
  const { expect } = input;
  if (!expect) return [];

  const payload = extractPayload(input.result, input.error);
  const assertions: AssertionResult[] = [];

  if (expect.status) {
    assertions.push(input.actualStatus === expect.status
      ? pass('status', `Tool status matched expected ${expect.status}`)
      : fail('status', `Expected tool status ${expect.status}, got ${input.actualStatus}`));
  }

  for (const field of expect.requiredFields ?? []) {
    const found = payload.values.some((value) => hasField(value, field));
    assertions.push(found
      ? pass(`requiredFields.${field}`, `Found required field "${field}"`)
      : fail(`requiredFields.${field}`, `Missing required field "${field}"`));
  }

  if (expect.maxRows !== undefined) {
    const rowCount = payload.values
      .map((value) => findNumberField(value, 'rowCount') ?? findNumberField(value, 'rowsReturned') ?? findRowsLength(value))
      .find((value): value is number => value !== undefined);
    if (rowCount === undefined) {
      assertions.push(fail('maxRows', 'Could not determine row count from result metadata'));
    } else {
      assertions.push(rowCount <= expect.maxRows
        ? pass('maxRows', `Row count ${rowCount} is within maxRows ${expect.maxRows}`)
        : fail('maxRows', `Row count ${rowCount} exceeds maxRows ${expect.maxRows}`));
    }
  }

  if (expect.errorCode) {
    const found = payload.values.some((value) => hasField(value, 'code') && includesText(stableStringify(value), expect.errorCode!))
      || includesText(payload.text, expect.errorCode);
    assertions.push(found
      ? pass('errorCode', `Found expected error code ${expect.errorCode}`)
      : fail('errorCode', `Missing expected error code ${expect.errorCode}`));
  }

  for (const expectedText of expect.contains ?? []) {
    assertions.push(includesText(payload.text, expectedText)
      ? pass(`contains.${expectedText}`, `Output contains "${expectedText}"`)
      : fail(`contains.${expectedText}`, `Output does not contain "${expectedText}"`));
  }

  for (const forbiddenText of expect.notContains ?? []) {
    assertions.push(!includesText(payload.text, forbiddenText)
      ? pass(`notContains.${forbiddenText}`, `Output does not contain "${forbiddenText}"`)
      : fail(`notContains.${forbiddenText}`, `Output leaked forbidden text "${forbiddenText}"`));
  }

  if (expect.jsonSchema) {
    const match = payload.values
      .map((value) => validateJsonSchema(value, expect.jsonSchema))
      .find((errors) => errors.length === 0);
    if (match) {
      assertions.push(pass('jsonSchema', 'Output matched expected JSON schema'));
    } else {
      const firstErrors = payload.values.length > 0
        ? validateJsonSchema(payload.values[0], expect.jsonSchema)
        : ['no result payload found'];
      assertions.push(fail('jsonSchema', `Output did not match expected JSON schema: ${firstErrors.slice(0, 3).join('; ')}`));
    }
  }

  return assertions;
}

export function assertionFailureMessage(assertions: AssertionResult[]): string | undefined {
  const failures = assertions.filter((assertion) => assertion.status === 'fail');
  if (failures.length === 0) return undefined;
  return failures.map((assertion) => assertion.message).join('; ');
}
