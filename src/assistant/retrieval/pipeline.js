/**
 * pipeline.js — Semantic retrieval pipeline (no LLM).
 *
 * Question
 *   → Intent Detection
 *   → Keyword Search (+ Tag Search)  [+ Vector channel stub]
 *   → Relationship Expansion
 *   → Ranking
 *   → Context Package
 *   → (Assistant — consumer, not called here)
 */

import { buildRetrievalQuery, dedupeHits } from './interfaces.js';
import { keywordSearch } from './keywordSearch.js';
import { tagSearch } from './tagSearch.js';
import { relationshipSearch } from './relationshipSearch.js';
import { rankHits } from './ranking.js';
import { vectorSearch, vectorSearchStatus } from './vectorSearch.js';
import { loadDefaultCorpus } from './corpus.js';

/**
 * Intent → preferred knowledge categories (category-level only).
 * Mirrors retrieval planning without embedding project catalogs.
 */
export const INTENT_CATEGORY_HINTS = {
  introduce_self: ['identity', 'conversations', 'resume', 'projects'],
  recommend: ['projects', 'engineering', 'conversations', 'evaluation'],
  walkthrough: ['projects', 'engineering'],
  explain: ['projects', 'engineering', 'identity'],
  compare: ['opinions', 'engineering', 'projects'],
  opinion: ['opinions', 'engineering'],
  critique: ['failures', 'engineering', 'projects', 'opinions'],
  failure: ['failures', 'engineering', 'projects'],
  behavioral: ['behavioral', 'identity', 'conversations'],
  architecture: ['engineering', 'projects', 'opinions'],
  hiring: ['identity', 'resume', 'projects', 'conversations'],
  skill_check: ['resume', 'projects', 'engineering', 'identity'],
  greeting: ['conversations', 'identity'],
  unknown: ['identity', 'projects', 'conversations'],
};

/**
 * Run the full retrieval pipeline and return a context package.
 *
 * @param {string} question
 * @param {{
 *   detectIntent?: (q: string) => object|Promise<object>,
 *   loadCorpus?: (opts: object) => Promise<object[]>,
 *   categories?: string[],
 *   limit?: number,
 *   maxHops?: number,
 *   enableVector?: boolean,
 *   embeddingScores?: Map<string, number>|Record<string, number>,
 *   indexSearch?: Function,
 *   queryVector?: number[]|Float32Array|null,
 *   channelWeights?: object
 * }} [opts]
 * @returns {Promise<import('./interfaces.js').RetrievalContextPackage>}
 */
export async function retrieve(question, opts = {}) {
  const text = String(question || '');
  const detectIntent = opts.detectIntent || defaultDetectIntent;
  const intent = await Promise.resolve(detectIntent(text));

  const categories = opts.categories
    || INTENT_CATEGORY_HINTS[intent?.id]
    || INTENT_CATEGORY_HINTS.unknown;

  const loadCorpus = opts.loadCorpus || loadDefaultCorpus;
  let corpus = await loadCorpus({ categories, validate: true });

  // Ensure injected vector score targets exist in corpus (may sit outside category filter).
  corpus = await ensureScoredDocsInCorpus(corpus, opts.embeddingScores, loadCorpus);

  // Knowledge graph backbone — built from full corpus when possible
  let graph = opts.graph || null;
  if (!graph && opts.useGraph !== false) {
    try {
      const kg = await import('../knowledge/knowledgeGraph.js');
      const full = await loadCorpus({ validate: true });
      graph = kg.buildKnowledgeGraph(full);
      // Merge any graph docs missing from category-filtered corpus
      const have = new Set(corpus.map((d) => d.id));
      for (const doc of full) {
        if (doc?.id && !have.has(doc.id)) {
          corpus.push(doc);
          have.add(doc.id);
        }
      }
    } catch {
      graph = null;
    }
  }

  const query = buildRetrievalQuery(text, {
    intent,
    categories,
    limit: opts.limit ?? 10,
    queryVector: opts.queryVector ?? null,
  });

  // --- Search stage (keyword + tag + optional vector) ---
  const keywordHits = keywordSearch(query, corpus, { limit: query.limit });
  const tagHits = tagSearch(query, corpus, { limit: query.limit });

  let vectorHits = [];
  if (opts.enableVector !== false) {
    vectorHits = await Promise.resolve(vectorSearch(query, corpus, {
      limit: query.limit,
      embeddingScores: opts.embeddingScores,
      indexSearch: opts.indexSearch,
    }));
  }

  let seedHits = dedupeHits([...keywordHits, ...tagHits, ...vectorHits]);

  // Intent category prior when lexical channels miss — still category-level only.
  if (!seedHits.length) {
    seedHits = categoryPriorHits(corpus, categories, {
      limit: Math.min(4, opts.limit ?? 6),
      intentId: intent?.id,
    });
  }

  // --- Relationship expansion (knowledge-graph backbone when available) ---
  const expansionTrace = { seedIds: [], addedIds: [], edges: [] };
  const relationshipHits = relationshipSearch(query, corpus, {
    seedHits: seedHits.slice(0, Math.max(3, Math.min(8, seedHits.length || 3))),
    maxHops: opts.maxHops ?? 2,
    limit: query.limit,
    graph,
    _trace: expansionTrace,
  });

  // --- Ranking / fusion ---
  const ranked = rankHits(
    [...seedHits, ...relationshipHits],
    {
      limit: opts.limit ?? 6,
      preferredCategories: categories,
      intent,
      channelWeights: opts.channelWeights,
      embeddingScores: opts.embeddingScores,
    },
  );

  const confidence = computeRetrievalConfidence({
    intent,
    seedCount: seedHits.length,
    rankedCount: ranked.length,
    topScore: ranked[0]?.score ?? 0,
    vectorActive: vectorHits.length > 0,
  });

  /** @type {import('./interfaces.js').RetrievalContextPackage} */
  const pack = {
    question: text.trim(),
    intent,
    retrievedKnowledge: ranked,
    context: {
      documents: ranked.map((h) => h.doc),
      citations: ranked.map((h) => ({
        id: h.doc?.id ?? null,
        category: h.category,
        score: h.score,
        channels: h.channels,
      })),
      expansion: expansionTrace,
      channelsUsed: uniqueChannels([
        ...seedHits,
        ...keywordHits,
        ...tagHits,
        ...vectorHits,
        ...relationshipHits,
      ]),
      graph: graph
        ? {
          used: true,
          nodeCount: graph.nodes.size,
          edgeCount: graph.edges.length,
        }
        : { used: false },
    },
    confidence,
    meta: {
      pipeline: 'retrieval/v1',
      stages: [
        'intent',
        'keyword',
        'tag',
        'vector',
        'relationship',
        'ranking',
        'context_package',
      ],
      vector: vectorSearchStatus(),
      knowledgeGraph: Boolean(graph),
      categories,
      corpusSize: corpus.length,
      preparedAt: new Date().toISOString(),
      llm: false,
      assistant: 'consumer-not-invoked',
    },
  };

  return pack;
}

async function defaultDetectIntent(message) {
  const { detectIntent } = await import('../conversationEngine/intentDetector.js');
  return detectIntent(message);
}

function uniqueChannels(hits) {
  return [...new Set(hits.map((h) => h.channel).filter(Boolean))];
}

export function computeRetrievalConfidence({
  intent,
  seedCount,
  rankedCount,
  topScore,
  vectorActive,
}) {
  const i = intent?.confidence ?? 0.35;
  const seeds = seedCount === 0 ? 0.2 : Math.min(0.9, 0.4 + seedCount * 0.05);
  const ranked = rankedCount === 0 ? 0.2 : Math.min(0.95, 0.45 + rankedCount * 0.06 + Math.min(topScore, 10) * 0.02);
  const vectorBonus = vectorActive ? 0.05 : 0;
  const blended = i * 0.35 + seeds * 0.25 + ranked * 0.35 + vectorBonus;
  return Math.round(Math.max(0.15, Math.min(0.98, blended)) * 100) / 100;
}

/**
 * Soft seeds from preferred categories when keyword/tag miss.
 * Score decays by category order; channel labeled as keyword meta prior.
 * @param {object[]} corpus
 * @param {string[]} categories
 * @param {{ limit?: number, intentId?: string }} [opts]
 */
export function categoryPriorHits(corpus, categories, opts = {}) {
  const limit = opts.limit ?? 4;
  const order = Array.isArray(categories) ? categories : [];
  if (!order.length) return [];

  const hits = [];
  for (let i = 0; i < order.length; i += 1) {
    const cat = order[i];
    const docs = (corpus || []).filter((d) => d?.category === cat);
    for (const doc of docs) {
      const score = Math.max(0.35, 1.4 - i * 0.25);
      hits.push({
        doc,
        score: Math.round(score * 100) / 100,
        channel: 'keyword',
        sourceId: doc._sourceId || cat,
        reasons: [
          `category-prior:${cat}`,
          opts.intentId ? `intent:${opts.intentId}` : 'intent:unknown',
        ].filter(Boolean),
        meta: { prior: true, categoryIndex: i },
      });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}

async function ensureScoredDocsInCorpus(corpus, embeddingScores, loadCorpus) {
  if (!embeddingScores) return corpus;
  const ids = embeddingScores instanceof Map
    ? [...embeddingScores.keys()]
    : Object.keys(embeddingScores);
  if (!ids.length) return corpus;

  const have = new Set((corpus || []).map((d) => d.id));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return corpus;

  const full = await loadCorpus({ validate: true });
  const byId = new Map(full.map((d) => [d.id, d]));
  const extra = missing.map((id) => byId.get(id)).filter(Boolean);
  return extra.length ? [...corpus, ...extra] : corpus;
}

export default { retrieve, INTENT_CATEGORY_HINTS, computeRetrievalConfidence, categoryPriorHits };
