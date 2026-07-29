/**
 * metrics/technicalAccuracy.js — Rule checks vs known / absent tech & claims.
 */

import { metricResult } from '../interfaces.js';
import { DEFAULT_ABSENT_TECH, DEFAULT_KNOWN_TECH } from '../defaults.js';

export function scoreTechnicalAccuracy({ text, context = {} }) {
  const t = String(text || '');
  let score = 8;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'technicalAccuracy',
      label: 'Technical Accuracy',
      score: 0,
      notes: ['empty'],
      suggestions: ['Provide an answer with technical claims to score.'],
    });
  }

  const absent = context.absentTech?.length ? context.absentTech : DEFAULT_ABSENT_TECH;
  const known = new Set(
    (context.knownTech?.length ? context.knownTech : DEFAULT_KNOWN_TECH)
      .map((x) => String(x).toLowerCase()),
  );

  const honestGap = /\b(not (part|in|among|covered)|isn'?t|don'?t have|do not have|no (shipped|record)|absent|gap|won'?t invent)\b/i.test(t);

  for (const tech of absent) {
    const re = new RegExp(`\\b${escapeRe(tech)}\\b`, 'i');
    if (!re.test(t)) continue;
    // Claiming mastery without gap language is a miss
    const claimNearby = new RegExp(
      `(expert|proficient|built with|we use|I use|ships? with|using)\\s[^.]{0,40}${escapeRe(tech)}|${escapeRe(tech)}[^.]{0,40}(expert|production|shipped)`,
      'i',
    );
    if (claimNearby.test(t) && !honestGap) {
      score -= 2.2;
      notes.push(`absent-tech-claimed:${tech}`);
      suggestions.push(`Do not claim ${tech} as shipped experience; mark it as a gap if asked.`);
    } else if (!honestGap) {
      score -= 0.8;
      notes.push(`absent-tech-mentioned:${tech}`);
      suggestions.push(`If mentioning ${tech}, clarify it is outside the portfolio.`);
    } else {
      notes.push(`absent-tech-honest:${tech}`);
      score += 0.3;
    }
  }

  // Retrieved knowledge contradiction: if context docs exist, reward overlap
  const docs = context.retrievedKnowledge || [];
  if (docs.length) {
    const hay = JSON.stringify(docs).toLowerCase();
    const tokens = t.toLowerCase().match(/[a-z][a-z0-9+.#-]{2,}/g) || [];
    let hits = 0;
    for (const tok of tokens.slice(0, 40)) {
      if (known.has(tok) || hay.includes(tok)) hits += 1;
    }
    if (hits >= 3) {
      score += 0.6;
      notes.push(`context-overlap:${hits}`);
    } else if (hits === 0 && /\b(architect|API|SQL|backend|deploy)\b/i.test(t)) {
      score -= 0.7;
      notes.push('low-context-overlap');
      suggestions.push('Ground technical claims in retrieved knowledge or known stack labels.');
    }
  }

  // Self-contradiction light check
  if (/\balways\b/i.test(t) && /\bnever\b/i.test(t)) {
    score -= 0.8;
    notes.push('always-never-tension');
    suggestions.push('Resolve always/never tension; prefer scoped claims.');
  }

  return metricResult({
    id: 'technicalAccuracy',
    label: 'Technical Accuracy',
    score,
    weight: 1.25,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { scoreTechnicalAccuracy };
