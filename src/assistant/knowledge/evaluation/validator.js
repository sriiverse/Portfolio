/**
 * evaluation/validator.js — Domain validator for category "evaluation".
 */
import schema from './evaluation.schema.json' with { type: 'json' };
import {
  validateAgainstSchema,
  validateDocumentEnvelope,
  assertValid,
} from '../knowledgeValidator.js';

export function validateDocument(doc) {
  const envelope = validateDocumentEnvelope(doc);
  if (!envelope.ok) return envelope;
  if (doc.category !== 'evaluation') {
    return {
      ok: false,
      errors: [{ path: '$.category', message: 'expected category "evaluation"' }],
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
      throw new Error(`[evaluation/validator] ${doc?.id || '?'} — ${detail}`);
    }
  }
  return list;
}

export function assertDocument(doc) {
  assertValid(doc, schema, 'evaluation document');
  return doc;
}

export { schema };
export default { validateDocument, validateDocuments, assertDocument, schema };
