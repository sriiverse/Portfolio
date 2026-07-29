/**
 * metrics/projectConsistency.js — Mentions align with known project labels.
 * Does not rank projects; only checks consistency / invention.
 */

import { metricResult } from '../interfaces.js';
import { DEFAULT_KNOWN_PROJECTS } from '../defaults.js';

/** Fabricated-looking product names (heuristic). */
const SUSPICIOUS_PRODUCT_RE = /\b([A-Z][a-z]+(?:AI|App|OS|Pro|Hub|Ly|ify)(?:AI)?)\b/g;

export function scoreProjectConsistency({ text, context = {} }) {
  const t = String(text || '');
  let score = 8;
  const notes = [];
  const suggestions = [];

  if (!t.trim()) {
    return metricResult({
      id: 'projectConsistency',
      label: 'Project Consistency',
      score: 0,
      notes: ['empty'],
      suggestions: [],
    });
  }

  const catalog = normalizeCatalog(context);
  const mentioned = findMentionedProjects(t, catalog);

  if (mentioned.length) {
    score += 0.5;
    notes.push(`known-projects:${mentioned.map((m) => m.id).join(',')}`);
  }

  // Invented projects: Capitalized *AI product tokens not in catalog
  const suspicious = [];
  let m;
  const re = new RegExp(SUSPICIOUS_PRODUCT_RE.source, 'g');
  while ((m = re.exec(t)) !== null) {
    const name = m[1];
    if (/^(Python|React|Flask|Docker|Postgres)/i.test(name)) continue;
    const known = catalog.some((p) => p.names.some((n) => n.toLowerCase() === name.toLowerCase()));
    if (!known) suspicious.push(name);
  }
  const uniqueSus = [...new Set(suspicious)];
  if (uniqueSus.length) {
    score -= Math.min(4, uniqueSus.length * 2);
    notes.push(`unknown-product:${uniqueSus.join(',')}`);
    suggestions.push(`Unknown product name(s): ${uniqueSus.join(', ')}. Stick to documented projects.`);
  }

  // Retrieved knowledge project ids should not be contradicted
  const docs = context.retrievedKnowledge || [];
  const docProjectIds = new Set();
  for (const hit of docs) {
    const doc = hit.doc || hit;
    const pid = doc?.metadata?.projectId || doc?.content?.projectId;
    if (pid) docProjectIds.add(String(pid).toLowerCase());
  }
  if (docProjectIds.size && mentioned.length) {
    const aligned = mentioned.some((m) => docProjectIds.has(m.id));
    if (aligned) {
      score += 0.6;
      notes.push('aligned-with-retrieved');
    }
  }

  // Stack attribution consistency: Flask + QueryForge is fine; FastAPI + QueryForge alone is soft warn if known mapping provided
  const stackMap = context.projectStackMap || {
    queryforge: [/flask/i, /postgres/i, /sql/i],
    reporadar: [/fastapi/i, /react/i, /typescript/i],
    placementpro: [/react/i, /python/i],
  };

  for (const hit of mentioned) {
    const expected = stackMap[hit.id];
    if (!expected) continue;
    // If answer pairs this project with a strongly wrong stack exclusive claim
    if (hit.id === 'queryforge' && /\bQueryForge\w*\b[^.!?]{0,60}\bFastAPI\b/i.test(t) && !/\bRepoRadar/i.test(t)) {
      score -= 1.5;
      notes.push('stack-mismatch:queryforge-fastapi');
      suggestions.push('QueryForge is Flask-orchestration in this portfolio; don’t attribute FastAPI to it.');
    }
    if (hit.id === 'reporadar' && /\bRepoRadar\w*\b[^.!?]{0,60}\bFlask\b/i.test(t) && !/\bQueryForge/i.test(t)) {
      score -= 1.5;
      notes.push('stack-mismatch:reporadar-flask');
      suggestions.push('RepoRadar uses FastAPI for async ingestion; don’t attribute Flask to it alone.');
    }
  }

  // Recommend ask with no project mention
  if ((context.intent?.id === 'recommend' || /\bwhich project\b/i.test(String(context.question || '')))
    && mentioned.length === 0) {
    score -= 2;
    notes.push('recommend-without-project');
    suggestions.push('Name a documented project when recommending where to start.');
  }

  return metricResult({
    id: 'projectConsistency',
    label: 'Project Consistency',
    score,
    weight: 1.2,
    notes,
    suggestions: [...new Set(suggestions)],
  });
}

function normalizeCatalog(context) {
  if (Array.isArray(context.knownProjects) && context.knownProjects.length) {
    return context.knownProjects.map((p) => {
      if (typeof p === 'string') return { id: p.toLowerCase(), names: [p] };
      return {
        id: String(p.id || p.names?.[0] || '').toLowerCase(),
        names: p.names || [p.id],
      };
    });
  }
  return DEFAULT_KNOWN_PROJECTS;
}

function findMentionedProjects(text, catalog) {
  const hits = [];
  for (const p of catalog) {
    for (const name of p.names) {
      const re = new RegExp(`\\b${escapeRe(name).replace(/\\ /g, '\\s+')}\\b`, 'i');
      if (re.test(text)) {
        hits.push(p);
        break;
      }
    }
  }
  return hits;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default { scoreProjectConsistency };
