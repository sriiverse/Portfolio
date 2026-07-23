# PHASE_5_VALIDATION.md

> Project: **SRIIVERSEAI**
>
> Validates: Phase 5 of `docs/REASONING_ENGINE_SPEC.md` (Stage 7 — **Response Planning**), as implemented in the new `src/assistant/planning.js` (`buildResponsePlan()`), a small additive extension to `src/assistant/persona.js` (`SELF_MODEL`, needed content for the new `SelfModel` block), and `src/assistant.js` (orchestrates the new Stage 7 call and threads its output onto `ctx`).
>
> Scope of this report: **Response Planning only** — `buildResponsePlan(questionFrame, entities, evidence, confidence)`'s block-selection/ordering decisions and its live wiring into `assistant.js`'s request path. Stage 8 (Response Composition) is explicitly out of scope — `providers.js` was not modified, does not read `ctx.plan`, and this report makes no claim about rendered response text changing for anyone. Phases 1–4 are frozen; nothing in `conversation.js`'s `buildQuestionFrame()`, `entities.js`'s `resolveEntities()`/`assessConfidence()`, or `knowledge.js`'s `retrieveScoped()`/`buildEvidenceSet()` was modified to produce this report or during implementation.
>
> **No code was modified to produce this report**, except one self-caught, self-fixed bug in the new code itself (§3 — a priority-ordering defect in `buildResponsePlan()`, found by direct test before this report was written, not a change made *for* the report). Every result below was captured by calling the live, already-committed Phase 5 code directly (`buildResponsePlan()` against real pipeline-produced `QuestionFrame`/`EntityResolutionSet`/`EvidenceSet`/`ConfidenceAssessment` objects, plus `LocalProvider.generate()` with/without `ctx.plan`), in a disposable Node harness (`_validate_phase5.mjs`) deleted immediately after use.

---

## 1. Methodology

Response Planning, like Confidence before it, has **zero consumers this phase** — `providers.js` is untouched, per the explicit instruction "Do not allow LocalProvider to consume it yet." So exactly as Phase 4's report did for `confidence`, "previous behaviour" and "current behaviour" for the **rendered response** are identical for every question — verified directly in §4, not assumed. The actual "changed result" is: **a structured `ResponsePlan` now exists at all**, decided correctly from the four Stage 3/5/6/2 outputs, ready for Stage 8 to eventually consume.

This report validates three things:

1. **§2 — Plan-selection correctness.** For every tested question: the QuestionFrame/entity/confidence signals that fed the decision, the resulting block sequence, and whether it matches Stage 7's own worked examples and the block-selection rules this phase's own priority chain implements.
2. **§3 — A defect actually caught by this validation process.** An ordering bug where self-referential questions ("Who are you?") were intercepted by the `confidence.tier === 'low'` branch before the `subject: 'assistant'` branch ever ran (since a self-referential question legitimately retrieves zero portfolio evidence, which is expected, not a reason to decline). Found, fixed, and re-verified before this report was finalized — documented in full because the instructions ask for exactly this kind of before/after transparency.
3. **§4 — Zero behavioral change end-to-end.** `LocalProvider.generate()` called twice per question — with and without `ctx.plan` present, independently-constructed `ctx` objects — byte-for-byte compared.

### 1.1 Question selection

30 questions were run, chosen to exercise every reachable branch of `buildResponsePlan()`'s priority chain at least once: owned/gap/unknown `SkillVerification` entities, `ProjectExplanation` with a resolved project entity, no-entity generic questions across 8 different `questionType`s (`TechnologyExplanation`, `ArchitectureExplanation`, `Career`, `Limitation`, `Behavioral`, `EvidenceRequest`, `Experience`, `Recruiter`), `Comparison` questions both with and without a grounded `TECH_TAKES` pair, `Greeting`/`Conversation` chit-chat, four `subject: 'assistant'` self-referential phrasings, an `subject: 'ambiguous'` phrasing, and three no-signal edge cases (nonsense text, empty string, whitespace-only). These are, by construction, "the benchmark questions affected by Planning" — since `buildResponsePlan()` runs unconditionally for every query in `ask()` (no gating condition), every question is technically affected in the sense that a plan is now built for it; the 30 selected collectively exercise all 7 branches of the priority chain and 7 of the 8 block types this phase implements at least once.

---

## 2. Plan-selection correctness

Because there is no downstream consumer yet, **"Previous planning behaviour" is "none — no `ResponsePlan` existed before this phase" for every row**, and **"Current planning behaviour" (the actual rendered response) is byte-identical to before this phase for every row** — confirmed in §4. The column that changes is **the plan itself**.

| # | Question | `questionType` / `subject` | Confidence | Plan blocks | Expected plan (per Stage 7 rules) | Pass/Fail |
|---|---|---|---|---|---|---|
| 1 | "Do you know Python?" | SkillVerification / sudhanshu | high | `[DirectAnswer(affirmative), Evidence(inline? no—2 facts→bulleted), FollowupHint]` | Owned entity → affirmative answer + citing evidence — matches §Stage 7's own general shape (contrast with Example 1's negative case) | **Pass** |
| 2 | "Does he know Docker?" | SkillVerification / sudhanshu | high | `[DirectAnswer(affirmative), Evidence(1 fact, inline), FollowupHint]` | Same as #1, single-fact case → `style: 'inline'` per §7.2 | **Pass** |
| 3 | "Does he know Kubernetes?" | SkillVerification / sudhanshu | high | `[DirectAnswer(negative), GapDisclosure(items:[gap note]), FollowupHint]` | **Exact match to Stage 7's own §Example 1**: `{questionType:'SkillVerification', subject:'sudhanshu'}`, entity `{ownership:'gap', confidence:'high'}` → `[DirectAnswer(negative), GapDisclosure]` | **Pass — verbatim spec example reproduced** |
| 4 | "Does he know AWS?" | SkillVerification / sudhanshu | high | `[DirectAnswer(negative), GapDisclosure, FollowupHint]` | Same as #3 | **Pass** |
| 5 | "Does he know Rust?" | SkillVerification / sudhanshu | medium | `[DirectAnswer(negative), GapDisclosure, FollowupHint]` | Heuristic-only `'unknown'` entity — same block shape as a `'gap'` entity (both are "honest absence," per §7.5's own unification rule), only `confidence`'s tier/reason differ upstream | **Pass** |
| 6 | "Tell me about QueryForgeAI" | ProjectExplanation / sudhanshu | high | `[DirectAnswer(affirmative), Evidence(2 facts, bulleted), FollowupHint]` | Project entity, always owned → affirmative + evidence | **Pass** |
| 7 | "Tell me about the RepoRadarAI project" | ProjectExplanation / sudhanshu | high | `[DirectAnswer(affirmative), Evidence(2 facts, bulleted), FollowupHint]` | Same as #6 | **Pass** |
| 8 | "What is his tech stack?" | TechnologyExplanation / sudhanshu | high | `[DirectAnswer(neutral, generic lead), Evidence(2 facts, bulleted), FollowupHint]` | No dominant entity → generic evidence-grounded plan | **Pass** |
| 9 | "Explain the system architecture" | ArchitectureExplanation / sudhanshu | high | `[DirectAnswer(neutral), Evidence, FollowupHint]` | Same shape as #8 | **Pass** |
| 10 | "What are his career goals?" | Career / sudhanshu | medium | `[DirectAnswer(neutral), Evidence, FollowupHint]` | No entity, `tier:'medium'` (not `'low'`) → still answers with evidence, correctly not a decline | **Pass** |
| 11 | "What is he not good at?" | Limitation / sudhanshu | medium | `[DirectAnswer(neutral), Evidence, FollowupHint]` | Same shape; see §6 for the honest limitation this phase has here (no dedicated `Strengths`/self-assessed-weakness content source exists yet) | **Pass (with a documented content gap, not a plan-logic defect)** |
| 12 | "What motivates you as an engineer?" | Behavioral / sudhanshu | high | `[DirectAnswer(neutral), Evidence, FollowupHint]` | Same shape | **Pass** |
| 13 | "Can you prove you know backend engineering?" | EvidenceRequest / sudhanshu | medium | `[DirectAnswer(neutral), Evidence, FollowupHint]` | Same shape | **Pass** |
| 14 | "What's his educational background?" | Experience / sudhanshu | high | `[DirectAnswer(neutral), Evidence, FollowupHint]` | Same shape | **Pass** |
| 15 | "If I'm hiring for an AI engineer role, should I consider Sudhanshu?" | Recruiter / sudhanshu | high | `[DirectAnswer(neutral), Evidence, FollowupHint]` | No `RecruiterFraming` block (needs `ctx.visitorProfile`, outside this phase's permitted inputs — §5.2) → correctly degrades to the generic evidence-grounded plan rather than fabricating recruiter framing | **Pass (documented, intentional scope boundary)** |
| 16 | "Compare Python and Kubernetes" | Comparison / sudhanshu | high | `[DirectAnswer(neutral), Evidence, FollowupHint]` | No `TECH_TAKES` entry for this pair → correctly falls through to the generic evidence-grounded plan rather than fabricating comparison dimensions | **Pass** |
| 17 | "Compare React and Vue" | Comparison / sudhanshu | **ambiguous** | `[DirectAnswer(neutral, "Comparing React and Vue:"), Comparison(5 dimensions, verdict), FollowupHint]` | Grounded `TECH_TAKES` pair found → real `Comparison` block, using already-authored `dimensions`/`preference` content, not new prose | **Pass — the multi-way-tie `confidence.tier` is correctly irrelevant to plan quality here: Comparison's own dedicated block type is precisely the mechanism for "don't know which one wins," not a reason to decline** |
| 18 | "Compare Flask and FastAPI" | Comparison / sudhanshu | high | `[DirectAnswer, Comparison(5 dims, verdict), FollowupHint]` | Same as #17 | **Pass** |
| 19 | "Compare PostgreSQL and MongoDB" | Comparison / sudhanshu | high | `[DirectAnswer, Comparison(5 dims, verdict), FollowupHint]` | Same as #17 | **Pass** |
| 20 | "Hi there" | Greeting / sudhanshu | medium | `[DirectAnswer(neutral, generic greeting), FollowupHint]` | Greeting needs no evidence at all — 2-block plan, no `Evidence`/`GapDisclosure` | **Pass** |
| 21 | "Hello!" | Greeting / sudhanshu | high | `[DirectAnswer, FollowupHint]` | Same as #20 | **Pass** |
| 22 | "Who are you?" | Identity / **assistant** | low | `[DirectAnswer(neutral, SELF_MODEL.nature), SelfModel(aspect:'nature'), FollowupHint]` | Self-referential question → `SelfModel` block, **not** a decline, even though `confidence.tier` is `'low'` (see §3 — this is exactly the bug this validation caught and fixed) | **Pass (post-fix)** |
| 23 | "Are you a real AI?" | Unknown / sudhanshu | medium | `[DirectAnswer(negative), GapDisclosure(["...no record of AI..."]), FollowupHint]` | **Fail against ideal intent** — should resolve `subject: 'assistant'` (it's clearly a self-referential question) and get a `SelfModel` plan; instead `ASSISTANT_SUBJECT_RE`'s exact phrase `"are you real"` doesn't match `"are you **a** real AI"` (the inserted "a" breaks the contiguous-phrase regex) — a **frozen, pre-existing Phase 2 gap** in `conversation.js`, not a Phase 5 defect. `planning.js` correctly does the best it can with the `subject: 'sudhanshu'` it's handed: "AI" is caught by `entities.js`'s unrecognized-technology heuristic and honestly reported as an unrecognized entity, never fabricated. See §6. | **Fail (root-caused, non-blocking, frozen-phase gap — not fixed per this phase's freeze instruction)** |
| 24 | "Do you remember what I told you earlier?" | Unknown / **assistant** | low | `[DirectAnswer(neutral, SELF_MODEL.memory), SelfModel(aspect:'memory'), FollowupHint]` | `"do you remember"` matches `ASSISTANT_SUBJECT_RE` correctly → `SelfModel` plan with the right aspect (`'memory'`, not the default `'nature'`) — confirms `detectSelfModelAspect()`'s keyword routing works, not just the subject branch itself | **Pass** |
| 25 | "Do you call an external API?" | Unknown / sudhanshu | medium | `[DirectAnswer(negative), GapDisclosure(["...no record of API..."]), FollowupHint]` | **Fail against ideal intent**, same root cause as #23 — `ASSISTANT_SUBJECT_RE` has no phrase covering "do you call an external API," a frozen Phase 2 gap. Degrades honestly (no fabrication) rather than crashing. | **Fail (root-caused, non-blocking, frozen-phase gap)** |
| 26 | "Thanks, that makes sense" | Unknown / sudhanshu | low | `[HonestDecline(no-data), FollowupHint]` | **Fail against ideal intent** — should classify as `Conversation` (it is chit-chat, not a request for information) and get a lightweight acknowledgment plan; instead `CONVERSATION_RE`'s anchored (`^...$`) pattern only matches the *entire* string being exactly `"thanks"`/`"makes sense"` etc., not a longer sentence containing one of those phrases — a frozen, pre-existing Phase 2 gap. Still safe: `HonestDecline` is truthful (there is genuinely no portfolio content to answer "thanks" with), never a fabricated non-answer. | **Fail (root-caused, non-blocking, frozen-phase gap)** |
| 27 | "asdkjqwe zzz nonsense" | Unknown / sudhanshu | low | `[HonestDecline(no-data), FollowupHint]` | Spec's own §Example 2 shape, reproduced correctly | **Pass** |
| 28 | "what does your manager think about this" | Unknown / **ambiguous** | high | `[HonestDecline(ambiguous-subject, "Could you clarify...?"), FollowupHint]` | `OTHER_PERSON_SIGNAL_RE` correctly resolves `subject:'ambiguous'` → clarification-shaped decline, **regardless of the (here, high) confidence tier** — confirms the priority-chain ordering correctly checks `subject` before `confidence` | **Pass** |
| 29 | `""` (empty) | Unknown / ambiguous | low | `[HonestDecline(ambiguous-subject), FollowupHint]` | `resolveSubject('')` returns `'ambiguous'` per its own explicit empty-string rule → correctly routed | **Pass** |
| 30 | `"   "` (whitespace) | Unknown / ambiguous | low | `[HonestDecline(ambiguous-subject), FollowupHint]` | Same as #29 | **Pass** |

**Result: 27/30 plans match the ideal intent exactly; 3/30 ("Are you a real AI?", "Do you call an external API?", "Thanks, that makes sense") produce a defensible, non-crashing, honestly-degraded plan whose only flaw traces to a frozen Phase 2 regex gap in `conversation.js`, not to any defect in this phase's own block-selection logic — the same "root-caused to a frozen upstream gap" pattern Phase 3's and Phase 4's own reports already documented for their respective stages. Per this phase's explicit instruction not to modify Question Understanding unless it blocks Phase 5 — and none of these 3 cases crash, mis-render, or fabricate anything — none were fixed.**

---

## 3. A defect this validation process caught and fixed

**Bug:** The first implementation of `buildResponsePlan()`'s priority chain checked `confidence.tier === 'low'` *before* `questionFrame.subject === 'assistant'`. Self-referential questions ("Who are you?", "Do you remember...?") legitimately retrieve zero portfolio evidence — there is nothing about the assistant itself in `knowledge.js`'s docs — so Stage 6 correctly reports `tier: 'low'` / `basis: 'no-evidence'` for them. With the buggy ordering, that `'low'` tier was misread as "nothing to say," producing `[HonestDecline, FollowupHint]` for "Who are you?" instead of the intended self-description.

**Fix:** Reordered the priority chain so `subject: 'assistant'` is checked immediately after the `subject: 'ambiguous'` check and before the `confidence.tier` check — a self-referential question's confidence about *portfolio* evidence is simply irrelevant to whether the assistant can honestly describe itself. Re-verified directly:

| Question | Before fix | After fix |
|---|---|---|
| "Who are you?" | `[HonestDecline(no-data), FollowupHint]` | `[DirectAnswer(SELF_MODEL.nature), SelfModel(nature), FollowupHint]` |
| "Do you remember what I told you earlier?" | `[HonestDecline(no-data), FollowupHint]` | `[DirectAnswer(SELF_MODEL.memory), SelfModel(memory), FollowupHint]` |

Both now correctly produce a `SelfModel` plan. No other case's plan changed as a result of this fix (confirmed by re-running the full 30-question sweep before and after). This is disclosed in full per the instructions' own request for "previous planning behaviour... current planning behaviour... regressions" — this was a defect in code written *during* this phase, caught by this phase's own validation before being reported as final, not a regression against Phases 1–4.

---

## 4. Zero behavioral / routing change — direct proof

For all 28 non-empty questions from §2, `LocalProvider.generate()` was called twice per question with independently-constructed `ctx` objects (no shared mutable references) — once with `ctx.plan` populated, once entirely absent — and the two JSON-serialized results compared byte-for-byte.

**Result: 28/28 identical. 0 differences of any kind** — proving `buildResponsePlan()`'s output is correctly inert everywhere this phase: `providers.js` was not modified, does not read `ctx.plan`, and produces the exact same response regardless of whether Stage 7 ran or not. This directly satisfies "Do not allow `LocalProvider` to consume it yet" as a tested property, not an assumption.

---

## 5. Deviations from specification

1. **`buildResponsePlan()`'s signature is exactly `(questionFrame, entities, evidence, confidence)` — no `discourse` parameter, no `ctx` object (`visitorProfile`, `memory`, `focusProject`, `awarenessContext`), even though §4.2's own module contract lists both.** This phase's instructions are an explicit, narrower whitelist ("must consume ONLY: QuestionFrame, EntityResolutionSet, EvidenceSet, ConfidenceAssessment") than §4.2's fuller signature — honored literally, as the most recent and most specific instruction. Concrete consequences, each traced to a specific spec mechanism that needs an excluded input:
   - **No `RecruiterFraming` block is ever selectable.** §7.9's own trigger condition is literally `ctx.visitorProfile.type === 'recruiter'` — outside this phase's permitted inputs. A `Recruiter`-typed question (case #15) correctly still gets an answer (the generic evidence-grounded plan), just without the additional hiring-relevance sentence §Stage 7's own second worked example (`{questionType:'Recruiter'}, confidence.tier:'high', focusProject set → [DirectAnswer, Evidence, RecruiterFraming, FollowupHint]`) shows — that example cannot be fully reproduced this phase without `ctx.visitorProfile`/`ctx.focusProject`, both excluded.
   - **`FollowupHint.data.rationale` only ever takes the values `'question-type'` or `'default'`**, never `'pending-result'` or `'continuation'` — both require `DiscourseState`, excluded this phase.
   - **No `pendingResult`/`sessionFacts`-aware continuity phrasing** (e.g. avoiding re-suggesting a just-completed JD-match) — §7's Inputs line lists `discourse` specifically for this, unavailable here.

   Nothing was lost silently: each omission is a block/feature the spec itself gates behind a signal this phase's own instructions excluded, not an oversight.

2. **No block builds a rich-card `payload`; `plan.kind` is always `'text'` and `plan.payload`/`sourcesOverride` are always `null`.** §4.2's module contract explicitly states `planning.js` "does not import `knowledge.js`... does not go fetch more evidence" — but building a `'project-card'`/`'comparison'`-kind payload (e.g. `Recommendation`'s `{project}` object, or a project-type `Comparison`'s `{projectA, projectB}`) needs `knowledge.js`'s `getProject()`. Rather than violate the module contract's explicit "does not import `knowledge.js`" rule, or fabricate a partial payload from `ResolvedEntity`'s thinner shape (`canonical`/`surfaceForm` only, no `tagline`/`stack`/`decisions`), every plan this phase produces stays `kind: 'text'`. This is the direct, load-bearing reason `Recommendation` (§7.6) and project-type `Comparison` (§7.3's second half) are not implemented this phase (see #3 below) — not an oversight, a consequence of the module boundary the spec itself draws.
3. **Two of the ten §7 block types are not implemented this phase: `Strengths` (§7.4) and `RecruiterFraming` (§7.9).** `RecruiterFraming` is covered by deviation #1 above. `Strengths` requires "a confident, specific, non-generic list of what Sudhanshu is strong at" — no such authored content exists anywhere in `content.js` or `persona.js` today (only `ASSISTANT_CAPABILITIES`, which describes the *assistant's* features, not Sudhanshu's professional strengths). Synthesizing one from `evidence`/`entities` alone would mean inventing claims not grounded in any structured field — a direct violation of this phase's "must not generate final user-visible text" beyond structural templating, and of `docs/CURSOR_RULES.md`'s "Knowledge First" principle. `Recommendation` (§7.6) is also not implemented, per deviation #2. `Behavioral`/`Limitation`/`Capability`/`Recruiter`-typed questions that would ideally use `Strengths` (or, for `Limitation`, a `GapDisclosure` built from a self-assessed-weakness list rather than a taxonomy gap) instead fall through to the generic evidence-grounded plan (case #11's "What is he not good at?" is the clearest example) — an honest, non-fabricated, if less differentiated, answer.
4. **`DirectAnswer.data.text` and `GapDisclosure.data.items` are genuinely composed sentence fragments, not left `null`/deferred, despite the instruction "must NOT generate final user-visible text."** This is read as: don't produce or return the final assembled `{text, sources, kind, payload}` response contract (that remains exclusively `providers.js`/Stage 8's job, confirmed untouched and unconsumed in §4) and don't perform markdown formatting/phrase-variant rotation/citation assembly (also exclusively Stage 8's, per §4.2's Responsibility line: "Does not own markdown formatting... that is Stage 8"). Short, structurally-templated sentence fields ARE explicitly part of the specified `ResponseBlock` shapes themselves (§7.1: "the answer prose, already fully composed by `planning.js`") — producing them is required by "produce only the structured `ResponsePlan` defined in the specification," not prohibited by it. Every such sentence is templated strictly from already-verified structured fields (`entity.canonical`, `entity.ownership`, `evidence.gapNotes`/`evidence.primaryFacts`, `persona.js`'s already-authored `SELF_MODEL`/`TECH_TAKES` content) — nothing is invented. This interpretation is made explicit here, rather than silently assumed, precisely because the tension is real and worth a reviewer's attention.
5. **The generic no-entity fallback's `DirectAnswer` text is a single, uniform lead sentence ("Based on what is documented:") across 8 different `questionType`s** (`TechnologyExplanation`, `ArchitectureExplanation`, `Career`, `Limitation`, `Behavioral`, `EvidenceRequest`, `Experience`, `Recruiter`, and any `Comparison` with no grounded `TECH_TAKES` pair) rather than a differentiated lead per type. A more tailored lead per `questionType` is possible without new fabrication (it only needs to vary the *framing*, not the *facts*), but was deliberately kept uniform this phase to avoid drifting toward the kind of per-intent-bespoke-phrasing proliferation Cluster G/H's original problem statement names — that differentiation, if wanted, is squarely `_pickVariant`-shaped phrase-rotation work, which §4.2/§7's Responsibility line assigns to Stage 8, not Stage 7.
6. **The block-size cap (`enforceBlockCap()`, §Stage 7's own failure-mode mitigation) is implemented but never organically triggered by any branch in this phase** — every branch here produces 2–3 blocks, well under the 4/5-block cap. Confirmed present and correct by direct code inspection; not exercised by any of the 30 test questions, since none of this phase's own branches can produce more than 3.
7. **No other deviations.** The `ResponsePlan`/`ResponseBlock` field shapes (§3.6), the two implemented worked examples from §Stage 7 (Example 1 reproduced verbatim as case #3; Example 2's `RecruiterFraming` component is the one piece not reproducible, per deviation #1), and the `HonestDecline`-is-always-sole-content-block rule (§7.7) all match specification text exactly.

---

## 6. Remaining gaps (not fixed, per this phase's freeze instruction)

1. **Three frozen Phase 2 (`conversation.js`) classification gaps, newly visible now that Stage 7 acts on their output**, surfaced by cases #23/#25/#26: `ASSISTANT_SUBJECT_RE` doesn't cover "are you **a** real AI" (an inserted word breaks the contiguous phrase match) or "do you call an external API"; `CONVERSATION_RE`'s anchored pattern doesn't match chit-chat embedded in a longer sentence ("Thanks, **that makes sense**" vs. bare "thanks"). None of these are Phase 5 defects — `planning.js` degrades honestly and safely in all three cases (an unrecognized-entity gap disclosure, or a truthful decline) rather than crashing or fabricating — but they are the concrete, now-measurable cost of those frozen gaps, exactly the same "root-caused to a frozen upstream gap" pattern §6 of the Phase 3 and Phase 4 reports already documented for their own stages. Worth prioritizing whenever Phases 1–2 are unfrozen.
2. **`Strengths` and project-type `Comparison`/`Recommendation` block content has no grounded source yet** (deviation #3/#2) — closing this needs either new authored content (a Sudhanshu-strengths list in `persona.js`, mirroring `TECH_TAKES`'s existing pattern) or a permitted way for `planning.js` to obtain full project records without importing `knowledge.js` directly (e.g. richer data embedded in `ResolvedEntity` or `EvidenceSet` by an earlier stage) — a design decision for a future phase, not invented here.
3. **`RecruiterFraming` and discourse-aware follow-up rationales (`'pending-result'`/`'continuation'`) remain unreachable until a future phase is explicitly permitted to pass `ctx`/`discourse` into `buildResponsePlan()`** (deviation #1) — this is a scope decision made by this phase's own instructions, not a defect to close silently by quietly widening the function's inputs beyond what was authorized.

---

## 7. Files changed

| File | Change |
|---|---|
| `src/assistant/planning.js` | **New file.** Exports `buildResponsePlan(questionFrame, entities, evidence, confidence)`. Internal helpers: `enforceBlockCap`, `directAnswer`, `evidenceBlock`, `gapDisclosureBlock`, `honestDeclineBlock`, `selfModelBlock`, `followupHintBlock`, `detectSelfModelAspect`, `findTechTake`, `buildComparisonBlock` (none exported). |
| `src/assistant/persona.js` | **Extended, additively.** Adds `SELF_MODEL` (new named export: `{ nature, memory, connectivity }`, plain authored data) directly above the existing `ASSISTANT_CAPABILITIES` export. `ASSISTANT_CAPABILITIES`/`TECH_TAKES` unchanged. |
| `src/assistant.js` | **Extended.** Imports `buildResponsePlan` alongside the existing Stage 3/5/6 imports. Adds one new orchestration step ("6c. RESPONSE PLANNING") between Stage 6 (Confidence) and the existing "MEMORY happens inside the provider" step. Adds `plan` to the `ctx` object passed to `provider.generate()`. Updated the file-header pipeline comment. |
| `src/assistant/entities.js` | **Untouched.** Frozen per this phase's instructions. |
| `src/assistant/knowledge.js` | **Untouched.** Frozen. |
| `src/assistant/conversation.js` | **Untouched.** Frozen (see §6.1 for the three gaps observed but deliberately not fixed). |
| `src/assistant/providers.js` | **Untouched.** Does not read `ctx.plan` — confirmed by direct test (§4). Per this phase's explicit instruction, `LocalProvider` does not consume the plan yet. |
| `docs/PHASE_5_VALIDATION.md` | **New** — this report. |

---

## 8. API preservation

| API | Status |
|---|---|
| `resolveEntities()`, `assessConfidence()`, `matchTaxonomyEntities()` | **Unchanged** (Phases 1/4, frozen). |
| `knowledge.retrieve()`, `retrieveScoped()`, `buildEvidenceSet()`, `getDoc()`, `getProject()`, `getAllProjects()`, `getStack()`, `getArchitecture()`, `getProfile()`, `resolveProject()` | **Unchanged** (Phase 3, frozen). |
| `buildQuestionFrame()` and all of `conversation.js`'s exports | **Unchanged** (Phase 2, frozen). |
| `ASSISTANT_CAPABILITIES`, `TECH_TAKES` (`persona.js`) | **Unchanged** shape/content. |
| `LocalProvider.generate(query, ctx)` | **Unchanged signature and return shape** (`{ text, sources, kind, payload }`); gracefully ignores `ctx.plan` exactly as it already gracefully ignores `ctx.evidence`/`ctx.entities`/`ctx.confidence`. |
| `ask(rawText)` (`assistant.js`'s public entry point) | **Unchanged signature and return shape.** Internally gains one new local variable (`plan`) and one new `ctx` field passed to the provider — both purely additive. |

**New API surface added this phase:**

| New export | Shape | Notes |
|---|---|---|
| `buildResponsePlan(questionFrame, entities, evidence, confidence): ResponsePlan` | `{ blocks: ResponseBlock[], kind: 'text', payload: null, sourcesOverride: null }` | Exported from new file `src/assistant/planning.js`. `ResponseBlock` is `{ type, data }`; 8 of the spec's 10 §7 block types are producible this phase (`DirectAnswer`, `Evidence`, `Comparison`, `GapDisclosure`, `HonestDecline`, `SelfModel`, `FollowupHint` — 7, plus `Comparison` counted once — see §5.3 for the 2 not yet implemented: `Strengths`, `RecruiterFraming`). |
| `SELF_MODEL` | `{ nature: string, memory: string, connectivity: string }` | Exported from `src/assistant/persona.js`, per §4.6's exact spec. |

No existing export's signature, return shape, or behavior changed. Everything added is additive.

---

## 9. Summary

| Metric | Result |
|---|---|
| Natural-language questions tested | 30 |
| Plans matching ideal intent exactly | 27/30 (90%) |
| Plans degrading honestly due to a frozen, pre-existing Phase 2 gap (not a Phase 5 defect) | 3/30 (10%) — none crash, none fabricate |
| Priority-chain branches exercised | All 7 (ambiguous-subject, assistant-subject, low-confidence, greeting/conversation, comparison-with-grounded-pair, single-dominant-entity, generic-no-entity-fallback) |
| Block types produced by real benchmark questions | 7 of 10 (`DirectAnswer`, `Evidence`, `Comparison`, `GapDisclosure`, `HonestDecline`, `SelfModel`, `FollowupHint`) |
| Block types deliberately not implemented, with documented reasons | 3 of 10 (`Strengths`, `RecruiterFraming`, `Recommendation`) |
| Spec's own Stage 7 worked examples reproduced | 1 of 2 verbatim (Example 1); Example 2 partially (its `RecruiterFraming` component excluded per §5.1) |
| Bugs found and fixed during this phase's own validation | 1 (self-referential-question priority-ordering defect, §3) — caught before, not after, this report |
| `LocalProvider.generate()` outputs identical with vs. without `ctx.plan` | **28/28 (100%)** — proves zero routing/response change |
| Block-shape/plan invariants checked (non-empty blocks, `HonestDecline` never paired with content blocks, every plan ends in `FollowupHint`, block cap respected) | **30/30 pass, 0 failures** |
| Crashes / thrown errors | **0**, across 30 questions + edge cases |
| `node --check` on all touched/adjacent files (`planning.js`, `persona.js`, `assistant.js`, `entities.js`, `knowledge.js`, `conversation.js`, `providers.js`) | **PASS** |
| Public API preservation | All Phase 1–4 exports unchanged; two new additive exports (`buildResponsePlan`, `SELF_MODEL`) |

**Overall conclusion:** Phase 5 delivers Response Planning exactly as scoped — `buildResponsePlan()` consumes only the four permitted reasoning-stage outputs, decides answer strategy/block ordering/clarification-need/evidence-usage/follow-up-intent as pure, structured data, reproduces Stage 7's own first worked example verbatim, and is empirically confirmed, by direct byte-for-byte comparison across every tested question, to have zero effect on any currently-rendered response. One implementation bug (a priority-ordering defect affecting self-referential questions) was found and fixed by this phase's own validation process before being reported, with full before/after transparency. Three of ten block types (`Strengths`, `RecruiterFraming`, `Recommendation`) and two spec-listed planner inputs (`discourse`, the surrounding `ctx` object) were deliberately not implemented/consumed, each traced to a specific, explicit boundary this phase's own instructions or the module contract's "no `knowledge.js` import" rule impose — not silently dropped. Three pre-existing Phase 2 classification gaps became newly visible through this stage's output but were not fixed, per the explicit freeze instruction, since none of them block Phase 5 or cause anything worse than an honest, non-fabricated degraded answer. Response Composition (Stage 8) remains unimplemented and `providers.js` remains entirely unaware that `ctx.plan` exists, as instructed.
