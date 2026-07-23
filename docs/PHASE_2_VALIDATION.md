# PHASE_2_VALIDATION.md

> Project: **SRIIVERSEAI**
>
> Validates: Phase 2 of `docs/REASONING_ENGINE_SPEC.md` (Question Understanding — `QuestionFrame`, `QuestionType` classification, Subject Resolution integrated into move detection), as implemented in `src/assistant/conversation.js` (extended), `src/assistant.js` (narrowed `classifyIntent()`, rewired `ask()`/`buildFollowups()`), and `src/assistant/providers.js` (rewired `generate()`'s two `ctx.intent`-dependent branches).
>
> Scope of this report: **Question Understanding only** — `QuestionFrame` construction, the 13-step `QuestionType` priority chain, and second-/third-person parity for move detection. Entity Resolution (Phase 1, already validated), Evidence Selection, Confidence, Response Planning, and Response Composition are all out of scope — nothing in Phase 2 touched them, and this report makes no claim about them.
>
> **No code was modified to produce this report.** Every result below was captured by calling the live, already-committed Phase 2 `buildQuestionFrame()` directly, in a disposable Node harness deleted immediately after use (per this project's established Phase 1 methodology).

---

## 1. Methodology

For each tested question:

1. **Previous Behaviour** — what `analyzeStrategy()` (Phase 0/Phase 1) returned: `move`/`scope`/`projectId`/`entities`/`category`/`subject`, and separately, what `classifyIntent()` (pre-narrowing) would have returned as a semantic label (`'recruiter' | 'architecture' | 'stack' | 'comparison' | 'resume' | 'profile' | 'project' | 'question'`) for the same query — this second value is what actually reached `providers.js` before Phase 2 and is the thing `questionType` now replaces.
2. **Current Behaviour** — the live `buildQuestionFrame()` output: `questionType`, `subject`, `move` (legacy field, must be unchanged unless explicitly promised otherwise), `template`.
3. **Expected Behaviour** — quoted from `docs/AI_EVALUATION_SUITE.md`'s own `Type:` column for that question (§3's Question Types are the literal source the Spec's `QuestionType` enum was adopted from, per §3.1) and/or `docs/REASONING_ENGINE_PLAN.md`'s Cluster A parity requirement.
4. **Pass/Fail** — scored against **what Phase 2 explicitly promised**: (a) `QuestionFrame` is constructed with the new fields, (b) the priority-chain classification in Spec §3.1 is implemented faithfully and in the specified order, (c) second-/third-person parity is achieved for questions whose classification depends only on subject-canonicalizable phrasing. A question is marked **FAIL** only if Phase 2's own deliverable is wrong — not if the eval suite's `Type:` label differs from Phase 2's output for a category whose priority-chain step was never meant to catch that exact phrasing (see §4, deviations).

### 1.1 Question selection

Per the user's instruction to "run only the benchmark questions affected by Question Understanding":

- **Cluster A re-test** (the two questions Phase 1's own report explicitly marked **FAIL — parity not yet achieved, deferred to a later phase**): Q21, Q24, both second-/third-person forms. This is the single most direct, load-bearing test of Phase 2's stated purpose.
- **Every absorbed `classifyIntent()` branch** (Recruiter, Architecture, Project, Stack, Comparison, Resume, Identity/profile) — representative samples, second- and third-person where the question supports it.
- **Every genuinely new `QuestionType` value** (SkillVerification, Behavioral, Career, Limitation, Recommendation, EvidenceRequest, Conversation) — representative samples from the eval suite's matching `Type:` sections.
- **Regression control** — Greeting, Identity (assistant-subject), and one already-passing Experience query, to confirm zero drift in previously-correct behaviour.
- **Edge cases** — empty string, non-alphanumeric input.

62 distinct queries were exercised in total.

---

## 2. Primary deliverable: Cluster A move-parity re-test

This is the exact gap Phase 1's own validation report left open. Quoting that report directly (§2, Q21): *"`move` still diverges (`experience` vs. `factual`) because `EXPERIENCE_RE` itself is unmodified and remains second-person-only... This is the clearest, most concrete evidence that Cluster A's user-visible fix requires a further phase."*

### Q21 — "Have you built production APIs?" / "Has he built production APIs?"

- **Previous Behaviour:** 2nd person → `move: 'experience'`. 3rd person → `move: 'factual'`. **Diverged.**
- **Current Behaviour:** 2nd person → `questionType: 'Experience'`, `move: 'experience'`. 3rd person → `questionType: 'Experience'`, `move: 'factual'` (legacy `move` field is intentionally left untouched — see §4.1 below for why this is not a contradiction).
- **Expected Behaviour:** Both phrasings reach the same downstream composer (Spec §11 Success Criterion 2 language, and this project's own Cluster A intent).
- **Pass/Fail:** **PASS.** The field `providers.js` and `assistant.js` actually consume from this point forward is `questionType`, not the legacy `move` string — and `questionType` is now byte-identical (`'Experience'`) for both phrasings. Third-person "has he built production APIs?" is canonicalized to "have you built production APIs?" before `EXPERIENCE_RE`/`RESUME_RE` ever run (`toSubjectCanonicalForm()`), so it matches exactly as its second-person original does.
- **Reason:** This is the mechanism Phase 2 was scoped to build. `move` itself is deliberately left as a Phase-1-frozen, byte-for-byte-preserved legacy field (per the user's "preserve all existing public APIs" instruction) — its continued 2nd/3rd divergence is cosmetic dead weight now that `questionType` is the live signal, not a functional parity gap. See §4.1 for the full reasoning and the one place this distinction actually matters.

### Q24 — "Have you worked with databases in production?" / "Has he worked with databases in production?"

- **Previous/Current Behaviour, Expected, Pass/Fail:** Identical mechanism and identical result to Q21 in every respect.
- **Reason:** Same as Q21.

**Conclusion for Cluster A:** The parity gap Phase 1 identified and explicitly deferred is now closed at the `questionType` level — the field that actually reaches response generation. This is Phase 2's central, load-bearing success.

---

## 3. Absorbed `classifyIntent()` branches — regression check

For each, "Previous" = the semantic label `classifyIntent()` returned before narrowing (now dead code, reconstructed from the pre-edit file contents recorded during implementation); "Current" = `questionType`.

| Query | Previous label | Current `questionType` | Match? |
|---|---|---|---|
| "Why should we hire him?" (Q130) | `recruiter` | `Recruiter` | ✅ |
| "What makes him stand out from other candidates?" (Q131) | `recruiter` | `Recruiter` | ✅ |
| "If I'm hiring for an AI engineer role, should I consider Sudhanshu?" (Q120) | `recruiter` | `Recruiter` | ✅ |
| "How is the system architected?" | `architecture` | `ArchitectureExplanation` | ✅ |
| "How did he design the pipeline?" (3rd person) | `architecture` | `ArchitectureExplanation` | ✅ (person-neutral regex, no canonicalization needed) |
| "Tell me about your projects" | `project` | `ProjectExplanation` | ✅ |
| "Tell me about QueryForgeAI" (bare project name, no keyword) | `project`* | `ProjectExplanation` | ✅ (*see Note A below) |
| "What's your tech stack?" | `stack` | `TechnologyExplanation` | ✅ |
| "What technologies does he know?" (3rd person, open enumeration) | `stack` | `TechnologyExplanation` | ✅ |
| "Flask vs FastAPI" / "React vs Vue" / "Compare QueryForgeAI and RepoRadarAI" | `comparison` | `Comparison` | ✅ |
| "Can you summarize your resume?" / "Walk me through your experience" | `resume` | `Experience` (`template: 'resume-summary'`) | ✅ |
| "What's your background?" (Q18) | `profile`† | `Experience` (`template: 'resume-summary'`) | ✅ — see Note B (this is an **improvement**, not just parity) |
| "What's his background?" (Q18, 3rd person) | `profile`† (2nd-person-only in the old regex, so 3rd person actually fell to `'question'` before) | `Experience` (`template: 'resume-summary'`) | ✅ — parity now achieved, and matches Note B's improvement |
| "Who is Sudhanshu?" / "Tell me about him" | `profile` | `Identity` | ✅ |

*Note A: the old `PROJECT_RE`/`'project'` label required a keyword ("project," "work," "portfolio," "built," "ship"); "Tell me about QueryForgeAI" contains none of those, so it never actually matched the old `'project'` branch either — it fell to `'question'`. Phase 2 adds an explicit bare-project-name check (documented in `conversation.js`'s `ProjectExplanation` comment) that the old code never had. This is a genuine, deliberate improvement made in-scope (subject resolution/move detection integration naturally required re-deriving this branch), not a byte-for-byte relocation.

†Note B: `docs/AI_EVALUATION_SUITE.md`'s own Q18 entry documents, as a **predicted gap**, that the old `classifyIntent()` if-chain checked its broad `/who|about|introduce|background/` `'profile'` branch *before* the `'resume'`-detecting line, so "What's your background?" was misclassified as `'profile'` (routed to `_profileResponse()`) instead of `'resume'` (`_resumeResponse()`), and explicitly names the resume-routing as the *ideal* fix. Phase 2's `RESUME_RE` (bare `background` keyword, checked at priority step 6, before nothing lower-priority claims it) and narrower `PROFILE_IDENTITY_RE` (deliberately excludes bare `background` — see `conversation.js`'s inline comment) together resolve exactly this predicted gap, for both persons.

**Result: zero regressions found across all 7 absorbed branches.** One eval-suite-documented predicted gap (Q18) is now fixed as a byproduct of doing the relocation correctly, and one bare-project-name case (unrelated to any predicted gap) is newly handled.

---

## 4. New `QuestionType` values

### 4.1 SkillVerification — new, and the direct payoff of Subject Resolution + priority ordering

| Query | `questionType` | Expected (`Type:` col) | Match? |
|---|---|---|---|
| "Do you know Python?" (Q55) | `SkillVerification` | Skill Verification | ✅ |
| "Do you know SQL?" (Q59) | `SkillVerification` | Skill Verification | ✅ |
| "Do you know React?" (Q63) | `SkillVerification` | Skill Verification | ✅ |
| "Do you know Docker?" (Q75/Q179 form) | `SkillVerification` | Skill Verification | ✅ |
| "Does he know Kubernetes?" (Q165, 3rd person) | `SkillVerification` | Skill Verification | ✅ |
| "Does he know Go (Golang)?" (Q166, 3rd person) | `SkillVerification` | Skill Verification | ✅ |
| "Does he know Rust?" (Q168, 3rd person) | `SkillVerification` | Skill Verification | ✅ |
| "Can you prove you know backend engineering?" (Q125) | `EvidenceRequest` | Skill Verification | ❌ — see §5.1 |
| "What are his greatest strengths as an engineer?" (Q149, 3rd person, no named tech) | `Unknown` | Skill Verification | ❌ — see §5.1 |

`SkillVerification` for every named-technology "do/does X know Y" question — the exact phrasing Phase 1's Cluster A named as needing this phase — now classifies identically regardless of person. This is Phase 2's second load-bearing success, alongside Cluster A itself.

### 4.2 Behavioral / Career / Limitation — new, and the Q144–Q160 parity set

| Query | `questionType` | Expected | Match? |
|---|---|---|---|
| "Tell me about a time you disagreed with a technical decision." (Q144, 2nd) | `Behavioral` | Behavioral | ✅ |
| "Tell me about a time he disagreed with a technical decision." (Q144, 3rd) | `Behavioral` | Behavioral | ✅ — parity confirmed |
| "How do you handle tight deadlines?" (Q145) | `Behavioral` | Behavioral | ✅ |
| "What motivates you/him as an engineer?" (Q148, both persons) | `Behavioral` | Behavioral | ✅ — parity confirmed |
| "What are his career goals?" (Q155, 3rd) | `Career` | Career | ✅ |
| "Where does he see himself in 5 years?" (Q156, 3rd) | `Career` | Career | ✅ |
| "What are his weaknesses?" (Q152, 3rd) | `Limitation` | Limitation | ✅ |
| "What could he improve on?" (Q153, 3rd) | `Limitation` | Limitation | ✅ |
| "What's he not good at?" (Q154, 3rd) | `Limitation` | Limitation | ✅ |
| "How do you approach an ambiguous requirement?" (Q107) | `Unknown` | Behavioral | ❌ — see §5.2 |
| "Describe a hard technical problem you solved." (Q108) | `Unknown` | Behavioral | ❌ — see §5.2 |
| "How would he perform in a fast-paced startup environment?" (Q136, 3rd) | `Unknown` | Behavioral | ❌ — see §5.2 |
| "What's his educational background?" (Q158, 3rd) | `Experience` (`resume-summary`) | Limitation | ❌ — see §5.3 |

Q144/Q148/Q152–156's exact-phrasing parity (the specific rephrasing pairs the Reasoning Engine Plan named) is fully confirmed. Coverage gaps for phrasing variants the priority-chain regexes weren't authored to catch are documented in §5.

### 4.3 Recommendation / EvidenceRequest / Conversation — new, explicitly "narrow-pattern" per Spec §3.1 step 12

| Query | `questionType` | Expected | Match? |
|---|---|---|---|
| "Show me evidence you can build production systems." (Q126) | `EvidenceRequest` | Evidence Request | ✅ |
| "Which backend framework would you recommend for a new project?" (Q117) | `Opinion` | Recommendation | ❌ — see §5.4 (spec-ordering artifact, not a defect) |
| "Which database would you choose for a new app?" (Q118) | `Opinion` | Recommendation | ❌ — see §5.4 |
| "What would you recommend for someone starting to learn backend engineering?" (Q119) | `Unknown` | Recommendation | ❌ — see §5.4 |
| "Do you remember me from a previous visit?" (Q164) | `Unknown` | Conversation | ❌ — see §5.5 |
| "Okay, thanks." (ack-style) | `Unknown` | Conversation | ❌ — see §5.5 |

### 4.4 Regression control (unaffected categories, sanity check)

| Query | `questionType` | `move` | `subject` | Result |
|---|---|---|---|---|
| "Hi" | `Greeting` | `greeting` | `sudhanshu` | unchanged, ✅ |
| "Who are you?" | `Identity` | `identity` | `assistant` | unchanged, ✅ |
| "What is SRIIVERSE AI?" | `Identity` | `identity` | `assistant` | unchanged, ✅ |
| "" (empty) | `Unknown` | `factual` | `ambiguous` | handled gracefully, no throw, ✅ |
| "👍" (emoji only) | `Unknown` | `factual` | `sudhanshu` | handled gracefully, no throw, ✅ |

**Zero regressions found in any control query.**

---

## 5. Remaining gaps (not regressions — pre-existing or spec-inherent, explicitly not fixed in this phase)

### 5.1 SkillVerification: open-ended "strengths" phrasing and "prove you know X" phrasing

Q149 ("What are his greatest strengths as an engineer?") names no technology, so `SKILL_VERIFICATION_RE`'s "do/does X know Y" shape never matches it — it falls to `Unknown`. Q125 ("Can you prove you know backend engineering?") matches `EVIDENCE_REQUEST_RE`'s "prove (it|that|you|he)" before `SKILL_VERIFICATION_RE` ever gets a turn, per priority order (step 7 vs step 12 — `EvidenceRequest` is actually checked *later*, but `SKILL_VERIFICATION_RE` itself doesn't match this phrasing either, so the point is moot; `EvidenceRequest` is arguably the more semantically honest label here regardless of the eval suite's hybrid "Skill Verification" tag — Q125's own eval entry does not list it as a pure category). **Not fixed** — Phase 1's own report already flagged Q149–151 as "Entity Resolution has nothing to resolve here... this is a routing/composition problem" (Cluster E, out of scope for both phases).

### 5.2 Behavioral: phrasing variants beyond the eval suite's named rephrasing pairs

`BEHAVIORAL_RE` was authored to match the Spec's own required parity pairs ("tell me about a time...", "how do(es) you/he handle/prioritize...", "what motivates you/him"). It does not attempt to match every possible behavioral-interview phrasing in the 200-question eval suite ("how do you approach an ambiguous requirement," "describe a hard technical problem," "how would he perform in a fast-paced startup"). These fall to `Unknown`, exactly as they did before Phase 2 (no regression — `classifyIntent()` never had a `'behavioral'` branch at all). **Not fixed** — broadening `BEHAVIORAL_RE` to catch every interview-style phrasing in the suite is a coverage-completeness task, not a Question Understanding *architecture* task, and risks false-positive drift into `TechnologyExplanation`/`Opinion` territory without a dedicated pass.

### 5.3 "Background" as a bare keyword is genuinely ambiguous between Experience and Limitation

Q158 ("What's his educational background?") and its siblings (Q169 "What was his GPA?", Q171 "What companies has he worked for?") are typed `Limitation` in the eval suite specifically because `content.js` has no education/GPA/employment-history data — the eval suite's `Limitation` label here describes an **honesty-under-missing-content** expectation, not a semantic question-shape. `RESUME_RE`'s bare `background` keyword (added in this phase to fix Q18, see §3 Note B) makes "educational background" also route to `Experience`. This is a real, known trade-off, not an oversight: narrowing `RESUME_RE` to exclude "educational background" specifically would require either a hand-authored exclusion list or genuine semantic understanding, neither of which is Question Understanding's job — recognizing that a fact isn't documented is Evidence Selection's responsibility (explicitly out of scope for Phase 2), not Stage 2's. `Q169`/`Q171`/`Q172`/`Q170` (GPA, companies, exact DOB, years of experience) similarly route to `Experience` or `Unknown` today and will require Evidence Selection to correctly produce an honest decline regardless of which `questionType` they carry.

### 5.4 Recommendation is correctly low-priority per spec, which means Opinion's broader net catches it first

Spec §3.1 explicitly places `Recommendation` at priority step 12 — after `Opinion` (step 5). `OPINION_RE` (`would you (use|choose|recommend|pick)`, unchanged since Phase 0) already matches "which backend framework would you recommend" and "which database would you choose" before `RECOMMENDATION_RE` is ever reached. This is not a bug in this phase's implementation — it is the literal, explicit consequence of following the Spec's specified priority order. Flagged here as a **deviation between the eval suite's per-question `Type:` label and the Spec's own construction rule**, for the reviewer's awareness, not fixed unilaterally (reordering steps 5 and 12 was not requested and is a judgment call about intended behavior, not an implementation defect).

### 5.5 Conversation: narrow by design, per spec

`CONVERSATION_RE` only matches short, fixed acknowledgement phrases (`ok`, `cool`, `thanks`, etc. — an exact-match anchor, `^...$`). "Do you remember me from a previous visit?" is a substantive question, not chit-chat, and was never intended to match this pattern; it falls to `Unknown`, same as pre-Phase-2 (`classifyIntent()` had no `'conversation'` branch). **Not fixed** — this question's real gap is memory-recall capability (a Response Composition / `memory.js` concern), not question-type misclassification.

### 5.6 `Capability` is in the `QuestionType` enum but has no priority-chain step

**This is a deviation in the Spec itself**, not an implementation gap: §3.1's enum reference (line 316) lists `Capability` as a valid `QuestionType` value, but the 13-step construction-rule priority chain immediately below it (lines 356–368) has no step that produces `Capability` — the numbered list goes `Greeting → Identity → Comparison → Behavioral/Career/Limitation → Opinion → Experience → SkillVerification → Recruiter → ArchitectureExplanation → ProjectExplanation → TechnologyExplanation → Recommendation/EvidenceRequest/Conversation → Unknown`, and no step is named `Capability`. This implementation follows the construction rule exactly as written (per the user's "proceed exactly as defined" instruction), which means `Capability` is currently unreachable — any query that should ideally be `Capability` (e.g. Q11 "Can you match a job description against his skills?", Q12 "Do you support interview practice?", Q14 "What kind of questions can I ask you?") instead falls to whichever other step happens to match first, or to `Unknown`. Authoring a `CAPABILITY_RE` and inserting it into the priority chain was not attempted, since the Spec gives no guidance on where in the 13-step order it should sit, and inventing an ordering unilaterally would be a judgment call beyond "implement only Question Understanding... exactly as defined." **Flagged for the reviewer to resolve** (either add an explicit step to the Spec, or confirm `Capability` is intentionally dead/reserved for a future phase).

---

## 6. Deviations from specification (summary)

1. **§5.6 above** — `Capability` enum value has no reachable priority-chain step in Spec §3.1 itself. Implementation followed the construction rule literally; `Capability` is currently unreachable. This is the most significant deviation and needs explicit reviewer direction.
2. **`RESUME_RE` bare-`background` addition** (§3, Note B) — one line, explicitly commented in `conversation.js`, deviating from a byte-for-byte verbatim relocation of the old regex specifically to close a gap the eval suite's own Q18 entry names as the *ideal* fix. Net positive, but is a deviation from "relocate verbatim" in the narrow sense.
3. **`ProjectExplanation` bare-project-name check** (§3, Note A) — new logic with no old-`classifyIntent()` equivalent, added because Subject/move integration required a working `ProjectExplanation` branch and the verbatim-relocated `PROJECT_RE` alone left an obvious, easy-to-hit hole ("Tell me about QueryForgeAI").
4. **No other deviations.** All 7 absorbed branches, the Behavioral/Career/Limitation triad, SkillVerification, and the Recommendation/EvidenceRequest/Conversation triad are implemented exactly per Spec §3.1's priority order and Spec §8.2's relocation table, including accepting the Spec's own priority order even where it produces a result that differs from the eval suite's informal `Type:` label (§5.1, §5.4).

---

## 7. Summary

| Metric | Result |
|---|---|
| Total distinct queries tested | 62 |
| Cluster A parity re-test (Q21, Q24, both persons) | **PASS** — `questionType` now identical for both persons; this was Phase 1's one explicitly deferred failure, now closed |
| Absorbed `classifyIntent()` branches (Recruiter, Architecture, Project, Stack, Comparison, Resume, Identity/profile) | **PASS**, zero regressions, one eval-suite-documented gap (Q18) incidentally fixed |
| New SkillVerification, Behavioral, Career, Limitation types (named-parity-pair queries) | **PASS** — full second-/third-person parity confirmed on every Spec-required pair |
| New Recommendation, EvidenceRequest, Conversation types | Partially reachable, exactly as narrowly scoped by Spec §3.1 step 12's own wording |
| Regression control (Greeting, Identity, empty input, non-text input) | **PASS**, zero regressions, zero crashes |
| `node --check` on all 3 touched files | **PASS**, zero syntax errors |
| Spec-level inconsistency found | `Capability` enum value unreachable in the Spec's own priority chain (§5.6/§6.1) — needs reviewer direction, not fixed unilaterally |
| Public API preservation | `move`/`scope`/`projectId`/`entities`/`category` fields unchanged in shape and (except Q18's Note B correction and the new bare-project-name check) unchanged in value; `analyzeStrategy` export removed and replaced by `buildQuestionFrame` per Spec §8.2's explicit instruction to rename it |

**Overall conclusion:** Phase 2 achieves both things it was principally scoped to fix — the Cluster A move/questionType parity gap Phase 1 explicitly left open (Q21, Q24, and by the same mechanism, every other "have/has X built/worked/shipped/used Y" pair), and full second-/third-person parity for every new QuestionType the Spec's Behavioral/Career/Limitation/SkillVerification checks were designed to catch. Zero regressions were found in any previously-working behaviour across 62 tested queries and 3 syntax-checked files. The gaps and deviations documented in §5–6 are either pre-existing (present before Phase 1 or Phase 2 touched this code), inherent to the Spec's own explicitly "narrow-pattern" language for certain checks, or — in one case (`Capability`) — a genuine inconsistency in the Spec document itself that this implementation deliberately did not resolve unilaterally, in keeping with the instruction to implement Phase 2 "exactly as defined."
