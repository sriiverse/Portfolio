/**
 * conversationEngine.js — Context preparation only (no LLM).
 *
 * Pipeline:
 *   message → intent → persona → emotion → retrieval plan
 *          → load/search knowledge → rank → strategy → context package
 *
 * Inject knowledge adapters via opts.knowledge so the engine stays
 * decoupled from any specific knowledge store implementation.
 */

import { detectIntent } from './intentDetector.js';
import { detectPersona } from './personaDetector.js';
import { detectEmotion } from './emotionDetector.js';
import { buildRetrievalPlan } from './retrievalPlanner.js';
import { rankKnowledgeDocuments } from './knowledgeRanker.js';
import { buildConversationStrategy } from './strategyBuilder.js';

/**
 * Default knowledge adapter — uses modular knowledge layer.
 * Swap via opts.knowledge without changing engine logic.
 */
async function defaultKnowledgeAdapter() {
  const mod = await import('../knowledge/knowledgeLoader.js');
  return {
    search: (query, o) => mod.searchKnowledge(query, o),
    loadCategory: (category, o) => mod.loadCategory(category, o),
    bootstrap: () => mod.bootstrapKnowledgeSources(),
  };
}

/**
 * Prepare a conversation context package for a downstream LLM (or mock).
 *
 * @param {string} message
 * @param {{
 *   priorPersona?: string|null,
 *   limit?: number,
 *   knowledge?: {
 *     search?: (query: string, opts: object) => Promise<Array<{doc:object,score?:number,sourceId?:string}>>,
 *     loadCategory?: (category: string, opts?: object) => Promise<object[]>,
 *     bootstrap?: () => Promise<unknown>
 *   }
 * }} [opts]
 * @returns {Promise<{
 *   intent: object,
 *   persona: object,
 *   emotion: object,
 *   retrievedKnowledge: Array<object>,
 *   conversationStrategy: object,
 *   confidence: number,
 *   meta: object
 * }>}
 */
export async function prepareContext(message, opts = {}) {
  const text = String(message || '');

  const intent = detectIntent(text);
  const persona = detectPersona(text, { priorPersona: opts.priorPersona ?? null });
  const emotion = detectEmotion(text);

  const retrievalPlan = buildRetrievalPlan({
    intent,
    persona,
    message: text,
    limit: opts.limit ?? 6,
  });

  const knowledge = opts.knowledge || (await defaultKnowledgeAdapter());
  if (typeof knowledge.bootstrap === 'function') {
    await knowledge.bootstrap();
  }

  const documents = await gatherCandidateDocuments(knowledge, retrievalPlan);
  const ranked = rankKnowledgeDocuments(documents, retrievalPlan);

  const retrievedKnowledge = ranked.map((hit) => ({
    id: hit.doc?.id ?? null,
    category: hit.category,
    sourceId: hit.sourceId,
    score: hit.score,
    reasons: hit.reasons,
    tags: Array.isArray(hit.doc?.tags) ? hit.doc.tags : [],
    // Compact content preview for the context package — full doc available via hit.doc
    summary: summarizeDoc(hit.doc),
    document: hit.doc,
  }));

  const conversationStrategy = buildConversationStrategy({
    intent,
    persona,
    emotion,
    retrievalPlan,
    rankedCount: ranked.length,
  });

  const confidence = computePackageConfidence({
    intent,
    persona,
    emotion,
    rankedCount: ranked.length,
    topScore: ranked[0]?.score ?? 0,
  });

  return {
    intent,
    persona,
    emotion,
    retrievedKnowledge,
    conversationStrategy,
    confidence,
    meta: {
      retrievalPlan,
      preparedAt: new Date().toISOString(),
      engine: 'conversationEngine/v1',
      llm: false,
    },
  };
}

/**
 * Collect candidate docs: category loads + optional search hits.
 * @param {object} knowledge
 * @param {ReturnType<typeof buildRetrievalPlan>} plan
 */
async function gatherCandidateDocuments(knowledge, plan) {
  const byId = new Map();

  // Prefer category loads for planned domains
  if (typeof knowledge.loadCategory === 'function') {
    for (const category of plan.categories) {
      try {
        const docs = await knowledge.loadCategory(category, { validate: true });
        for (const doc of docs || []) {
          if (!doc?.id) continue;
          const keyed = { ...doc, _sourceId: doc._sourceId || category };
          byId.set(doc.id, keyed);
        }
      } catch {
        // Skip missing / failed categories — engine stays resilient
      }
    }
  }

  // Lexical search can surface cross-category or weakly tagged docs
  if (typeof knowledge.search === 'function' && plan.query) {
    try {
      const hits = await knowledge.search(plan.query, {
        categories: plan.categories,
        limit: Math.max(plan.limit * 3, 12),
        loadIfNeeded: plan.loadIfNeeded,
      });
      for (const hit of hits || []) {
        const doc = hit.doc;
        if (!doc?.id) continue;
        if (!byId.has(doc.id)) {
          byId.set(doc.id, { ...doc, _sourceId: hit.sourceId || doc._sourceId });
        }
      }
    } catch {
      // search optional
    }
  }

  return [...byId.values()];
}

function summarizeDoc(doc) {
  if (!doc) return '';
  const content = doc.content;
  if (typeof content === 'string') return content.slice(0, 240);
  if (content && typeof content === 'object') {
    const title = content.title || content.headline || content.name;
    const blurb = content.summary || content.blurb || content.description || content.statement;
    const parts = [title, blurb].filter(Boolean).map(String);
    if (parts.length) return parts.join(' — ').slice(0, 240);
    try {
      return JSON.stringify(content).slice(0, 240);
    } catch {
      return String(doc.id || '');
    }
  }
  return String(doc.id || '');
}

/**
 * Blend detector + retrieval confidence into one package score.
 */
export function computePackageConfidence({ intent, persona, emotion, rankedCount, topScore }) {
  const i = intent?.confidence ?? 0.3;
  const p = persona?.confidence ?? 0.3;
  const e = emotion?.confidence ?? 0.5;
  const retrieval = rankedCount === 0
    ? 0.25
    : Math.min(0.95, 0.45 + Math.min(rankedCount, 6) * 0.06 + Math.min(topScore, 8) * 0.03);

  // Intent + retrieval dominate; persona/emotion are softer signals
  const blended = i * 0.4 + retrieval * 0.35 + p * 0.15 + e * 0.1;
  return Math.round(Math.max(0.15, Math.min(0.98, blended)) * 100) / 100;
}

export {
  detectIntent,
  detectPersona,
  detectEmotion,
  buildRetrievalPlan,
  rankKnowledgeDocuments,
  buildConversationStrategy,
};

export default { prepareContext, computePackageConfidence };
