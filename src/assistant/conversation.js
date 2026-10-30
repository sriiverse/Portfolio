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

const IDENTITY_RE = /\b(who are you|what are you|introduce yourself|what is sriiverse\s*ai|what is sriiverseai|what can you do|what do you do|are you sudhanshu|are you (sriiverse\s*ai|sriiverseai)|your role (inside|in)|what (is|are) your role)\b/i;

const COMPARISON_RE = /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b|\bdiffer(?:s|ed)?\b|\bdifferent from\b|\barchitecturally\b/i;

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
const PROFILE_IDENTITY_RE = /\b(who is sudhanshu|tell me about (him|sudhanshu)|introduce (him|sudhanshu)|about (him|sudhanshu)|beyond (his |the )?resume|person behind|kind of engineer|what (kind|type) of engineer|what does (he|sudhanshu) (care|specialize)|describe sudhanshu)\b/i;
const LIMITATION_RE = /\b(weakness|weaknesses|bad at|not good at|limitation|can(?:'t| not) (you|he) do|struggle(s)? with|biggest weakness|improve on|room for improvement)\b/i;
const CAREER_RE = /\b(career\s+(goal|goals|path)|where (do you|does he) see (yourself|himself)|why (did|do) (you|he) (become|want to be)|(five|5).?year (plan|goal)|long.term (goal|plan)|in (five|5) years)\b/i;
const BEHAVIORAL_RE = /\b(tell me about a time|describe a time|how do(?:es)? (you|he) handle|how do(?:es)? (you|he) prioritize|what motivates (you|him))\b/i;
const SKILL_VERIFICATION_RE = /\b(do you know|does he know|are you familiar with|is he familiar with|do you have experience with|does he have experience with|do you use|does he use|know if (he|you)|if (he|you) knows?)\b/i;
const RECOMMENDATION_RE = /\b(what should i (look at|check out|start with)|where should i start|which project should (i|you) (look at|check out))\b/i;
const EVIDENCE_REQUEST_RE = /\b(prove (it|that|you|he)|can (you|he) prove|show me (proof|evidence)|evidence (of|that|for))\b/i;
const CONVERSATION_RE = /^(ok(ay)?|cool|nice|great|thanks( you)?|got it|makes sense|interesting|sounds good)[.!]?$/i;
const CHALLENGE_RE = /\b(even real|just canned|actually (work|know|good)|really (an ai|real|work)|just a (bot|script)|just scripted|bad at|not good at|weakness)\b/i;

/**
 * V4.5 Mod 1 — Conversational Intent Gate.
 * Modes that must win over entity-confirm / project-card / hire-pitch paths.
 * Returns null when the normal questionType/reasoning classifiers should own the turn.
 */
const EMPLOYER_RE = /\b(google|meta|amazon|apple|netflix|microsoft|faang)\b/i;
const EMPLOYMENT_CLAIM_RE = /\b(experience at|worked at|job at|employed at|intern(ship)? at|tenure at|your experience at|tell me about your experience at)\b/i;

export function classifyConversationMode(query) {
  const t = String(query || '').toLowerCase().trim();
  if (!t) return null;

  // preference_gap — personal facts / employers not evidenced in the portfolio
  if (/\b(relocat\w*|salary|compensation|pay expectation|phd research|aws certification|your aws cert)\b/i.test(t)) {
    return 'preference_gap';
  }
  if (EMPLOYMENT_CLAIM_RE.test(t) && EMPLOYER_RE.test(t) && !/\b(interview|impress|which project|project for|faang-style)\b/i.test(t)) {
    return 'preference_gap';
  }

  // challenge — criticism / defend-concede / thin-wrapper attacks
  if (/\b(criticiz\w*|thin wrapper|bad choice|defend or concede|over-?engineered|convince me otherwise|aren'?t you just|just wrapping)\b/i.test(t)) {
    return 'challenge';
  }

  // self — soft skills / regret / mistakes (not "biggest weakness" — Critique owns that)
  if (/\b(leadership|disagreement on a team|code review feedback|decision you regret|mistakes did you make|how do(?:es)? (you|he) handle disagreement)\b/i.test(t)) {
    return 'self';
  }

  // ops_story — production / on-call narratives
  if (/\b(on-?call|failed in production|what failed|production (incident|outage|failure))\b/i.test(t)) {
    return 'ops_story';
  }

  // probe — engineering depth probes (failure modes, scale, complexity, hardest part)
  if (/\b(failure modes?|scale .{0,24}(\d+\s*k?\s*)?(qps|rps|req)|time and space complexity|hardest part|what was the hardest)\b/i.test(t)) {
    return 'probe';
  }

  // opinion — takes not reducible to stack inventory
  if (/\b(what do you think of|what'?s your (take|opinion) on|is \w[\w+.#-]* overrated|is typescript worth|thoughts on)\b/i.test(t)
    || /\boverrated\b/i.test(t)
    || /\bworth it\b/i.test(t) && /\b(typescript|typeScript|ts)\b/i.test(t)) {
    return 'opinion';
  }

  // brief — timed / scoped asks must not dump chronology or brochure
  if (/\b(60.?seconds?|30.?seconds?|elevator pitch|in (one|1) minute|three talking points|tl;?dr|plain english|describe sudhanshu in)\b/i.test(t)) {
    return 'brief';
  }

  // beyond_resume — person/engineer synthesis, not CV dump
  // (exclude "kind/type of engineer" — that is engineer_type specialization)
  if (/\b(beyond (his |the |what'?s (on |written on )?)?resume|person behind|meeting the person|don'?t want to see .{0,24}resume|how does he approach|what does he care about|what makes (his )?projects interesting)\b/i.test(t)) {
    return 'beyond_resume';
  }

  // brand — SRIIVERSEAI as universe/environment (not a skill check).
  // Digital Brain is the intelligence layer, not a fourth project.
  if (/\bdigital brain\b/i.test(t)
    || /\b(what is sriiverse\s*ai|what is sriiverseai|sriiverse\s*ai (different|vs|versus)|different from a typical portfolio|role inside (it|sriiverse)|what do you (actually )?know about sriiverse)\b/i.test(t)) {
    return 'brand';
  }

  // intro — conversational self-introduction (never Unknown/fallback)
  if (/\b(tell me about yourself|introduce yourself|introduce you(?:rself)?|about yourself)\b/i.test(t)) {
    return 'intro';
  }

  return null;
}

/**
 * V4.5 Mod 2 — follow-up shapes that must inherit the prior commitment.
 * Expanded so short "How?" / "Why?" / improve probes stay on the bound project.
 */
export function isBoundFollowUpQuery(query) {
  const raw = String(query || '').trim();
  // Strip trailing project names so enrichment doesn't break ^...$ patterns
  const t = raw
    .replace(/\b(queryforgeai|queryforge|reporadarai|reporadar|placement pro\+?|placementpro)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  if (!t) return false;
  if (/\bwhy that one\b|\bwhy this one\b|\bwhy that\b|\bwhy this\??\s*$/i.test(t)) return true;
  if (/^(and )?why\??$/i.test(t)) return true;
  if (/^(and )?how\??$/i.test(t)) return true;
  if (/^how (does|did|do|is|was) (it|that|this|the architecture)\b/i.test(t)) return true;
  if (/^how does it work\??$/i.test(t)) return true;
  if (/^how is that generated\??$/i.test(t)) return true;
  if (/^how is (that|it|this) calculated\??$/i.test(t)) return true;
  if (/^what (does|did) (it|that) (actually )?fetch\??$/i.test(t)) return true;
  if (/^why did you choose that\??$/i.test(t)) return true;
  if (/^what model does (that|it|this) use\??$/i.test(t)) return true;
  if (/^why (that |this )?(architecture|stack|design|choice)\??$/i.test(t)) return true;
  if (/^what (database|db|stack|frontend|backend) does it use\??$/i.test(t)) return true;
  if (/^(?:and )?(?:what about )?(?:its |the )?backend\??$/i.test(t)) return true;
  if (/^(?:and )?(?:what about )?(?:its |the )?frontend\??$/i.test(t)) return true;
  if (/^(?:and )?(?:what about )?(?:its |the )?(?:database|db|persistence)\??$/i.test(t)) return true;
  if (/^which technology powers (?:its |the )?backend\??$/i.test(t)) return true;
  if (/^tell me about its server[- ]side\??$/i.test(t)) return true;
  if (/^what would you (improve|change|rebuild)( next)?\??$/i.test(t)) return true;
  if (/^why did (he|sudhanshu|you) (choose|build|make)\b/i.test(t) && t.length < 80) return true;
  if (/\bso why did\b|\bwhy (did|does|would).{0,40}\bkeep\b/i.test(t)) return true;
  if (/\bwhat was the hardest\b|\bhardest part\b/i.test(t)) return true;
  if (/\bwhy flask\b|\bkeep flask\b|\bkept flask\b/i.test(t) && !/queryforge|reporadar|placement/i.test(t)) return true;
  // "Is it built with Flask?" / "Does it use FastAPI?" — the project name
  // was stripped above, so this only matches a deictic technology question.
  if (/^(?:is|does|did|was|are|do) (?:it|that|this|he)\b/i.test(t) && /\b(?:built with|use|uses|using)\b/i.test(t)) return true;
  if (/^how does (?:its |the )?(?:skill-?gap|roadmap)\b/i.test(t)) return true;
  return false;
}

/**
 * An explicit request for the full backend record, not a short follow-up.
 * "Explain the complete backend architecture" qualifies. "What about the backend?" does not.
 */
export function asksBackendDepth(query) {
  const t = String(query || '').toLowerCase();
  if (!/\b(?:backends?|server[- ]side)\b/.test(t)) return false;
  return /\b(?:complete|entire|in detail|detailed|walk(?: me)? through|full)\b/.test(t)
    || /\bexplain how\b/.test(t)
    || /\bincluding\b/.test(t);
}

/**
 * A question about one project's backend, not a comparison, a full stack tour,
 * or an explicit request for the complete architecture.
 * "What about the backend?" qualifies. "What technologies did he use?" does not.
 */
export function isBackendAspectQuery(query) {
  const t = String(query || '').toLowerCase();
  if (asksBackendDepth(t)) return false;
  if (/\b(compare|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/.test(t)) return false;
  if (/\b(tech(?:nology)? stack|what technologies|technologies (?:does|did)|what did (?:he|you|sudhanshu) use|used to build|use to build)\b/.test(t)) return false;
  if (/\b(backend engineering|backend team|scalable backend|backend or frontend|frontend or backend)\b/.test(t)) return false;
  if (/\bstronger\b.{0,24}\bbackend\b/.test(t)) return false;
  return /\b(?:backends?|server[- ]side)\b/.test(t);
}

/**
 * A question about one project's database or persistence.
 * Comparisons and schema-origin questions stay on their own routes.
 */
export function isDatabaseAspectQuery(query) {
  const t = String(query || '').toLowerCase();
  if (/\b(compare|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/.test(t)) return false;
  if (/\barchitect/.test(t)) return false;
  if (/\bschema\b/.test(t)) return false;
  return /\b(?:databases?|persistence|data store)\b/.test(t);
}

/**
 * A short question about one project's frontend.
 * A comparison, or a question that also asks about the backend, stays on its own route.
 */
export function isFrontendAspectQuery(query) {
  const t = String(query || '').toLowerCase();
  if (/\b(compare|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/.test(t)) return false;
  if (/\barchitect/.test(t)) return false;
  if (/\b(backend or frontend|frontend or backend)\b/.test(t)) return false;
  if (/\bstronger\b.{0,24}\bfrontend\b/.test(t)) return false;
  if (/\bdemonstrat\w* frontend|best.*(for )?frontend|most.*frontend/.test(t)) return false;
  return /\bfrontends?\b/.test(t);
}

/** Closed "is/does … use/built with …" question about a known technology. */
export function isYesNoTechnologyAsk(query) {
  const t = String(query || '').toLowerCase().trim();
  return /^(?:is|does|did|was|are|do)\b/.test(t)
    && /\b(?:built with|use|uses|using)\b/.test(t)
    && /\b(?:flask|fastapi|uvicorn|react|vite|next\.?js|gemini|groq)\b/.test(t);
}

/**
 * The dimension the visitor actually asked for.
 * One classifier, shared by question type, reasoning, retrieval-adjacent
 * brochure gating, and follow-up suggestions. Returns null when a more
 * specific engineering facet (data flow, model, design-intent) should win.
 * @returns {'stack'|'motivation'|'architecture'|'api'|'comparison'|'walkthrough'|'flow'|'yesno'|'database'|null}
 */
export function classifyAnswerAspect(query) {
  const t = String(query || '').toLowerCase().trim();
  if (!t) return null;

  const namedProject = /queryforge|placement\s*pro|placementpro|reporadar|repo\s*radar/i.test(t);
  const competency = /\b(can|could|able to)\b.{0,32}\b(design|build|write|create)\b/i.test(t);
  const designChoice = /\bwhy\b.{0,48}\b(chosen|choose|chose|picked|prefer)\b/i.test(t)
    || /\bwhy\b.{0,36}\b(fastapi|flask|gemini|groq|netlify|render|react|minilm|networkx|octokit|vercel|next)\b/i.test(t);

  if (/\b(apis?|endpoints?|external (?:apis?|services?|providers?)|third[- ]party)\b/i.test(t) && !competency) {
    return 'api';
  }

  const motivation = /\bmotivation\b/i.test(t)
    || /\bbehind building\b/i.test(t)
    || /\bwhy (did|does|do|was|is).{0,48}\b(build|built|create|created|make|made)\b/i.test(t)
    || /\bwhat problem\b/i.test(t);
  if (motivation && !designChoice) return 'motivation';

  // Closed technology questions get a yes/no before the full stack paragraph.
  // A bare "Is it built with Flask?" stays unresolved here until the bound
  // project is known; the named form is decided immediately.
  // RepoRadar's Gemini/OpenAI question is about its model record, not a stack yes/no.
  const repoRadarModel = /reporadar|repo\s*radar/i.test(t) && /\b(gemini|groq|openai|llm|generative)\b/i.test(t);
  if (isYesNoTechnologyAsk(t) && namedProject && !repoRadarModel) return 'yesno';

  if (isBackendAspectQuery(t)) return 'stack';
  if (isDatabaseAspectQuery(t)) return 'database';
  if (isFrontendAspectQuery(t)) return 'stack';
  if (asksBackendDepth(t) && namedProject) return 'architecture';

  const stack = /\b(tech(?:nology)? stack|(?:the )?stack (?:for|of)|what technologies|what tools|technologies (?:does|did)|what did (?:he|you|sudhanshu) use|used to build|use to build|built with)\b/i.test(t)
    || /\bwhat\b.{0,48}\b(?:use|used|using)\b.{0,32}\bbuild\b/i.test(t);
  if (stack && !/\barchitect/i.test(t)) return 'stack';

  const analyzesTargetArchitecture = /\banaly[sz]e\b.{0,40}\barchitect/i.test(t)
    || /\btarget(?:'s| repo)? architecture\b/i.test(t);
  const explainsOwnArchitecture = !analyzesTargetArchitecture && (
    (/\b(explain|describe|what is|what's|show)\b.{0,48}\barchitect/i.test(t))
    || /\barchitect\w*\s+of\b/i.test(t)
  );
  const howBuilt = /\bhow (?:is|was)\b.{0,48}\b(?:built|designed|structured)\b/i.test(t);
  const portfolioWide = /\b(five[- ]layer|overall architecture|portfolio architecture|in general)\b/i.test(t);
  if ((explainsOwnArchitecture || howBuilt) && namedProject && !portfolioWide && !designChoice) {
    return 'architecture';
  }

  // "How does QueryForgeAI work?" The project name has to be the subject.
  // "How does authentication work in Placement Pro+?" stays on that facet.
  const projectSubject = '(?:queryforgeai|queryforge|reporadarai|reporadar|repo\\s*radar|placement\\s*pro\\+?)';
  const productFlow = new RegExp(`\\bhow (?:does|do|did) (?:the |an? )?(?:${projectSubject})(?:\\s+actually)?\\s+works?\\b`, 'i').test(t);
  const assistantSelf = /\bhow (?:does|do) (?:you|the assistant|this assistant|this chat)\b/i.test(t);
  if (productFlow && namedProject && !assistantSelf && !analyzesTargetArchitecture) return 'flow';

  if (/\b(compare|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/i.test(t)) return 'comparison';

  const explicitWalkthrough = /\b(walk (me )?through|deep dive|in detail|open (the )?project|full (write-?up|breakdown))\b/i.test(t);
  const flowWalkthrough = /\b(flow|pipeline|generat|from user input|under the hood|schema_def)\b/i.test(t);
  if (explicitWalkthrough && !flowWalkthrough) return 'walkthrough';

  return null;
}

/**
 * Next-step questions that change dimension. Null when this turn has no
 * aspect (engineering-detail answers keep their existing empty chip set).
 */
function projectKeyFromName(name) {
  const n = String(name || '').toLowerCase();
  if (/queryforge/.test(n)) return 'queryforge';
  if (/placement/.test(n)) return 'placementpro';
  if (/reporadar|repo\s*radar/.test(n)) return 'reporadar';
  return null;
}

const FOLLOWUP_BY_PROJECT = {
  queryforge: {
    stack: [
      'How does the SQL generation flow work?',
      'Which external AI providers does QueryForgeAI use?',
      'Does QueryForgeAI execute SQL against a live database?',
    ],
    architecture: [
      'How does the SQL generation flow work?',
      'Which external AI providers does QueryForgeAI use?',
      'Does QueryForgeAI execute SQL against a live database?',
    ],
    yesno: [
      'How does the SQL generation flow work?',
      'Which external AI providers does QueryForgeAI use?',
      'Does QueryForgeAI execute SQL against a live database?',
    ],
    flow: [
      'What did he use to build QueryForgeAI?',
      'Which external AI providers does QueryForgeAI use?',
      'Does QueryForgeAI execute SQL against a live database?',
    ],
    api: [
      'How does the SQL generation flow work?',
      'Does QueryForgeAI execute SQL against a live database?',
    ],
    motivation: [
      'What did he use to build QueryForgeAI?',
      'How does QueryForgeAI work?',
    ],
  },
  placementpro: {
    stack: [
      'How does its skill-gap analysis work?',
      'How does the roadmap generator work?',
      'How does its architecture differ from QueryForgeAI?',
    ],
    architecture: [
      'How does its skill-gap analysis work?',
      'How does the roadmap generator work?',
      'How does its architecture differ from QueryForgeAI?',
    ],
    yesno: [
      'How does its skill-gap analysis work?',
      'How does the roadmap generator work?',
    ],
    flow: [
      'How does its skill-gap analysis work?',
      'How does the roadmap generator work?',
      'How is Placement Pro+ built?',
    ],
    motivation: [
      'How does its skill-gap analysis work?',
      'How is Placement Pro+ built?',
    ],
    api: [
      'How does its skill-gap analysis work?',
      'How does the roadmap generator work?',
    ],
  },
  reporadar: {
    stack: [
      'What GitHub data does RepoRadar use?',
      'How does its heuristic scoring work?',
      'Does RepoRadar use a generative model?',
    ],
    architecture: [
      'What GitHub data does RepoRadar use?',
      'How does its heuristic scoring work?',
      'Does RepoRadar use a generative model?',
    ],
    yesno: [
      'What GitHub data does RepoRadar use?',
      'How does its heuristic scoring work?',
    ],
    flow: [
      'What GitHub data does RepoRadar use?',
      'How does its heuristic scoring work?',
      'Does RepoRadar use a generative model?',
    ],
    motivation: [
      'How does RepoRadar work?',
      'What GitHub data does RepoRadar use?',
    ],
    api: [
      'What GitHub data does RepoRadar use?',
      'How does its heuristic scoring work?',
    ],
  },
};

function withoutRepeatedQuestion(query, items) {
  const q = String(query || '').toLowerCase().replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim();
  return items.filter((item) => {
    const s = item.toLowerCase().replace(/[?!.]/g, '').replace(/\s+/g, ' ').trim();
    if (!s || s === q) return false;
    if (q.length > 12 && (q.includes(s) || s.includes(q))) return false;
    return true;
  }).slice(0, 3);
}

export function suggestFollowupAngles(query, projectName) {
  const namedAspect = classifyAnswerAspect(query);
  const aspect = namedAspect || (isYesNoTechnologyAsk(query) ? 'yesno' : null);
  const id = projectKeyFromName(projectName) || projectKeyFromName(query);
  const table = id ? FOLLOWUP_BY_PROJECT[id] : null;
  const picked = table?.[aspect];
  if (picked?.length) return withoutRepeatedQuestion(query, picked);
  return null;
}

function mentionsProject(query, project) {
  const q = String(query || '').toLowerCase();
  const name = String(project?.name || '').toLowerCase();
  const id = String(project?.id || '').toLowerCase();
  if ((id && q.includes(id)) || (name && q.includes(name))) return true;
  // The display name is "Placement Pro+". "Placement Pro" is the same project.
  if (id === 'placementpro' && /\bplacement\s*pro\b/.test(q)) return true;
  return false;
}

/** Projects named in this question. An explicit name outranks an older comparison. */
export function findExplicitProjects(query) {
  return getAllProjects().filter((project) => mentionsProject(query, project));
}

/**
 * The question refers to prior context and asks to compare, so a newly
 * named project joins the bound set instead of replacing it.
 */
export function explicitlyJoinsPriorComparison(query) {
  const t = String(query || '');
  const compares = /\b(compare|compared|comparison|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/i.test(t);
  const deictic = /\b(that|this|those|them|their|its|it|the same|the previous|that approach)\b/i.test(t);
  return compares && deictic;
}

function isContextualFollowUp(query) {
  const t = String(query || '').trim();
  if (!t) return false;
  if (isBoundFollowUpQuery(t)) return true;
  if (/\b(which one|which of them|what model|what about)\b/i.test(t)) return true;
  if (/\b(it|that|this|its|one|both|other|their|them|those)\b/i.test(t)) return true;
  // Short How/Why/What is a follow-up only when the question names no project.
  // Word count must not override an explicit project.
  return /^(how|why|what)\b/i.test(t) && t.split(/\s+/).length <= 8;
}

/**
 * How prior project context attaches to this question.
 * explicit — a named project replaces the old comparison
 * expand — a deictic comparison merges the prior set with any new project
 * follow-set — unnamed follow-up keeps the comparison project set
 * follow-one — unnamed follow-up keeps a single lastProject
 * none — leave the query unchanged
 */
export function classifyContextAttachment(query, { lastProject = null, projectIds = [] } = {}) {
  const explicit = findExplicitProjects(query);
  const bound = (Array.isArray(projectIds) ? projectIds : []).filter(Boolean);
  const joins = explicitlyJoinsPriorComparison(query);
  if (joins && (bound.length >= 2 || lastProject)) return 'expand';
  const compares = /\b(compare|compared|comparison|vs\.?|versus|difference between|differ(?:s|ed)?|different from|architecturally)\b/i.test(String(query || ''));
  if (compares && lastProject && explicit.length >= 2 && explicit.some((project) => project.id === lastProject)) return 'expand';
  if (explicit.length) return 'explicit';
  if (!isContextualFollowUp(query)) return 'none';
  if (bound.length >= 2) return 'follow-set';
  if (lastProject) return 'follow-one';
  return 'none';
}

/**
 * Shared by the live resolver and the Phase 2D harness so they cannot drift.
 * Returns the query the rest of the pipeline should classify.
 */
export function enrichBoundContext(query, {
  lastProject = null,
  projectIds = [],
  awarenessProject = null,
  pendingClarification = false,
} = {}) {
  const projects = getAllProjects();
  const byId = (id) => projects.find((project) => project.id === id) || null;
  const explicit = findExplicitProjects(query);
  const bound = (Array.isArray(projectIds) ? projectIds : []).filter(Boolean);
  const attachment = classifyContextAttachment(query, { lastProject, projectIds: bound });
  const append = (ids) => {
    const missing = ids.map(byId).filter(Boolean).filter((project) => !mentionsProject(query, project));
    if (!missing.length) return query;
    return `${query} ${missing.map((project) => project.name).join(' ')}`;
  };

  if (attachment === 'explicit') {
    return { query, focusProject: explicit[0]?.id || null, enriched: false };
  }
  if (attachment === 'expand') {
    const base = bound.length >= 2 ? bound : [lastProject].filter(Boolean);
    const enriched = append(base);
    const focusProject = bound.length >= 2 ? null : (lastProject || null);
    return { query: enriched, focusProject, enriched: enriched !== query };
  }
  if (attachment === 'follow-set') {
    const enriched = append(bound);
    return { query: enriched, focusProject: null, enriched: enriched !== query };
  }
  if (attachment === 'follow-one' && lastProject) {
    const enriched = append([lastProject]);
    return { query: enriched, focusProject: lastProject, enriched: enriched !== query };
  }
  const pronoun = /\b(it|that|this|its|second|third|first|one|both|other|next)\b/i.test(query);
  // The viewport card is not a visitor selection. An unresolved project
  // clarification stays unresolved until the visitor names a project.
  if (!pendingClarification && !explicit.length && awarenessProject && pronoun) {
    const focus = lastProject || awarenessProject;
    const enriched = append([focus]);
    return { query: enriched, focusProject: focus, enriched: enriched !== query };
  }
  return { query, focusProject: explicit[0]?.id || lastProject || null, enriched: false };
}

/**
 * Visitor asked for a direct answer with no menus / options / follow-ups.
 */
export function wantsDirectAnswerOnly(query) {
  const t = String(query || '');
  return (
    /\bdo not (give|provide|offer|include|show)\b[\s\S]{0,80}\b(navigation|options|recommendations?|questions? (i|you) could|follow-?ups?|chips?|menus?)\b/i.test(t)
    || /\b(without|no)\b[\s\S]{0,40}\b(navigation|options|recommendations?|follow-?ups?|menus?)\b/i.test(t)
    || /\b(direct answer only|answer (me )?directly|only (the )?(actual |direct )?answer)\b/i.test(t)
  );
}

// --- Subject resolution (docs/REASONING_ENGINE_SPEC.md Section 3.1) -------
// Resolves WHO the question is fundamentally about, once, before any
// questionType check below runs — the fix for Cluster A ("second-person-
// only pattern matching"). Unchanged from Phase 1.
const ASSISTANT_SUBJECT_RE = /\b(who are you|what are you|are you (real|human|sentient|alive|an? (ai|bot|assistant|chatbot|human)|sudhanshu|sriiverse\s*ai|sriiverseai)|introduce yourself|what is sriiverse\s*ai|what is sriiverseai|what can you do|what do you do|do you remember|can you access|the assistant('s)?|this (ai|bot|chatbot)('s)?|your role (inside|in)|what do you (actually )?know about sriiverse)\b/i;
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
  // A pending project choice has no selected project. The viewport card
  // must not fill that gap.
  const pendingProject = ctx.memory?.lastCommitment?.task === 'context_clarify'
    && ctx.memory?.lastCommitment?.pendingProject === true;
  const viewportProject = pendingProject ? null : (ctx.awareness?.currentProject || null);
  const contextProject = ctx.focusProject || ctx.memory?.lastProject || viewportProject;
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

  // Product "how does this project work?" is a flow question. ARCHITECTURE_RE
  // also matches "how … work", and returning ArchitectureExplanation here
  // used to leave reasoning with no task and an empty answer.
  if (classifyAnswerAspect(qLower) === 'flow') {
    return make('ProjectExplanation');
  }

  // 9. ArchitectureExplanation — absorbed verbatim from classifyIntent's old
  // 'architecture' branch. Reuses resolveExplanation()'s scope resolution.
  if (ARCHITECTURE_RE.test(qLower)) {
    const resolved = resolveExplanation(qLower, ctx);
    return make('ArchitectureExplanation', { scope: resolved.scope });
  }

  // Aspect wins over "any project name is a project explanation".
  // Otherwise "what did he use to build QueryForge?" never reaches stack.
  const aspect = classifyAnswerAspect(qLower);
  if (aspect === 'stack' || aspect === 'api') return make('TechnologyExplanation');
  if (aspect === 'motivation') return make('ProjectExplanation');

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

  const conversationMode = classifyConversationMode(rawQuery);

  return { ...legacy, ...classified, rawQuery, conversationMode };
}
