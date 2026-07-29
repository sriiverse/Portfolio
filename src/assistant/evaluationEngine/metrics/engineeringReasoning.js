/**
 * metrics/engineeringReasoning.js — Cause, constraint, architecture signals.
 */

import { metricResult } from '../interfaces.js';
import { REASONING_MARKERS } from '../defaults.js';

export function scoreEngineeringReasoning({ text, context = {} }) {
  const t = String(text || '');
  let score = 6;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'engineeringReasoning',
      label: 'Engineering Reasoning',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const intentId = context.intent?.id || '';
  const expectsReasoning = /architecture|explain|compare|critique|failure|walkthrough|skill_check|recommend/.test(intentId)
    || /\b(why|how|architect|trade|design|scale)\b/i.test(String(context.question || ''));

  let hits = 0;
  for (const re of REASONING_MARKERS) {
    if (re.test(t)) hits += 1;
  }

  if (hits >= 2) {
    score += 2.2;
    notes.push(`reasoning-markers:${hits}`);
  } else if (hits === 1) {
    score += 1;
    notes.push('reasoning-light');
  } else if (expectsReasoning) {
    score -= 2;
    notes.push('missing-reasoning');
    suggestions.push('Explain at least one constraint or “because…” behind the choice.');
  }

  // Layer / system structure
  if (/\b(frontend|backend|data|deploy|five-?layer|API|schema)\b/i.test(t)) {
    score += 0.7;
    notes.push('systems-vocabulary');
  }

  // Pure feature list without why
  const featureList = (t.match(/^\s*[-*•]/gm) || []).length >= 4;
  if (featureList && hits === 0) {
    score -= 1.5;
    notes.push('feature-list-no-why');
    suggestions.push('Replace feature bullets with one reasoned paragraph.');
  }

  if (intentId === 'greeting') {
    score = Math.max(score, 7);
    notes.push('reasoning-soft-target');
  }

  return metricResult({
    id: 'engineeringReasoning',
    label: 'Engineering Reasoning',
    score,
    weight: 1.2,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreEngineeringReasoning };
