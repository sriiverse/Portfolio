/**
 * schemas/loader.js — Optional registry entry for shared schema samples.
 */
import sample from './sample.json' with { type: 'json' };
import documentSchema from './document.schema.json' with { type: 'json' };
import { validateDocumentEnvelope, assertValid } from '../knowledgeValidator.js';

export const SOURCE_ID = 'schemas.sample';
export const CATEGORY = 'schemas';
export const VERSION = '1.0.0';

export function register(registerSource) {
  registerSource({
    id: SOURCE_ID,
    category: CATEGORY,
    version: VERSION,
    tags: ['schemas', 'envelope'],
    description: 'Shared schema envelope sample',
    schemaPath: './document.schema.json',
    meta: { schema: documentSchema },
    embedding: { enabled: false, dims: null, model: null },
    vector: { enabled: false, indexId: null },
    load: () => {
      const docs = [sample];
      for (const doc of docs) {
        const r = validateDocumentEnvelope(doc);
        if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
        assertValid(doc, documentSchema, 'schemas sample');
      }
      return docs;
    },
  });
}

export default { register, SOURCE_ID, CATEGORY, VERSION };
