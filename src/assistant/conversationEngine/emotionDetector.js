/**
 * emotionDetector.js — Lightweight emotional tone signals (no LLM).
 */

/** @typedef {{ id: string, label: string, weight: number, patterns: RegExp[] }} EmotionRule */

/** @type {EmotionRule[]} */
export const EMOTION_RULES = [
  {
    id: 'skeptical',
    label: 'Skeptical / challenging',
    weight: 1.25,
    patterns: [
      /\b(really\?|seriously|convince me|thin wrapper|just a (wrapper|bot)|aren't you just|overrated|bad choice|doubt)\b/i,
      /\b(over-?engineered|smoke and mirrors|impressive on paper)\b/i,
    ],
  },
  {
    id: 'frustrated',
    label: 'Frustrated / impatient',
    weight: 1.2,
    patterns: [
      /\b(just answer|stop (with )?the|too long|tl;?dr|enough|why won't you|you're not)\b/i,
      /\b(annoying|useless|waste)\b/i,
    ],
  },
  {
    id: 'enthusiastic',
    label: 'Enthusiastic',
    weight: 1.1,
    patterns: [
      /\b(love|awesome|amazing|excited|can't wait|impressive|fantastic)\b/i,
      /!{2,}/,
    ],
  },
  {
    id: 'curious',
    label: 'Curious',
    weight: 1.0,
    patterns: [
      /\b(curious|wondering|interested|how (does|did|would)|why (did|do|would)|tell me more)\b/i,
      /\?{1,}/,
    ],
  },
  {
    id: 'formal',
    label: 'Formal / evaluative',
    weight: 0.95,
    patterns: [
      /\b(please|kindly|regarding|evaluate|assess|pursuant|opportunity)\b/i,
    ],
  },
  {
    id: 'neutral',
    label: 'Neutral',
    weight: 0.5,
    patterns: [/.*/], // fallback only if nothing else scores
  },
];

/**
 * @param {string} message
 * @returns {{ id: string, label: string, confidence: number, scores: Record<string, number>, signals: string[] }}
 */
export function detectEmotion(message) {
  const text = String(message || '').trim();
  const scores = {};
  const signals = [];

  for (const rule of EMOTION_RULES) {
    if (rule.id === 'neutral') continue;
    let hit = 0;
    for (const re of rule.patterns) {
      if (re.test(text)) {
        hit += 1;
        signals.push(rule.id);
      }
    }
    if (hit > 0) scores[rule.id] = hit * rule.weight;
  }

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return {
      id: 'neutral',
      label: 'Neutral',
      confidence: 0.55,
      scores: { neutral: 0.55 },
      signals: ['default-neutral'],
    };
  }

  const [topId, topScore] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const rule = EMOTION_RULES.find((r) => r.id === topId);
  const confidence = Math.max(0.4, Math.min(0.9, 0.5 + (topScore - second) * 0.1));

  return {
    id: topId,
    label: rule?.label || topId,
    confidence: Math.round(confidence * 100) / 100,
    scores: Object.fromEntries(ranked.map(([k, v]) => [k, Math.round(v * 100) / 100])),
    signals: [...new Set(signals)].slice(0, 8),
  };
}

export default { detectEmotion, EMOTION_RULES };
