/**
 * vectorSearch.js — Vector SearchChannel stub (API-stable, no embeddings yet).
 *
 * When an embedding index exists, implement `search` body without changing
 * callers: same RetrievalQuery in, same SearchHit[] out.
 *
 * Today: returns [] unless opts.embeddingScores / query.queryVector + index
 * adapter are injected.
 */

import { normalizeHit, filterCorpus } from './interfaces.js';

/** @type {import('./interfaces.js').SearchChannel} */
export const vectorSearchChannel = {
  id: 'vector',
  search: vectorSearch,
};

/**
 * @param {import('./interfaces.js').RetrievalQuery} query
 * @param {object[]} corpus
 * @param {{
 *   limit?: number,
 *   embeddingScores?: Map<string, number>|Record<string, number>,
 *   indexSearch?: (queryVector: number[]|Float32Array, docs: object[], limit: number) => Array<{ id: string, score: number }>
 * }} [opts]
 * @returns {Promise<import('./interfaces.js').SearchHit[]>|import('./interfaces.js').SearchHit[]}
 */
export function vectorSearch(query, corpus, opts = {}) {
  const limit = opts.limit ?? query.limit ?? 10;
  const docs = filterCorpus(corpus, query);

  // Path A: injected similarity map (tests / hybrid fusion experiments)
  // Prefer filtered corpus; fall back to full corpus for scored ids so
  // category filters never silently drop known vector matches.
  const scoreMap = toMap(opts.embeddingScores);
  if (scoreMap && scoreMap.size) {
    const byId = new Map((corpus || []).map((d) => [d.id, d]));
    for (const d of docs) {
      if (d?.id) byId.set(d.id, d);
    }
    const hits = [];
    for (const [id, sim] of scoreMap.entries()) {
      const doc = byId.get(id);
      if (!doc) continue;
      hits.push(normalizeHit({
        doc,
        score: round2(sim),
        channel: 'vector',
        reasons: [`cosine:${round2(sim)}`],
        meta: { status: 'injected-scores' },
      }));
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  // Path B: future ANN / index adapter + queryVector
  if (typeof opts.indexSearch === 'function' && query.queryVector) {
    const results = opts.indexSearch(query.queryVector, docs, limit) || [];
    const byId = new Map(docs.map((d) => [d.id, d]));
    return results
      .map((r) => {
        const doc = byId.get(r.id);
        if (!doc) return null;
        return normalizeHit({
          doc,
          score: round2(Number(r.score) || 0),
          channel: 'vector',
          reasons: [`index:${round2(Number(r.score) || 0)}`],
          meta: { status: 'index' },
        });
      })
      .filter(Boolean)
      .slice(0, limit);
  }

  // Path C: documents marked embedding.status === 'ready' but no index yet
  // — do not invent vectors; return empty to keep semantics honest.
  void docs;
  return [];
}

/**
 * Capability probe for pipelines / UI.
 * @returns {{ enabled: boolean, reason: string }}
 */
export function vectorSearchStatus() {
  return {
    enabled: false,
    reason: 'Embeddings not implemented. Channel API is reserved; returns [].',
  };
}

function toMap(src) {
  if (!src) return null;
  if (src instanceof Map) return src.size ? src : null;
  if (typeof src === 'object') {
    const m = new Map(Object.entries(src).map(([k, v]) => [k, Number(v) || 0]));
    return m.size ? m : null;
  }
  return null;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default vectorSearchChannel;
