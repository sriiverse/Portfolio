/**
 * projects/validator.js — Domain validator for category "projects".
 */
import schema from './projects.schema.json' with { type: 'json' };
import {
  validateAgainstSchema,
  validateDocumentEnvelope,
  assertValid,
} from '../knowledgeValidator.js';

export function validateDocument(doc) {
  const envelope = validateDocumentEnvelope(doc);
  if (!envelope.ok) return envelope;
  if (doc.category !== 'projects') {
    return {
      ok: false,
      errors: [{ path: '$.category', message: 'expected category "projects"' }],
    };
  }
  return validateAgainstSchema(doc, schema);
}

export function validateDocuments(docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  for (const doc of list) {
    const result = validateDocument(doc);
    if (!result.ok) {
      const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`[projects/validator] ${doc?.id || '?'} — ${detail}`);
    }
  }
  return list;
}

export function assertDocument(doc) {
  assertValid(doc, schema, 'projects document');
  return doc;
}

export { schema };
export default { validateDocument, validateDocuments, assertDocument, schema };
