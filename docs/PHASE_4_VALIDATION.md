# PHASE_4_VALIDATION.md

> Project: **SRIIVERSEAI**
>
> Validates: Phase 4 of `docs/REASONING_ENGINE_SPEC.md` (Stage 6 — **Confidence**), as implemented in `src/assistant/entities.js` (new `assessConfidence()`, co-located with entity-ownership logic per Section 4.1/8.1/§253) and `src/assistant.js` (orchestrates the new Stage 6 call and threads its output onto `ctx` for `provider.generate()`).
>
> Scope of this report: **Confidence only** — `assessConfidence(evidence, entities)`'s tier/basis/reason decision and its live wiring into `assistant.js`'s request path. Stage 4 (Conversation Context/discourse), Stage 7 (Response Planning), and Stage 8 (Response Composition) are all out of scope — nothing in this phase touched them, and this report makes no claim about them. Phases 1–3 are frozen; nothing in `entities.js`'s `resolveEntities()`, `conversation.js`'s `buildQuestionFrame()`, or `knowledge.js`'s `retrieveScoped()`/`buildEvidenceSet()` was modified to produce this report or during implementation.
>
> **No code was modified to produce this report.** Every result below was captured by calling the live, already-committed Phase 4 code directly (`assessConfidence()` against both live-pipeline-produced `EvidenceSet`/`EntityResolutionSet` objects and hand-built synthetic ones, plus `LocalProvider.generate()` with/without `ctx.confidence`), in a disposable Node harness (`_validate_phase4.mjs`) deleted immediately after use.

---

## 1. Methodology

Confidence is, by explicit design and by this phase's own instructions, a **pure assessment stage with zero consumers yet** — `providers.js` is not modified in this phase, and Stage 7 (Response Planning), the stage that would actually act on `confidence`, does not exist yet. This makes "Previous behaviour vs. Current behaviour" for the **visible response** trivial by construction: it is identical for every question, because nothing downstream of `assessConfidence()` reads its output. That is not a gap in this report — it is the literal, explicit requirement ("Confidence must NOT... change routing... generate responses") verified directly in §4 below, the same way Phase 3 verified `gapNotes` was "correct but inert."

The actual "changed result" this phase introduces is: **a `ConfidenceAssessment` now exists at all**, computed correctly for every question, ready for Stage 7 to consume once built. So this report validates two distinct things:

1. **§2 — Correctness of `assessConfidence()` itself.** For every tested question (and 8 synthetic unit cases isolating each branch), the Question, the entities/evidence it was fed, the `ConfidenceAssessment` produced, and whether it matches the tier/basis the specification's own worked examples and failure-mode table would predict.
2. **§4 — Zero behavioral change end-to-end.** `LocalProvider.generate()` called twice per question — once with `ctx.confidence` present, once without — with independently-constructed `ctx` objects (no shared mutable state between the two calls) to rule out any hidden coupling. Byte-for-byte `JSON.stringify()` comparison.

### 1.1 Question selection

21 natural-language questions were run — every question type that exercises a distinct branch of `assessConfidence()`'s decision logic against the live pipeline (`SkillVerification` for owned/gap/unknown entities, `ProjectExplanation` for project entities, `TechnologyExplanation`/`ArchitectureExplanation`/`Career`/`Limitation`/`Behavioral`/`EvidenceRequest`/`Experience`/`Recruiter` for the no-entity retrieval-score-gap path, `Comparison` for the multi-entity paths, `Greeting` and two nonsense/empty inputs for the no-evidence floor). These are, by construction, "the benchmark questions affected by Confidence" — since `assessConfidence()` runs unconditionally for every query in `ask()` (Stage 6 has no gating condition, unlike Stage 5's per-`questionType` affinity table), every question is technically "affected" in the sense that a `ConfidenceAssessment` is now computed for it; the 21 selected are the set that collectively exercises every reachable tier (`high`/`medium`/`low`/`ambiguous`) and every reachable basis (`entity-ownership`/`retrieval-score-gap`/`no-evidence`/`multi-way-tie`) at least once, per real pipeline output.

8 additional synthetic unit cases (hand-built `EvidenceSet`/`entities` inputs, not run through the live retrieval pipeline) isolate branches that are hard or impossible to reliably hit with natural language alone — most importantly `'ambiguous'`, which the spec's own failure-mode table calls out as "a required, tested branch," and the "single low-score match capped at medium" mitigation, which needs a precisely-controlled score to demonstrate deterministically.

---

## 2. Natural-language cases — `ConfidenceAssessment` produced by the live pipeline

Because no downstream consumer exists yet, **"Previous behaviour" and "Current behaviour" (the rendered response) are identical for all 21 cases** — confirmed byte-for-byte in §4. The column that actually changes, in every row, is **Confidence output**: it goes from *nonexistent* (Phases 1–3 never computed it) to the value shown.

| # | Question | `questionType` | Entities resolved | Confidence output | Expected (per spec) | Pass/Fail |
|---|---|---|---|---|---|---|
| 1 | "Do you know Python?" | SkillVerification | Python: owned/high | `high` / `entity-ownership` | Single owned entity, direct taxonomy hit → `high` (PLAN §Example 1) | **Pass** |
| 2 | "Does he know Docker?" | SkillVerification | Docker: owned/high | `high` / `entity-ownership` | Same as #1 | **Pass** |
| 3 | "Does he know Kubernetes?" | SkillVerification | Kubernetes: gap/high | `high` / `entity-ownership` | Gap entity, ownership state itself confidently known → `high` (PLAN §Example 2, "not `'unknown'`... confidence 'high'") | **Pass** |
| 4 | "Does he know AWS?" | SkillVerification | AWS: gap/high | `high` / `entity-ownership` | Same as #3 | **Pass** |
| 5 | "Does he know Rust?" | SkillVerification | Rust: unknown/medium | `medium` / `entity-ownership` | Heuristic-only match (no taxonomy record) — honest fact, unverified match → `medium`, not `high` | **Pass** |
| 6 | "Does he know Go?" | SkillVerification | Go: unknown/medium | `medium` / `entity-ownership` | Same as #5 | **Pass** |
| 7 | "Does he know Terraform?" | SkillVerification | Terraform: unknown/medium | `medium` / `entity-ownership` | Same as #5 | **Pass** |
| 8 | "Tell me about QueryForgeAI" | ProjectExplanation | queryforge: owned/high | `high` / `entity-ownership` | Project entities are always owned+high → `high` | **Pass** |
| 9 | "Tell me about the RepoRadarAI project" | ProjectExplanation | reporadar: owned/high | `high` / `entity-ownership` | Same as #8 | **Pass** |
| 10 | "What is his tech stack?" | TechnologyExplanation | none | `high` / `retrieval-score-gap` | No entity signal; top doc `stack` scores 9.54, 41% clear of runner-up (≥20% threshold) → `high` | **Pass** |
| 11 | "Explain the system architecture" | ArchitectureExplanation | none | `high` / `retrieval-score-gap` | Top doc `arch-overview` scores 9.00, 41% clear → `high` | **Pass** |
| 12 | "What are his career goals?" | Career | none | `medium` / `retrieval-score-gap` | Top 3 `journey-*` docs tie exactly at 2.40 (0% gap) — no entity signal to break the tie via ownership → `medium`, correctly not `high` | **Pass** |
| 13 | "What is he not good at?" | Limitation | none | `medium` / `retrieval-score-gap` | `kb-7`/`kb-9` tie exactly at 2.52 (0% gap) → `medium` | **Pass** |
| 14 | "What motivates you as an engineer?" | Behavioral | none | `high` / `retrieval-score-gap` | Top doc `kb-0` scores 3.78, 84% clear of `why-hire` at 0.6 → `high` | **Pass** |
| 15 | "Can you prove you know backend engineering?" | EvidenceRequest | none | `medium` / `retrieval-score-gap` | `project-arch-queryforge`/`project-arch-reporadar` tie exactly at 3.99 (0% gap) → `medium` | **Pass** |
| 16 | "What's his educational background?" | Experience | none | `high` / `retrieval-score-gap` | Single doc (`resume`, 2.40), no runner-up, score clears the 2.0 strong floor → `high` | **Pass** |
| 17 | "If I'm hiring for an AI engineer role, should I consider Sudhanshu?" | Recruiter | "Im"/"AI": unknown/medium (see §5.3 note) | `high` / `retrieval-score-gap` | 2 tied-confidence entities → no dominant entity (correctly bypasses `entity-ownership`); single doc `why-hire` at 6.20, no runner-up → `high` | **Pass** |
| 18 | "Compare Python and Kubernetes" | Comparison | Python: owned/high, Kubernetes: gap/high | `high` / `retrieval-score-gap` | 2 tied-confidence entities → no dominant one, correctly bypasses `entity-ownership`; but top doc (`journey-1`, 4.96) leads runner-up by 24% (≥5% tie threshold) → not `ambiguous`, correctly falls through to a confident retrieval-score-gap read | **Pass** |
| 19 | "Compare React and Vue" | Comparison | React: owned/high, Vue: gap/high | `ambiguous` / `multi-way-tie` | 2 tied-confidence entities, top two docs (`stack` 3.78, `project-queryforge` 3.60) within 4.8% (≤5% threshold) → genuine multi-way tie | **Pass — the required `'ambiguous'` branch, hit by a real benchmark question, not only a synthetic case** |
| 20 | "Hi there" | Greeting | none | `medium` / `retrieval-score-gap` | Top doc (`why-hire`, 2.00) vs. runner-up (1.90) — 5% gap, right at the tie boundary but only 1 entity-less signal, no `'ambiguous'` eligibility (requires 2+ entities) → correctly `medium`, not a crash or a false `high` | **Pass** |
| 21 | "asdkjqwe zzz nonsense" | Unknown | none | `low` / `no-evidence` | No entities, no supporting docs, no gap notes → exactly Stage 6's own §Example 2 case | **Pass** |
| — | `""` (empty string) | Unknown | none | `low` / `no-evidence` | Same as #21 | **Pass** |
| — | `"   "` (whitespace-only) | Unknown | none | `low` / `no-evidence` | Same as #21 | **Pass** |

**Result: 21/21 natural-language cases produce the tier/basis the specification's own text predicts. 0 crashes, 0 thrown errors**, including on the two empty/whitespace edge-case inputs.

---

## 3. Synthetic unit cases — isolating each branch deterministically

Constructed by hand-building `EvidenceSet`/`entities` inputs (not run through live retrieval), to prove every branch is reachable exactly as specified — per the spec's own requirement that `'ambiguous'` be "a required, tested branch."

| # | Scenario | Input (summary) | Confidence output | Expected | Pass/Fail |
|---|---|---|---|---|---|
| T1 | Spec §Stage 6 Example 1, verbatim | 1 owned/high entity; top doc 5.0, runner-up 3.5 (30% gap) | `high` / `entity-ownership` | `{ tier: 'high', basis: 'entity-ownership' }` | **Pass** |
| T2 | Spec §Stage 6 Example 2, verbatim | 0 entities, 0 supporting docs, 0 gap notes | `low` / `no-evidence` | `{ tier: 'low', basis: 'no-evidence' }` | **Pass** |
| T3 | Genuine multi-way tie | 2 entities, both owned/high (tied rank); top two docs 4.0/3.85 (3.7% gap) | `ambiguous` / `multi-way-tie` | `'ambiguous'` triggered by 2+ comparably-salient entities AND 2+ candidates within 5% | **Pass** |
| T4 | Tied docs, but only 1 entity — must NOT be `'ambiguous'` | Same tied docs as T3, but only 1 entity | `high` / `entity-ownership` | Score-tie alone is insufficient; `'ambiguous'` requires the entity-count condition too, per spec's explicit "not just retrieval noise" carve-out | **Pass — confirms the failure-mode mitigation actually gates on both conditions, not one** |
| T5 | Lone candidate, low absolute score | 0 entities; 1 supporting doc, score 0.9, `scoreGap: null` | `medium` / `retrieval-score-gap` | Failure-mode mitigation: "a lone low-absolute-score match is capped at `'medium'` regardless of gap" | **Pass** |
| T6 | Lone candidate, strong absolute score | 0 entities; 1 supporting doc, score 4.5, `scoreGap: null` | `high` / `retrieval-score-gap` | A strong lone match (unlike T5) is not penalized — the cap only applies to thin matches | **Pass** |
| T7 | Gap entity, zero supporting docs | Kubernetes: gap/high; 0 supporting docs, 1 gap note | `high` / `entity-ownership` | PLAN §Example 2: "the ownership state itself is confidently known" — needs no doc at all | **Pass** |
| T8 | Unrecognized-heuristic entity only | Rust: unknown/medium; 0 supporting docs, 1 gap note | `medium` / `entity-ownership` | Honest fact ("no record of Rust"), but the underlying match is a heuristic guess, not a verified hit → capped below `high` | **Pass** |

**Result: 8/8 synthetic cases match spec exactly, including the required `'ambiguous'` branch (T3) and the explicit negative control proving `'ambiguous'` needs both its trigger conditions, not either alone (T4).**

---

## 4. Zero behavioral / routing change — direct proof

For all 21 non-empty natural-language questions from §2, `LocalProvider.generate()` was called twice per question with **independently constructed `ctx` objects** (no shared mutable references, so no hidden state-coupling could produce a false "identical" result) — once with `ctx.confidence` populated, once with it entirely absent — and the two JSON-serialized results compared byte-for-byte.

**Result: 21/21 identical. 0 differences of any kind** — proving `assessConfidence()`'s output is correctly inert everywhere in this phase: `providers.js` was not modified, does not read `ctx.confidence`, and produces the exact same response regardless of whether Stage 6 ran or not. This is the direct, empirical confirmation of this phase's explicit constraint ("Confidence must NOT... change routing... generate responses").

Sample (2 of 21 shown; full 21-question sweep behind the same check):

| Question | Confidence computed | `generate()` output identical w/ vs. w/o `ctx.confidence`? |
|---|---|---|
| "Does he know Kubernetes?" | `high` / `entity-ownership` | **Identical** |
| "Compare React and Vue" | `ambiguous` / `multi-way-tie` | **Identical** |

---

## 5. Deviations from specification

1. **`assessConfidence()`'s signature is exactly `(evidence, entities)`, per Section 4.1's Public API table — `QuestionFrame` is not a parameter**, even though this phase's instructions listed `QuestionFrame` among the three permitted inputs. The literal specification's Stage 6 Inputs table (Section 1) and Public API table (Section 4.1) both list only `evidence: EvidenceSet` and `entities: ResolvedEntity[]` — no `questionFrame` field appears in either. Nothing `assessConfidence()` decides needs it: Stage 5 has already folded `questionType` into `evidence` via its affinity-scoped `supportingDocs`, and each `ResolvedEntity`'s `ownership`/`confidence` is computed question-type-agnostically by Stage 3. Adding an unused third parameter to match the instruction's outer permission list, when the spec's own literal contract doesn't call for it, would itself be a deviation from "implement... exactly as defined in the specification" — so the narrower, literal signature was kept. Nothing was lost: every case in §2 that plausibly *could* need question-type context (e.g. distinguishing a `Comparison`'s two-entity tie from a `SkillVerification`'s single-entity lookup) is already correctly resolved using only `entities`' own shape (`multiEntity`-equivalent tie detection), as demonstrated by cases #17–19.
2. **No `confidence score` (numeric), no `evidenceSufficiency` field, no `requiresClarification` field were added — despite the task instructions requesting all three "if defined"/"if specified."** None of the three is defined anywhere in `docs/REASONING_ENGINE_SPEC.md`'s or `docs/REASONING_ENGINE_PLAN.md`'s `ConfidenceAssessment` (Section 3.5's field table is exactly `{ tier, basis, reason }` — three fields, no more, confirmed by direct text search of both documents). Per the "if defined"/"if specified" qualifiers in the task itself, and per Rule 4 ("keep public interfaces stable," don't invent unspecified shape), each was deliberately mapped onto the existing 3-field structure instead of adding new ones:
   - **"confidence score"** → not defined; `tier` (an enum, not a number) is the specification's own chosen representation of "how sure," and Section 10's explicit Out-of-Scope note ("no UI badge, label, or 'confidence: 62%' style disclosure") confirms a raw number was never intended to exist as a first-class value at all.
   - **"evidence sufficiency"** → not a separate field; represented by `tier === 'low'` with `basis === 'no-evidence'` (§2 cases #21 and the two empty-input cases) — the exact same signal, already named and specified, rather than a redundant duplicate boolean.
   - **"clarification requirement"** → not a field on `ConfidenceAssessment` at all in either document; the closest specified concept is the `'ambiguous'` tier itself (§2 case #19), which Section 1's own Stage 6 text frames as exactly this ("so Response Planning can phrase...") — deciding to *ask* a clarifying question is explicitly Stage 7's (Response Planning's) job, not Stage 6's, per Section 1's own Stage 2 text about `Subject: 'ambiguous'` requiring "a `HonestDecline`-shaped clarifying question" from Response Planning, not from Confidence. Adding a `requiresClarification: boolean` field to `ConfidenceAssessment` would be inventing planning logic inside an assessment stage — exactly what this phase's own instructions forbid ("Confidence must NOT... make planning decisions").
3. **`gapNotes` are consumed (read) by `assessConfidence()`'s no-evidence check and reasoning text, but are not re-emitted as a new field on `ConfidenceAssessment`.** `EvidenceSet.gapNotes` is already Stage 5's own, already-specified output field; duplicating it onto `ConfidenceAssessment` would create two sources of truth for the same data. This is a deliberate reading of the task's "produce... gap notes" line as "correctly factor gap notes into the assessment" (which it does — see cases #3/#4/#17/#19 and synthetic T7/T8) rather than "invent a second copy of Stage 5's field."
4. **The `'medium'`-vs-`'high'` split for a single dominant entity is a `'high'`/`'medium'`-only decision — a hypothetical future `'low'`-confidence `ResolvedEntity` (not currently producible by `resolveEntities()`; `entities.js` only ever emits `'high'` or `'medium'`, confirmed by direct source inspection) would also map to `'medium'`, not `'low'`.** This is a forward-compatibility note, not a defect: no code path today can exercise it, and the spec gives no separate example distinguishing a `'medium'`- from a `'low'`-confidence entity's effect on the tier decision.
5. **No other deviations.** The tier/basis enum values (`'high'|'medium'|'low'|'ambiguous'` / `'entity-ownership'|'retrieval-score-gap'|'no-evidence'|'multi-way-tie'`), both named failure-mode mitigations (absolute-score cap for lone matches; the 5%-tie + 2-entity `'ambiguous'` trigger), and both worked examples (§2's Stage 6 Examples, reproduced verbatim as synthetic T1/T2) all match Section 1/3.5's text exactly.

---

## 6. Files changed

| File | Change |
|---|---|
| `src/assistant/entities.js` | **Extended** (Phase 1/3 additions unchanged). Adds `assessConfidence(evidence, entities)` (new export) plus three internal constants (`SCORE_FLOOR_STRONG`, `GAP_RATIO_STRONG`, `TIE_RATIO_AMBIGUOUS`, none exported). Updated the file's own header comment to document Phase 4's scope alongside Phase 1's. Reuses the existing, unexported `pickPrimary()` helper rather than duplicating its "comparable salience" logic. |
| `src/assistant.js` | **Extended.** Imports `assessConfidence` alongside the existing `resolveEntities` import. Adds one new orchestration step ("6b. CONFIDENCE") between Stage 5 (Evidence Selection) and the existing "MEMORY happens inside the provider" step. Adds `confidence` to the `ctx` object passed to `provider.generate()`. Updated the file-header pipeline comment and the Stage 5 step's now-stale comment (which previously said Stage 6 was "explicitly out of scope"). |
| `src/assistant/knowledge.js` | **Untouched.** Frozen per this phase's instructions; `buildEvidenceSet()`/`retrieveScoped()` unchanged. |
| `src/assistant/conversation.js` | **Untouched.** Frozen; `buildQuestionFrame()` unchanged. |
| `src/assistant/providers.js` | **Untouched.** `LocalProvider.generate()` does not read `ctx.confidence` — confirmed by direct test (§4). This is intentional: Stage 7 (Response Planning), not `providers.js` directly, is the spec's designated future consumer. |
| `docs/PHASE_4_VALIDATION.md` | **New** — this report. |

---

## 7. API preservation

| API | Status |
|---|---|
| `resolveEntities(query, { hint })` | **Unchanged** (Phase 1/3). |
| `matchTaxonomyEntities(text, { normalized })` | **Unchanged** (Phase 1). |
| `knowledge.retrieve()`, `retrieveScoped()`, `buildEvidenceSet()`, `getDoc()`, `getProject()`, `getAllProjects()`, `getStack()`, `getArchitecture()`, `getProfile()`, `resolveProject()` | **Unchanged** (Phase 3, frozen this phase). |
| `buildQuestionFrame()` and all of `conversation.js`'s exports | **Unchanged** (Phase 2, frozen this phase). |
| `LocalProvider.generate(query, ctx)` | **Unchanged signature and return shape** (`{ text, sources, kind, payload }`); gracefully ignores `ctx.confidence` exactly as it already gracefully ignored `ctx.evidence`/`ctx.entities` before Phase 3 wired those in. |
| `ask(rawText)` (assistant.js's own public entry point) | **Unchanged signature and return shape.** Internally gains one new local variable (`confidence`) and one new `ctx` field passed to the provider — both purely additive. |

**New API surface added this phase:**

| New export | Shape | Notes |
|---|---|---|
| `assessConfidence(evidence: EvidenceSet, entities: ResolvedEntity[]): ConfidenceAssessment` | `{ tier: 'high'\|'medium'\|'low'\|'ambiguous', basis: 'entity-ownership'\|'retrieval-score-gap'\|'no-evidence'\|'multi-way-tie', reason: string }` | Exported from `src/assistant/entities.js`, matches Section 3.5/4.1 exactly. |

No existing export's signature, return shape, or behavior changed. Everything added is additive.

---

## 8. Summary

| Metric | Result |
|---|---|
| Natural-language questions tested | 21 (plus 3 edge-case inputs: empty, whitespace) |
| Synthetic unit-test branches isolated | 8 (including both spec-provided worked examples, verbatim) |
| Tiers exercised by real benchmark questions | `high`, `medium`, `low`, `ambiguous` — **all four**, including a natural (non-synthetic) trigger of `'ambiguous'` (#19, "Compare React and Vue") |
| Bases exercised | `entity-ownership`, `retrieval-score-gap`, `no-evidence`, `multi-way-tie` — **all four** |
| Confidence outputs matching spec's predicted tier/basis | 21/21 natural cases + 8/8 synthetic cases = **29/29** |
| `LocalProvider.generate()` outputs identical with vs. without `ctx.confidence` | **21/21 (100%)** — proves zero routing/response change |
| Crashes / thrown errors | **0**, across 21 questions + 3 edge-case inputs + 8 synthetic calls |
| `node --check` on all touched/adjacent files (`entities.js`, `assistant.js`, `knowledge.js`, `providers.js`, `conversation.js`) | **PASS** |
| Public API preservation | All Phase 1–3 exports unchanged; one new additive export (`assessConfidence`) |

**Overall conclusion:** Phase 4 delivers Confidence exactly as scoped — `assessConfidence(evidence, entities)` is built per Section 3.5/4.1's literal contract, correctly reproduces both of the specification's own worked examples verbatim, correctly implements both named failure-mode mitigations (the absolute-score cap for lone thin matches, and the dual-condition `'ambiguous'` trigger — proven not just reachable but *correctly gated on both its conditions*, not either alone, via the T3/T4 negative-control pair), and is empirically confirmed, by direct byte-for-byte comparison across every tested question, to have zero effect on any currently-rendered response — satisfying "pure assessment, no retrieval, no routing change, no response generation, no evidence mutation, no planning decisions" as a directly-tested property, not an assumption. Three requested output concepts not defined anywhere in the specification (numeric confidence score, a dedicated evidence-sufficiency field, a dedicated clarification-requirement field) were deliberately mapped onto the specification's actual, already-complete three-field shape rather than invented, with the mapping made explicit in §5 rather than silently omitted. Response Planning and Response Composition remain unimplemented, as instructed.
