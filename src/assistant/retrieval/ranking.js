/**
 * ranking.js — Fuse multi-channel SearchHits into a ranked list.
 *
 * Channel scores are combined with stable weights. Optional future
 * embeddingScores (docId → similarity) plug in without changing the API.
 */

/**
 * Default fusion weights per channel. Vector weight reserved — currently
 * unused until vectorSearch returns real hits.
 */
export const DEFAULT_CHANNEL_WEIGHTS = {
  keyword: 1.0,
  tag: 1.15,
  relationship: 0.85,
  vector: 1.35,
};

/**
 * Rank / fuse hits from one or more search channels.
 *
 * @param {import('./interfaces.js').SearchHit[]} hits
 * @param {{
 *   limit?: number,
 *   channelWeights?: Partial<typeof DEFAULT_CHANNEL_WEIGHTS>,
 *   embeddingScores?: Map<string, number>|Record<string, number>,
 *   preferredCategories?: string[],
 *   intent?: { id?: string }
 * }} [opts]
 * @returns {import('./interfaces.js').RankedHit[]}
 */
export function rankHits(hits, opts = {}) {
  const weights = { ...DEFAULT_CHANNEL_WEIGHTS, ...(opts.channelWeights || {}) };
  const limit = opts.limit ?? 8;
  const preferred = Array.isArray(opts.preferredCategories) ? opts.preferredCategories : [];
  const emb = toScoreMap(opts.embeddingScores);

  /** @type {Map<string, {
   *   doc: object,
   *   channelScores: Record<string, number>,
   *   channels: Set<string>,
   *   reasons: string[],
   *   sourceId: string
   * }>} */
  const byId = new Map();

  for (const hit of hits || []) {
    const id = hit?.doc?.id;
    if (!id) continue;
    let entry = byId.get(id);
    if (!entry) {
      entry = {
        doc: hit.doc,
        channelScores: {},
        channels: new Set(),
        reasons: [],
        sourceId: hit.sourceId || hit.doc._sourceId || hit.doc.category || 'unknown',
      };
      byId.set(id, entry);
    }
    const ch = hit.channel || 'keyword';
    entry.channels.add(ch);
    entry.channelScores[ch] = Math.max(entry.channelScores[ch] || 0, Number(hit.score) || 0);
    if (Array.isArray(hit.reasons)) {
      for (const r of hit.reasons) entry.reasons.push(`${ch}:${r}`);
    }
  }

  const ranked = [];

  for (const entry of byId.values()) {
    let score = 0;
    for (const [ch, chScore] of Object.entries(entry.channelScores)) {
      const w = weights[ch] ?? 1;
      score += chScore * w;
    }

    // Multi-channel agreement bonus
    if (entry.channels.size > 1) {
      score += 0.35 * (entry.channels.size - 1);
      entry.reasons.push(`fusion:channels=${entry.channels.size}`);
    }

    const category = String(entry.doc.category || '');
    if (preferred.length) {
      const idx = preferred.indexOf(category);
      if (idx >= 0) {
        score += Math.max(0.4, 1.5 - idx * 0.2);
        entry.reasons.push(`pref-category:${category}`);
      }
    }

    const conf = entry.doc.metadata?.confidence;
    if (conf === 'documented') {
      score += 0.3;
      entry.reasons.push('confidence:documented');
    } else if (conf === 'inferred') {
      score += 0.1;
    }

    // Future embedding similarity — additive, API-stable
    if (emb && entry.doc.id != null && emb.has(entry.doc.id)) {
      const sim = emb.get(entry.doc.id) || 0;
      score += sim * (weights.vector || 1.35) * 2;
      entry.reasons.push(`embedding:${round2(sim)}`);
      entry.channels.add('vector');
      entry.channelScores.vector = Math.max(entry.channelScores.vector || 0, sim);
    } else if (entry.doc.embedding?.status === 'ready') {
      score += 0.05;
      entry.reasons.push('embedding:ready');
    }

    ranked.push({
      doc: entry.doc,
      score: round2(score),
      sourceId: entry.sourceId,
      category,
      channels: [...entry.channels],
      reasons: uniq(entry.reasons).slice(0, 14),
      channelScores: Object.fromEntries(
        Object.entries(entry.channelScores).map(([k, v]) => [k, round2(v)]),
      ),
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit);
}

function toScoreMap(src) {
  if (!src) return null;
  if (src instanceof Map) return src;
  if (typeof src === 'object') return new Map(Object.entries(src).map(([k, v]) => [k, Number(v) || 0]));
  return null;
}

function uniq(arr) {
  return [...new Set(arr)];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default { rankHits, DEFAULT_CHANNEL_WEIGHTS };
