/**
 * retrievalPlanner.js — Map intent → knowledge categories (no project hardcoding).
 *
 * Categories are knowledge-layer domains. Tag boosts are generic tokens
 * extracted from the message (technologies, verbs), not fixed project ids.
 */

/** Intent → preferred knowledge categories (ordered). */
export const INTENT_CATEGORY_MAP = {
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

/** Persona can gently re-order category priority (still category-level only). */
export const PERSONA_CATEGORY_BIAS = {
  recruiter: ['identity', 'projects', 'resume', 'conversations'],
  engineer: ['engineering', 'failures', 'projects', 'opinions'],
  founder: ['projects', 'identity', 'behavioral', 'engineering'],
  student: ['conversations', 'engineering', 'projects', 'identity'],
  curious: ['identity', 'projects', 'conversations'],
  unknown: [],
};

/**
 * Extract generic retrieval tokens from free text (not a project catalog).
 * @param {string} message
 * @returns {string[]}
 */
export function extractQueryTokens(message) {
  const stop = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'to', 'of',
    'in', 'on', 'for', 'with', 'about', 'as', 'by', 'at', 'from', 'it', 'this',
    'that', 'me', 'my', 'your', 'you', 'he', 'his', 'do', 'does', 'did', 'can',
    'could', 'would', 'should', 'what', 'which', 'who', 'how', 'why', 'when',
    'where', 'tell', 'show', 'please', 'just', 'like', 'want', 'need',
  ]);
  return String(message || '')
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stop.has(t))
    .slice(0, 24);
}

/**
 * Build a retrieval plan from detections.
 *
 * @param {{ intent: { id: string }, persona?: { id: string }, message: string, limit?: number }} input
 * @returns {{
 *   query: string,
 *   tokens: string[],
 *   categories: string[],
 *   limit: number,
 *   boostTags: string[],
 *   loadIfNeeded: boolean,
 *   rationale: string[]
 * }}
 */
export function buildRetrievalPlan(input) {
  const intentId = input?.intent?.id || 'unknown';
  const personaId = input?.persona?.id || 'unknown';
  const message = String(input?.message || '');
  const limit = Math.max(1, Math.min(20, input?.limit ?? 6));
  const rationale = [];

  const intentCats = (INTENT_CATEGORY_MAP[intentId] || INTENT_CATEGORY_MAP.unknown).slice();
  const personaBias = PERSONA_CATEGORY_BIAS[personaId] || [];

  // Merge: persona bias lifts overlapping categories without dropping intent needs
  const categories = [];
  const seen = new Set();
  const push = (c, why) => {
    if (!c || seen.has(c)) return;
    seen.add(c);
    categories.push(c);
    rationale.push(`${c} ← ${why}`);
  };

  for (const c of personaBias) {
    if (intentCats.includes(c)) push(c, `persona:${personaId}+intent:${intentId}`);
  }
  for (const c of intentCats) push(c, `intent:${intentId}`);
  for (const c of personaBias) push(c, `persona:${personaId}`);

  const tokens = extractQueryTokens(message);
  const boostTags = tokens.slice(0, 12);

  return {
    query: message.trim(),
    tokens,
    categories,
    limit,
    boostTags,
    loadIfNeeded: true,
    rationale,
  };
}

export default {
  buildRetrievalPlan,
  extractQueryTokens,
  INTENT_CATEGORY_MAP,
  PERSONA_CATEGORY_BIAS,
};
