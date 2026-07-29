/**
 * opinions/loader.js — Lazy knowledge source for category "opinions".
 */
import sample from './sample.json' with { type: 'json' };
import schema from './opinions.schema.json' with { type: 'json' };
import { validateDocuments } from './validator.js';

export const SOURCE_ID = 'opinions.sample';
export const CATEGORY = 'opinions';
export const VERSION = '1.0.0';

function documents() {
  return Array.isArray(sample) ? sample : [sample];
}

/**
 * @param {typeof import('../knowledgeRegistry.js').registerSource} registerSource
 */
export function register(registerSource) {
  registerSource({
    id: SOURCE_ID,
    category: CATEGORY,
    version: VERSION,
    tags: ['sample', 'opinions'],
    description: 'Opinions sample pack',
    schemaPath: './opinions.schema.json',
    meta: { schema },
    embedding: { enabled: true, dims: null, model: null },
    vector: { enabled: false, indexId: null },
    load: () => {
      const docs = documents();
      validateDocuments(docs);
      return docs;
    },
  });
}

export async function load() {
  const docs = documents();
  validateDocuments(docs);
  return docs;
}

export default { register, load, SOURCE_ID, CATEGORY, VERSION };
