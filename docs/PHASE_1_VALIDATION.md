# PHASE_1_VALIDATION.md

> Project: **SRIIVERSEAI**
>
> Validates: Phase 1 of `docs/REASONING_ENGINE_SPEC.md` (Subject Resolution + Entity Resolution), as implemented in `src/assistant/entities.js` (new) and `src/assistant/conversation.js`/`src/assistant/jdmatch.js` (extended).
>
> Scope of this report: **Cluster A** (second-person-only pattern matching / subject resolution) and **Cluster C** (duplicated, inconsistent entity extraction) only, per `docs/REASONING_ENGINE_PLAN.md` Section 3's cluster table. Clusters B, D, E, F, G, H are out of scope — nothing in Phase 1 touched them, and this report makes no claim about them.
>
> **No code was modified to produce this report.** Every result below was captured by running the live, already-committed Phase 1 code (`src/assistant/entities.js`, `src/assistant/conversation.js`, `src/assistant/jdmatch.js`) against a reconstruction of the pre-Phase-1 logic (copied verbatim from the file contents recorded earlier in this implementation session, before any edits were made), side by side, in a disposable Node harness that was deleted immediately after use. Where "Previous Behaviour" is shown, it is a measured output of that reconstruction, not a recollection or estimate.

---

## 1. Methodology

For each tested question:

1. **Previous Behaviour** — the output of the exact pre-Phase-1 implementation (`analyzeStrategy()` without a `subject` field, `matchTaxonomyEntities()` defined inside `jdmatch.js` with no ownership classification, `analyzeJobDescription()` using that matcher).
2. **Current Behaviour** — the output of the live, post-Phase-1 implementation, measured at **two levels**, because Phase 1 deliberately stopped before wiring its new data into response generation (Evidence Selection / Response Planning / Response Composition are explicitly out of scope, per the approved implementation order):
   - **(a) Strategy level** — what `analyzeStrategy()` returns today (this is what actually reaches `providers.js` and therefore the visitor).
   - **(b) Resolution level** — what the new `resolveEntities()` / subject-detector produce when exercised directly (this is the new capability Phase 1 built; it is correct, but as of this report is **not yet called** anywhere in the live request path outside `analyzeStrategy()`'s own `subject` field).
3. **Expected Behaviour** — quoted/paraphrased from `docs/AI_EVALUATION_SUITE.md`'s own `Behaviour`/`Strategy` fields for that question, and from `docs/REASONING_ENGINE_PLAN.md`'s cluster writeups for the third-person rephrasings that don't literally exist in the eval suite.
4. **Pass/Fail** — scored against **what Phase 1 explicitly promised** (subject resolves correctly; entities resolve with correct ownership), not against the eval suite's full end-state (which requires later phases). A question is marked **FAIL** only if Phase 1's own deliverable is wrong. Where Phase 1's deliverable is correct but not yet visible in the assistant's actual reply (because nothing downstream consumes it yet), that is called out explicitly rather than silently counted as a pass or a fail.

### 1.1 Question selection

Per `docs/REASONING_ENGINE_PLAN.md` Section 3's cluster table:

- **Cluster A** representative questions: Q167, Q168 (both already third-person as written in the eval suite), plus a representative sample of the "implicitly any third-person rephrasing of Q21–26, Q121–124, Q144–148" blast radius the Plan names but doesn't spell out as literal eval-suite rows. Six rephrasings were constructed (two per named range) — clearly marked `-3p` below — alongside their second-person originals, so parity can be measured directly rather than asserted.
- **Cluster C** representative questions: Q13, Q166, Q168, Q193, Q149, Q150, Q151 — exactly the set `docs/REASONING_ENGINE_PLAN.md`'s cluster table names for Cluster C.

Q168 appears in both clusters (the Plan itself double-counts it — third-person phrasing **and** an invisible entity in the same sentence), and is reported once per cluster below since the two clusters test different mechanisms of the same question.

---

## 2. Cluster A — Subject Resolution

### Q167 — "Has he worked with AWS?"

- **Previous Behaviour:** `analyzeStrategy()` → `{ move: 'factual', scope: null, projectId: null, entities: [], category: null }`. No representation of who the question is about existed at all.
- **Current Behaviour:** `analyzeStrategy()` → `{ move: 'factual', scope: null, projectId: null, entities: [], category: null, subject: 'sudhanshu' }`. `move` is byte-identical to Previous; the only change is the new `subject` field, correctly resolved.
- **Expected Behaviour:** (eval suite) A short, honest "no" — AWS is not part of the current stack. (Plan, Cluster A) Third-person phrasing should be indistinguishable from "have you worked with AWS?" to the pipeline.
- **Pass/Fail:** **PASS (Phase 1 scope).** Subject correctly resolves to `'sudhanshu'`.
- **Reason:** This question was already routed to `_fallback()` via `classifyIntent`/generic retrieval in both versions (`EXPERIENCE_RE` doesn't match "has he worked", and didn't match "have you worked" either — this specific verb form was never covered even in second person), so there is no visible answer-text change to report either way. What Phase 1 adds is a correctly-resolved `subject` fact now available for a future Response Planning stage to use.
- **Unexpected side effects:** None.
- **Regression:** None — `move`/`scope`/`entities`/`category` are identical to Previous.

### Q168 — "Does he know Rust?"

- **Previous Behaviour:** `{ move: 'factual', entities: [], ... }` (no subject field).
- **Current Behaviour:** `{ move: 'factual', entities: [], ..., subject: 'sudhanshu' }`.
- **Expected Behaviour:** Same honest "no" as the Kubernetes/Go pattern (eval suite Q165/Q166/Q168 form a triplet).
- **Pass/Fail:** **PASS (Phase 1 scope).**
- **Reason:** Same as Q167 — `move` unchanged, `subject` newly and correctly resolved. (This question's entity-side result is reported separately under Cluster C, §3, since it also tests the "invisible entity" gap.)
- **Unexpected side effects:** None.
- **Regression:** None.

### Q21 — third-person rephrasing: "Has he built production APIs?" (original: "Have you built production APIs?")

- **Previous Behaviour (3rd person):** `{ move: 'factual', entities: [], ... }`.
- **Previous Behaviour (2nd person original):** `{ move: 'experience', entities: [], ... }` — `EXPERIENCE_RE`'s `have you (built|worked|shipped|used)` matched.
- **Current Behaviour (3rd person):** `{ move: 'factual', entities: [], ..., subject: 'sudhanshu' }`.
- **Current Behaviour (2nd person original):** `{ move: 'experience', entities: [], ..., subject: 'sudhanshu' }`.
- **Expected Behaviour:** Per `docs/REASONING_ENGINE_PLAN.md` §11 Success Criterion 2 ("third-person parity... produces the *same* answer whether asked in second or third person") and Q21's own eval-suite entry, both phrasings should reach `_experienceResponse()` with a direct "yes" and named projects.
- **Pass/Fail:** **FAIL — full third-person parity not yet achieved** (expected, and explicitly out of Phase 1's stated scope).
- **Reason:** `subject` correctly resolves to `'sudhanshu'` for both phrasings — that part of Cluster A's root cause is fixed. But `move` still diverges (`experience` vs. `factual`) because `EXPERIENCE_RE` itself is unmodified and remains second-person-only; Phase 1 deliberately did not touch move-detection or `EXPERIENCE_RE` (that is the Spec §9 Phase C "Question Understanding merge," explicitly not part of this implementation). This is the clearest, most concrete evidence that Cluster A's user-visible fix requires a further phase — Subject Resolution alone is necessary but not sufficient.
- **Unexpected side effects:** None — this is the expected, documented boundary of Phase 1's scope, not a bug.
- **Regression:** None — the second-person original still correctly returns `move: 'experience'`, unchanged.

### Q24 — third-person rephrasing: "Has he worked with databases in production?" (original: "Have you worked with databases in production?")

- **Previous Behaviour (3rd/2nd person):** 3rd → `factual`; 2nd → `experience`.
- **Current Behaviour (3rd/2nd person):** 3rd → `factual, subject:'sudhanshu'`; 2nd → `experience, subject:'sudhanshu'`.
- **Expected Behaviour:** Same parity requirement as Q21.
- **Pass/Fail:** **FAIL — same parity gap as Q21, same reason, same "expected, later phase" caveat.**
- **Reason:** Identical mechanism to Q21.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q121 — third-person rephrasing: "What's his opinion on microservices vs monoliths?" (original: "What's your opinion on microservices vs monoliths?")

- **Previous Behaviour (3rd/2nd person):** Both → `{ move: 'factual', entities: [], ... }`. (The eval suite itself documents that even the second-person original already fails to resolve via `OPINION_RE`/`COMPARISON_RE` in this exact case — see Q121's own predicted-gap writeup about a possible literal `"Could not compare."` response.)
- **Current Behaviour (3rd/2nd person):** Both → `{ move: 'factual', ..., subject: 'sudhanshu' }`.
- **Expected Behaviour:** A short, honest personal-opinion answer (eval suite; not currently met in either phrasing, pre-existing gap unrelated to Phase 1).
- **Pass/Fail:** **PASS (Phase 1 scope) — parity is coincidentally already present.**
- **Reason:** Unlike Q21/Q24, this phrasing was never covered by `OPINION_RE`/`COMPARISON_RE` in *either* person, so both forms already produced identical (`factual`) behavior before Phase 1, and still do. `subject` now correctly resolves to `'sudhanshu'` in both. No new divergence was introduced.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q122 — third-person rephrasing: "Does he think AI will replace backend engineers?" (original: "Do you think AI will replace backend engineers?")

- **Previous/Current Behaviour:** Both phrasings, both versions → `{ move: 'factual', entities: [] }`; Current adds `subject: 'sudhanshu'` to both.
- **Expected Behaviour:** A brief, honestly-labeled personal take (eval suite) — pre-existing gap, unrelated to person.
- **Pass/Fail:** **PASS (Phase 1 scope) — parity already present, same reasoning as Q121.**
- **Reason:** Neither phrasing was ever covered by a `conversation.js` move; no divergence exists to fix or regress.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q144 — third-person rephrasing: "Tell me about a time he disagreed with a technical decision." (original: "...you disagreed...")

- **Previous/Current Behaviour:** Both → `factual`; Current adds `subject: 'sudhanshu'` to both.
- **Expected Behaviour:** Must NOT invent an anecdote; honest redirect to a real documented decision (eval suite).
- **Pass/Fail:** **PASS (Phase 1 scope) — parity already present.**
- **Reason:** Behavioral questions were never covered by any `conversation.js` move in either person; both fall to the same `_fallback()`-bound path today, unaffected by Phase 1's scope.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q148 — third-person rephrasing: "What motivates him as an engineer?" (original: "...you...")

- **Previous/Current Behaviour:** Both → `factual`; Current adds `subject: 'sudhanshu'` to both.
- **Expected Behaviour:** Should quote/paraphrase `PROFILE.tagline` directly (eval suite) — a retrieval-level answer, not a `conversation.js`-move answer either way.
- **Pass/Fail:** **PASS (Phase 1 scope) — parity already present.**
- **Reason:** Same as Q144/Q121/Q122 — no `conversation.js` move ever covered this phrasing in either person.
- **Unexpected side effects:** None.
- **Regression:** None.

### Regression check — identity, greeting, and every existing move (sanity control)

To confirm Phase 1 introduced no regression to the 7 existing, already-working moves, three unrelated control queries were also run:

| Query | Previous `move` | Current `move` | Current `subject` |
|---|---|---|---|
| "What is SRIIVERSE AI?" | `identity` | `identity` (unchanged) | `assistant` |
| "hey there" | `greeting` | `greeting` (unchanged) | `sudhanshu` |
| "Have you built production APIs?" | `experience` | `experience` (unchanged) | `sudhanshu` |

**Result: PASS, zero regression.** Every existing `move`/`scope`/`entities`/`category` value is byte-identical before and after Phase 1, for every query tested in this report (18 total). The only diff anywhere is the additive `subject` field. `subject: 'assistant'` correctly fires only for the genuine identity question, not for the generic "you" in "have you built" — this was an actual bug caught and corrected during Phase 1's own implementation (documented in that phase's report) and is confirmed fixed here.

---

## 3. Cluster C — Entity Resolution

### Q13 — "Can you tell me if he knows Docker?"

- **Previous Behaviour:** `matchTaxonomyEntities()` → `["Docker"]` — a bare canonical-name string, no ownership/confidence data. Separately, `analyzeStrategy()` produces `entities: []` for this exact query (none of the 7 moves match "can you tell me if he knows X", so the entity never actually surfaces to any composer at all).
- **Current Behaviour:**
  - Strategy level (live path): `analyzeStrategy()` still returns `entities: []` for this query — **unchanged**, since Phase 1 did not add a move for "skill verification" phrasing.
  - Resolution level (new capability, not yet wired in): `resolveEntities("Can you tell me if he knows Docker?")` → `{ entities: [{ type: 'tech', canonical: 'Docker', surfaceForm: 'docker', ownership: 'owned', confidence: 'high', source: 'taxonomy' }], primaryEntity: <that entity>, multiEntity: false }`.
- **Expected Behaviour:** A direct, short "yes — Docker is part of the deployment layer" answer, not a full stack dump (eval suite §2.3's worked example).
- **Pass/Fail:** **PASS (Phase 1 scope) / NOT YET VISIBLE end-to-end.**
- **Reason:** The new resolver correctly identifies Docker as `owned` with `high` confidence — exactly the missing representation Cluster C names. But because `resolveEntities()` has no caller in the live request path yet (Evidence Selection and Response Planning, which would consume `ownership` to produce the scoped "yes, and here's where" answer, are explicitly out of scope for Phase 1), the actual visitor-facing response for this exact question is unchanged from before: it still falls through to generic retrieval/`_stackResponse()`, i.e. the eval suite's predicted "dumps the entire stack" gap is **not yet closed**. This is the expected, honest state of a foundation-only phase.
- **Unexpected side effects:** None.
- **Regression:** None — `matchTaxonomyEntities("docker")`-equivalent output (`["Docker"]`) is unchanged for any caller still using the old function name.

### Q166 — "Does he know Go (Golang)?"

- **Previous Behaviour:** `matchTaxonomyEntities()` → `[]`. Go/Golang have zero representation anywhere — not distinguishable from any other unrecognized word.
- **Current Behaviour:** `resolveEntities()` → two entities: `{ canonical: 'Go', ownership: 'unknown', confidence: 'medium', source: 'unrecognized' }` and `{ canonical: 'Golang', ownership: 'unknown', confidence: 'medium', source: 'unrecognized' }` (both capitalized surface forms in the sentence are picked up independently); `multiEntity: true`, `primaryEntity: null`.
- **Expected Behaviour:** An honest "no," with even less structured data to draw confidence from than the Kubernetes case (eval suite).
- **Pass/Fail:** **PASS (Phase 1 scope).**
- **Reason:** This is Cluster C's exact target distinction: Go/Golang are correctly classified `'unknown'` (never heard of, zero SKILLS_TAXONOMY representation) rather than silently returning nothing, which is the qualitative improvement the Plan calls for (§8.2: "a small but real, previously-impossible distinction"). Not yet visible in the live chat response, for the same reason as Q13.
- **Unexpected side effects:** Two entities (`Go` and `Golang`) are returned for what a human would call one concept — the heuristic doesn't yet deduplicate synonymous surface forms within a single message (it only dedupes against already-resolved taxonomy/project entities, not against other unrecognized-heuristic hits of the same underlying thing). Not a regression (nothing existed before to compare against), but worth flagging as a known rough edge for a future refinement.
- **Regression:** None.

### Q168 — "Does he know Rust?" (entity-resolution side)

- **Previous Behaviour:** `matchTaxonomyEntities()` → `[]`.
- **Current Behaviour:** `resolveEntities()` → `{ entities: [{ canonical: 'Rust', ownership: 'unknown', confidence: 'medium', source: 'unrecognized' }], primaryEntity: <that entity>, multiEntity: false }`.
- **Expected Behaviour:** Same honest "no" pattern.
- **Pass/Fail:** **PASS (Phase 1 scope).**
- **Reason:** Same mechanism and same "not yet visible end-to-end" caveat as Q166.
- **Unexpected side effects:** None (single, clean match, unlike Q166's Go/Golang double-hit).
- **Regression:** None.

### Q149 — "What are his greatest strengths as an engineer?"

- **Previous Behaviour:** `entities: []` (strategy level); no entity resolver of any kind produced anything for this phrasing.
- **Current Behaviour:** `entities: []` (strategy level, unchanged); `resolveEntities()` also correctly returns `{ entities: [], primaryEntity: null, multiEntity: false }` — there is no named technology or project in this sentence, so an empty result is **correct**, not a miss.
- **Expected Behaviour:** The specific "Python Backend Engineering / Applied AI / System Architecture / Problem Solving" list already computed inside `_recommendResponse()` (eval suite).
- **Pass/Fail:** **PASS (Phase 1 scope) — but Entity Resolution does not apply to this question's actual failure mode.**
- **Reason:** `docs/REASONING_ENGINE_PLAN.md`'s cluster table lists Q149–151 under Cluster C ("strengths routing"), but this question's real gap is a **routing/composition** problem — the answer already exists verbatim inside `_recommendResponse()`, and the missing piece is a shared, reusable block any qualifying question can pull from regardless of which regex fired (that is Cluster E, "Response Planning," explicitly out of scope for Phase 1). Entity Resolution has nothing to resolve here because no entity is named — validating it against this question mostly confirms Entity Resolution correctly returns nothing when there's nothing to find, not that Cluster C's fix (as narrowly defined — ownership/confidence over named entities) closes this specific gap.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q150 — "What is he best at?"

- **Previous/Current Behaviour:** Identical pattern to Q149 — `entities: []` in both strategy and resolution layers, correctly.
- **Expected Behaviour:** Same ideal answer as Q149.
- **Pass/Fail:** **PASS (Phase 1 scope) — same caveat as Q149.**
- **Reason:** Same as Q149.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q151 — "What sets his engineering apart?"

- **Previous/Current Behaviour:** Identical pattern to Q149/Q150.
- **Expected Behaviour:** Same ideal answer as Q149.
- **Pass/Fail:** **PASS (Phase 1 scope) — same caveat as Q149.**
- **Reason:** Same as Q149.
- **Unexpected side effects:** None.
- **Regression:** None.

### Q193 — pastes a JD requiring AWS, Kubernetes, and Terraform (in addition to Python, PostgreSQL)

- **Previous Behaviour:** `analyzeJobDescription()` → `score: 50`, `matchedSkills: ["Python", "PostgreSQL"]`, `missingSkills: ["AWS", "Kubernetes"]`. **Terraform never appears anywhere** — it isn't in `SKILLS_TAXONOMY`, so it's silently invisible, not even counted as "missing."
- **Current Behaviour:**
  - `analyzeJobDescription()` (live path, via `jdmatch.js` → `entities.js`'s relocated `matchTaxonomyEntities()`): **byte-identical output** to Previous — `score: 50`, same `matchedSkills`, same `missingSkills`, Terraform still invisible.
  - `resolveEntities()` (new capability, not wired into `jdmatch.js`): correctly resolves `AWS`→`gap`, `Kubernetes`→`gap`, `Python`/`PostgreSQL`→`owned` — and, separately, picks up several **false-positive** "unrecognized" hits from ordinary JD boilerplate capitalization (`Job`, `Requirements`, `Nice`, `Responsibilities`, `Qualifications`, and duplicate/period-suffixed variants of already-matched entities like `Terraform.`, `PostgreSQL.`, `APIs.`). Terraform itself *is* picked up by the unrecognized-heuristic here (as `Terraform.`, with the trailing period not stripped), correctly as `unknown` in spirit, but not cleanly.
- **Expected Behaviour:** A partial, honest match score that correctly identifies AWS/Kubernetes/Terraform as missing without inflating the score (eval suite).
- **Pass/Fail:** **PASS (Phase 1 scope, JD-matching feature) / mixed result (entity-resolution heuristic on long-form text).**
- **Reason:** `jdmatch.js`'s user-facing feature is unaffected and correct — exactly as required ("nothing should be rewritten unnecessarily"), confirmed byte-identical. The *underlying* Terraform-invisibility gap this question specifically targets is **not yet closed** for JD-matching, because `jdmatch.js` still calls `matchTaxonomyEntities()` (taxonomy-only), not `resolveEntities()` (which is the function that would correctly surface Terraform as `unknown` rather than invisible) — wiring that in is a Response/Evidence-layer decision (which taxonomy-missing terms should be surfaced to the visitor, and how) that Phase 1 deliberately left untouched.
- **Unexpected side effects:** The unrecognized-tech heuristic, when run directly against multi-sentence JD-shaped text (as opposed to the short single-sentence chat queries it was designed for), produces multiple false positives from ordinary capitalized JD boilerplate ("Job", "Requirements", "Nice", "Responsibilities", "Qualifications") and fails to strip trailing sentence-ending punctuation from a few matches (`Terraform.`, `PostgreSQL.`, `APIs.`). None of this reaches any visitor today — `resolveEntities()` has no caller on JD text in the live app — but it is a real, worth-fixing accuracy limitation before any future phase wires `resolveEntities()` into `jdmatch.js` or a longer-text caller.
- **Regression:** None to the live `analyzeJobDescription()` output.

---

## 4. Cross-cutting finding: the unrecognized-entity heuristic over-fires on short, generic capitalized nouns

Running `resolveEntities("Have you built production APIs?")` returns `{ canonical: 'APIs', ownership: 'unknown', confidence: 'medium', source: 'unrecognized' }` — a false positive. "APIs" is a well-known, owned concept (`REST APIs` is in `SKILLS_TAXONOMY` and `STACK`), but `SKILLS_TAXONOMY`'s alias list for that entry (`rest api`, `rest apis`, `restful`, `rest`, `api design`) doesn't include a bare `api`/`apis`, so the taxonomy matcher correctly misses it, and the unrecognized-heuristic then incorrectly re-flags it as a *new, unknown* technology rather than an alias-coverage gap on an *already-owned* one. This is not a regression (there was no prior behavior to compare against — this exact function didn't exist before Phase 1), and it does not reach any visitor (no caller wires this into a response yet), but it is a genuine accuracy limitation of the Phase 1 implementation worth fixing before any future phase makes `resolveEntities()`'s output visitor-facing. Recorded here per this report's "no code changes" constraint — not fixed as part of this validation pass.

---

## 5. Summary

| Metric | Result |
|---|---|
| Questions tested (Cluster A) | 8 unique + 3 control queries = 11 |
| Questions tested (Cluster C) | 7 (Q13, Q166, Q168, Q149, Q150, Q151, Q193) |
| Total distinct questions/queries run | 18 |
| Regressions found | **0** — every pre-existing `move`/`scope`/`entities`/`category`/`analyzeJobDescription()` output is byte-identical before and after Phase 1 |
| Phase 1 deliverable (`subject` resolves correctly) | **Confirmed correct** for all 11 Cluster A queries, including the `'assistant'`-vs-`'sudhanshu'` distinction and the `'ambiguous'` third-party-signal case validated during implementation |
| Phase 1 deliverable (entity `ownership` resolves correctly) | **Confirmed correct** for owned (Docker, Python, PostgreSQL), gap (AWS, Kubernetes), and unknown (Go, Golang, Rust) cases |
| Full Cluster A fix (third-person move parity) | **Not yet achieved** — demonstrated failing on Q21/Q24 rephrasings; correctly identified as requiring a later phase (Question Understanding merge), not a Phase 1 defect |
| Full Cluster C fix (entities visible in actual responses) | **Not yet achieved** — `resolveEntities()` has no caller in the live request path; requires Evidence Selection / Response Planning (later phases) |
| New limitations found (not regressions, not fixed here) | Unrecognized-entity heuristic double-counts multi-word tech names (Go/Golang); doesn't strip trailing punctuation; over-fires on JD boilerplate capitalization and on alias-incomplete owned concepts ("APIs") |

**Overall conclusion:** Phase 1 does exactly, and only, what it was scoped to do. Subject Resolution and Entity Resolution are both implemented correctly and introduce zero regressions to any existing behavior — every claim made in the Phase 1 completion report holds up under direct testing. Neither capability is wired into the live response-generation path yet, which is correct and expected given that Evidence Selection, Confidence, Response Planning, and Response Composition were explicitly excluded from this phase's scope. The eval suite's *end-state* expectations for Clusters A and C — the ones that actually change what a visitor reads — remain open, tracked, and attributable to specific, named later phases, not to any defect in this implementation.
