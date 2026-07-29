/**
 * metrics/voiceConsistency.js — SRIIVERSE spoken voice / person consistency.
 */

import { metricResult } from '../interfaces.js';
import {
  VOICE_FIRST_PERSON,
  VOICE_THIRD_PERSON,
  IMPL_LEAK_PATTERNS,
  BROCHURE_PATTERNS,
} from '../defaults.js';

export function scoreVoiceConsistency({ text, context = {} }) {
  const t = String(text || '');
  let score = 8;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'voiceConsistency',
      label: 'Voice Consistency',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const preferFirst = context.firstPersonPreferred !== false;
  const first = VOICE_FIRST_PERSON.filter((re) => re.test(t)).length;
  const third = VOICE_THIRD_PERSON.filter((re) => re.test(t)).length;

  if (preferFirst) {
    if (first === 0 && third === 0 && t.length > 60) {
      score -= 1.2;
      notes.push('impersonal');
      suggestions.push('Use a clear first-person assistant voice (“I can walk you through…”).');
    } else if (first > 0) {
      score += 0.5;
      notes.push('first-person-present');
    }
    // Mixing “I built QueryForge” (assistant claiming human authorship) is a voice break
    if (/\bI (built|shipped|designed|wrote)\b/i.test(t) && /\b(QueryForge|RepoRadar|Placement)\b/i.test(t)) {
      // Acceptable if speaking as Sudhanshu persona — flag lightly unless "he" also used oddly
      if (!/\b(Sudhanshu|he|his)\b/i.test(t) && /\bas(sistant| AI)\b/i.test(String(context.question || ''))) {
        notes.push('authorship-ambiguity');
      }
    }
  }

  // Abrupt person flip inside one answer
  if (first >= 2 && third >= 2 && /\bI\b/.test(t) && /\bhe\b/i.test(t)) {
    // Allow “I represent Sudhanshu / he ships…” pattern
    if (!/\b(Sudhanshu|his work|his portfolio|on his behalf)\b/i.test(t)) {
      score -= 1;
      notes.push('person-flip');
      suggestions.push('Keep person consistent, or explicitly frame “I / he” roles once.');
    }
  }

  for (const p of IMPL_LEAK_PATTERNS) {
    if (p.re.test(t)) {
      score -= 1.3;
      notes.push(`voice-impl-leak:${p.id}`);
      suggestions.push(p.tip);
    }
  }

  for (const p of BROCHURE_PATTERNS) {
    if (p.re.test(t) && context.mode !== 'documentation') {
      score -= 1.1;
      notes.push(`voice-brochure:${p.id}`);
      suggestions.push('Stay in spoken voice unless documentation mode is intentional.');
    }
  }

  // Tone match to persona (light)
  const persona = context.persona || '';
  if (persona === 'student' && /\b(QPS|p99|schema drift)\b/i.test(t) && !/\b(simply|plain|basically|in short)\b/i.test(t)) {
    score -= 0.4;
    notes.push('persona-density');
    suggestions.push('For student persona, add one plain-language beat.');
  }
  if (persona === 'engineer' && t.length > 100 && !/\b(trade-?off|constraint|latency|architect|because)\b/i.test(t)) {
    score -= 0.5;
    notes.push('engineer-voice-thin');
    suggestions.push('Engineer persona expects at least one constraint/trade-off beat.');
  }

  return metricResult({
    id: 'voiceConsistency',
    label: 'Voice Consistency',
    score,
    weight: 1.1,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

export default { scoreVoiceConsistency };
