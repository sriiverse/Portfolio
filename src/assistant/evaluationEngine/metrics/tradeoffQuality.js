/**
 * metrics/tradeoffQuality.js — Explicit alternatives / costs.
 */

import { metricResult } from '../interfaces.js';
import { TRADEOFF_MARKERS } from '../defaults.js';

export function scoreTradeoffQuality({ text, context = {} }) {
  const t = String(text || '');
  let score = 6;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'tradeoffQuality',
      label: 'Trade-off Quality',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const intentId = context.intent?.id || '';
  const q = String(context.question || '');
  const expectsTradeoff = /compare|opinion|architecture|critique|recommend/.test(intentId)
    || /\b(trade-?off|vs\.?|versus|why (not|flask|fastapi|react|postgres)|alternative)\b/i.test(q);

  let hits = 0;
  for (const re of TRADEOFF_MARKERS) {
    if (re.test(t)) hits += 1;
  }

  const hasBothSides = /\b(but|however|while|although|in exchange|at the cost)\b/i.test(t)
    && hits >= 1;

  if (hits >= 2 || hasBothSides) {
    score += 2.5;
    notes.push(hasBothSides ? 'balanced-tradeoff' : `tradeoff-markers:${hits}`);
  } else if (hits === 1) {
    score += 1.2;
    notes.push('tradeoff-mentioned');
  } else if (expectsTradeoff) {
    score -= 2.2;
    notes.push('missing-tradeoff');
    suggestions.push('Name the alternative and what you give up / gain.');
  } else {
    // Soft default when not required
    score = 7;
    notes.push('tradeoff-not-required');
  }

  // Named pair (A vs B)
  if (/\b\w+\s+vs\.?\s+\w+\b/i.test(t) || /\b\w+\s+versus\s+\w+\b/i.test(t)) {
    score += 0.8;
    notes.push('named-comparison');
  }

  // Fake trade-off: only praise, no cost
  if (/\b(best|perfect|no downside)\b/i.test(t) && hits === 0 && expectsTradeoff) {
    score -= 1.5;
    notes.push('one-sided');
    suggestions.push('Avoid “perfect” without stating a cost or limit.');
  }

  return metricResult({
    id: 'tradeoffQuality',
    label: 'Trade-off Quality',
    score,
    weight: 1.15,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreTradeoffQuality };
