/**
 * adaptive.js — V4 Adaptive Communication + V4.5 Phase 2 Conversation Flow
 *
 * Audience modes (recruiter / engineer / founder / student) plus presentation-
 * only conversation flow: contextual invites, session continuity, sparse
 * reflection phrases, opening variety, and depth shaping.
 *
 * Does NOT change reasoning operators, graph, decisions, or identity.
 * Session continuity uses in-chat memory turns only — no persistent memory.
 */

import {
  AUDIENCE_MODES,
  DIGITAL_BRAIN,
  WELCOME_VARIANTS,
} from './persona.js';
import { isBoundFollowUpQuery } from './conversation.js';

export const MODE_IDS = Object.freeze([
  'recruiter', 'engineer', 'founder', 'student', 'default',
]);

const PROJECT_TOPICS = [
  { id: 'queryforge', name: 'QueryForgeAI', re: /queryforge|query forge/i },
  { id: 'reporadar', name: 'RepoRadarAI', re: /reporadar|repo radar/i },
  { id: 'placementpro', name: 'Placement Pro+', re: /placement\s*pro|placementpro/i },
];

const TECH_TOPICS = [
  { id: 'flask', name: 'Flask', re: /\bflask\b/i },
  { id: 'fastapi', name: 'FastAPI', re: /\bfastapi\b/i },
  { id: 'react', name: 'React', re: /\breact\b/i },
  { id: 'postgres', name: 'Postgres', re: /\bpostgres(ql)?\b/i },
  { id: 'architecture', name: 'the architecture', re: /\barchitect(ure|ural)?\b|five-?layer/i },
];

/* ============================================================
   AUDIENCE MODE
   ============================================================ */

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

  if (/\b(beginner|eli5|explain (it |this |the \w+ )?simply|like i'?m (a )?(five|beginner)|new to (this|coding|engineering)|for beginners)\b/i.test(q)) {
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

export function fillWelcome(template, name) {
  return String(template || '').split('{name}').join(name || 'Sudhanshu Sinha');
}

export function getWelcomeTemplates() {
  return WELCOME_VARIANTS.slice();
}

/** Depth style for presentation shaping — not a new intelligence layer. */
export function resolveDepthStyle(ctx = {}) {
  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
  const mode = resolveAudienceMode(ctx);
  if (/\b(30.?second|tl;?dr|briefly|quick(ly)?|in short|elevator)\b/i.test(q)) return 'quick';
  if (mode === 'recruiter' || /\b(interview|hiring|faang|recruiter)\b/i.test(q)) return 'interview';
  if (mode === 'student') return 'teach';
  if (mode === 'engineer' || /\b(trade-?off|deep|architecture|constraint)\b/i.test(q)) return 'engineer';
  return 'default';
}

/* ============================================================
   SESSION TOPIC / CONTINUITY (current chat only)
   ============================================================ */

export function inferSessionTopic(ctx = {}) {
  const memory = ctx.memory;
  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');

  // V4.5 Mod 2 — follow-ups prefer explicit bind over scanning the whole transcript
  // (transcript often mentions runner-up projects and would invert the topic).
  const boundId = memory?.lastCommitment?.projectId || memory?.lastProject || null;
  if (boundId && isBoundFollowUpQuery(q)) {
    const hit = PROJECT_TOPICS.find((p) => p.id === boundId);
    if (hit) return { kind: 'project', ...hit };
  }

  const recent = typeof memory?.recentTurns === 'function'
    ? memory.recentTurns(6)
    : (memory?.turns || []).slice(-6);
  const blob = [
    ...recent.map((t) => t.text || ''),
    q,
  ].join('\n');

  for (const p of PROJECT_TOPICS) {
    if (p.re.test(blob)) return { kind: 'project', ...p };
  }
  for (const t of TECH_TOPICS) {
    if (t.re.test(blob)) return { kind: 'tech', ...t };
  }
  return null;
}

function buildContinuityLead(ctx, topic) {
  if (!topic) return null;
  const memory = ctx.memory;
  const turns = typeof memory?.recentTurns === 'function'
    ? memory.recentTurns(4)
    : (memory?.turns || []).slice(-4);
  // Need a prior turn — first question has no continuity.
  if (!turns || turns.length < 2) return null;

  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');

  // V4.6.1 — continuity only on genuine follow-ups. False continuity is worse than none.
  if (!isBoundFollowUpQuery(q)) return null;
  if (/^(hi|hello|hey)\b/i.test(q.trim())) return null;

  const boundId = memory?.lastCommitment?.projectId || memory?.lastProject;
  if (boundId && topic.kind === 'project' && topic.id !== boundId) {
    return null;
  }

  const priorMentionsTopic = turns.slice(0, -1).some((t) => topic.re.test(t.text || ''));
  if (!priorMentionsTopic) return null;

  // Current question already names the topic — skip redundant lead.
  if (topic.re.test(q)) return null;

  if (topic.kind === 'project') {
    if (/\bwhy\b/i.test(q)) {
      return `Since we're talking about ${topic.name}, that choice sits right inside it.`;
    }
    return `Staying with ${topic.name} for a moment —`;
  }
  if (topic.kind === 'tech') {
    return `On ${topic.name} specifically —`;
  }
  return null;
}

/* ============================================================
   REFLECTION PHRASES (sparse)
   ============================================================ */

const REFLECTION_POOL = [
  { key: 'v45-ref-good', when: /why|trade|weak|fit|hire|compare|architect/i, text: "That's a good question." },
  { key: 'v45-ref-thought', when: /why|decision|chose|trade/i, text: "I've thought about that quite a bit." },
  { key: 'v45-ref-two', when: /or|vs|versus|compare|backend|frontend|fit/i, text: 'There are really two ways to look at this.' },
  { key: 'v45-ref-nosimple', when: /can he|does he|is he|ready|know/i, text: "I don't think there's a simple yes-or-no answer." },
  { key: 'v45-ref-trade', when: /why|flask|fastapi|react|postgres|architect/i, text: 'The trade-off is actually more interesting than the technology name.' },
];

function pickReflectionPhrase(ctx) {
  const move = ctx?.move || ctx?.payload?._conversationalMove;
  if (move === 'Greeting' || move === 'Clarify' || move === 'Decline') return null;

  const memory = ctx.memory;
  const turnCount = memory?.turnCount ?? (memory?.turns?.length || 0);
  // Sparse: only on turn 1, 4, 7… and never on a cold first message (turnCount 0).
  if (turnCount === 0 || turnCount % 3 !== 1) return null;

  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
  const task = String(ctx?.payload?._portfolioIntelligence || '');
  const strategy = String(ctx?.payload?._reasoningStrategy?.strategy || '');
  const hay = `${q} ${task} ${strategy}`;

  // Only on evaluative / explain threads — not every summarize.
  if (!/Explain|Evaluate|Critique|Infer|Justify|Recommend|why_|weak|hire|fit|trade|flask|fastapi|react|architect/i.test(hay)) {
    return null;
  }

  for (const item of REFLECTION_POOL) {
    if (!item.when.test(hay)) continue;
    if (memory?.hasUsedPhrase?.(item.key)) continue;
    memory?.markPhraseUsed?.(item.key);
    return item.text;
  }
  return null;
}

/* ============================================================
   OPENING VARIETY (presentation paraphrase — not new facts)
   ============================================================ */

function varyOpening(text, memory) {
  let out = String(text || '');
  if (!out.trim()) return out;

  const rotations = [
    {
      key: 'v45-open-chose',
      re: /^I chose (.+?) because /i,
      alts: [
        (m) => `Looking back, I went with ${m[1]} because `,
        (m) => `When I started those systems, I chose ${m[1]} because `,
        (m) => `I considered the alternatives, then chose ${m[1]} because `,
      ],
    },
    {
      key: 'v45-open-built',
      re: /^I built the UIs in React/i,
      alts: [
        () => 'Looking back, React is what I shipped the UIs in',
        () => 'When I started the frontend work, I built the UIs in React',
        () => 'The interesting part of the UI story is React — I built those surfaces in React',
      ],
    },
    {
      key: 'v45-open-designed',
      re: /^I designed the architecture as /i,
      alts: [
        () => 'When I laid out the system, I designed the architecture as ',
        () => 'Looking back, I designed the architecture as ',
        () => 'The hardest structural call was designing the architecture as ',
      ],
    },
    {
      key: 'v45-open-default-pg',
      re: /^I'd default to Postgres/i,
      alts: [
        () => "If I'm optimizing for integrity, I'd default to Postgres",
        () => 'Looking back, Postgres is still where I default',
        () => "I can see why people reach for document stores — I'd still default to Postgres",
      ],
    },
  ];

  for (const rot of rotations) {
    const m = rot.re.exec(out);
    if (!m) continue;
    const used = rot.alts.map((_, i) => `${rot.key}:${i}`);
    let idx = used.findIndex((k) => !memory?.hasUsedPhrase?.(k));
    if (idx < 0) idx = (memory?.turnCount || 0) % rot.alts.length;
    const next = rot.alts[idx](m);
    memory?.markPhraseUsed?.(`${rot.key}:${idx}`);
    out = out.replace(rot.re, next);
    break;
  }
  return out;
}

/* ============================================================
   CONTEXTUAL FOLLOW-UPS
   ============================================================ */

/**
 * Topic/task-aware invite. Prefer this over generic "want to know more?".
 */
export function pickContextualInvite(ctx = {}, move = 'Answer') {
  const task = ctx?.payload?._portfolioIntelligence
    || ctx?.payload?._reasoningStrategy?.task
    || '';
  const topic = inferSessionTopic(ctx);
  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
  const modeId = resolveAudienceMode(ctx);

  if (task === 'why_flask' || /\bwhy flask\b/i.test(q)) {
    return 'Want to compare it with FastAPI, or see how that decision shaped the architecture?';
  }
  if (task === 'why_fastapi' || /\bwhy fastapi\b/i.test(q)) {
    return 'Want the Flask contrast, or how async ingestion pushed this choice on RepoRadar?';
  }
  if (task === 'why_react' || /\bwhy react\b/i.test(q)) {
    return 'Want the trade-offs vs other UI stacks, or how React shows up on a specific project?';
  }
  if (task === 'why_postgres' || /postgres/i.test(q) && /\bwhy\b/i.test(q)) {
    return 'Want how that shows up in QueryForge, or the Mongo trade-off?';
  }
  if (task === 'arch_why' || task === 'arch_tradeoffs' || task === 'arch_scale') {
    return 'Want this applied to a specific project, or the Flask vs FastAPI choice inside the backend layer?';
  }
  if (task === 'weakest_area' || task === 'learn_next') {
    return 'Want what I would improve first, or where the strong signal actually is?';
  }
  if (task === 'why_hire' || task === 'startup_fit' || task === 'best_role') {
    return modeId === 'recruiter'
      ? 'Want the strongest live demo for that fit, or the engineering deep-dive?'
      : 'Want the recruiter-short version, or the systems story behind it?';
  }
  if (task === 'faang_interview' || task === 'best_engineering' || task === 'justify_best_project') {
    return 'Interested in why I chose that architecture, or the hardest engineering problem in it?';
  }
  if (task === 'interview_first' || task === 'recruiter_impress' || task === 'best_work') {
    return 'Want to open the live demo, or walk the API/UI split next?';
  }
  if (task === 'demo_ai') {
    return 'Want the schema-grounding angle, or the productized AI pipeline story?';
  }
  if (task === 'demo_backend') {
    return 'Want the API/ownership angle, or how AI sits behind those services?';
  }
  if (task === 'demo_frontend') {
    return 'Want the React/TypeScript craft, or how the UI talks to the backend?';
  }
  if (move === 'Compare' || task === 'compare_passthrough') {
    return 'Want that related back to a shipped project, or another stack pair?';
  }

  if (topic?.id === 'queryforge') {
    return 'Interested in why I chose this architecture, or the hardest engineering problem I solved there?';
  }
  if (topic?.id === 'reporadar') {
    return 'Want to explore the AI pipeline or the backend architecture?';
  }
  if (topic?.id === 'placementpro') {
    return 'Want the product workflow story, or the backend decisions behind it?';
  }

  // Audience fallback (Phase 1)
  const audience = pickAudienceInvite(modeId, move, ctx);
  if (audience) return audience;

  return null;
}

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
        'Want the constraints behind that pick, or a deeper architecture walkthrough?',
      ],
      Compare: [
        'Want dimensions expanded (async, validation, ops), or how it shows up in a shipped system?',
      ],
      Decline: [
        'I can still walk related architecture, stack choices, or a project decision.',
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
  let idx = 0;
  if (focus === 'ai') idx = 1 % variants.length;
  if (focus === 'backend') idx = 0;
  return variants[idx] || variants[0];
}

/* ============================================================
   DEPTH SHAPING + PACING (presentation only)
   ============================================================ */

function shapeDepth(text, depth, ctx = {}) {
  const parts = String(text || '').split(/\n\n+/).filter((p) => p.trim());
  if (parts.length <= 2) return text;

  if (depth === 'quick' || depth === 'interview') {
    // Keep conclusion + one supporting beat; preserve trailing invite if present.
    const last = parts[parts.length - 1];
    const invite = /\?\s*$/.test(last.trim()) ? last : null;
    const body = parts.slice(0, 2);
    return (invite ? [...body, invite] : body).join('\n\n');
  }

  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
  const mode = ctx?.questionFrame?.conversationMode;
  const task = String(ctx?.payload?._portfolioIntelligence || ctx?.payload?._reasoningStrategy?.task || '');
  const warrantsTrade = warrantsTradeOffBeat(q, mode, task);

  if (depth === 'teach' && parts.length >= 2 && warrantsTrade) {
    if (!/interesting part|here's where|trade-off becomes/i.test(text)) {
      parts.splice(1, 0, 'The interesting part is how the pieces fit together.');
    }
    return parts.join('\n\n');
  }

  // Mod 5 — trade-off garnish only when the ask is actually about trade-offs
  if (depth === 'engineer' && parts.length >= 3 && warrantsTrade) {
    if (!/here's where it gets|trade-off becomes|unexpected/i.test(text)) {
      parts.splice(Math.min(2, parts.length - 1), 0, "But here's where the trade-off becomes important.");
    }
    return parts.join('\n\n');
  }

  return text;
}

function warrantsTradeOffBeat(q, mode, task) {
  if (mode === 'challenge' || mode === 'probe') return true;
  if (/trade-?off|compare|vs\.?|versus|instead of|why (flask|fastapi|react)|defend|concede|rebuild/i.test(q)) return true;
  if (/arch_tradeoffs|why_flask|why_fastapi|challenge|compare/i.test(task)) return true;
  return false;
}

/**
 * V4.5 Mod 5 + V4.6.1 — answer-shape budget (emit/suppress + conversation length).
 */
function applyAnswerShapeBudget(text, ctx = {}) {
  let out = String(text || '');
  if (!out.trim()) return out;

  const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
  const qType = ctx?.questionFrame?.questionType;
  const mode = ctx?.questionFrame?.conversationMode;
  const task = String(ctx?.payload?._portfolioIntelligence || ctx?.payload?._reasoningStrategy?.task || '');

  const ownershipYesNo = qType === 'SkillVerification'
    || /^(do you|does he|are you|is he|have you|has he|can you|can he|could you|could he)\b/i.test(q.trim())
    || /^can sudhanshu\b/i.test(q.trim());

  // Only strip the shipped-ownership template — never competency "Yes — I can…"
  if (!ownershipYesNo) {
    out = out.replace(/^Yes — [^\n]+ is (one of Sudhanshu's shipped projects|part of Sudhanshu's shipped stack)\.?\n*/i, '');
  }

  if (!warrantsTradeOffBeat(q, mode, task)) {
    out = out.replace(/\n*\nBut here's where the trade-off becomes important\.\n*/g, '\n\n');
    out = out.replace(/\n*\nThe interesting part is how the pieces fit together\.\n*/g, '\n\n');
  }

  // Conversational modes: prefer first-person; drop narrator hire-pitch reuse
  if (mode === 'self' || mode === 'opinion' || mode === 'preference_gap' || mode === 'ops_story' || mode === 'intro') {
    out = out.replace(/^Hire (me|Sudhanshu) because[^\n]+\n*/i, '');
  }

  // Strip brochure section headers if they leaked into a conversational answer
  const wantsDocs = /\b(walk (me )?through|deep dive|in detail|documentation|open (the )?project|architecture of|stack for)\b/i.test(q);
  if (!wantsDocs) {
    out = out
      .replace(/^##\s+[^\n]+\n+/gm, '')
      .replace(/^###\s*[🎯🏗️⚡💡🔗📚🔧🚀]\s*[^\n]+\n+/gm, '')
      .replace(/^\*\*Problem:\*\*\s*/gm, '')
      .replace(/^\*\*Solution:\*\*\s*/gm, '');
  }

  // Default conversation length: ~4–8 sentences unless explicit expansion/docs
  const wantsExpand = wantsDocs
    || /\b(more detail|go deeper|elaborate|expand|full (explanation|write-?up)|everything about)\b/i.test(q)
    || isBoundFollowUpQuery(q);
  if (!wantsExpand && !/^## /m.test(out) && !/\| Dimension \|/i.test(out) && !/^\|/m.test(out)) {
    out = clampConversationalLength(out, 8);
  }

  // Drop weak documentary leads when a real answer follows
  out = out.replace(/^[^\n]+ is one of the shipped projects\.?\n+/i, '');
  out = out.replace(/^[^\n]+ shows up in the shipped stack\.?\n+/i, '');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/** Keep invite (trailing question) while capping body to ~4–8 sentences / 3 paras. */
function clampConversationalLength(text, maxSentences) {
  const parts = String(text || '').split(/\n\n+/).filter((p) => p.trim());
  if (!parts.length) return text;
  const last = parts[parts.length - 1];
  const invite = /\?\s*$/.test(last.trim()) ? last : null;
  let body = invite ? parts.slice(0, -1) : parts.slice();
  body = body.slice(0, 3);

  let count = 0;
  const kept = [];
  for (const para of body) {
    const sentences = para.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [para];
    const slice = [];
    for (const s of sentences) {
      if (count >= maxSentences) break;
      const t = s.trim();
      if (t) {
        slice.push(t);
        count += 1;
      }
    }
    if (slice.length) kept.push(slice.join(' '));
    if (count >= maxSentences) break;
  }
  const out = kept.join('\n\n').trim();
  return invite ? `${out}\n\n${invite}` : out;
}

/**
 * Spoken-first comparison body from a TECH_TAKES-shaped entry.
 * Table is optional trailer — not the opening.
 */
export function formatSpokenComparison(entry, { includeTable = true } = {}) {
  if (!entry?.techs?.length) return '';
  const [a, b] = entry.techs;
  const lead = entry.preference
    || `I'd contrast ${a} and ${b} from what I actually shipped — not from brand preference.`;
  const dim = entry.dimensions?.[0];
  const beat = dim
    ? `The interesting split is usually ${dim.name.toLowerCase()}: ${a} leans ${String(dim.a).slice(0, 90)}… while ${b} leans ${String(dim.b).slice(0, 90)}…`
    : `The interesting split is when each one earns its complexity.`;

  const parts = [lead, beat];
  if (entry.groundingNote) parts.push(entry.groundingNote);

  if (includeTable && entry.dimensions?.length) {
    parts.push('If you want the full side-by-side, here are the dimensions:');
    parts.push([
      `| Dimension | ${a} | ${b} |`,
      `|---|---|---|`,
      entry.dimensions.map((d) => `| ${d.name} | ${d.a} | ${d.b} |`).join('\n'),
    ].join('\n'));
  }

  return parts.filter(Boolean).join('\n\n');
}

/* ============================================================
   FLOW ORCHESTRATION
   ============================================================ */

/**
 * Apply Phase 2 conversation flow on top of an already-authored answer.
 */
export function applyConversationFlow(text, ctx = {}) {
  const move = ctx?.move || ctx?.payload?._conversationalMove || null;
  if (move === 'Greeting' || move === 'Clarify') return String(text || '');

  let out = String(text || '');
  if (!out.trim()) return out;

  const memory = ctx.memory;
  const topic = inferSessionTopic(ctx);
  const depth = resolveDepthStyle(ctx);

  out = varyOpening(out, memory);

  const reflection = pickReflectionPhrase(ctx);
  const continuity = buildContinuityLead(ctx, topic);

  // Order: reflection → continuity → body (never both stacking awkwardly)
  const prefix = [reflection, continuity].filter(Boolean);
  if (prefix.length) {
    // Prefer a single lead line.
    out = `${prefix[0]}\n\n${out}`;
  }

  out = shapeDepth(out, depth, ctx);
  out = applyAnswerShapeBudget(out, ctx);

  // Mod 3 — Decline honesty already carries pivot/invite from composition
  if (move === 'Decline') {
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // Mod 5 — at most one invite; suppress generic demo forks on soft/opinion/gap
  const mode = ctx?.questionFrame?.conversationMode;
  const softMode = ['preference_gap', 'opinion', 'self', 'ops_story', 'intro', 'brief'].includes(mode);
  if (!endsWithQuestion(out)) {
    const invite = pickContextualInvite(ctx, move || 'Answer');
    if (invite && !(softMode && /live demo|strongest live|open that demo/i.test(invite))) {
      out = `${out}\n\n${invite}`;
    }
  } else if (!softMode) {
    const invite = pickContextualInvite(ctx, move || 'Answer');
    if (invite && !/live demo|strongest live/i.test(out.split(/\n\n/).pop() || '')) {
      // keep existing question; only replace clearly generic demo invites
      const last = out.split(/\n\n/).pop() || '';
      if (/strongest live demo|Want the trade-offs and constraints next/i.test(last)) {
        out = `${stripTrailingInvite(out)}\n\n${invite}`;
      }
    }
  }

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Adapt a drafted spoken answer (Phase 1 audience + Phase 2 flow).
 */
export function adaptSpokenAnswer(text, modeId, ctx = {}) {
  let out = String(text || '');
  if (!out.trim()) return out;

  const move = ctx?.move || ctx?.payload?._conversationalMove || null;
  if (move === 'Greeting' || move === 'Clarify') return out;

  return applyConversationFlow(out, { ...ctx, modeId });
}

/**
 * Finalize a provider draft with audience mode metadata + flow polish.
 */
export function adaptDraft(draft, ctx = {}) {
  if (!draft || typeof draft !== 'object') return draft;

  const modeId = resolveAudienceMode(ctx);
  const move = draft?.payload?._conversationalMove || null;
  const adaptedCtx = { ...ctx, move, payload: draft.payload, modeId };

  let text = String(draft.text || '');
  if (move !== 'Greeting' && move !== 'Clarify') {
    text = adaptSpokenAnswer(text, modeId, adaptedCtx);
  }

  return {
    ...draft,
    text,
    payload: Object.assign({}, draft.payload || {}, {
      _audienceMode: modeId,
      _digitalBrain: DIGITAL_BRAIN.title,
      _depthStyle: resolveDepthStyle(ctx),
      _sessionTopic: inferSessionTopic(ctx)?.id || null,
    }),
  };
}

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
