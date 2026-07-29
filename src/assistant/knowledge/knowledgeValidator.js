/**
 * knowledgeValidator.js — Pure-JS schema validation for knowledge documents.
 *
 * No external dependencies (no Ajv). Validates required fields, primitive
 * types, arrays, and nested objects described by JSON Schema subset:
 *   type, properties, required, items, enum, additionalProperties,
 *   minLength, minItems, pattern (basic).
 *
 * Used by domain validators and knowledgeLoader before cache insert.
 */

/**
 * @typedef {object} ValidationIssue
 * @property {string} path
 * @property {string} message
 */

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {ValidationIssue[]} errors
 */

/**
 * Validate `data` against a JSON-Schema-like object (subset).
 * @param {unknown} data
 * @param {object} schema
 * @param {string} [path]
 * @returns {ValidationResult}
 */
export function validateAgainstSchema(data, schema, path = '$') {
  const errors = [];
  walk(data, schema, path, errors);
  return { ok: errors.length === 0, errors };
}

/**
 * Assert validation or throw with aggregated message.
 * @param {unknown} data
 * @param {object} schema
 * @param {string} [label]
 */
export function assertValid(data, schema, label = 'document') {
  const result = validateAgainstSchema(data, schema);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
    throw new Error(`[knowledgeValidator] Invalid ${label} — ${detail}`);
  }
  return data;
}

/**
 * Validate the universal knowledge document envelope.
 * @param {unknown} doc
 * @returns {ValidationResult}
 */
export function validateDocumentEnvelope(doc) {
  const errors = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { ok: false, errors: [{ path: '$', message: 'document must be an object' }] };
  }
  const d = /** @type {Record<string, unknown>} */ (doc);

  requireString(d, 'id', errors);
  requireString(d, 'version', errors);
  requireString(d, 'category', errors);

  if (!Array.isArray(d.tags) || !d.tags.every((t) => typeof t === 'string')) {
    errors.push({ path: '$.tags', message: 'tags must be an array of strings' });
  }
  if (!d.metadata || typeof d.metadata !== 'object' || Array.isArray(d.metadata)) {
    errors.push({ path: '$.metadata', message: 'metadata must be an object' });
  }

  // Optional future embedding hook — validate shape if present
  if (d.embedding != null) {
    const emb = d.embedding;
    if (typeof emb !== 'object' || Array.isArray(emb)) {
      errors.push({ path: '$.embedding', message: 'embedding must be an object when present' });
    } else {
      const e = /** @type {Record<string, unknown>} */ (emb);
      if (e.status != null && !['none', 'pending', 'ready', 'stale'].includes(String(e.status))) {
        errors.push({ path: '$.embedding.status', message: 'status must be none|pending|ready|stale' });
      }
      if (e.vector != null && !Array.isArray(e.vector) && !(e.vector instanceof Float32Array)) {
        errors.push({ path: '$.embedding.vector', message: 'vector must be number[] or Float32Array' });
      }
      if (e.dims != null && typeof e.dims !== 'number') {
        errors.push({ path: '$.embedding.dims', message: 'dims must be a number' });
      }
      if (e.model != null && typeof e.model !== 'string') {
        errors.push({ path: '$.embedding.model', message: 'model must be a string' });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function requireString(obj, key, errors) {
  if (typeof obj[key] !== 'string' || !String(obj[key]).trim()) {
    errors.push({ path: `$.${key}`, message: `${key} must be a non-empty string` });
  }
}

function walk(data, schema, path, errors) {
  if (!schema || typeof schema !== 'object') return;

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `must be one of: ${schema.enum.join(', ')}` });
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, 'const') && data !== schema.const) {
    errors.push({ path, message: `must equal constant ${JSON.stringify(schema.const)}` });
    return;
  }

  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => matchesType(data, t))) {
      errors.push({ path, message: `expected type ${types.join('|')}, got ${typeName(data)}` });
      return;
    }
  }

  if (schema.type === 'string' || (Array.isArray(schema.type) && schema.type.includes('string'))) {
    if (typeof data === 'string') {
      if (schema.minLength != null && data.length < schema.minLength) {
        errors.push({ path, message: `minLength ${schema.minLength}` });
      }
      if (schema.pattern) {
        try {
          if (!new RegExp(schema.pattern).test(data)) {
            errors.push({ path, message: `must match pattern ${schema.pattern}` });
          }
        } catch {
          /* ignore invalid pattern in schema */
        }
      }
    }
  }

  if (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array'))) {
    if (Array.isArray(data)) {
      if (schema.minItems != null && data.length < schema.minItems) {
        errors.push({ path, message: `minItems ${schema.minItems}` });
      }
      if (schema.items) {
        data.forEach((item, i) => walk(item, schema.items, `${path}[${i}]`, errors));
      }
    }
  }

  if (schema.type === 'object' || schema.properties || (Array.isArray(schema.type) && schema.type.includes('object'))) {
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const required = schema.required || [];
      for (const key of required) {
        if (data[key] === undefined) {
          errors.push({ path: `${path}.${key}`, message: 'required property missing' });
        }
      }
      const props = schema.properties || {};
      for (const [key, propSchema] of Object.entries(props)) {
        if (data[key] !== undefined) {
          walk(data[key], propSchema, `${path}.${key}`, errors);
        }
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(data)) {
          if (!(key in props)) {
            errors.push({ path: `${path}.${key}`, message: 'additional property not allowed' });
          }
        }
      }
    }
  }
}

function matchesType(data, type) {
  switch (type) {
    case 'object': return data !== null && typeof data === 'object' && !Array.isArray(data);
    case 'array': return Array.isArray(data);
    case 'string': return typeof data === 'string';
    case 'number': return typeof data === 'number' && !Number.isNaN(data);
    case 'integer': return typeof data === 'number' && Number.isInteger(data);
    case 'boolean': return typeof data === 'boolean';
    case 'null': return data === null;
    default: return true;
  }
}

function typeName(data) {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  return typeof data;
}

export default {
  validateAgainstSchema,
  assertValid,
  validateDocumentEnvelope,
};
