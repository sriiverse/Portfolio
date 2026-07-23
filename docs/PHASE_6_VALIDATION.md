# Phase 6 Validation — Response Composition

**Status:** Implementation complete. Awaiting review.
**Scope:** `docs/REASONING_ENGINE_SPEC.md` Stage 8 (Response Composition) only. Phases 1–5 (Mode Gate/Command Gate, Question Understanding, Entity Resolution, Evidence Selection, Confidence, Response Planning) are frozen and were **not modified**.

---

## 1. What was built

Response Composition is the renderer that sits between the frozen `ResponsePlan` (Phase 5 output) and the string the user sees. It consumes **only** `ctx.plan`, walks `plan.blocks` in the order the planner produced them, and turns each `ResponseBlock` into a markdown fragment. It performs no retrieval, no classification, no confidence assessment, and no reordering — every fact, ordering decision, and confidence-driven choice visible in the output was already made by Phases 3–5.

### 1.1 Integration point

`src/assistant/providers.js` — `LocalProvider.generate(query, ctx)` — is the only file changed.

```117:122:src/assistant/providers.js
    if (ctx.intent === 'jd-match') return this._jdMatchResponse(query);

    if (ctx.plan) {
      return this._renderPlan(ctx.plan, ctx);
    }
```

This is a pure **addition** ahead of the existing routing chain. `_jdMatchResponse` and Interview Mode remain first-checked and untouched, exactly as §8.3/§10 of the spec require (they sit outside the plan/block system entirely). When `ctx.plan` is absent (e.g. a caller that doesn't thread a plan), every pre-existing `_xResponse` method still runs exactly as before — this is the fallback path required by the migration contract, and it is dead code for every real call from `assistant.js` today (which always attaches `ctx.plan`), but it is kept rather than deleted, per "preserve all public APIs wherever possible."

### 1.2 New internal helpers (all non-exported, on `LocalProvider`)

| Helper | Responsibility |
|---|---|
| `_renderPlan(plan, ctx)` | Orchestrates the whole render: iterates blocks, dedupes identical fragments, joins inline fragments onto the previous paragraph with punctuation-aware separators, accumulates/dedupes sources, applies `kindOverride`/`payloadOverride`, returns `{text, sources, kind, payload}`. |
| `_renderBlock(block, ctx)` | Dispatch table from `block.type` → renderer, with a defensive fallback to `block.data.text` (or silent skip) if a renderer throws or the type is unrecognized. |
| `_renderDirectAnswer(block)` | Renders `data.text` verbatim; strips a stray "Yes —" prefix if `data.polarity` is negative (defensive guard against inconsistent plans). |
| `_renderEvidence(block)` | Renders `data.facts` as a bulleted list (`style:'list'`, default) or as an inline-joinable fragment (`style:'inline'`); maps each fact to a citation via `_factToSource`. |
| `_factToSource(fact)` | Maps an `EvidenceFact.docId` to `{source, link}` via `knowledge.js`'s doc registry, for `renderer.js`'s `renderCitations()`. |
| `_renderComparisonBlock(block)` | Renders the tech-pair branch of `Comparison` as a markdown table + bold "My take" line, sourced from `TECH_TAKES`. |
| `_renderStrengths(block)` | Bulleted `Strengths` list. Currently unreachable — `planning.js` never emits this block type. |
| `_renderGapDisclosure(block)` | Renders gap prose; suppressed by `_renderPlan`'s dedup if identical to a preceding `DirectAnswer`. |
| `_renderRecommendation(block)` | Sets `kindOverride`/`payloadOverride` for a project-card-shaped recommendation. Currently unreachable. |
| `_renderHonestDecline(block)` | Reason-coded decline prose (`no-data` / `ambiguous-subject` / `out-of-scope`), with redirect-aware phrasing. |
| `_renderSelfModel(block)` | Renders `SELF_MODEL`-backed prose about the assistant's own nature/memory/connectivity. |
| `_renderRecruiterFraming(block, ctx)` | Reuses existing `_recruiterRelevance`/`_recruiterFocusText` logic. Currently unreachable. |
| `_renderFollowupHint(block)` | No-op text renderer; forwards `block.data` onto `payload._followupHint` for a future `buildFollowups()` integration. |
| `_dedupeSources(list)` | Dedupes by `{source, link}`, caps at 4. |

Every pre-existing method (`_stackResponse`, `_projectResponse`, `_resumeResponse`, `_archResponse`, `_techComparisonResponse`, `_opinionResponse`, `_greetingResponse`, `_identityResponse`, `_pickVariant`, `_recruiterRelevance`, `_recruiterFocusText`, `_findTechTake`, `_techEvidenceSources`, etc.) is **unchanged, in place, byte-for-byte** — several of the new renderers explicitly reuse their logic (comparison table formatting, recruiter framing) rather than duplicating it.

---

## 2. Validation methodology

A disposable Node harness (`_validate_phase6.mjs`, deleted after this report was written) re-ran the same 30 benchmark questions used in `docs/PHASE_5_VALIDATION.md`, so this report can be read directly against that one's per-question plan. For each question it:

1. Ran the full frozen pipeline (Question Understanding → Entity Resolution → Evidence Selection → Confidence → Response Planning) to produce a real `ResponsePlan`.
2. Called `LocalProvider.generate(query, ctxWithoutPlan)` → **old** response (legacy routing, `ctx.plan` absent).
3. Called `LocalProvider.generate(query, ctxWithPlan)` → **new** response (Stage 8 renderer, `ctx.plan` present).
4. Diffed old vs. new text/kind/sources/payload.

Since `assistant.js` (Phase 5, frozen) already attaches `ctx.plan` unconditionally for every semantic query, comparison **(2) vs (3) is exactly the real before/after user experience** of shipping this phase — it is not a synthetic A/B, it's "what the app returned last week" vs. "what the app returns now."

**Result:** 30/30 questions changed (0 identical), 0 errors, 0 unrenderable blocks. Block-type coverage across the 30 plans: `DirectAnswer` 25, `Evidence` 13, `FollowupHint` 30, `GapDisclosure` 5, `Comparison` 3, `SelfModel` 2, `HonestDecline` 5 — all 7 block types Phase 5 actually emits were exercised at least twice; `Strengths`/`Recommendation`/`RecruiterFraming` were not exercised (consistent with Phase 5's own report, which already flagged these three as currently unreachable).

An automated formatting sweep over all 30 new outputs found: 0 double-blank-lines, 0 leading/trailing whitespace, 0 broken tables, 0 dangling separators (after the two fixes in §5 below).

---

## 3. Per-question results

Legend: **Verdict** — ✅ Improvement · ➖ Neutral/lateral (different, not better/worse) · ⚠️ Regression (see §5) · Kind old→new shows whether the response's `kind` tag changed (only `project-card`/`comparison` kinds trigger extra UI in `assistant.js`; all other kind labels are cosmetic no-ops).

| # | Question | Type | Blocks rendered | Old → New (summary) | Kind old→new | Verdict |
|---|---|---|---|---|---|---|
| 1 | Do you know Python? | SkillVerification | DirectAnswer, Evidence, FollowupHint | Full stack-card markdown → "Yes — Python is part of..." + full tech/QueryForgeAI evidence bullets | stack-card→text | ➖ |
| 2 | Does he know Docker? | SkillVerification | DirectAnswer, Evidence, FollowupHint | Same stack-card → "Yes — Docker is part of..." + tech evidence, inline-joined | stack-card→text | ➖ |
| 3 | Does he know Kubernetes? | SkillVerification | DirectAnswer, GapDisclosure, FollowupHint | Generic "didn't quite catch that" fallback → honest "Kubernetes is not part of Sudhanshu's shipped project history." | text→text | ✅ |
| 4 | Does he know AWS? | SkillVerification | DirectAnswer, GapDisclosure, FollowupHint | Same generic fallback → honest "AWS is not part of..." | text→text | ✅ |
| 5 | Does he know Rust? | SkillVerification | DirectAnswer, GapDisclosure, FollowupHint | Same generic fallback → honest "There's no record of Rust in..." | text→text | ✅ |
| 6 | Tell me about QueryForgeAI | ProjectExplanation | DirectAnswer, Evidence, FollowupHint | Rich tabbed project-card (headers, demo link, capabilities) → plain "Yes — QueryForgeAI is one of..." + evidence bullets | **project-card→text** | ⚠️ (see §5.1) |
| 7 | Tell me about the RepoRadarAI project | ProjectExplanation | DirectAnswer, Evidence, FollowupHint | Same rich project-card → plain evidence-bullet prose | **project-card→text** | ⚠️ (see §5.1) |
| 8 | What is his tech stack? | TechnologyExplanation | DirectAnswer, Evidence, FollowupHint | Stack-card markdown → "Based on what is documented:" + grouped tech list bullet | stack-card→text | ➖ |
| 9 | Explain the system architecture | ArchitectureExplanation | DirectAnswer, Evidence, FollowupHint | ASCII-diagram arch-card → prose description of the 5-layer topology + an unrelated Placement Pro+ decision bullet | arch-card→text | ⚠️ (minor, see §5.6) |
| 10 | What are his career goals? | Career | DirectAnswer, Evidence, FollowupHint | Single origin-story fact → same fact + a second "Language — Python" fact, framed | text→text | ✅ |
| 11 | What is he not good at? | Limitation | DirectAnswer, Evidence, FollowupHint | Unlabeled "why hire" blurb → same blurb, now explicitly framed as "Based on what is documented" + an AI-applied fact | text→text | ➖ (evidence itself is still not a real weakness — pre-existing Phase 5 gap, see §6) |
| 12 | What motivates you as an engineer? | Behavioral | DirectAnswer, Evidence, FollowupHint | Identity blurb only → same blurb + "why hire" fact for context | text→text | ✅ |
| 13 | Can you prove you know backend engineering? | EvidenceRequest | DirectAnswer, Evidence, FollowupHint | Rich QueryForgeAI project-card → "Based on what is documented:" + QueryForgeAI **and** RepoRadarAI engineering-decision bullets (broader evidence) | **project-card→text** | ⚠️➕ mixed (see §5.1) |
| 14 | What's his educational background? | Experience | DirectAnswer, Evidence, FollowupHint | Full resume-card markdown (contact info, stack, disclaimer about formal education) → dense prose walking the full career timeline | resume→text | ➖ (see §5.7) |
| 15 | If I'm hiring for an AI engineer role, should I consider Sudhanshu? | Recruiter | DirectAnswer, Evidence, FollowupHint | Rich "Why Hire" card (bulleted strengths, CTA) → single "Based on what is documented:" prose paragraph | text→text | ⚠️ (loses bulleted structure, see §5.4) |
| 16 | Compare Python and Kubernetes | Comparison | DirectAnswer, Evidence, FollowupHint | Explicit "I don't have a first-hand comparison for that pair yet" acknowledgment → generic Python-only evidence dump that never mentions Kubernetes was asked about | text→text | ⚠️ (see §5.2) |
| 17 | Compare React and Vue | Comparison | DirectAnswer, Comparison, FollowupHint | Table + "### My Take" header + "Where This Shows Up" bullets → "Comparing X and Y:" lead + same table + "**My take:**" bold line (no per-tech bullets; sources moved to citations) | text→text | ➖ (near-parity, see §5.3) |
| 18 | Compare Flask and FastAPI | Comparison | DirectAnswer, Comparison, FollowupHint | Same shape as #17 | text→text | ➖ |
| 19 | Compare PostgreSQL and MongoDB | Comparison | DirectAnswer, Comparison, FollowupHint | Same shape as #17, old also had a caveat blockquote about no project pinning a specific DB (dropped in new) | text→text | ➖ (minor caveat loss) |
| 20 | Hi there | Greeting | DirectAnswer, FollowupHint | Warm, emoji-touched, session-mode-aware variant → flat static "Hello! Ask me anything..." | text→text | ⚠️ (see §5.5) |
| 21 | Hello! | Greeting | DirectAnswer, FollowupHint | Different warm variant → same flat static string as #20 (loses variation) | text→text | ⚠️ (see §5.5) |
| 22 | Who are you? | Identity | DirectAnswer, SelfModel, FollowupHint | Rich capabilities/feature-list card → honest, direct first-person self-description ("retrieval-and-reasoning layer... not a general-purpose model") | text→text | ✅➖ mixed (more honest, less feature-discoverable — see §5.4) |
| 23 | Are you a real AI? | Unknown | DirectAnswer, GapDisclosure, FollowupHint | Topically-adjacent-but-not-actually-answering "AI is applied, not theoretical..." blurb → "There's no record of AI in Sudhanshu's documented skill set." | text→text | ➖ (new answer is honest but slightly odd literal-keyword framing — see §6) |
| 24 | Do you remember what I told you earlier? | Unknown | DirectAnswer, SelfModel, FollowupHint | Generic "didn't quite catch that" fallback → correct, direct answer about session-only memory | text→text | ✅ |
| 25 | Do you call an external API? | Unknown | DirectAnswer, GapDisclosure, FollowupHint | Topically-adjacent "Backend engineering is the core..." blurb (never actually answers) → "There's no record of API in..." (also doesn't really answer, but is at least honest about the gap) | text→text | ➖ (see §6) |
| 26 | Thanks, that makes sense | Unknown | HonestDecline, FollowupHint | Generic "didn't quite catch that" fallback → "I don't have that documented anywhere in this portfolio." | text→text | ➖ (both are non-answers to a non-question; new is slightly more honest in framing) |
| 27 | asdkjqwe zzz nonsense | Unknown | HonestDecline, FollowupHint | Same generic fallback → same honest "I don't have that documented..." | text→text | ✅ (correct behavior for gibberish input) |
| 28 | what does your manager think about this | Unknown | HonestDecline, FollowupHint | Unrelated "why hire" blurb (wrong answer to an ambiguous-subject question) → "I'm not sure who you mean. Could you clarify who or what you mean?" | text→text | ✅ (correctly recognizes ambiguity instead of guessing) |
| 29 | *(empty string)* | Unknown | HonestDecline, FollowupHint | Generic fallback → clarification request | text→text | ✅ |
| 30 | *(whitespace only)* | Unknown | HonestDecline, FollowupHint | Generic fallback → clarification request | text→text | ✅ |

**Tally:** 11 clear improvements, 6 clear/partial regressions, 13 neutral/lateral changes. 0 errors. 0 crashes. 0 malformed markdown.

---

## 4. Formatting quality

- **Bulleted-evidence style is now the dominant shape.** Per §7.2 of the spec, `Evidence` blocks render as "plain bulleted facts," not the old routing's headered/emoji-sectioned markdown pages. This is a deliberate, spec-mandated simplification — every individual block renders correctly per its own render-behavior definition — but it is a real, visible drop in visual richness for `SkillVerification`, `TechnologyExplanation`, `ArchitectureExplanation`, `Career`, `Limitation`, `Behavioral`, `EvidenceRequest`, `Experience`, and `Recruiter`-type questions (9 of the 30 question categories), all of which used to render as headered cards and now render as 1–3 plain sentences/bullets.
- **`Comparison` blocks are the closest to visual parity** with the old experience: markdown table preserved exactly, "My take" preserved as a bold-labeled line instead of a header, "Where This Shows Up" bullets replaced by equivalent info moved into the citation chips.
- **No structural markdown defects** were found in any of the 30 outputs: tables are well-formed, no broken bullets, no stray HTML, no double-blank-lines, no leading/trailing whitespace (confirmed via automated sweep).
- **Two formatting bugs were caught during review and fixed** before this report was finalized — see §5 below for detail:
  1. Inline-evidence joins could produce "period + em-dash" sequences (e.g. `stack. — Technologies`).
  2. `ambiguous-subject` declines with a redirect could double up the clarification ask.

---

## 5. Regressions and deviations (detailed)

### 5.1 Project-card / rich UI loss (most significant finding)

Questions #6, #7, #13 (`ProjectExplanation`/`EvidenceRequest` about a specific project) used to render with `kind: 'project-card'` and a `payload.project` object. `assistant.js`'s live rendering path special-cases exactly this kind:

```text
if (response.kind === 'project-card' && response.payload?.project) {
  // renders a tabbed card with Open Demo / GitHub / Architecture buttons + a command bar
}
```

Under the new plan-based path, `plan.kind` is **always `'text'`** — this is not a Stage 8 decision, it is Phase 5's own documented behavior (`docs/PHASE_5_VALIDATION.md` §5, "deviation #2": *"every plan this phase produces stays `kind: 'text'`"*). Response Composition's contract is to **preserve planner decisions**, not invent new ones — so Stage 8 correctly, faithfully renders `kind: 'text'` exactly as the frozen planner specified. The interactive tabbed-card UI is therefore lost for every project-specific question, for the first time made *visible*, now that Stage 8 actually renders what Phase 5 has been producing since it was approved.

This is flagged as the top remaining gap for a future phase (extending `planning.js` to set `plan.kind`/`plan.payload` for `ProjectExplanation` plans) — explicitly **not fixed here**, since `planning.js` is frozen and inferring a project-card payload inside `providers.js` from context (rather than from the plan) would mean Stage 8 "introducing new reasoning," which is expressly forbidden by this phase's scope.

The same root cause means a project-vs-project `Comparison` card (`kind: 'comparison'`, `payload.projectA/projectB`) is also structurally unreachable — but this was not exercised by any of the 30 benchmark questions (`planning.js`'s `Comparison` branch only ever builds tech-pair takes), so it is noted as a latent gap, not a benchmarked regression.

### 5.2 Ungroundable tech comparisons lose their explicit acknowledgment

"Compare Python and Kubernetes" (#16) used to get an explicit, honest "I don't have a first-hand comparison for that specific pair yet" framing. The new render falls through to a generic evidence dump about Python that never even mentions Kubernetes was part of the question. Root cause: `planning.js`'s `Comparison` branch, when `_findTechTake` returns nothing for the pair, silently degrades to the generic no-entity-fallback template rather than emitting an explicit "ungroundable pair" block. This was already Phase 5's own benchmark case #16 (marked "Pass" in that phase's report on the plan's *structure* alone) — the framing-quality cost of that decision is only visible now that Stage 8 actually renders it. Documented as a frozen Phase 5 gap, not fixed here.

### 5.3 Tech-comparison "Where This Shows Up" bullets move to citations

For #17–19, the old routing's per-technology "used in Project X" bullets are gone from the rendered prose. This is not a data loss — `_techEvidenceSources` still runs and the same facts now surface as clickable citation chips via `sources` — but it is a real shift in how that information is surfaced, worth naming even though it's not a strict regression.

### 5.4 Loss of bulleted/structured emphasis for Recruiter and Identity questions

#15 and #22 used to render as headered cards with bulleted strengths/capabilities lists — scannable at a glance. The new render is a single flowing paragraph. Content is preserved or, for #22, arguably *more honest* (the assistant now directly describes its own nature instead of listing marketing-style features) — but the loss of bulleted scannability is a real UX cost for exactly the two question types (Recruiter, Identity) where a hiring manager is most likely to skim.

### 5.5 Greeting responses lost variant rotation and personality

#20 and #21 used to produce two different warm, occasionally emoji-touched greetings via `_pickVariant`. Both now produce the identical flat string "Hello! Ask me anything about Sudhanshu's projects, skills, or experience." Root cause: `planning.js`'s `Greeting` branch (frozen, Phase 5) hardcodes one static string in `DirectAnswer.data.text` rather than delegating to variant-selection logic. Per the spec, `DirectAnswer.data.text` is "already fully composed by planning.js" — Stage 8's job is to render it verbatim. Reintroducing variety at the render layer would mean Stage 8 fabricating content the plan didn't provide, which is exactly the kind of "new reasoning" this phase's instructions forbid. Documented as a frozen Phase 5 gap, not fixed here.

### 5.6 Architecture question surfaces an unrelated project fact

#9's second evidence bullet ("Engineering decisions for Placement Pro+...") isn't actually about the five-layer architecture topic the question asked about — it's a generically-matched fact from evidence selection (Phase 3, frozen). This is pre-existing evidence-selection behavior made newly visible by composition, not a Stage 8 defect; noted for completeness.

### 5.7 Educational-background answer drops the "not part of this portfolio" disclaimer

#14's old resume-card had an explicit disclaimer: *"For anything not covered here (e.g. formal education or certifications), that information isn't part of this portfolio's knowledge base."* The new render is a denser career-timeline narrative that never states this caveat, even though the question specifically asked about "educational background" (which the portfolio doesn't actually track). This is a real, if minor, honesty-framing regression traced to `planning.js`'s `Experience` branch (frozen) not emitting a `GapDisclosure` alongside the `Evidence` block here. Documented, not fixed.

### 5.8 Two formatting bugs found and fixed during this phase (not deviations — implementation fixes)

1. **Inline-evidence punctuation.** `_renderPlan`'s inline-join logic originally always inserted `" — "` between the previous paragraph and an inline `Evidence` fragment, producing sequences like `stack. — Technologies:` when the previous paragraph already ended in sentence-final punctuation. Fixed by checking `/[.:!?]\s*$/` on the previous paragraph and using a plain space in that case.
2. **Redundant ambiguous-subject phrasing.** `_renderHonestDecline`'s default `ambiguous-subject` text ("I'm not sure who or what you mean by that.") was redundant when `block.data.redirect` already asked "Could you clarify who or what you mean?" (case #28). Fixed by using a shorter lead ("I'm not sure who you mean.") specifically when a redirect is present.

Both fixes are pure rendering-layer punctuation/phrasing corrections — no fact, ordering, or confidence-driven decision changed as a result.

---

## 6. Pre-existing (frozen-phase) gaps now visible for the first time

These are not Stage 8 defects — they are Phases 2–5 decisions that were already benchmarked and approved in prior validation reports, but whose real user-facing quality is only observable now that a plan actually gets rendered end-to-end:

- "Are you a real AI?" and "Do you call an external API?" (#23, #25) trigger `SkillVerification`-shaped evidence lookups on the literal keywords "AI" and "API" as if they were skill names, producing "There's no record of AI/API in Sudhanshu's documented skill set" — technically honest, but a slightly odd literal answer to what was really an identity/architecture question. Root cause is Phase 2's `QuestionType` classification (frozen).
- "What is he not good at?" (#11) still has no real self-assessed-weakness content to surface — `Evidence` correctly returns the closest generically-matched facts, now clearly framed as "Based on what is documented," but the underlying gap (no `Strengths`-with-limitations content authored anywhere) is Phase 5's, not Stage 8's.

---

## 7. Structural correctness

- **Contract preserved 30/30**: every response is exactly `{text, sources, kind, payload}`, matching what `assistant.js` expects.
- **Block ordering preserved 30/30**: rendered-fragment order always matches `plan.blocks` array order; no reordering was introduced anywhere in `_renderPlan`.
- **No block silently dropped**: every block in every plan was passed to `_renderBlock`; where a block's *text* was suppressed by fragment-deduplication (because `planning.js` had assigned it text identical to an earlier block — `DirectAnswer`/`SelfModel` pairs, `DirectAnswer`/`GapDisclosure` pairs), its `sources` were still merged in, so no citation was lost even when the sentence was.
- **`sources` deduped and capped at 4**, sourced only from block `data` (`EvidenceFact.docId` lookups, `TECH_TAKES` sources) — never hand-maintained or invented by the renderer.
- **`payload._followupHint`** is a new, additive, currently-inert field on the response payload (per §7.10's literal instruction) — confirmed nothing downstream reads it yet; `assistant.js`'s `buildFollowups()` is untouched this phase.
- **`kind`/`payload` overrides** (`_renderRecommendation`, `_renderRecruiterFraming`) are wired per the migration contract but structurally unreachable given Phase 5's current plan output — see §5.1.
- **`_jdMatchResponse()` and Interview Mode** remain entirely outside the plan/block system, confirmed still checked ahead of `ctx.plan`, exactly as §8.3/§10 specify.

---

## 8. Files changed

- `src/assistant/providers.js` — **restructured, not rewritten** (per §4.7's explicit directive). Added one new branch in `generate()` and 13 new internal helper methods (`_renderPlan`, `_renderBlock`, `_renderDirectAnswer`, `_renderEvidence`, `_factToSource`, `_renderComparisonBlock`, `_renderStrengths`, `_renderGapDisclosure`, `_renderRecommendation`, `_renderHonestDecline`, `_renderSelfModel`, `_renderRecruiterFraming`, `_renderFollowupHint`, `_dedupeSources`). Zero existing methods deleted or altered; all pre-existing `_xResponse` methods and their shared helpers (`_pickVariant`, `_recruiterRelevance`, `_recruiterFocusText`, `_findTechTake`, `_techEvidenceSources`) remain in place, both as the no-plan fallback path and as logic directly reused by the new renderers.

No other file was touched. `src/assistant.js`, `src/assistant/planning.js`, `src/assistant/persona.js`, `src/assistant/entities.js`, `src/assistant/knowledge.js`, `src/assistant/conversation.js`, and `src/assistant/memory.js` are all exactly as they were when Phase 5 was approved.

## 9. API preservation

- `LocalProvider.generate(query, ctx)` — same signature, same `{text, sources, kind, payload}` return shape. Fully backward compatible: a caller that never sets `ctx.plan` gets byte-identical behavior to pre-Phase-6.
- `getProvider()` / `getConfig()` — unchanged.
- **New API surface**: 13 new non-exported internal methods on `LocalProvider` (listed above). No new exported/module-level functions.

## 10. Deviations from specification

1. `Strengths`, `Recommendation`, and `RecruiterFraming` renderers are implemented per §4.7's full module contract (for dispatcher completeness and forward-compatibility) but are currently unreachable — `planning.js` (frozen, Phase 5) never emits these three block types. Matches Phase 5's own documented 7/10 block-type coverage.
2. `_renderComparisonBlock` only exercises the tech-pair branch; the project-vs-project card branch is written defensively but structurally unreachable until a future phase closes `planning.js`'s Comparison gap (see §5.1).
3. Two rendering-layer decisions go slightly beyond a literal verbatim passthrough of block `data`: (a) exact-duplicate-fragment suppression in `_renderPlan` (needed because `planning.js` intentionally assigns identical text to paired `DirectAnswer`/`SelfModel` or `DirectAnswer`/`GapDisclosure` blocks), and (b) the two formatting fixes in §5.8 (punctuation-aware inline join, redirect-aware decline phrasing). Both are pure prose/formatting decisions — no fact, ordering, or confidence outcome changes as a result — called out here in the same spirit as Phase 5's own report flagged its two composed-text deviations.
4. `FollowupHint`'s dispatcher entry populates `payload._followupHint` per §7.10, but `assistant.js`'s `buildFollowups()` is not modified to consume it — wiring a downstream consumer is a separate integration step, out of this phase's scope.

## 11. Remaining gaps (not fixed, flagged for a future phase)

1. **Project-card / comparison-card payload loss** (§5.1) — needs `planning.js` to set `plan.kind`/`plan.payload` for `ProjectExplanation` and project-`Comparison` plans. Highest-impact remaining gap.
2. **Ungroundable tech-pair comparisons** silently degrade to a generic fallback instead of an explicit acknowledgment (§5.2) — needs a `planning.js` change.
3. **Greeting flatness** — lost phrase-variant rotation (§5.5) — needs a `planning.js` change (either variant selection there, or a variants array in `DirectAnswer.data` for Stage 8 to pick from).
4. **Educational-background disclaimer loss** (§5.7) — needs `planning.js`'s `Experience` branch to pair a `GapDisclosure` with the `Evidence` block for this specific question shape.
5. Phase 2's literal-keyword `SkillVerification` misfires on "AI"/"API" (§6) and Phase 5's absent weakness content (§6) — both frozen, unchanged, carried forward from prior reports.

---

**This concludes Phase 6 (Response Composition). Stopping here per instructions, awaiting review before any further phase or fix.**
