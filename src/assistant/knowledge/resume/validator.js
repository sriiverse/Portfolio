/**
 * resume/validator.js — Domain validator for category "resume".
 */
import schema from './resume.schema.json' with { type: 'json' };
import {
  validateAgainstSchema,
  validateDocumentEnvelope,
  assertValid,
} from '../knowledgeValidator.js';

export function validateDocument(doc) {
  const envelope = validateDocumentEnvelope(doc);
  if (!envelope.ok) return envelope;
  if (doc.category !== 'resume') {
    return {
      ok: false,
      errors: [{ path: '$.category', message: 'expected category "resume"' }],
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
      throw new Error(`[resume/validator] ${doc?.id || '?'} — ${detail}`);
    }
  }
  return list;
}

export function assertDocument(doc) {
  assertValid(doc, schema, 'resume document');
  return doc;
}

export { schema };
export default { validateDocument, validateDocuments, assertDocument, schema };
