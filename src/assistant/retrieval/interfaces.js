/**
 * interfaces.js — Shared retrieval contracts.
 *
 * All search channels (keyword, tag, relationship, vector) share the same
 * hit / query shapes so channels can be added or swapped without API churn.
 *
 * Embeddings are NOT implemented here. Vector search implements the same
 * SearchChannel interface and currently returns [] until an index is attached.
 */

/**
 * @typedef {'keyword'|'tag'|'relationship'|'vector'} SearchChannelId
 */

/**
 * Normalized query handed to every search channel.
 *
 * @typedef {object} RetrievalQuery
 * @property {string} text                 Original question
 * @property {string[]} tokens             Normalized lexical tokens
 * @property {string[]} tags               Preferred / extracted tags
 * @property {string[]} [categories]       Optional category filter
 * @property {number} [limit]              Soft per-channel limit
 * @property {{ id: string, confidence?: number, [k: string]: unknown }} [intent]
 * @property {Record<string, unknown>} [filters]  Extensible filters (sourceId, projectId, …)
 * @property {number[]|Float32Array|null} [queryVector]  Reserved for vector channel
 */

/**
 * Uniform hit returned by every SearchChannel.
 *
 * @typedef {object} SearchHit
 * @property {object} doc
 * @property {number} score
 * @property {SearchChannelId} channel
 * @property {string} [sourceId]
 * @property {string[]} reasons
 * @property {Record<string, unknown>} [meta]
 */

/**
 * Search channel contract — implement this for future backends (ANN, BM25, …).
 *
 * @typedef {object} SearchChannel
 * @property {SearchChannelId} id
 * @property {(query: RetrievalQuery, corpus: object[], opts?: object) => SearchHit[]|Promise<SearchHit[]>} search
 */

/**
 * Ranked hit after fusion.
 *
 * @typedef {object} RankedHit
 * @property {object} doc
 * @property {number} score
 * @property {string} [sourceId]
 * @property {string} category
 * @property {SearchChannelId[]} channels
 * @property {string[]} reasons
 * @property {Record<string, number>} channelScores
 */

/**
 * Context package consumed by a downstream assistant (no LLM here).
 *
 * @typedef {object} RetrievalContextPackage
 * @property {string} question
 * @property {object} intent
 * @property {RankedHit[]} retrievedKnowledge
 * @property {{
 *   documents: object[],
 *   citations: Array<{ id: string, category: string, score: number, channels: string[] }>,
 *   expansion: { seedIds: string[], addedIds: string[], edges: object[] },
 *   channelsUsed: SearchChannelId[]
 * }} context
 * @property {number} confidence
 * @property {object} meta
 */

/** @type {SearchChannelId[]} */
export const SEARCH_CHANNELS = ['keyword', 'tag', 'relationship', 'vector'];

/**
 * Build a RetrievalQuery from free text + optional intent / filters.
 * @param {string} text
 * @param {{ intent?: object, categories?: string[], tags?: string[], limit?: number, filters?: object, queryVector?: number[]|Float32Array|null }} [opts]
 * @returns {RetrievalQuery}
 */
export function buildRetrievalQuery(text, opts = {}) {
  const raw = String(text || '');
  const tokens = tokenize(raw);
  const tags = Array.isArray(opts.tags) && opts.tags.length
    ? opts.tags.map(normalizeTag)
    : inferTagsFromTokens(tokens);

  return {
    text: raw.trim(),
    tokens,
    tags,
    categories: opts.categories ? [...opts.categories] : undefined,
    limit: opts.limit ?? 10,
    intent: opts.intent || undefined,
    filters: opts.filters || undefined,
    queryVector: opts.queryVector ?? null,
  };
}

/**
 * Normalize any channel result into a SearchHit.
 * @param {Partial<SearchHit> & { doc: object, channel: SearchChannelId }} partial
 * @returns {SearchHit}
 */
export function normalizeHit(partial) {
  const doc = partial.doc;
  return {
    doc,
    score: Number(partial.score) || 0,
    channel: partial.channel,
    sourceId: partial.sourceId || doc?._sourceId || doc?.metadata?.sourceId || doc?.category || 'unknown',
    reasons: Array.isArray(partial.reasons) ? partial.reasons.slice(0, 12) : [],
    meta: partial.meta && typeof partial.meta === 'object' ? partial.meta : {},
  };
}

/**
 * Deduplicate hits by doc.id, keeping the highest score (channel preserved in meta).
 * @param {SearchHit[]} hits
 * @returns {SearchHit[]}
 */
export function dedupeHits(hits) {
  const best = new Map();
  for (const hit of hits || []) {
    const id = hit?.doc?.id;
    if (!id) continue;
    const prev = best.get(id);
    if (!prev || hit.score > prev.score) best.set(id, hit);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

export function tokenize(text) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of',
    'in', 'on', 'for', 'with', 'about', 'as', 'by', 'at', 'from', 'it', 'this',
    'that', 'me', 'my', 'your', 'you', 'do', 'does', 'did', 'can', 'could',
    'would', 'should', 'what', 'which', 'who', 'how', 'why', 'when', 'where',
    'tell', 'show', 'please', 'just', 'like', 'want', 'need',
  ]);
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stop.has(t))
    .slice(0, 32);
}

export function normalizeTag(tag) {
  return String(tag || '').toLowerCase().trim();
}

function inferTagsFromTokens(tokens) {
  // Tokens that look like taggable tech / domain labels
  return tokens.filter((t) => /^[a-z][a-z0-9+.#-]{1,24}$/.test(t)).slice(0, 16);
}

/**
 * Filter corpus by optional categories / filters without hardcoding domains.
 * @param {object[]} corpus
 * @param {RetrievalQuery} query
 */
export function filterCorpus(corpus, query) {
  let docs = Array.isArray(corpus) ? corpus : [];
  const cats = query.categories;
  if (cats?.length) {
    const set = new Set(cats);
    docs = docs.filter((d) => set.has(d.category));
  }
  const filters = query.filters;
  if (filters && typeof filters === 'object') {
    if (filters.projectId) {
      const pid = String(filters.projectId).toLowerCase();
      docs = docs.filter((d) => {
        const meta = String(d.metadata?.projectId || d.content?.projectId || '').toLowerCase();
        return meta === pid || (d.tags || []).some((t) => String(t).toLowerCase() === pid);
      });
    }
    if (filters.sourceId) {
      const sid = String(filters.sourceId);
      docs = docs.filter((d) => (d._sourceId || d.metadata?.sourceId) === sid);
    }
  }
  return docs;
}

export default {
  SEARCH_CHANNELS,
  buildRetrievalQuery,
  normalizeHit,
  dedupeHits,
  tokenize,
  normalizeTag,
  filterCorpus,
};
