/**
 * metrics/humility.js — Honesty about gaps, limits, and inference.
 */

import { metricResult } from '../interfaces.js';
import { HUMILITY_MARKERS, FLUFF_PATTERNS, ABSOLUTE_PATTERNS } from '../defaults.js';

export function scoreHumility({ text, context = {} }) {
  const t = String(text || '');
  let score = 7;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'humility',
      label: 'Humility',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const hedges = HUMILITY_MARKERS.filter((re) => re.test(t)).length;
  if (hedges) {
    score += Math.min(2, hedges * 0.7);
    notes.push(`humility-markers:${hedges}`);
  }

  for (const re of FLUFF_PATTERNS) {
    if (re.test(t)) {
      score -= 1.5;
      notes.push('ego-fluff');
      suggestions.push('Strip ego / marketing fluff; stick to shipped evidence.');
    }
  }

  // Gap questions should show humility
  const q = String(context.question || '');
  const asksGap = /\b(don'?t|do you not|missing|weakness|gap|fail|never|kubernetes|django|redis)\b/i.test(q);
  if (asksGap) {
    if (hedges || /\b(gap|not|don'?t|isn'?t|honest)\b/i.test(t)) {
      score += 1.2;
      notes.push('gap-honesty');
    } else {
      score -= 2;
      notes.push('gap-deflected');
      suggestions.push('When asked about gaps, acknowledge them plainly.');
    }
  }

  if (ABSOLUTE_PATTERNS.some((re) => re.test(t)) && hedges === 0) {
    score -= 1;
    notes.push('absolute-without-humility');
    suggestions.push('Add a scoped limit when using absolute language.');
  }

  return metricResult({
    id: 'humility',
    label: 'Humility',
    score,
    weight: 1,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreHumility };
