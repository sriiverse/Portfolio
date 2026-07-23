/**
 * conversation.js — Question Understanding stage for SRIIVERSE AI.
 *
 * Implements Stage 2 ("Question Understanding") of docs/REASONING_ENGINE_SPEC.md.
 * This is Phase 2 of the approved reasoning-engine migration (Spec Section 9,
 * Phase C, steps 5–6). Scope of THIS phase, exactly as authorized:
 *   - Build QuestionFrame (§3.1).
 *   - Introduce QuestionType classification (the 13-item priority chain).
 *   - Integrate Subject Resolution (Phase 1) into move/type detection.
 *   - Achieve second-person/third-person behavioral parity for every
 *     existing detector that was previously "you"-only.
 * Explicitly NOT in this phase: Evidence Selection, Confidence (Stage 6),
 * Response Planning, Response Composition. `entities.js`/`knowledge.js`/
 * `planning.js`/`providers.js` are not touched beyond the one mandated
 * `ctx.strategy` → `ctx.questionFrame` rename in `providers.js` (Spec §8.2).
 *
 * MIGRATION NOTE (Spec §8.2 — "narrowing classifyIntent, renaming
 * analyzeStrategy"):
 *   - `analyzeStrategy()` is renamed to `buildQuestionFrame()`. Every field
 *     it returned before Phase 2 (`move`, `scope`, `projectId`, `entities`,
 *     `category`, `subject`) is still returned, unchanged in meaning, so
 *     every existing caller (`providers.js`, `assistant.js`'s
 *     `buildFollowups()`) keeps working exactly as it did. New fields
 *     (`questionType`, `polarity`, `requiresEvidence`, `confidence`,
 *     `source`, `template`, `rawQuery`) are additive.
 *   - `assistant.js`'s `classifyIntent()` is narrowed to command detection
 *     only (Spec §8.2) — its 7 semantic branches (recruiter/architecture/
 *     stack/comparison/profile/project/resume, plus the `'question'`
 *     fallback) are absorbed here as new priority-chain checks, per §3.1's
 *     construction rule. Their regex patterns are relocated, not rewritten.
 *     One necessary consequence: the old `ctx.intent === 'architecture'`
 *     trigger this file used to disambiguate "explain the architecture"
 *     is replaced by a self-sufficient `ARCHITECTURE_RE` test (the exact
 *     pattern `classifyIntent()` used to test) — `ctx.intent` can no longer
 *     supply this signal once `classifyIntent()` no longer returns it. This
 *     produces an IDENTICAL set of matching queries, so it is a behavior-
 *     preserving substitution, not a new classification (Spec §8.2's own
 *     row: "a few `ctx.intent === 'architecture'` checks in `conversation.js`
 *     itself" become `questionType`-based checks).
 *
 * Pure and offline: reads knowledge.js (already-exported portfolio-derived
 * data) and entities.js's alias matcher, never calls a provider, never
 * touches the DOM. Mirrors jdmatch.js/interview.js's contract — this module
 * returns structured data only.
 *
 * Every detector below requires a high-confidence signal; anything
 * ambiguous falls through to `questionType: 'Unknown'` / `move: 'factual'`,
 * which reproduces today's exact retrieval-first behavior. Nothing here can
 * make an existing, working query behave worse — it can only classify more
 * queries with more precision than before.
 */
import { getAllProjects } from './knowledge.js';
import { matchTaxonomyEntities } from './entities.js';

const GREETING_RE = /^(hi+|hey+|hello+|yo|sup|howdy|greetings|good\s+(morning|afternoon|evening))\b/i;

const IDENTITY_RE = /\b(who are you|what are you|introduce yourself|what is sriiverse\s*ai|what can you do|what do you do)\b/i;

const COMPARISON_RE = /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b/i;

const OPINION_RE = /\b(prefer|would you (use|choose|recommend|pick)|your opinion|which\s+\w+\s+(would you|do you)\s+(use|choose|recommend|pick)|what.*(is|'s)?\s*(better|best))\b/i;

const EXPERIENCE_RE = /\b(have you (built|worked|shipped|used)|what projects.*(demonstrate|show|use|involve)|your\s+(backend|frontend|database|ai|full.?stack)\s+experience|tell me about your.*experience)\b/i;

// Coarse topic categories an "opinion" question can land on even when no
// specific technology is named ("what backend framework do you prefer?").
const CATEGORY_HINTS = {
  'backend-framework': /\bbackend\s+framework|web\s+framework\b/i,
  database: /\bdatabase\b|\bsql\s+vs\s+nosql\b/i,
  'frontend-framework': /\bfrontend\s+framework\b/i,
};

// Words that signal "the portfolio as a whole" — an explicit override that
// beats ambient conversational context when disambiguating "architecture".
const PORTFOLIO_SIGNAL_RE = /\b(overall|whole|entire|five.?layer|system\s+design|portfolio|in general|generally)\b/i;

// --- New priority-chain regexes, absorbed verbatim from assistant.js's
// classifyIntent() (Spec §8.2's relocation table). None of these four
// hardcode a person/pronoun — classifyIntent() tested for topic/keyword
// presence, not conversational addressee, so (unlike this file's own
// pre-existing you-anchored regexes below) they already work identically
// for second- and third-person phrasing with zero changes.
const RECRUITER_RE = /recruit|hir|employ|candidate|fit for|strongest|why should|looking for/i;
const ARCHITECTURE_RE = /architect|how.*(built|work|design)|topolog|layer|system design|pipeline/i;
const PROJECT_RE = /project|work|portfolio|built|ship/i;
const STACK_RE = /\b(stack|technolog|tools|skills|what.*(know|use))\b/i;
// One deliberate, narrow deviation from verbatim relocation: bare
// `background` is added as its own alternative (classifyIntent's original
// only used it inside "summarize...background"/"walk through...background"
// compounds). docs/AI_EVALUATION_SUITE.md's own Q18 entry documents that
// "What's your background?" was misrouted to the old 'profile' branch
// (checked earlier in classifyIntent's if-chain) instead of 'resume', and
// names this as the *ideal* fix. This file's own Identity/profile
// absorption (PROFILE_IDENTITY_RE, above) was deliberately narrowed away
// from that broad old 'profile' regex, so without this addition "What's
// your/his background?" would newly fall to `Unknown` instead of Identity
// OR Experience — a net loss, not an improvement. Adding it here closes
// the eval suite's own documented gap instead.
const RESUME_RE = /\b(resume|cv|background)\b|summariz.*(experience|background)|walk.*through.*(experience|resume|background)/i;

// --- New QuestionType checks, authored for this phase (Spec §3.1 items
// 4, 7, 12, and the narrow Identity/profile absorption for item 2). Written
// to recognize both second- and third-person phrasing directly, rather than
// relying on canonicalization — see `toSubjectCanonicalForm()` below for
// why OPINION_RE/EXPERIENCE_RE/RESUME_RE (unchanged, "you"-anchored) need a
// different mechanism than these do.
// Deliberately excludes bare "background" (unlike the old classifyIntent
// 'profile' branch's `/who|about|introduce|background/`) — RESUME_RE (below)
// now owns that word exclusively, so "his background"/"your background"
// both resolve to Experience, not Identity. Keeping "background" here would
// have made PROFILE_IDENTITY_RE win the priority race for third-person
// phrasing only ("his background" matches at check #2, before RESUME_RE's
// check #6 ever runs) while second-person "your background" skipped this
// regex entirely and fell through to RESUME_RE — a second/third-person
// parity break, not a real Identity/Experience distinction.
const PROFILE_IDENTITY_RE = /\b(who is sudhanshu|tell me about (him|sudhanshu)|introduce (him|sudhanshu)|about (him|sudhanshu))\b/i;
const LIMITATION_RE = /\b(weakness|weaknesses|bad at|not good at|limitation|can(?:'t| not) (you|he) do|struggle(s)? with|biggest weakness|improve on|room for improvement)\b/i;
const CAREER_RE = /\b(career\s+(goal|goals|path)|where (do you|does he) see (yourself|himself)|why (did|do) (you|he) (become|want to be)|(five|5).?year (plan|goal)|long.term (goal|plan)|in (five|5) years)\b/i;
const BEHAVIORAL_RE = /\b(tell me about a time|describe a time|how do(?:es)? (you|he) handle|how do(?:es)? (you|he) prioritize|what motivates (you|him))\b/i;
const SKILL_VERIFICATION_RE = /\b(do you know|does he know|are you familiar with|is he familiar with|do you have experience with|does he have experience with|do you use|does he use|know if (he|you)|if (he|you) knows?)\b/i;
const RECOMMENDATION_RE = /\b(what should i (look at|check out|start with)|where should i start|which project should (i|you) (look at|check out))\b/i;
const EVIDENCE_REQUEST_RE = /\b(prove (it|that|you|he)|can (you|he) prove|show me (proof|evidence)|evidence (of|that|for))\b/i;
const CONVERSATION_RE = /^(ok(ay)?|cool|nice|great|thanks( you)?|got it|makes sense|interesting|sounds good)[.!]?$/i;
const CHALLENGE_RE = /\b(even real|just canned|actually (work|know|good)|really (an ai|real|work)|just a (bot|script)|just scripted|bad at|not good at|weakness)\b/i;

// --- Subject resolution (docs/REASONING_ENGINE_SPEC.md Section 3.1) -------
// Resolves WHO the question is fundamentally about, once, before any
// questionType check below runs — the fix for Cluster A ("second-person-
// only pattern matching"). Unchanged from Phase 1.
const ASSISTANT_SUBJECT_RE = /\b(who are you|what are you|are you (real|human|sentient|alive|an? (ai|bot|assistant|chatbot|human))|introduce yourself|what is sriiverse\s*ai|what can you do|what do you do|do you remember|can you access|the assistant('s)?|this (ai|bot|chatbot)('s)?)\b/i;
const OTHER_PERSON_SIGNAL_RE = /\b(the (ceo|manager|recruiter|interviewer|hiring manager|founder)|my (manager|boss|team|company|colleague)|your (company|team|manager))\b/i;

/**
 * Resolve the canonical Subject ('sudhanshu' | 'assistant' | 'ambiguous')
 * for `query`. Default is 'sudhanshu' — this is deliberate, not a fallback:
 * this portfolio assistant only ever discusses Sudhanshu, so "you"/"your",
 * "he"/"his"/"Sudhanshu", and a bare technology/project question with no
 * person-reference at all all resolve the same way. Unchanged from Phase 1.
 */
function resolveSubject(query) {
  const qLower = String(query || '').trim().toLowerCase();
  if (!qLower) return 'ambiguous';

  if (ASSISTANT_SUBJECT_RE.test(qLower)) return 'assistant';
  if (OTHER_PERSON_SIGNAL_RE.test(qLower)) return 'ambiguous';
  return 'sudhanshu';
}

/**
 * Rewrite third-person references to Sudhanshu into their second-person
 * equivalent ("has he worked" → "have you worked", "his experience" →
 * "your experience"), so this file's pre-existing, spec-mandated-unchanged
 * "you"-anchored regexes (OPINION_RE, EXPERIENCE_RE, RESUME_RE) match a
 * third-person question exactly as they already match its second-person
 * counterpart — the concrete mechanism behind "classifies type against
 * that resolved subject" (Spec Stage 2 purpose statement) and the fix for
 * second-person/third-person behavioral parity. A no-op whenever `subject`
 * isn't `'sudhanshu'`, and a no-op on any query that has no third-person
 * reference to begin with (nothing to replace).
 */
function toSubjectCanonicalForm(qLower, subject) {
  if (subject !== 'sudhanshu') return qLower;
  return qLower
    .replace(/\bhas he\b/g, 'have you')
    .replace(/\bdoes he\b/g, 'do you')
    .replace(/\bwould he\b/g, 'would you')
    .replace(/\bis he\b/g, 'are you')
    .replace(/\bwas he\b/g, 'were you')
    .replace(/\bcan he\b/g, 'can you')
    .replace(/\bcould he\b/g, 'could you')
    .replace(/\bwill he\b/g, 'will you')
    .replace(/\bsudhanshu's\b/g, 'your')
    .replace(/\bsudhanshu\b/g, 'you')
    .replace(/\bhis\b/g, 'your')
    .replace(/\bhim\b/g, 'you')
    .replace(/\bhe\b/g, 'you');
}

function emptyStrategy(move) {
  return { move, scope: null, projectId: null, entities: [], category: null };
}

/** Try to resolve a "compare X and Y" query to either 2 projects or 2 techs. */
function resolveComparison(qLower) {
  const projects = getAllProjects();
  const matchedProjects = projects.filter((p) => qLower.includes(p.id) || qLower.includes(p.name.toLowerCase()));
  if (matchedProjects.length >= 2) {
    return { move: 'comparison', scope: 'project', projectId: null, entities: matchedProjects.map((p) => p.id), category: null };
  }

  const techEntities = matchTaxonomyEntities(qLower);
  if (techEntities.length >= 2) {
    return { move: 'comparison', scope: 'tech', projectId: null, entities: techEntities, category: null };
  }

  // Comparison phrasing without two resolvable like-for-like entities (e.g.
  // "compare their pricing") — no confident move; caller falls through.
  return null;
}

/** Try to resolve "which X do you prefer" to a category, or a named tech pair. */
function resolveOpinion(qLower) {
  const techEntities = matchTaxonomyEntities(qLower);
  for (const [category, rx] of Object.entries(CATEGORY_HINTS)) {
    if (rx.test(qLower)) {
      return { move: 'opinion', scope: null, projectId: null, entities: techEntities, category };
    }
  }
  // No category phrase, but ≥2 named technologies plus preference
  // language — treat it as an opinion about that specific named pair.
  if (techEntities.length >= 2) {
    return { move: 'opinion', scope: null, projectId: null, entities: techEntities, category: null };
  }
  return null;
}

/** Disambiguate "explain the architecture" between the portfolio overview and a specific project. */
function resolveExplanation(qLower, ctx) {
  const projects = getAllProjects();
  const explicit = projects.find((p) => qLower.includes(p.id) || qLower.includes(p.name.toLowerCase()));
  if (explicit) {
    return { move: 'explanation', scope: 'project', projectId: explicit.id, entities: [explicit.id], category: null };
  }

  // Explicit "the whole system" phrasing always wins, even mid-project-context.
  if (PORTFOLIO_SIGNAL_RE.test(qLower)) {
    return { move: 'explanation', scope: 'portfolio', projectId: null, entities: [], category: null };
  }

  // No explicit signal either way — use conversational context, exactly as
  // requested ("use conversational context before retrieval").
  const contextProject = ctx.focusProject || ctx.memory?.lastProject || ctx.awareness?.currentProject;
  if (contextProject) {
    return { move: 'explanation', scope: 'project', projectId: contextProject, entities: [contextProject], category: null };
  }

  // First-turn, no context, generic phrasing — the safe default is the
  // portfolio overview, not whichever project happens to score highest.
  return { move: 'explanation', scope: 'portfolio', projectId: null, entities: [], category: null };
}

/**
 * Compute the LEGACY strategy shape (`move`/`scope`/`projectId`/`entities`/
 * `category`) — byte-identical to Phase 1's `analyzeStrategy()` body, with
 * exactly one necessary fix: the "explain the architecture" trigger no
 * longer reads `ctx.intent === 'architecture'` (that signal no longer
 * exists post-narrowing — see this file's header), it tests `ARCHITECTURE_RE`
 * directly, which is the exact pattern `classifyIntent()` used to test to
 * produce that value. Same matching queries, same resulting `move`/`scope`.
 * Kept as its own function, independent of `classifyQuestionType()` below,
 * so the legacy fields' correctness can be reasoned about (and diffed) in
 * total isolation from the new classification logic.
 */
function computeLegacyStrategy(qLower, ctx) {
  if (GREETING_RE.test(qLower)) return emptyStrategy('greeting');
  if (IDENTITY_RE.test(qLower)) return emptyStrategy('identity');

  if (COMPARISON_RE.test(qLower)) {
    const strategy = resolveComparison(qLower);
    if (strategy) return strategy;
  }

  if (OPINION_RE.test(qLower)) {
    const strategy = resolveOpinion(qLower);
    if (strategy) return strategy;
  }

  if (EXPERIENCE_RE.test(qLower)) {
    return { move: 'experience', scope: null, projectId: null, entities: matchTaxonomyEntities(qLower), category: null };
  }

  if (ARCHITECTURE_RE.test(qLower)) return resolveExplanation(qLower, ctx);

  return emptyStrategy('factual');
}

// Stage 2's own field: does an honest answer to this questionType require
// citing portfolio evidence, or can the assistant's persona/self-model
// alone answer honestly? (Spec §3.1.) Identity is handled as a special
// case below (true only when subject:'sudhanshu' — see `classifyQuestionType`).
const REQUIRES_EVIDENCE = {
  Identity: false, Greeting: false, Capability: true, TechnologyExplanation: true,
  ArchitectureExplanation: true, ProjectExplanation: true, Comparison: true,
  Opinion: true, Recommendation: true, SkillVerification: true, Experience: true,
  EvidenceRequest: true, Recruiter: true, Behavioral: false, Career: false,
  Limitation: false, Conversation: false, Unknown: true,
};

/**
 * Classify `questionType` (and the other new QuestionFrame fields) via the
 * ordered, first-match-wins priority chain specified in
 * docs/REASONING_ENGINE_SPEC.md §3.1. Independent of `computeLegacyStrategy`
 * above — deliberately re-runs a couple of the same regex tests rather than
 * sharing state between the two, so each can be verified independently
 * (the "deliberately accepted, temporary duplication" pattern the Spec
 * itself sanctions elsewhere, e.g. §8.5's discourse fields).
 */
function classifyQuestionType(qLower, canonical, subject, ctx) {
  const polarity = CHALLENGE_RE.test(qLower) ? 'challenge' : 'neutral';
  const make = (questionType, over = {}) => ({
    questionType,
    subject,
    polarity: over.polarity || polarity,
    requiresEvidence: over.requiresEvidence ?? REQUIRES_EVIDENCE[questionType],
    scope: over.scope ?? null,
    template: over.template ?? null,
    confidence: over.confidence || 'high',
    source: 'regex-match',
  });

  // 1. Greeting
  if (GREETING_RE.test(qLower)) return make('Greeting');

  // 2. Identity — unchanged IDENTITY_RE (always subject:'assistant', see
  // ASSISTANT_SUBJECT_RE ⊇ IDENTITY_RE), OR the "who is Sudhanshu"/"tell me
  // about him" phrasing absorbed from classifyIntent's old 'profile' branch.
  if (IDENTITY_RE.test(qLower)) return make('Identity');
  if (subject === 'sudhanshu' && PROFILE_IDENTITY_RE.test(qLower)) {
    return make('Identity', { requiresEvidence: true });
  }

  // 3. Comparison — unchanged COMPARISON_RE + the existing ≥2-entity
  // resolution (the concept Stage 3 will later own formally as `multiEntity`).
  if (COMPARISON_RE.test(qLower)) {
    const resolved = resolveComparison(qLower);
    if (resolved) {
      return make('Comparison', {
        scope: resolved.scope,
        template: resolved.scope === 'tech' ? 'tech-vs-tech' : 'project-vs-project',
      });
    }
  }

  // 4. Behavioral / Career / Limitation — new; must run before Opinion/
  // Experience so e.g. "what's your biggest weakness" doesn't fall into
  // Opinion, and "what technologies are you weakest in" doesn't fall into
  // TechnologyExplanation (Spec §3.1's explicit ordering rationale).
  if (LIMITATION_RE.test(qLower)) return make('Limitation', { polarity: 'challenge' });
  if (CAREER_RE.test(qLower)) return make('Career');
  if (BEHAVIORAL_RE.test(qLower)) return make('Behavioral');

  // 5. Opinion — unchanged OPINION_RE, tested against the subject-canonical
  // form so "would he recommend X" matches exactly as "would you recommend X" does.
  if (OPINION_RE.test(canonical) && resolveOpinion(canonical)) return make('Opinion');

  // 6. Experience — unchanged EXPERIENCE_RE (canonical form, same reason as
  // Opinion above), or the resume-shaped phrasing absorbed from
  // classifyIntent's old 'resume' branch (already person-neutral).
  if (EXPERIENCE_RE.test(canonical)) return make('Experience');
  if (RESUME_RE.test(canonical)) return make('Experience', { template: 'resume-summary' });

  // 7. SkillVerification — new; "do you know X"/"have you used X" phrasing,
  // distinct from TechnologyExplanation's "how does X work" phrasing.
  // Authored with both persons built in directly (no canonicalization
  // needed — see this file's header). Excludes queries opening with "what"
  // ("what technologies does he know?") — that shape is an open enumeration
  // request (TechnologyExplanation's territory, check 11), not a yes/no
  // check on one named thing ("does he know Docker?").
  if (SKILL_VERIFICATION_RE.test(qLower) && !/^what\b/.test(qLower)) return make('SkillVerification');

  // 8. Recruiter — absorbed verbatim from classifyIntent's old 'recruiter' branch.
  if (RECRUITER_RE.test(qLower)) return make('Recruiter');

  // 9. ArchitectureExplanation — absorbed verbatim from classifyIntent's old
  // 'architecture' branch. Reuses resolveExplanation()'s scope resolution.
  if (ARCHITECTURE_RE.test(qLower)) {
    const resolved = resolveExplanation(qLower, ctx);
    return make('ArchitectureExplanation', { scope: resolved.scope });
  }

  // 10. ProjectExplanation — absorbed verbatim from classifyIntent's old
  // 'project' branch, OR an explicit project name mentioned on its own
  // ("tell me about QueryForgeAI" contains no "project/work/portfolio/
  // built/ship" substring, so PROJECT_RE alone misses it) — the same
  // explicit-name check resolveExplanation() already uses for architecture
  // scoping, applied here for the same reason.
  const explicitProject = getAllProjects().find((p) => qLower.includes(p.id) || qLower.includes(p.name.toLowerCase()));
  if (PROJECT_RE.test(qLower) || explicitProject) return make('ProjectExplanation');

  // 11. TechnologyExplanation — absorbed verbatim from classifyIntent's old
  // 'stack' branch; the catch-all for technology questions not already
  // matched by 4 (Limitation) or 7 (SkillVerification) above.
  if (STACK_RE.test(qLower)) return make('TechnologyExplanation');

  // 12. Recommendation / EvidenceRequest / Conversation — new, narrow-pattern checks.
  if (RECOMMENDATION_RE.test(qLower)) return make('Recommendation');
  if (EVIDENCE_REQUEST_RE.test(qLower)) return make('EvidenceRequest');
  if (CONVERSATION_RE.test(qLower.trim())) return make('Conversation');

  // 13. Unknown — default, absorbed from classifyIntent's old 'question' fallback.
  return {
    questionType: 'Unknown', subject, polarity,
    requiresEvidence: REQUIRES_EVIDENCE.Unknown,
    scope: null, template: null, confidence: 'low', source: 'default-factual',
  };
}

/**
 * Build the QuestionFrame (docs/REASONING_ENGINE_SPEC.md §3.1) for `query`.
 * Renamed from `analyzeStrategy()` (Spec §8.2) — same parameter shape,
 * superset return shape. `ctx` may include:
 *   - intent          classifyIntent()'s output — now only ever one of the
 *                      8 command labels or null (classifyIntent() no longer
 *                      returns a semantic label); unused by this function's
 *                      own classification, kept in the signature only
 *                      because `assistant.js` still passes it.
 *   - focusProject     resolveContext()'s resolved project id, if any
 *   - memory           the Memory singleton (reads .lastProject)
 *   - awareness        the WebsiteAwareness singleton (reads .currentProject)
 *
 * Return shape — every Phase-1 field, unchanged, plus the new QuestionFrame
 * fields (docs/REASONING_ENGINE_SPEC.md §3.1):
 *   { move, scope, projectId, entities, category,           // legacy (Phase 1 and earlier)
 *     subject, questionType, polarity, requiresEvidence,
 *     confidence, source, template, rawQuery }               // new (Phase 2)
 */
export function buildQuestionFrame(query, ctx = {}) {
  const rawQuery = String(query || '');
  const qLower = rawQuery.trim().toLowerCase();
  const subject = resolveSubject(query);

  if (!qLower) {
    return {
      ...emptyStrategy('factual'), subject,
      questionType: 'Unknown', polarity: 'neutral', requiresEvidence: false,
      scope: null, template: null, confidence: 'low', source: 'default-factual',
      rawQuery,
    };
  }

  const canonical = toSubjectCanonicalForm(qLower, subject);
  const legacy = computeLegacyStrategy(qLower, ctx);
  const classified = classifyQuestionType(qLower, canonical, subject, ctx);

  // Classification confidence is capped at 'medium' when the subject itself
  // is ambiguous — being unsure WHO the question is about undermines the
  // certainty of any type classification made about it (Spec §3.1's
  // ambiguous-subject failure mode: downstream stages "must degrade
  // gracefully", starting here with an honest confidence signal).
  if (subject === 'ambiguous' && classified.confidence === 'high') {
    classified.confidence = 'medium';
  }

  return { ...legacy, ...classified, rawQuery };
}
