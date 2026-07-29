/**
 * intentDetector.js — Rule-based intent detection (no LLM, no project IDs).
 *
 * Intents are abstract conversational goals. Project/entity names in the
 * message become free-text signals for retrieval — never hardcoded winners.
 */

/** @typedef {{ id: string, label: string, weight: number, patterns: RegExp[] }} IntentRule */

/** @type {IntentRule[]} */
export const INTENT_RULES = [
  {
    id: 'introduce_self',
    label: 'Self introduction',
    weight: 1.2,
    patterns: [
      /\b(tell me about yourself|introduce yourself|who are you|about yourself)\b/i,
    ],
  },
  {
    id: 'recommend',
    label: 'Recommend / prioritize work',
    weight: 1.15,
    patterns: [
      /\b(which|what) (project|work|demo).*(first|start|look at|see|show|open)\b/i,
      /\b(should i|where should i) (start|look|see|begin)\b/i,
      /\b(best|strongest|most impressive) (project|work|demo)\b/i,
      /\bimpress (a )?(recruiter|interviewer|faang)\b/i,
      /\bkeep (only )?two\b/i,
    ],
  },
  {
    id: 'walkthrough',
    label: 'Documentation walkthrough',
    weight: 1.2,
    patterns: [
      /\b(walk (me )?through|deep dive|in detail|documentation|open (the )?project|full (write-?up|breakdown))\b/i,
    ],
  },
  {
    id: 'explain',
    label: 'Explain a topic or system',
    weight: 1.0,
    patterns: [
      /\b(explain|describe|tell me about|what is|what's|how does|how do)\b/i,
    ],
  },
  {
    id: 'compare',
    label: 'Compare options',
    weight: 1.15,
    patterns: [
      /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b|\bor\b.+\bwhich\b/i,
    ],
  },
  {
    id: 'opinion',
    label: 'Opinion / take',
    weight: 1.1,
    patterns: [
      /\b(what do you think|your (take|opinion)|is \w+ overrated|worth it|thoughts on)\b/i,
    ],
  },
  {
    id: 'critique',
    label: 'Critique / challenge',
    weight: 1.2,
    patterns: [
      /\b(criticiz\w*|thin wrapper|bad choice|defend|concede|over-?engineered|convince me|aren't you just)\b/i,
    ],
  },
  {
    id: 'failure',
    label: 'Failures / risks / regrets',
    weight: 1.15,
    patterns: [
      /\b(failure modes?|what failed|regret|mistakes?|on-?call|production (incident|outage)|rebuild .{0,20}differently)\b/i,
    ],
  },
  {
    id: 'behavioral',
    label: 'Behavioral / soft skills',
    weight: 1.1,
    patterns: [
      /\b(leadership|disagreement|code review|how do you handle|tell me about a time|teamwork)\b/i,
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture / engineering depth',
    weight: 1.1,
    patterns: [
      /\b(architect(?:ure|ural|ing)?|five.?layer|trade-?offs?|system design|scalability|how .{0,20}built|why (flask|fastapi|react|postgres))\b/i,
    ],
  },
  {
    id: 'hiring',
    label: 'Hiring / fit',
    weight: 1.1,
    patterns: [
      /\b(why (should i )?hire|fit for|hiring|recruiter|salary|relocat|years of experience)\b/i,
    ],
  },
  {
    id: 'skill_check',
    label: 'Skill verification',
    weight: 1.05,
    patterns: [
      /\b(do you know|does he know|are you familiar|have you used|experience with)\b/i,
    ],
  },
  {
    id: 'greeting',
    label: 'Greeting',
    weight: 0.9,
    patterns: [/^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b/i],
  },
];

/**
 * @param {string} message
 * @returns {{ id: string, label: string, confidence: number, scores: Record<string, number>, signals: string[] }}
 */
export function detectIntent(message) {
  const text = String(message || '').trim();
  const scores = {};
  const signals = [];

  if (!text) {
    return {
      id: 'unknown',
      label: 'Unknown',
      confidence: 0.1,
      scores: { unknown: 0.1 },
      signals: ['empty'],
    };
  }

  for (const rule of INTENT_RULES) {
    let hit = 0;
    for (const re of rule.patterns) {
      if (re.test(text)) {
        hit += 1;
        signals.push(`${rule.id}:${re.source.slice(0, 40)}`);
      }
    }
    if (hit > 0) scores[rule.id] = hit * rule.weight;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return {
      id: 'unknown',
      label: 'Unknown',
      confidence: 0.35,
      scores: { unknown: 0.35 },
      signals: ['no-rule-match'],
    };
  }

  const [topId, topScore] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const rule = INTENT_RULES.find((r) => r.id === topId);
  const margin = topScore - second;
  const confidence = Math.max(0.4, Math.min(0.95, 0.55 + margin * 0.15 + (topScore > 1 ? 0.1 : 0)));

  return {
    id: topId,
    label: rule?.label || topId,
    confidence: round2(confidence),
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, round2(v)])),
    signals: signals.slice(0, 8),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default { detectIntent, INTENT_RULES };
