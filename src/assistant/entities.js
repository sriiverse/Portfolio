/**
 * entities.js — Entity Resolution for SRIIVERSE AI.
 *
 * Implements Stage 3 ("Entity Resolution") of docs/REASONING_ENGINE_SPEC.md.
 *
 * SCOPE OF THIS FILE (Phase 1 of the reasoning-engine migration — see
 * docs/REASONING_ENGINE_SPEC.md Section 9, Phases A/B):
 *   - resolveEntities()        — the canonical entity resolver (NEW).
 *   - matchTaxonomyEntities()  — relocated verbatim from jdmatch.js, kept
 *                                 for backward compatibility (unchanged
 *                                 signature/behavior — see the Migration
 *                                 Contract, Section 8.1).
 *
 * Phase 4 of the reasoning-engine migration adds:
 *   - assessConfidence()       — Stage 6 ("Confidence"). Co-located here
 *                                 per docs/REASONING_ENGINE_SPEC.md Section
 *                                 4.1/8.1: confidence is, for most question
 *                                 types, a direct function of
 *                                 ResolvedEntity.confidence/ownership (this
 *                                 file's own output) and EvidenceSet.scoreGap
 *                                 (Stage 5's output) — no separate module is
 *                                 justified for one small pure function.
 *
 * assessConfidence() is a PURE ASSESSMENT — it reads an already-built
 * EvidenceSet and an already-resolved entity list and returns a judgment
 * about them. It must never, and does not: call knowledge.js's retrieve()/
 * retrieveScoped() (no retrieval), never mutates or re-derives `evidence`
 * or `entities` (no evidence rewriting), never decides which ResponseBlock
 * applies (no planning — that is Stage 7, a different module, not yet
 * built), and never produces response text (no composition — Stage 8).
 *
 * Pure and offline: reads content.js's SKILLS_TAXONOMY and knowledge.js's
 * already-exported portfolio data only. Never calls a provider, never
 * touches the DOM, never mutates its inputs — mirrors jdmatch.js's and
 * conversation.js's existing contract exactly (see docs/CURSOR_RULES.md
 * Rule 2, "Respect Module Boundaries").
 */
import { SKILLS_TAXONOMY } from '../content.js';
import { getAllProjects, getStack } from './knowledge.js';

// Mirrors jdmatch.js's own bound — defense in depth against a pathologically
// long paste ever reaching the alias-matching regex loop below.
const MAX_SCAN_LENGTH = 8000;

// Common capitalized words that are not proper nouns/technology names —
// excluded so the "unrecognized technology" heuristic below doesn't treat
// ordinary question words as entities. Kept small and conservative per
// docs/REASONING_ENGINE_PLAN.md's Section 10.1 "scope creep" risk.
const COMMON_CAPITALIZED_WORDS = new Set([
  'i', 'you', 'he', 'she', 'they', 'we', 'it',
  'do', 'does', 'did', 'is', 'are', 'was', 'were', 'have', 'has', 'had',
  'what', 'who', 'when', 'where', 'why', 'how', 'which',
  'can', 'could', 'would', 'should', 'will',
  'tell', 'show', 'explain', 'describe', 'compare', 'give', 'walk',
  'sudhanshu', 'sriiverse',
]);

function normalize(text) {
  return String(text || '').slice(0, MAX_SCAN_LENGTH).toLowerCase();
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word-ish substring match, tolerant of symbols in aliases (e.g. "ci/cd", "node.js"). */
function containsAlias(normalizedText, alias) {
  const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias.toLowerCase())}([^a-z0-9]|$)`, 'i');
  return re.test(normalizedText);
}

/**
 * Find every SKILLS_TAXONOMY entry whose alias appears in `text`, returning
 * canonical names only. RELOCATED VERBATIM from jdmatch.js (identical
 * signature, identical behavior) — see docs/REASONING_ENGINE_SPEC.md
 * Section 8.1. Kept as a standalone implementation (not a thin wrapper
 * around resolveEntities()) so its output shape/semantics stay byte-
 * identical to what jdmatch.js and conversation.js's existing callers
 * already depend on: taxonomy matches only, no projects, no unrecognized-
 * technology guesses.
 */
export function matchTaxonomyEntities(text, { normalized = false } = {}) {
  const normalizedText = normalized ? text : normalize(text);
  const found = [];
  for (const entry of SKILLS_TAXONOMY) {
    const hit = entry.aliases.some((alias) => containsAlias(normalizedText, alias));
    if (hit) found.push(entry.canonical);
  }
  return found;
}

/** Every SKILLS_TAXONOMY canonical name actually present in STACK (i.e. owned). */
function ownedTechNames() {
  return new Set(getStack().map((s) => s.name));
}

/** Tech entities: SKILLS_TAXONOMY alias matches, classified owned vs. gap. */
function resolveTechEntities(normalizedText) {
  const owned = ownedTechNames();
  const found = [];
  for (const entry of SKILLS_TAXONOMY) {
    const aliasHit = entry.aliases.find((alias) => containsAlias(normalizedText, alias));
    if (!aliasHit) continue;
    found.push({
      type: 'tech',
      canonical: entry.canonical,
      surfaceForm: aliasHit,
      ownership: owned.has(entry.canonical) ? 'owned' : 'gap',
      confidence: 'high',
      source: 'taxonomy',
    });
  }
  return found;
}

/** Project entities: explicit id/name mentions. Every project is Sudhanshu's own work (always 'owned'). */
function resolveProjectEntities(normalizedText) {
  const found = [];
  for (const p of getAllProjects()) {
    if (normalizedText.includes(p.id) || normalizedText.includes(p.name.toLowerCase())) {
      found.push({
        type: 'project',
        canonical: p.id,
        surfaceForm: p.name,
        ownership: 'owned',
        confidence: 'high',
        source: 'project-list',
      });
    }
  }
  return found;
}

/**
 * Conservative heuristic for a plausible-but-untracked technology name
 * (e.g. "Go", "Rust", "Terraform") — a capitalized token in the ORIGINAL
 * (not lowercased) query that isn't a common question word and isn't
 * already matched by the taxonomy/project resolvers above. Deliberately
 * narrow: skips the sentence's first word (almost always a question word,
 * not a proper noun) and a short, explicit stopword list, per
 * docs/REASONING_ENGINE_SPEC.md Section 1 (Stage 3 failure modes).
 */
function resolveUnrecognizedTechMentions(rawQuery, alreadyFound) {
  // Dedupe against BOTH the canonical name and the matched surface form of
  // every entity already found (a project's canonical id, e.g. "queryforge",
  // does not always equal its display name, e.g. "QueryForgeAI" — checking
  // only `canonical` would miss that and wrongly double-report the name as
  // an "unrecognized" entity too).
  const alreadyMatchedWords = new Set();
  for (const e of alreadyFound) {
    alreadyMatchedWords.add(e.canonical.toLowerCase());
    alreadyMatchedWords.add(e.surfaceForm.toLowerCase());
  }
  const words = String(rawQuery || '').trim().split(/\s+/);
  const found = [];
  const seen = new Set();
  words.forEach((word, idx) => {
    if (idx === 0) return; // sentence-initial word — usually "Do"/"What"/"Does", not a proper noun
    const clean = word.replace(/[^A-Za-z0-9+.#]/g, '');
    if (clean.length < 2 || !/^[A-Z]/.test(clean)) return;
    const lower = clean.toLowerCase();
    if (COMMON_CAPITALIZED_WORDS.has(lower) || alreadyMatchedWords.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    found.push({
      type: 'tech',
      canonical: clean,
      surfaceForm: clean,
      ownership: 'unknown',
      confidence: 'medium',
      source: 'unrecognized',
    });
  });
  return found;
}

/** Highest-confidence entity when exactly one clearly dominates; null when tied or empty. */
function pickPrimary(entities) {
  if (entities.length === 0) return null;
  if (entities.length === 1) return entities[0];
  const rank = { high: 3, medium: 2, low: 1 };
  const sorted = [...entities].sort((a, b) => rank[b.confidence] - rank[a.confidence]);
  return rank[sorted[0].confidence] > rank[sorted[1].confidence] ? sorted[0] : null;
}

/**
 * Resolve every technology/project entity referenced in `query`, classified
 * by ownership (owned / gap / unknown) and match confidence.
 *
 * Returns an EntityResolutionSet (docs/REASONING_ENGINE_SPEC.md Section 3.2):
 *   { entities: ResolvedEntity[], primaryEntity: ResolvedEntity|null, multiEntity: boolean }
 *
 * `hint` is accepted for forward-compatibility with the full Question
 * Understanding stage (not yet implemented — see Section 9, Phase C) but is
 * currently unused; this resolver's behavior does not vary by questionType.
 */
export function resolveEntities(query, { hint } = {}) { // eslint-disable-line no-unused-vars
  const rawQuery = String(query || '');
  const normalizedText = normalize(rawQuery);

  const entities = [
    ...resolveTechEntities(normalizedText),
    ...resolveProjectEntities(normalizedText),
  ];
  entities.push(...resolveUnrecognizedTechMentions(rawQuery, entities));

  const primaryEntity = pickPrimary(entities);
  const multiEntity = entities.length >= 2 && !primaryEntity;

  return { entities, primaryEntity, multiEntity };
}

/* ============================================================
   CONFIDENCE (Stage 6 — docs/REASONING_ENGINE_SPEC.md Section 3.5/§1)
   ============================================================ */

// Stage 6's own failure-mode table (Section 1): "a lone low-absolute-score
// match is capped at 'medium' regardless of gap" — this is the floor a
// single retrieval candidate's score must clear to be trusted as 'high' on
// its own. Chosen from this codebase's own observed scoring range (the
// tag-overlap term alone contributes 3.0 per hit in knowledge.js's
// scoreDoc()) — comfortably above the unrelated `retrieve()`/
// `retrieveScoped()` floor of 0.5, so a doc that merely clears retrieval's
// own cutoff is not, by that fact alone, "strong."
const SCORE_FLOOR_STRONG = 2.0;

// "no competing doc within 20% score" — Stage 6's own worked example for a
// confident retrieval-score-gap decision when 2+ candidates exist.
const GAP_RATIO_STRONG = 0.2;

// "2+ evidence candidates score within 5% of each other" — Stage 6's own
// literal 'ambiguous'-tier trigger threshold.
const TIE_RATIO_AMBIGUOUS = 0.05;

/**
 * Stage 6 ("Confidence") — docs/REASONING_ENGINE_SPEC.md Section 3.5.
 *
 * Consumes ONLY an already-built `EvidenceSet` (Stage 5) and an already-
 * resolved `entities: ResolvedEntity[]` (Stage 3) — the exact two
 * parameters Section 4.1's Public API table specifies (`QuestionFrame`
 * itself is not a parameter here: Stage 5 has already folded
 * `questionType` into `evidence` via its affinity scoping, and each
 * entity's own `ownership`/`confidence` is already question-type-agnostic,
 * so nothing this function decides needs to re-read it — see this phase's
 * validation report for the explicit deviation-check on this point).
 *
 * Returns one `ConfidenceAssessment`: `{ tier, basis, reason }` — exactly
 * the three fields Section 3.5 defines, no more. (No numeric confidence
 * score, no `evidenceSufficiency` field, no `requiresClarification` field —
 * none of the three is defined anywhere in `docs/REASONING_ENGINE_SPEC.md`
 * or `docs/REASONING_ENGINE_PLAN.md`'s `ConfidenceAssessment`; see the
 * Phase 4 validation report's "Deviations" section for the explicit
 * mapping of each of those three requested concepts onto this exact,
 * already-specified 3-field shape instead of inventing new ones.)
 *
 * Priority-ordered, first-match-wins, mirroring this codebase's own
 * established classification convention (conversation.js's
 * classifyQuestionType(), Spec Section 3.1's construction rule):
 *   1. No evidence at all (no entities, no facts, no gap notes) → 'low'.
 *   2. A genuine multi-way tie (2+ comparably-salient entities AND 2+
 *      evidence candidates within 5% of each other) → 'ambiguous'.
 *   3. A single dominant entity resolution exists → 'high' (exact taxonomy/
 *      project match) or 'medium' (heuristic-only match), basis
 *      'entity-ownership' either way — Stage 6's own worked examples in
 *      both this spec and docs/REASONING_ENGINE_PLAN.md's Section 6.
 *   4. No entity signal at all — decide from `evidence.supportingDocs`'
 *      absolute top score and its gap over the runner-up, basis
 *      'retrieval-score-gap'.
 *
 * Pure function: no retrieval, no mutation of its arguments, no I/O.
 */
export function assessConfidence(evidence, entities = []) {
  const supportingDocs = evidence?.supportingDocs || [];
  const gapNotes = evidence?.gapNotes || [];
  const scoreGap = evidence?.scoreGap ?? null;

  // 1. No evidence at all — the exact case Stage 6's own example names as
  // needing an honest decline, never a guess. `supportingDocs` (not
  // `primaryFacts`) is the authoritative check: `buildEvidenceSet()` always
  // derives `primaryFacts` as `supportingDocs.slice(0, 2)`, so the two are
  // never out of sync for any real EvidenceSet.
  if (entities.length === 0 && supportingDocs.length === 0 && gapNotes.length === 0) {
    return {
      tier: 'low',
      basis: 'no-evidence',
      reason: 'No entities were resolved and no supporting documents or gap notes were found for this query.',
    };
  }

  // 2. Multi-way tie — "comparable salience" is exactly this file's own
  // `pickPrimary()` returning null (the same test `resolveEntities()`
  // already uses to set `multiEntity: true`), reused here rather than
  // re-implemented, so "salient enough to tie" means the same thing in
  // both places.
  if (entities.length >= 2 && !pickPrimary(entities) && supportingDocs.length >= 2) {
    const [top, runnerUp] = supportingDocs;
    const tieRatio = top.score > 0 ? Math.abs(top.score - runnerUp.score) / top.score : 0;
    if (tieRatio <= TIE_RATIO_AMBIGUOUS) {
      return {
        tier: 'ambiguous',
        basis: 'multi-way-tie',
        reason: `${entities.length} comparably-salient entities resolved with no dominant one, and the top two evidence candidates scored within ${(tieRatio * 100).toFixed(1)}% of each other — a genuine tie, not retrieval noise.`,
      };
    }
  }

  // 3. A single dominant entity resolution — the direct-hit case Stage 6's
  // examples center on. Its ownership state (owned/gap) is itself a
  // reliable structured fact whenever the match confidence is 'high' (an
  // exact SKILLS_TAXONOMY/project match); a 'medium'-confidence match (the
  // unrecognized-technology heuristic — "plausible-looking capitalized
  // word, no taxonomy record") is still an honest fact to report ("no
  // record of X exists"), but the underlying entity match is a guess, not
  // a verified hit, so it does not earn 'high'.
  const dominant = pickPrimary(entities);
  if (dominant) {
    return dominant.confidence === 'high'
      ? {
        tier: 'high',
        basis: 'entity-ownership',
        reason: `${dominant.canonical} resolved as a single, dominant, high-confidence match (ownership: ${dominant.ownership}) — a direct taxonomy/project hit, not a retrieval guess.`,
      }
      : {
        tier: 'medium',
        basis: 'entity-ownership',
        reason: `${dominant.canonical} resolved as the single dominant entity, but only via a ${dominant.confidence}-confidence heuristic match (ownership: ${dominant.ownership}), not an exact taxonomy/project entry.`,
      };
  }

  // 4. No entity signal at all — decide purely from the evidence set's own
  // retrieval scores.
  if (!supportingDocs.length) {
    return {
      tier: 'low',
      basis: 'no-evidence',
      reason: 'No named entity was resolved and no supporting document cleared the retrieval floor.',
    };
  }

  const top = supportingDocs[0];
  const strongTop = top.score >= SCORE_FLOOR_STRONG;

  if (supportingDocs.length === 1) {
    // Failure mode (Section 1, Stage 6): "a lone low-absolute-score match
    // is capped at 'medium' regardless of gap" — there is no runner-up to
    // compute a gap against at all (`scoreGap` is `null` for exactly this
    // case, per buildEvidenceSet()), so the absolute score alone decides.
    return strongTop
      ? {
        tier: 'high',
        basis: 'retrieval-score-gap',
        reason: `Single supporting document with a strong absolute score (${top.score.toFixed(2)}) and no competing candidate.`,
      }
      : {
        tier: 'medium',
        basis: 'retrieval-score-gap',
        reason: `Single supporting document with a thin absolute score (${top.score.toFixed(2)}) — capped at 'medium' regardless of the absent score gap, per Stage 6's own failure-mode mitigation.`,
      };
  }

  const gapRatio = scoreGap != null && top.score > 0 ? scoreGap / top.score : 0;
  if (strongTop && gapRatio >= GAP_RATIO_STRONG) {
    return {
      tier: 'high',
      basis: 'retrieval-score-gap',
      reason: `Top document (score ${top.score.toFixed(2)}) leads its runner-up by ${(gapRatio * 100).toFixed(0)}% — comfortably clear of any competing match.`,
    };
  }

  return {
    tier: 'medium',
    basis: 'retrieval-score-gap',
    reason: `Top document (score ${top.score.toFixed(2)}) does not clear a comfortable lead over its runner-up (gap ${(gapRatio * 100).toFixed(0)}%).`,
  };
}
