/**
 * metrics/conciseness.js — Length discipline vs intent / mode.
 */

import { metricResult, wordCount, sentenceCount } from '../interfaces.js';

/** Soft word budgets by intent / mode. */
const BUDGETS = {
  greeting: { ideal: 40, soft: 90 },
  recommend: { ideal: 120, soft: 220 },
  walkthrough: { ideal: 280, soft: 520 },
  introduce_self: { ideal: 160, soft: 280 },
  failure: { ideal: 180, soft: 320 },
  architecture: { ideal: 220, soft: 400 },
  default: { ideal: 150, soft: 300 },
};

export function scoreConciseness({ text, context = {} }) {
  const t = String(text || '');
  const words = wordCount(t);
  const sents = sentenceCount(t);
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'conciseness',
      label: 'Conciseness',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const intentId = context.intent?.id || 'default';
  const mode = context.mode || 'spoken';
  let budget = BUDGETS[intentId] || BUDGETS.default;
  if (mode === 'documentation') {
    budget = { ideal: budget.ideal * 1.4, soft: budget.soft * 1.6 };
  }
  if (mode === 'acknowledge') {
    budget = BUDGETS.greeting;
  }

  let score = 8.5;

  if (words < 8 && intentId !== 'greeting') {
    score -= 2;
    notes.push('too-thin');
    suggestions.push('Add one concrete detail; the answer is too thin for the ask.');
  }

  if (words > budget.soft) {
    const over = (words - budget.soft) / budget.soft;
    score -= Math.min(4, 1.5 + over * 2);
    notes.push(`over-budget:${words}>${budget.soft}`);
    suggestions.push(`Tighten toward ~${budget.ideal} words for this intent; cut repeated points.`);
  } else if (words > budget.ideal * 1.25) {
    score -= 0.8;
    notes.push('slightly-long');
    suggestions.push('Trim secondary asides; keep one idea per paragraph.');
  } else if (words >= budget.ideal * 0.5 && words <= budget.ideal * 1.15) {
    score += 0.6;
    notes.push('in-budget');
  }

  // Repetition penalty
  const sentences = t.split(/[.!?]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length > 20);
  const seen = new Set();
  let dupes = 0;
  for (const s of sentences) {
    const key = s.slice(0, 48);
    if (seen.has(key)) dupes += 1;
    seen.add(key);
  }
  if (dupes) {
    score -= Math.min(2, dupes * 0.9);
    notes.push(`repeated-sentences:${dupes}`);
    suggestions.push('Remove repeated sentences.');
  }

  if (sents > 12 && mode !== 'documentation') {
    score -= 0.7;
    notes.push('many-sentences');
  }

  return metricResult({
    id: 'conciseness',
    label: 'Conciseness',
    score,
    weight: 1,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreConciseness };
