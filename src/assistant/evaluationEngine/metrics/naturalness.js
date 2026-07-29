/**
 * metrics/naturalness.js — Spoken, human-sounding prose (rule-based).
 */

import { metricResult, wordCount, sentenceCount } from '../interfaces.js';
import { BROCHURE_PATTERNS, IMPL_LEAK_PATTERNS, FLUFF_PATTERNS } from '../defaults.js';

export function scoreNaturalness({ text }) {
  const t = String(text || '');
  let score = 8.5;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'naturalness',
      label: 'Naturalness',
      score: 0,
      notes: ['empty answer'],
      suggestions: ['Produce a spoken answer before scoring.'],
    });
  }

  for (const p of BROCHURE_PATTERNS) {
    if (p.re.test(t)) {
      score -= 1.6;
      notes.push(`brochure:${p.id}`);
      suggestions.push(p.tip);
    }
  }

  for (const p of IMPL_LEAK_PATTERNS) {
    if (p.re.test(t)) {
      score -= 1.2;
      notes.push(`impl-leak:${p.id}`);
      suggestions.push(p.tip);
    }
  }

  for (const re of FLUFF_PATTERNS) {
    if (re.test(t)) {
      score -= 0.8;
      notes.push('personality-fluff');
      suggestions.push('Remove unevidenced personality adjectives.');
    }
  }

  // Bullet-heavy / outline feel
  const lines = t.split('\n').filter((l) => l.trim());
  const bulletLines = lines.filter((l) => /^\s*([-*•]|\d+\.)\s+/.test(l)).length;
  if (lines.length >= 4 && bulletLines / lines.length > 0.55) {
    score -= 1.2;
    notes.push('outline-heavy');
    suggestions.push('Prefer spoken paragraphs over bullet outlines for conversational answers.');
  }

  // Extremely short or telegram style
  const words = wordCount(t);
  const sents = sentenceCount(t);
  if (words > 12 && sents === 1 && !/[.!?]$/.test(t.trim())) {
    score -= 0.5;
    notes.push('run-on-or-fragment');
  }

  // Contractions / conversational cues (bonus)
  if (/\b(I'?m|I'?ve|it'?s|that'?s|here'?s|don'?t|won'?t)\b/i.test(t)) {
    score += 0.3;
    notes.push('conversational-contractions');
  }

  return metricResult({
    id: 'naturalness',
    label: 'Naturalness',
    score,
    weight: 1.1,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreNaturalness };
