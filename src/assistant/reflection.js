/**
 * reflection.js — V4 Reflection Engine
 *
 * Every composed answer passes through reflectAnswer() before it is returned
 * for rendering. Reflection verifies six dimensions against portfolio truth
 * (graph · Decision Records · Engineering Identity · V2 evidence/confidence):
 *
 *   1. evidence
 *   2. assumptions
 *   3. confidence
 *   4. completeness
 *   5. teaching quality
 *   6. engineering reasoning
 *
 * Amendments are minimal and honesty-preserving — never invent portfolio facts.
 * Greeting / Clarify turns are verified lightly and left unchanged.
 */

import {
  getEngineeringGraph,
  getNodesByType,
} from './graph.js';
import {
  getDecisionRecords,
} from './decisions.js';
import {
  getEngineeringIdentity,
  listIdentityClaims,
} from './identity.js';
import {
  DECISION_FIRST_STRATEGIES,
} from './reasoning.js';

const IMPL_LEAKS = [
  /retrieval-and-reasoning/i,
  /\bknowledge base\b/i,
  /Based on what is documented/i,
  /From his portfolio:/i,
  /\bRAG\b/,
  /embeddings?/i,
];

/** Multi-char / unambiguous absent techs only — never single common English words. */
const ABSENT_TECH = [
  'Kubernetes', 'Django', 'Redis', 'Next.js', 'Vite', 'GraphQL', 'Kafka',
  'Terraform', 'Spring Boot', 'Angular',
];

const HONEST_GAP_RE = /not part|isn'?t|isn't|no record|doesn'?t|does not|not in (his |the )?portfolio|not covered|don'?t have|do not have|no shipped|absent|gap|not documented|not among|won'?t invent|will not invent/i;

const INFERENCE_MARKERS = /from what'?s (shipped|evidenced|present)|inferred|relative to what'?s evidenced|softest public signal|won'?t invent|labeled inference|portfolio-level/i;

const ABSOLUTE_CLAIM_RE = /^(Yes —|No —|Definitely|Absolutely|He (always|never)|I'd (put|choose|lead|open|keep))/m;

const REASONING_SIGNAL_RE = /because|trade-?off|decision|architect|reason|layer|correctness|constraint|vs\.?|versus|in exchange|deliberate|systems thinking|why /i;

const TEACH_LEAD_DUMP_RE = /^##\s*(Engineering decisions|Tech stack|Features)/i;

/* ============================================================
   PUBLIC API
   ============================================================ */

/**
 * Reflect on a drafted provider result and return the post-reflection result.
 * @param {{ text?: string, kind?: string, sources?: any[], payload?: object|null }} draft
 * @param {object} ctx — pipeline context (questionFrame, plan, evidence, confidence, entities, query)
 * @returns {{ text: string, kind: string, sources: any[], payload: object, reflection: ReflectionReport }}
 */
export function reflectAnswer(draft, ctx = {}) {
  const graph = getEngineeringGraph();
  const records = getDecisionRecords(graph);
  const identity = getEngineeringIdentity(graph, records);

  const baseText = String(draft?.text || '');
  const move = draft?.payload?._conversationalMove
    || ctx?.questionFrame?.questionType === 'Greeting' && 'Greeting'
    || null;
  const strategy = draft?.payload?._reasoningStrategy?.strategy
    || null;
  const task = draft?.payload?._portfolioIntelligence
    || draft?.payload?._reasoningStrategy?.task
    || null;

  const pack = {
    text: baseText,
    draft,
    ctx,
    graph,
    records,
    identity,
    move,
    strategy,
    task,
    skipHeavy: move === 'Greeting' || move === 'Clarify' || !baseText.trim(),
  };

  const checks = {
    evidence: checkEvidence(pack),
    assumptions: checkAssumptions(pack),
    confidence: checkConfidence(pack),
    completeness: checkCompleteness(pack),
    teachingQuality: checkTeachingQuality(pack),
    engineeringReasoning: checkEngineeringReasoning(pack),
  };

  const { text, actions } = applyAmendments(pack, checks);

  const report = {
    version: 'v4-reflection',
    checks,
    actions,
    overall: deriveOverall(checks, actions),
    meta: {
      move,
      strategy,
      task,
      confidenceTier: ctx?.confidence?.tier || null,
      decisionRecordCount: records.length,
      identityClaimCount: listIdentityClaims(identity).length,
    },
  };

  const payload = Object.assign({}, draft?.payload || {}, {
    _reflection: {
      overall: report.overall,
      actions: actions.map((a) => a.type),
      failed: Object.entries(checks)
        .filter(([, c]) => !c.ok)
        .map(([name]) => name),
    },
  });

  return {
    text,
    kind: draft?.kind || 'text',
    sources: draft?.sources || [],
    payload,
    reflection: report,
  };
}

/**
 * Provider-facing finalize: preserves non-text drafts, always attaches reflection when text exists.
 */
export function finalizeWithReflection(draft, ctx = {}) {
  if (!draft || typeof draft !== 'object') {
    return draft;
  }
  const reflected = reflectAnswer(draft, ctx);
  return {
    text: reflected.text,
    kind: reflected.kind,
    sources: reflected.sources,
    payload: reflected.payload,
  };
}

/**
 * Structural validator for tests / diagnostics.
 */
export function validateReflectionReport(report) {
  const errors = [];
  if (!report || report.version !== 'v4-reflection') {
    errors.push('missing or wrong version');
  }
  const required = [
    'evidence', 'assumptions', 'confidence',
    'completeness', 'teachingQuality', 'engineeringReasoning',
  ];
  for (const key of required) {
    const c = report?.checks?.[key];
    if (!c || typeof c.ok !== 'boolean' || !Array.isArray(c.issues)) {
      errors.push(`invalid check: ${key}`);
    }
  }
  if (!['pass', 'amended', 'flagged'].includes(report?.overall)) {
    errors.push('invalid overall');
  }
  return { ok: errors.length === 0, errors };
}

/* ============================================================
   CHECKS
   ============================================================ */

function checkEvidence(pack) {
  const { text, ctx, graph, skipHeavy } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) {
    return okCheck(notes.length ? notes : ['Greeting/Clarify — evidence check deferred']);
  }

  const projects = getNodesByType(graph, 'Project');
  const projectNames = projects.map((p) => p.label);
  const techNodes = getNodesByType(graph, 'Technology');
  const ownedTech = new Set(techNodes.map((t) => String(t.label).toLowerCase()));

  // Project names mentioned must resolve to graph projects (fuzzy allow partial).
  for (const name of projectNames) {
    if (text.includes(name)) notes.push(`mentions project ${name}`);
  }

  // Gap entities claimed as owned experience.
  const entityList = resolveEntityList(ctx);
  for (const ent of entityList) {
    if (ent.ownership !== 'gap' && ent.ownership !== 'unknown') continue;
    const label = ent.canonical || ent.name || '';
    if (!label) continue;
    const claimedOwned = new RegExp(
      `(?:knows?|ships?|uses?|built with|experienced with|expert in)\\s+${escapeRe(label)}`,
      'i',
    );
    const positiveYes = /^Yes\b/i.test(text.trim()) && new RegExp(escapeRe(label), 'i').test(text);
    if ((claimedOwned.test(text) || positiveYes) && !HONEST_GAP_RE.test(text)) {
      issues.push(`claims ownership of gap/unknown entity "${label}" without honesty framing`);
    }
  }

  // Absent famous techs spoken as owned — require the tech name AND a local
  // ownership verb (within a short window), not a global "ships" elsewhere.
  for (const tech of ABSENT_TECH) {
    const techRe = new RegExp(`\\b${escapeRe(tech.trim())}\\b`, 'i');
    if (!techRe.test(text)) continue;
    if (ownedTech.has(tech.trim().toLowerCase())) continue;
    if (HONEST_GAP_RE.test(text)) {
      notes.push(`honest gap mention: ${tech}`);
      continue;
    }
    const ownedLocally = new RegExp(
      `(?:knows?|ships?|uses?|used|built\\s+with|experienced\\s+with|expert\\s+in|strong\\s+with|works?\\s+with)\\s+${escapeRe(tech.trim())}`
      + `|${escapeRe(tech.trim())}\\s+(?:experience|expertise|skills?|in\\s+production)`,
      'i',
    );
    if (ownedLocally.test(text)) {
      issues.push(`possible ungrounded ownership claim for absent tech "${tech}"`);
    } else {
      notes.push(`mentions ${tech} without ownership claim`);
    }
  }

  // Implementation/RAG voice is never valid evidence framing.
  for (const re of IMPL_LEAKS) {
    if (re.test(text)) issues.push(`implementation-voice leak: /${re.source}/`);
  }

  // Evidence set present for Answer moves should leave a trace OR be synthesis.
  const hasDocs = (ctx?.evidence?.supportingDocs || []).length > 0;
  const hasIntel = Boolean(pack.task);
  if (!hasDocs && !hasIntel && text.length > 40 && pack.move === 'Answer') {
    notes.push('no supportingDocs on ctx — relying on synthesis/persona path');
  }

  return {
    ok: issues.length === 0,
    issues,
    notes,
  };
}

function checkAssumptions(pack) {
  const { text, identity, skipHeavy, strategy } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) return okCheck(['assumption check skipped for Greeting/Clarify']);

  const strongInference = /\b(always|never|guarantees?|will thrive|will fail|definitely the best)\b/i.test(text);
  const labeled = INFERENCE_MARKERS.test(text);
  const inferStrategies = new Set(['Infer', 'Critique']);

  if (strongInference && inferStrategies.has(strategy) && !labeled) {
    issues.push('strong absolute language on Infer/Critique without inference labeling');
  } else if (strongInference && !labeled) {
    notes.push('absolute language present — acceptable if documented');
  }

  // Personality fluff is never an allowed assumption.
  if (/\b(passionate|humble|genius|rockstar|ninja|10x)\b/i.test(text)) {
    issues.push('personality-fluff assumption not evidenced by identity layer');
  }

  // Inferred identity claims referenced without soft framing when strategy is Infer.
  if (strategy === 'Infer') {
    const inferred = listIdentityClaims(identity).filter((c) => c.confidence === 'inferred');
    if (inferred.length && !labeled && !/fit|natural|lean/i.test(text)) {
      notes.push('Infer answer may lean on inferred identity claims');
    }
  }

  // Employer/salary/education inventions.
  if (/\b(Google|Meta|Amazon|Apple|Netflix|FAANG)\b/i.test(text)
    && /(worked at|employee at|engineer at|hired by)\b/i.test(text)
    && !/interviewer|interview|style/i.test(text)) {
    issues.push('assumes employment at a named big-tech firm without portfolio evidence');
  }

  return { ok: issues.length === 0, issues, notes };
}

function checkConfidence(pack) {
  const { text, ctx, skipHeavy, move } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) return okCheck(['confidence check skipped']);

  const tier = ctx?.confidence?.tier || null;
  if (tier) notes.push(`pipeline confidence tier: ${tier}`);

  const absolute = ABSOLUTE_CLAIM_RE.test(text);
  const hedges = /partial|within the scope|for the kind of work|thin(ner)?|portfolio-level|Confidence is|softest|inferred|not proof/i.test(text);

  if (tier === 'low' && absolute && !hedges && move !== 'Decline') {
    // Soft flag — many evaluative Yes answers are intentional operator conclusions.
    notes.push('low pipeline confidence with absolute lead — operator conclusion may still be valid');
  }

  if (tier === 'ambiguous' && absolute && !hedges && move === 'Answer') {
    issues.push('ambiguous confidence with absolute claim and no hedge');
  }

  // Decline should not sound over-certain about missing facts.
  if (move === 'Decline' && /\b(definitely|certainly|absolutely knows)\b/i.test(text)) {
    issues.push('Decline move uses over-certain language');
  }

  return { ok: issues.length === 0, issues, notes };
}

function checkCompleteness(pack) {
  const { text, strategy, task, skipHeavy, move } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) return okCheck(['completeness skipped']);
  if (!text.trim()) {
    return { ok: false, issues: ['empty answer'], notes };
  }

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);

  if (strategy && DECISION_FIRST_STRATEGIES.has(strategy)) {
    if (sentences.length < 2) {
      issues.push(`${strategy} answer lacks Decision-first depth (need conclusion + why)`);
    } else {
      notes.push('Decision-first depth present');
    }
  }

  if (strategy === 'Evaluate' && !/^(Yes|No|Partial|He'?s|Postgres|Docker|Confidence)/im.test(text.trim())) {
    // Soft — database_strength leads with Postgres, etc.
    notes.push('Evaluate lead shape is non-Yes/No (may still be complete)');
  }

  if (strategy === 'Explain' && !REASONING_SIGNAL_RE.test(text) && sentences.length < 2) {
    issues.push('Explain answer missing rationale signal');
  }

  if (move === 'Decline' && !HONEST_GAP_RE.test(text) && !/not sure|clarif|closest useful/i.test(text)) {
    notes.push('Decline without explicit gap phrasing — may still be honest pivot');
  }

  if (task === 'keep_two' && !/\band\b/i.test(text)) {
    issues.push('keep_two answer should name two projects');
  }

  return { ok: issues.length === 0, issues, notes };
}

function checkTeachingQuality(pack) {
  const { text, skipHeavy, strategy, move } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) return okCheck(['teaching check skipped']);

  if (TEACH_LEAD_DUMP_RE.test(text.trim())) {
    issues.push('answer opens as a documentation dump rather than taught speech');
  }

  // Prefer a spoken lead over a bare table/heading wall for evaluative strategies.
  if (strategy && DECISION_FIRST_STRATEGIES.has(strategy)) {
    if (/^#+\s/.test(text.trim())) {
      issues.push('Decision-first answer opens with a markdown heading dump');
    } else {
      notes.push('spoken lead present');
    }
  }

  // Teaching = at least one explanatory clause for Explain/Justify.
  if ((strategy === 'Explain' || strategy === 'Justify') && !REASONING_SIGNAL_RE.test(text)) {
    issues.push(`${strategy} lacks teaching/rationale language`);
  }

  // Avoid chip-wall / suggestion-list as the whole answer.
  if (move === 'Answer' && /Try asking about his projects, architecture, tech stack/i.test(text) && text.length < 220) {
    issues.push('answer collapses to generic suggestion list');
  }

  return { ok: issues.length === 0, issues, notes };
}

function checkEngineeringReasoning(pack) {
  const { text, strategy, records, identity, skipHeavy, graph } = pack;
  const issues = [];
  const notes = [];

  if (skipHeavy) return okCheck(['engineering-reasoning skipped']);

  const needsReasoning = strategy && (
    DECISION_FIRST_STRATEGIES.has(strategy)
    || strategy === 'Explain'
    || strategy === 'Summarize'
  );

  if (!needsReasoning) {
    return okCheck(['non-reasoning move — engineering check soft-pass']);
  }

  const hasSignal = REASONING_SIGNAL_RE.test(text);
  const mentionsProject = getNodesByType(graph, 'Project').some((p) => text.includes(p.label));
  const mentionsDecisionMotif = records.some((r) => {
    const motif = String(r.chosen || r.rawText || '').slice(0, 48);
    return motif && text.toLowerCase().includes(String(r.chosen || '').toLowerCase());
  });
  const identityHit = listIdentityClaims(identity).some((c) => {
    const key = String(c.statement || '').split(/[—–-]/)[0].trim();
    return key.length > 24 && text.includes(key.slice(0, 32));
  });

  if (hasSignal) notes.push('engineering rationale signal present');
  if (mentionsProject) notes.push('grounds in project node');
  if (mentionsDecisionMotif) notes.push('touches decision-record motif');
  if (identityHit) notes.push('echoes identity claim');

  if (DECISION_FIRST_STRATEGIES.has(strategy) || strategy === 'Explain') {
    if (!hasSignal && !mentionsProject && !mentionsDecisionMotif) {
      issues.push(`${strategy} lacks engineering grounding (no rationale / project / decision touch)`);
    }
  }

  return { ok: issues.length === 0, issues, notes };
}

/* ============================================================
   AMENDMENTS
   ============================================================ */

function applyAmendments(pack, checks) {
  let text = pack.text;
  const actions = [];

  if (pack.skipHeavy) {
    return { text, actions };
  }

  // 1. Strip any remaining implementation-voice leaks.
  if (!checks.evidence.ok && checks.evidence.issues.some((i) => /implementation-voice/.test(i))) {
    const cleaned = scrubImplLeaks(text);
    if (cleaned !== text) {
      text = cleaned;
      actions.push({ type: 'scrub-impl-voice', reason: 'removed RAG/documentation-export phrasing' });
    }
  }

  // 2. Soften ungrounded absent-tech ownership when honesty is missing.
  if (!checks.evidence.ok) {
    for (const issue of checks.evidence.issues) {
      const m = /absent tech "([^"]+)"/.exec(issue);
      if (!m) continue;
      const tech = m[1];
      if (HONEST_GAP_RE.test(text)) continue;
      const amended = `${tech} is not part of Sudhanshu's shipped project history. ${text}`;
      text = amended;
      actions.push({ type: 'honesty-gap-prefix', reason: `prefixed honesty for ${tech}` });
      break;
    }
  }

  // 3. Ambiguous confidence + absolute claim → light hedge (Answer only).
  if (!checks.confidence.ok
    && checks.confidence.issues.some((i) => /ambiguous confidence/.test(i))
    && ABSOLUTE_CLAIM_RE.test(text)
    && !/Confidence is|within the scope|from what'?s/i.test(text)) {
    text = text.replace(/^(Yes —)/, 'Yes — with some ambiguity in the match, ');
    actions.push({ type: 'confidence-hedge', reason: 'aligned absolute lead with ambiguous confidence' });
  }

  // 4. Teaching: if Decision-first opens as heading dump, leave a spoken note.
  // (Operators already avoid this; reflection only flags — no rewrite of cards.)
  if (!checks.teachingQuality.ok && TEACH_LEAD_DUMP_RE.test(text.trim())) {
    // Do not invent a new answer — strip the dump header only.
    const stripped = text.replace(TEACH_LEAD_DUMP_RE, '').trim();
    if (stripped && stripped !== text) {
      text = stripped;
      actions.push({ type: 'strip-doc-dump-lead', reason: 'removed documentation-dump heading lead' });
    }
  }

  // Re-check personality fluff — strip rather than rewrite meaning.
  if (!checks.assumptions.ok && checks.assumptions.issues.some((i) => /personality-fluff/.test(i))) {
    const cleaned = text
      .replace(/\b(passionate|humble|genius|rockstar|ninja|10x)\b/gi, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\s+\./g, '.');
    if (cleaned !== text) {
      text = cleaned;
      actions.push({ type: 'strip-personality-fluff', reason: 'removed unevidenced personality claims' });
    }
  }

  text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { text, actions };
}

function scrubImplLeaks(text) {
  let t = String(text || '');
  t = t.replace(/\*{0,2}Based on what is documented:\*{0,2}\s*/gi, '');
  t = t.replace(/\*{0,2}From his portfolio:\*{0,2}\s*/gi, '');
  t = t.replace(/\bretrieval-and-reasoning layer\b/gi, 'portfolio assistant');
  t = t.replace(/\bknowledge base\b/gi, 'portfolio');
  t = t.replace(/\bRAG\b/g, 'portfolio reasoning');
  t = t.replace(/\bembeddings?\b/gi, 'portfolio content');
  return t.trim();
}

/* ============================================================
   HELPERS
   ============================================================ */

function okCheck(notes = []) {
  return { ok: true, issues: [], notes };
}

function deriveOverall(checks, actions) {
  const failed = Object.values(checks).some((c) => !c.ok);
  if (actions.length) return 'amended';
  if (failed) return 'flagged';
  return 'pass';
}

function resolveEntityList(ctx) {
  if (!ctx?.entities) return [];
  if (Array.isArray(ctx.entities)) return ctx.entities;
  if (Array.isArray(ctx.entities.entities)) return ctx.entities.entities;
  return [];
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
