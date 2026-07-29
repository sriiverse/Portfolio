/**
 * metrics/confidence.js — Calibration of certainty language.
 */

import { metricResult } from '../interfaces.js';
import { ABSOLUTE_PATTERNS, HUMILITY_MARKERS } from '../defaults.js';

export function scoreConfidence({ text, context = {} }) {
  const t = String(text || '');
  let score = 7.5;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'confidence',
      label: 'Confidence',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const absCount = ABSOLUTE_PATTERNS.filter((re) => re.test(t)).length;
  const hedges = HUMILITY_MARKERS.filter((re) => re.test(t)).length;
  const hasEvidence = /\b(because|shipped|demo|production|decision|documented|from (the )?work)\b/i.test(t);

  if (absCount && !hedges && !hasEvidence) {
    score -= 1.8 * Math.min(absCount, 3);
    notes.push(`uncalibrated-absolutes:${absCount}`);
    suggestions.push('Pair strong claims with evidence or a light hedge.');
  } else if (absCount && hasEvidence) {
    score += 0.4;
    notes.push('absolute-with-evidence');
  }

  // Too much hedging on a clear recommend / hiring ask
  const intentId = context.intent?.id || '';
  if ((intentId === 'recommend' || intentId === 'hiring') && hedges >= 3 && absCount === 0) {
    score -= 1.2;
    notes.push('over-hedged');
    suggestions.push('For recommend/hiring asks, lead with a clear pick, then qualify.');
  }

  // Empty confidence: neither clear stance nor hedge on opinion/compare
  if ((intentId === 'opinion' || intentId === 'compare') && absCount === 0 && hedges === 0 && t.length > 80) {
    score -= 0.6;
    notes.push('flat-stance');
    suggestions.push('State a clear stance, then note limits.');
  }

  if (hasEvidence) {
    score += 0.5;
    notes.push('evidence-language');
  }

  // Explicit confidence phrasing
  if (/\b(confident|clear(ly)?|from what'?s shipped|within (the )?scope)\b/i.test(t)) {
    score += 0.3;
    notes.push('explicit-calibration');
  }

  return metricResult({
    id: 'confidence',
    label: 'Confidence',
    score,
    weight: 1,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreConfidence };
