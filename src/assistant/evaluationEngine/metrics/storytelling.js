/**
 * metrics/storytelling.js — Narrative beats without brochure dumps.
 */

import { metricResult, sentenceCount } from '../interfaces.js';
import { STORY_MARKERS, BROCHURE_PATTERNS } from '../defaults.js';

export function scoreStorytelling({ text, context = {} }) {
  const t = String(text || '');
  let score = 6.5;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'storytelling',
      label: 'Storytelling',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const intentId = context.intent?.id || '';
  const storyRelevant = /behavioral|failure|introduce_self|walkthrough|recommend/.test(intentId)
    || /\b(tell me about|walk|story|fail|challenge|yourself)\b/i.test(String(context.question || ''));

  let markerHits = 0;
  for (const re of STORY_MARKERS) {
    if (re.test(t)) markerHits += 1;
  }

  if (markerHits >= 2) {
    score += 1.5;
    notes.push(`story-beats:${markerHits}`);
  } else if (storyRelevant && markerHits === 0) {
    score -= 1.5;
    notes.push('no-narrative-beats');
    suggestions.push('Add a short arc: situation → action → outcome (still spoken, not a card).');
  } else if (markerHits === 1) {
    score += 0.5;
    notes.push('light-narrative');
  }

  // Sequence words / time order
  if (/\b(first|then|after that|eventually|finally)\b/i.test(t)) {
    score += 0.7;
    notes.push('temporal-sequence');
  }

  // Brochure kills story
  for (const p of BROCHURE_PATTERNS) {
    if (p.re.test(t)) {
      score -= 1.2;
      notes.push(`brochure-breaks-story:${p.id}`);
      suggestions.push(p.tip);
    }
  }

  // Greeting / short clarify — storytelling less applicable
  if (intentId === 'greeting' || intentId === 'unknown') {
    score = Math.max(score, 7);
    notes.push('storytelling-soft-target');
  }

  if (sentenceCount(t) >= 3 && markerHits >= 1) {
    score += 0.3;
  }

  return metricResult({
    id: 'storytelling',
    label: 'Storytelling',
    score,
    weight: 0.9,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreStorytelling };
