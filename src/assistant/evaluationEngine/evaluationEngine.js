/**
 * evaluationEngine.js — Rule-based answer evaluation for regression testing.
 *
 * Does NOT call an LLM. Scores a generated answer across fixed metrics and
 * returns { score, breakdown, suggestions }.
 */

import { clamp10 } from './interfaces.js';
import { METRIC_RUNNERS } from './metrics/index.js';

/**
 * Evaluate a generated answer (rule-based only).
 *
 * @param {string|object} answerOrInput
 *   string answer, or `{ answer, question?, context?, intent?, mode? }`
 * @param {object} [maybeContext]  When first arg is a string, optional context
 * @returns {{
 *   score: number,
 *   breakdown: Record<string, number>,
 *   suggestions: string[],
 *   meta: object
 * }}
 */
export function evaluateAnswer(answerOrInput, maybeContext = {}) {
  const input = normalizeInput(answerOrInput, maybeContext);
  const pack = {
    text: input.answer,
    question: input.question,
    context: {
      question: input.question,
      intent: input.intent,
      persona: input.persona,
      mode: input.mode,
      knownProjects: input.knownProjects,
      knownTech: input.knownTech,
      absentTech: input.absentTech,
      retrievedKnowledge: input.retrievedKnowledge,
      firstPersonPreferred: input.firstPersonPreferred,
      projectStackMap: input.projectStackMap,
      ...input.context,
    },
  };

  const results = METRIC_RUNNERS.map((run) => run(pack));
  return aggregateResults(results, input);
}

/**
 * Aggregate metric results into the public regression report shape.
 * @param {import('./interfaces.js').MetricResult[]} results
 * @param {object} [input]
 */
export function aggregateResults(results, input = {}) {
  const list = Array.isArray(results) ? results : [];
  let weightSum = 0;
  let weighted = 0;
  /** @type {Record<string, number>} */
  const breakdown = {};
  /** @type {string[]} */
  const suggestions = [];
  /** @type {Record<string, object>} */
  const detail = {};

  for (const m of list) {
    const w = Number(m.weight) || 1;
    const s = clamp10(m.score);
    weightSum += w;
    weighted += s * w;
    breakdown[m.id] = s;
    detail[m.id] = {
      label: m.label,
      score: s,
      weight: w,
      notes: m.notes || [],
    };
    for (const tip of m.suggestions || []) {
      if (tip && !suggestions.includes(tip)) suggestions.push(tip);
    }
  }

  const score = weightSum > 0
    ? clamp10(weighted / weightSum)
    : 0;

  return {
    score,
    breakdown,
    suggestions: suggestions.slice(0, 12),
    meta: {
      engine: 'evaluationEngine/v1',
      llm: false,
      metricCount: list.length,
      detail,
      question: input.question || null,
      intent: input.intent?.id || null,
      mode: input.mode || null,
      evaluatedAt: new Date().toISOString(),
    },
  };
}

function normalizeInput(answerOrInput, maybeContext) {
  if (typeof answerOrInput === 'string') {
    return {
      answer: answerOrInput,
      question: maybeContext.question || '',
      intent: maybeContext.intent || null,
      persona: maybeContext.persona || null,
      mode: maybeContext.mode || 'spoken',
      knownProjects: maybeContext.knownProjects,
      knownTech: maybeContext.knownTech,
      absentTech: maybeContext.absentTech,
      retrievedKnowledge: maybeContext.retrievedKnowledge,
      firstPersonPreferred: maybeContext.firstPersonPreferred,
      projectStackMap: maybeContext.projectStackMap,
      context: maybeContext.context || maybeContext,
    };
  }

  const o = answerOrInput && typeof answerOrInput === 'object' ? answerOrInput : {};
  return {
    answer: String(o.answer ?? o.text ?? ''),
    question: o.question || maybeContext.question || '',
    intent: o.intent || maybeContext.intent || null,
    persona: o.persona || maybeContext.persona || null,
    mode: o.mode || maybeContext.mode || 'spoken',
    knownProjects: o.knownProjects || maybeContext.knownProjects,
    knownTech: o.knownTech || maybeContext.knownTech,
    absentTech: o.absentTech || maybeContext.absentTech,
    retrievedKnowledge: o.retrievedKnowledge || maybeContext.retrievedKnowledge,
    firstPersonPreferred: o.firstPersonPreferred ?? maybeContext.firstPersonPreferred,
    projectStackMap: o.projectStackMap || maybeContext.projectStackMap,
    context: { ...(maybeContext.context || {}), ...(o.context || {}) },
  };
}

/**
 * Convenience: score many { id, answer, question?, ... } fixtures.
 * @param {Array<object>} fixtures
 * @returns {Array<{ id: string, score: number, breakdown: object, suggestions: string[] }>}
 */
export function evaluateFixtures(fixtures) {
  return (fixtures || []).map((f, i) => {
    const report = evaluateAnswer(f);
    return {
      id: f.id || f.name || `fixture-${i}`,
      score: report.score,
      breakdown: report.breakdown,
      suggestions: report.suggestions,
      meta: report.meta,
    };
  });
}

/**
 * Pass/fail helper for regression gates.
 * @param {ReturnType<typeof evaluateAnswer>} report
 * @param {{ minScore?: number, minMetric?: number, requiredMetrics?: string[] }} [gate]
 */
export function passesGate(report, gate = {}) {
  const minScore = gate.minScore ?? 6.5;
  const minMetric = gate.minMetric ?? 4;
  const required = gate.requiredMetrics || Object.keys(report.breakdown || {});

  if ((report.score ?? 0) < minScore) {
    return { ok: false, reason: `score ${report.score} < ${minScore}` };
  }
  for (const id of required) {
    const v = report.breakdown?.[id];
    if (v == null || v < minMetric) {
      return { ok: false, reason: `metric ${id}=${v} < ${minMetric}` };
    }
  }
  return { ok: true, reason: 'pass' };
}

export default {
  evaluateAnswer,
  aggregateResults,
  evaluateFixtures,
  passesGate,
};
