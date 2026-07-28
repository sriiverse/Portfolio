/**
 * adaptive.js — V4 Adaptive Communication
 *
 * Maps visitor audience (recruiter / engineer / founder / student) onto
 * emphasis, invites, and project callouts — without inventing portfolio
 * facts and without UI changes.
 *
 * Resolution order:
 *   1. Explicit self-ID or depth cues in the query
 *   2. VisitorProfile.type from memory
 *   3. QuestionFrame.questionType === Recruiter
 *   4. default (balanced technical conversation)
 */

import {
  AUDIENCE_MODES,
  DIGITAL_BRAIN,
  WELCOME_VARIANTS,
} from './persona.js';

export const MODE_IDS = Object.freeze([
  'recruiter', 'engineer', 'founder', 'student', 'default',
]);

/**
 * @param {object} ctx
 * @returns {'recruiter'|'engineer'|'founder'|'student'|'default'}
 */
export function resolveAudienceMode(ctx = {}) {
  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '').trim();

  if (/\b(i'?m|i am|as a)\s+(a\s+)?recruiter\b/i.test(q)
    || /\b(hiring manager|talent partner|sourcer)\b/i.test(q)) {
    return 'recruiter';
  }
  if (/\b(i'?m|i am|as a)\s+(a\s+)?(student|learner|beginner|fresher|intern)\b/i.test(q)) {
    return 'student';
  }
  if (/\b(i'?m|i am|as a)\s+(a\s+)?founder\b/i.test(q)
    || /\b(my startup|early.?stage (startup|company))\b/i.test(q)) {
    return 'founder';
  }
  if (/\b(i'?m|i am|as a)\s+(a\s+)?(senior\s+)?(engineer|developer|interviewer)\b/i.test(q)) {
    return 'engineer';
  }

  // Depth cues (do not invent facts — only retarget emphasis)
  if (/\b(beginner|eli5|explain (it |this )?simply|like i'?m (a )?(five|beginner)|new to (this|coding|engineering))\b/i.test(q)) {
    return 'student';
  }
  if (/\b(senior([- ]level)?|deep dive|systems? design|trade-?offs? please|interviewer perspective)\b/i.test(q)) {
    return 'engineer';
  }

  const profile = ctx?.visitorProfile || ctx?.memory?.profile || null;
  const type = profile?.type;
  if (type && type !== 'unknown' && MODE_IDS.includes(type)) return type;

  if (ctx?.questionFrame?.questionType === 'Recruiter') return 'recruiter';

  return 'default';
}

export function getAudienceMode(modeId) {
  return AUDIENCE_MODES[modeId] || AUDIENCE_MODES.default;
}

/**
 * Fill welcome template with profile name.
 * @param {string} template
 * @param {string} name
 */
export function fillWelcome(template, name) {
  return String(template || '').split('{name}').join(name || 'Sudhanshu Sinha');
}

/**
 * Professional Digital Engineering Brain welcome variants (raw templates).
 */
export function getWelcomeTemplates() {
  return WELCOME_VARIANTS.slice();
}

/**
 * Adapt a drafted spoken answer for audience emphasis.
 * Mode-aware invites only — no visitor-facing "Hiring lens" / "Engineering lens"
 * stickers (V4.5 Phase 1). Greeting / Clarify left unchanged.
 */
export function adaptSpokenAnswer(text, modeId, ctx = {}) {
  const mode = getAudienceMode(modeId);
  let out = String(text || '');
  if (!out.trim()) return out;

  const move = ctx?.move || ctx?.payload?._conversationalMove || null;
  if (move === 'Greeting' || move === 'Clarify') return out;

  if (modeId === 'default' || !mode.lens) return out;

  // Prefer replacing a trailing invite with a mode-aware invite (no meta labels).
  const invite = pickAudienceInvite(modeId, move, ctx);
  if (invite && endsWithQuestion(out)) {
    out = stripTrailingInvite(out);
    return `${out}\n\n${invite}`.trim();
  }

  return out;
}

/**
 * Finalize a provider draft with audience mode metadata + adapted speech.
 */
export function adaptDraft(draft, ctx = {}) {
  if (!draft || typeof draft !== 'object') return draft;

  const modeId = resolveAudienceMode(ctx);
  const move = draft?.payload?._conversationalMove || null;
  const adaptedCtx = { ...ctx, move, payload: draft.payload };

  let text = String(draft.text || '');
  // Greeting text is already the professional welcome from composition.
  if (move !== 'Greeting' && move !== 'Clarify') {
    text = adaptSpokenAnswer(text, modeId, adaptedCtx);
  }

  return {
    ...draft,
    text,
    payload: Object.assign({}, draft.payload || {}, {
      _audienceMode: modeId,
      _digitalBrain: DIGITAL_BRAIN.title,
    }),
  };
}

/**
 * Mode-specific invite lines (presentation only).
 */
export function pickAudienceInvite(modeId, move, ctx = {}) {
  const focus = ctx?.visitorProfile?.focusArea;
  const table = {
    recruiter: {
      Answer: [
        'Want the strongest live demo for this hire, or a fit summary against a role?',
        'Should I open the most recruiter-friendly project, or match a job description next?',
      ],
      Recommend: [
        'Want me to open that demo, or frame why it matters for your opening?',
      ],
      Compare: [
        'Want that paired back to hiring signal, or another stack comparison?',
      ],
      Decline: [
        'Closest useful hiring threads: shipped projects, production stack, or a live demo.',
      ],
    },
    engineer: {
      Answer: [
        'Want the trade-offs and constraints next, or the architecture path for a specific project?',
        'Should I go deeper on alternatives and failure modes, or walk the five-layer split?',
      ],
      Recommend: [
        'Want the decision record behind that pick, or a deeper architecture walkthrough?',
      ],
      Compare: [
        'Want dimensions expanded (async, validation, ops), or how it shows up in a shipped system?',
      ],
      Decline: [
        'I can still walk related architecture, stack choices, or a project decision record.',
      ],
    },
    founder: {
      Answer: [
        'Want proof of end-to-end ownership, or the fastest path to a live demo?',
        'Should I show what one engineer shipped solo, or the product leverage angle?',
      ],
      Recommend: [
        'Want the live product story, or how quickly this kind of system can be stood up?',
      ],
      Compare: [
        'Want the shipping/ownership angle of that choice, or another product comparison?',
      ],
      Decline: [
        'Closest useful threads: live products, ownership across the stack, or ship-ready demos.',
      ],
    },
    student: {
      Answer: [
        'Want this explained step by step, or a smaller example from one project?',
        'Should I define the key terms first, or show how it appears in a live system?',
      ],
      Recommend: [
        'Want a beginner-friendly walkthrough of that project, or what skills it demonstrates?',
      ],
      Compare: [
        'Want a simpler contrast first, or how each choice shows up in the portfolio?',
      ],
      Decline: [
        'I can still teach from nearby topics — projects, architecture layers, or core stack ideas.',
      ],
    },
  };

  const bucket = table[modeId];
  if (!bucket) return null;
  const variants = bucket[move] || bucket.Answer;
  if (!variants?.length) return null;

  // Stable-ish pick from focus when present.
  let idx = 0;
  if (focus === 'ai') idx = 1 % variants.length;
  if (focus === 'backend') idx = 0;
  return variants[idx] || variants[0];
}

/**
 * Project-card callout body for audience modes (facts already on proj).
 */
export function buildProjectAudienceCallout(proj, modeId, relevanceText) {
  const mode = getAudienceMode(modeId);
  if (!mode.projectCalloutTitle || modeId === 'default') return '';

  const name = proj?.name || 'This project';
  const live = proj?.live ? ' It ships with a public live URL — not a slide deck.' : '';

  if (modeId === 'recruiter') {
    return `\n\n### 🎯 ${mode.projectCalloutTitle}\nThis project demonstrates **${relevanceText || 'end-to-end product engineering'}**.${live}`;
  }
  if (modeId === 'engineer') {
    const decision = (proj?.decisions && proj.decisions[0]) || 'Explicit architecture and stack decisions are recorded on the project.';
    return `\n\n### 🔧 ${mode.projectCalloutTitle}\nProbe the constraints and trade-offs: ${decision}${live}`;
  }
  if (modeId === 'founder') {
    return `\n\n### 🚀 ${mode.projectCalloutTitle}\n**${name}** is evidence of ownership across problem → architecture → live product.${live}`;
  }
  if (modeId === 'student') {
    return `\n\n### 📚 ${mode.projectCalloutTitle}\nStudy the problem/solution framing, then the decision list — that's the transferable engineering pattern.${live}`;
  }
  return '';
}

function endsWithQuestion(text) {
  return /\?\s*$/.test(String(text || '').trim());
}

function stripTrailingInvite(text) {
  const parts = String(text || '').split(/\n\n+/);
  if (parts.length < 2) return text;
  const last = parts[parts.length - 1];
  if (/\?\s*$/.test(last.trim()) || /would you like|want me to|should i/i.test(last)) {
    return parts.slice(0, -1).join('\n\n').trim();
  }
  return text;
}
