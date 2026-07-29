/**
 * personaDetector.js — Infer visitor persona from vocabulary (no LLM).
 */

/** @typedef {{ id: string, label: string, weight: number, patterns: RegExp[] }} PersonaRule */

/** @type {PersonaRule[]} */
export const PERSONA_RULES = [
  {
    id: 'recruiter',
    label: 'Recruiter / hiring',
    weight: 1.2,
    patterns: [
      /\b(hir(e|ing|ed)|recruit(?:er|ers|ing)?|candidate|role|opening|fit for|salary|relocat(?:e|ion|ing)?|years of|manager|jd|job description)\b/i,
    ],
  },
  {
    id: 'engineer',
    label: 'Engineer / technical interviewer',
    weight: 1.15,
    patterns: [
      /\b(architect|trade-?off|latency|throughput|api|schema|concurrency|scale|qps|refactor|failure modes?|complexity)\b/i,
    ],
  },
  {
    id: 'founder',
    label: 'Founder / product',
    weight: 1.1,
    patterns: [
      /\b(startup|mvp|ship|ownership|customers|revenue|early.?stage|build vs buy|time.to.market)\b/i,
    ],
  },
  {
    id: 'student',
    label: 'Student / learner',
    weight: 1.1,
    patterns: [
      /\b(learn|beginner|student|intern|explain simply|plain english|how did you learn|fresher|campus)\b/i,
    ],
  },
  {
    id: 'curious',
    label: 'Curious visitor',
    weight: 0.8,
    patterns: [
      /\b(cool|interesting|wow|just browsing|looking around|what can you do)\b/i,
    ],
  },
];

/**
 * @param {string} message
 * @param {{ priorPersona?: string|null }} [ctx]
 * @returns {{ id: string, label: string, confidence: number, scores: Record<string, number>, signals: string[] }}
 */
export function detectPersona(message, ctx = {}) {
  const text = String(message || '').trim();
  const scores = {};
  const signals = [];

  for (const rule of PERSONA_RULES) {
    let hit = 0;
    for (const re of rule.patterns) {
      if (re.test(text)) {
        hit += 1;
        signals.push(rule.id);
      }
    }
    if (hit > 0) scores[rule.id] = hit * rule.weight;
  }

  // Light prior carry — does not hard-lock persona
  if (ctx.priorPersona && typeof ctx.priorPersona === 'string') {
    scores[ctx.priorPersona] = (scores[ctx.priorPersona] || 0) + 0.35;
    signals.push(`prior:${ctx.priorPersona}`);
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return {
      id: 'unknown',
      label: 'Unknown',
      confidence: 0.3,
      scores: { unknown: 0.3 },
      signals: ['no-persona-signal'],
    };
  }

  const [topId, topScore] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const rule = PERSONA_RULES.find((r) => r.id === topId);
  const confidence = Math.max(0.35, Math.min(0.92, 0.5 + (topScore - second) * 0.12));

  return {
    id: topId,
    label: rule?.label || topId,
    confidence: Math.round(confidence * 100) / 100,
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100])),
    signals: [...new Set(signals)].slice(0, 8),
  };
}

export default { detectPersona, PERSONA_RULES };
