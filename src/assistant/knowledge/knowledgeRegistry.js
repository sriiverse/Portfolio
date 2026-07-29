/**
 * knowledgeRegistry.js — Catalog of independent knowledge sources.
 *
 * Each source is registered with an id, category, version, optional tags,
 * and a lazy `load` factory. Sources do not load until requested.
 *
 * Designed so future embedding indexes / vector adapters can attach without
 * changing domain folders.
 */

/** @typedef {'identity'|'resume'|'projects'|'engineering'|'behavioral'|'failures'|'opinions'|'conversations'|'evaluation'|'schemas'|string} KnowledgeCategory */

/**
 * @typedef {object} KnowledgeSourceDescriptor
 * @property {string} id                 Unique source id (e.g. "identity.core")
 * @property {KnowledgeCategory} category
 * @property {string} version            Semver-ish string for the source pack
 * @property {string[]} [tags]
 * @property {string} [description]
 * @property {string} [schemaPath]       Relative hint for tooling
 * @property {() => Promise<unknown[]|unknown>|unknown[]|unknown} load
 * @property {object} [meta]             Free-form registry metadata
 * @property {{ enabled?: boolean, dims?: number|null, model?: string|null }} [embedding]
 * @property {{ enabled?: boolean, indexId?: string|null }} [vector]
 */

/**
 * @typedef {object} RegisteredSource
 * @property {KnowledgeSourceDescriptor} descriptor
 * @property {'idle'|'loading'|'ready'|'error'} status
 * @property {unknown|null} cache
 * @property {Error|null} lastError
 * @property {number|null} loadedAt
 */

const SOURCES = new Map();

/**
 * Register a knowledge source. Idempotent replace if id already exists.
 * @param {KnowledgeSourceDescriptor} descriptor
 */
export function registerSource(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new Error('[knowledgeRegistry] descriptor required');
  }
  if (!descriptor.id || typeof descriptor.id !== 'string') {
    throw new Error('[knowledgeRegistry] descriptor.id required');
  }
  if (!descriptor.category || typeof descriptor.category !== 'string') {
    throw new Error('[knowledgeRegistry] descriptor.category required');
  }
  if (!descriptor.version || typeof descriptor.version !== 'string') {
    throw new Error('[knowledgeRegistry] descriptor.version required');
  }
  if (typeof descriptor.load !== 'function') {
    throw new Error('[knowledgeRegistry] descriptor.load must be a function');
  }

  SOURCES.set(descriptor.id, {
    descriptor: {
      tags: [],
      embedding: { enabled: false, dims: null, model: null },
      vector: { enabled: false, indexId: null },
      ...descriptor,
    },
    status: 'idle',
    cache: null,
    lastError: null,
    loadedAt: null,
  });

  return descriptor.id;
}

/**
 * @param {string} id
 * @returns {RegisteredSource|null}
 */
export function getSource(id) {
  return SOURCES.get(id) || null;
}

/**
 * @param {KnowledgeCategory} [category]
 * @returns {RegisteredSource[]}
 */
export function listSources(category) {
  const all = [...SOURCES.values()];
  if (!category) return all;
  return all.filter((s) => s.descriptor.category === category);
}

/**
 * @returns {string[]}
 */
export function listCategories() {
  return [...new Set([...SOURCES.values()].map((s) => s.descriptor.category))].sort();
}

/**
 * Mark a source's in-memory cache (used by knowledgeLoader).
 * @param {string} id
 * @param {unknown} data
 */
export function setSourceCache(id, data) {
  const entry = SOURCES.get(id);
  if (!entry) throw new Error(`[knowledgeRegistry] unknown source: ${id}`);
  entry.cache = data;
  entry.status = 'ready';
  entry.lastError = null;
  entry.loadedAt = Date.now();
}

/**
 * @param {string} id
 * @param {'idle'|'loading'|'ready'|'error'} status
 * @param {Error} [err]
 */
export function setSourceStatus(id, status, err) {
  const entry = SOURCES.get(id);
  if (!entry) throw new Error(`[knowledgeRegistry] unknown source: ${id}`);
  entry.status = status;
  if (status === 'error') entry.lastError = err || new Error('load failed');
  if (status === 'idle') {
    entry.cache = null;
    entry.loadedAt = null;
    entry.lastError = null;
  }
}

/**
 * Clear one source cache or all caches (does not unregister).
 * @param {string} [id]
 */
export function invalidate(id) {
  if (id) {
    const entry = SOURCES.get(id);
    if (!entry) return;
    entry.cache = null;
    entry.status = 'idle';
    entry.loadedAt = null;
    entry.lastError = null;
    return;
  }
  for (const entry of SOURCES.values()) {
    entry.cache = null;
    entry.status = 'idle';
    entry.loadedAt = null;
    entry.lastError = null;
  }
}

/**
 * Unregister a source (tests / hot-reload).
 * @param {string} id
 */
export function unregisterSource(id) {
  return SOURCES.delete(id);
}

/** Wipe registry (tests only). */
export function resetRegistry() {
  SOURCES.clear();
}

/**
 * Snapshot for debugging / future vector index builders.
 */
export function registrySnapshot() {
  return listSources().map((s) => ({
    id: s.descriptor.id,
    category: s.descriptor.category,
    version: s.descriptor.version,
    tags: s.descriptor.tags || [],
    status: s.status,
    loadedAt: s.loadedAt,
    embedding: s.descriptor.embedding,
    vector: s.descriptor.vector,
  }));
}

export default {
  registerSource,
  getSource,
  listSources,
  listCategories,
  setSourceCache,
  setSourceStatus,
  invalidate,
  unregisterSource,
  resetRegistry,
  registrySnapshot,
};
