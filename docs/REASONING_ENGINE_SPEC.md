# Reasoning Engine — Engineering Specification

**Status:** Implementation contract. Approved architecture from `docs/REASONING_ENGINE_PLAN.md`, specified to the interface level.
**Precedes:** Coding. No source file listed in this document has been modified as part of producing it.
**Supersedes:** Nothing. This document specifies how `docs/REASONING_ENGINE_PLAN.md`'s approved architecture is realized inside the live repository described by `docs/PROJECT_ARCHITECTURE.md` and governed by `docs/CURSOR_RULES.md`.

---

## 0. Purpose and How to Use This Document

`docs/REASONING_ENGINE_PLAN.md` established **why** the assistant needs a 7-stage reasoning pipeline and **what** each stage is responsible for, in narrative form. That document intentionally stopped short of interfaces — it is an architecture plan, not a contract.

This document is the **contract**. It exists so that a future implementation session (this one, or another) can write code without making a single undocumented design decision. Every data structure exchanged between stages, every function signature affected, every module's calling rules, and every file's exact edit order is decided here, in writing, before any code changes.

**Rule for the implementer:** if a decision is not written down in this document, stop and update this document first — do not decide it ad hoc while coding. If this document and the live repository disagree at implementation time (because the repository changed after this was written), the repository is the source of truth for *current state*, but this document is still the source of truth for *target state* — flag the discrepancy and resolve it before proceeding, per `docs/CURSOR_RULES.md` Rule 1 ("Never Hallucinate," extended here to mean: never silently improvise an interface).

This document does not contain source code or pseudocode. Data structures are specified as field tables (name / type / required / description / example). Type names in those tables (e.g. `string`, `string[]`, `'high' | 'medium' | 'low'`) are type *descriptions*, not code.

### 0.1 Documents this specification is bound by

| Document | What it constrains here |
|---|---|
| `docs/REASONING_ENGINE_PLAN.md` | The 7 stages, the 8 failure clusters they fix, the module list, the migration philosophy. This spec must implement exactly that plan — no stage added, none removed. |
| `docs/AI_EVALUATION_SUITE.md` | The `questionType` enum (§2, applied to `QuestionFrame` in §3.1) is taken **verbatim** from that document's "Expected Question Type" taxonomy (its own §3, "Question Types"). The 203 questions are this pipeline's acceptance test set. |
| `docs/AI_ASSISTANT_SPEC.md` | Vision, "never hallucinate," module boundary conventions. |
| `docs/PROJECT_ARCHITECTURE.md` | The six architectural layers; `src/assistant/*` module boundaries; Zero-Build Architecture (no bundler, native ES modules — this spec introduces zero build-time dependencies). |
| `docs/CURSOR_RULES.md` | Rule 4 ("Respect Module Boundaries" / "No Large-Scale Rewrites") governs every decision in §8 (Migration Contract). Every rename in this document is justified against that rule explicitly, in place, at the point it is made. |

### 0.2 Notation conventions used throughout this document

- **Type column values** — `string`, `number`, `boolean`, `string[]`, `object`, `null`, or a **union of literal values** written as `'a' | 'b' | 'c'`. A union is a closed enum: no other value is valid.
- **Required/Optional** — "Required" means the producing stage must always set the field (it may be an empty array/`null` *value*, but the *key* must exist). "Optional" means the field may be entirely absent when not applicable.
- **Nested structures** — when a field's type is another named structure (e.g. `ResolvedEntity[]`), that structure is defined in its own subsection; it is not re-inlined.
- **Ownership of a structure** — every structure lists which stage/module *produces* it and which stages/modules are *permitted readers*. A structure must never be mutated by a reader — each stage produces a new structure (or a shallow-extended copy); it does not reach back and edit a structure built by an earlier stage. This is the concurrency/debuggability invariant referenced in the Plan's Risk R4.
- **"Unchanged"** in a Module Contract means: the function's name, signature, return shape, and behavior are exactly as they exist in the repository today, and this document is only recording them for completeness/cross-reference — no edit is planned.

---

## 1. Pipeline Stage Specifications

The pipeline has **eight** stages when the Mode Gate and Command Gate are counted as the first two (both unchanged from today). The five net-new/evolved reasoning stages are Question Understanding through Response Composition. Every non-command, non-interview-mode user turn passes through all eight in order.

```
User Input
   │
   ▼
[0] Mode Gate            (assistant.js — unchanged)
   │  (interview inactive)
   ▼
[1] Command Gate          (assistant.js — narrowed classifyIntent())
   │  (no command matched)
   ▼
[2] Question Understanding (conversation.js — buildQuestionFrame())
   ▼
[3] Entity Resolution      (entities.js — resolveEntities())
   ▼
[4] Conversation Context   (memory.js — discourse read + resolve)
   ▼
[5] Evidence Selection     (knowledge.js — buildEvidenceSet())
   ▼
[6] Confidence             (entities.js — assessConfidence())
   ▼
[7] Response Planning      (planning.js — buildResponsePlan())
   ▼
[8] Response Composition   (providers.js — renderPlan())
   │
   ▼
Final Render (renderer.js, unchanged) + Conversation Context write-back
```

Stages 0–1 are documented briefly for completeness (they are not being redesigned); stages 2–8 are the subject of this specification.

---

### Stage 0 — Mode Gate

**Purpose.** Determine whether the current turn belongs to an already-active stateful sub-session (Interview Mode) that owns its own turn-handling loop, bypassing the reasoning pipeline entirely.

**Inputs.** Raw user text (`string`). Implicit input: `interview.isActive()` (boolean, read from `interview.js`'s internal session state).

**Outputs.** Either (a) a fully-handled turn (interview renders its own reply, function returns, pipeline never runs), or (b) a signal to proceed to Stage 1.

**Responsibility.** `assistant.js` only. No other module may query `interview.isActive()` — see §4.9.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| Interview turn incorrectly falls through to the reasoning pipeline | `interview.isActive()` returns stale `false` after a session start | Unchanged from today; `interview.start()` is synchronous and sets state before `ask()` returns. |
| Reasoning-pipeline turn incorrectly captured by interview gate | `interview.isActive()` returns stale `true` after session end | Unchanged from today; `interview.js` clears its own state on completion/cancellation before yielding control. |

**Examples.**
- Input: `"What's the time complexity of quicksort?"` while an interview session is active → captured by Stage 0, routed to `interview.handleTurn()`, pipeline never runs.
- Input: `"What's the time complexity of quicksort?"` with no active session → passes through to Stage 1.

---

### Stage 1 — Command Gate

**Purpose.** Detect turns that are **imperative actions** (navigate, open a demo, download the résumé) or **mode-switch triggers** (start an interview, a pasted job description) — cases where the correct response is to *do something* or *hand off to another subsystem*, not to reason about a question at all.

**Inputs.** Raw user text (`string`, already run through `resolveContext`'s predecessor concerns — see note below).

**Outputs.** One of: `'jd-match'`, `'interview'`, `'action-nav'`, `'action-demo'`, `'action-github'`, `'action-contact'`, `'action-highlight'`, `'action-resume'`, or `null` (no command recognized — proceed to Stage 2).

**Responsibility.** `assistant.js`'s `classifyIntent()`, **narrowed** (see §8.2 — this is the one behavior-preserving edit to this function). Today this function also returns semantic labels (`'recruiter'`, `'architecture'`, `'stack'`, `'comparison'`, `'profile'`, `'project'`, `'question'`); those labels move to Stage 2's `questionType` and are removed from this function's vocabulary.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| A factual question is misread as a command | Command regexes are broad (e.g. `/demo\|launch\|try it\|open.*project\|visit/`) and can match inside a longer factual sentence | Unchanged risk from today; out of scope for this spec (tracked as a pre-existing, low-frequency issue in `docs/AI_EVALUATION_SUITE.md`'s Edge Cases category, not one of the 8 clusters this pipeline targets). |
| A pasted job description containing the word "interview" or "resume" is misrouted | Order-of-checks ambiguity | Unchanged: `looksLikeJobDescription()` is checked first, exactly as today. |

**Examples.**
- `"Open the Nova demo"` → `'action-demo'`, pipeline stages 2–8 skipped, `runTool()` executes directly.
- `"Can you walk me through your resume?"` → **no longer** returns `'resume'` here (that label is removed from this function); returns `null`, proceeds to Stage 2, where `buildQuestionFrame()` classifies it as `questionType: 'Experience'`.
- A 400-word pasted job description → `'jd-match'`, routed straight to `providers.js`'s `_jdMatchResponse()`, pipeline stages 2–8 skipped (unchanged from today — job descriptions are not questions and should not be forced through question-understanding).

---

### Stage 2 — Question Understanding

**Purpose.** Answer three questions about the utterance *before* any knowledge lookup happens: **what kind of question is this** (`questionType`), **who is it fundamentally about** (`subject`), and **does answering it honestly require citing evidence, or can it be answered from the assistant's own self-model** (`requiresEvidence`). This is the direct fix for Cluster A (third-person/second-person phrasing) and Cluster C (fragmented intent) from `docs/REASONING_ENGINE_PLAN.md` — instead of twenty regexes each independently guessing a person and a topic, one stage resolves grammatical subject once, then classifies type against that resolved subject.

**Inputs.**
| Input | Type | Source |
|---|---|---|
| `query` | `string` | The (already pronoun-context-aware, see Stage 4 note) user utterance |
| `ctx.discourse` | `DiscourseState` | Previous turn's `lastQuestionFrame` and `focusEntities`, for ellipsis ("what about Docker?" inherits the previous turn's `questionType`) |

**Outputs.** One `QuestionFrame` (§3.1).

**Responsibility.** `conversation.js`'s `buildQuestionFrame()` (renamed/evolved from `analyzeStrategy()` — see §8.2). Owns: greeting/identity detection, subject resolution (2nd vs. 3rd person, "you" vs. "he/Sudhanshu"), `questionType` classification, polarity detection, ellipsis inheritance from `DiscourseState`.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| Ambiguous subject ("is he good at this?" with no antecedent) | No prior `focusEntities` in discourse and no explicit name in query | `subject: 'ambiguous'`; downstream stages must degrade gracefully — Evidence Selection returns no scoped evidence, Response Planning must include a `HonestDecline`-shaped clarifying question, never a guess. |
| Two question types both plausible ("what's the weakest part of your stack?" is both `TechnologyExplanation` and `Limitation`) | Regex classification order matters | This spec fixes classification **priority order** explicitly in §3.1's construction rule — `Limitation`/`Behavioral` checks run before generic `TechnologyExplanation`, mirroring the existing `analyzeStrategy()` ordering convention of most-specific-first. |
| Ellipsis inheritance grabs the wrong prior frame | `DiscourseState.lastQuestionFrame` is more than 1 turn stale (visitor changed topic without a pronoun cue) | `lastQuestionFrame` is only inherited when the current utterance is syntactically a fragment (no verb, <=4 tokens, or starts with "what about"/"and"/"how about") — see `QuestionFrame.source: 'discourse-inherited'` gating rule in §3.1. |

**Examples.**
- `"Does he know Kubernetes?"` → `{ questionType: 'SkillVerification', subject: 'sudhanshu', polarity: 'neutral', requiresEvidence: true }`.
- `"What about Django?"` (previous turn was `"Do you know Flask?"`, `questionType: 'SkillVerification'`) → inherits `questionType: 'SkillVerification'`, `source: 'discourse-inherited'`.
- `"What's your biggest weakness?"` → `{ questionType: 'Limitation', subject: 'sudhanshu', polarity: 'challenge', requiresEvidence: false }` — a `Limitation` answer is drawn from persona self-model content, not from a knowledge-base retrieval.
- `"Are you even real or just canned responses?"` → `{ questionType: 'Identity', subject: 'assistant', polarity: 'challenge', requiresEvidence: false }`.

---

### Stage 3 — Entity Resolution

**Purpose.** Identify every technology, project, or concept named or implied in the utterance, and classify each one's **ownership** relative to Sudhanshu's actual profile. This is the direct fix for Cluster B (skill-verification questions about unowned technologies falling through to generic retrieval instead of an honest, specific "I haven't used that" answer).

**Inputs.**
| Input | Type | Source |
|---|---|---|
| `query` | `string` | Same utterance passed to Stage 2 |
| `questionFrame` | `QuestionFrame` | Stage 2's output — used only to decide *how many* entities to look for (e.g. `Comparison` expects ≥2), never to change *how* matching works |
| `ctx.discourse.focusEntities` | `ResolvedEntity[]` | For pronoun/ellipsis fallback when the query itself names no entity |

**Outputs.** One `EntityResolutionSet` (§3.2), containing zero or more `ResolvedEntity` (§3.2).

**Responsibility.** `entities.js`'s `resolveEntities()`. Owns: matching against `SKILLS_TAXONOMY` (from `content.js`, unchanged) and `PROJECTS` (from `knowledge.js`'s `getAllProjects()`, unchanged), assigning `ownership` (`'owned' | 'gap' | 'unknown'`) per matched technology, and falling back to `focusEntities` when the query has zero matches but the `QuestionFrame` indicates a continuation.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| A technology is named but not in `SKILLS_TAXONOMY` at all (neither owned nor tracked gap) | Taxonomy is necessarily finite | `ownership: 'unknown'` (distinct from `'gap'` — `'gap'` means "known to be absent," `'unknown'` means "no data either way"); Response Planning must render these as an honest "I don't have information about X" rather than a confident gap disclosure. |
| Alias collision (e.g. "Go" the language vs. "go" the common verb) | Short/common-word aliases | Unchanged mitigation from today's `matchTaxonomyEntities`: word-boundary regex matching plus a minimum-alias-length heuristic; this spec does not change the matching algorithm, only its output shape and callers. |
| Multi-entity question resolves only 1 entity | Second entity phrased unusually ("the JS framework from Facebook" instead of "React") | Accepted limitation, unchanged from today; not one of the 8 targeted clusters. Response Planning degrades a would-be `Comparison` block to a single-entity `TechnologyExplanation` when `entities.length < 2`. |

**Examples.**
- `"Do you know AWS?"` → one `ResolvedEntity`: `{ type: 'tech', canonical: 'AWS', surfaceForm: 'AWS', ownership: 'gap', confidence: 'high' }`.
- `"Compare Django and Flask"` → two `ResolvedEntity` records, both `ownership: 'owned'`.
- `"What about Terraform?"` with no `SKILLS_TAXONOMY` entry for Terraform → `{ type: 'tech', canonical: 'Terraform', surfaceForm: 'Terraform', ownership: 'unknown', confidence: 'medium' }` (matched as a plausible technology name by a generic capitalized-noun heuristic, but absent from the taxonomy — see `source: 'unrecognized'` in §3.2).

---

### Stage 4 — Conversation Context

**Purpose.** Read the persisted `DiscourseState` to fill in what the current turn leaves implicit (pronouns, fragment continuations, "and the other one?"), and, at the end of the turn, write the new `DiscourseState` back for the next turn. This is the direct fix for Cluster D (memory only tracked `lastProject`/`activeTopic` as scalars, not enough to resolve genuine ellipsis) and formalizes the ad hoc pronoun-rewrite hack in today's `resolveContext()`.

**Inputs (read half, runs before Stage 5).**
| Input | Type | Source |
|---|---|---|
| `memory.discourse` | `DiscourseState` | Persisted from the previous turn (see §6) |
| `questionFrame` | `QuestionFrame` | Stage 2 output |
| `entities` | `EntityResolutionSet` | Stage 3 output |

**Outputs (read half).** A **resolution note**, not a new structure: if `entities.entities` is empty and the query contains an antecedent pronoun (`it`, `that`, `this`, `its`, `the second one`, etc.), Stage 4 supplies `discourse.focusEntities` as the effective entity list for Stages 5–7. This is a read-time substitution, not a mutation of Stage 3's output — `entities.js`'s own return value is never edited after the fact; `assistant.js` (the orchestrator) decides, when calling Stage 5, whether to pass Stage 3's `entities` or `discourse.focusEntities`.

**Inputs (write half, runs after Stage 7).**
| Input | Type | Source |
|---|---|---|
| `questionFrame` | `QuestionFrame` | Stage 2 output (becomes next turn's `lastQuestionFrame`) |
| `entities` | `EntityResolutionSet` | Stage 3 output (becomes next turn's `focusEntities`, replacing the prior value) |
| `responsePlan.kind` | `string` | Used to populate `pendingResult` when the turn was a JD-match or interview-summary (see §3.3.1) |

**Outputs (write half).** An updated `DiscourseState` persisted into `memory.discourse` (see §6.3).

**Responsibility.** `memory.js`. The read half is a new exported function `memory.resolveFocusEntities(entities, questionFrame)`; the write half is a new exported function `memory.updateDiscourse(questionFrame, entities, responsePlan)`, called once per turn from `assistant.js`, immediately after Stage 7 and before Stage 8 begins rendering (ordering does not affect rendering, but keeps all state writes grouped before all rendering side effects, per the Plan's Risk R4 concurrency note).

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| `focusEntities` from 3 turns ago incorrectly reused | Visitor asked two unrelated questions in a row without pronouns, but a later fragment ("and that?") is ambiguous about which prior topic it refers to | `focusEntities` is fully overwritten every turn that resolves ≥1 entity of its own (not merged/appended); a fragment can only ever inherit the *immediately preceding* turn's focus, never older history. This is a deliberate simplicity choice — see §10 Out of Scope, "multi-topic focus stacks." |
| `pendingResult` referenced after it is no longer relevant (JD-match result mentioned 10 turns later as if still active) | No expiry | `pendingResult.expiresAfterTurns` (default 3) is decremented on every `updateDiscourse()` call and the field is cleared at 0 — see §3.3.1. |

**Examples.**
- Turn 1: `"Tell me about Nova."` → `focusEntities: [{type:'project', canonical:'nova', ...}]` written.
- Turn 2: `"What database does it use?"` → Stage 3 resolves zero entities from the text itself (no name mentioned) but detects the pronoun `it`; Stage 4 supplies `focusEntities` from Turn 1 as the effective scope for Evidence Selection.

---

### Stage 5 — Evidence Selection

**Purpose.** Retrieve the knowledge that will back the answer, scoped by what Stage 2–4 already know about the question — instead of the keyword-similarity race across the *entire* knowledge base that decides today's routing by accident. This is the direct fix for Cluster E (document-kind routing collisions, e.g. a stack question outscoring a project's own architecture doc) and Cluster F (retrieval blind to entity ownership, so a gap technology returns "no relevant docs" instead of a reasoned gap answer).

**Inputs.**
| Input | Type | Source |
|---|---|---|
| `query` | `string` | The utterance (pronoun-enriched exactly as today, if Stage 4 substituted an antecedent) |
| `questionFrame.questionType` | `string` | Stage 2 |
| `entities` | `ResolvedEntity[]` | Stage 3 (or Stage 4's substitution) |

**Outputs.** One `EvidenceSet` (§3.4).

**Responsibility.** `knowledge.js`'s new `buildEvidenceSet()`, built on top of the **unchanged** `retrieve()` plus a new, additive `retrieveScoped()` (see §4.4). Owns: filtering candidate docs by `questionType`-to-`doc.kind` affinity before scoring (not instead of scoring — affinity narrows the candidate pool, the existing token/stem scorer still ranks within it), and populating `gapNotes` directly from any `entities` with `ownership: 'gap'` or `'unknown'` without needing a retrieval hit at all.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| Affinity filter excludes the one doc that actually answers the question | `questionType`→`doc.kind` affinity table is a heuristic, not exhaustive | Affinity **narrows preference, never excludes absolutely**: if the affinity-preferred subset scores below a floor (mirrors today's `score > 0.5` cutoff), Evidence Selection falls back to the full unscoped candidate pool. This fallback is a hard requirement, not an optimization — it is what prevents this stage from being a stricter, more brittle version of today's routing. |
| `gapNotes` populated for a technology that actually IS owned, because `entities.js` mis-scored ownership | Alias ambiguity (Stage 3 failure mode) | `EvidenceSet.gapNotes` is only trusted by Response Planning at the confidence tier the entity itself carried (`ResolvedEntity.confidence`); a `'low'`-confidence gap note is downgraded to `HonestDecline` phrasing ("I'm not sure") rather than a confident `GapDisclosure` ("I haven't worked with X"). |

**Examples.**
- `questionType: 'TechnologyExplanation'`, entity `{canonical: 'Docker', ownership: 'owned'}` → `retrieveScoped()` prefers docs with `kind: 'stack'` or `kind: 'project'` mentioning Docker; returns `primaryFacts` citing the specific project(s) using Docker.
- `questionType: 'SkillVerification'`, entity `{canonical: 'Kubernetes', ownership: 'gap'}` → no retrieval call is even needed to answer honestly; `gapNotes: ["Kubernetes is not part of Sudhanshu's shipped project history."]`, `primaryFacts: []`.

---

### Stage 6 — Confidence

**Purpose.** Make explicit, as a first-class value, how sure the pipeline is about the evidence it is about to answer with — so Response Planning can phrase a confident "no" ("I haven't used Kubernetes") differently from an honest "not sure" ("I don't have enough detail on that to answer well"). This is the direct fix for Cluster F's second half (today, "confidently nothing exists" and "the fact is thin/ambiguous" produce the same generic fallback text).

**Inputs.**
| Input | Type | Source |
|---|---|---|
| `evidence` | `EvidenceSet` | Stage 5 |
| `entities` | `ResolvedEntity[]` | Stage 3/4 |

**Outputs.** One `ConfidenceAssessment` (§3.5).

**Responsibility.** `entities.js`'s new `assessConfidence()` (co-located with entity ownership logic because confidence is, for most question types, a direct function of `ResolvedEntity.confidence` and `EvidenceSet.scoreGap` — no separate module is justified for one small pure function; see §8.1 for why this was not made its own file).

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| High confidence assigned to a thin, single, low-score match | `scoreGap` alone is not the whole picture when there is only one candidate to begin with | Confidence tier considers **both** `scoreGap` (top score minus runner-up) **and** absolute top score, not just the gap; a lone low-absolute-score match is capped at `'medium'` regardless of gap. |
| `'ambiguous'` tier never actually used | Overly permissive fallback logic defaults everything to `'medium'` | `'ambiguous'` is a required, tested branch (exercised explicitly by the Stage 6 validation step in §9): triggered specifically when 2+ evidence candidates score within 5% of each other AND `entities.length >= 2` with comparable salience — i.e., a genuine multi-way tie, not just retrieval noise. |

**Examples.**
- Single owned entity, one strong doc match, no competing doc within 20% score → `{ tier: 'high', basis: 'entity-ownership' }`.
- `entities: []`, `evidence.primaryFacts: []`, no gap notes either → `{ tier: 'low', basis: 'no-evidence' }` — this is the exact case that must produce `_fallback()`'s honest "I don't have that information" rather than an invented answer.

---

### Stage 7 — Response Planning

**Purpose.** Decide *what the answer is made of* — which `ResponseBlock`s, in which order — as data, before any markdown string exists. This is the direct fix for Cluster G (response shape hardcoded per-intent inside `providers.js`, so every new phrasing nuance required a new bespoke method) and Cluster H (recruiter framing/gap disclosure/self-model logic duplicated across multiple `_xResponse` methods with near-identical but not-quite-consistent wording).

**Inputs.** `questionFrame`, `entities`, `discourse` (read-only, for `pendingResult`/`sessionFacts` context), `evidence`, `confidence`, plus the existing `ctx` fields already passed into `provider.generate()` today (`visitorProfile`, `memory`, `focusProject`, `awarenessContext`).

**Outputs.** One `ResponsePlan` (§3.6), containing an ordered `ResponseBlock[]` (§3.6).

**Responsibility.** New module `planning.js`'s `buildResponsePlan()`. Owns: selecting which blocks apply (a `Recruiter`-typed question with `confidence.tier: 'high'` gets `[DirectAnswer, Evidence, RecruiterFraming, FollowupHint]`; the same question with `confidence.tier: 'low'` gets `[HonestDecline, FollowupHint]`), and ordering them. Does **not** own markdown formatting, phrase-variant selection text, or DOM/card rendering — that is Stage 8.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| Plan contains a block type Response Composition doesn't know how to render | New block type added to `planning.js` without a matching renderer in `providers.js` | `providers.js`'s block dispatcher (§4.7) throws a caught, logged error and falls back to rendering the block's `data.text` field as plain text if present, else drops the block silently — never a hard crash on an unrecognized block. Block types are a closed, versioned list (§7); adding one is a two-file change (this spec + `providers.js`), never a silent one-file addition. |
| Every question types into a giant plan with 6+ blocks, producing walls of text (regression on `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s "concise by default" principle) | No plan-size discipline | Plans are capped at 4 blocks for a single-topic question (`DirectAnswer` + at most 2 supporting blocks + optional `FollowupHint`, which does not render inline — see §7.10); a 5th block requires a `Comparison`- or multi-entity-shaped question, an explicit, logged exception, not a default. |

**Examples.**
- `{questionType: 'SkillVerification', subject:'sudhanshu'}`, entity `{ownership:'gap', confidence:'high'}` → `[DirectAnswer(negative), GapDisclosure]`.
- `{questionType: 'Recruiter'}`, `confidence.tier: 'high'`, `focusProject` set → `[DirectAnswer, Evidence, RecruiterFraming, FollowupHint]`.

---

### Stage 8 — Response Composition

**Purpose.** Turn the `ResponsePlan`'s blocks into the final markdown string (and any card `payload`) that today's rendering layer (`renderer.js`, `streaming.js`) already knows how to display, completely unchanged.

**Inputs.** One `ResponsePlan` (§3.6). Also: `ctx.memory` (for phrase-variant de-duplication via the existing `hasUsedPhrase`/`markPhraseUsed`, unchanged) and `ctx.visitorProfile` (for phrasing tone, unchanged).

**Outputs.** The existing, unchanged response contract already consumed by `assistant.js`: `{ text: string, sources: doc[], kind: string, payload: object|null }`.

**Responsibility.** `providers.js`. Owns: per-block-type markdown rendering, phrase-variant selection (`_pickVariant`, unchanged), citation list assembly (`sources`), and populating `kind`/`payload` for rich cards (`project-card`, `comparison`) exactly as today.

**Failure Modes.**
| Failure | Cause | Mitigation |
|---|---|---|
| Block-to-markdown rendering loses today's carefully-tuned phrasing variety (`_pickVariant`, recruiter-relevance sentences) | A naive rewrite discards existing per-`_xResponse`-method prose | §8.3's per-method disposition table moves each method's **prose content** into its new block-renderer home verbatim — this is a relocation of existing strings/logic, not a rewrite of the copy. |
| `sources` array diverges from what `EvidenceSet` actually cited (a block mentions a project that isn't in `sources`) | Composition renders block `data` independently of `EvidenceSet` | Composition derives `sources` **from the `EvidenceSet` embedded in the plan** (`ResponsePlan.sourcesOverride` when explicitly set, otherwise every doc referenced by any `Evidence`-type block's `data.facts`), never from a separately hand-maintained list. |

**Examples.**
- Plan `[DirectAnswer(negative), GapDisclosure]` for "Do you know Kubernetes?" → text: *"I haven't worked with Kubernetes directly. My container-orchestration experience is Docker and Docker Compose across [Nova] and [Aegis] — happy to talk through how I'd ramp up on k8s if that's relevant to the role."* `sources: []` (no doc backs a negative claim), `kind: 'text'`.

---

## 2. Enum Reference (used across §3)

Defined once here; every data structure below references these by name rather than re-listing values.

**`QuestionType`** — adopted verbatim from `docs/AI_EVALUATION_SUITE.md` §3 ("Question Types"), minus the two values (`Navigation`, `Tool`) that never reach Stage 2 because the Command Gate intercepts them first:

`'Identity' | 'Greeting' | 'Capability' | 'TechnologyExplanation' | 'ArchitectureExplanation' | 'ProjectExplanation' | 'Comparison' | 'Opinion' | 'Recommendation' | 'SkillVerification' | 'Experience' | 'EvidenceRequest' | 'Recruiter' | 'Behavioral' | 'Career' | 'Limitation' | 'Conversation' | 'Unknown'`

**`Subject`** — `'sudhanshu' | 'assistant' | 'ambiguous'`. Resolves the Cluster A failure: every second-person ("you," "your") or third-person ("he," "his," "Sudhanshu") phrasing collapses to exactly one of the first two values before any `QuestionType` classification runs.

**`Polarity`** — `'neutral' | 'challenge'`. `'challenge'` covers both skepticism directed at the assistant ("are you just canned responses?") and negative framing directed at Sudhanshu ("what's he bad at?") — both require the same downstream posture (answer directly and specifically, do not get defensive, do not over-hedge).

**`Ownership`** — `'owned' | 'gap' | 'unknown'`. `'owned'`: present in `SKILLS_TAXONOMY`/`PROJECTS` as something Sudhanshu has used. `'gap'`: present in `SKILLS_TAXONOMY` explicitly as a tracked-but-unowned skill (per `docs/content.js`'s existing convention of listing common JD-requested skills that are not owned, for exactly this purpose). `'unknown'`: not present in the taxonomy at all — no data either way.

**`ConfidenceTier`** — `'high' | 'medium' | 'low' | 'ambiguous'`.

**`EntityType`** — `'tech' | 'project' | 'concept'`. (`'concept'` covers non-product nouns the taxonomy may later track, e.g. "microservices," "REST" — present in the enum for forward-compatibility; §10 Out of Scope notes that concept-matching beyond what `SKILLS_TAXONOMY` already covers is not built in this phase.)

---

## 3. Data Structures

Every structure below lists: **Produced by** (the single stage/function that creates it), **Read by** (every permitted caller), and a field table. Fields are listed in the order a renderer/consumer would most naturally need them, not alphabetically.

### 3.1 `QuestionFrame`

**Produced by:** `conversation.js` → `buildQuestionFrame()` (Stage 2).
**Read by:** `entities.js` (Stage 3, to size expected entity count), `memory.js` (Stage 4, read+write of `discourse.lastQuestionFrame`), `knowledge.js` (Stage 5, affinity filtering), `planning.js` (Stage 7, primary driver of block selection), `assistant.js`'s `buildFollowups()` (reads `questionType` in place of today's `strategy.move`).
**Not read by:** `providers.js` never reads a raw `QuestionFrame` field to make a rendering decision directly — it only renders whatever `ResponseBlock`s Stage 7 already decided on. (Exception: `_pickVariant`-style phrase de-duplication may key off `questionType` as a cache key — this is phrasing-variety bookkeeping, not a planning decision, and is allowed.)

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `questionType` | `QuestionType` | Required | The classified reasoning category. | `'SkillVerification'` |
| `subject` | `Subject` | Required | Who the question is fundamentally about. | `'sudhanshu'` |
| `polarity` | `Polarity` | Required | Whether the question is neutrally posed or adversarial/negative-seeking. | `'neutral'` |
| `requiresEvidence` | `boolean` | Required | `true` if an honest answer must cite portfolio evidence; `false` if the assistant's persona/self-model alone can answer honestly. | `true` |
| `scope` | `'portfolio' \| 'project' \| 'tech' \| null` | Optional | Disambiguates breadth for `ArchitectureExplanation`/`Comparison` types only; `null`/absent for all other types. | `'project'` |
| `template` | `string \| null` | Optional | A canonical "question shape" key, set only when the frame was produced by a specific named resolver (comparison/opinion/experience), used for `docs/AI_EVALUATION_SUITE.md`-style regression tagging. | `'tech-vs-tech'` |
| `confidence` | `ConfidenceTier` (only `'high' \| 'medium' \| 'low'` used here) | Required | Stage 2's own confidence in *this classification* — independent of Stage 6's evidence confidence. | `'high'` |
| `source` | `'regex-match' \| 'discourse-inherited' \| 'default-factual'` | Required | How the frame was derived; `'discourse-inherited'` frames were copied from `DiscourseState.lastQuestionFrame` because the current utterance was a bare fragment. | `'regex-match'` |
| `rawQuery` | `string` | Required | The exact input string Stage 2 classified (post pronoun-enrichment from Stage 4 of the *previous* turn, pre-enrichment for the current turn — Stage 2 runs before the current turn's Stage 4). | `"Does he know Kubernetes?"` |

**Construction rule for `subject`:** resolved by a single shared subject-detector run once per turn, before any `questionType` regex runs (this is the concrete mechanism that fixes Cluster A). Second-person pronouns/"SRIIVERSE"/"the assistant"/"you" → `'assistant'`. Third-person pronouns with an antecedent (from `discourse.focusEntities` or an explicit "Sudhanshu"/"he"/"his") → `'sudhanshu'`. No pronoun, no name, a bare technology/project question ("is Docker good for this?") → `'sudhanshu'` by default (the overwhelming majority case per `docs/AI_EVALUATION_SUITE.md`'s question distribution). No resolvable antecedent at all → `'ambiguous'`.

**Construction rule for `questionType` (priority order):** classification runs as an ordered chain of checks, first match wins — the exact same "most-specific-first" convention `analyzeStrategy()` already uses today for `GREETING_RE`/`IDENTITY_RE`/`COMPARISON_RE`/`OPINION_RE`/`EXPERIENCE_RE`, extended to the full enum:

1. `Greeting` (unchanged `GREETING_RE`)
2. `Identity` (unchanged `IDENTITY_RE`, now also true when `subject: 'sudhanshu'` and the phrasing is "who is Sudhanshu"/"tell me about him")
3. `Comparison` (unchanged `COMPARISON_RE` + Stage 3's `multiEntity: true`)
4. `Behavioral` / `Career` / `Limitation` (new checks, run before the generic technology checks below **specifically because** "what's your biggest weakness" and "what technologies are you weakest in" must not both fall into `TechnologyExplanation`)
5. `Opinion` (unchanged `OPINION_RE`)
6. `Experience` (unchanged `EXPERIENCE_RE`)
7. `SkillVerification` (new — "do you know X" / "have you used X" phrasing, distinct from `TechnologyExplanation`'s "how does X work" phrasing)
8. `Recruiter` (the semantic branch absorbed from `classifyIntent()`'s old `'recruiter'` label)
9. `ArchitectureExplanation` (absorbed from `classifyIntent()`'s old `'architecture'` label)
10. `ProjectExplanation` (absorbed from `classifyIntent()`'s old `'project'` label)
11. `TechnologyExplanation` (absorbed from `classifyIntent()`'s old `'stack'` label — now the catch-all for technology questions that didn't match 4 or 7 above)
12. `Recommendation`, `EvidenceRequest`, `Conversation` (new, narrow-pattern checks for "what should I look at first," "prove it," and pure navigation-adjacent chit-chat that isn't a `Greeting`)
13. `Unknown` (default — absorbed from `classifyIntent()`'s old `'question'` fallback)

### 3.2 `ResolvedEntity` and `EntityResolutionSet`

**Produced by:** `entities.js` → `resolveEntities()` (Stage 3).
**Read by:** `memory.js` (Stage 4, becomes next turn's `focusEntities`), `knowledge.js` (Stage 5), `entities.js`'s own `assessConfidence()` (Stage 6 — same module, different function), `planning.js` (Stage 7), `jdmatch.js` (reuses the same resolver — see §4.1 and §4.10).

**`ResolvedEntity`** (one match):

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `type` | `EntityType` | Required | What kind of thing was matched. | `'tech'` |
| `canonical` | `string` | Required | The canonical name — matches `SKILLS_TAXONOMY[].canonical` or a `PROJECTS[].id`. | `'Docker'` |
| `surfaceForm` | `string` | Required | The literal substring matched in the query (may differ from `canonical` via an alias). | `"containerize"` |
| `ownership` | `Ownership` | Required for `type: 'tech'`; `'owned'` always for `type: 'project'` and `type: 'concept'` | Ownership status. | `'owned'` |
| `confidence` | `ConfidenceTier` (only `'high' \| 'medium' \| 'low'`) | Required | Match confidence — `'low'` for fuzzy/partial alias matches, `'high'` for exact canonical-name matches. | `'high'` |
| `source` | `'taxonomy' \| 'project-list' \| 'discourse-inherited' \| 'unrecognized'` | Required | Where the match came from. `'unrecognized'` marks a plausible-looking technology name (capitalized noun heuristic) with no taxonomy entry — always paired with `ownership: 'unknown'`. | `'taxonomy'` |

**`EntityResolutionSet`** (the full Stage 3 output):

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `entities` | `ResolvedEntity[]` | Required (may be empty `[]`) | Every match found, in the order first mentioned. | `[{...Docker...}]` |
| `primaryEntity` | `ResolvedEntity \| null` | Required | The single most salient entity, when the question is clearly about one thing (first `entities[0]` unless a later entity has strictly higher `confidence`). `null` when `entities` is empty or genuinely multi-way (`Comparison`). | `{...Docker...}` |
| `multiEntity` | `boolean` | Required | `true` when `entities.length >= 2` with no dominant `primaryEntity` — the signal `planning.js` uses to prefer a `Comparison` block over a `TechnologyExplanation` block. | `false` |

### 3.3 `DiscourseState`

**Produced by:** `memory.js` — read half via `resolveFocusEntities()`, write half via `updateDiscourse()` (Stage 4), persisted as `memory.discourse`.
**Read by:** `conversation.js` (Stage 2, `lastQuestionFrame` for ellipsis), `entities.js` (Stage 3, `focusEntities` for pronoun fallback), `planning.js` (Stage 7, `pendingResult`/`sessionFacts` for continuity-aware phrasing), `assistant.js`'s `buildFollowups()` (reads `pendingResult` to avoid re-suggesting a JD-match right after one just ran).
**Not read by:** `providers.js` does not read `DiscourseState` directly — anything it needs from discourse arrives already folded into the `ResponsePlan` by Stage 7.

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `lastQuestionFrame` | `QuestionFrame \| null` | Required | The immediately preceding turn's frame. `null` at session start. | `{questionType:'SkillVerification',...}` |
| `focusEntities` | `ResolvedEntity[]` | Required (default `[]`) | The immediately preceding turn's resolved entities — fully replaced each turn that resolves ≥1 entity (see Stage 4 failure-mode note; never merged across turns). | `[{canonical:'Nova',type:'project',...}]` |
| `pendingResult` | `PendingResult \| null` | Optional | Set immediately after a JD-match or interview session ends; `null` otherwise. | see §3.3.1 |
| `sessionFacts` | `object` | Required (default `{}`) | A small, bounded (max 10 keys) free-form dictionary of visitor-stated facts relevant to phrasing (e.g. `{ visitorRole: 'recruiter' }`) — deliberately loose-typed since its contents are advisory hints for Response Planning, never evidence. | `{ mentionedCompany: 'Acme Corp' }` |
| `turnsSinceUpdate` | `number` | Required | Turns elapsed since `focusEntities`/`lastQuestionFrame` last changed — used only to decide when `pendingResult` expires. | `1` |

#### 3.3.1 `PendingResult` (nested inside `DiscourseState`)

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `kind` | `'jd-match' \| 'interview-summary'` | Required | What just completed. | `'jd-match'` |
| `summary` | `string` | Required | One-line human-readable recap, for `planning.js` to reference without re-deriving it. | `"78% match, missing AWS + Kubernetes"` |
| `relatedProjectIds` | `string[]` | Required (may be `[]`) | Projects the result recommended, so a follow-up "tell me more" resolves correctly without re-mentioning the project name. | `['nova', 'aegis']` |
| `expiresAfterTurns` | `number` | Required | Countdown; decremented once per turn by `updateDiscourse()`, field cleared to `null` at 0. | `3` |

### 3.4 `EvidenceSet`

**Produced by:** `knowledge.js` → `buildEvidenceSet()` (Stage 5).
**Read by:** `entities.js`'s `assessConfidence()` (Stage 6), `planning.js` (Stage 7), `providers.js` (Stage 8, to derive `sources`).

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `primaryFacts` | `EvidenceFact[]` | Required (may be `[]`) | The facts a `DirectAnswer`/`Evidence` block will cite. | see §3.4.1 |
| `supportingDocs` | `{ doc: object, score: number }[]` | Optional | The raw `knowledge.js` doc-score pairs (today's existing `retrieve()` return shape, unchanged), kept for citation-list assembly and rich-card `payload` construction. | `[{doc:{...}, score:3.2}]` |
| `gapNotes` | `string[]` | Optional (present only when ≥1 entity has `ownership: 'gap'` or `'unknown'`) | Pre-composed, evidence-free statements of absence, one per non-owned entity. | `["Kubernetes is not part of Sudhanshu's shipped project history."]` |
| `scoreGap` | `number \| null` | Optional | Top-candidate score minus runner-up score, from `supportingDocs`; `null` when fewer than 2 candidates. Feeds Stage 6. | `1.8` |
| `queryTokens` | `string[]` | Optional | Tokenized query, retained for debugging/trace logging only — never used by Response Planning. | `['docker','container']` |

#### 3.4.1 `EvidenceFact` (nested inside `EvidenceSet`)

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `text` | `string` | Required | The fact itself, already in citable prose form. | `"Docker Compose orchestrates the Postgres + Redis + API containers in Nova."` |
| `docId` | `string \| null` | Required | The `knowledge.js` doc id this fact was drawn from, for citation linking; `null` for facts synthesized directly from `ResolvedEntity` ownership data rather than a doc (e.g. a `'gap'` fact has no doc). | `'proj-nova'` |
| `link` | `string \| null` | Optional | Deep link if the doc carries one (unchanged from today's doc shape). | `'#project-nova'` |

### 3.5 `ConfidenceAssessment`

**Produced by:** `entities.js` → `assessConfidence()` (Stage 6).
**Read by:** `planning.js` (Stage 7 — the primary consumer; confidence tier is the main branch point for which block set is chosen).

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `tier` | `ConfidenceTier` | Required | The overall confidence level for this turn's answer. | `'high'` |
| `basis` | `'entity-ownership' \| 'retrieval-score-gap' \| 'no-evidence' \| 'multi-way-tie'` | Required | Which signal dominated the tier decision — for debugging/regression triage against `docs/AI_EVALUATION_SUITE.md`'s "Hallucination Risk" column. | `'entity-ownership'` |
| `reason` | `string` | Required | One human-readable sentence explaining the tier, logged but never rendered to the visitor verbatim. | `"Single owned entity, exact taxonomy match."` |

### 3.6 `ResponsePlan` and `ResponseBlock`

**Produced by:** `planning.js` → `buildResponsePlan()` (Stage 7).
**Read by:** `providers.js` (Stage 8, the sole renderer), `assistant.js`'s `buildFollowups()` (reads `plan.kind` and any `FollowupHint` block's `data` — see §7.10).

**`ResponsePlan`:**

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `blocks` | `ResponseBlock[]` | Required (never empty — a plan with nothing to say still produces a `HonestDecline` block) | Ordered list of blocks to render. | `[{type:'DirectAnswer',...}]` |
| `kind` | `string` | Required | Mirrors today's `response.kind` contract exactly (`'text' \| 'project-card' \| 'comparison' \| 'stack-card' \| 'arch-card' \| 'resume' \| 'jd-match'`) — unchanged enum, now set by Stage 7 instead of inferred inside `providers.js`. | `'project-card'` |
| `payload` | `object \| null` | Optional | Passthrough data for rich rendering, identical shape to today's `response.payload` (`{project}`, `{projectA,projectB}`). | `{ project: {...} }` |
| `sourcesOverride` | `doc[] \| null` | Optional | When set, Stage 8 uses this exact citation list instead of deriving one from `Evidence`-type blocks. Used only by plans with no natural per-block evidence mapping (e.g. `_resumeResponse`'s multi-doc citation list). | `[{...doc}]` |

**`ResponseBlock`:**

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `type` | One of the 10 values in §7 | Required | The block's rendering behavior. | `'DirectAnswer'` |
| `data` | `object` | Required | Block-type-specific payload — exact shape defined per block type in §7 (no shared shape across types). | `{ text: '...', polarity: 'negative' }` |

### 3.7 `FollowupPlan`

**Produced by:** `assistant.js` → `buildFollowups()` (extended, unchanged call site — Stage 8+, runs after rendering, exactly as today's step 13).
**Read by:** `renderer.js`'s `renderFollowups()` (unchanged), `memory.js` (the `discourseHint` field feeds the next turn's `sessionFacts`, optionally).

| Field | Type | Req/Opt | Description | Example |
|---|---|---|---|---|
| `suggestions` | `string[]` | Required (max 3, matches today's `.slice(0,3)`) | The follow-up chip texts. | `['Show me his projects', 'Why hire him?']` |
| `rationale` | `'question-type' \| 'profile-type' \| 'pending-result' \| 'continuation' \| 'default'` | Required | Which rule produced the suggestions — `'question-type'` replaces today's `strategy.move`-keyed branch; `'pending-result'` is new, triggered when `discourse.pendingResult` is set (e.g. suggest "show me the projects that matched" right after a JD-match). | `'question-type'` |
| `discourseHint` | `string \| null` | Optional | A short topic label written forward into `sessionFacts` for the next turn's phrasing-variety logic. | `'docker-followup'` |

### 3.8 `PipelineContext` (the connective object, not new — documented for completeness)

This is **not a new structure**; it is today's existing `ctx` object passed into `provider.generate(query, ctx)`, expanded with the new fields this spec introduces. Every field already in today's `ctx` (`memory`, `intent`, `focusProject`, `awarenessContext`, `visitorProfile`) is unchanged and required exactly as today.

| New field | Type | Req/Opt | Description |
|---|---|---|---|
| `questionFrame` | `QuestionFrame` | Required | Replaces `ctx.strategy` (renamed — see §8.2). |
| `entities` | `EntityResolutionSet` | Required | Stage 3 output. |
| `evidence` | `EvidenceSet` | Required | Stage 5 output. |
| `confidence` | `ConfidenceAssessment` | Required | Stage 6 output. |

---

## 4. Module Contracts

Every module in `src/assistant/` plus `src/assistant.js` and `src/content.js`, in the order a reviewer should read them (new modules first, then extended, then unchanged).

### 4.1 `assistant/entities.js` (NEW)

**Public API:**

| Export | Signature (described, not coded) | Returns |
|---|---|---|
| `resolveEntities` | Takes `query: string` and an options object `{ hint?: QuestionFrame }` | `EntityResolutionSet` (§3.2) |
| `assessConfidence` | Takes `evidence: EvidenceSet`, `entities: ResolvedEntity[]` | `ConfidenceAssessment` (§3.5) |
| `matchTaxonomyEntities` | Takes `text: string`, options `{ normalized?: boolean }` — **identical signature to today's `jdmatch.js` export, relocated here** | `string[]` of canonical names (unchanged shape, for backward compatibility — see §8.1) |

**Internal helpers (not exported):** the taxonomy/alias matching loop, the capitalized-noun "plausible unrecognized technology" heuristic, the ownership lookup against `SKILLS_TAXONOMY`.

**Dependencies:** `content.js` (`SKILLS_TAXONOMY`), `knowledge.js` (`getAllProjects()`, for `type: 'project'` matches).

**Who can call it:** `conversation.js` (Stage 2, for entity-count hints only — does not call `resolveEntities` itself, only reads `QuestionFrame`-shaping signals), `assistant.js` (Stage 3 orchestration call), `jdmatch.js` (`analyzeJobDescription()` calls `resolveEntities`/`matchTaxonomyEntities` directly), `planning.js` (Stage 7, reads `ResolvedEntity[]` already resolved — does not re-call `resolveEntities`).

**Who cannot call it:** `providers.js` must never call `resolveEntities()` directly — entity resolution happens once per turn in Stage 3, before Response Composition; if `providers.js` needs entity data it must come from the `ResponsePlan`/`ctx.entities` already threaded through, never a fresh resolve (this is what prevents Cluster C's "each method re-derives its own entities slightly differently" from recurring). `interview.js` must never call it — interview question selection is unrelated to portfolio entity resolution and pulling this dependency in would violate the provider-agnostic/UI-agnostic boundary set for `interview.js` in Sprint 3.

**Side effects:** none. Pure functions — no `memory` reads, no DOM, no `sessionStorage`.

### 4.2 `assistant/planning.js` (NEW)

**Public API:**

| Export | Signature (described) | Returns |
|---|---|---|
| `buildResponsePlan` | Takes `questionFrame: QuestionFrame`, `entities: EntityResolutionSet`, `discourse: DiscourseState`, `evidence: EvidenceSet`, `confidence: ConfidenceAssessment`, and the existing `ctx` object (`visitorProfile`, `memory`, `focusProject`, `awarenessContext`) | `ResponsePlan` (§3.6) |

**Internal helpers (not exported):** one block-selection function per `questionType` branch (mirrors, structurally, the disposition of today's `providers.js` `_xResponse` methods — see §8.3's exact mapping), a shared "recruiter framing applies?" predicate (`ctx.visitorProfile.type === 'recruiter'`, unchanged condition from today's `_recruiterRelevance`), a shared plan-size cap enforcer (the "≤4 blocks" rule from Stage 7's failure-mode table).

**Dependencies:** none on other `assistant/*` modules beyond the types passed in as arguments — `planning.js` receives everything it needs as parameters and does not import `knowledge.js`, `entities.js`, or `memory.js` itself. This is a deliberate design constraint: Response Planning decides shape from already-computed inputs, it does not go fetch more evidence or re-resolve entities mid-plan. (It may import `persona.js` for self-model content used by `SelfModel`/`Limitation`/`Career` blocks — see §4.6.)

**Who can call it:** `assistant.js` only (Stage 7 orchestration call).

**Who cannot call it:** `providers.js` must never call `buildResponsePlan()` — Response Composition consumes an already-built plan, it does not build one for itself (this is the exact boundary that prevents Cluster G/H from recurring: if `providers.js` could build its own plan on the side, the "one place decides response shape" invariant is broken). `jdmatch.js` and `interview.js` must never call it — job-description analysis and interview-turn handling have their own, separate response-shaping conventions (`analyzeJobDescription()`'s structured result, `interview.handleTurn()`'s own rendering contract) that are explicitly out of scope for this pipeline (see §10).

**Side effects:** none. Pure function of its inputs.

### 4.3 `assistant/conversation.js` (EXTENDED)

**Public API:**

| Export | Change | Signature (described) | Returns |
|---|---|---|---|
| `buildQuestionFrame` | **Renamed** from `analyzeStrategy` (see §8.2) | Takes `query: string`, `ctx: { intent, focusProject, memory, awareness }` — same parameter shape as today's `analyzeStrategy` | `QuestionFrame` (§3.1) |

**Internal helpers (not exported, retained from today, behavior unchanged):** `GREETING_RE`, `IDENTITY_RE`, `COMPARISON_RE`, `OPINION_RE`, `EXPERIENCE_RE`, `emptyStrategy()`, `resolveComparison()`, `resolveOpinion()`, `resolveExplanation()`. **New internal helpers:** the subject-detector (§3.1's construction rule), five new regexes for `Behavioral`/`Career`/`Limitation`/`SkillVerification`/`Recruiter`/`ArchitectureExplanation`/`ProjectExplanation` (absorbed from `classifyIntent()`, relocated verbatim as regex patterns — not rewritten, just moved).

**Dependencies:** `knowledge.js` (`getAllProjects()`, unchanged), `entities.js` (replaces today's `jdmatch.js` import for `matchTaxonomyEntities` — see §8.1).

**Who can call it:** `assistant.js` only (Stage 2 orchestration call). Nothing else calls this function today either.

**Who cannot call it:** `providers.js` never calls `buildQuestionFrame()` — it only reads the `QuestionFrame` already placed on `ctx` (unchanged from today's relationship with `analyzeStrategy`/`ctx.strategy`).

**Side effects:** none. Pure function (reads `ctx.memory`/`ctx.awareness` as plain data, does not mutate them).

### 4.4 `assistant/knowledge.js` (EXTENDED)

**Public API (unchanged exports, listed for completeness):** `retrieve(query, limit)`, `getDoc(id)`, `getProject(id)`, `getAllProjects()`, `getStack()`, `getArchitecture()`, `getProfile()`, `resolveProject(ref)` — every signature and return shape exactly as today; zero call sites need to change for these.

**Public API (new exports):**

| Export | Signature (described) | Returns |
|---|---|---|
| `retrieveScoped` | Takes `query: string`, options `{ limit?: number, entities?: ResolvedEntity[], questionType?: QuestionType }` | `{ doc, score }[]` — **identical element shape to `retrieve()`'s return**, just a different, smarter candidate set |
| `buildEvidenceSet` | Takes `query: string`, `questionFrame: QuestionFrame`, `entities: ResolvedEntity[]` | `EvidenceSet` (§3.4) |

**Internal helpers (not exported):** `tokenize()`, `stem()`, `scoreDoc()`, `addDoc()` (all unchanged from today) plus one new helper: a `questionType`→`doc.kind` affinity table (a small static lookup, not a function with independent logic) used by `retrieveScoped()` to bias, never exclude, candidate ordering (per Stage 5's failure-mode mitigation).

**Dependencies:** `content.js` (unchanged — `PROJECTS`, `STACK`, `ARCHITECTURE`, `PROFILE`, `ASSISTANT_KB`).

**Who can call it:** `providers.js` (still calls unchanged `retrieve()` directly in the handful of places that don't yet need scoping — see §8.3), `assistant.js` (Stage 5 orchestration call to `buildEvidenceSet()`), `jdmatch.js` (unchanged — uses `getAllProjects()`/`getStack()` for its own scoring, not `retrieve()`).

**Who cannot call it:** `entities.js` must not call `knowledge.js`'s retrieval functions (`retrieve`/`retrieveScoped`) — entity resolution is about *identifying* entities, not about *fetching evidence*; it may call only `getAllProjects()` for project-name matching, keeping the "resolve vs. retrieve" boundary clean.

**Side effects:** none beyond the existing one-time module-load-time index build (`addDoc()` calls at import time, unchanged).

### 4.5 `assistant/memory.js` (EXTENDED)

**Public API (unchanged exports, listed for completeness):** `memory.add()`, `memory.setActiveTopic()`, `memory.hasUsedPhrase()`, `memory.markPhraseUsed()`, `memory.recent()`, `memory.summaryText()` (or equivalent existing method names), `memory.lastProject`, `memory.activeTopic`, `memory.usedPhraseKeys`, `memory.profile` (`VisitorProfile` instance) — every one of these keeps its exact name, shape, and behavior; none are removed, none are renamed.

**Public API (new exports/members):**

| Export | Signature (described) | Returns / Effect |
|---|---|---|
| `memory.discourse` | A plain property (not a method), initialized to the default empty `DiscourseState` (§3.3) at construction and on `_load()` | `DiscourseState` |
| `memory.resolveFocusEntities` | Takes `entities: ResolvedEntity[]`, `questionFrame: QuestionFrame` | `ResolvedEntity[]` — either `entities` unchanged (≥1 resolved) or `this.discourse.focusEntities` (fallback) |
| `memory.updateDiscourse` | Takes `questionFrame: QuestionFrame`, `entities: ResolvedEntity[]`, `responsePlan: ResponsePlan` | `void` — mutates `this.discourse` in place and calls the existing (unchanged) `_save()` |

**Internal helpers (not exported, new):** the `pendingResult` expiry decrement (part of `updateDiscourse()`'s body, not a separately named function).

**Dependencies:** none new — still zero imports from other `assistant/*` modules, exactly as today (memory.js has always been dependency-free by design, per `docs/PROJECT_ARCHITECTURE.md`).

**Who can call it:** `assistant.js` (both halves of Stage 4, plus the existing unchanged call sites for `add`/`setActiveTopic`/etc.), `conversation.js` (reads `memory.discourse.lastQuestionFrame` only — never calls `updateDiscourse()` itself), `entities.js` (reads `memory.discourse.focusEntities` only, via the value `assistant.js` passes in as a parameter — `entities.js` does not import `memory.js` directly, preserving its dependency-free status from §4.1).

**Who cannot call it:** `providers.js` must not call `memory.updateDiscourse()` — the discourse write-back happens once, in `assistant.js`, after Stage 7 and before Stage 8 (per Stage 4's ordering rule); `providers.js` may continue to call the *unchanged* `memory.hasUsedPhrase()`/`markPhraseUsed()` exactly as today.

**Side effects:** `_save()` (unchanged — writes to `sessionStorage` under `STORAGE_KEY`, see §6.3 for the version-bump decision).

### 4.6 `assistant/persona.js` (EXTENDED)

**Public API (unchanged exports, listed for completeness):** `ASSISTANT_CAPABILITIES`, `TECH_TAKES` — unchanged data, unchanged shape.

**Public API (new exports):**

| Export | Type | Description |
|---|---|---|
| `SELF_MODEL` | `object` (plain data, not a function) | Authored content backing the `SelfModel` block (§7.8): the assistant's own nature ("I'm a retrieval-and-reasoning layer over Sudhanshu's portfolio content, not a general-purpose model"), memory scope ("I remember this conversation for this session only"), and connectivity ("I don't call any external API — everything I know is in this page's bundle"). |

**Internal helpers:** none — this module has never contained functions, only authored constant data, and that convention is preserved.

**Dependencies:** none (unchanged — `persona.js` has always been a leaf data module).

**Who can call it (i.e., import from it):** `providers.js` (unchanged, for `TECH_TAKES`/`ASSISTANT_CAPABILITIES`; new read of `SELF_MODEL` when rendering a `SelfModel` block), `planning.js` (new — reads `SELF_MODEL` to decide *whether* a `SelfModel` block is warranted, though the prose itself is only assembled at render time in `providers.js`).

**Who cannot call it:** `content.js` must never import from `persona.js` (the dependency direction is one-way, `persona.js` is conversational content, `content.js` is portfolio data — reversing this would blur the exact boundary `docs/AI_ASSISTANT_SPEC.md` draws between the two).

**Side effects:** none.

### 4.7 `assistant/providers.js` (RESTRUCTURED, NOT REWRITTEN)

**Public API (unchanged):** `LocalProvider.generate(query, ctx)` → `{ text, sources, kind, payload }`. This exact signature and return shape is preserved — it is the one interface `assistant.js` depends on and this spec treats it as frozen (per §0.1's Rule 4 binding).

**Internal helpers (new):**

| Helper | Role |
|---|---|
| `_renderPlan(plan, ctx)` | Iterates `plan.blocks`, dispatches each to its block renderer, joins the resulting markdown fragments, assembles `sources` from `Evidence`-type blocks (or `plan.sourcesOverride`), returns the final `{ text, sources, kind, payload }`. |
| `_renderBlock(block, ctx)` | The dispatcher referenced in Stage 7's failure-mode table (§1) — a `switch`/lookup over `block.type`, one case per block type in §7. Unrecognized types degrade per the rule stated there. |
| One render function per block type (`_renderDirectAnswer`, `_renderEvidence`, `_renderComparisonBlock`, `_renderStrengths`, `_renderGapDisclosure`, `_renderRecommendation`, `_renderHonestDecline`, `_renderSelfModel`, `_renderRecruiterFraming`) | Each contains the **relocated prose/logic** from today's corresponding `_xResponse` method — see §8.3's exact per-method mapping. `FollowupHint` and `MultiTopicAcknowledgement` (§7.9–7.10) render to nothing inline; they are read by `assistant.js` instead. |

**Internal helpers (unchanged, retained):** `_pickVariant()`, `_recruiterRelevance()` (relocates its *decision* into `planning.js` but its *phrasing templates* stay here, called by `_renderRecruiterFraming`), `_techEvidenceSources()`, `_renderTechEvidence()`.

**Dependencies:** `knowledge.js` (`getDoc`, `getProject`, unchanged — still needed for card `payload` assembly), `jdmatch.js` (`analyzeJobDescription`, unchanged, `_jdMatchResponse` keeps its own code path entirely outside the plan/block system per §10), `persona.js` (`TECH_TAKES`, `ASSISTANT_CAPABILITIES`, `SELF_MODEL`).

**Who can call it:** `assistant.js` only (`provider.generate()`, unchanged call site).

**Who cannot call it:** nothing else calls `providers.js` today either; this is unchanged.

**Side effects:** none beyond what exists today (`_pickVariant` reads/writes `memory.usedPhraseKeys` via the unchanged `hasUsedPhrase`/`markPhraseUsed` API).

### 4.8 `assistant.js` (EXTENDED — orchestrator)

**Public API:** none — this is the top-level module wired directly into `index.html`; it has no exports consumed by other `assistant/*` modules (unchanged).

**Internal functions (changed):**

| Function | Change |
|---|---|
| `classifyIntent(query)` | **Narrowed** — see §8.2. Returns only command labels or `null`. |
| `resolveContext(query, intent)` | **Narrowed** — project-name matching logic (the `explicit` lookup) moves to being expressed via `entities.js`'s project-type matches; the pronoun/`needsRef` enrichment logic is retained here (it is orchestration glue, not a reasoning decision) but now also consults `memory.resolveFocusEntities()` when Stage 3 resolves zero entities. |
| `buildFollowups(intent, payload, focusProject, strategy)` | Parameter `strategy` becomes `questionFrame`; `intent`-based branches are joined by new `discourse.pendingResult`-based branches (§3.7). Signature otherwise unchanged (same 4 positional parameters, same call site). |
| `ask(rawText)` | Gains 5 new orchestration lines (one per new stage: call `entities.resolveEntities()`, call `memory.resolveFocusEntities()`, call `knowledge.buildEvidenceSet()`, call `entities.assessConfidence()`, call `planning.buildResponsePlan()`) inserted between today's step 5 (Conversation Strategy) and step 9 (Provider) — see §5 for the exact new sequence. Steps 1–4 and 8–13 are otherwise unchanged. |

**Dependencies (new imports added):** `entities.js`, `planning.js`. All existing imports (`knowledge.js`, `memory.js`, `conversation.js`, `providers.js`, `interview.js`, `jdmatch.js`, `awareness.js`, `tools.js`, `renderer.js`, `streaming.js`) unchanged.

**Who can call it:** the page bootstrap only (unchanged — `assistant.js` self-initializes and attaches `window.SRIIVERSE_AI`).

**Who cannot call it:** no `assistant/*` module ever imports from `assistant.js` (unchanged — this would be a circular dependency and has never existed).

**Side effects:** DOM manipulation (bubbles, streaming, cards — unchanged), calls into `memory`/`Workspace`/`interview` (unchanged), plus the new `memory.updateDiscourse()` call.

### 4.9 `assistant/interview.js` (UNCHANGED)

**Public API (unchanged):** `interview.isActive()`, `interview.start(query)`, `interview.handleTurn(text)` — exact signatures, exact behavior, no edits planned in any phase of this migration.

**Dependencies:** unchanged (per Sprint 3's design requirement, provider-agnostic and UI-agnostic — no dependency on `providers.js`, `entities.js`, or `planning.js`, and none is being added).

**Who can call it:** `assistant.js` only (Stage 0 gate + the fresh-start branch in Stage 1) — unchanged.

**Who cannot call it:** every reasoning-pipeline module (`conversation.js`, `entities.js`, `knowledge.js`, `planning.js`, `providers.js`) must not call `interview.js` — this boundary is explicitly restated here because it is load-bearing for Stage 0's correctness (only one module may ever ask "is a session active").

**Side effects:** unchanged (owns its own internal session state, not persisted to `memory`).

### 4.10 `assistant/jdmatch.js` (BEHAVIOR UNCHANGED, ONE INTERNAL IMPORT CHANGES)

**Public API (unchanged):** `looksLikeJobDescription(text)`, `analyzeJobDescription(jdText)` — exact signatures, exact return shape (matching skills, missing skills, relevant projects, match score, interview talking points), unchanged.

**Change:** `matchTaxonomyEntities()` is no longer *defined* in this file — its implementation moves to `entities.js` (§4.1). This file's only edit is its import line and, optionally, a one-line re-export (`export { matchTaxonomyEntities } from './entities.js';`) kept for exactly one migration phase in case any other file still imports it from here (see §8.1's exact search-and-replace instruction — after that phase, the re-export is deleted).

**Dependencies:** `content.js` (`SKILLS_TAXONOMY`, unchanged), `entities.js` (new, replacing the local definition), `knowledge.js` (`getAllProjects`, `getStack`, unchanged).

**Who can call it:** `assistant.js` (Stage 1's `looksLikeJobDescription` check, and `providers.js`'s `_jdMatchResponse`'s call to `analyzeJobDescription`) — unchanged.

**Who cannot call it:** `entities.js` must never import from `jdmatch.js` — the dependency direction is `jdmatch.js` → `entities.js`, never the reverse (this is the direction reversal explicitly decided in §8.1, to make `entities.js` the single canonical owner).

**Side effects:** none (unchanged — pure functions).

### 4.11 `content.js` (UNCHANGED)

**Public API (unchanged):** `PROFILE`, `PROJECTS`, `STACK`, `ARCHITECTURE`, `JOURNEY`, `SKILLS_TAXONOMY`, `ASSISTANT_KB`, `INTERVIEW_QUESTIONS` — no new exports, no shape changes, no new entries required by this migration (the taxonomy already contains both owned and tracked-gap technologies, which is exactly what §4.1's `ownership` classification needs).

**Who can call it:** every module already reading from it today, unchanged. No new importers.

**Who cannot call it:** `content.js` imports nothing from `src/assistant/*` (unchanged — it is a pure leaf data module, and this migration does not change that).

**Side effects:** none.

### 4.12 Unchanged, non-reasoning modules (brief, for completeness)

| Module | Role | Change in this migration |
|---|---|---|
| `assistant/awareness.js` | Tracks which project/section the visitor is currently viewing in the 3D scene, for the "context matters" pronoun-adjacent signal used in `resolveContext()` | None. |
| `assistant/tools.js` | `decideTool()`/`runTool()` — proactive/explicit navigation actions | None. |
| `assistant/renderer.js` | Markdown-to-DOM rendering, card templates, citation rendering, follow-up chip rendering | None — it renders whatever markdown/`payload` it is given; it has no awareness of `ResponsePlan`/`ResponseBlock` and does not need any, since Stage 8 still hands it the same flat `{text, sources, kind, payload}` shape as today. |
| `assistant/streaming.js` | `createStream()` — word-by-word text streaming | None. |

---

## 5. Execution Flow — User Input to Final Render

This is today's `ask(rawText)` function in `assistant.js`, with the five new stages inserted at the exact point they replace/extend today's step 5. Steps are numbered to match the live code's own `--- N. LABEL ---` comments where a direct match exists; new steps are labeled `5a`–`5e` to make clear they are insertions between today's step 5 and step 6, not a renumbering of the whole function (renumbering every comment in the file is a cosmetic change with no behavioral value and is explicitly deferred — see §10).

1. **User submits text** via the form handler (unchanged) → `ask(rawText)` is called.
2. **Mode Gate** (Stage 0, unchanged): `interview.isActive()` checked. If `true`, `memory.add()`, render the user bubble, `interview.handleTurn()`, return. Pipeline ends here for this turn.
3. **Step 1 — Command Gate** (Stage 1, narrowed): `classifyIntent(userText)` runs. If it returns `'interview'`, start a session and return. If it returns any other non-`null` command label, remember it as `intent` — this turn will short-circuit around Stages 2–7 later, exactly as today (jd-match, action-nav, etc. still route directly to `providers.js`/`tools.js`). If `null`, continue.
4. **Step 2 — Awareness** (unchanged): `buildAwarenessContext()`.
5. **Step 3 — Context** (narrowed `resolveContext()`): resolves `focusProject` and the pronoun-enriched `query` string, now also consulting `memory.resolveFocusEntities()` as a fallback source for antecedents (this is the one behavioral widening in this step — today it only consults `awareness.currentProject`/`memory.lastProject`).
6. **Step 4 — Profile** (unchanged): reads `memory.profile` (already updated inside `memory.add()`).
7. **Step 5 — Question Understanding** (Stage 2, was "Conversation Strategy"): `buildQuestionFrame(query, { intent, focusProject, memory, awareness })` → `questionFrame`. Skipped entirely when `intent` is a command label from step 3 (unchanged short-circuit behavior — a `'jd-match'`/`'action-*'` turn never needed a `Strategy` object either).
8. **Step 5a — Entity Resolution** (Stage 3, new): `entities.resolveEntities(query, { hint: questionFrame })` → `entityResolution`.
9. **Step 5b — Conversation Context read** (Stage 4 read half, new): if `entityResolution.entities` is empty, `memory.resolveFocusEntities(entityResolution.entities, questionFrame)` supplies the effective entity list for the next two steps.
10. **Step 5c — Evidence Selection** (Stage 5, new): `knowledge.buildEvidenceSet(query, questionFrame, effectiveEntities)` → `evidence`.
11. **Step 5d — Confidence** (Stage 6, new): `entities.assessConfidence(evidence, effectiveEntities)` → `confidence`.
12. **Step 5e — Response Planning** (Stage 7, new): `planning.buildResponsePlan(questionFrame, entityResolution, memory.discourse, evidence, confidence, { visitorProfile, memory, focusProject, awarenessContext })` → `plan`. Skipped for command-label turns (same short-circuit as step 7 above); also skipped, and replaced by the existing dedicated code paths, for `'jd-match'` (routes to `_jdMatchResponse` directly) — see §10 for why JD-match and interview are explicitly excluded from plan-based composition in this phase.
13. **Steps 6+7 — Knowledge + Memory "inside the provider"** (label retained from today's comment, now literally accurate: Stages 5–6 above already ran knowledge/confidence *before* the provider call, so this label now describes step 8 below more precisely than it did before — flagged in §10 as a comment-only cleanup, not a behavior change).
14. **Step 8 — Proactive Tool** (unchanged): fires in the background based on `intent`, unaffected by any new stage.
15. **Step 9 — Provider / Response Composition** (Stage 8): `provider.generate(query, ctx)` where `ctx` now also carries `questionFrame`, `entities: entityResolution`, `evidence`, `confidence`, and (for command-label turns) the same `intent`/`strategy`-shaped fallback path as today. Internally, `LocalProvider.generate()` calls `_renderPlan(plan, ctx)` when a `plan` is present on `ctx`; falls back to the existing `intent`-driven `_jdMatchResponse`/`_fallback` code paths when it is not (command-label turns, interview handoffs already excluded above).
16. **Step 10 — Explicit Tool Execution** (unchanged): `decideTool()`/`runTool()` for pure-action turns.
17. **Step 11 — Rich Response** (unchanged): streams `response.text`, appends project/comparison cards from `response.payload`, appends citations from `response.sources` — all three fields still populated exactly as today, now sourced from `_renderPlan()`'s assembly instead of a bespoke `_xResponse` method, but the shape `renderer.js` consumes never changes.
18. **Conversation Context write** (Stage 4 write half, new): `memory.updateDiscourse(questionFrame, entityResolution, plan)` — runs here, after rendering has read everything it needs from `response`/`plan`, before step 12 below, per Stage 4's ordering rule (all state writes grouped, side-effect-free until this point).
19. **Step 12 — Workspace State** (unchanged): `Workspace.onExchange(memory.turnCount)`.
20. **Step 13 — Follow-ups** (extended `buildFollowups()`): now takes `questionFrame` in place of `strategy`, and additionally reads `memory.discourse.pendingResult`.
21. **Final Render**: follow-up chips appended to the DOM (unchanged `renderFollowups()`); turn complete.

Total: the pipeline grows from 12 comment-labeled steps to 12 labeled steps + 5 lettered insertions (5a–5e) — no existing step is deleted, renumbered, or reordered relative to its neighbors; every insertion happens inside the existing gap between step 5 and step 6.

---

## 6. State Management

### 6.1 Conversation state (in-memory, per-turn)

Everything produced by Stages 2–7 (`QuestionFrame`, `EntityResolutionSet`, `EvidenceSet`, `ConfidenceAssessment`, `ResponsePlan`) is **ephemeral, per-turn, stack-local state** inside `ask()`. None of it is stored on `memory` directly — only the two fields `DiscourseState` actually needs (`lastQuestionFrame`, `focusEntities`, `pendingResult`, `sessionFacts`) survive past the end of the turn, written deliberately by `updateDiscourse()`. This is a explicit design decision: the full per-turn objects are not archived (no "history of every `EvidenceSet` ever built") — only the minimal discourse summary needed for next-turn ellipsis resolution persists. Anything beyond that is available for the current turn's console/log inspection only.

### 6.2 Memory updates — exact write points

| When | What updates | Function |
|---|---|---|
| Immediately on every user turn (before Stage 1) | `memory.turns`, `memory.profile` (unless JD-paste), `memory.lastProject` (if entities carry a project) | `memory.add('user', ...)` — unchanged |
| After Stage 7, before Stage 8 renders (execution flow step 18) | `memory.discourse.lastQuestionFrame`, `memory.discourse.focusEntities`, `memory.discourse.pendingResult` (set or decremented), `memory.discourse.sessionFacts` (merged, capped at 10 keys) | `memory.updateDiscourse()` — new |
| Immediately after rendering (execution flow, unchanged step) | `memory.turns` (assistant turn), `memory.lastProject` (from `response.payload`) | `memory.add('assistant', ...)` — unchanged |
| Inside `providers.js`, during rendering (unchanged) | `memory.usedPhraseKeys` | `memory.markPhraseUsed()` — unchanged |

### 6.3 Persistence

`memory.js` continues to persist to `sessionStorage` under a single key (unchanged mechanism). The stored JSON schema gains one new top-level field, `discourse`, alongside the existing `turns`, `summary`, `lastProject`, `activeTopic`, `usedPhraseKeys`, `profile`. Because this is an **additive** schema change (old keys untouched, new key added), the storage key **is bumped** from `'sriiverse.memory.v4'` to `'sriiverse.memory.v5'` — not because the old format is unreadable, but because a `DiscourseState`-shaped `undefined` silently defaulting on old sessions is acceptable and expected (a returning visitor mid-session during the deploy simply starts with an empty `discourse`, exactly like a new visitor would; nothing breaks, no migration code is needed). This matches the precedent already set when Sprint 3 added `activeTopic`/`usedPhraseKeys` without a version bump (those were tolerant of `undefined`) versus how a version bump would be used here only if a genuinely breaking shape change were introduced (it is not — this is a deliberate, conservative choice to bump anyway, purely so that a future engineer diffing `v4` vs `v5` session dumps has an unambiguous signal that discourse tracking began at `v5`, not because `v4` data is incompatible).

### 6.4 Session lifecycle

Unchanged from today in every respect: session state lives in `sessionStorage` (cleared when the browser tab closes, per the browser's own `sessionStorage` semantics — no explicit "end session" action exists in the UI today, and this migration does not add one). `memory.discourse` follows the exact same lifecycle as `memory.lastProject`/`memory.activeTopic` — created fresh on `Memory` construction, loaded from storage in `_load()`, saved in `_save()`, cleared only when the tab/session ends. No new lifecycle event (no explicit reset button, no idle timeout) is introduced — see §10.

---

## 7. Block System

Ten block types ship in this phase — the exact cap the Plan's Definition of Done commits to ("target: fewer than 10 block types at initial ship" — realized here as exactly 10). A candidate 11th type, `MultiTopicAcknowledgement` (for composite multi-question turns, e.g. "what's your stack AND why should we hire you"), is deliberately deferred — see §10.

Every block's `data` shape is specific to that block; there is no shared base shape beyond `{ type, data }` (§3.6).

### 7.1 `DirectAnswer`

**Purpose.** The single sentence (or short paragraph) that most directly answers the question. Present in almost every plan — the one block type `planning.js` always includes unless the entire answer is a `HonestDecline`.

**Required fields (`data`):** `text: string` (the answer prose, already fully composed by `planning.js` — not a template the renderer fills in, since the exact wording depends on entity/ownership specifics only Response Planning has); `polarity: 'affirmative' | 'negative' | 'neutral'` (drives the renderer's opening-word choice, e.g. negative answers never open with "Yes").

**Render behavior.** Emitted as the first markdown paragraph of the response, verbatim (no wrapping, no bullet list). Always block index 0 when present.

### 7.2 `Evidence`

**Purpose.** Cites the specific project(s)/facts backing the `DirectAnswer` — the mechanism that replaces today's implicit "whatever `hits[0].doc` happened to be" with an explicit, plan-decided citation list.

**Required fields (`data`):** `facts: EvidenceFact[]` (§3.4.1, non-empty); `style: 'inline' | 'bulleted'` (`'inline'` folds 1 fact into a single sentence appended to the `DirectAnswer`'s paragraph; `'bulleted'` renders 2+ facts as a markdown list).

**Render behavior.** `'inline'` facts are appended, joined with "—", directly after `DirectAnswer`'s text (same paragraph). `'bulleted'` facts render as a new markdown bullet list block. Every fact with a non-null `docId` also contributes its source doc to the final `sources` array (§4.7's `_renderPlan` responsibility).

### 7.3 `Comparison`

**Purpose.** Renders a structured two/three-way technology or project comparison — the direct replacement for today's `_techComparisonResponse`/`_comparisonResponse` methods' output shape.

**Required fields (`data`):** `entities: [string, string] | [string, string, string]` (canonical names being compared); `dimensions: { label: string, values: string[] }[]` (one row per comparison axis — e.g. `{label: 'Use case', values: ['Django: batteries-included', 'Flask: minimal, flexible']}`); `verdict: string | null` (an optional closing recommendation sentence, only when the question's `polarity`/`questionType` warrants a stance, mirroring today's `TECH_TAKES` opinionated closers).

**Render behavior.** For a **tech** comparison: renders `dimensions` as a compact markdown table (or a short paragraph-per-dimension list if only 2 dimensions, matching today's `_techComparisonResponse` prose style rather than forcing every comparison into a table). For a **project** comparison: sets `plan.kind = 'comparison'` and `plan.payload = {projectA, projectB}` so the existing `renderComparisonCard()` rich card still renders exactly as today — this block's `data` in that case only supplies the narrative paragraph that today accompanies the card, not the card's own data.

### 7.4 `Strengths`

**Purpose.** A confident, specific, non-generic list of what Sudhanshu is strong at — used for `Behavioral`/`Recruiter`/`Capability`-typed questions that explicitly ask for strengths, and as the positive counterpart whenever a `GapDisclosure` block appears (per Stage 7's Cluster H fix: strengths and gaps are answered by the same underlying self-model data, not two independently-tuned code paths).

**Required fields (`data`):** `items: string[]` (2–4 short, specific statements — never a restatement of the entire tech stack, per `docs/AI_EVALUATION_SUITE.md`'s success-criteria convention of "avoids dumping the entire technology stack").

**Render behavior.** Rendered as a markdown bullet list, always preceded by a one-line framing sentence supplied by the block itself as `items[0]` acting as the lead-in when only 2 items exist, or a separate lead sentence composed by `_renderStrengths` from a small fixed set of openers ("A few things I'd point to:", "Strongest areas:") chosen via the existing `_pickVariant` phrase-rotation mechanism (unchanged mechanism, new call site).

### 7.5 `GapDisclosure`

**Purpose.** The single, unified mechanism for every "honest absence" statement — an unowned technology (`Do you know Kubernetes?`), a self-assessed weakness (`What are you weak at?`), or a portfolio limitation (`Have you worked at scale?`). This is the direct, single-block fix for Cluster F and Cluster H's "same content, three different bespoke phrasings" duplication.

**Required fields (`data`):** `items: string[]` (1–3 specific gap statements — never a bare "I don't know"); `reframe: string | null` (an optional constructive redirect, e.g. "...but I've used Docker Compose extensively, which covers a lot of the same orchestration thinking at smaller scale" — present whenever a genuinely adjacent owned skill exists, per the existing `_techTakeFallback` pattern's spirit).

**Render behavior.** Rendered as prose (not a bullet list, even for 2–3 items — a bulleted "here is a list of things I can't do" reads worse than a flowing sentence, per `docs/AI_ASSISTANT_SPEC.md`'s "context matters" tone principle). `reframe`, when present, is always the closing clause of the same paragraph, joined with "—" or "That said,".

### 7.6 `Recommendation`

**Purpose.** Recommends a specific project or next action — the replacement for today's `_recommendResponse`.

**Required fields (`data`):** `targetType: 'project' | 'action'`; `targetId: string` (a project id, or an action key like `'jd-match'`/`'contact'`); `text: string` (the recommending sentence, already composed).

**Render behavior.** Renders `text` as prose. If `targetType: 'project'`, also sets `plan.kind = 'project-card'` and `plan.payload = {project}` exactly as today's rich-card contract, so `renderTabbedProjectCard()` is unaffected.

### 7.7 `HonestDecline`

**Purpose.** The explicit "I don't have that information" block — used when `ConfidenceAssessment.tier` is `'low'` with `basis: 'no-evidence'`, or when the question is about something categorically outside the portfolio's scope (salary expectations, personal life, opinions on other candidates). Distinct from `GapDisclosure`: `GapDisclosure` has *specific, itemized* content to share about an absence; `HonestDecline` has *nothing* to share at all.

**Required fields (`data`):** `reason: 'no-data' | 'out-of-scope' | 'ambiguous-subject'`; `redirect: string | null` (an optional pointer to what the assistant *can* help with instead, e.g. redirecting a salary question toward "happy to talk through the technical scope of the role").

**Render behavior.** Always the sole content block in its plan (per Stage 7's rule that `HonestDecline` plans are `[HonestDecline, FollowupHint]` at most — never paired with `Evidence`, since by definition there is none). Renders as 1–2 sentences.

### 7.8 `SelfModel`

**Purpose.** Answers questions about the assistant itself — its nature, memory scope, and connectivity — sourced from `persona.js`'s new `SELF_MODEL` data (§4.6). Direct fix for Cluster G's "assistant-about-itself" questions currently falling through to generic identity/fallback text.

**Required fields (`data`):** `aspect: 'nature' | 'memory' | 'connectivity'`; `text: string` (composed from `SELF_MODEL[aspect]`, verbatim or lightly templated — not freely generated).

**Render behavior.** Rendered as prose, 1–2 sentences, always paired with `DirectAnswer` (never standalone) since a `SelfModel` fact is itself the direct answer to "are you real?"-style questions — the split exists so `planning.js` can still attach a `FollowupHint` uniformly.

### 7.9 `RecruiterFraming`

**Purpose.** The additional hiring-relevance sentence appended when `ctx.visitorProfile.type === 'recruiter'` — the exact condition and prose already authored in today's `_recruiterRelevance()`/`_recruiterFocusText()`, now expressed as an explicit, always-optional block instead of an inline conditional buried inside `_projectResponse`/`_recommendResponse`.

**Required fields (`data`):** `text: string` (the framing sentence, composed by `_renderRecruiterFraming` from today's unchanged `_recruiterRelevance`/`_recruiterFocusText` template logic).

**Render behavior.** Always the last content block before `FollowupHint`, rendered as a closing paragraph, visually/tonally distinct only in that it starts a new paragraph (not a new heading — stays lightweight per `docs/AI_ASSISTANT_SPEC.md`'s "actions better than words" and "concise by default" conventions).

### 7.10 `FollowupHint`

**Purpose.** Not rendered inline at all — a signal block that `assistant.js`'s `buildFollowups()` reads (per §3.6/§3.7) to decide the chip suggestions, replacing today's implicit coupling where `buildFollowups()` re-inspects `strategy.move` independently of what `providers.js` actually rendered.

**Required fields (`data`):** `rationale: FollowupPlan['rationale']` (§3.7); `suggestedTopics: string[]` (0–3 candidate follow-up subjects, e.g. `['docker', 'recommend-project']` — `buildFollowups()` still owns final chip-text phrasing, this block only supplies *which topics* are most relevant given what was just answered).

**Render behavior.** None (zero markdown output). `_renderBlock()`'s dispatcher for this type is a no-op that only extracts `data` onto `plan.payload._followupHint` for `buildFollowups()` to read — the one deliberate exception to "every block renders something," documented here explicitly so it is never mistaken for an oversight.

---

## 8. Migration Contract

Governing principle (restated from `docs/CURSOR_RULES.md` Rule 4): every mapping below is either (a) a pure **addition** (new file, new export, nothing old touched), or (b) a **relocation** of existing logic/prose to a new home with the same behavior, or (c) a **narrow, justified, in-place edit** to an existing function's body with its call sites either unchanged or updated in the same step. No mapping in this table is a rewrite of working logic from scratch.

### 8.1 Entity resolution: extraction and dependency-direction reversal

| Today | Becomes | Disposition |
|---|---|---|
| `jdmatch.js` defines `matchTaxonomyEntities()` | `entities.js` defines `matchTaxonomyEntities()` (identical body) | **Relocation.** Cut from `jdmatch.js`, pasted into `entities.js`, zero logic changes. |
| `jdmatch.js` exports `matchTaxonomyEntities` for its own internal use | `jdmatch.js` no longer defines it; imports it from `entities.js` | **Updated import**, one line: `import { matchTaxonomyEntities } from '../entities.js';` (or `./entities.js` depending on final path — both files live in `src/assistant/`). |
| `conversation.js` imports `matchTaxonomyEntities` from `./jdmatch.js` | `conversation.js` imports it from `./entities.js` | **Updated import**, one line, in the one file that had this dependency (per this repository's current code — confirmed by inspection, `conversation.js` is the only importer of `jdmatch.js`'s `matchTaxonomyEntities` besides `jdmatch.js` itself). |
| N/A | `entities.js` adds `resolveEntities()` (returns full `ResolvedEntity[]` with `ownership`/`confidence`, superset of what `matchTaxonomyEntities` returns) | **New function**, new file. `matchTaxonomyEntities()` becomes a two-line convenience wrapper (`resolveEntities(text).map(e => e.canonical)`) so its own existing callers (`jdmatch.js`'s `analyzeJobDescription()`) need zero changes to their own logic — only the import line moves. |
| N/A | `entities.js` adds `assessConfidence()` | **New function**, new file — not a migration of any existing logic (Stage 6 has no today-equivalent). |

### 8.2 Question Understanding: narrowing `classifyIntent`, renaming `analyzeStrategy`

| Today | Becomes | Disposition |
|---|---|---|
| `assistant.js`'s `classifyIntent()` returns 15 possible string labels covering both commands and semantic topics | `classifyIntent()` returns only the 8 command labels (`'jd-match'`, `'interview'`, `'action-nav'`, `'action-demo'`, `'action-github'`, `'action-contact'`, `'action-highlight'`, `'action-resume'`) or `null` | **In-place edit.** The 7 semantic-branch `if` statements (`recruiter`, `architecture`, `stack`, `comparison`, `profile`, `project`, and the `question` fallback) are **deleted** from this function — not left dead, deleted, because leaving unreachable branches in place would itself be an ambiguity this spec exists to prevent. Their regex patterns are not discarded — see the next row. |
| The 7 deleted regex patterns (`/recruit\|hir.../`, `/architect.../`, etc.) | Relocated verbatim into `conversation.js`, as the new priority-order checks 8–11 and 13 in §3.1's construction rule | **Relocation.** Same regex source text, same matching behavior, new file, new role (`questionType` value instead of `intent` string). |
| Every call site checking `intent === 'recruiter'` / `'architecture'` / `'stack'` / `'project'` / `'profile'` (today: inside `providers.js`'s `generate()` and a few `ctx.intent === 'architecture'` checks in `conversation.js` itself) | Checks `questionFrame.questionType === 'Recruiter'` / `'ArchitectureExplanation'` / etc. | **Updated call sites**, one-for-one, same number of checks, new variable/enum names — see §4.3, §4.7 for exactly where. |
| `conversation.js`'s `analyzeStrategy(query, ctx)` | `conversation.js`'s `buildQuestionFrame(query, ctx)` | **In-place rename**, same file, same parameter shape. Justified as a low-risk internal rename per §0.1: this function has exactly one caller (`assistant.js`), is not part of any published/external interface, and keeping the old name on a function that now returns a conceptually renamed structure (`QuestionFrame`, not `Strategy`) would itself be the kind of ambiguity this document exists to eliminate. |
| `ctx.strategy` (set by `assistant.js`, read by `providers.js` and `buildFollowups()`) | `ctx.questionFrame` | **Renamed field**, 3 call sites total (`assistant.js` sets it twice — once building `ctx` for `provider.generate()`, once passing it to `buildFollowups()` — and `providers.js` reads it in `generate()`'s routing block). All 3 updated together in the same commit, per §9's step ordering. |

### 8.3 Response Composition: per-method disposition table

Every existing method in `providers.js`'s `LocalProvider`, mapped to its new home. "Plan-building half" means the *decision* of which blocks/data to include moves to `planning.js`; "Render half" means the *prose/markdown-producing* code stays in `providers.js`, now as a block renderer.

| Existing method | Plan-building half → | Render half → |
|---|---|---|
| `_fallback(ctx)` | `planning.js`: emits `[HonestDecline]` when `confidence.tier === 'low'` | `providers.js`: `_renderHonestDecline` |
| `_greetingResponse(ctx)` | `planning.js`: emits `[DirectAnswer]` for `questionType: 'Greeting'` | `providers.js`: `_renderDirectAnswer` (greeting prose relocated verbatim) |
| `_identityResponse()` | `planning.js`: emits `[SelfModel, DirectAnswer]` or `[DirectAnswer]` depending on `subject` | `providers.js`: `_renderSelfModel` / `_renderDirectAnswer` (identity prose relocated verbatim into `SELF_MODEL['nature']` in `persona.js`, and into `_renderDirectAnswer`'s greeting-adjacent template for the `subject: 'sudhanshu'` case) |
| `_findTechTake(strategy)` | `planning.js`: entity/opinion matching logic against `TECH_TAKES`, relocated verbatim (same exact/partial-match rules from Errors 1–2 of the prior implementation session, preserved as-is) | N/A (pure lookup, no render half) |
| `_renderTechEvidence(entry)` / `_techEvidenceSources(entry)` | N/A (these are already render-only helpers) | `providers.js`: retained unchanged, called from `_renderEvidence` |
| `_techTakeFallback(strategy)` | `planning.js`: the "closest partial match" decision | `providers.js`: `_renderGapDisclosure`'s `reframe` field composition (this method's prose *is* today's reframe pattern — relocated verbatim) |
| `_techComparisonResponse(strategy)` | `planning.js`: emits `[Comparison]` for `questionType: 'Comparison'` + `scope: 'tech'` | `providers.js`: `_renderComparisonBlock` (tech branch) |
| `_opinionResponse(strategy)` | `planning.js`: emits `[DirectAnswer, Evidence]` using `_findTechTake`'s relocated result | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` |
| `_experienceResponse(strategy, query)` | `planning.js`: entity resolution now comes from `entities.js` (Stage 3) instead of this method's own inline `_EXPERIENCE_STOPWORDS` search (**deleted** — see §4.1's note that this exact duplication is what triggered generalizing `resolveEntities()` in the first place); block selection emits `[DirectAnswer, Evidence]` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` |
| `_projectResponse(proj, doc, intent, hits, visitorProfile, memory)` | `planning.js`: emits `[DirectAnswer, Evidence, RecruiterFraming?]`, sets `plan.kind = 'project-card'`, `plan.payload = {project: proj}` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` + `_renderRecruiterFraming` (this method's prose, currently interleaved, is split across the three render functions but every sentence is preserved) |
| `_recruiterRelevance(proj, visitorProfile, memory)` | `planning.js`: the *predicate* ("does recruiter framing apply here?") | `providers.js`: retained, called from `_renderRecruiterFraming` (prose unchanged) |
| `_pickVariant(memory, key, variants)` | N/A (unchanged utility) | `providers.js`: retained unchanged, called from multiple render functions |
| `_stackResponse(hits)` | `planning.js`: emits `[DirectAnswer, Evidence]` for `questionType: 'TechnologyExplanation'`, `plan.kind = 'stack-card'` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` |
| `_archResponse(doc, hits)` | `planning.js`: emits `[DirectAnswer, Evidence]` for `questionType: 'ArchitectureExplanation'`, `plan.kind = 'arch-card'` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` |
| `_recommendResponse(doc, ctx)` | `planning.js`: emits `[Recommendation, RecruiterFraming?]` | `providers.js`: `_renderRecommendation` + `_renderRecruiterFraming` |
| `_recruiterFocusText(focusArea, projects)` | N/A (unchanged utility) | `providers.js`: retained unchanged, called from `_renderRecruiterFraming` |
| `_profileResponse(doc, ctx)` | `planning.js`: emits `[DirectAnswer, Evidence]` for `questionType: 'Identity'` + `subject: 'sudhanshu'` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence` |
| `_resumeResponse(hits)` | `planning.js`: emits `[DirectAnswer, Evidence]` for `questionType: 'Experience'` with `template: 'resume-summary'` | `providers.js`: `_renderDirectAnswer` + `_renderEvidence`, `plan.sourcesOverride` set explicitly (per §3.6) since this response's citation list spans multiple projects at once, not a single `Evidence` block's natural facts |
| `_jdMatchResponse(jdText)` | **Not migrated — explicitly out of scope, see §10.** | `providers.js`: retained exactly as-is, called directly from `generate()`'s `ctx.intent === 'jd-match'` branch, bypassing the plan/block system entirely |
| `_comparisonResponse(query, hits)` | `planning.js`: emits `[Comparison]` for `questionType: 'Comparison'` + `scope: 'project'` | `providers.js`: `_renderComparisonBlock` (project branch), `plan.kind = 'comparison'`, `plan.payload = {projectA, projectB}` |

### 8.4 Evidence Selection: additive-only

`knowledge.js`'s `retrieve()` function is **not modified** — read every call site in `providers.js` that still calls `retrieve(query, N)` directly today (there are several, per §4.7's dependency note) and leave them exactly as they are; they continue to work because `retrieve()` never changes. `retrieveScoped()` and `buildEvidenceSet()` are pure additions consumed only by the new Stage 5 orchestration call in `assistant.js`.

### 8.5 Discourse: additive-only

`memory.js`'s existing fields (`turns`, `summary`, `lastProject`, `activeTopic`, `usedPhraseKeys`, `profile`) are **not modified, not removed, not renamed**. `discourse` is a new, independent top-level field. Any residual redundancy between `discourse.focusEntities` and `lastProject`, or between `discourse.lastQuestionFrame` and `activeTopic`, is a **deliberately accepted, temporary duplication** — consolidating them is explicitly deferred (see §10) rather than risking a "small cleanup" turning into an unplanned rewrite of `memory.js`'s persistence format mid-migration.

### 8.6 Self-model: additive-only

`persona.js`'s existing exports (`ASSISTANT_CAPABILITIES`, `TECH_TAKES`) are untouched. `SELF_MODEL` is new authored content, not derived from anything that exists today (today's `_identityResponse()` has some overlapping prose, which is relocated into `SELF_MODEL` per §8.3's `_identityResponse` row — this is the one place content genuinely moves *into* `persona.js` from `providers.js`, and it is called out explicitly here to avoid any ambiguity about direction).

### 8.7 Net file inventory

| File | Status |
|---|---|
| `src/assistant/entities.js` | **New** |
| `src/assistant/planning.js` | **New** |
| `src/assistant/conversation.js` | **Extended** (one rename, new helpers, no deletions of existing exported behavior) |
| `src/assistant/knowledge.js` | **Extended, additive-only** (zero existing exports touched) |
| `src/assistant/memory.js` | **Extended, additive-only** (zero existing exports touched) |
| `src/assistant/persona.js` | **Extended, additive-only** |
| `src/assistant/providers.js` | **Restructured internally** (public API unchanged; internal methods relocated/split per §8.3, none deleted without a documented new home) |
| `src/assistant.js` | **Extended** (2 functions narrowed, 1 function's parameter renamed, 5 new orchestration lines) |
| `src/assistant/jdmatch.js` | **One import line changed**; public API unchanged |
| `src/assistant/interview.js` | **Untouched** |
| `src/content.js` | **Untouched** |
| `src/assistant/awareness.js`, `tools.js`, `renderer.js`, `streaming.js` | **Untouched** |

---

## 9. Implementation Order

Fifteen steps, grouped into seven phases. Every step names its exact file(s), and a validation check that can be performed **without** the next step existing yet — this is the "independently testable" requirement. Phases A–E produce **zero visible behavior change** (pure internal restructuring/additions); Phase F is where visible answers start changing, one question-cluster at a time; Phase G is cleanup.

### Phase A — Entity extraction (behavior-preserving)

**1. Create `src/assistant/entities.js`.** Move `matchTaxonomyEntities()`'s implementation from `jdmatch.js` verbatim; add `resolveEntities()` as a new superset function.
*Test:* call both functions manually (browser console) for a fixed list of 10 sample strings; `resolveEntities(x).map(e => e.canonical)` must produce byte-identical arrays to the old `matchTaxonomyEntities(x)`.

**2. Update `src/assistant/jdmatch.js`.** Delete the local `matchTaxonomyEntities` definition; import it from `./entities.js`.
*Test:* paste the same 3 sample job descriptions used in Sprint 3's own testing checklist; match %, matching-skills list, and missing-skills list must be byte-identical before/after.

**3. Update `src/assistant/conversation.js`.** Change its `matchTaxonomyEntities` import source from `./jdmatch.js` to `./entities.js`.
*Test:* run the full Comparison + Opinion + Experience categories from `docs/AI_EVALUATION_SUITE.md` (roughly 25–30 questions); every response must be textually identical to a pre-change baseline capture.

### Phase B — Entity resolution richness (additive)

**4. Extend `src/assistant/entities.js`.** Add `ownership`/`confidence` fields to `resolveEntities()`'s output; add `assessConfidence()`.
*Test:* manually call `resolveEntities("Do you know Kubernetes?")` and 4 similar fixtures spanning `'owned'`/`'gap'`/`'unknown'`; confirm each classification against `SKILLS_TAXONOMY` by inspection. No existing caller is affected (nothing yet reads the new fields).

### Phase C — Question Understanding

**5. Extend `src/assistant/conversation.js`.** Rename `analyzeStrategy` → `buildQuestionFrame`; extend its return shape with `questionType`/`subject`/`polarity`/`requiresEvidence`/`confidence`/`source`/`template` (§3.1) while retaining every field it returns today (`move`, `scope`, `projectId`, `entities`, `category`) so nothing reading the old shape breaks yet; absorb the 7 semantic regex branches per §8.2's relocation table, in the priority order specified in §3.1.
*Test:* for every question across the Identity/Greeting/Comparison/Opinion/Experience/Recruiter/Architecture/Stack/Project categories in `docs/AI_EVALUATION_SUITE.md` (~80 questions), the function's new `questionType` field must match that question's "Expected Question Type" column. This is checkable by calling `buildQuestionFrame()` directly, before step 6 wires it any further.

**6. Update `src/assistant.js`.** Narrow `classifyIntent()` to only the 8 command labels (delete the 7 semantic branches — their regexes already live in `conversation.js` as of step 5); update the one call site of `analyzeStrategy` → `buildQuestionFrame`; rename `ctx.strategy` → `ctx.questionFrame` at all 3 call sites (2 in `assistant.js`, 1 in `providers.js`'s `generate()` routing block — this single rename in `providers.js` is the only edit to that file in this phase).
*Test:* full manual pass of every command flow (JD paste, "start an interview," each `action-*` trigger phrase) — must be unaffected. Re-run step 5's ~80-question regression end-to-end through the live UI now (not just the direct function call) — must produce identical responses to the pre-Phase-C baseline, since `providers.js` reads `ctx.questionFrame.move` etc. exactly as it read `ctx.strategy.move` before (field renamed, not restructured, at this point).

### Phase D — Conversation Context

**7. Extend `src/assistant/memory.js`.** Add the `discourse` field (default shape per §3.3), `resolveFocusEntities()`, `updateDiscourse()`; bump `STORAGE_KEY` to `'sriiverse.memory.v5'` (§6.3).
*Test:* drive a 2-turn conversation ("Tell me about Nova." → "What database does it use?") manually; after each turn, inspect `window.SRIIVERSE_AI.memory.discourse` in devtools; confirm `focusEntities` populates after turn 1 and persists across a page reload before turn 2 is sent (`sessionStorage` check).

**8. Update `src/assistant.js`.** Call `entities.resolveEntities()` (Stage 3) and `memory.resolveFocusEntities()` (Stage 4 read) inside `ask()`; narrow `resolveContext()`'s explicit-project lookup to reuse Stage 3's `type: 'project'` matches instead of its own inline `.find()` over `getAllProjects()`. `ctx` gains an `entities` field; `providers.js` does not read it yet.
*Test:* run the Conversation Memory / Context Switching / Follow-up Questions categories from `docs/AI_EVALUATION_SUITE.md` (~20 questions, many multi-turn) — pronoun/ellipsis resolution must match or improve on the pre-change baseline; zero regression on any single-turn question from earlier categories.

### Phase E — Evidence Selection + Confidence

**9. Extend `src/assistant/knowledge.js`.** Add `retrieveScoped()` and `buildEvidenceSet()` (§4.4), purely additive; existing `retrieve()` untouched.
*Test:* manually call `buildEvidenceSet()` for 5 fixtures spanning each `questionType`-affinity case (owned tech, gap tech, project, architecture, comparison); inspect `gapNotes`/`scoreGap`/`primaryFacts` for correctness by hand.

**10. Update `src/assistant.js`.** Call `knowledge.buildEvidenceSet()` (Stage 5) and `entities.assessConfidence()` (Stage 6); attach `evidence`/`confidence` to `ctx`. `providers.js` still does not consume them.
*Test:* log `evidence`/`confidence` for a stratified 20-question sample (2–3 per category, weighted toward the eval suite's "Highest Risk Areas" section) and manually cross-check each against that question's "Grounding Source" and "Hallucination Risk" columns.

### Phase F — Response Planning + Composition (visible behavior changes, one cluster per step)

**11. Create `src/assistant/planning.js`.** Implement `buildResponsePlan()` for exactly two clusters first: `SkillVerification`/gap-disclosure questions and `Recruiter` questions (the eval suite's two highest-frequency predicted-gap clusters). Not yet called from `assistant.js`.
*Test:* unit-call `buildResponsePlan()` with 10 hand-built fixture inputs (5 per cluster) covering `'owned'`/`'gap'`/`'unknown'` and `confidence.tier` `'high'`/`'low'`; inspect the returned `blocks` array for correctness against §7's block definitions.

**12. Restructure `src/assistant/providers.js`.** Add `_renderPlan()`/`_renderBlock()` and the renderers needed for step 11's two clusters (`_renderDirectAnswer`, `_renderEvidence`, `_renderGapDisclosure`, `_renderRecruiterFraming`, `_renderHonestDecline`, `_renderFollowupHint`-as-no-op), relocating the corresponding method bodies per §8.3. Wire `assistant.js`'s Stage 7 call (`planning.buildResponsePlan()`) and add the `ctx.plan`-present branch inside `generate()`, falling back to today's existing routing when no plan is present (every `questionType` not yet handled by step 11 falls back automatically — this is what makes the step safe to ship on its own).
*Test:* full transcript diff, before/after, for the SkillVerification category (~15–20 questions, most of them today's predicted gaps) and the Recruiter category (~15 questions). Confirm previously-passing questions still pass; confirm previously-failing gap questions now answer honestly and specifically (e.g. "Do you know Kubernetes?" no longer falls back to generic text).

**13. Extend `planning.js` + `providers.js` together, once per remaining cluster** (`Comparison`, `Strengths`/`Behavioral`, `Recommendation`, `SelfModel`/`Identity`, `Experience`/`Resume`), each as its own commit, per §8.3's disposition table.
*Test per cluster:* the matching `docs/AI_EVALUATION_SUITE.md` category, before/after transcript diff, reviewed independently before moving to the next cluster.

**14. Delete now-dead code.** Remove `_EXPERIENCE_STOPWORDS` and any `_xResponse` method whose body is now fully relocated with zero remaining callers — confirmed via a repository-wide text search for the method name before deletion, not by inspection alone.
*Test:* repository-wide search for each deleted identifier returns zero matches; full 203-question manual regression pass (the acceptance gate for the whole migration).

### Phase G — Cleanup

**15. Update documentation.** Revise `assistant.js`'s `THE 12-STEP PIPELINE` comment block to reflect the 5a–5e insertions (§5); add a `docs/CHANGELOG.md` entry.
*Test:* documentation-only; reviewed by reading, not executed.

---

## 10. Out of Scope

Explicitly excluded from this specification and from the implementation it authorizes:

- **`MultiTopicAcknowledgement` block type.** Composite multi-question turns ("what's your stack AND why should we hire you") are not specially handled — today's behavior (answering the first/dominant clause) continues. Candidate for a future phase once the 10-block core is stable.
- **Multi-topic focus stacks.** `DiscourseState.focusEntities` holds only the immediately preceding turn's entities, fully overwritten each turn — no history of "topics before that." A visitor jumping between 3 topics and returning to the first with a bare pronoun will not resolve correctly; this is an accepted limitation, not a bug to fix in this phase.
- **Consolidating `memory.js`'s redundant fields.** `lastProject`/`activeTopic` and `discourse.focusEntities`/`discourse.lastQuestionFrame` carry overlapping information after this migration. Unifying them is deferred to a future cleanup phase specifically so this migration never needs to touch `memory.js`'s existing persisted shape beyond adding one new field.
- **JD-match and Interview Mode integration into the block/plan system.** `_jdMatchResponse()` and all of `interview.js` keep their existing, separate response-shaping conventions. Neither is restructured to emit `ResponsePlan`s. (Rationale: both already have purpose-built, working, structurally different output — a job-description match report and a turn-by-turn interview question — that do not naturally decompose into the same block vocabulary as a portfolio Q&A answer without forcing an awkward fit.)
- **Automated regression harness for the 203-question evaluation suite.** This spec defines, per implementation step, exactly what "passing" means and against which question categories — but building a scripted/CI-integrated test runner that executes all 203 questions against a live or headless instance of the assistant and diffs responses is a separate, future engineering effort, not part of this migration.
- **Exposing `ConfidenceAssessment.tier` or `basis` to the visitor.** These are internal reasoning signals for `planning.js`. No UI badge, label, or "confidence: 62%" style disclosure is introduced. The visitor only ever sees the *effect* of confidence (which blocks were chosen, how the prose is phrased), never the value itself.
- **Concept-type entity resolution beyond `SKILLS_TAXONOMY`.** `EntityType: 'concept'` exists in the enum (§2) for forward-compatibility only; no concept-matching logic (e.g. recognizing "microservices," "idempotency," "eventual consistency" as trackable entities) ships in this phase.
- **Any visual/UI change.** No new cards, no new components, no CSS, no animation, no theme work — unchanged from Sprint 3's own "out of scope" list, restated here because this spec's Response Composition changes touch `providers.js` heavily enough that the boundary is worth restating explicitly.
- **Any change to `renderer.js`, `streaming.js`, `tools.js`, `awareness.js`, or `content.js`.** All four are confirmed untouched by every phase in §9.
- **Backend, external APIs, production LLM integration, authentication, analytics, cloud services.** Unchanged from every prior sprint's out-of-scope boundary — this remains a fully offline, static-bundle architecture per `docs/PROJECT_ARCHITECTURE.md`'s Zero-Build Architecture.
- **Renumbering or rewriting `assistant.js`'s pipeline comments beyond the one update in Phase G step 15.** No cosmetic pass over the rest of the file.
- **Multi-language support, voice/audio input or output.** Not part of this or any prior sprint's scope.
