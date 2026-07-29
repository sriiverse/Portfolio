/**
 * knowledgeRanker.js — Rank knowledge documents for a retrieval plan.
 *
 * Scoring is lexical + tag/category alignment. Ready to accept future
 * embedding similarity as an additive signal without changing the API.
 */

/**
 * @typedef {object} RankedKnowledgeHit
 * @property {object} doc
 * @property {number} score
 * @property {string} sourceId
 * @property {string} category
 * @property {string[]} reasons
 */

/**
 * Rank documents against a plan + optional prefetched hits.
 *
 * @param {object[]} documents  Flat list of knowledge docs (with optional _sourceId)
 * @param {{ query: string, tokens?: string[], categories?: string[], boostTags?: string[], limit?: number }} plan
 * @param {{ embeddingScores?: Map<string, number> }} [opts]  Future: docId → cosine similarity
 * @returns {RankedKnowledgeHit[]}
 */
export function rankKnowledgeDocuments(documents, plan, opts = {}) {
  const docs = Array.isArray(documents) ? documents : [];
  const tokens = (plan.tokens && plan.tokens.length)
    ? plan.tokens
    : tokenize(plan.query || '');
  const boostTags = new Set((plan.boostTags || []).map((t) => String(t).toLowerCase()));
  const preferredCategories = new Set(plan.categories || []);
  const limit = plan.limit ?? 6;
  const embeddingScores = opts.embeddingScores || null;

  const hits = [];

  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    const category = String(doc.category || '');
    const reasons = [];
    let score = 0;

    if (preferredCategories.size && preferredCategories.has(category)) {
      // Earlier categories in the plan get a mild boost
      const idx = (plan.categories || []).indexOf(category);
      const catBoost = idx >= 0 ? Math.max(0.5, 2.2 - idx * 0.25) : 1;
      score += catBoost;
      reasons.push(`category:${category}`);
    } else if (preferredCategories.size) {
      // Still allow weak cross-category hits
      score += 0.15;
    }

    const tags = Array.isArray(doc.tags) ? doc.tags.map((t) => String(t).toLowerCase()) : [];
    for (const tag of tags) {
      if (boostTags.has(tag) || tokens.some((t) => tag.includes(t) || t.includes(tag))) {
        score += 1.2;
        reasons.push(`tag:${tag}`);
      }
    }

    const hay = safeStringify(doc).toLowerCase();
    for (const t of tokens) {
      if (hay.includes(t)) {
        score += 0.7;
      }
    }

    const id = String(doc.id || '').toLowerCase();
    for (const t of tokens) {
      if (id.includes(t)) {
        score += 1.5;
        reasons.push(`id-match:${t}`);
      }
    }

    // Future embedding channel
    if (embeddingScores && doc.id != null && embeddingScores.has(doc.id)) {
      const sim = Number(embeddingScores.get(doc.id)) || 0;
      score += sim * 3;
      reasons.push(`embedding:${sim.toFixed(3)}`);
    } else if (doc.embedding?.status === 'ready' && Array.isArray(doc.embedding?.vector)) {
      // Placeholder weight so ready vectors are preferred once filled
      score += 0.05;
      reasons.push('embedding:ready');
    }

    // Metadata confidence
    const conf = doc.metadata?.confidence;
    if (conf === 'documented') {
      score += 0.35;
      reasons.push('confidence:documented');
    } else if (conf === 'inferred') {
      score += 0.1;
    }

    if (score <= 0) continue;

    hits.push({
      doc,
      score: Math.round(score * 100) / 100,
      sourceId: doc._sourceId || doc.metadata?.sourceId || category || 'unknown',
      category,
      reasons: [...new Set(reasons)].slice(0, 8),
    });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function safeStringify(doc) {
  try {
    return JSON.stringify(doc);
  } catch {
    return String(doc?.id || '');
  }
}

export default { rankKnowledgeDocuments };
