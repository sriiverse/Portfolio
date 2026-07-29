/**
 * tagSearch.js — Tag-centric SearchChannel.
 *
 * Matches query tags / tokens against document.tags only (not full body).
 * Useful when lexical body noise would drown structured labels.
 */

import {
  filterCorpus,
  normalizeHit,
  normalizeTag,
} from './interfaces.js';

/** @type {import('./interfaces.js').SearchChannel} */
export const tagSearchChannel = {
  id: 'tag',
  search: tagSearch,
};

/**
 * @param {import('./interfaces.js').RetrievalQuery} query
 * @param {object[]} corpus
 * @param {{ limit?: number, requireExact?: boolean }} [opts]
 * @returns {import('./interfaces.js').SearchHit[]}
 */
export function tagSearch(query, corpus, opts = {}) {
  const docs = filterCorpus(corpus, query);
  const wanted = new Set([
    ...(query.tags || []).map(normalizeTag),
    ...(query.tokens || []).map(normalizeTag),
  ].filter(Boolean));

  if (!wanted.size) return [];

  const limit = opts.limit ?? query.limit ?? 10;
  const requireExact = opts.requireExact === true;
  const hits = [];

  for (const doc of docs) {
    const tags = (doc.tags || []).map(normalizeTag).filter(Boolean);
    if (!tags.length) continue;

    const reasons = [];
    let score = 0;
    let matches = 0;

    for (const tag of tags) {
      for (const w of wanted) {
        if (tag === w) {
          score += 2.5;
          matches += 1;
          reasons.push(`exact:${tag}`);
        } else if (!requireExact && (tag.includes(w) || w.includes(tag))) {
          score += 1.2;
          matches += 1;
          reasons.push(`partial:${tag}~${w}`);
        }
      }
    }

    if (matches === 0) continue;

    // Coverage bonus: more of the doc's tags aligned with the query
    const coverage = matches / Math.max(tags.length, 1);
    score += coverage * 0.8;

    hits.push(normalizeHit({
      doc,
      score: round2(score),
      channel: 'tag',
      reasons: uniq(reasons),
      meta: { matches, coverage: round2(coverage) },
    }));
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function uniq(arr) {
  return [...new Set(arr)].slice(0, 12);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default tagSearchChannel;
