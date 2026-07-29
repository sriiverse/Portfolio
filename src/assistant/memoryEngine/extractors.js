/**
 * extractors.js — Infer topic / projects / interests / stage from free text.
 * Heuristic only — no LLM, no persistence.
 */

import { CONVERSATION_STAGES } from './interfaces.js';

/** Known project needles (labels → stable id). Not a ranking. */
export const PROJECT_CATALOG = [
  { id: 'queryforge', names: ['QueryForgeAI', 'QueryForge', 'queryforge'] },
  { id: 'reporadar', names: ['RepoRadarAI', 'RepoRadar', 'reporadar'] },
  { id: 'placementpro', names: ['Placement Pro+', 'Placement Pro', 'PlacementPro', 'placement pro'] },
];

const INTEREST_PATTERNS = [
  { id: 'backend', re: /\b(backend|server|api|flask|fastapi|python|rest|auth)\b/i },
  { id: 'ai', re: /\b(ai|ml|llm|gpt|rag|prompt|model|inference)\b/i },
  { id: 'database', re: /\b(database|sql|postgres|mongo|query|schema|index)\b/i },
  { id: 'frontend', re: /\b(frontend|react|typescript|ui|ux|css|component)\b/i },
  { id: 'architecture', re: /\b(architect(?:ure)?|five-?layer|system design|scalability|trade-?off)\b/i },
  { id: 'devops', re: /\b(docker|deploy|ci\/?cd|kubernetes)\b/i },
  { id: 'hiring', re: /\b(hir(e|ing)|recruit|salary|fit for|role|jd)\b/i },
];

const TOPIC_PATTERNS = [
  { topic: 'architecture', re: /\b(architect(?:ure)?|five-?layer|system design)\b/i },
  { topic: 'comparison', re: /\b(compare|versus|vs\.?|difference between)\b/i },
  { topic: 'failures', re: /\b(fail(?:ure|ed)?|went wrong|mistake|lesson)\b/i },
  { topic: 'introduction', re: /\b(tell me about yourself|who are you|introduce)\b/i },
  { topic: 'recommendation', re: /\b(which project|where should i start|best (project|demo))\b/i },
  { topic: 'hiring', re: /\b(why hire|fit for|recruiter|salary)\b/i },
  { topic: 'stack', re: /\b(stack|flask|fastapi|react|postgres|tech)\b/i },
];

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractProjects(text) {
  const t = String(text || '');
  const hits = [];
  for (const p of PROJECT_CATALOG) {
    for (const name of p.names) {
      const re = new RegExp(`\\b${escapeRe(name).replace(/\\ /g, '\\s+')}\\b`, 'i');
      if (re.test(t)) {
        hits.push(p.id);
        break;
      }
    }
  }
  return [...new Set(hits)];
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function extractInterests(text) {
  const t = String(text || '');
  const hits = [];
  for (const row of INTEREST_PATTERNS) {
    if (row.re.test(t)) hits.push(row.id);
  }
  // Free tech tokens (light)
  const tech = t.match(/\b(python|flask|fastapi|react|typescript|postgresql|mongodb|docker|sql)\b/gi) || [];
  for (const tok of tech) hits.push(tok.toLowerCase());
  return [...new Set(hits)];
}

/**
 * @param {string} text
 * @param {{ projects?: string[] }} [hints]
 * @returns {string|null}
 */
export function extractTopic(text, hints = {}) {
  const t = String(text || '');
  for (const row of TOPIC_PATTERNS) {
    if (row.re.test(t)) return row.topic;
  }
  const projects = hints.projects?.length ? hints.projects : extractProjects(t);
  if (projects.length === 1) return `project:${projects[0]}`;
  if (projects.length > 1) return 'multi-project';
  return null;
}

/**
 * Infer conversation stage from depth + signals.
 * @param {{ depth: number, questionCount: number, text?: string, explicit?: string }} input
 * @returns {string}
 */
export function inferStage(input) {
  if (input.explicit && CONVERSATION_STAGES.includes(input.explicit)) {
    return input.explicit;
  }
  const t = String(input.text || '');
  const depth = input.depth || 0;
  const q = input.questionCount || 0;

  if (/\b(thanks|thank you|that'?s all|goodbye|bye|wrap up)\b/i.test(t)) return 'closing';
  if (/\b(compare|versus|vs\.?|difference)\b/i.test(t)) return 'comparing';
  if (depth >= 4 || q >= 5 || /\b(deep dive|in detail|walk (me )?through|internals)\b/i.test(t)) {
    return 'deepening';
  }
  if (depth >= 1 || q >= 1) return 'exploring';
  return 'opening';
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default {
  PROJECT_CATALOG,
  extractProjects,
  extractInterests,
  extractTopic,
  inferStage,
};
