/**
 * interfaces.js — Evaluation engine contracts (rule-based, no LLM).
 */

/**
 * @typedef {object} MetricResult
 * @property {string} id
 * @property {string} label
 * @property {number} score          0–10
 * @property {number} weight
 * @property {string[]} notes
 * @property {string[]} suggestions
 */

/**
 * @typedef {object} EvaluationContext
 * @property {string} [question]
 * @property {object} [intent]
 * @property {string} [persona]
 * @property {string[]} [knownProjects]
 * @property {string[]} [knownTech]
 * @property {string[]} [absentTech]
 * @property {object[]} [retrievedKnowledge]
 * @property {'spoken'|'documentation'|'acknowledge'|'clarify'} [mode]
 * @property {boolean} [firstPersonPreferred]
 */

/**
 * @typedef {object} EvaluationReport
 * @property {number} score
 * @property {Record<string, number>} breakdown
 * @property {string[]} suggestions
 * @property {object} [meta]
 */

export const METRIC_IDS = [
  'naturalness',
  'technicalAccuracy',
  'confidence',
  'humility',
  'storytelling',
  'conciseness',
  'voiceConsistency',
  'engineeringReasoning',
  'tradeoffQuality',
  'projectConsistency',
];

/**
 * @param {Partial<MetricResult> & { id: string, label: string }} partial
 * @returns {MetricResult}
 */
export function metricResult(partial) {
  const score = clamp10(partial.score ?? 5);
  return {
    id: partial.id,
    label: partial.label,
    score,
    weight: partial.weight ?? 1,
    notes: Array.isArray(partial.notes) ? partial.notes : [],
    suggestions: Array.isArray(partial.suggestions) ? partial.suggestions : [],
  };
}

export function clamp10(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(Math.max(0, Math.min(10, x)) * 10) / 10;
}

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function sentenceCount(text) {
  const parts = String(text || '').split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  return parts.length || (String(text || '').trim() ? 1 : 0);
}

export default {
  METRIC_IDS,
  metricResult,
  clamp10,
  wordCount,
  sentenceCount,
};
