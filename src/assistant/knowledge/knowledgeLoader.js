/**
 * knowledgeLoader.js — Lazy load + validate knowledge sources.
 *
 * Responsibilities:
 *   1. Ensure domain sources are registered (bootstrap).
 *   2. Lazy-load a source by id or category.
 *   3. Run envelope + optional domain validation.
 *   4. Cache results on the registry.
 *
 * Embedding / vector search: loaders attach empty embedding hooks on
 * documents when missing so a future indexer can fill vectors without
 * changing document ids.
 *
 * NOT wired into assistant.js / providers.js — infrastructure only.
 */

import {
  getSource,
  listSources,
  registerSource,
  setSourceCache,
  setSourceStatus,
  registrySnapshot,
} from './knowledgeRegistry.js';
import {
  validateDocumentEnvelope,
  validateAgainstSchema,
  assertValid,
} from './knowledgeValidator.js';

/** @type {boolean} */
let bootstrapped = false;

/**
 * Register all built-in domain sample sources (idempotent).
 * Imports are dynamic so unused domains stay lazy at module-graph level too.
 */
export async function bootstrapKnowledgeSources() {
  if (bootstrapped) return registrySnapshot();

  const domains = [
    ['identity', () => import('./identity/loader.js')],
    ['resume', () => import('./resume/loader.js')],
    ['projects', () => import('./projects/loader.js')],
    ['engineering', () => import('./engineering/loader.js')],
    ['behavioral', () => import('./behavioral/loader.js')],
    ['failures', () => import('./failures/loader.js')],
    ['opinions', () => import('./opinions/loader.js')],
    ['conversations', () => import('./conversations/loader.js')],
    ['evaluation', () => import('./evaluation/loader.js')],
    ['schemas', () => import('./schemas/loader.js')],
  ];

  for (const [category, importer] of domains) {
    const mod = await importer();
    const register = mod.register || mod.default?.register;
    if (typeof register === 'function') {
      register(registerSource);
    } else {
      throw new Error(`[knowledgeLoader] ${category} loader missing register()`);
    }
  }

  bootstrapped = true;
  return registrySnapshot();
}

/**
 * Force re-bootstrap (tests).
 */
export function resetBootstrap() {
  bootstrapped = false;
}

/**
 * Lazy-load one source. Returns normalized document array.
 * @param {string} sourceId
 * @param {{ validate?: boolean, force?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function loadSource(sourceId, opts = {}) {
  const { validate = true, force = false } = opts;
  await bootstrapKnowledgeSources();

  const entry = getSource(sourceId);
  if (!entry) throw new Error(`[knowledgeLoader] unknown source: ${sourceId}`);

  if (!force && entry.status === 'ready' && entry.cache != null) {
    return asDocumentArray(entry.cache);
  }

  setSourceStatus(sourceId, 'loading');
  try {
    const raw = await Promise.resolve(entry.descriptor.load());
    const docs = asDocumentArray(raw).map(ensureEmbeddingHook);

    if (validate) {
      for (const doc of docs) {
        const envelope = validateDocumentEnvelope(doc);
        if (!envelope.ok) {
          const detail = envelope.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
          throw new Error(`[knowledgeLoader] ${sourceId} envelope invalid — ${detail}`);
        }
        if (doc.category && doc.category !== entry.descriptor.category) {
          throw new Error(
            `[knowledgeLoader] ${sourceId}: doc ${doc.id} category "${doc.category}" != source "${entry.descriptor.category}"`,
          );
        }
      }
      // Domain-level validation if the source registered a schema via meta
      const schema = entry.descriptor.meta?.schema;
      if (schema) {
        for (const doc of docs) {
          const result = validateAgainstSchema(doc, schema);
          if (!result.ok) {
            const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
            throw new Error(`[knowledgeLoader] ${sourceId} schema invalid for ${doc.id} — ${detail}`);
          }
        }
      }
    }

    setSourceCache(sourceId, docs);
    return docs;
  } catch (err) {
    setSourceStatus(sourceId, 'error', err instanceof Error ? err : new Error(String(err)));
    throw err;
  }
}

/**
 * Load every source in a category (lazy per source).
 * @param {string} category
 * @param {{ validate?: boolean, force?: boolean }} [opts]
 * @returns {Promise<object[]>}
 */
export async function loadCategory(category, opts = {}) {
  await bootstrapKnowledgeSources();
  const sources = listSources(category);
  const batches = await Promise.all(sources.map((s) => loadSource(s.descriptor.id, opts)));
  return batches.flat();
}

/**
 * Load all registered sources.
 * @param {{ validate?: boolean, force?: boolean }} [opts]
 */
export async function loadAll(opts = {}) {
  await bootstrapKnowledgeSources();
  const sources = listSources();
  const batches = await Promise.all(sources.map((s) => loadSource(s.descriptor.id, opts)));
  return batches.flat();
}

/**
 * Keyword search across loaded (or lazily loaded) documents.
 * Placeholder for future vector search — same return shape can carry scores.
 *
 * @param {string} query
 * @param {{ categories?: string[], limit?: number, loadIfNeeded?: boolean }} [opts]
 * @returns {Promise<Array<{ doc: object, score: number, sourceId: string }>>}
 */
export async function searchKnowledge(query, opts = {}) {
  const { categories = null, limit = 10, loadIfNeeded = true } = opts;
  await bootstrapKnowledgeSources();

  const q = String(query || '').toLowerCase().trim();
  const tokens = q.split(/\s+/).filter((t) => t.length > 1);
  if (!tokens.length) return [];

  let sources = listSources();
  if (categories?.length) {
    sources = sources.filter((s) => categories.includes(s.descriptor.category));
  }

  const hits = [];
  for (const s of sources) {
    let docs;
    if (s.status === 'ready' && s.cache != null) {
      docs = asDocumentArray(s.cache);
    } else if (loadIfNeeded) {
      docs = await loadSource(s.descriptor.id, { validate: true });
    } else {
      continue;
    }

    for (const doc of docs) {
      const hay = JSON.stringify(doc).toLowerCase();
      let score = 0;
      for (const t of tokens) {
        if (hay.includes(t)) score += 1;
        if ((doc.tags || []).some((tag) => String(tag).toLowerCase().includes(t))) score += 1;
        if (String(doc.id || '').toLowerCase().includes(t)) score += 2;
      }
      if (score > 0) hits.push({ doc, score, sourceId: s.descriptor.id });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

/**
 * Future vector search adapter hook.
 * Currently returns empty; signature reserved for embedding index.
 *
 * @param {number[]|Float32Array} _queryVector
 * @param {{ limit?: number, categories?: string[] }} [_opts]
 * @returns {Promise<Array<{ doc: object, score: number, sourceId: string }>>}
 */
export async function vectorSearchKnowledge(_queryVector, _opts = {}) {
  // Reserved: plug in ANN / cosine over doc.embedding.vector when ready.
  return [];
}

/**
 * Ensure document has embedding placeholder for future indexers.
 * @param {object} doc
 */
export function ensureEmbeddingHook(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  if (doc.embedding == null) {
    doc.embedding = {
      status: 'none',
      model: null,
      dims: null,
      vector: null,
      updatedAt: null,
    };
  }
  return doc;
}

function asDocumentArray(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (raw.documents && Array.isArray(raw.documents)) return raw.documents;
  return [raw];
}

export { assertValid, validateDocumentEnvelope };

export default {
  bootstrapKnowledgeSources,
  resetBootstrap,
  loadSource,
  loadCategory,
  loadAll,
  searchKnowledge,
  vectorSearchKnowledge,
  ensureEmbeddingHook,
};
