/**
 * keywordSearch.js — Lexical / keyword SearchChannel.
 *
 * Scores documents by token presence in id, tags, and serialized content.
 * Same SearchHit contract as tag / relationship / vector channels.
 */

import {
  filterCorpus,
  normalizeHit,
} from './interfaces.js';

/** @type {import('./interfaces.js').SearchChannel} */
export const keywordSearchChannel = {
  id: 'keyword',
  search: keywordSearch,
};

/**
 * @param {import('./interfaces.js').RetrievalQuery} query
 * @param {object[]} corpus
 * @param {{ limit?: number }} [opts]
 * @returns {import('./interfaces.js').SearchHit[]}
 */
export function keywordSearch(query, corpus, opts = {}) {
  const docs = filterCorpus(corpus, query);
  const tokens = query.tokens?.length ? query.tokens : [];
  if (!tokens.length) return [];

  const limit = opts.limit ?? query.limit ?? 10;
  const hits = [];

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const reasons = [];
    let score = 0;

    const id = String(doc.id || '').toLowerCase();
    const tags = (doc.tags || []).map((t) => String(t).toLowerCase());
    const hay = safeJson(doc).toLowerCase();

    for (const t of tokens) {
      if (id.includes(t)) {
        score += 2.4;
        reasons.push(`id:${t}`);
      }
      if (tags.some((tag) => tag === t || tag.includes(t))) {
        score += 1.1;
        reasons.push(`tag-overlap:${t}`);
      }
      if (hay.includes(t)) {
        score += 0.65;
      }
    }

    // Mild intent-aware bump without project hardcoding
    if (query.intent?.id && hay.includes(String(query.intent.id).replace(/_/g, ' '))) {
      score += 0.25;
      reasons.push(`intent-text:${query.intent.id}`);
    }

    if (score <= 0) continue;

    hits.push(normalizeHit({
      doc,
      score: round2(score),
      channel: 'keyword',
      reasons: uniq(reasons),
      meta: { tokenHits: reasons.length },
    }));
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function safeJson(doc) {
  try {
    return JSON.stringify(doc);
  } catch {
    return String(doc?.id || '');
  }
}

function uniq(arr) {
  return [...new Set(arr)].slice(0, 12);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default keywordSearchChannel;
