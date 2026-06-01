function schemaRecord(schema: unknown): Record<string, unknown> | undefined {
  return schema && typeof schema === 'object' && !Array.isArray(schema)
    ? schema as Record<string, unknown>
    : undefined;
}

function schemaTypes(schema: Record<string, unknown>): string[] {
  const type = schema.type;
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((entry): entry is string => typeof entry === 'string');
  if (schema.properties && typeof schema.properties === 'object') return ['object'];
  if (schema.items) return ['array'];
  return [];
}

function sampleString(schema: Record<string, unknown>): string {
  if (typeof schema.default === 'string') return schema.default;
  if (Array.isArray(schema.enum)) {
    const candidate = schema.enum.find((entry) => typeof entry === 'string');
    if (candidate !== undefined) return candidate;
  }
  if (Array.isArray(schema.examples)) {
    const candidate = schema.examples.find((entry) => typeof entry === 'string');
    if (candidate !== undefined) return candidate;
  }
  const minLength = typeof schema.minLength === 'number' ? Math.max(1, schema.minLength) : 1;
  return 'sample'.padEnd(minLength, 'x');
}

function sampleNumber(schema: Record<string, unknown>, integer: boolean): number {
  const explicit = typeof schema.default === 'number'
    ? schema.default
    : Array.isArray(schema.enum)
      ? schema.enum.find((entry) => typeof entry === 'number')
      : undefined;
  if (typeof explicit === 'number') return integer ? Math.trunc(explicit) : explicit;

  const minimum = typeof schema.minimum === 'number' ? schema.minimum : 0;
  const exclusiveMinimum = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum + 1 : undefined;
  const value = exclusiveMinimum ?? minimum;
  return integer ? Math.ceil(value) : value;
}

function sampleBoolean(schema: Record<string, unknown>): boolean {
  if (typeof schema.default === 'boolean') return schema.default;
  if (Array.isArray(schema.enum)) {
    const candidate = schema.enum.find((entry) => typeof entry === 'boolean');
    if (candidate !== undefined) return candidate;
  }
  return false;
}

export function sampleValueFromSchema(schema: unknown): unknown {
  const record = schemaRecord(schema);
  if (!record) return null;

  if (record.default !== undefined) return record.default;
  if (Array.isArray(record.enum) && record.enum.length > 0) return record.enum[0];

  const [primaryType] = schemaTypes(record);
  switch (primaryType) {
    case 'string':
      return sampleString(record);
    case 'integer':
      return sampleNumber(record, true);
    case 'number':
      return sampleNumber(record, false);
    case 'boolean':
      return sampleBoolean(record);
    case 'array': {
      const minItems = typeof record.minItems === 'number' ? record.minItems : 0;
      const itemCount = Math.max(0, minItems);
      return Array.from({ length: itemCount }, () => sampleValueFromSchema(record.items));
    }
    case 'object':
      return sampleObjectFromSchema(record);
    default:
      return null;
  }
}

export function sampleObjectFromSchema(schema: unknown): Record<string, unknown> {
  const record = schemaRecord(schema);
  if (!record) return {};

  const properties = schemaRecord(record.properties);
  if (!properties) return {};

  const required = Array.isArray(record.required)
    ? record.required.filter((entry): entry is string => typeof entry === 'string')
    : Object.keys(properties);

  const input: Record<string, unknown> = {};
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) continue;
    input[key] = sampleValueFromSchema(properties[key]);
  }

  return input;
}
