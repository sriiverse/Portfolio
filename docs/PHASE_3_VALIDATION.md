# PHASE_3_VALIDATION.md

> Project: **SRIIVERSEAI**
>
> Validates: Phase 3 of `docs/REASONING_ENGINE_SPEC.md` (Stage 5 — **Evidence Selection**), as implemented in `src/assistant/knowledge.js` (extended with `retrieveScoped()` + `buildEvidenceSet()`), `src/assistant.js` (orchestrates Stage 3's `resolveEntities()` live for the first time, plus the new Stage 5 call), and `src/assistant/providers.js` (`LocalProvider.generate()`'s retrieval-first fallthrough now reads `ctx.evidence.supportingDocs` instead of calling `retrieve()` directly).
>
> Scope of this report: **Evidence Selection only** — `retrieveScoped()`'s `questionType`→`doc.kind` affinity narrowing, `buildEvidenceSet()`'s `gapNotes`/`primaryFacts`/`scoreGap` construction, and the live wiring of Stage 3 (Entity Resolution) + Stage 5 into `assistant.js`'s request path. Stage 4 (Conversation Context/discourse), Stage 6 (Confidence), Stage 7 (Response Planning), and Stage 8 (Response Composition) are all out of scope — nothing in this phase touched them, and this report makes no claim about them. Phases 1 and 2 are frozen; nothing in `entities.js`'s `resolveEntities()` or `conversation.js`'s `buildQuestionFrame()` was modified to produce this report or during implementation.
>
> **No code was modified to produce this report.** Every result below was captured by calling the live, already-committed Phase 3 code directly (`retrieve()` vs `retrieveScoped()` side by side, `buildEvidenceSet()`, and `LocalProvider.generate()` with/without `ctx.evidence`), in disposable Node harnesses deleted immediately after use.

---

## 1. Methodology

For each tested question:

1. **Before** — `retrieve(query, 5)`'s top-scoring doc (today's unchanged scorer, unscoped candidate pool) and, where relevant, the full `LocalProvider.generate()` response produced when `ctx.evidence` is absent (i.e. the exact behavior before this phase).
2. **After** — `retrieveScoped(query, {questionType})`'s top-scoring doc, and the full `LocalProvider.generate()` response produced with `ctx.evidence` populated (i.e. live, current behavior).
3. **Verdict** — **Improvement** (the new top doc/response more directly answers the question), **Regression** (the new top doc/response is a worse match than before), or **Neutral** (the top doc changed but neither answer is clearly better — both are pre-existing gaps this phase neither fixes nor worsens in any meaningful way).
4. Every case where the top doc did **not** change is a de facto **zero-regression** result — `retrieveScoped()` is spec-required to reduce, byte-for-byte, to `retrieve()`'s own scoring and ordering whenever no affinity entry exists for that `questionType`, or the affinity-preferred subset doesn't clear the existing `score > 0.5` floor.

### 1.1 Question selection

43 questions were run through the `retrieve()` vs. `retrieveScoped()` comparison — every question from Phase 2's own validation set whose `questionType` reaches `providers.js`'s retrieval-first fallthrough (i.e., is **not** short-circuited by one of `conversation.js`'s pre-existing `strategy.move` branches — greeting, identity, tech-comparison, opinion, experience, or an architecture move with a resolved project/portfolio doc). These are, by construction, exactly "the benchmark questions affected by Evidence Selection" — a `questionType` value that never reaches `retrieveScoped()` cannot be affected by this phase at all, no matter how the eval suite categorizes it.

Of these 43, **9 produced a different top-scoring document**; each is analyzed individually in §2. The remaining 34 are unaffected (§3, regression control).

---

## 2. Cases where the top document changed (the only user-visible surface this phase can affect)

### 2.1 Improvements (5)

**"If I'm hiring for an AI engineer role, should I consider Sudhanshu?"** — `Recruiter`
- Before: top doc `profile` (generic bio) → generic "## Sudhanshu Sinha... Python Backend Engineer" text.
- After: top doc `why-hire` (`kind: 'recommend'`) → the actual recruiter-framed "## Why Hire Sudhanshu Sinha" response, with the recruiter pitch and ordered project list.
- **Verdict: Improvement.** This is `Recruiter`'s own affinity entry (`['recommend']`) doing exactly its named job — a recruiter-shaped question no longer loses to a generic profile bio purely on keyword-overlap coincidence.

**"What are his career goals?"** — `Career`
- Before: top doc `project-placementpro` → a full **Placement Pro+ project card**, entirely unrelated to the question asked.
- After: top doc `journey-0` (`kind: 'journey'`) → journey/background text, topically on-subject.
- **Verdict: Improvement — the single clearest, most concrete instance of Cluster E in this test set.** This is the exact failure mode Stage 5's spec text names by example ("a stack question outscoring a project's own architecture doc") happening for real, on a live benchmark question, before this phase: a career-goals question rendering an unrelated project card is a jarring, visibly wrong response a real visitor would notice. It is not a complete fix — the ideal answer to "career goals" (a forward-looking statement) doesn't exist as a document anywhere in `knowledge.js` today, so the after-text (a past-journey blurb) is still imperfect — but the collision itself, the part Evidence Selection was scoped to fix, is fixed.

**"What's his educational background?"** — `Experience`
- Before: top doc `profile` → generic bio, no acknowledgment that education isn't documented.
- After: top doc `resume` → the `_resumeResponse()` card, which ends with: *"For anything not covered here (e.g. formal education or certifications), that information isn't part of this portfolio's knowledge base."*
- **Verdict: Improvement, and closes a gap `docs/PHASE_2_VALIDATION.md` §5.3 explicitly named as unresolved** (Phase 2's report: *"Q169/Q171/Q172/Q170... will require Evidence Selection to correctly produce an honest decline"*). This is the first concrete case of that prediction paying off — the visitor now gets an explicit, honest disclosure about the education-data gap instead of a bio that silently omits it.

**"Do you know Python?"** — `SkillVerification`
- Before: top doc `journey-1` (`kind: 'journey'`, no dedicated route in `providers.js`'s `switch`) → a single disconnected sentence fragment: *"Language — Python: Adopted Python as the primary language..."*
- After: top doc `stack` → the full, structured Technology Stack card, clearly confirming Python.
- **Verdict: Improvement.** A direct yes/no skill-verification question no longer risks landing on an isolated, out-of-context journey sentence.

**"Can you prove you know backend engineering?"** — `EvidenceRequest`
- Before: top doc `kb-5` (`kind: 'qa'`, the generic five-layer-architecture blurb) → abstract description, no concrete evidence.
- After: top doc `project-arch-queryforge` → the full QueryForgeAI project card with its actual engineering decisions.
- **Verdict: Improvement.** An explicit "prove it" question is now answered with a concrete, citable project instead of an abstract architecture description — directly on-target for what `EvidenceRequest` means.

### 2.2 Regression (1) and Mixed/Debatable (1) — both honestly disclosed

**"Can you match a job description against his skills?"** — classified `TechnologyExplanation`
- Before: top doc `kb-2` (Placement Pro+'s KB entry, which happens to mention "detects skill gaps against target roles") → topically adjacent, if imperfect.
- After: top doc `stack` (forced by `TechnologyExplanation`'s affinity entry, `['stack', 'project-stack']`) → a generic tech-stack list that doesn't address the capability question ("can you do X") at all.
- **Verdict: Regression, root-caused to a pre-existing, already-documented, frozen Phase 2 gap — not a defect in this phase's own logic.** `docs/PHASE_2_VALIDATION.md` §5.6/§6.1 already identified that `Capability` is listed in the Spec's `QuestionType` enum but has **no reachable step in the Spec's own 13-step priority chain** — so this question (which should ideally be `Capability`) falls through to `TechnologyExplanation` purely because it contains the word "skills." Before this phase, that misclassification was harmless — raw `retrieve()` never consulted `questionType` at all, so the mis-tag had zero effect on which doc won. Stage 5's affinity mechanism is the first stage to actually *act* on `questionType`, so it is also the first stage where an existing, frozen upstream misclassification can make an answer measurably worse than the pre-Phase-3 baseline. Per the user's explicit instruction to freeze Phases 1–2 unless a blocking defect is found, and because this is a narrow, single-category symptom of an already-known, already-scoped-for-a-future-phase gap (not a new defect), this was **not** fixed by editing frozen Phase 2 code, and the affinity table itself was deliberately left literal-spec-compliant rather than adding an undocumented heuristic (e.g. comparing preferred-subset-top-score against full-pool-top-score) to paper over it — see §4 for the explicit recommendation this produces.

**"What's the most impressive project?"** — `ProjectExplanation`
- Before: top doc `kb-10` (`kind: 'qa'`, a flat, neutral list of all three projects) → *"Three production systems: 1) QueryForgeAI... 2) Placement Pro+... 3) RepoRadarAI..."*
- After: top doc `project-queryforge` → a full QueryForgeAI-only project card, presented with no acknowledgment that "most impressive" is a genuinely ambiguous, three-way judgment call.
- **Verdict: Debatable, flagged for reviewer judgment rather than scored as a clean pass/fail.** The new answer is more specific and richer, but it silently substitutes one project for what is, per the question's own wording, meant to be a comparative judgment across all three (the eval suite's own Q31 entry lists this question's entities as *"Project (ambiguous — all three)"*). The previous, neutral list arguably hedged the ambiguity more honestly than confidently picking one project by incidental keyword score. `ProjectExplanation`'s affinity list (`['project', 'project-arch', 'project-stack']`) is doing exactly what it's designed to do here — this is a genuine tension between "prefer structured project docs" (Stage 5's general goal) and "this specific question is actually a `Recommendation`-shaped superlative, not a a single-project lookup" (a `questionType`-precision issue, again upstream of this phase).

### 2.3 Neutral (2)

**"What motivates you as an engineer?" / "...him..."** — `Behavioral`, both persons
- Before: top doc `profile` → generic bio card.
- After: top doc `kb-0` → a very similar generic "who is Sudhanshu" blurb.
- **Verdict: Neutral.** Both are equally generic, neither addresses "motivates" specifically — there is no dedicated "what motivates him" content anywhere in `knowledge.js` for either version to find. Second/third person parity is preserved (both phrasings changed identically, consistent with Phase 2's subject-canonicalization work).

---

## 3. Regression control — 34 unaffected questions

Every other tested question — including every already-correct `ProjectExplanation`/`ArchitectureExplanation`/`TechnologyExplanation` case with an explicit project name or clean keyword match, every `Limitation`/most `Behavioral` phrasings, and the `Greeting`/`Identity`/`Opinion`/`Comparison`/`Experience` moves that are short-circuited before retrieval ever runs — produced a **byte-identical top document** under `retrieveScoped()` as under `retrieve()`. This confirms the spec's own central safety requirement (§1, Stage 5 failure-mode table): affinity narrows preference, it does not exclude, and the fallback-to-full-pool path is exercised correctly whenever narrowing would have made things worse or found nothing.

A direct `LocalProvider.generate()` before/after comparison (`ctx.evidence` present vs. absent) was also run for every `strategy.move`-short-circuited case (`greeting`, `identity`, `experience`, `comparison`/tech, `explanation`/architecture) — **all identical**, confirming `evidence` is correctly inert for any response path that doesn't reach the retrieval fallthrough at all.

**Result: 34 of 43 tested questions (79%) show zero change of any kind. 0 crashes, 0 thrown errors, across all 43 plus 4 additional edge-case inputs (empty string, whitespace-only, emoji-only, single character).**

---

## 4. `gapNotes` — built correctly, confirmed inert (as designed)

Per this phase's explicit scope boundary (Confidence/Response Planning/Response Composition all excluded), `buildEvidenceSet()`'s `gapNotes` field was verified to be **populated correctly** but **not yet rendered anywhere** — the exact same "correct but not yet visible end-to-end" pattern `docs/PHASE_1_VALIDATION.md` documented for `resolveEntities()`'s ownership data.

| Query | Entity resolved | `gapNotes` | `generate()` text, with vs. without `ctx.evidence` |
|---|---|---|---|
| "Does he know Kubernetes?" | `Kubernetes: gap` | `["Kubernetes is not part of Sudhanshu's shipped project history."]` | **Identical** — both produce the generic `_fallback()` text |
| "Does he know Rust?" | `Rust: unknown` | `["There's no record of Rust in Sudhanshu's documented skill set."]` | **Identical** |
| "Does he know Go (Golang)?" | `Go: unknown`, `Golang: unknown` | one note per surface form | **Identical** |
| "Do you know Python?" | `Python: owned` | `[]` (correctly empty — no gap to report) | Differs (§2.1 — via the top-doc-change mechanism, not via `gapNotes`) |

This confirms `buildEvidenceSet()`'s ownership-to-gap-note logic is correct and ready for Stage 6/7 to consume, and confirms — by direct test, not assumption — that nothing in this phase accidentally leaked gap-disclosure text into a response early. `EvidenceSet.primaryFacts` and `scoreGap` were similarly confirmed present and correctly shaped but are, likewise, not yet read by anything downstream.

---

## 5. Deviations from specification

1. **`retrieveScoped()`'s `entities` parameter is accepted but not yet used to bias scoring.** The Section 4.4 signature explicitly includes `entities?: ResolvedEntity[]`, and this implementation accepts it for interface completeness, but does not use it to re-rank candidate documents — only `buildEvidenceSet()`'s separate `gapNotes` logic consumes `entities` directly. Nothing in Stage 5's spec text mandates a specific entity-aware scoring adjustment inside `retrieveScoped()` itself (the two named mechanisms — kind-affinity narrowing and gap-note synthesis — are both implemented), so this is a deliberate, minimal reading of an intentionally underspecified parameter, in the same spirit as `entities.js`'s own already-shipped `resolveEntities({ hint })` parameter.
2. **`_comparisonResponse(query, retrieve(query, 5))`'s one remaining direct `retrieve()` call site (`providers.js`, the project-scoped comparison branch) was deliberately left unchanged.** That branch does not decide behavior from `hits[0].doc.kind` the way the main fallthrough does — it filters `getAllProjects()` by explicit name match and only uses `hits` as a citation-list fallback — so it was never a Cluster E collision site to begin with, and changing it would be scope creep beyond "replace retrieval-first *routing*."
3. **Remote LLM providers' `buildGroundedPrompt()` (OpenAI/Claude/Gemini/OpenRouter/Ollama) still call `retrieve()` directly, unchanged.** These are demo-mode-only paths; Stage 5's entire spec (and every prior phase's own scope) targets `LocalProvider` specifically, and none of Cluster E's named examples involve a remote provider.
4. **No other deviations.** `retrieveScoped()`'s narrow-never-exclude fallback, `buildEvidenceSet()`'s field shapes, and the live Stage 3/Stage 5 orchestration wiring in `assistant.js` all match Section 4.4/3.4/8.4's contracts exactly.

---

## 6. Remaining architectural gaps

1. **`Capability`'s unreachable priority-chain step (Phase 2's own documented gap) is now the single highest-leverage fix for improving Evidence Selection's own hit rate further.** §2.2's regression case exists *only* because of this gap — Stage 5's affinity mechanism cannot be more precise than the `questionType` it's given. This is not a Phase 3 defect to fix; it's the concrete, measured evidence for why Phase 2's already-flagged gap should be prioritized whenever Phases 1–2 are unfrozen.
2. **`gapNotes`/`primaryFacts`/`scoreGap` have zero consumers until Stage 6 (Confidence) and Stage 7 (Response Planning) exist.** This phase's entire value is currently expressed through one narrow channel — which document wins `providers.js`'s existing `top.kind` switch — because that switch is the only thing downstream of retrieval that currently exists. The honest "no" Stage 5's own spec example promises for a gap technology (§Stage 5 Examples: *"no retrieval call is even needed to answer honestly"*) is not yet visitor-facing; a visitor asking "does he know Kubernetes?" still receives the same generic `_fallback()` text as before this phase, confirmed by direct test in §4.
3. **The `ProjectExplanation` vs. `Recommendation` boundary (§2.2's "most impressive project" case) is a `questionType`-precision issue that Evidence Selection cannot resolve on its own.** A superlative question ("most impressive," "best," "strongest") is structurally a request for a *judgment*, not a lookup — `RECOMMENDATION_RE`'s existing narrow pattern-match (`docs/PHASE_2_VALIDATION.md` §5.4) doesn't catch this phrasing, so it falls to `ProjectExplanation`'s affinity, which is doc-lookup-shaped, not judgment-shaped. Worth revisiting alongside `Capability`'s gap in a future Question Understanding refinement pass, not fixable inside Evidence Selection itself.
4. **The `score > 0.5` floor is a single fixed constant reused identically for both the affinity-preferred subset and the full pool**, per literal spec text — there is no relative comparison between the two pools' respective top scores. This is why §2.2's `Capability`-misclassification regression is possible at all: a lower-scoring but kind-preferred doc can beat a higher-scoring non-preferred doc whenever both individually clear the floor. The spec's own failure-mode table (Stage 5) only requires a floor-based fallback, not a magnitude comparison; adding one was considered and deliberately not implemented in this phase, to avoid inventing unspecified behavior — but it is the natural, narrowly-scoped follow-up fix if this class of regression needs to be closed without touching Phase 2.

---

## 7. Summary

| Metric | Result |
|---|---|
| Questions tested (retrieval-level comparison) | 43 |
| Top document changed | 9 (21%) |
| — Improvements | 5 |
| — Regressions | 1 (root-caused to a frozen, already-documented Phase 2 gap) |
| — Debatable/mixed | 1 |
| — Neutral | 2 |
| Top document unchanged (zero-regression control) | 34 (79%) |
| End-to-end `generate()` before/after comparisons | 11, all consistent with the retrieval-level findings above |
| Crashes / thrown errors | 0, across 43 questions + 4 edge-case inputs (empty, whitespace, emoji, single-char) |
| `gapNotes`/`primaryFacts`/`scoreGap` correctness | Confirmed correct by direct inspection; confirmed inert (zero visible effect) end-to-end, exactly as scoped |
| `node --check` on all 3 touched files (`knowledge.js`, `assistant.js`, `providers.js`) | **PASS** |
| Public API preservation | `retrieve()`, `getDoc()`, `getProject()`, `getAllProjects()`, `getStack()`, `getArchitecture()`, `getProfile()`, `resolveProject()` all unchanged; `LocalProvider.generate(query, ctx)`'s signature and `{text, sources, kind, payload}` return shape unchanged; `providers.js`'s fallthrough degrades to its exact pre-Phase-3 behavior whenever `ctx.evidence` is absent |

**Overall conclusion:** Phase 3 delivers Evidence Selection exactly as scoped — `retrieveScoped()` and `buildEvidenceSet()` are built per Section 4.4/3.4's contracts, Stage 3 (Entity Resolution) is orchestrated live for the first time, and the one Cluster E collision this test set could concretely demonstate (`career goals` → an unrelated project card) is measurably fixed, alongside four other genuine improvements. One regression and one debatable case were found, and both are honestly attributed to their true root cause — a documented, frozen Phase 2 gap (`Capability`'s unreachable classification) and a `questionType`-precision boundary — rather than silently patched by touching frozen code or by inventing spec behavior beyond what Section 4.4 actually specifies. `gapNotes` and `primaryFacts` are correct and ready, but (as explicitly scoped) not yet visitor-facing, since Confidence, Response Planning, and Response Composition remain unimplemented.
