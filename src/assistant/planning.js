/**
 * planning.js — Response Planning for SRIIVERSE AI.
 *
 * Implements Stage 7 ("Response Planning") of docs/REASONING_ENGINE_SPEC.md
 * (§3.6/§4.2/§7). This is Phase 5 of the approved reasoning-engine
 * migration. Scope of THIS phase, exactly as authorized:
 *   - Build ResponsePlan/ResponseBlock (§3.6) — data, not markdown.
 *   - Decide answer strategy, block ordering, whether clarification is
 *     needed, evidence usage, and follow-up intent.
 *
 * `buildResponsePlan()` consumes ONLY `questionFrame` (§3.1), `entities`
 * (§3.2, the `EntityResolutionSet`), `evidence` (§3.4), and `confidence`
 * (§3.5) — the four reasoning-stage outputs, and nothing else. It does NOT
 * take `discourse` or the surrounding `ctx` object (`visitorProfile`,
 * `memory`, `focusProject`, `awarenessContext`) even though §4.2's fuller
 * module contract lists those too — this phase's own instructions are an
 * explicit, narrower whitelist than the full spec text, so blocks whose
 * spec-defined trigger condition needs one of those excluded signals
 * (`RecruiterFraming`'s `ctx.visitorProfile.type === 'recruiter'` gate,
 * `FollowupHint`'s `'pending-result'`/`'continuation'` rationales, which
 * need `discourse`) are not selectable in this phase — see
 * docs/PHASE_5_VALIDATION.md §5 for the full, explicit deviation list.
 *
 * This is a PURE PLANNING STAGE. It must never, and does not:
 *   - perform retrieval (no `knowledge.js` import at all — every fact it
 *     cites comes from the already-built `evidence` object it was handed);
 *   - modify `evidence` or `entities` (both are only ever read, never
 *     mutated or re-derived);
 *   - recalculate confidence (`confidence.tier`/`basis` are read as given,
 *     `assessConfidence()` is never called from here);
 *   - generate the final rendered response. What this file DOES compose is
 *     short, structurally-templated sentence fragments for a handful of
 *     block types (`DirectAnswer.data.text`, `GapDisclosure.data.items`,
 *     etc.) — exactly what §7.1's own text requires ("the answer prose,
 *     already fully composed by planning.js") and exactly what "produce
 *     only the structured ResponsePlan defined in the specification"
 *     requires, since those fields are themselves part of that structure.
 *     What it never produces is the final assembled `{text, sources, kind,
 *     payload}` response contract, or any markdown formatting, phrase-
 *     variant rotation, or citation-list assembly — that remains Stage 8's
 *     job, entirely inside `providers.js`, untouched and not yet wired to
 *     consume this plan at all (per this phase's explicit instruction).
 *   - make retrieval-shaped decisions beyond selecting FROM the evidence
 *     it was already given (no new candidate scoring, no new doc lookups).
 *
 * Dependencies: `persona.js` only (`TECH_TAKES` for grounded tech-pair
 * comparison content, `SELF_MODEL` for assistant-self-description content)
 * — both pure, static, already-authored data, imported the same way
 * `entities.js` imports `content.js`'s `SKILLS_TAXONOMY`. Per §4.2's module
 * contract, this file deliberately does NOT import `knowledge.js`,
 * `entities.js`, or `memory.js` — every fact it needs arrives as a
 * parameter. This is also why no `ResponseBlock` in this phase sets
 * `plan.kind` to a rich-card value (`'project-card'`, `'comparison'`,
 * etc.): building that payload (e.g. a full `{project}` object for
 * `renderTabbedProjectCard()`) needs `knowledge.js`'s `getProject()`, which
 * this module is not permitted to call — deferred, see
 * docs/PHASE_5_VALIDATION.md §5.
 *
 * Pure and offline: no DOM, no `sessionStorage`, no provider calls, no
 * mutation of its arguments.
 */
import { TECH_TAKES, SELF_MODEL } from './persona.js';

/* ============================================================
   BLOCK-SELECTION HELPERS (not exported)
   ============================================================ */

// Stage 7's own failure-mode table (§1): "Plans are capped at 4 blocks for
// a single-topic question... a 5th block requires a Comparison- or multi-
// entity-shaped question." No branch below currently produces more than 3
// blocks, so this cap is a defensive invariant, not something any current
// input can actually trigger — see docs/PHASE_5_VALIDATION.md for the
// explicit note on this.
const BLOCK_CAP_SINGLE = 4;
const BLOCK_CAP_MULTI = 5;

function enforceBlockCap(blocks, isMultiTopic) {
  const cap = isMultiTopic ? BLOCK_CAP_MULTI : BLOCK_CAP_SINGLE;
  return blocks.length > cap ? blocks.slice(0, cap) : blocks;
}

function directAnswer(text, polarity) {
  return { type: 'DirectAnswer', data: { text, polarity } };
}

function evidenceBlock(facts) {
  return { type: 'Evidence', data: { facts, style: facts.length > 1 ? 'bulleted' : 'inline' } };
}

function gapDisclosureBlock(items) {
  return { type: 'GapDisclosure', data: { items: items.slice(0, 3), reframe: null } };
}

function honestDeclineBlock(reason, redirect = null) {
  return { type: 'HonestDecline', data: { reason, redirect } };
}

function selfModelBlock(aspect) {
  return { type: 'SelfModel', data: { aspect, text: SELF_MODEL[aspect] } };
}

/**
 * FollowupHint's `rationale` enum (§3.7) includes `'pending-result'` and
 * `'continuation'`, both of which need `DiscourseState` — excluded from
 * this phase's inputs (see file header). Only `'question-type'` (the
 * direct replacement for today's `strategy.move`-keyed follow-up branch)
 * and `'default'` are reachable here.
 */
function followupHintBlock(questionFrame, entities) {
  const rationale = questionFrame.questionType && questionFrame.questionType !== 'Unknown' ? 'question-type' : 'default';
  const suggestedTopics = (entities.entities || []).map((e) => e.canonical.toLowerCase()).slice(0, 3);
  return { type: 'FollowupHint', data: { rationale, suggestedTopics } };
}

// Words that signal the question is about the assistant's memory/session
// scope specifically, vs. its general nature, vs. its connectivity/
// architecture — used only to pick which already-authored `SELF_MODEL`
// aspect answers a `subject: 'assistant'` question most directly.
const MEMORY_ASPECT_RE = /\b(remember|memory|forget|recall|session)\b/i;
const CONNECTIVITY_ASPECT_RE = /\b(api|internet|online|connect|network|external|call\s+(out|another)|gpt|openai|cloud|hosted)\b/i;

function detectSelfModelAspect(rawQuery) {
  const q = String(rawQuery || '');
  if (MEMORY_ASPECT_RE.test(q)) return 'memory';
  if (CONNECTIVITY_ASPECT_RE.test(q)) return 'connectivity';
  return 'nature';
}

/** First `TECH_TAKES` entry whose full `techs` pair/triple is present among the resolved entities' canonical names — grounded content only, never a fabricated comparison for an untracked pair. */
function findTechTake(resolvedEntities) {
  const canonicals = resolvedEntities.map((e) => e.canonical);
  return TECH_TAKES.find((tt) => tt.techs.every((t) => canonicals.includes(t))) || null;
}

/** Maps a `TECH_TAKES` entry's existing `{name, a, b}` dimension rows onto §7.3's `{label, values}` shape — a relocation of already-authored content, not new prose. */
function buildComparisonBlock(techTake) {
  const [a, b] = techTake.techs;
  const dimensions = techTake.dimensions.map((d) => ({ label: d.name, values: [`${a}: ${d.a}`, `${b}: ${d.b}`] }));
  // A Comparison question inherently invites a stance (that is what "which
  // would you use" / "compare X and Y" is asking for) — §7.3's "only when
  // the question's polarity/questionType warrants a stance" is read here as
  // "the Comparison questionType itself always warrants one," matching
  // today's existing `_techComparisonResponse` behavior, which always
  // surfaces `TECH_TAKES[].preference`.
  return { type: 'Comparison', data: { entities: [a, b], dimensions, verdict: techTake.preference } };
}

/* ============================================================
   RESPONSE PLANNING (Stage 7 — docs/REASONING_ENGINE_SPEC.md §3.6/§4.2)
   ============================================================ */

/**
 * Stage 7 ("Response Planning") — docs/REASONING_ENGINE_SPEC.md §3.6.
 *
 * `buildResponsePlan(questionFrame, entities, evidence, confidence)` →
 * `ResponsePlan`: `{ blocks: ResponseBlock[], kind, payload, sourcesOverride }`.
 *
 * Priority-ordered, first-match-wins (mirrors this codebase's own
 * established convention — `conversation.js`'s `classifyQuestionType()`,
 * `entities.js`'s `assessConfidence()`):
 *
 *   1. `subject: 'ambiguous'` (no resolvable antecedent) → `HonestDecline`
 *      shaped as a clarifying question (`reason: 'ambiguous-subject'`) —
 *      this is what "decide whether clarification is needed" means for a
 *      Stage-2-level ambiguity Response Planning is the first stage able
 *      to act on.
 *   2. `subject: 'assistant'` (a question about the assistant itself, not
 *      Sudhanshu) → `SelfModel` + `DirectAnswer`, using `persona.js`'s
 *      `SELF_MODEL` content — no evidence needed or fetched. Checked
 *      BEFORE the confidence-tier branch below on purpose: a self-
 *      referential question ("who are you?") legitimately retrieves zero
 *      portfolio evidence (there is nothing about the assistant itself in
 *      `knowledge.js`'s docs), so Stage 6 correctly reports `tier: 'low'`
 *      for it — that is expected and irrelevant here, not a reason to
 *      decline. An earlier version of this function checked confidence
 *      first and this exact case regressed to `HonestDecline`; caught and
 *      fixed by direct test (see docs/PHASE_5_VALIDATION.md §3).
 *   3. `questionType: 'Greeting'` → a single, generic, non-factual
 *      `DirectAnswer`. Greetings carry no claim about Sudhanshu and
 *      legitimately retrieve zero evidence, so they are checked BEFORE the
 *      confidence-tier branch — otherwise Stage 6's `tier: 'low'` would
 *      incorrectly suppress them into `HonestDecline` (Q3–Q5 regression
 *      in docs/FINAL_BENCHMARK.md).
 *   4. `confidence.tier: 'low'` (always `basis: 'no-evidence'` per Stage
 *      6's own implementation — see `entities.js`'s `assessConfidence()`)
 *      → `HonestDecline(reason: 'no-data')`. Never paired with `Evidence`/
 *      `GapDisclosure`, per §7.7's own rule.
 *   5. `questionType: 'Conversation'` → a single, generic, non-factual
 *      `DirectAnswer` acknowledgment.
 *   6. A genuine multi-entity tie (`entities.multiEntity`) or an explicit
 *      `Comparison` questionType, when a grounded `TECH_TAKES` pair
 *      exists for the resolved entities → `DirectAnswer` + `Comparison`.
 *      No grounded pair found → falls through to 7/8 rather than
 *      fabricating comparison content for an untracked pair.
 *   7. A single dominant entity (`entities.primaryEntity`) → ownership-
 *      driven: `owned` → `DirectAnswer(affirmative)` + `Evidence`;
 *      `gap`/`unknown` → `DirectAnswer(negative)` + `GapDisclosure`.
 *   8. No dominant entity — generic, evidence-grounded: supporting docs
 *      exist → `DirectAnswer(neutral)` + `Evidence`; only gap notes exist
 *      (no docs) → `DirectAnswer(negative)` + `GapDisclosure`; neither →
 *      `HonestDecline(reason: 'no-data')` (a defensive fallback — Stage 6
 *      would already have set `tier: 'low'` for this exact case, so step 4
 *      normally intercepts it first).
 *
 * Every branch appends one `FollowupHint` block last (per §7.10, it
 * renders nothing inline — `assistant.js`'s `buildFollowups()` is the
 * reader). `plan.kind` is always `'text'` and `plan.payload`/
 * `sourcesOverride` are always `null` in this phase — no branch below
 * builds a rich-card payload (`'project-card'`, `'comparison'`, etc.),
 * since doing so needs `knowledge.js`'s `getProject()`, which this module
 * does not import (see file header). Deferred, not silently dropped — see
 * docs/PHASE_5_VALIDATION.md §5.
 */
export function buildResponsePlan(questionFrame, entities, evidence, confidence) {
  const resolved = entities?.entities || [];
  const primary = entities?.primaryEntity || null;
  const gapNotes = evidence?.gapNotes || [];
  const supportingDocs = evidence?.supportingDocs || [];
  const primaryFacts = evidence?.primaryFacts || [];
  const isMultiTopic = !!entities?.multiEntity || questionFrame?.questionType === 'Comparison';

  const finish = (blocks) => ({
    blocks: enforceBlockCap(blocks, isMultiTopic),
    kind: 'text',
    payload: null,
    sourcesOverride: null,
  });

  // 1. Ambiguous subject — no antecedent to answer about at all.
  if (questionFrame?.subject === 'ambiguous') {
    return finish([
      honestDeclineBlock('ambiguous-subject', 'Could you clarify who or what you mean?'),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 2. A question about the assistant itself — checked before the
  // confidence-tier branch below (see the doc comment above for why).
  if (questionFrame?.subject === 'assistant') {
    const aspect = detectSelfModelAspect(questionFrame.rawQuery);
    return finish([
      directAnswer(SELF_MODEL[aspect], 'neutral'),
      selfModelBlock(aspect),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 3. Greeting — no factual claim, no evidence needed. Checked BEFORE the
  // low-confidence HonestDecline branch: a greeting legitimately retrieves
  // zero portfolio docs, so Stage 6 correctly reports tier:'low' for it —
  // that must not suppress the warm greeting response.
  if (questionFrame?.questionType === 'Greeting') {
    return finish([
      directAnswer("Hello! Ask me anything about Sudhanshu's projects, skills, or experience.", 'neutral'),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 3. Conversational intent gate (V4.5 Mod 1) — soft/opinion/challenge/probe
  // modes must not fall into entity gap/affirmative or confidence-low decline.
  // Reasoning synthesis owns the spoken answer for these modes.
  if (questionFrame?.conversationMode) {
    return finish([
      directAnswer('', 'neutral'),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 4. No evidence at all (Stage 6's own honest-decline case).
  if (confidence?.tier === 'low') {
    return finish([
      honestDeclineBlock('no-data'),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 5. Pure chit-chat acknowledgment — no factual claim (Conversation only;
  // Greeting is handled above the confidence gate).
  if (questionFrame?.questionType === 'Conversation') {
    return finish([
      directAnswer('Got it — let me know if there is anything specific about the projects, stack, or experience you would like to dig into.', 'neutral'),
      followupHintBlock(questionFrame, entities),
    ]);
  }

  // 6. Multi-entity tie / explicit Comparison — only with grounded content.
  if (isMultiTopic) {
    const techTake = findTechTake(resolved);
    if (techTake) {
      return finish([
        directAnswer(`Comparing ${techTake.techs[0]} and ${techTake.techs[1]}:`, 'neutral'),
        buildComparisonBlock(techTake),
        followupHintBlock(questionFrame, entities),
      ]);
    }
    // No grounded pair for this specific combination — fall through to the
    // single-entity/generic branches below rather than fabricate one.
  }

  // 7. A single dominant entity — ownership decides polarity/block choice.
  // V4.5 Mod 3: gap/unknown → GapDisclosure once (no duplicate DirectAnswer).
  if (primary) {
    if (primary.type === 'tech' && (primary.ownership === 'gap' || primary.ownership === 'unknown')) {
      const note = gapNotes[0] || `There's no record of ${primary.canonical} in Sudhanshu's documented skill set.`;
      return finish([
        gapDisclosureBlock(gapNotes.length ? gapNotes : [note]),
        followupHintBlock(questionFrame, entities),
      ]);
    }
    const label = primary.type === 'project' ? (primary.surfaceForm || primary.canonical) : primary.canonical;
    // V4.5 Mod 5 — "Yes — shipped…" only for ownership yes/no checks
    const ownershipYesNo = questionFrame?.questionType === 'SkillVerification'
      || /^(do you|does he|are you|is he|have you|has he|can you|can he)\b/i.test(String(questionFrame?.rawQuery || '').trim());
    const text = ownershipYesNo
      ? (primary.type === 'project'
        ? `Yes — ${label} is one of Sudhanshu's shipped projects.`
        : `Yes — ${label} is part of Sudhanshu's shipped stack.`)
      : (primary.type === 'project'
        ? `${label} is one of the shipped projects.`
        : `${label} shows up in the shipped stack.`);
    const blocks = [directAnswer(text, ownershipYesNo ? 'affirmative' : 'neutral')];
    if (primaryFacts.length) blocks.push(evidenceBlock(primaryFacts));
    blocks.push(followupHintBlock(questionFrame, entities));
    return finish(blocks);
  }

  // 8. No dominant entity — generic, evidence-grounded fallback.
  if (supportingDocs.length) {
    return finish([
      directAnswer('Based on what is documented:', 'neutral'),
      evidenceBlock(primaryFacts.length ? primaryFacts : [{ text: supportingDocs[0].doc.text, docId: supportingDocs[0].doc.id, link: supportingDocs[0].doc.link || null }]),
      followupHintBlock(questionFrame, entities),
    ]);
  }
  if (gapNotes.length) {
    return finish([
      gapDisclosureBlock(gapNotes),
      followupHintBlock(questionFrame, entities),
    ]);
  }
  // Defensive fallback only — Stage 6 sets tier:'low' for exactly this
  // case, so step 2 above should always intercept it first.
  return finish([
    honestDeclineBlock('no-data'),
    followupHintBlock(questionFrame, entities),
  ]);
}
