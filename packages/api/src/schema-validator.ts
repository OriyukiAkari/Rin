// Small runtime schema system shared between client and server.
// Keeping the builder and validator together prevents the exported request
// schemas from becoming documentation-only objects.

export type RuntimeSchema = {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array' | 'file';
  optional?: boolean;
  integer?: boolean;
  format?: 'date-time';
  properties?: Record<string, RuntimeSchema>;
  items?: RuntimeSchema;
  additionalProperties?: boolean;
};

export type ValidationResult =
  | { success: true; errors: [] }
  | { success: false; errors: string[] };

export const t = {
  Object: (properties: Record<string, any>, options?: { additionalProperties?: boolean }) => ({
    type: 'object' as const,
    properties,
    ...options
  }),
  String: (options?: { optional?: boolean }) => ({ type: 'string' as const, optional: options?.optional }),
  Number: (options?: { optional?: boolean }) => ({ type: 'number' as const, optional: options?.optional }),
  Boolean: (options?: { optional?: boolean }) => ({ type: 'boolean' as const, optional: options?.optional }),
  Integer: (options?: { optional?: boolean }) => ({ type: 'number' as const, integer: true, optional: options?.optional }),
  Date: (options?: { optional?: boolean }) => ({ type: 'string' as const, format: 'date-time' as const, optional: options?.optional }),
  Array: (items: any, options?: { optional?: boolean }) => ({ type: 'array' as const, items, optional: options?.optional }),
  File: (options?: { optional?: boolean }) => ({ type: 'file' as const, optional: options?.optional }),
  Optional: (schema: any) => ({ ...schema, optional: true }),
  Numeric: (options?: { optional?: boolean }) => ({ type: 'number' as const, optional: options?.optional }),
};

function validateValue(schema: RuntimeSchema, value: unknown, path: string, errors: string[]) {
  if (value === undefined) {
    if (!schema.optional) errors.push(`${path} is required`);
    return;
  }

  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path} must be a string`);
      } else if (schema.format === 'date-time' && !Number.isFinite(Date.parse(value))) {
        errors.push(`${path} must be a valid date-time`);
      }
      return;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value) || (schema.integer && !Number.isInteger(value))) {
        errors.push(`${path} must be ${schema.integer ? 'an integer' : 'a finite number'}`);
      }
      return;
    case 'boolean':
      if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`);
      return;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
        return;
      }
      value.forEach((item, index) => validateValue(schema.items!, item, `${path}[${index}]`, errors));
      return;
    case 'file': {
      const candidate = value as { name?: unknown; size?: unknown; arrayBuffer?: unknown } | null;
      if (!candidate || typeof candidate !== 'object' || typeof candidate.name !== 'string' ||
        typeof candidate.size !== 'number' || typeof candidate.arrayBuffer !== 'function') {
        errors.push(`${path} must be a file`);
      }
      return;
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        return;
      }
      const record = value as Record<string, unknown>;
      for (const [key, childSchema] of Object.entries(schema.properties || {})) {
        validateValue(childSchema, record[key], `${path}.${key}`, errors);
      }
      if (schema.additionalProperties === false) {
        const allowed = new Set(Object.keys(schema.properties || {}));
        for (const key of Object.keys(record)) {
          if (!allowed.has(key)) errors.push(`${path}.${key} is not allowed`);
        }
      }
      return;
    }
  }
}

export function validateSchema(schema: RuntimeSchema, value: unknown): ValidationResult {
  const errors: string[] = [];
  validateValue(schema, value, '$', errors);
  return errors.length === 0 ? { success: true, errors: [] } : { success: false, errors };
}
