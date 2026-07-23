# AI_EVALUATION_SUITE.md

> Project: **SRIIVERSEAI**
>
> Version: 1.0
>
> Status: **DRAFT — awaiting approval. This is an evaluation benchmark, not an implementation. No source code has been modified to produce this document.**
>
> Scope note: this suite was authored after a full, fresh read of the live repository — every document in `docs/` and every module in `src/assistant/` plus `src/assistant.js` and `src/content.js` — as they exist today, *after* Sprint 3 (Recruiter Mode, Resume Intelligence, JD Matching, Interview Mode, Memory Improvements) and the Conversation Intelligence upgrade (`assistant/conversation.js` strategy layer + `assistant/persona.js` authored voice). Every "Expected Conversation Strategy" and "Grounding Source" field below is grounded in the actual current code paths — not a hypothetical future architecture — cross-checked line-by-line against `assistant.js`, `assistant/conversation.js`, `assistant/providers.js`, `assistant/knowledge.js`, `assistant/jdmatch.js`, `assistant/interview.js`, `assistant/memory.js`, `assistant/persona.js`, and `content.js`.

---

# 1. Purpose

SRIIVERSE AI has evolved three times already — Sprint 1 (hardening), Sprint 2 (accessibility/SEO/docs), Sprint 3 (Recruiter Mode, Resume Intelligence, JD Matching, Interview Mode, Memory) and the Conversation Intelligence upgrade (a strategy layer that classifies the conversational *move* before retrieval runs). Each of those changes was implemented against a plan, tested manually, and shipped. None of them were checked against a **fixed, reusable benchmark** — every round of manual testing was written fresh, for that sprint's scope only, and then discarded.

That is the gap this document closes.

**`docs/AI_EVALUATION_SUITE.md` is the permanent, versioned benchmark that every future version of SRIIVERSE AI must be measured against.** It exists so that:

1. **Regressions are caught, not rediscovered.** When Sprint 5 changes `providers.js`'s routing order, this suite is what tells you whether "Who are you?" still gets the identity composer or silently falls back to `_fallback()` again.
2. **"Better" is falsifiable, not just felt.** "The assistant feels more intelligent now" is not a testable claim. "87/203 questions now return the correct `Expected Conversation Strategy` move, up from 61/203" is.
3. **Every realistic asker is represented, not just the ones the current implementer thought of.** A recruiter, a CTO doing technical due diligence, a fellow engineer probing for real vs. simulated intelligence, a student, and a portfolio visitor who just says "hi" all ask fundamentally different classes of questions. Sprint 3's own `docs/SPRINT_3_PLAN.md` and `docs/PORTFOLIO_AUDIT.md` both independently flagged "the assistant is not actually intelligent by default" as the single biggest finding in this repository's history — this suite is what operationalizes that finding into ~203 concrete, checkable cases instead of one paragraph of prose.
4. **Every future reasoning improvement has a target.** This document does not propose implementation. It defines *what correct looks like* so that whoever designs the next reasoning upgrade (Sprint 5, Sprint 6, a real LLM backend, …) has a ground truth to design against and grade against — before and after.

This is a **benchmark**, not a test suite in the unit-test sense. Nothing here is automated (the assistant has no test runner, per `docs/CURSOR_RULES.md`'s "no unnecessary dependencies" and `docs/PORTFOLIO_AUDIT.md`'s note that automated testing is a still-missing production feature). Every question here is intended to be run manually against the live assistant, in the browser, exactly the way Sprint 3's and the Conversation Intelligence upgrade's manual testing checklists were run — this document simply makes that process exhaustive, structured, and repeatable instead of ad hoc.

---

# 2. Evaluation Philosophy

## 2.1 Conversation-first, not retrieval-first

The Conversation Intelligence upgrade's stated goal was to stop the assistant from being "a keyword retrieval engine" and make it "conversation-first intelligence." This suite is built to *hold that line*. Every question below is graded first on **whether the assistant understood what kind of question it is** (`Expected Conversation Strategy` / `Expected Question Type`), and only second on whether the factual content it produced was correct. A response that retrieves the *right* document but frames it like a documentation dump (headers → subheaders → bullet lists → conclusion, the exact pattern `docs/PORTFOLIO_AUDIT.md` calls out under "Conversation Quality") is a **partial pass at best**, not a pass — because the underlying problem this suite exists to catch is exactly that pattern.

## 2.2 Grounded, never fabricated

`docs/CURSOR_RULES.md`'s "Knowledge First" rule — *"Never fabricate information. If information is unavailable, state the limitation and suggest the closest relevant content"* — is the single non-negotiable criterion in this entire suite. Every question has a `Hallucination Risk` rating and, where real content doesn't exist (education history, employment dates, certifications, specific performance metrics, technologies never claimed in `content.js`), the **correct** answer is an honest "I don't have that" — not a plausible-sounding invention. A confident, well-formatted, *fabricated* answer is a **hard fail**, always, regardless of how good the prose reads. This is graded more strictly than a wrong retrieval, because it is the failure mode that would actually damage Sudhanshu's credibility if a real recruiter or CTO caught it — exactly the risk `docs/PORTFOLIO_AUDIT.md`'s "Biggest Weakness" section warns about ("a technically curious reviewer can inspect the Network tab and discover..." — the equivalent risk here is a technically curious reviewer catching an invented fact).

## 2.3 Success criteria are behavioral, not lexical

A "correct" answer is not one that contains specific magic words. It is one that satisfies a small number of behavioral properties, illustrated here with the worked example from the Sprint 3/Conversation-Intelligence handoff prompts:

> **Question:** "Do you know Docker?"
>
> **A successful answer:**
> - Answers immediately (yes/no framing up front — not a paragraph of throat-clearing).
> - Confirms real experience honestly, scoped to what's actually true (Docker is part of `STACK`'s deployment group and `ARCHITECTURE`'s Deployment layer — it is *not* claimed per-project in any `PROJECTS[].stack` array).
> - Explains exactly where it's used (the Deployment layer of the five-layer architecture, alongside Vercel/Netlify/Render).
> - References shipped projects only if the reference is actually true — and if it isn't (no project's own `stack` array lists Docker), says so rather than inventing a per-project claim.
> - Avoids dumping the entire 19-item tech stack in response to a single yes/no question.
> - Remains conversational — a sentence or two, not a `## Docker` heading with five subsections.
> - Never hallucinates a project, a metric, or a usage claim that isn't in `content.js`.

Every question in Section 4 defines its own version of this — captured in that question's `Expected Assistant Behaviour` field — rather than repeating the full worked example 203 times. Section 2.3's Docker example is the *template*; Section 4 is 203 filled-in instances of it.

## 2.4 Priority reflects real stakes, not just difficulty

`Priority` is not a proxy for "hard to get right." A greeting ("Hi") is trivially easy to detect but is rated **P0** because it is the very first message a huge fraction of real visitors will send, and Section 8 (Top 25) shows exactly how many of the highest-priority questions are "easy." Conversely, a question like "How does temperature differ from top-p in LLM sampling?" is intellectually harder but rated **P2**, because it is a generic AI/ML trivia question with no connection to Sudhanshu's actual work — getting it wrong costs little; getting a recruiter's very first message wrong costs a lot.

## 2.5 Regression Importance protects what already works

Sprint 3 and the Conversation Intelligence upgrade already made specific, verified behavioral commitments (e.g., "download resume" must still trigger the download tool and never the new resume-intelligence text response; an active interview session must intercept *every* message, with no possibility of falling through to normal Q&A). `Regression Importance: Critical` marks exactly these previously-verified guarantees. A future change that breaks a `Critical` item is not "a new bug" — it is **reintroducing a bug that was already found and fixed once**, which `docs/CURSOR_RULES.md`'s Testing Expectations ("Ensure no existing behavior regressed") treats as the worst possible outcome of a change.

## 2.6 The suite is additive, forever

New assistant capabilities (a real LLM backend, persistent memory, a Résumé Analyzer for visitor-uploaded résumés, additional interview topics — all named in `docs/AI_ASSISTANT_SPEC.md`'s and `docs/IMPLEMENTATION_ROADMAP.md`'s "Future" sections) get **new questions appended to this document**, never questions removed or rewritten to make old failures disappear. The value of this suite compounds only if it is never quietly shrunk to match whatever currently passes.

---

# 3. Categories, Taxonomies & Legend

## 3.1 Category list (50 sections, 203 questions)

| # | Category | Count | Q Range | # | Category | Count | Q Range |
|---|---|---|---|---|---|---|---|
| 1 | Greetings | 5 | Q1–5 | 26 | Technology Comparisons | 6 | Q111–116 |
| 2 | Identity | 5 | Q6–10 | 27 | Recommendations | 4 | Q117–120 |
| 3 | Capabilities | 5 | Q11–15 | 28 | Opinions | 4 | Q121–124 |
| 4 | Resume | 5 | Q16–20 | 29 | Skill Verification | 5 | Q125–129 |
| 5 | Experience | 6 | Q21–26 | 30 | Recruiter Questions | 6 | Q130–135 |
| 6 | Projects | 7 | Q27–33 | 31 | Hiring Manager Questions | 4 | Q136–139 |
| 7 | Project Architecture | 6 | Q34–39 | 32 | CTO Questions | 4 | Q140–143 |
| 8 | Overall Portfolio Architecture | 6 | Q40–45 | 33 | Behavioral Questions | 5 | Q144–148 |
| 9 | Backend | 5 | Q46–50 | 34 | Strengths | 3 | Q149–151 |
| 10 | Frontend | 4 | Q51–54 | 35 | Weaknesses | 3 | Q152–154 |
| 11 | Python | 4 | Q55–58 | 36 | Career Goals | 3 | Q155–157 |
| 12 | SQL | 4 | Q59–62 | 37 | Education | 3 | Q158–160 |
| 13 | React | 4 | Q63–66 | 38 | Limitations (of the assistant) | 4 | Q161–164 |
| 14 | Flask | 4 | Q67–70 | 39 | Unknown Technologies | 4 | Q165–168 |
| 15 | FastAPI | 4 | Q71–74 | 40 | Honest "I Don't Know" Scenarios | 4 | Q169–172 |
| 16 | Docker | 3 | Q75–77 | 41 | Edge Cases | 4 | Q173–176 |
| 17 | PostgreSQL | 3 | Q78–80 | 42 | Multi-turn Conversations | 3 | Q177–179 |
| 18 | MongoDB | 3 | Q81–83 | 43 | Context Switching | 3 | Q180–182 |
| 19 | REST APIs | 3 | Q84–86 | 44 | Conversation Memory | 3 | Q183–185 |
| 20 | Authentication | 3 | Q87–89 | 45 | Follow-up Questions | 2 | Q186–187 |
| 21 | AI / LLMs | 5 | Q90–94 | 46 | Interview Mode | 4 | Q188–191 |
| 22 | Prompt Engineering | 3 | Q95–97 | 47 | JD Matching | 4 | Q192–195 |
| 23 | Deployment | 4 | Q98–101 | 48 | Resume Intelligence | 2 | Q196–197 |
| 24 | Engineering Decisions | 5 | Q102–106 | 49 | Tool Calls | 3 | Q198–200 |
| 25 | Problem Solving | 4 | Q107–110 | 50 | Navigation | 3 | Q201–203 |

*(50 sections total — the user-specified category list is fully covered; Tool Calls and Navigation are split into two focused sections for clarity, and the target of "~200" is met at 203 questions.)*

## 3.2 Expected Question Type taxonomy

Higher-level reasoning categories, not regex intents (per the design instruction — the assistant's `classifyIntent()` is an implementation detail, not the grading rubric):

`Identity` · `Greeting` · `Capability` · `Technology Explanation` · `Architecture Explanation` · `Project Explanation` · `Comparison` · `Opinion` · `Recommendation` · `Skill Verification` · `Experience` · `Evidence Request` · `Recruiter` · `Behavioral` · `Career` · `Limitation` · `Conversation` · `Navigation` · `Tool` · `Unknown`

## 3.3 Entity taxonomy

`Project` (queryforge / placementpro / reporadar) · `Language` (Python, JavaScript, TypeScript) · `Framework` (Flask, FastAPI, React) · `Library` (Tailwind, Pydantic) · `Database` (PostgreSQL, MongoDB) · `Deployment Tool` (Docker, Vercel, Netlify, Render) · `AI Technology` (LLMs, Ollama, RAG) · `Company` (generic — no real employer data exists) · `Role` (recruiter, engineer, student, CTO) · `Architecture Concept` (five-layer topology, REST, microservices) · `Engineering Concept` (idempotency, normalization, async) · `Developer Tool` (Git, GitHub) · `Cloud Technology` (AWS, Azure, GCP — all in `SKILLS_TAXONOMY` as *not owned*) · `Open Source Technology` (RepoRadarAI itself is open source) · `None`

## 3.4 Expected Knowledge Sources taxonomy

`Projects` (`PROJECTS[]`) · `Profile` (`PROFILE`) · `Resume` (synthesized `resume` doc) · `Stack` (`STACK[]`) · `Journey` (`JOURNEY[]`) · `Architecture` (`ARCHITECTURE[]` + `arch-overview` doc) · `Persona` (`ASSISTANT_CAPABILITIES`, `TECH_TAKES`) · `Conversation Context` (`awareness.js`) · `Memory` (`memory.js` — `lastProject`, `activeTopic`, `usedPhraseKeys`) · `JD Matching` (`jdmatch.js` + `SKILLS_TAXONOMY`) · `Interview` (`INTERVIEW_QUESTIONS`) · `Knowledge Base` (legacy `ASSISTANT_KB`, 11 entries, still indexed) · `None` (question is unanswerable from any source — the correct behavior *is* saying so)

## 3.5 Legend — compact fields used in every question

To keep 203 question entries scannable, the following shorthand is used consistently in Section 4. Every question still reports **all 14 requested fields** — this legend only abbreviates the *values*, never omits a field.

**Difficulty:** `Easy` (single-turn, unambiguous) · `Medium` (needs disambiguation/synthesis) · `Hard` (needs multi-source synthesis, honest degradation, or nuanced judgment) · `Edge` (deliberately adversarial or malformed input)

**Priority:** `P0` (core value proposition — must work for the assistant to be credible at all) · `P1` (important, expected by a sophisticated visitor) · `P2` (valuable but not load-bearing)

**Regression Importance:** `Critical` (a previously-verified guarantee from Sprint 3 / Conversation Intelligence — breaking it is reintroducing a fixed bug) · `High` (a core, frequently-exercised path) · `Medium` (a real but less-traveled path) · `Low` (rare phrasing / low-traffic edge case)

**Hallucination Risk:** `Low` (fully grounded, data exists and is unambiguous) · `Medium` (grounded, but requires correct scoping/synthesis to avoid overclaiming) · `High` (the honest answer is "I don't have that" — any confident specific answer is a fabrication)

**Strategy notation:** `move:X/scope:Y` = the Conversation Strategy layer's classification (`assistant/conversation.js`'s `analyzeStrategy()` output) intercepts the query before retrieval. `intent:X→retrieval` = the strategy layer returns `factual` (its default/fallback) and the query falls through to `classifyIntent()` + `knowledge.retrieve()`'s kind-based routing in `providers.js`, exactly as today's retrieval-first pipeline already works. `mode-gate:interview` / `short-circuit:jd-match` = the two pipeline paths in `assistant.js` that bypass the 13-step pipeline entirely.

---

# 4. Complete Evaluation Dataset (203 Questions)

Grouped by category, in the order listed in Section 3.1. Every entry reports: Question · Category (section header) · Difficulty · Priority · Expected Question Type · Expected Entities · Expected Knowledge Sources · Expected Conversation Strategy · Expected Assistant Behaviour · Expected Response Style · Expected Follow-up Suggestions · Grounding Source · Hallucination Risk · Regression Importance. Where the current implementation is predicted to diverge from the ideal behaviour, a `⚠ Predicted Gap` line is added — these seed Sections 6, 9, and 10 directly.

## 4.1 Greetings

**Q1 — "Hi"**
Type: Greeting · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona · Grounding: `providers.js _greetingResponse()`, `GREETING_RE`
Strategy: `move:greeting`
Behaviour: Warm, brief self-introduction with 2–3 concrete next steps (projects, stack, "who are you"). Never the generic fallback message.
Style: 1–2 sentences, conversational, no headers · Follow-ups: "Who are you?" / "Show me his projects" / "Why hire him?"

**Q2 — "Hey there"**
Type: Greeting · Entities: None · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona · Grounding: `GREETING_RE` (`hey+`)
Strategy: `move:greeting`
Behaviour: Same as Q1; must not vary in *quality* even though `_greetingResponse`'s `_pickVariant` rotates the exact wording.
Style: Short, warm · Follow-ups: same pattern as Q1.

**Q3 — "Good morning"**
Type: Greeting · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona · Grounding: `GREETING_RE` (`good\s+(morning|afternoon|evening)`)
Strategy: `move:greeting`
Behaviour: Same greeting composer — confirms the time-of-day variants aren't a separate, unhandled branch.
Style: Short, warm · Follow-ups: same pattern.

**Q4 — "hiiii!!"**
Type: Greeting · Entities: None · Diff: Edge · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona · Grounding: `GREETING_RE`'s `hi+` quantifier + anchor `^`
Strategy: `move:greeting`
Behaviour: Repeated letters/punctuation must still classify as a greeting, not fall through to `factual`/fallback.
Style: Short, warm · Follow-ups: same pattern.
⚠ Predicted Gap: `GREETING_RE` is anchored with `^`, so a greeting embedded mid-sentence ("well hiiii, tell me about your projects") would NOT match — falls through to `factual`. Low risk in practice (real greetings are almost always message-initial) but worth a manual check.

**Q5 — "yo, what's up"**
Type: Greeting · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona · Grounding: `GREETING_RE` (`yo`)
Strategy: `move:greeting`
Behaviour: Casual register should still land on the same warm, professional-but-approachable greeting — not a mismatched overly-formal tone.
Style: Short, warm · Follow-ups: same pattern.

## 4.2 Identity

**Q6 — "Who are you?"**
Type: Identity · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona, Profile, Projects · Grounding: `providers.js _identityResponse()` → `ASSISTANT_CAPABILITIES`, `getProfile()`, `getAllProjects()`
Strategy: `move:identity`
Behaviour: Introduces SRIIVERSE AI (name, what it is), lists its five real capabilities (Recruiter Mode, Resume Intelligence, JD Matching, Interview Practice, Project/Architecture Explanations), names the three live projects, and ends with concrete example prompts. This is the exact case named in the Conversation Intelligence upgrade's Example 1 — the pre-upgrade behaviour was the generic fallback ("I didn't quite catch that...").
Style: Structured (`## Hi, I'm SRIIVERSE AI`, H3 subsections + bullets), ~150–220 words · Follow-ups: "Show me his projects" / "Why hire him?" / "Explain the architecture"

**Q7 — "What are you?"**
Type: Identity · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona, Profile, Projects · Grounding: same as Q6 (`IDENTITY_RE`)
Strategy: `move:identity`
Behaviour: Identical composer to Q6 — confirms the regex's alternation, not just its first branch, is exercised.
Style: Same as Q6 · Follow-ups: same pattern.

**Q8 — "Introduce yourself"**
Type: Identity · Entities: None · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona, Profile, Projects · Grounding: `IDENTITY_RE` (`introduce yourself`)
Strategy: `move:identity`
Behaviour: Same as Q6.
Style: Same as Q6 · Follow-ups: same pattern.

**Q9 — "What is SRIIVERSE AI?"**
Type: Identity · Entities: None (product name is self-referential, not a portfolio entity) · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona, Profile · Grounding: `IDENTITY_RE` (`what is sriiverse\s*ai`)
Strategy: `move:identity`
Behaviour: Same composer as Q6, but should read naturally when the visitor names the product explicitly rather than using "you".
Style: Same as Q6 · Follow-ups: same pattern.

**Q10 — "What do you do all day?"**
Type: Identity · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona, Profile · Grounding: `IDENTITY_RE` requires the substring `what do you do` — present here
Strategy: `move:identity`
Behaviour: Same composer as Q6; confirms trailing words after the matched phrase don't break the regex.
Style: Same as Q6 · Follow-ups: same pattern.

## 4.3 Capabilities

**Q11 — "Can you match a job description against his skills?"**
Type: Capability · Entities: None · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona (`ASSISTANT_CAPABILITIES`), JD Matching · Grounding: ideally `IDENTITY_RE`-adjacent capability answer; actually `classifyIntent()`/`looksLikeJobDescription()`
Strategy (ideal): a capability-confirmation move naming the JD-matching feature directly.
Behaviour (ideal): Confirms yes, explains the paste-a-JD flow, and offers to do it right now.
Style: 2–4 sentences, conversational · Follow-ups: "Paste a job description to match" / "What technologies does he know?"
⚠ Predicted Gap: this phrasing doesn't match `IDENTITY_RE` (no "what can you do") and is too short/not JD-shaped enough for `looksLikeJobDescription()` (needs length ≥400 or an explicit trigger phrase). `classifyIntent()` likely falls through past every branch to generic `'question'`, `knowledge.retrieve()` finds weak matches, and the response is either a low-confidence generic answer or `_fallback()`. This is a real, concrete capability-question gap, not a hypothetical one.

**Q12 — "Do you support interview practice?"**
Type: Capability · Entities: None · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona, Interview · Grounding (ideal): capability confirmation naming Interview Mode.
Strategy (ideal): capability-confirmation move.
Behaviour (ideal): Confirms yes, names the five topics (Python/SQL/React/Backend/AI-ML), and offers to start one.
Style: 2–4 sentences · Follow-ups: "Start a Python interview" / "What topics can I practice?"
⚠ Predicted Gap: doesn't match `IDENTITY_RE` or `/\binterview\b/.test + start|begin|practice.../` (no start verb here — "support" isn't in that verb list) — likely falls to generic `'question'` → weak/no retrieval match → `_fallback()`.

**Q13 — "Can you tell me if he knows Docker?"**
Type: Capability + Skill Verification (hybrid) · Entities: Docker (Deployment Tool) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Stack, Architecture · Grounding: `classifyIntent()`'s `stack` branch (`/\b(stack|technolog|tools|skills|what.*(know|use))\b/` — "knows" doesn't literally match "know" as a substring... actually `know` matches `knows`), retrieval over `stack`/`arch` docs mentioning Docker.
Strategy: likely `move:factual` → `intent:stack→retrieval`.
Behaviour: A direct, short "yes — Docker is part of the deployment layer" answer, not a full stack dump. See Section 2.3's worked Docker example for the full behavioral bar.
Style: 1–3 sentences, direct · Follow-ups: "What's the deployment layer look like?" / "Show me the architecture"
⚠ Predicted Gap: `_stackResponse()` (the only handler reachable via the `'stack'` doc kind) always renders the *entire* stack card (Languages/Backend/Frontend/Data & AI/Deployment, every single technology) regardless of whether the question asked about one specific technology — this is the exact "avoids dumping the entire technology stack" failure mode Section 2.3 calls out by name.

**Q14 — "What kind of questions can I ask you?"**
Type: Capability · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona · Grounding (ideal): identity/capability composer.
Strategy (ideal): `move:identity` (this phrasing is semantically identical to "what can you do").
Behaviour (ideal): Same capability list as Q6.
Style: Same as Q6 · Follow-ups: same pattern.
⚠ Predicted Gap: does not match any `IDENTITY_RE` alternative literally — falls to `factual` → generic retrieval, likely thin match, `_fallback()` or a mismatched doc.

**Q15 — "Can you help me figure out if he's a good fit for my open role?"**
Type: Capability + Recruiter (hybrid) · Entities: Role · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona, Projects, Profile · Grounding: `classifyIntent()`'s recruiter branch (`/recruit|hir|employ|.../` matches "role")
Strategy: `move:factual` → `intent:recruiter→retrieval` → `_recommendResponse()`.
Behaviour: Should recognize the recruiter framing and either explain the JD-matching capability (paste the actual role's JD for a scored answer) or give the general "why hire him" narrative.
Style: Structured (`## Why Hire Sudhanshu Sinha`), H3 sections · Follow-ups: "Paste a job description to match" / "Show me the most impressive project"

## 4.4 Resume

**Q16 — "Can you summarize your resume?"**
Type: Experience · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Resume, Profile, Journey, Projects, Stack · Grounding: `classifyIntent()` `'resume'` branch → `knowledge.js`'s synthesized `resume` doc → `_resumeResponse()`
Strategy: `move:factual` → `intent:resume→retrieval` (kind `'resume'`)
Behaviour: Structured resume-style answer built live from `PROFILE`/`JOURNEY`/`PROJECTS`/`STACK` — never states anything absent from those sources (no invented education/dates/certifications).
Style: Structured (`## … — Resume Summary`, H3 sections: Background/Experience/Stack/Contact), ends with an explicit honesty disclaimer about what isn't covered · Follow-ups: "Paste a job description to match" / "Show me his projects"

**Q17 — "Walk me through your experience"**
Type: Experience · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Resume, Journey, Projects · Grounding: `classifyIntent()`'s `walk.*through.*(experience|resume|background)` sub-pattern
Strategy: `move:factual` → `intent:resume→retrieval`
Behaviour: Same `_resumeResponse()` composer as Q16.
Style: Same as Q16 · Follow-ups: same pattern.

**Q18 — "What's your background?"**
Type: Experience · Entities: None · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Resume, Profile, Journey · Grounding: `classifyIntent()` — note this ALSO matches the earlier `'profile'` branch (`/who|about|introduce|background/`), which sits *before* the resume-detection line in the if-chain.
Strategy: `move:factual` → `intent:profile→retrieval` (NOT `resume` — see gap below).
Behaviour (ideal): Should read like a resume-flavored answer (experience-oriented) since "background" is a resume-style question.
Style: Structured · Follow-ups: "Show me his projects" / "Why hire him?"
⚠ Predicted Gap: `classifyIntent()`'s if-chain checks `/who|about|introduce|background/` (the `'profile'` branch) BEFORE the `resume`-detecting line, so "what's your background?" is classified `'profile'`, not `'resume'` — it will resolve to `_profileResponse()` (a similar but distinctly-worded composer) rather than `_resumeResponse()`. Not a wrong answer, but two near-duplicate composers answering an overlapping question class inconsistently is exactly the kind of drift this suite exists to catch.

**Q19 — "Do you have a resume I can read without downloading anything?"**
Type: Experience · Entities: None · Diff: Medium · Pri: P1 · Regr: High · Halluc: Low
Sources: Resume · Grounding: `/\b(resume|cv)\b/` matches "resume"
Strategy: `move:factual` → `intent:resume→retrieval`
Behaviour: Must route to the conversational resume answer, NOT the download tool — this is the exact Sprint 3 regression guard (`classifyIntent`'s `action-resume` line is checked *before* the `resume` line, but only matches `download.*resume|resume.*pdf` — this phrasing has neither "download" nor "pdf").
Style: Same as Q16 · Follow-ups: same pattern.

**Q20 — "What's on your resume?"**
Type: Experience · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Medium
Sources: Resume · Grounding: `/\b(resume|cv)\b/`
Strategy: `move:factual` → `intent:resume→retrieval`
Behaviour: Answers only from `_resumeResponse()`'s actual fields — critically, must NOT imply a formal "resume document" exists with sections (education, employment dates) that aren't in `content.js`. Hallucination risk is `Medium` here specifically because the literal phrasing invites listing "resume sections" that don't exist in this data model.
Style: Same as Q16, with explicit "this isn't a literal document" framing if needed · Follow-ups: same pattern.

## 4.5 Experience

**Q21 — "Have you built production APIs?"**
Type: Evidence Request · Entities: REST APIs (Framework/Architecture Concept) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Stack · Grounding: `EXPERIENCE_RE` (`have you (built|worked|shipped|used)`) → `_experienceResponse()`
Strategy: `move:experience`
Behaviour: Direct "yes" with 1–2 named projects and, where available, the specific `decisions[]` line that mentions APIs — never a generic "he knows APIs" non-answer. This is exactly the Conversation Intelligence upgrade's Example 3-adjacent case: knowledge should *support* a direct answer, not replace it with a document dump.
Style: `## Yes — here's where that shows up directly` + bullet list of 1–3 projects, short · Follow-ups: "Open any of these live" / "Go deeper into one project's architecture"

**Q22 — "What projects demonstrate SQL?"**
Type: Evidence Request · Entities: SQL, Database · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` (`what projects.*(demonstrate|show|use|involve)`) → `_experienceResponse()`'s search-term matching against `p.stack`/`p.decisions`/`p.features`
Strategy: `move:experience`
Behaviour: Should surface QueryForgeAI specifically (its entire premise is SQL) — a wrong or empty answer here is a meaningful failure since this is the single most on-the-nose evidence question in the whole suite.
Style: Same pattern as Q21 · Follow-ups: same pattern.
⚠ Predicted Gap: `_EXPERIENCE_STOPWORDS` doesn't include "sql" and `SKILLS_TAXONOMY` maps `sql`→`PostgreSQL` (see `matchTaxonomyEntities`), but no `PROJECTS[].stack` array literally contains the string `"PostgreSQL"` or `"SQL"` (QueryForgeAI's stack lists `LLMs`/`REST APIs`/etc., not a DB name) — the search relies on the word "SQL" appearing in `p.problem`/`p.solution`/`p.features` text, which it does for QueryForgeAI ("Writing efficient SQL is hard...") — so this should work, but it is a fragile, text-substring-dependent path worth explicitly regression-testing, not assuming.

**Q23 — "Tell me about your backend experience"**
Type: Experience · Entities: Backend (Architecture Concept) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Stack · Grounding: `EXPERIENCE_RE` (`your\s+(backend|frontend|database|ai|full.?stack)\s+experience`)
Strategy: `move:experience`
Behaviour: Names Python/Flask/FastAPI concretely and cites specific projects, not a generic "he has backend experience" sentence.
Style: Same pattern as Q21 · Follow-ups: same pattern.

**Q24 — "Have you worked with databases in production?"**
Type: Evidence Request · Entities: Database, PostgreSQL, MongoDB · Diff: Medium · Pri: P1 · Regr: High · Halluc: Medium
Sources: Projects, Stack, Architecture · Grounding: `EXPERIENCE_RE` (`have you.*used`? — actually "worked with" ≈ "have you.*worked" matches)
Strategy: `move:experience`
Behaviour: Honest scoping matters here — PostgreSQL/MongoDB are portfolio-level `STACK`/`ARCHITECTURE` claims, not claims tied to a specific project's own `stack` array (see `TECH_TAKES`'s `database` entry's explicit `groundingNote` about exactly this gap). The correct answer says databases are part of the architecture's data layer, without inventing a specific "Project X uses PostgreSQL for Y" claim that doesn't exist in `content.js`.
Style: Same pattern as Q21, but honestly scoped · Follow-ups: "What's the data layer look like?" / "PostgreSQL or MongoDB — which would you choose?"
⚠ Predicted Gap: `_experienceResponse()`'s search runs `matchTaxonomyEntities` + raw query words against `p.stack.join(' ')` etc. — since no project's own `stack` lists a DB name, `matches.length` will likely be 0, and the fallback text is `"Yes — across three shipped, production systems:"` followed by *all three* projects, which slightly overstates database-specific evidence. Worth a manual check for overclaiming.

**Q25 — "What projects show AI integration?"**
Type: Evidence Request · Entities: AI Technology, LLMs · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Stack · Grounding: `EXPERIENCE_RE` matches "what projects...(show)"
Strategy: `move:experience`
Behaviour: All three projects genuinely use LLMs — correct answer is all three, each with its specific AI use case (SQL optimization / resume gap detection / repo understanding), not a generic list.
Style: Same pattern as Q21 · Follow-ups: same pattern.

**Q26 — "Have you shipped a full-stack product end to end?"**
Type: Evidence Request · Entities: Full-stack (Architecture Concept) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` (`have you.*shipped`)
Strategy: `move:experience`
Behaviour: Placement Pro+ is the best example (explicitly the "most complete full-stack product" per `_recruiterFocusText`'s `fullstack` entry) — a good answer leads with it specifically, not a generic three-project list.
Style: Same pattern as Q21 · Follow-ups: same pattern.

## 4.6 Projects

**Q27 — "What projects have you built?"**
Type: Project Explanation · Entities: Project (all three) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects · Grounding: `classifyIntent()`'s `'project'` branch (`/project|work|portfolio|built|ship/`) → retrieval top hit likely a `project` doc → `_projectResponse()`, OR the legacy KB entry `kb-*` ("what has he built") — both are grounded, real risk is *which* composer wins.
Strategy: `move:factual` → `intent:project→retrieval`
Behaviour: Names and briefly describes all three: QueryForgeAI, Placement Pro+, RepoRadarAI.
Style: Structured list, one line per project · Follow-ups: "Explain QueryForgeAI" / "Architecture of RepoRadarAI"

**Q28 — "Tell me about QueryForgeAI"**
Type: Project Explanation · Entities: queryforge (Project), SQL, LLMs · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects · Grounding: `resolveContext()` finds explicit project by name → `retrieve()` top hit `project-queryforge` → `_projectResponse(proj, doc, 'project', ...)`
Strategy: `move:factual` → retrieval (project name resolved before strategy even runs, via `resolveContext`)
Behaviour: Full engineering narrative: problem → solution → decisions → stack → key capabilities → live link. If visitor profile is `recruiter`, includes the recruiter-relevance closing line (rotated via `_pickVariant`).
Style: Structured (`## QueryForgeAI`, H3: What It Does / How It's Built / Technology Stack / Key Capabilities / Live) + tabbed project card + command bar · Follow-ups: `Architecture of QueryForgeAI?` / `Tech stack for QueryForgeAI?` / `Open the live demo`

**Q29 — "What is Placement Pro+?"**
Type: Project Explanation · Entities: placementpro (Project) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects · Grounding: same pattern as Q28, resolved to `project-placementpro`
Strategy: same as Q28.
Behaviour: Same composer pattern, correctly describing the terminal-style "Placement.OS," resume analysis, skill-gap detection, roadmaps.
Style: Same as Q28 · Follow-ups: same pattern, scoped to Placement Pro+.

**Q30 — "Explain RepoRadarAI"**
Type: Project Explanation · Entities: reporadar (Project) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects · Grounding: same pattern, resolved to `project-reporadar`
Strategy: same as Q28.
Behaviour: Correctly names FastAPI (not Flask — the only project of the three that uses FastAPI) and the open-source repo link.
Style: Same as Q28 · Follow-ups: same pattern.

**Q31 — "What's the most impressive project?"**
Type: Recommendation · Entities: Project (ambiguous — all three) · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects · Grounding: no doc or field in `content.js` ranks projects by "impressiveness" — this is a subjective judgment call, not a lookup.
Strategy: `move:factual` → generic retrieval, likely weak match (no doc's tags contain "impressive").
Behaviour (ideal): An honest, opinionated pick with a stated reason (e.g. "RepoRadarAI, because it's the only one that's open source and shows a distinct FastAPI+React split") — not a non-answer, but also not a fabricated superlative metric.
Style: Short, opinionated, 2–4 sentences · Follow-ups: "Why that one?" / "Show me the other two"
⚠ Predicted Gap: no composer in `providers.js` currently handles subjective ranking questions — this likely falls to `_fallback()` or a thin generic-QA response quoting whichever doc scored highest by accident, not a deliberate opinion. Genuine gap for a future "recommendation among own projects" composer.

**Q32 — "Which project should I look at first as a recruiter?"**
Type: Recommendation + Recruiter (hybrid) · Entities: Project, Role · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects, Persona · Grounding: `classifyIntent()`'s recruiter branch → `_recommendResponse()`, which *does* reorder projects by `visitorProfile.focusArea` (backend/ai/fullstack)
Strategy: `move:factual` → `intent:recruiter→retrieval`
Behaviour: Should give a direct, singular recommendation reflecting the recruiter's inferred focus area if known, not just the full three-project narrative with no clear "start here."
Style: Structured recruiter narrative, but should foreground one project · Follow-ups: "Open the [project] live demo" / "Open contact section"

**Q33 — "What problem does QueryForgeAI solve?"**
Type: Project Explanation · Entities: queryforge (Project) · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `p.problem` field, surfaced inside `_projectResponse()`'s "What It Does" section
Strategy: `move:factual` → retrieval → `_projectResponse()`
Behaviour: Quotes/paraphrases `p.problem` accurately ("writing efficient SQL is hard...") without inventing a different problem statement.
Style: Focused answer, doesn't need the full project card structure for a narrow question like this, but currently will render the full card regardless · Follow-ups: "How does it solve that?" / "What's the tech stack?"

## 4.7 Project Architecture

**Q34 — "Explain QueryForgeAI's architecture"**
Type: Architecture Explanation · Entities: queryforge (Project), Architecture Concept · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Architecture · Grounding: `resolveExplanation()` finds explicit project name → `strategy = {move:'explanation', scope:'project', projectId:'queryforge'}` → `getDoc('project-arch-queryforge')` → `_projectResponse()` with `intent:'architecture'`
Strategy: `move:explanation/scope:project`
Behaviour: Renders `p.decisions[]` as a numbered "How It's Built" list plus stack and the shared "why these choices" framing — this is the Conversation Intelligence upgrade's deterministic-grounding fix for exactly this class of question.
Style: Structured (`## QueryForgeAI`, H3: How It's Built / Technology Stack / Why These Choices / See It Live) · Follow-ups: "What technologies does he know?" / "Show me the backend projects"

**Q35 — "How is RepoRadarAI built?"**
Type: Architecture Explanation · Entities: reporadar (Project) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Architecture · Grounding: same pattern as Q34, resolved to `project-arch-reporadar`
Strategy: `move:explanation/scope:project`
Behaviour: Correctly cites the FastAPI+React split and the open-source decision line.
Style: Same as Q34 · Follow-ups: same pattern.

**Q36 — "What's the architecture of Placement Pro+?"**
Type: Architecture Explanation · Entities: placementpro (Project) · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects, Architecture · Grounding: same pattern, resolved to `project-arch-placementpro`
Strategy: `move:explanation/scope:project`
Behaviour: Correctly cites the terminal/"OS" framing decision and resume-anchored analysis.
Style: Same as Q34 · Follow-ups: same pattern.

**Q37 — "Why did you choose FastAPI for RepoRadarAI?"**
Type: Comparison + Engineering Decisions (hybrid) · Entities: FastAPI, reporadar (Project) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects, Persona (`TECH_TAKES`'s `backend-framework` evidence: `{project:'reporadar', tech:'FastAPI'}`) · Grounding: `COMPARISON_RE` doesn't match (no "vs"/"compare"), `OPINION_RE` doesn't match either — falls to `factual` → project-arch retrieval most likely.
Strategy: `move:factual` → `intent:architecture→retrieval` (project-scoped, since "RepoRadarAI" is explicit).
Behaviour (ideal): The FastAPI-specific "why" (async I/O for GitHub ingestion) is real and exists in `TECH_TAKES`'s `preference` text, but `_projectResponse()`'s architecture branch doesn't currently reference `TECH_TAKES` at all — it only renders the generic "why these choices" boilerplate shared by every project.
Style: Should be specific to FastAPI's async fit for this project, not the shared generic paragraph · Follow-ups: "FastAPI vs Flask?" / "What else runs on FastAPI?"
⚠ Predicted Gap: `_projectResponse()`'s architecture branch renders one hardcoded "why these choices" paragraph for every project regardless of which stack it actually asked about — a real, specific reason (which exists in `persona.js`) is not surfaced here, only in the separate tech-comparison/opinion paths.

**Q38 — "What are the engineering decisions behind QueryForgeAI?"**
Type: Architecture Explanation · Entities: queryforge (Project), Engineering Concept · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: same as Q34
Strategy: `move:explanation/scope:project`
Behaviour: Lists all three of `p.decisions[]` verbatim/paraphrased, not a subset or an invented fourth decision.
Style: Same as Q34 · Follow-ups: same pattern.

**Q39 — "How does RepoRadarAI's architecture differ from the other two?"**
Type: Comparison · Entities: reporadar, queryforge, placementpro (Projects) · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects, Architecture · Grounding: `resolveComparison()` needs ≥2 explicit project name/id matches in the query — "the other two" is not a literal project name/id, so this **will not** match `resolveComparison`'s matching logic.
Strategy (ideal): `move:comparison/scope:project` across all three.
Behaviour (ideal): A three-way comparison highlighting RepoRadarAI's FastAPI+open-source distinctiveness.
Style: Table or structured comparison · Follow-ups: "Compare QueryForgeAI and Placement Pro+"
⚠ Predicted Gap: `resolveComparison()` only matches literal project names/ids in the query text — pronoun-style references ("the other two") aren't resolved, and the module has no three-way comparison composer regardless (`_comparisonResponse`/`_techComparisonResponse` are both pairwise). This falls through to generic retrieval, most likely landing on a single project's doc rather than a comparison.

## 4.8 Overall Portfolio Architecture

**Q40 — "Explain the architecture"**
Type: Architecture Explanation · Entities: Architecture Concept · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Architecture, Conversation Context, Memory · Grounding: `resolveExplanation()` — no explicit project, no `PORTFOLIO_SIGNAL_RE` hit, falls to context: `ctx.focusProject || memory.lastProject || awareness.currentProject`.
Strategy: `move:explanation/scope:portfolio` **if no active project context**, else `scope:project` for whichever project is contextually active. This is the literal Example 4 from the Conversation Intelligence upgrade's original design brief — "Explain the architecture" must disambiguate portfolio vs. project using conversational context before retrieval.
Behaviour: First-turn (no context) → the five-layer portfolio overview. Mid-conversation about RepoRadarAI → RepoRadarAI's architecture specifically. Both are *correct*, context-dependent answers, not a bug.
Style: Structured (`## Five-Layer System Architecture`, ASCII diagram + "Why This Topology?") when portfolio-scoped · Follow-ups: "What technologies does he know?" / "Show me the backend projects"

**Q41 — "How is this portfolio built?"**
Type: Architecture Explanation · Entities: Architecture Concept · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Architecture · Grounding: `classifyIntent` → `'architecture'` → `resolveExplanation`: no project, no explicit portfolio signal word either — same context-fallback logic as Q40, but "this portfolio" arguably deserves an explicit portfolio-signal treatment.
Strategy: `move:explanation/scope:portfolio` (via context-fallback default, since no project context exists on a fresh session) — correct outcome even without an exact `PORTFOLIO_SIGNAL_RE` match.
Behaviour: Five-layer overview.
Style: Same as Q40 · Follow-ups: same pattern.

**Q42 — "What's the five-layer architecture?"**
Type: Architecture Explanation · Entities: Architecture Concept · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Architecture · Grounding: `PORTFOLIO_SIGNAL_RE` explicitly includes `five.?layer` — guaranteed portfolio scope regardless of any active project context.
Strategy: `move:explanation/scope:portfolio` (explicit override — this is the literal "explicit 'the whole system' phrasing always wins, even mid-project-context" rule in `conversation.js`).
Behaviour: Same as Q40's portfolio-scoped answer, even if the visitor was just discussing a specific project.
Style: Same as Q40 · Follow-ups: same pattern.

**Q43 — "Explain the overall system design in general"**
Type: Architecture Explanation · Entities: Architecture Concept · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Architecture · Grounding: `PORTFOLIO_SIGNAL_RE` matches both `system\s+design` and `in general`
Strategy: `move:explanation/scope:portfolio`
Behaviour: Same as Q40.
Style: Same as Q40 · Follow-ups: same pattern.

**Q44 — "How do the frontend and backend talk to each other?"**
Type: Architecture Explanation · Entities: Architecture Concept, REST APIs · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture · Grounding: `classifyIntent`'s `'architecture'` branch likely doesn't match this phrasing (no "architect/how built/topology/layer/system design/pipeline" substring) — more likely lands on `'question'` generic, or `'stack'` if "front" doesn't match. Actually none of the branches match cleanly.
Strategy (ideal): `move:explanation/scope:portfolio` — the answer (REST as the only contract between frontend and backend) exists verbatim in `_archResponse()`'s "Why This Topology?" bullets and `ARCHITECTURE[0].desc`.
Behaviour (ideal): "REST is the only contract" answer.
Style: Short, direct · Follow-ups: "Explain the five-layer architecture"
⚠ Predicted Gap: because `classifyIntent()` likely returns generic `'question'` here (not `'architecture'`), `conversation.js`'s architecture-disambiguation branch (`if (ctx.intent === 'architecture')`) never runs — this question relies entirely on keyword retrieval finding the right `arch-*` doc by accident, which is a real regression to `docs/PORTFOLIO_AUDIT.md`'s "keyword retrieval engine" pattern for a question that is structurally identical to Q40/Q41/Q42.

**Q45 — "Is the AI a black box, or does it reason over real data?"**
Type: Technology Explanation · Entities: AI Technology, Architecture Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture · Grounding: `classifyIntent` likely `'question'` or matches `'architecture'`'s `pipeline`? no. Falls to generic retrieval — the exact phrase "reasoning layer over real data" exists verbatim in `arch-overview`'s text and `_archResponse()`'s bullets, so retrieval on "AI" + "reason" + "data" should surface it.
Strategy: `move:factual` → retrieval, likely `arch-overview` or `stack`.
Behaviour: A confident, specific "no, it reasons over real data — schemas, resumes, repo graphs, never blind generation" answer, quoting the actual architectural principle.
Style: Short, direct answer, not a full architecture dump · Follow-ups: "Explain the five-layer architecture"

## 4.9 Backend

*Context for this category: `classifyIntent()` has no dedicated `'backend'` intent — these questions land on `'stack'` (if they contain "stack/technolog/tools/skills") or generic `'question'`, then retrieval. The recurring risk flagged once here and referenced by shorthand below: single-topic questions tend to surface the entire `_stackResponse()` card (all 19 technologies) rather than a scoped answer — see Q13's full writeup.*

**Q46 — "What backend technologies do you use?"**
Type: Technology Explanation · Entities: Framework (Flask, FastAPI) · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack, Projects · Grounding: `classifyIntent` `'stack'` branch → `_stackResponse()`
Strategy: `move:factual` → `intent:stack→retrieval`
Behaviour: Names Python/Flask/FastAPI/REST/JWT with the "Flask for tight control, FastAPI for async" framing already written in `_stackResponse()`.
Style: Structured stack card (acceptable here since the question IS about the whole backend slice) · Follow-ups: "Show me the backend projects" / "Explain the architecture"

**Q47 — "How do you structure a backend API?"**
Type: Engineering Decisions · Entities: REST APIs, Architecture Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Architecture, Projects · Grounding: no dedicated doc discusses generic API structuring principles beyond the five-layer topology — retrieval likely lands on `arch-backend` or a project doc.
Strategy: `move:factual` → retrieval
Behaviour: Should stay anchored to what's actually documented (backend owns correctness/auth/business logic) rather than inventing generic "best practices" content not tied to Sudhanshu's real decisions.
Style: Short, grounded, avoids generic textbook filler · Follow-ups: "Show me a project's architecture"

**Q48 — "What's your approach to backend architecture?"**
Type: Engineering Decisions · Entities: Architecture Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture, Projects · Grounding: `classifyIntent` `'architecture'` branch likely matches (`architect` substring) → `resolveExplanation`
Strategy: `move:explanation/scope:portfolio` (no project context) or `scope:project`.
Behaviour: Same as Q40's portfolio-scoped explanation, framed around the backend layer specifically.
Style: Structured · Follow-ups: same as Q40.

**Q49 — "Do you write backend tests?"**
Type: Limitation · Entities: Developer Tool (testing) · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None (no testing framework or practice is documented anywhere in `content.js`) · Grounding: N/A — this is a genuine content gap.
Strategy: `move:factual` → retrieval finds nothing relevant → likely `_fallback()`.
Behaviour: The ONLY correct answer is an honest "that's not something documented in this portfolio" — any specific claim about testing practices, frameworks (pytest, etc.), or coverage numbers is a fabrication. `SKILLS_TAXONOMY` even lists `Unit Testing`/`pytest`/`jest`/`tdd` as a *requestable* (not *owned*) skill, which is the correct signal to lean on.
Style: Short, honest, non-defensive · Follow-ups: "What technologies does he know?" / "Paste a job description to match"
⚠ Predicted Gap: `_fallback()`'s generic "I didn't quite catch that" message doesn't distinguish "I don't understand your question" from "I understand your question but genuinely don't have that information" — these need different phrasing to stay honest without sounding evasive. See Section 9.

**Q50 — "What backend frameworks have you shipped with?"**
Type: Evidence Request · Entities: Flask, FastAPI · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects, Stack · Grounding: `EXPERIENCE_RE` doesn't match this exact phrasing (no "have you built/worked/shipped/used" verb form — "have you shipped with" is close but the regex requires `have you (built|worked|shipped|used)` immediately, and this says "shipped with" which still matches `shipped`) — likely matches `move:experience`.
Strategy: `move:experience`
Behaviour: Flask (QueryForgeAI, Placement Pro+) and FastAPI (RepoRadarAI), evidence-backed.
Style: Same pattern as Q21 · Follow-ups: same pattern.

## 4.10 Frontend

**Q51 — "What frontend technologies do you use?"**
Type: Technology Explanation · Entities: React, TailwindCSS · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Stack, Projects · Grounding: `'stack'` intent → `_stackResponse()`
Strategy: `move:factual` → `intent:stack→retrieval`
Behaviour: React + TailwindCSS, correctly scoped (only queryforge and reporadar list React in their own `stack[]` — placementpro's stack array does not include React).
Style: Stack card · Follow-ups: "Show me a frontend project"
⚠ Predicted Gap: `_stackResponse()`'s hardcoded frontend line lists React/Tailwind as blanket facts without per-project scoping — technically true at the portfolio-`STACK` level but could read as though every project uses React, which isn't accurate for Placement Pro+.

**Q52 — "Do you build responsive UIs?"**
Type: Capability · Entities: TailwindCSS · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None (no explicit "responsive design" claim exists in `content.js`) · Grounding: N/A
Strategy: `move:factual` → weak/no retrieval match → likely `_fallback()`.
Behaviour: Honest degradation — TailwindCSS is real and commonly used for responsive design, but no specific claim about responsiveness practices exists; the answer should not invent one.
Style: Short, honest · Follow-ups: "What technologies does he know?"

**Q53 — "What's your frontend stack?"**
Type: Technology Explanation · Entities: React, TailwindCSS · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Stack · Grounding: same as Q51.
Strategy: `move:factual` → `intent:stack→retrieval`
Behaviour: Same as Q51.
Style: Same as Q51 · Follow-ups: same pattern.

**Q54 — "Have you built a frontend from scratch?"**
Type: Evidence Request · Entities: React · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` (`have you.*built`) → `move:experience`
Strategy: `move:experience`
Behaviour: QueryForgeAI and RepoRadarAI both ship React frontends — evidence-backed yes.
Style: Same pattern as Q21 · Follow-ups: same pattern.

## 4.11 Python

**Q55 — "Do you know Python?"**
Type: Skill Verification · Entities: Python (Language) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Journey, Projects · Grounding: `classifyIntent`: "know" is a `STOP` word in `knowledge.js`'s tokenizer, and the sentence contains no `stack/technolog/tools/skills` — falls to generic `'question'`; retrieval on the single surviving token "python" scores every doc mentioning Python.
Strategy: `move:factual` → weak retrieval, likely `stack` doc or a project doc, unpredictable which.
Behaviour (ideal): Direct "yes" (per Section 2.3's Docker template), naming that Python is the primary/backbone language (`JOURNEY`'s "Language" phase + all three projects), without a full stack dump.
Style: Short, direct · Follow-ups: "What do you use Python for?" / "Show me a backend project"
⚠ Predicted Gap: this is the single most likely real-world question ("do you know X") to hit the "dumps the entire stack for a yes/no question" failure mode named in Section 2.3 — Python is the *most* central technology in the whole portfolio and still has no dedicated single-technology composer.

**Q56 — "How much Python experience do you have?"**
Type: Experience · Entities: Python · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: Journey · Grounding: `JOURNEY` has no explicit years/duration field — only qualitative phase descriptions ("Adopted Python as the primary language...").
Strategy: `move:factual` → retrieval on `journey-*` docs.
Behaviour: Must not invent a specific year count or duration — `content.js` has no dates. Correct answer describes the journey qualitatively (primary language, used across all three shipped projects) and honestly declines to state a specific number of years.
Style: Short, honest about the missing precision · Follow-ups: "Show me his journey" / "What's your background?"

**Q57 — "What do you use Python for?"**
Type: Technology Explanation · Entities: Python · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Stack, Projects · Grounding: retrieval on "python"/"use" — likely stack or a project doc.
Strategy: `move:factual` → retrieval
Behaviour: Backend engineering, AI orchestration (Flask/FastAPI, all three projects) — a real, specific answer.
Style: Short, direct · Follow-ups: "What backend frameworks have you shipped with?"

**Q58 — "Is Python your primary language?"**
Type: Skill Verification · Entities: Python · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Journey, Stack · Grounding: `JOURNEY`'s "Language" phase literally says "Adopted Python as the primary language."
Strategy: `move:factual` → retrieval on `journey-1`
Behaviour: A confident "yes," quoting the journey phase almost verbatim.
Style: Short, direct · Follow-ups: "Show me his journey" / "What do you use Python for?"

## 4.12 SQL

**Q59 — "Do you know SQL?"**
Type: Skill Verification · Entities: SQL (mapped to PostgreSQL in `SKILLS_TAXONOMY`) · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Stack · Grounding: same weak-retrieval pattern as Q55 ("know" is a stopword) — likely lands on QueryForgeAI's project doc since "SQL" appears prominently in its text, or the stack doc.
Strategy: `move:factual` → retrieval
Behaviour (ideal): Direct "yes," anchored specifically to QueryForgeAI (the project whose entire premise is SQL) — the single best-evidenced technology question in the whole suite.
Style: Short, direct, project-anchored · Follow-ups: "Tell me about QueryForgeAI" / "What projects demonstrate SQL?"

**Q60 — "How would you optimize a slow SQL query?"**
Type: Technology Explanation · Entities: SQL, Engineering Concept (execution plan) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects (QueryForgeAI's `features`/`problem`/`solution`) · Grounding: QueryForgeAI's feature "SQL Optimization" and "Query Explanation" describe exactly this.
Strategy: `move:factual` → retrieval, likely `project-queryforge`.
Behaviour: Should answer from QueryForgeAI's actual approach (execution-plan analysis, rewriting inefficient queries with an explanation, not a black-box rewrite) rather than generic textbook SQL-tuning advice.
Style: Grounded in QueryForgeAI specifically · Follow-ups: "Tell me about QueryForgeAI" / "What's the architecture of QueryForgeAI?"

**Q61 — "What's your SQL experience?"**
Type: Experience · Entities: SQL · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` doesn't literally match ("your SQL experience" isn't in the `(backend|frontend|database|ai|full.?stack)` list) — falls to `factual`/retrieval.
Strategy: `move:factual` → retrieval on `project-queryforge`.
Behaviour: Same as Q59/Q60, QueryForgeAI-anchored.
Style: Short, direct · Follow-ups: same pattern.
⚠ Predicted Gap: `EXPERIENCE_RE`'s topic list (`backend|frontend|database|ai|full.?stack`) doesn't include "SQL" as a topic word even though SQL is the single most concretely evidenced skill in the portfolio — a real, easy extension opportunity, not a hypothetical one.

**Q62 — "Can you write complex SQL queries?"**
Type: Skill Verification · Entities: SQL · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: retrieval, likely `project-queryforge`.
Strategy: `move:factual` → retrieval
Behaviour: Confident yes, evidenced by QueryForgeAI's natural-language-to-SQL and optimization capabilities (which necessarily requires reasoning about complex SQL).
Style: Short, direct · Follow-ups: same pattern.

## 4.13 React

**Q63 — "Do you know React?"**
Type: Skill Verification · Entities: React · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Projects · Grounding: same weak-retrieval pattern as Q55.
Strategy: `move:factual` → retrieval
Behaviour (ideal): Direct "yes," QueryForgeAI + RepoRadarAI evidence.
Style: Short, direct · Follow-ups: "What React projects have you built?"
⚠ Predicted Gap: same "dumps the stack" risk as Q55/Q13.

**Q64 — "What React projects have you built?"**
Type: Evidence Request · Entities: React · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` doesn't match this exact phrasing (`what projects.*(demonstrate|show|use|involve)` needs one of those verbs — "built" isn't in the list) — falls to `'project'` intent (`/project|work|.../` matches "projects", "built").
Strategy: `move:factual` → `intent:project→retrieval`.
Behaviour: QueryForgeAI + RepoRadarAI, correctly excluding Placement Pro+ (whose `stack[]` doesn't list React).
Style: Short, evidence list · Follow-ups: "Tell me about RepoRadarAI"

**Q65 — "Do you use React hooks?"**
Type: Technology Explanation · Entities: React · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None (no `content.js` field mentions hooks specifically — this is an implementation detail below the portfolio's documented granularity) · Grounding: N/A
Strategy: `move:factual` → weak/no match → `_fallback()` or generic React mention.
Behaviour: Honest degradation — React is confirmed, but hook-level implementation detail isn't documented; must not invent specifics ("yes, I use useEffect for X in QueryForgeAI") that aren't in `content.js`.
Style: Short, honestly scoped · Follow-ups: "What React projects have you built?"

**Q66 — "Have you used TypeScript with React?"**
Type: Skill Verification · Entities: TypeScript, React · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: RepoRadarAI's `stack[]` explicitly lists both `React` and `TypeScript`.
Strategy: `move:factual` → `EXPERIENCE_RE` matches (`have you.*used`) → `move:experience`.
Behaviour: Confident yes, anchored specifically to RepoRadarAI (the only project pairing both).
Style: Short, project-anchored · Follow-ups: "Tell me about RepoRadarAI"

## 4.14 Flask

**Q67 — "Do you know Flask?"**
Type: Skill Verification · Entities: Flask · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Projects · Grounding: same weak-retrieval pattern as Q55/Q63.
Strategy: `move:factual` → retrieval
Behaviour (ideal): Direct yes, QueryForgeAI + Placement Pro+ evidence.
Style: Short, direct · Follow-ups: "What have you built with Flask?"

**Q68 — "What have you built with Flask?"**
Type: Evidence Request · Entities: Flask · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `EXPERIENCE_RE` (`have you.*built` — wait, this is "what have you built with X", not "have you built" — the RE requires "have you (built|...)" literally at that position; "what have you built" doesn't match the anchor either) — likely falls to `'project'` intent.
Strategy: `move:factual` → `intent:project→retrieval`
Behaviour: QueryForgeAI + Placement Pro+.
Style: Short, evidence list · Follow-ups: same pattern.

**Q69 — "Why did you use Flask instead of Django?"**
Type: Comparison · Entities: Flask, Django · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Persona, Projects · Grounding: `COMPARISON_RE` doesn't match (no "vs"/"compare"/"versus"/"difference between") — falls to `factual`. Even if it did, `TECH_TAKES` has no `Flask`-vs-`Django` entry (only Flask-vs-FastAPI) — `Django` exists only in `SKILLS_TAXONOMY` as a requestable-but-not-owned skill.
Strategy (ideal): `move:comparison/scope:tech` → `_techComparisonResponse` → `_findTechTake` → no exact match → `_techTakeFallback()`.
Behaviour (ideal): Honest degradation naming that Django isn't part of the stack, without fabricating a false "I chose Flask over Django because..." narrative implying Django was ever evaluated for these specific projects.
Style: `_techTakeFallback()`'s honest-degradation template · Follow-ups: "What technologies does he know?" / "Flask vs FastAPI?"
⚠ Predicted Gap: this phrasing doesn't trigger `COMPARISON_RE` (no "vs"/"versus"/"compare"/"difference between" — "instead of" isn't covered), so it never reaches `_techTakeFallback()`'s honest degradation at all; it falls through to plain retrieval, which has no coherent answer for a technology (Django) that appears nowhere in `PROJECTS`/`STACK`/`ARCHITECTURE`. Real risk of either `_fallback()` or a generic Flask answer that ignores the Django framing entirely.

**Q70 — "Is Flask your preferred backend framework?"**
Type: Opinion · Entities: Flask · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona (`TECH_TAKES` backend-framework entry) · Grounding: `OPINION_RE` matches `prefer` → `resolveOpinion` → `matchTaxonomyEntities` finds only `['Flask']` (1 entity) → `_findTechTake` partial-matches the `backend-framework` entry (Flask is one of its `techs`).
Strategy: `move:opinion`
Behaviour: The real nuanced answer — FastAPI is the default for new async-heavy services, Flask stays right for smaller-surface control — not a flat "yes, Flask is my favorite."
Style: `_opinionResponse()`'s structured trade-off format · Follow-ups: "What technologies does he know?" / "Compare his projects"

## 4.15 FastAPI

**Q71 — "Do you know FastAPI?"**
Type: Skill Verification · Entities: FastAPI · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Projects · Grounding: same weak-retrieval pattern as Q67.
Strategy: `move:factual` → retrieval
Behaviour: Direct yes, RepoRadarAI evidence.
Style: Short, direct · Follow-ups: "What have you built with FastAPI?"

**Q72 — "What have you built with FastAPI?"**
Type: Evidence Request · Entities: FastAPI · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: same pattern as Q68 → `'project'` intent.
Strategy: `move:factual` → `intent:project→retrieval`
Behaviour: RepoRadarAI specifically — the only project using FastAPI; must not also claim QueryForgeAI/Placement Pro+ use it (they use Flask).
Style: Short, evidence list, correctly scoped to one project · Follow-ups: "Tell me about RepoRadarAI"

**Q73 — "Have you used FastAPI's async features?"**
Type: Technology Explanation · Entities: FastAPI, Engineering Concept (async) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona (`TECH_TAKES`'s `Async` dimension for FastAPI), Projects · Grounding: `EXPERIENCE_RE` matches (`have you.*used`) → `move:experience`, but the real "async" nuance lives only in `persona.js`'s `TECH_TAKES`, which `_experienceResponse()` doesn't read at all.
Strategy: `move:experience` → `_experienceResponse()` (persona.js's richer async framing is NOT surfaced here).
Behaviour (ideal): RepoRadarAI's async GitHub ingestion, framed with FastAPI's async-native routing.
Style: Should mention async specifically, not just "FastAPI is used in RepoRadarAI" · Follow-ups: "FastAPI vs Flask?"
⚠ Predicted Gap: `_experienceResponse()` and the opinion/comparison composers are two separate code paths that never share content — an "experience" question about a technical nuance (async) only gets the generic evidence-list treatment, missing the more specific technical framing that exists but only in `TECH_TAKES`.

**Q74 — "What's your experience with async APIs?"**
Type: Experience · Entities: Engineering Concept (async), FastAPI · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects, Persona · Grounding: `EXPERIENCE_RE` doesn't match this phrasing literally (no matching verb) — falls to `factual`/retrieval.
Strategy: `move:factual` → retrieval, likely `project-reporadar` (mentions FastAPI/async ingestion).
Behaviour: Same as Q73.
Style: Same as Q73 · Follow-ups: same pattern.

## 4.16 Docker

**Q75 — "Do you use Docker?"**
Type: Skill Verification · Entities: Docker · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Architecture · Grounding: same weak-retrieval pattern; Docker is portfolio-level (`STACK`/`ARCHITECTURE`'s Deployment layer), not claimed in any single project's own `stack[]`.
Strategy: `move:factual` → retrieval
Behaviour: This is Section 2.3's worked example verbatim — direct yes, correctly scoped to the deployment layer, no per-project overclaim, no full stack dump.
Style: Short, direct, honestly scoped · Follow-ups: "What's the deployment layer look like?"

**Q76 — "How is Docker used in your projects?"**
Type: Technology Explanation · Entities: Docker · Diff: Medium · Pri: P1 · Regr: High · Halluc: Medium
Sources: Architecture · Grounding: same as Q75 — the honest answer is "at the portfolio/deployment-layer level, not claimed per-project."
Strategy: `move:factual` → retrieval
Behaviour: Must not invent a specific "Project X's Dockerfile does Y" claim that doesn't exist in `content.js`.
Style: Short, honestly scoped · Follow-ups: same pattern.

**Q77 — "Do you containerize your deployments?"**
Type: Skill Verification · Entities: Docker · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture · Grounding: `ARCHITECTURE`'s deploy node explicitly says "Containerized and observable."
Strategy: `move:factual` → retrieval
Behaviour: Direct yes, quoting the deployment layer's description.
Style: Short, direct · Follow-ups: same pattern.

## 4.17 PostgreSQL

**Q78 — "Do you know PostgreSQL?"**
Type: Skill Verification · Entities: PostgreSQL · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack, Architecture · Grounding: same weak-retrieval pattern as Q75; same "no single project claims it in its own stack[]" honesty requirement (see `TECH_TAKES`'s `database` entry's `groundingNote`).
Strategy: `move:factual` → retrieval
Behaviour: Direct yes, honestly scoped to the portfolio's data layer, not a specific project.
Style: Short, direct, honestly scoped · Follow-ups: "PostgreSQL or MongoDB — which would you choose?"

**Q79 — "Have you optimized PostgreSQL queries?"**
Type: Evidence Request · Entities: PostgreSQL, Engineering Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects · Grounding: QueryForgeAI's optimization features are described generically as "SQL"/"execution plans," never naming PostgreSQL specifically.
Strategy: `move:experience` (`EXPERIENCE_RE` matches "have you...used"? no — "optimized" isn't in the verb list, falls to `factual`).
Behaviour: Should connect QueryForgeAI's SQL-optimization work honestly without asserting it was PostgreSQL-specific (the project doc never says which RDBMS).
Style: Careful not to overclaim vendor-specificity · Follow-ups: "Tell me about QueryForgeAI"

**Q80 — "What's your PostgreSQL experience?"**
Type: Experience · Entities: PostgreSQL · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Stack, Architecture · Grounding: same honesty pattern as Q78/Q79.
Strategy: `move:factual` → retrieval
Behaviour: Same honest scoping as Q78.
Style: Same as Q78 · Follow-ups: same pattern.

## 4.18 MongoDB

**Q81 — "Do you know MongoDB?"**
Type: Skill Verification · Entities: MongoDB · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack, Architecture · Grounding: same pattern as Q78.
Strategy: `move:factual` → retrieval
Behaviour: Direct yes, same honest portfolio-level scoping.
Style: Short, direct · Follow-ups: same pattern as Q78.

**Q82 — "When would you use MongoDB over a relational database?"**
Type: Opinion · Entities: MongoDB, PostgreSQL · Diff: Medium · Pri: P1 · Regr: High · Halluc: Low
Sources: Persona (`TECH_TAKES`'s `database` entry) · Grounding: `OPINION_RE` — does "when would you use X over Y" match? The regex requires `prefer|would you (use|choose|recommend|pick)|.../` — "would you use" literally matches `would you (use|...)`.
Strategy: `move:opinion` → `matchTaxonomyEntities` finds `['MongoDB', 'PostgreSQL']` (2 entities) → exact match on `database` category.
Behaviour: The real, nuanced `TECH_TAKES.database.preference` answer (flexible/nested data → Mongo; relational integrity → Postgres), with the honest `groundingNote` about no project pinning one explicitly.
Style: `_opinionResponse()`'s trade-off table + honesty blockquote · Follow-ups: "What technologies does he know?" / "PostgreSQL vs MongoDB?"

**Q83 — "Have you built anything with MongoDB?"**
Type: Evidence Request · Entities: MongoDB · Diff: Medium · Pri: P1 · Regr: High · Halluc: High
Sources: None at the project level · Grounding: `EXPERIENCE_RE` matches (`have you.*built`) → `move:experience` → `_experienceResponse()` searches `p.stack` for "mongodb" — finds nothing, since no project's `stack[]` includes it.
Strategy: `move:experience`
Behaviour: This is the single cleanest test of `_experienceResponse()`'s honesty fallback — the correct answer is "not a specific project, but it's part of the portfolio's data layer," NOT a fabricated per-project claim.
Style: Honest, short · Follow-ups: "What's the data layer look like?"
⚠ Predicted Gap: `_experienceResponse()`'s fallback lead line when `matches.length === 0` is `"Yes — across three shipped, production systems:"` followed by listing all three projects — this technically overclaims for a technology (MongoDB) that literally zero projects list in their own `stack[]`. This is the most concrete, reproducible overclaiming risk found anywhere in this suite and should be Priority 0 for the next reasoning-improvement pass.

## 4.19 REST APIs

**Q84 — "Do you build REST APIs?"**
Type: Skill Verification · Entities: REST APIs · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack, Projects · Grounding: all three projects list `REST APIs` in their own `stack[]` — the single most universally-true single-technology claim in the whole dataset.
Strategy: `move:factual` → retrieval
Behaviour: Confident yes, can cite any/all three projects.
Style: Short, direct · Follow-ups: "How do you design a REST API?"

**Q85 — "How do you design a REST API?"**
Type: Technology Explanation · Entities: REST APIs, Engineering Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Architecture · Grounding: only the high-level "frontend talks to backend exclusively over REST" principle exists — no documented endpoint-design conventions.
Strategy: `move:factual` → retrieval
Behaviour: Should stay at the documented level of abstraction (REST as the frontend/backend contract) rather than inventing specific conventions (resource naming, status code policy) never described in `content.js`.
Style: Short, honestly scoped · Follow-ups: "Explain the architecture"

**Q86 — "What's your approach to API versioning?"**
Type: Limitation · Entities: REST APIs, Engineering Concept · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — not documented anywhere (this is also literally one of the generic `INTERVIEW_QUESTIONS.backend` topics, which is *interview content*, not a claim about Sudhanshu).
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest "not documented" — must not blur the line between "this is something I could discuss generically" (interview-bank knowledge) and "this is a claim about what Sudhanshu specifically does."
Style: Short, honest · Follow-ups: "Practice a backend interview"

## 4.20 Authentication

**Q87 — "How do you handle authentication?"**
Type: Technology Explanation · Entities: JWT, Authentication · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack · Grounding: `JWT` is listed in `STACK`'s backend group; `_stackResponse()`'s backend section explicitly says "JWT for stateless auth."
Strategy: `move:factual` → retrieval (likely `'stack'` intent, since "handle" isn't in the stack regex but... actually doesn't match `stack` branch; falls to generic `'question'`).
Behaviour: Direct answer naming JWT and stateless auth specifically, not a generic "security is important" non-answer.
Style: Short, direct · Follow-ups: "Do you use JWT?"

**Q88 — "Do you use JWT?"**
Type: Skill Verification · Entities: JWT · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack · Grounding: same as Q87.
Strategy: `move:factual` → retrieval
Behaviour: Direct yes.
Style: Short, direct · Follow-ups: same pattern.

**Q89 — "How would you secure a REST API?"**
Type: Technology Explanation · Entities: REST APIs, JWT, Authentication · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Stack · Grounding: same JWT grounding as Q87; anything beyond JWT (rate limiting, input validation specifics) is documented only generically in `docs/CURSOR_RULES.md`'s Security Rules, which is a *repo engineering rule*, not a claim about a shipped project — must not conflate the two.
Strategy: `move:factual` → retrieval
Behaviour: JWT-anchored answer; avoid inventing specific security measures not tied to real project data.
Style: Short, honestly scoped · Follow-ups: same pattern.

## 4.21 AI / LLMs

**Q90 — "How do you use AI in your projects?"**
Type: Technology Explanation · Entities: AI Technology, LLMs · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Architecture, Projects, Stack · Grounding: `ARCHITECTURE`'s AI Layer node + all three `PROJECTS[].features` entries describing their specific LLM use case.
Strategy: `move:factual` → retrieval (likely `arch-ai` or `stack`)
Behaviour: Names all three concrete use cases (SQL generation/optimization, resume gap detection, repo understanding) — never a vague "AI is used throughout."
Style: Structured but not the full stack dump; a focused answer would list the three use cases · Follow-ups: "Do you build RAG systems?" / "Explain the architecture"

**Q91 — "Do you use LLMs?"**
Type: Skill Verification · Entities: LLMs · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Stack, Architecture · Grounding: `STACK`, `ARCHITECTURE.ai`.
Strategy: `move:factual` → retrieval
Behaviour: Direct yes.
Style: Short, direct · Follow-ups: "How do you use AI in your projects?"

**Q92 — "What's Ollama, and do you use it?"**
Type: Technology Explanation · Entities: AI Technology (Ollama) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Stack, ASSISTANT_KB · Grounding: `STACK` lists Ollama; the legacy `ASSISTANT_KB` `ai` entry explicitly says "Ollama is used for local model work."
Strategy: `move:factual` → retrieval (likely the legacy `kb-*` doc, since it's the only doc that explains *what* Ollama is used for, not just that it's listed).
Behaviour: Explains Ollama briefly (local LLM runtime) and confirms it's part of the stack for local model work.
Style: Short, direct · Follow-ups: "Do you build RAG systems?"

**Q93 — "Do you build RAG systems?"**
Type: Technology Explanation · Entities: AI Technology (RAG) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Architecture, Projects · Grounding: `ARCHITECTURE.ai`'s `sub` field literally says "LLMs · Ollama · Retrieval" and `desc` says "retrieval and model orchestration" — this assistant's OWN `knowledge.js` retrieval mechanism is arguably the clearest example, plus QueryForgeAI's schema-grounded generation is retrieval-adjacent.
Strategy: `move:factual` → retrieval
Behaviour: Should connect to the "AI is a reasoning layer over real data" principle and cite the retrieval-grounded nature of the projects (and, self-referentially, the assistant itself) — a genuinely good opportunity for the assistant to describe its own architecture as evidence.
Style: Short, direct · Follow-ups: "Explain the architecture"

**Q94 — "Is the AI layer just a wrapper around an LLM API, or something more?"**
Type: Technology Explanation · Entities: AI Technology, Architecture Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture · Grounding: `arch-overview`'s text explicitly: "The AI is a reasoning layer over real data, never a blind generator."
Strategy: `move:factual` → retrieval, likely `arch-overview` (strong tag/phrase overlap on "reasoning"/"layer"/"AI").
Behaviour: Should answer with conviction using the documented principle, not hedge.
Style: Short, confident, direct · Follow-ups: "Explain the five-layer architecture"

## 4.22 Prompt Engineering

**Q95 — "What's your approach to prompt engineering?"**
Type: Limitation · Entities: AI Technology (prompt engineering) · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None at the "Sudhanshu's approach" level — only exists as generic interview-bank content (`INTERVIEW_QUESTIONS['ai-ml'][0]`'s keywords: `fine-tuning`, `prompt engineering`) · Grounding: N/A for a personal claim.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest degradation — no documented personal methodology exists; the assistant should say so rather than inventing a "prompt engineering philosophy" that isn't in `content.js`, while optionally pointing at the retrieval-grounding principle that IS documented as the closest real analog.
Style: Short, honest, redirects to what IS documented (grounding-first design) · Follow-ups: "Is the AI layer just a wrapper, or something more?"

**Q96 — "How do you reduce hallucination in your AI features?"**
Type: Engineering Decisions · Entities: AI Technology · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Architecture, Persona (this very suite's own philosophy in Section 2.2 is a meta-example, not a source) · Grounding: `arch-overview`'s "reasoning layer over real data" principle IS the documented anti-hallucination design, even though the phrase "hallucination" never appears in `content.js` verbatim.
Strategy: `move:factual` → retrieval, uncertain match quality (query vocabulary doesn't overlap with doc vocabulary).
Behaviour: A good answer connects "grounding in real schema/resume/repo data" to hallucination reduction explicitly, even though `content.js` doesn't use that exact word.
Style: Short, direct · Follow-ups: "Explain the architecture"
⚠ Predicted Gap: vocabulary mismatch (query says "hallucination," docs say "reasoning layer over real data") is a classic keyword-retrieval failure mode — likely to score low and land on `_fallback()` or an unrelated doc despite a genuinely good, true answer being derivable.

**Q97 — "Do you fine-tune models, or use prompting?"**
Type: Limitation · Entities: AI Technology · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — no fine-tuning claim exists anywhere; Ollama is used for "local model work," which is not the same claim as fine-tuning.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest — the real answer is closer to "not fine-tuning, using existing models via Ollama/APIs with retrieval-grounded prompting," but this specific framing doesn't exist verbatim in `content.js`, so a cautious, honestly-scoped answer is correct; an invented specific claim about fine-tuning is not.
Style: Short, honest · Follow-ups: "What's Ollama, and do you use it?"

## 4.23 Deployment

**Q98 — "How do you deploy your projects?"**
Type: Technology Explanation · Entities: Deployment Tool (Docker, Vercel, Netlify, Render) · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Stack, Architecture, Projects · Grounding: each project's `live` URL domain (netlify.app / vercel.app) plus `ARCHITECTURE.deploy`.
Strategy: `move:factual` → retrieval
Behaviour: Names the actual platforms per project (QueryForgeAI/Placement Pro+ on Netlify, RepoRadarAI on Vercel) rather than a generic "Docker + cloud" non-answer.
Style: Short, project-specific · Follow-ups: "Open a live demo"

**Q99 — "Do you use CI/CD?"**
Type: Limitation · Entities: CI/CD · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: `SKILLS_TAXONOMY` explicitly lists `CI/CD` among the *requestable-but-not-owned* skills (alongside AWS/Kubernetes) — this is a documented gap, not silence.
Strategy: `move:factual` → weak/no match → `_fallback()`, OR (if pasted as part of a JD) correctly surfaces as a "missing skill."
Behaviour: Honest "not part of the current stack" — this is one of the few categories where `content.js` itself explicitly names the gap, so there's no excuse for the assistant to hedge or fabricate.
Style: Short, honest, confident (a documented gap is not a source of shame) · Follow-ups: "What technologies does he know?" / "Paste a job description to match"

**Q100 — "What hosting platforms do you use?"**
Type: Technology Explanation · Entities: Vercel, Netlify, Render · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Stack, Projects · Grounding: same as Q98.
Strategy: `move:factual` → retrieval
Behaviour: Same as Q98.
Style: Same as Q98 · Follow-ups: same pattern.

**Q101 — "Is your deployment process automated?"**
Type: Limitation · Entities: Deployment Tool, CI/CD · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None specific (platform-level auto-deploy-on-push is plausible for Vercel/Netlify but never explicitly claimed) · Grounding: N/A for a specific automation claim.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Should not assert a specific CI/CD pipeline exists (see Q99) — the honest answer separates "hosted on platforms that support auto-deploy" (plausible, platform-level) from "has a documented CI/CD pipeline" (not claimed).
Style: Short, honest, precise about the distinction · Follow-ups: "Do you use CI/CD?"

## 4.24 Engineering Decisions

**Q102 — "Why did you split the architecture into five layers?"**
Type: Architecture Explanation · Entities: Architecture Concept · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Architecture · Grounding: `_archResponse()`'s "Why This Topology?" bullets (backend owns correctness / AI is a reasoning layer / frontend is decoupled / deployment is reproducible).
Strategy: `move:explanation/scope:portfolio` (via `resolveExplanation`, no project context)
Behaviour: Should answer with the actual documented rationale for each layer boundary, not a generic "separation of concerns is good practice" non-answer.
Style: Structured, same as Q40 · Follow-ups: same as Q40.

**Q103 — "What's the biggest engineering trade-off you made in QueryForgeAI?"**
Type: Engineering Decisions · Entities: queryforge (Project), Engineering Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects · Grounding: `p.decisions[]` — specifically "Optimization is surfaced as an explanation, not a black-box rewrite" is the closest documented trade-off (transparency over automation).
Strategy: `move:factual` → retrieval (project name resolved explicitly by `resolveContext`, not routed through `conversation.js`'s explanation branch since intent likely resolves to `'project'`, not `'architecture'`).
Behaviour: Should surface that specific decision as the trade-off, not invent a different one (e.g., performance vs. accuracy) that isn't documented.
Style: Focused, not the full project card · Follow-ups: "What are the engineering decisions behind QueryForgeAI?"

**Q104 — "Why is the AI a reasoning layer instead of a direct generator?"**
Type: Engineering Decisions · Entities: AI Technology, Architecture Concept · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Architecture · Grounding: near-verbatim phrase match against `arch-overview`'s text ("The AI is a reasoning layer over real data, never a blind generator") — one of the strongest possible retrieval hits in the whole dataset.
Strategy: `move:factual` → retrieval, high-confidence match on `arch-overview`.
Behaviour: Confident, direct answer using the documented principle.
Style: Short, confident · Follow-ups: "Explain the five-layer architecture"

**Q105 — "Why does Placement Pro+ use a terminal-style interface?"**
Type: Engineering Decisions · Entities: placementpro (Project) · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: `p.decisions[0]` — "The terminal / 'OS' interface frames preparation as a system to operate, not a checklist to dread" — an exact, quotable match.
Strategy: `move:factual` → retrieval on `project-arch-placementpro` or `project-placementpro`.
Behaviour: Quotes/paraphrases the documented rationale precisely.
Style: Short, direct · Follow-ups: "What's the architecture of Placement Pro+?"

**Q106 — "What would you do differently if you rebuilt RepoRadarAI today?"**
Type: Limitation · Entities: reporadar (Project) · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — no retrospective/lessons-learned field exists anywhere in `content.js` for any project.
Strategy: `move:factual` → retrieval, likely lands on the project doc without actually answering the hypothetical.
Behaviour: Honest — either decline the hypothetical cleanly or offer a reasoned, clearly-labeled personal opinion (e.g. "expanding the interview-bank pattern") without presenting it as a documented fact.
Style: Short, honestly framed as opinion, not fact · Follow-ups: "Tell me about RepoRadarAI"

## 4.25 Problem Solving

**Q107 — "How do you approach an ambiguous requirement?"**
Type: Behavioral · Entities: Engineering Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Profile (`why-hire` doc) · Grounding: `why-hire`'s text contains the word "ambiguous" verbatim ("He turns ambiguous problems into reliable, observable software") — a strong, specific retrieval hit.
Strategy: `move:factual` → retrieval, likely `why-hire`.
Behaviour: Should surface that exact framing rather than inventing a generic "I break it into smaller pieces" answer with no grounding.
Style: Short, direct · Follow-ups: "Why hire him?"

**Q108 — "Describe a hard technical problem you solved."**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: Projects (closest available analog) · Grounding: no single "hardest problem" narrative exists — the closest honest analog is one of the three `p.problem` statements (e.g. QueryForgeAI's "writing efficient SQL is hard...").
Strategy: `move:factual` → retrieval, uncertain which project doc wins.
Behaviour: Should pick one real, documented problem (not invent a dramatic anecdote) and answer from it — e.g. reframe QueryForgeAI's optimization challenge as the answer.
Style: Short, project-anchored · Follow-ups: "Tell me about QueryForgeAI"

**Q109 — "How would you debug a production issue you can't reproduce locally?"**
Type: Behavioral · Entities: Engineering Concept · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — no debugging methodology is documented anywhere; this is generic engineering-interview material, closer to `INTERVIEW_QUESTIONS` in spirit than to a `content.js` claim.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest degradation, ideally redirecting to Interview Mode ("Practice a backend interview") as the honest, appropriate venue for this kind of generic technical question rather than inventing a specific incident.
Style: Short, honest, redirect · Follow-ups: "Practice a backend interview"

**Q110 — "How did you solve skill-gap detection in Placement Pro+?"**
Type: Project Explanation · Entities: placementpro (Project) · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects · Grounding: `p.features` ("Skill Gap Detection: Identify precisely which skills are missing for the target role") + `p.decisions[1]` ("Analysis is anchored to the real resume...").
Strategy: `move:factual` → retrieval on `project-placementpro`.
Behaviour: Names the specific feature and the resume-anchoring decision.
Style: Short, project-anchored · Follow-ups: "What is Placement Pro+?"

## 4.26 Technology Comparisons

*This category is the most directly and richly grounded in the whole suite — every entry maps onto one of `persona.js`'s three `TECH_TAKES` entries (backend-framework, database, frontend-framework) via `conversation.js`'s `COMPARISON_RE` + `matchTaxonomyEntities`.*

**Q111 — "Flask vs FastAPI"**
Type: Comparison · Entities: Flask, FastAPI · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona (`TECH_TAKES.backend-framework`) · Grounding: `COMPARISON_RE` (`vs`) → `resolveComparison` → `matchTaxonomyEntities` finds exactly `['Flask','FastAPI']` → exact `techs` match.
Strategy: `move:comparison/scope:tech`
Behaviour: Renders the full dimension table (Performance/Validation/Async/Ecosystem/DX) plus "My Take" plus real evidence (QueryForgeAI/Placement Pro+ use Flask, RepoRadarAI uses FastAPI) — this is the Conversation Intelligence upgrade's Example 2/3 case, verbatim.
Style: `## Flask vs FastAPI` + table + "My Take" + "Where This Shows Up" evidence list · Follow-ups: "What technologies does he know?" / "Compare his projects"

**Q112 — "React vs Vue"**
Type: Comparison · Entities: React, Vue · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona (`TECH_TAKES.frontend-framework`) · Grounding: exact match, same pattern as Q111 — this is the specific comparison named in the Conversation Intelligence upgrade's original design brief and the reason `Vue` was added to `SKILLS_TAXONOMY`.
Strategy: `move:comparison/scope:tech`
Behaviour: Same structure as Q111, honestly noting Vue has zero shipped evidence (`evidence: [{project: null, tech: 'Vue'}]` — `_renderTechEvidence()` correctly filters this out rather than fabricating a Vue project).
Style: Same as Q111 · Follow-ups: same pattern.

**Q113 — "PostgreSQL vs MongoDB"**
Type: Comparison · Entities: PostgreSQL, MongoDB · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona (`TECH_TAKES.database`) · Grounding: exact match, same pattern — also the entry with the explicit `groundingNote` about no per-project DB claim exisiting.
Strategy: `move:comparison/scope:tech`
Behaviour: Same table structure, and the honesty blockquote (`groundingNote`) must render, not just the preference.
Style: Same as Q111, includes the `groundingNote` blockquote · Follow-ups: same pattern.

**Q114 — "Compare QueryForgeAI and RepoRadarAI"**
Type: Comparison · Entities: queryforge, reporadar (Projects) · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects · Grounding: `resolveComparison` finds 2 project-name matches → `move:comparison/scope:project` → `providers.js`'s `if (strategy.move === 'comparison' && strategy.scope === 'project') return this._comparisonResponse(query, retrieve(query, 5));`
Strategy: `move:comparison/scope:project`
Behaviour: Structured dimension table (Purpose/Backend/AI Role/Deployment) plus per-project solution summaries plus a "Key Difference" closing line — plus the rendered comparison card (`renderComparisonCard`) in the UI layer.
Style: Table + comparison card · Follow-ups: "Open a live demo" / "Explain the architecture differences"

**Q115 — "SQL vs NoSQL — which do you prefer?"**
Type: Comparison + Opinion (hybrid) · Entities: SQL→PostgreSQL, NoSQL→MongoDB · Diff: Medium · Pri: P1 · Regr: High · Halluc: Low
Sources: Persona (`TECH_TAKES.database`) · Grounding: `COMPARISON_RE` matches first (checked before `OPINION_RE` in `analyzeStrategy`'s control flow) → `matchTaxonomyEntities` correctly resolves `sql`→`PostgreSQL` and `nosql`→`MongoDB` via `SKILLS_TAXONOMY`'s aliases → exact `database` match.
Strategy: `move:comparison/scope:tech` (the "which do you prefer" framing is answered by the same composer's "My Take" section — `resolveOpinion` never even runs since comparison resolved first).
Behaviour: Same as Q113.
Style: Same as Q111 · Follow-ups: same pattern.

**Q116 — "Compare Placement Pro+ and QueryForgeAI"**
Type: Comparison · Entities: placementpro, queryforge (Projects) · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: same pattern as Q114.
Strategy: `move:comparison/scope:project`
Behaviour: Same as Q114, order-reversed — confirms the comparison composer isn't order-dependent.
Style: Same as Q114 · Follow-ups: same pattern.

## 4.27 Recommendations

**Q117 — "Which backend framework would you recommend for a new project?"**
Type: Recommendation · Entities: None named · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona (`TECH_TAKES.backend-framework`) · Grounding: `OPINION_RE` matches (`would you recommend`) → `resolveOpinion` → `CATEGORY_HINTS['backend-framework']` matches "backend framework" → category match, no named entities needed.
Strategy: `move:opinion` (category: `backend-framework`)
Behaviour: Same `_opinionResponse()` composer as a named Flask/FastAPI question — confirms the category-hint path (no explicit tech name) resolves identically to the named-pair path.
Style: `_opinionResponse()`'s trade-off format · Follow-ups: "What technologies does he know?" / "Compare his projects"

**Q118 — "Which database would you choose for a new app?"**
Type: Recommendation · Entities: None named · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona (`TECH_TAKES.database`) · Grounding: `OPINION_RE` matches (`which\s+\w+\s+(would you|do you)\s+(use|choose|...)` — "which database would you choose" fits the pattern exactly) → `CATEGORY_HINTS['database']` matches "database".
Strategy: `move:opinion` (category: `database`)
Behaviour: Same as Q117, database-scoped.
Style: Same as Q117 · Follow-ups: same pattern.

**Q119 — "What would you recommend for someone starting to learn backend engineering?"**
Type: Recommendation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: None specific — closest analog is Persona/Journey · Grounding: `OPINION_RE` matches (`would you recommend`) → `resolveOpinion`: no `CATEGORY_HINTS` match ("backend engineering" ≠ "backend framework"), no named tech entities → returns `null` → falls through.
Strategy: `move:factual` (opinion detection fails to resolve) → generic retrieval.
Behaviour (ideal): A genuine, personal-sounding recommendation (start with Python fundamentals, build a real API, ship something) — but this is advice-giving, a genuinely new class of question the current composers don't target at all.
Style: Short, personal · Follow-ups: "What's your background?" / "Show me his journey"
⚠ Predicted Gap: "recommend advice for a learner" is structurally different from "recommend a specific technology" (`CATEGORY_HINTS` only covers technology categories) — this falls all the way through to generic retrieval with no dedicated composer, most likely landing on `_fallback()` or a loosely-related `journey` doc.

**Q120 — "If I'm hiring for an AI engineer role, should I consider Sudhanshu?"**
Type: Recruiter · Entities: Role, AI Technology · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona, Projects, Profile · Grounding: `classifyIntent`'s recruiter branch matches (`hir` substring in "hiring") — correctly routes as a recruiter question despite the "opinion"-shaped phrasing ("should I consider"), confirming the recruiter regex takes priority appropriately.
Strategy: `move:factual` → `intent:recruiter→retrieval` → `_recommendResponse()`, `focusArea` likely `'ai'` if the visitor's profile has accumulated AI-focused signal.
Behaviour: The full recruiter narrative, ideally foregrounding RepoRadarAI/QueryForgeAI's AI work given the explicit "AI engineer" framing.
Style: Structured recruiter narrative · Follow-ups: "Open the most relevant demo" / "Open contact section"

## 4.28 Opinions

**Q121 — "What's your opinion on microservices vs monoliths?"**
Type: Opinion · Entities: Microservices, Architecture Concept (monolith — not in `SKILLS_TAXONOMY`) · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: None dedicated · Grounding: `COMPARISON_RE` matches ("vs") → `resolveComparison`: `matchTaxonomyEntities` finds only `['Microservices']` (no `Monolith` entry exists in `SKILLS_TAXONOMY`) → fewer than 2 tech entities → returns `null`. Falls to `OPINION_RE` check: matches ("your opinion") → `resolveOpinion`: same single-entity problem, no category hint matches "microservices vs monoliths" → returns `null` too. Both conversation.js checks fail to resolve, `analyzeStrategy` falls through to `ctx.intent === 'architecture'`? `classifyIntent` for this text actually resolves to `'comparison'` (its own, separate `/compare|vs\.?|versus|difference between/` regex matches "vs") — NOT `'architecture'` — so the final explanation-disambiguation branch never runs either. Strategy ends up `factual`.
Strategy: `move:factual` → `providers.js`'s generic retrieval path. Since no doc discusses microservices/monoliths in depth, `hits` may come back thin or empty, but the raw-query comparison regex inside `LocalProvider.generate()` (`if (/compare|vs\.?|versus|difference between/i.test(query))`) ALSO matches and calls `_comparisonResponse(query, hits)`, which looks for ≥2 matching **project** names/ids in the query (none exist here) and falls through to its own final line: `return { text: hits[0]?.doc.text || 'Could not compare.', ... }`.
Behaviour (ideal): A short, honest personal-engineering-opinion answer.
Style: Short, opinionated · Follow-ups: "Explain the architecture"
⚠ Predicted Gap: **this is the single most concrete, reproducible low-quality-response path found in this entire suite.** A visitor asking a completely reasonable engineering-opinion question with "vs" in it, about a topic not covered by any `TECH_TAKES` entry, is predicted to receive the literal string `"Could not compare."` if retrieval returns zero hits — a jarring, broken-feeling dead end. See Section 6/9.

**Q122 — "Do you think AI will replace backend engineers?"**
Type: Opinion · Entities: AI Technology · Diff: Hard · Pri: P2 · Regr: Low · Halluc: Medium
Sources: None · Grounding: N/A — purely speculative, no documented stance exists.
Strategy: `move:factual` → weak retrieval → likely `_fallback()` or a generic AI-related doc mismatch.
Behaviour: A brief, honestly-labeled personal take is acceptable here (this is squarely an opinion question, lower hallucination stakes than a factual claim) as long as it doesn't invent supporting "evidence" (fake statistics, fake quotes) for the opinion.
Style: Short, clearly opinion-flavored · Follow-ups: "Is the AI layer just a wrapper, or something more?"

**Q123 — "What do you think makes a good API?"**
Type: Opinion · Entities: REST APIs, Engineering Concept · Diff: Medium · Pri: P2 · Regr: Low · Halluc: Medium
Sources: Architecture (loosely) · Grounding: retrieval on "API" likely surfaces `arch-backend`/`stack`, but neither states an explicit "what makes a good API" opinion — the closest analog is the "frontend talks to backend exclusively over REST" contract principle.
Strategy: `move:factual` → retrieval
Behaviour: A reasonable, clearly-labeled personal opinion, grounded where possible in the documented REST-contract principle, without presenting generic textbook API-design rules as specific facts about Sudhanshu's practice.
Style: Short, opinion-flavored · Follow-ups: "How do you design a REST API?"

**Q124 — "Is TypeScript worth the overhead over JavaScript?"**
Type: Opinion · Entities: TypeScript, JavaScript · Diff: Hard · Pri: P2 · Regr: Low · Halluc: Medium
Sources: None dedicated · Grounding: `COMPARISON_RE` doesn't match (no "vs"/"compare"/"versus"/"difference between" — "over" isn't covered). `OPINION_RE` doesn't match either (no "prefer"/"would you use"/"better"/"best" — "worth the overhead" isn't covered by any alternative).
Strategy: `move:factual` (both conversation.js detectors miss this phrasing entirely) → `classifyIntent`: no branch matches cleanly → default `'question'` → generic retrieval on "typescript"/"javascript"/"overhead", likely landing on the `stack` doc or `project-reporadar` (the one project using both).
Behaviour (ideal): A grounded personal opinion — RepoRadarAI already uses TypeScript with React — plus a reasoned take on the trade-off.
Style: Short, opinion-flavored, ideally project-anchored · Follow-ups: "What technologies does he know?"
⚠ Predicted Gap: neither `COMPARISON_RE` nor `OPINION_RE` recognizes "worth the overhead" as comparison/opinion language — a real, plausible phrasing for exactly this kind of question is invisible to the entire Conversation Strategy layer today, despite `TypeScript`/`JavaScript` both being named, resolvable entities.

## 4.29 Skill Verification

**Q125 — "Can you prove you know backend engineering?"**
Type: Skill Verification · Entities: None named · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects, Stack · Grounding: `EXPERIENCE_RE` doesn't match ("can you prove" isn't a covered verb) → falls to `classifyIntent`: no clean match → default `'question'` → generic retrieval, likely `stack` or a project doc.
Strategy: `move:factual` → retrieval
Behaviour (ideal): Evidence-forward — named projects and specific decisions, exactly like `_experienceResponse()`'s pattern, even though this phrasing doesn't route there today.
Style: Short, evidence-led · Follow-ups: "Show me his projects"
⚠ Predicted Gap: "prove"/"show evidence of" skepticism-flavored phrasing is semantically identical to `EXPERIENCE_RE`'s intent but isn't covered by its verb list — a real, easy extension opportunity.

**Q126 — "Show me evidence you can build production systems."**
Type: Evidence Request · Entities: None named · Diff: Hard · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `classifyIntent`'s `action-nav` branch (`/navigate|scroll|go to|show me|take me|jump to/`) matches the literal phrase **"show me"** — this question is misclassified as a *navigation command*, not an evidence request, before it ever reaches retrieval.
Strategy: `move:factual` (conversation.js never sees "evidence"/"production systems" as experience-signal, since `EXPERIENCE_RE` doesn't fire and isn't even consulted before intent-based routing takes over) → `intent:action-nav`.
Behaviour (ideal): Should be treated as an experience/evidence question and answered with named projects — exactly what `_experienceResponse()` already does well for other phrasings.
Style: Should be evidence-led, like Q21 · Follow-ups: "Show me his projects"
⚠ Predicted Gap: **this is the clearest concrete example of the "keyword collision" failure mode named in the original design brief.** `decideTool()` will find no section keyword to scroll to (no literal "about/projects/stack/..." substring), so no tool fires, and `proactiveShouldRun` is also suppressed for `action-nav` — the turn likely falls through to a thin/generic retrieval answer or `_fallback()`, having been silently misrouted at the very first classification step.

**Q127 — "How do I know you're not just listing buzzwords?"**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Projects (as the honest rebuttal) · Grounding: N/A — no doc addresses skepticism directly, but the correct rebuttal (live demos, specific decisions, open-source repo) is fully groundable in real data.
Strategy: `move:factual` → weak retrieval → likely `_fallback()`.
Behaviour (ideal): Should respond to the skepticism directly and calmly by pointing at concrete, checkable evidence (three live demos, one open-source repo) rather than getting defensive or repeating the same buzzword list that prompted the skepticism.
Style: Short, calm, evidence-forward · Follow-ups: "Open a live demo" / "Show me the open-source repo"

**Q128 — "Can you demonstrate AI integration skills?"**
Type: Evidence Request · Entities: AI Technology · Diff: Medium · Pri: P1 · Regr: High · Halluc: Low
Sources: Projects · Grounding: `classifyIntent`'s `'stack'` branch (`/\b(stack|technolog|tools|skills|.../)`) matches the literal word **"skills"** — routes to `_stackResponse()`, the full 19-technology dump, rather than an AI-specific evidence answer.
Strategy: `move:factual` → `intent:stack→retrieval`
Behaviour (ideal): Should name the three concrete AI use cases (per Q90), not the entire stack card.
Style: Should be AI-specific, evidence-led · Follow-ups: "How do you use AI in your projects?"
⚠ Predicted Gap: the word "skills" alone is enough to trigger the full stack dump regardless of the actual topic named alongside it ("AI integration") — a second concrete instance of the "any mention of a stack-adjacent word forces the generic stack card" pattern flagged first at Q13.

**Q129 — "What's the most complex system you've built?"**
Type: Opinion · Entities: None named · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects · Grounding: no "complexity" field or ranking exists — subjective judgment call, same structural gap as Q31.
Strategy: `move:factual` → retrieval, likely lands on whichever project doc scores highest by accident, not a deliberate judgment.
Behaviour (ideal): An honest, reasoned pick (e.g., RepoRadarAI's layered intelligence, or QueryForgeAI's schema-aware reasoning) framed explicitly as a personal read, not an objective fact.
Style: Short, opinionated · Follow-ups: "Tell me about that project"

## 4.30 Recruiter Questions

**Q130 — "Why should we hire him?"**
Type: Recruiter · Entities: None · Diff: Easy · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Profile, Projects, Persona · Grounding: `classifyIntent`'s recruiter branch (`why should`) → `_recommendResponse()`
Strategy: `move:factual` → `intent:recruiter→retrieval`
Behaviour: Full recruiter narrative, focus-area-aware project reordering, and — this is the Sprint 3 Priority 1 regression target — a DIFFERENT closing/lead sentence variant if asked again later in the same session (`_pickVariant`).
Style: Structured (`## Why Hire Sudhanshu Sinha`, H3: What He's Strongest At, optional focus-area section) · Follow-ups: "Open any project demo" / "Compare two projects"

**Q131 — "What makes him stand out from other candidates?"**
Type: Recruiter · Entities: Role · Diff: Easy · Pri: P0 · Regr: High · Halluc: Low
Sources: Profile, Projects · Grounding: `classifyIntent`'s recruiter branch matches on **"candidates"** (substring `candidate`) → `_recommendResponse()`
Strategy: same as Q130.
Behaviour: Same composer, differently-worded prompt confirming the regex isn't over-fit to "why should" specifically.
Style: Same as Q130 · Follow-ups: same pattern.

**Q132 — "Is he available for full-time roles right now?"**
Type: Limitation · Entities: Role · Diff: Hard · Pri: P0 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A — availability/employment status is not documented anywhere in `content.js`. `classifyIntent`'s recruiter regex does not match this phrasing (no "recruit/hir/employ/candidate/fit for/strongest/why should/looking for" substring present).
Strategy: `move:factual` → weak/no retrieval match → likely `_fallback()`.
Behaviour: Must not invent an availability status. Correct answer: honestly says this isn't something the portfolio states, and redirects to direct contact (email/LinkedIn) for exactly this kind of time-sensitive, personal question.
Style: Short, honest, redirects to contact · Follow-ups: "Open contact section"

**Q133 — "What's his notice period?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A, same pattern as Q132.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Same honest redirect as Q132 — must never invent a specific notice-period duration.
Style: Short, honest, redirect · Follow-ups: "Open contact section"

**Q134 — "Can he relocate for the right role?"**
Type: Limitation · Entities: Role · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A, same pattern.
Strategy: `move:factual` → weak/no match → `_fallback()` (recruiter regex doesn't match "relocate"/"right role" either).
Behaviour: Same honest redirect.
Style: Short, honest, redirect · Follow-ups: "Open contact section"

**Q135 — "What salary range is he expecting?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P1 · Regr: High · Halluc: High
Sources: None · Grounding: N/A, same pattern — this is the single highest-stakes honesty test in the Recruiter category: a confident, specific, invented number here would be actively damaging, not just inaccurate.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Absolutely must not invent a number or range. Honest redirect to direct contact is the only acceptable answer.
Style: Short, honest, redirect · Follow-ups: "Open contact section"

## 4.31 Hiring Manager Questions

**Q136 — "How would he perform in a fast-paced startup environment?"**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects (indirect evidence) · Grounding: no explicit "startup fit" claim exists, but three shipped, deployed, production systems built solo is real, defensible supporting evidence for a *reasoned inference* (not a documented fact).
Strategy: `move:factual` → retrieval, likely `why-hire` or generic.
Behaviour: Should frame the answer explicitly as an inference from real shipped work (ships fast, works end-to-end solo) rather than presenting it as a verified fact or a generic personality claim.
Style: Short, evidence-grounded inference, clearly framed as such · Follow-ups: "Why hire him?"

**Q137 — "Can he work independently with minimal supervision?"**
Type: Evidence Request · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Projects · Grounding: all three shipped systems read as solo-built end-to-end products — a reasonably strong, evidence-backed inference.
Strategy: `move:factual` → retrieval.
Behaviour: A confident "yes," backed by "three complete, shipped systems, end to end" as the evidence, not a generic personality assertion.
Style: Short, evidence-grounded · Follow-ups: "Show me his projects"

**Q138 — "How does he handle feedback and code review?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — no code-review process, team dynamic, or feedback-handling claim exists anywhere.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest decline — this is a genuinely unanswerable question from this data, and any specific claim would be fabricated.
Style: Short, honest · Follow-ups: "What are his greatest strengths?"

**Q139 — "What's his experience working in a team?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A — the documented projects read as solo work; no team-collaboration claim exists either way.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest — should not invent team experience, and ideally frames the solo-shipped-systems evidence honestly as what IS documented (independent delivery) rather than dodging the question entirely.
Style: Short, honest, reframes toward what's actually documented · Follow-ups: "Can he work independently?"

## 4.32 CTO Questions

**Q140 — "How would he approach scaling one of these systems to 100x traffic?"**
Type: Technology Explanation · Entities: Architecture Concept · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: Architecture · Grounding: no specific scaling numbers/benchmarks exist anywhere (`STATS` are explicitly marked `placeholder: true` for exactly this reason) — the only legitimate grounding is the architectural principle that layers can scale independently (Docker/Vercel/Netlify + decoupled REST frontend).
Strategy: `move:factual` → retrieval, likely `arch-overview`.
Behaviour: A reasoned architectural answer using the documented five-layer separation — must NOT invent a specific "handles X req/sec" benchmark, since none exists.
Style: Short, architecturally reasoned, no fabricated numbers · Follow-ups: "Explain the architecture"

**Q141 — "What's his philosophy on technical debt?"**
Type: Opinion · Entities: Engineering Concept · Diff: Hard · Pri: P2 · Regr: Low · Halluc: Medium
Sources: None dedicated · Grounding: no explicit "technical debt" statement exists; the closest honest analog is `why-hire`'s "turns ambiguous problems into reliable, observable software."
Strategy: `move:factual` → retrieval, weak match (vocabulary mismatch, similar to Q96's hallucination pattern).
Behaviour: A reasoned, honestly-scoped opinion connected to the real documented principle, not an invented "I always pay down debt every sprint" specific claim.
Style: Short, honestly scoped opinion · Follow-ups: "Why hire him?"

**Q142 — "Would he be able to lead a small engineering team?"**
Type: Limitation · Entities: Role · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A — no leadership experience is documented anywhere.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest decline — must not invent leadership claims; may honestly note that documented experience is individual-contributor/solo-founder-style delivery.
Style: Short, honest · Follow-ups: "What are his greatest strengths?"

**Q143 — "How does he think about system reliability and observability?"**
Type: Technology Explanation · Entities: Architecture Concept · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Architecture · Grounding: `ARCHITECTURE`'s deploy node explicitly says "Containerized and **observable**." — a direct, quotable match on the specific word "observable."
Strategy: `move:factual` → retrieval, likely `arch-deploy`.
Behaviour: Should quote/paraphrase this specific documented principle rather than a generic observability-buzzword answer.
Style: Short, direct, quoting the real principle · Follow-ups: "Explain the architecture"

## 4.33 Behavioral Questions

**Q144 — "Tell me about a time you disagreed with a technical decision."**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A — no specific anecdote exists anywhere in `content.js`.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Must NOT invent a specific anecdote/story — this is one of the highest-hallucination-temptation question shapes in the whole suite (behavioral-interview phrasing implicitly begs for a fabricated narrative). Honest redirect to Interview Mode or a real documented decision (e.g. QueryForgeAI's transparency-over-automation trade-off) is the correct behavior.
Style: Short, honest, redirects to real documented decisions instead of inventing a story · Follow-ups: "What are the engineering decisions behind QueryForgeAI?"

**Q145 — "How do you handle tight deadlines?"**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Profile (loosely, via `why-hire`'s "ships" framing) · Grounding: no deadline-specific claim exists; "he ships" is the closest honest analog.
Strategy: `move:factual` → retrieval, likely `why-hire`.
Behaviour: Should stay at the level of the real documented framing ("ships production systems") rather than inventing a specific "under deadline pressure I..." story.
Style: Short, honestly scoped · Follow-ups: "Why hire him?"

**Q146 — "Describe a time you had to learn something new quickly."**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: Journey (loosely) · Grounding: `JOURNEY`'s phases show progression (Python → backend → AI applications) but no specific "quick learning" anecdote.
Strategy: `move:factual` → retrieval, likely a `journey-*` doc.
Behaviour: Should reference the documented journey honestly (e.g., the "Intelligence" phase — "began shipping applied AI") rather than fabricating a specific timeline or incident.
Style: Short, honestly scoped, journey-anchored · Follow-ups: "Show me his journey"

**Q147 — "How do you prioritize competing tasks?"**
Type: Behavioral · Entities: None · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest decline — no documented prioritization methodology exists; must not invent one (e.g., a specific framework name never mentioned in `content.js`).
Style: Short, honest · Follow-ups: "What are his greatest strengths?"

**Q148 — "What motivates you as an engineer?"**
Type: Behavioral · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Profile · Grounding: `PROFILE.tagline` — "Building Intelligent Software That Solves Real Problems." — a direct, quotable, genuinely on-topic answer.
Strategy: `move:factual` → retrieval, likely `profile`.
Behaviour: Should quote/paraphrase the tagline directly — this is one of the few behavioral-shaped questions with a clean, real, specific answer already sitting in `content.js`.
Style: Short, direct, confident · Follow-ups: "What's your background?"

## 4.34 Strengths

**Q149 — "What are his greatest strengths as an engineer?"**
Type: Skill Verification · Entities: None · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Persona (via `_recommendResponse()`'s "What He's Strongest At" section) · Grounding: `classifyIntent`'s recruiter regex does NOT match this phrasing (no recruit/hir/employ/candidate/fit for/strongest/why should/looking for substring — "strengths" ≠ "strongest") — falls to generic `'question'`.
Strategy: `move:factual` → retrieval. The actual "💪 What He's Strongest At" bulleted list only renders inside `_recommendResponse()`, which is only reached via the recruiter-intent path or a `'recommend'`-kind top doc — and the underlying `why-hire` doc's indexed *text* field doesn't literally contain the word "strengths," so a strong tag/text match isn't guaranteed either.
Behaviour (ideal): The specific "Python Backend Engineering / Applied AI / System Architecture / Problem Solving" list.
Style: Short, specific list · Follow-ups: "Why hire him?"
⚠ Predicted Gap: this question asks almost exactly what `_recommendResponse()` already answers well, but the specific wording ("strengths," not "why hire" or "recruiter/candidate") may not reliably route there — a real, checkable routing gap between two semantically-identical question phrasings.

**Q150 — "What is he best at?"**
Type: Skill Verification · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona · Grounding: same routing uncertainty as Q149.
Strategy: `move:factual` → retrieval, uncertain.
Behaviour: Same ideal answer as Q149.
Style: Same as Q149 · Follow-ups: same pattern.

**Q151 — "What sets his engineering apart?"**
Type: Skill Verification · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona, Profile · Grounding: same routing uncertainty, though "apart" is semantically close to "stand out" (Q131), which DOES have a recruiter-regex hit via a different substring than this phrasing has.
Strategy: `move:factual` → retrieval, uncertain.
Behaviour: Same ideal answer.
Style: Same as Q149 · Follow-ups: same pattern.

## 4.35 Weaknesses

**Q152 — "What are his weaknesses?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P0 · Regr: High · Halluc: High
Sources: SKILLS_TAXONOMY (the only real, honest source of a documented "gap") · Grounding: N/A for a direct "weaknesses" statement — but `SKILLS_TAXONOMY`'s explicitly-flagged not-owned skills (AWS, Kubernetes, CI/CD, GraphQL, Redis, Node.js, Django, Kafka, Unit Testing/pytest/jest/TDD) are the single most defensible, honest, real answer available.
Strategy: `move:factual` → weak/no match → likely `_fallback()` today (no composer currently reads `SKILLS_TAXONOMY` outside of `jdmatch.js`'s JD-scoring path).
Behaviour (ideal): This is the single most important honesty test in the "people" half of this suite. The correct answer neither dodges the question with generic corporate deflection ("I'm a perfectionist!") NOR invents a flattering pseudo-weakness — it should honestly name real, documented stack gaps (cloud infra, CI/CD, formal testing) as the most defensible, checkable answer.
Style: Short, honest, confident (not defensive) · Follow-ups: "What technologies does he know?" / "Paste a job description to match"
⚠ Predicted Gap: `SKILLS_TAXONOMY`'s not-owned list is currently reachable ONLY through `jdmatch.js`'s JD-paste flow — there is no standalone composer that answers a direct "what are his weaknesses / what doesn't he know" question using that same, already-existing, already-honest data. This is a real, concrete, low-effort improvement opportunity: the data needed for a great answer already exists in the codebase, just not wired to this question shape.

**Q153 — "What could he improve on?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: SKILLS_TAXONOMY · Grounding: same as Q152.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Same ideal answer as Q152.
Style: Same as Q152 · Follow-ups: same pattern.

**Q154 — "What's he not good at?"**
Type: Limitation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: SKILLS_TAXONOMY · Grounding: same as Q152 — blunter phrasing, same underlying gap.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Same ideal answer; must handle the blunter tone without becoming defensive or evasive.
Style: Same as Q152 · Follow-ups: same pattern.

## 4.36 Career Goals

**Q155 — "What are his career goals?"**
Type: Career · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Journey (loosely) · Grounding: `JOURNEY`'s "Now" phase — "Engineering SRIIVERSEAI — building intelligent software that solves real problems" — is forward-looking-adjacent but not literally a stated goal.
Strategy: `move:factual` → retrieval, likely `journey-7` (the "Now" phase).
Behaviour: Should use this real, current-state framing honestly rather than inventing specific future goals (a target company, a target role title) never stated anywhere.
Style: Short, honestly scoped · Follow-ups: "Show me his journey"

**Q156 — "Where does he see himself in 5 years?"**
Type: Career · Entities: None · Diff: Hard · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — purely speculative, zero grounding.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Must not invent a specific 5-year narrative. Honest decline is the only correct behavior.
Style: Short, honest · Follow-ups: "What are his career goals?"

**Q157 — "Is he looking for a full-time role or freelance work?"**
Type: Limitation · Entities: Role · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A, same pattern as Q132.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest redirect to direct contact.
Style: Short, honest, redirect · Follow-ups: "Open contact section"

## 4.37 Education

**Q158 — "What's his educational background?"**
Type: Limitation · Entities: None · Diff: Easy (for the assistant to get right, since the gap is explicit) · Pri: P0 · Regr: High · Halluc: High
Sources: None · Grounding: N/A — `docs/SPRINT_3_PLAN.md`'s own Repository Verification section explicitly confirms: *"content.js has no education history, employment dates, or certifications fields."* This is the single most clearly pre-documented content gap in the entire repository's own planning history.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: A clean, confident "that's not part of this portfolio's documented background" — there is no excuse for hedging or inventing a university/degree here, since the gap was identified and written down before this suite even existed.
Style: Short, honest, confident · Follow-ups: "What's your background?" / "Show me his journey"

**Q159 — "Did he go to college?"**
Type: Limitation · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: same as Q158.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Same honest decline.
Style: Same as Q158 · Follow-ups: same pattern.

**Q160 — "What did he study?"**
Type: Limitation · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: same as Q158.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Same honest decline.
Style: Same as Q158 · Follow-ups: same pattern.

## 4.38 Limitations (of the assistant itself)

**Q161 — "What can't you help me with?"**
Type: Limitation · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None dedicated (a genuinely new, self-aware composer would be needed) · Grounding: `IDENTITY_RE` doesn't match this exact negation-phrased question.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour (ideal): An honest, specific self-description of scope — only knows Sudhanshu's portfolio content, can't discuss unrelated topics, doesn't have live internet access, isn't a general-purpose chatbot.
Style: Short, honest, specific · Follow-ups: "Who are you?"
⚠ Predicted Gap: there is currently no "negative capability" composer — `_identityResponse()` describes what it CAN do, but nothing describes what it explicitly cannot, which is a distinct and valuable trust-building answer for a skeptical technical visitor.

**Q162 — "Are you connected to a real AI model, or is this all scripted?"**
Type: Limitation · Entities: AI Technology · Diff: Hard · Pri: P0 · Regr: High · Halluc: Medium
Sources: None dedicated · Grounding: `docs/PORTFOLIO_AUDIT.md`'s own "Biggest Weakness" section explicitly recommends the assistant "should clearly communicate 'Running in Local AI Mode'" — this exact disclosure does not currently exist anywhere in `providers.js`'s composers.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour (ideal): A transparent, confident answer: deterministic, offline, retrieval-based local reasoning by default (`LocalProvider`), with an architecture that supports swapping in a real LLM provider (`OpenAIProvider`/`ClaudeProvider`/etc., currently inert), without a network call today. This is a technically-curious visitor's single most important trust question, and `docs/PORTFOLIO_AUDIT.md` flags getting it wrong as the top risk to the whole AI-focused portfolio's credibility.
Style: Short, transparent, confident (not defensive) · Follow-ups: "Explain the architecture"
⚠ Predicted Gap: no composer currently self-discloses "Local AI Mode" — this is the single highest-value missing capability named anywhere in this document, because `docs/PORTFOLIO_AUDIT.md` already predicted the exact failure mode ("a technically curious reviewer can inspect the Network tab and discover no AI inference occurs... this weakens the credibility of an AI-focused portfolio") a full sprint before this suite was written.

**Q163 — "Can you access the internet?"**
Type: Limitation · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None dedicated · Grounding: `memory.js`'s header comment ("All data is in-browser only. Nothing leaves the client.") and `docs/CURSOR_RULES.md`'s zero-build philosophy are the real, correct grounding, but no user-facing composer surfaces this.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest "no" — fully offline/client-side, same family of question as Q162.
Style: Short, honest · Follow-ups: "Are you connected to a real AI model?"

**Q164 — "Do you remember me from a previous visit?"**
Type: Conversation · Entities: None · Diff: Medium · Pri: P1 · Regr: High · Halluc: Low
Sources: Memory · Grounding: `memory.js`'s `STORAGE_KEY` uses `sessionStorage`, not `localStorage` — memory persists across a refresh within the same tab/session, but NOT across a closed-and-reopened browser session or a new visit.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest, precise distinction — "within this session, yes; across visits, no" — a wrong answer here (claiming persistent cross-visit memory, or claiming zero memory at all) is a specific, checkable factual error about the assistant's own real, documented architecture.
Style: Short, precise · Follow-ups: none needed — this is a self-contained meta-answer.

## 4.39 Unknown Technologies

**Q165 — "Does he know Kubernetes?"**
Type: Skill Verification · Entities: Kubernetes (Cloud Technology) · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: SKILLS_TAXONOMY (explicitly lists Kubernetes as *requestable, not owned*) · Grounding: no doc in `knowledge.js`'s index mentions "Kubernetes" at all — it exists only inside `SKILLS_TAXONOMY`, which no standalone composer reads for a direct skill-verification question (only `jdmatch.js` reads it, and only for a pasted JD).
Strategy: `move:factual` → no retrieval match → `_fallback()`.
Behaviour (ideal): A clean, honest "no, that's not part of the current stack" — `_fallback()`'s generic wording technically avoids fabrication but doesn't confirm the gap explicitly or confidently.
Style: Short, honest, confident · Follow-ups: "What technologies does he know?" / "Paste a job description to match"

**Q166 — "Does he know Go (Golang)?"**
Type: Skill Verification · Entities: Go (Language — not in `SKILLS_TAXONOMY` at all) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None, not even in `SKILLS_TAXONOMY` · Grounding: N/A — this is a technology with zero representation anywhere in the codebase's data model, one level further ungrounded than Kubernetes (Q165), which at least appears in `SKILLS_TAXONOMY`.
Strategy: `move:factual` → no retrieval match → `_fallback()`.
Behaviour: Same honest "no" as Q165, though with even less structured data to draw the confidence from.
Style: Short, honest · Follow-ups: same pattern.

**Q167 — "Has he worked with AWS?"**
Type: Skill Verification · Entities: AWS (Cloud Technology) · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: SKILLS_TAXONOMY · Grounding: same as Q165, AND this phrasing is third-person ("has he," not "have you"/"do you") — see the cross-cutting finding below.
Strategy: `move:factual` → no retrieval match → `_fallback()`.
Behaviour: Same honest "no" as Q165.
Style: Short, honest · Follow-ups: same pattern.
⚠ Predicted Gap (cross-cutting, high severity): **every regex in `assistant/conversation.js` (`IDENTITY_RE`, `OPINION_RE`'s `would you`/`do you` branches, `EXPERIENCE_RE`'s `have you`/`your ... experience` branches) is written assuming second-person phrasing** ("you," addressing the assistant as if it *were* Sudhanshu). A portfolio visitor referring to Sudhanshu in the third person — "does he know X," "has he built Y," "would he recommend Z" — is a completely natural, arguably *more* natural phrasing for a third-party portfolio assistant, and it is invisible to nearly the entire Conversation Strategy layer today. This single finding likely affects a meaningfully large fraction of real-world phrasing across almost every category in this suite, not just Q167 — flagged here and cross-referenced in Sections 6 and 9 as the highest-leverage single fix available.

**Q168 — "Does he know Rust?"**
Type: Skill Verification · Entities: Rust (Language — not in `SKILLS_TAXONOMY`) · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None · Grounding: same as Q166 (not represented anywhere), plus the same third-person phrasing gap as Q167.
Strategy: `move:factual` → no retrieval match → `_fallback()`.
Behaviour: Same honest "no."
Style: Short, honest · Follow-ups: same pattern.

## 4.40 Honest "I Don't Know" Scenarios

**Q169 — "What was his GPA?"**
Type: Limitation · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: High
Sources: None · Grounding: N/A, compounding gap on top of Q158's education gap (no institution is even documented, let alone a GPA).
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Clean, confident honest decline — a specific invented number here (e.g., "3.8") would be an unambiguous, easily-checkable fabrication.
Style: Short, honest · Follow-ups: "What's your background?"

**Q170 — "How many years of professional experience does he have?"**
Type: Limitation · Entities: None · Diff: Medium · Pri: P1 · Regr: High · Halluc: High
Sources: Journey (qualitative only) · Grounding: `JOURNEY` has phases but zero dates/durations — the honest answer describes the qualitative progression without inventing a number.
Strategy: `move:factual` → retrieval on `journey-*` docs, likely weak on the specific "years" ask.
Behaviour: Same pattern as Q56 — qualitative journey description, explicit honesty about the missing precision.
Style: Short, honest about the missing precision · Follow-ups: "Show me his journey"

**Q171 — "What companies has he worked for?"**
Type: Limitation · Entities: Company · Diff: Easy · Pri: P1 · Regr: High · Halluc: High
Sources: None · Grounding: N/A — `PROFILE` has no employer history field; `JOURNEY`/`PROJECTS` describe independently-shipped systems, not employment relationships.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Honest decline — should not invent employer names, and may honestly reframe toward the documented independent/solo-shipped project history instead.
Style: Short, honest, reframes to real data · Follow-ups: "Show me his projects"

**Q172 — "What's his exact date of birth?"**
Type: Limitation · Entities: None · Diff: Easy · Pri: P2 · Regr: Low · Halluc: High
Sources: None · Grounding: N/A — not documented, and not an appropriate thing to guess at regardless.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Clean, brief decline — no attempt to guess or approximate.
Style: Short, honest · Follow-ups: "Who are you?"

## 4.41 Edge Cases

**Q173 — (submits an empty / whitespace-only message)**
Type: Unknown · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None · Grounding: `assistant.js`'s `ask()` entry guard should reject/ignore empty `userText` before it reaches intent classification, memory, or retrieval.
Strategy: N/A — should short-circuit before strategy analysis.
Behaviour: No bubble should render for an empty submission; no crash, no empty-string `_fallback()` call, no wasted memory entry.
Style: N/A (no response expected) · Follow-ups: N/A
⚠ Predicted Gap: worth explicitly regression-testing — a missing empty-string guard could produce a blank assistant bubble or a confusing generic fallback for accidental Enter-key presses.

**Q174 — "asdkjhaslkdjhaslkdjh qwopiqwoep"**
Type: Unknown · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: None · Grounding: no tags in `knowledge.js` will stem-match gibberish tokens → zero retrieval hits → `_fallback()`.
Strategy: `move:factual` → no match → `_fallback()`.
Behaviour: Graceful, friendly fallback that redirects toward things it CAN help with (e.g., "ask about my projects, stack, or experience") rather than a bare error or empty response.
Style: Short, friendly redirect · Follow-ups: "What can you help me with?"

**Q175 — "hey so like I was wondering what languages do you use and also is Docker involved and btw do you have a project that uses AI and also what's the deal with your architecture overall"**
Type: Unknown · Entities: Docker, AI Technology, Architecture Concept · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Stack, Docker doc, AI project docs, Architecture · Grounding: a single long multi-question run-on message — `knowledge.js`'s retrieval will score against all tokens simultaneously and likely surface only the single highest-scoring document, silently dropping 2-3 of the 4 embedded sub-questions.
Strategy: `move:factual` → single retrieval pass → single-topic answer.
Behaviour (ideal): Either answers the most prominent sub-question and explicitly invites the visitor to ask the rest one at a time, or (unrealistically, given current architecture) addresses all four. Realistically, only one topic gets addressed.
Style: Short, single-topic, with an explicit "ask me about the others too" nudge · Follow-ups: "What's your architecture?" / "Do you use Docker?"
⚠ Predicted Gap: this is the clearest demonstration of the "keyword retrieval, not true multi-intent parsing" limitation flagged in `docs/PORTFOLIO_AUDIT.md` — a single composite message silently loses most of its sub-questions.

**Q176 — "¿Sabes programar en Python?" (non-English input)**
Type: Unknown · Entities: Python · Diff: Hard · Pri: P2 · Regr: Low · Halluc: Medium
Sources: None (system is English-only) · Grounding: `tokenize()`/stemming and every regex in `conversation.js` are English-pattern-only; "Sabes" won't match any greeting/identity/experience pattern, and "programar" won't stem-match "python"/"programming" tags reliably.
Strategy: `move:factual` → weak/no match → `_fallback()`.
Behaviour: Graceful English-only fallback is acceptable (the portfolio has no stated multi-language requirement) — the failure mode to avoid is a nonsensical or broken response, not simply "I only speak English right now."
Style: Short, honest about English-only scope · Follow-ups: "Do you know Python?" (English retry)

## 4.42 Multi-turn Conversations

**Q177 — Turn 1: "Tell me about QueryForgeAI." Turn 2: "What tech does it use?"**
Type: Conversation · Entities: QueryForgeAI, Programming Languages, Frameworks · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Projects, Memory (`lastProject`) · Grounding: Turn 2 has no explicit project name — `assistant.js` must resolve "it" via `memory.lastProject`/`awareness.currentProject` to stay on QueryForgeAI rather than defaulting to the visitor's most-recently-viewed section or a generic stack answer.
Strategy: Turn 2 `move:factual`, `scope:project` (carried from memory, not re-detected from the message itself).
Behaviour: Turn 2 must answer specifically about QueryForgeAI's stack (Python, FastAPI/Flask, SQL, LLM integration per its project entry), not the full portfolio-wide `STACK`.
Style: Turn 2 short, project-scoped · Follow-ups: "What was the hardest part of building it?"

**Q178 — Turn 1: "What's your tech stack?" Turn 2: "Which one do you like most?"**
Type: Conversation → Opinion · Entities: Programming Languages, Frameworks · Diff: Medium · Pri: P0 · Regr: High · Halluc: Medium
Sources: Stack, Persona (`TECH_TAKES`), Memory (`activeTopic`) · Grounding: Turn 2's "which one" is a bare pronoun referring to the just-listed stack — `OPINION_RE`'s `which .* would you|what's better` branch expects a comparison-shaped question, not this elliptical single-word-scope follow-up; without `activeTopic` correctly holding "stack," Turn 2 risks a generic/fallback response instead of a genuine opinion.
Strategy: Turn 2 `move:opinion`, `scope:tech`, entities resolved from memory context, not the message.
Behaviour (ideal): A specific, opinionated favorite (backed by `TECH_TAKES` if one of the stack entries has an authored opinion) rather than a deflection.
Style: Turn 2 short, opinionated · Follow-ups: "Why do you like that one?"
⚠ Predicted Gap: `OPINION_RE` is pattern-anchored to explicit comparison phrasing; a bare "which one" with no restated entities is a plausible miss.

**Q179 — Turn 1: "Do you know Docker?" Turn 2: "What about Kubernetes?"**
Type: Skill Verification × 2 · Entities: Docker, Kubernetes · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Docker doc (Turn 1), SKILLS_TAXONOMY (Turn 2) · Grounding: Turn 2's "what about X" is a parallel-structure ellipsis reusing Turn 1's implicit question shape ("do you know X") with a new entity — this requires recognizing the elliptical pattern and swapping only the entity, landing on the SAME honest "not in the current stack" answer type as Q165, not a generic fallback.
Strategy: Turn 2 `move:factual` ideally resolved as a repeat of Turn 1's skill-verification shape with `entities:[Kubernetes]`.
Behaviour: Turn 1 = confident "yes, used in X/Y"; Turn 2 = confident, consistent "no, that's not currently part of the stack" — critically, Turn 2 must not contradict Turn 1's tone (e.g., must not suddenly become defensive or evasive just because the answer changes from yes to no).
Style: Both short and direct · Follow-ups: "What technologies does he know?"

## 4.43 Context Switching

**Q180 — Turn 1: "Tell me about QueryForgeAI." Turn 2: "Actually, tell me about SRIIVERSEAI instead."**
Type: Conversation · Entities: QueryForgeAI, SRIIVERSEAI · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Projects, Memory (`lastProject` must UPDATE, not just read) · Grounding: "Actually... instead" is an explicit topic-switch signal with a named entity — this is the easy case (explicit new project name given) and should update `memory.lastProject`/`activeTopic` to SRIIVERSEAI for any subsequent elliptical follow-up.
Strategy: Turn 2 `move:factual`, `scope:project`, explicit entity overrides memory.
Behaviour: Clean switch, no bleed-through of QueryForgeAI details into the SRIIVERSEAI answer.
Style: Short, project-scoped · Follow-ups: "What tech does it use?" (should now resolve to SRIIVERSEAI if asked next)

**Q181 — Turn 1: "Why should we hire him?" Turn 2: "How do I get to the projects section?"**
Type: Recruiter → Navigation · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Persona (Turn 1), Tools (Turn 2) · Grounding: abrupt shift from conversational recruiter content to a pure navigation action — `classifyIntent` must re-classify from scratch each turn rather than getting "stuck" continuing the recruiter narrative.
Strategy: Turn 2 `move:navigation`/action-nav, ignores Turn 1's strategy entirely.
Behaviour: Turn 2 should trigger the scroll-to-projects tool cleanly, with no leftover recruiter framing.
Style: Turn 2 short, action-confirming · Follow-ups: none needed (action already taken)

**Q182 — Turn 1: "What's Python used for in your projects?" Turn 2: "and SQL?"**
Type: Conversation · Entities: Python, SQL · Diff: Hard · Pri: P0 · Regr: High · Halluc: Medium
Sources: Python doc, SQL doc, Memory (`activeTopic`) · Grounding: Turn 2 is a two-word elliptical fragment ("and SQL?") with no verb and no restated question — the ONLY way to answer correctly is to reuse Turn 1's implicit question template ("what's X used for in your projects") with SQL substituted for Python; this is a materially harder ellipsis-resolution case than Q179 since there's no "what about" signal, just a bare conjunction + entity.
Strategy: Turn 2 `move:factual`, requires template-carryover from `activeTopic`/last-question-shape (not just last-entity).
Behaviour: Turn 2 should answer specifically about SQL's role in the projects (QueryForgeAI's natural-language-to-SQL translation), matching Turn 1's framing.
Style: Turn 2 short, parallel in structure to Turn 1's answer · Follow-ups: "Tell me about QueryForgeAI"
⚠ Predicted Gap: two-word fragment follow-ups with no repeated verb are the hardest ellipsis case in this suite — a strong candidate for a generic/fallback response if `activeTopic` only tracks entity, not question-shape.

## 4.44 Conversation Memory

**Q183 — Turn 1: "I'm a hiring manager at a fintech startup, and I'm exploring your work." Turn 2 (later): "Which project would you recommend I look at?"**
Type: Recruiter · Entities: Role, Company (generic) · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Memory (`visitorProfile`), Projects · Grounding: `memory.js`'s `profile.ingest()` should pick up the recruiter/hiring-manager signal from Turn 1 and persist it; Turn 2's recommendation should be visibly informed by that profile (recruiter-appropriate project ordering/framing) rather than a generic, profile-blind answer.
Strategy: Turn 2 `intent:recruiter` (or `recommend`), `visitorProfile.role` populated from Turn 1.
Behaviour: Turn 2's recommendation should reflect Turn 1's stated context, ideally favoring a project with clear business/product framing over a purely technical one, and Turn 2 should NOT ask "who are you?" again — the whole point of memory is not re-asking what's already known.
Style: Short, personalized · Follow-ups: "Tell me more about that project"

**Q184 — "What did I just ask you?"**
Type: Conversation · Entities: None · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: Memory (raw turn history) · Grounding: `memory.js` stores the full turn history in-session — a correct answer requires the assistant to read back its own conversation log, which is a distinct capability from retrieval-based content answering.
Strategy: `move:factual`, `scope:conversation` (a scope not covered by any current `conversation.js` pattern).
Behaviour (ideal): An accurate quote/paraphrase of the actual previous user message.
Style: Short, accurate · Follow-ups: none needed
⚠ Predicted Gap: no composer in `providers.js` currently reads back prior turns for a meta "what did I ask" query — this almost certainly falls to generic retrieval or `_fallback()` today, since the question itself contains no content keywords to retrieve against.

**Q185 — (asks "Why should we hire him?" twice in a row, in the same session)**
Type: Recruiter (regression-specific) · Entities: None · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Persona, Memory (`usedPhraseKeys`) · Grounding: this is the direct regression test for Sprint 3 Priority 5 ("avoid repeating previous responses") — `_pickVariant()`/`memory.markPhraseUsed()` should produce a noticeably different opening/closing line the second time, not a byte-identical repeat.
Strategy: both turns `intent:recruiter` → `_recommendResponse()`.
Behaviour: Second answer should carry the same core facts (same strengths, same projects) but different phrasing/variant selection — verbatim repetition on a two-in-a-row ask is the single clearest observable regression signal for this feature.
Style: Both structured/recruiter-style, second one varied · Follow-ups: varied wording ideally too

## 4.45 Follow-up Questions

**Q186 — (clicks the suggested follow-up chip shown after a greeting response)**
Type: Navigation · Entities: None · Diff: Easy · Pri: P1 · Regr: Medium · Halluc: Low
Sources: `buildFollowups()`'s greeting-intent branch · Grounding: the chip's label and its resulting action must match (e.g., a "Show me your projects" chip must actually scroll to/discuss projects when clicked, not silently no-op or mismatch).
Strategy: N/A — this tests the follow-up generation → click → response pipeline end-to-end, not a single message.
Behaviour: Chip click produces a response consistent with its label text.
Style: N/A · Follow-ups: N/A

**Q187 — (after an Interview Mode session ends, inspects the offered follow-ups)**
Type: Navigation · Entities: None · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: `buildFollowups()`'s interview-aware branch (if one exists) · Grounding: `buildFollowups(intent, ...)` is keyed primarily off `intent`/`strategy`, both of which are bypassed entirely during the interview mode-gate in `assistant.js` — the follow-ups shown immediately after an interview session ends may default to generic ones rather than "Try another topic" / "Ask me about a project instead."
Strategy: N/A.
Behaviour (ideal): Contextually relevant post-interview follow-ups (switch topic, exit to normal chat, review a related project).
Style: N/A · Follow-ups: N/A
⚠ Predicted Gap: the mode-gate's early-return structure in `assistant.js` (`if (interview.isActive()) { ...; return; }`) likely bypasses the normal Step 13 follow-up-building logic entirely while a session is active, and possibly also on the turn where it ends.

## 4.46 Interview Mode

**Q188 — "Let's do a mock interview."**
Type: Tool · Entities: None · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Interview · Grounding: `classifyIntent` → `interview` intent → `interview.start(userText)`; no topic specified in the message.
Strategy: N/A — mode-gate bypasses `conversation.js` entirely.
Behaviour (ideal): Should prompt the visitor to choose a topic from the supported set (Python, SQL, React, Backend, AI/ML) rather than guessing one, since none was specified.
Style: Short, prompts for topic selection · Follow-ups: the five topic names as options

**Q189 — "Interview me on Python."**
Type: Tool · Entities: Python · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Interview, `INTERVIEW_QUESTIONS` · Grounding: `interview.start()` should parse "Python" via `TOPIC_PATTERNS` and begin the Python question set immediately, one question at a time.
Strategy: N/A.
Behaviour: First question renders immediately, no re-prompt for a topic that was already given.
Style: Single question, session-progress indicator · Follow-ups: N/A (interview UI takes over)

**Q190 — (mid-session, answers a Python question with a partially-correct, keyword-light response)**
Type: Tool · Entities: Python · Diff: Hard · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Interview (`handleTurn`) · Grounding: `interview.js`'s keyword-coverage feedback should score against the expected keyword set for that specific question and give proportionate, honest feedback — not a binary pass/fail and not empty praise for a weak answer.
Strategy: N/A — `memory.add('user', userText, { skipProfileIngest: true })` explicitly excludes interview answers from visitor-profile ingestion.
Behaviour: Feedback should be specific about which expected keywords/concepts were present vs. missing, then advance to the next question.
Style: Short, specific, constructive · Follow-ups: N/A

**Q191 — "stop the interview" (mid-session)**
Type: Tool · Entities: None · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Interview (`EXIT_PATTERN`) · Grounding: `EXIT_PATTERN` should match this phrasing and call `interview.reset()`, cleanly returning control to normal conversation.
Strategy: N/A.
Behaviour: Session ends cleanly; the VERY NEXT normal-mode message must be processed normally (not still gated by `interview.isActive()`), confirming `reset()` fully clears session state.
Style: Short confirmation · Follow-ups: normal follow-ups resume

## 4.47 JD Matching

**Q192 — (pastes a realistic, multi-paragraph job description for a "Backend Python Engineer" role requiring Python, Flask/FastAPI, PostgreSQL, REST APIs, and Docker)**
Type: Recommendation · Entities: Python, Flask, FastAPI, PostgreSQL, REST APIs, Docker · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: JD Matching, Stack, Projects · Grounding: `looksLikeJobDescription()`'s heuristic should correctly classify this long, JD-shaped paste as a JD (not a normal question), triggering `memory.add(..., { skipProfileIngest: true })` and `analyzeJobDescription()` instead of normal intent classification.
Strategy: `intent:jd-match` → `_jdMatchResponse()`.
Behaviour: A structured match report — matching skills (Python, Flask/FastAPI, PostgreSQL, Docker, REST all genuinely owned), a real match score, and the correctly top-ranked project (likely QueryForgeAI or SRIIVERSEAI given the stack overlap).
Style: Structured (score, matched list, missing list, recommended projects, talking points) · Follow-ups: "Tell me more about [top-ranked project]"

**Q193 — (pastes a JD requiring AWS, Kubernetes, and Terraform in addition to Python)**
Type: Recommendation · Entities: AWS, Kubernetes, Terraform, Python · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: JD Matching, SKILLS_TAXONOMY · Grounding: `analyzeJobDescription()` must correctly bucket AWS/Kubernetes/Terraform as MISSING (present in `SKILLS_TAXONOMY` as requestable-not-owned, or entirely absent) while still crediting the genuine Python match — the honesty of the "missing skills" list is the core value proposition of this whole feature.
Strategy: `intent:jd-match` → `_jdMatchResponse()`.
Behaviour: A partial, honest match score — must not inflate the score by silently omitting the missing-cloud-infra gap, and must not claim experience with any of the three missing technologies.
Style: Structured, honest about gaps · Follow-ups: "What are his weaknesses?" (naturally connects to the Q152 gap)

**Q194 — (pastes a short, ambiguous paragraph that mentions several tech keywords but isn't actually a job description, e.g. a blog excerpt about "Python vs Java performance")**
Type: Unknown · Entities: Python, Java · Diff: Hard · Pri: P1 · Regr: Medium · Halluc: Medium
Sources: JD Matching (heuristic risk) · Grounding: `looksLikeJobDescription()`'s heuristic (likely length/keyword-density-based) risks a false positive here, misclassifying ordinary text as a JD and routing it into `_jdMatchResponse()` instead of a normal technology-comparison/opinion answer.
Strategy: ambiguous — correct behavior is `move:comparison`, `scope:tech`; risk is `intent:jd-match`.
Behaviour (ideal): Recognizes this is NOT a hiring-related paste and responds with a normal Python-vs-Java-flavored answer (most likely via `_techComparisonResponse`/fallback, since Java isn't in his stack).
Style: Short, normal comparison framing · Follow-ups: normal comparison follow-ups
⚠ Predicted Gap: heuristic JD-detection is inherently prone to false positives on any sufficiently long, tech-keyword-dense paste that isn't actually a job posting.

**Q195 — Turn 1: (pastes the Q192 JD). Turn 2: "Which project should I look at first?"**
Type: Recommendation · Entities: None (resolved from Turn 1 context) · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Memory, JD Matching results · Grounding: Turn 2 has no explicit reference to the JD, but the correct answer must carry over Turn 1's match analysis (top-ranked project from `analyzeJobDescription()`) rather than answering with a generic, JD-blind project recommendation.
Strategy: Turn 2 `move:factual`/`recommend`, ideally scoped by the just-completed JD analysis held in `activeTopic`/memory rather than re-derived from scratch.
Behaviour: Turn 2 should name the same top-ranked project Turn 1's structured report already surfaced, not a different or generic pick.
Style: Short, consistent with Turn 1 · Follow-ups: "Tell me about that project"
⚠ Predicted Gap: it's unclear whether JD-match results are persisted anywhere `memory`/`activeTopic`-accessible for a later turn to reference, versus being a one-shot, non-remembered response.

## 4.48 Resume Intelligence

**Q196 — "Walk me through your resume."**
Type: Experience · Entities: None · Diff: Medium · Pri: P0 · Regr: Critical · Halluc: Low
Sources: Resume (synthesized `resume` doc), Profile, Journey, Projects, Stack · Grounding: `knowledge.js`'s synthesized `resume` document directly tags `resume|cv|experience|background|summary|summarize|walk through|career|history|journey` — this phrasing is a near-perfect tag match, routed through `_resumeResponse(hits)`.
Strategy: `move:factual`, likely classified `intent:resume` or resolved via strong retrieval to the `resume` doc.
Behaviour: A synthesized, conversational walkthrough covering identity, journey phases, and shipped projects — critically, WITHOUT requiring or pushing a PDF download, per Sprint 3 Priority 2's explicit goal.
Style: Medium-length, structured narrative (not a bare bulleted CV dump) · Follow-ups: "Tell me about [specific project]"

**Q197 — "Can I get a PDF version of your resume?"**
Type: Tool · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Tools (`triggerResumeDownload`) · Grounding: this phrasing explicitly asks for the FILE, not a conversational summary — must route to the `action-resume` tool/download path (which checks for actual PDF existence) rather than `_resumeResponse()`'s conversational answer.
Strategy: `intent:action-resume`.
Behaviour: Triggers the real download (or an honest message if the PDF doesn't exist) — this is the necessary complement to Q196, testing that the conversational resume answer and the literal file-download intent are correctly distinguished.
Style: Short, action-confirming · Follow-ups: none needed

## 4.49 Tool Calls

**Q198 — "Show me your GitHub."**
Type: Tool · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Tools (`action-github`) · Grounding: `classifyIntent` → `action-github` → opens the GitHub link tool.
Strategy: pure action, bypasses strategy/provider composition for the tool-execution step.
Behaviour: Link opens/navigates correctly; a short confirming message accompanies the action.
Style: Short, action-confirming · Follow-ups: none needed

**Q199 — "Highlight your Python skills on the page."**
Type: Tool · Entities: Python · Diff: Medium · Pri: P1 · Regr: Medium · Halluc: Low
Sources: Tools (`highlightTechOrbs`/`highlightOrbsByGroup`) · Grounding: this exercises the newer group-based orb-highlighting helper added alongside Sprint 3, which must correctly resolve "Python skills" to the right orb group rather than highlighting the full stack or nothing.
Strategy: pure action.
Behaviour: Visually highlights the correct subset of tech orbs; confirming message names what was highlighted.
Style: Short, action-confirming · Follow-ups: none needed

**Q200 — "Scroll to the contact section."**
Type: Navigation · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Tools (`action-nav`) · Grounding: `classifyIntent`'s action-nav regex (`^(open|launch|go to|show me|take me to|navigate to|scroll to|download)\b`) matches this phrasing directly.
Strategy: pure action.
Behaviour: Scrolls to the contact section; short confirming message.
Style: Short, action-confirming · Follow-ups: none needed

## 4.50 Navigation

**Q201 — "Take me to the projects section."**
Type: Navigation · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Tools (`action-nav`) · Grounding: direct regex match, same family as Q200.
Strategy: pure action.
Behaviour: Scrolls/navigates correctly.
Style: Short, action-confirming · Follow-ups: none needed

**Q202 — "Open the SRIIVERSEAI demo."**
Type: Navigation · Entities: SRIIVERSEAI · Diff: Medium · Pri: P0 · Regr: High · Halluc: Low
Sources: Tools (`action-demo`), Projects · Grounding: must correctly resolve WHICH project's demo link to open from the named entity — a wrong-project mismatch here (opening a different project's demo) is a concrete, checkable regression distinct from a pure navigation miss.
Strategy: pure action, entity-scoped.
Behaviour: Opens exactly the SRIIVERSEAI demo link, not a generic "here are all the demos" fallback.
Style: Short, action-confirming, names the correct project · Follow-ups: none needed

**Q203 — "Download your resume."**
Type: Navigation · Entities: None · Diff: Easy · Pri: P1 · Regr: High · Halluc: Low
Sources: Tools (`action-resume`) · Grounding: direct regex match (`download` verb) → same download path as Q197, confirming both phrasings ("can I get a PDF" and "download your resume") converge on the same correct tool.
Strategy: pure action.
Behaviour: Same as Q197.
Style: Short, action-confirming · Follow-ups: none needed

---

# 5. Coverage Analysis

## 5.1 Headline numbers

- **203 questions** across **50 sections**, fully covering every category named in the original request (Tool Calls and Navigation are split into two adjacent sections for clarity, since they exercise different code paths — `tools.js`'s highlight/GitHub/contact actions vs. its scroll/nav/demo/resume actions — but both trace back to the single "Navigation" concept the user asked for).
- **41 of 203 questions (≈20%)** carry an explicit `⚠ Predicted Gap` annotation — a concrete, named divergence between ideal behaviour and what the current implementation is expected to do. These 41 are the direct seed material for Sections 6, 9, and 10.
- Every question was written against the *actual current code paths* in `assistant.js`, `assistant/conversation.js`, `assistant/providers.js`, `assistant/knowledge.js`, `assistant/jdmatch.js`, `assistant/interview.js`, `assistant/memory.js`, `assistant/persona.js`, and `content.js` — not idealized future behaviour. Where a question's ideal answer already exists cleanly in the current pipeline, that is stated as plainly as where it doesn't.

## 5.2 Distribution by Expected Question Type

| Type | Count | Notes |
|---|---|---|
| Limitation | 28 | The single largest bucket — reflects how much of a *personal-portfolio* assistant's realistic question space is things it should honestly decline (salary, education, GPA, weaknesses, self-disclosure) rather than retrieve. |
| Skill Verification | ~24 | Spread across Section 3.29 and the "Unknown Technologies" honesty tests. |
| Technology Explanation | 20 | The bulk of Sections 4.9–4.23 (Backend → Deployment). |
| Evidence Request | 15 | Concentrated in "Experience" and "Skill Verification" — questions that demand a project citation, not just an assertion. |
| Experience | 11 | |
| Architecture Explanation | 10 | Project-level (4.7) + portfolio-level (4.8). |
| Behavioral | 10 | Sections 4.33 and scattered into Recruiter/Hiring Manager. |
| Opinion | ~9 | Sections 4.28 and embedded in Technology Comparisons. |
| Comparison | ~9 | Section 4.26 plus hybrid entries in Engineering Decisions/Recommendations. |
| Recommendation | ~9 | Section 4.27 plus hybrids. |
| Tool | 7 | Section 4.49 plus Interview/JD/Resume-download actions. |
| Navigation | 6 | Section 4.50. |
| Engineering Decisions | 6 | Section 4.24. |
| Project Explanation | 6 | Section 4.6. |
| Conversation | ~7 | Multi-turn, context-switching, memory, follow-up sections. |
| Greeting / Identity / Capability | 14 | Sections 4.1–4.3. |
| Unknown | 5 | Edge cases and gibberish/off-topic input. |
| Recruiter / Career | ~10 | Sections 4.30, 4.36, plus hybrids. |

*(Percentages are intentionally omitted here — several questions are legitimately hybrid, e.g. a comparison that is also a recommendation, so bucket counts are directional, not a strict partition. The important signal is that no requested category from the user's brief is empty, and "Limitation" being the largest single bucket is itself a finding, not an oversight — see Section 9.)*

## 5.3 Distribution by Difficulty, Priority, Hallucination Risk, Regression Importance

| Difficulty | Count | | Priority | Count | | Hallucination Risk | Count | | Regression Importance | Count |
|---|---|---|---|---|---|---|---|---|---|---|
| Easy | 76 | | P0 (critical) | 83 | | Low | 135 | | Critical | 39 |
| Medium | 78 | | P1 (important) | 104 | | Medium | 32 | | High | 65 |
| Hard | 48 | | P2 (valuable) | 16 | | High | 36 | | Medium | 83 |
| Edge | 1 | | | | | | | Low | 16 |

Reading this table honestly:

- **Priority skews toward P0/P1 (187 of 203, ≈92%)** — this is by design, not inflation: a personal-portfolio assistant's question space is small enough that most realistic questions genuinely matter to get right, unlike a general-purpose assistant with a long tail of edge trivia.
- **Hallucination risk is "Low" for the majority (135/203)** because most technology/project/experience questions have a real, checkable, groundable answer sitting in `content.js`. The **36 "High" hallucination-risk questions are concentrated almost entirely in Sections 4.30–4.40 (the "people" categories)** — salary, notice period, GPA, weaknesses, education, career goals — exactly where no data exists and the temptation to fabricate a plausible-sounding answer is highest. This concentration is itself the single most important number in this document.
- **48 "Hard" questions** are dominated by honest-degradation cases (nothing to retrieve, must decline gracefully) and multi-turn ellipsis-resolution cases (Q182, Q178) — both are qualitatively different kinds of "hard" than a merely obscure technical question.

## 5.4 Coverage against the assistant's actual pipeline

| Pipeline component | Exercised by | Approx. question count |
|---|---|---|
| `classifyIntent()` (legacy regex intents: recruiter, action-*, jd-match, interview) | Sections 4.30, 4.46–4.50, scattered actions | ~35 |
| `conversation.js` strategy layer (`analyzeStrategy`: greeting/identity/comparison/opinion/experience moves + scope) | Sections 4.1–4.2, 4.26–4.28, 4.42–4.43 | ~45 |
| `knowledge.js` retrieval (tag/stem matching, no strategy override) | Sections 4.6–4.25 (most technology/project/architecture content) | ~90 |
| `providers.js` composers (`_greetingResponse`, `_identityResponse`, `_techComparisonResponse`, `_opinionResponse`, `_experienceResponse`, `_resumeResponse`, `_recommendResponse`, `_jdMatchResponse`, `_fallback`) | Nearly every question, as the final rendering step | 203 (all) |
| `memory.js` (`activeTopic`, `usedPhraseKeys`, `visitorProfile`, session persistence) | Sections 4.42–4.44, Q185, Q183 | ~15 |
| `jdmatch.js` (`looksLikeJobDescription`, `analyzeJobDescription`) | Section 4.47, Q11, Q15 | ~7 |
| `interview.js` (session state, topic parsing, keyword-coverage feedback, exit) | Section 4.46, Q12, Q188–191 | ~7 |
| `tools.js` (nav/demo/github/contact/highlight/resume actions) | Sections 4.49–4.50, Q197/Q203 | ~10 |
| `SKILLS_TAXONOMY` (owned vs. requestable-not-owned gap data) | Sections 4.39, 4.35, Q13, Q193 | ~13 |
| Nothing (genuinely undocumented data — honest-decline only) | Sections 4.32 (partial), 4.36–4.38, 4.40 | ~24 |

No component of the current assistant architecture is untested by this suite, and — importantly — the **~24 "nothing to retrieve" questions are not a coverage gap in this document; they are the point.** A benchmark for an honesty-first assistant must deliberately include questions with no correct factual answer, specifically to verify the assistant declines gracefully instead of fabricating.

---

# 6. Highest Risk Areas

Ranked by a combination of **how many questions it affects**, **how severe a wrong answer would be**, and **how likely it is to already be broken today** (not just theoretically possible):

## 6.1 Third-person phrasing is largely invisible to the Conversation Strategy layer *(Critical, cross-cutting)*

Every pattern in `conversation.js` — `IDENTITY_RE`'s framing, `OPINION_RE`'s `would you`/`do you` branches, `EXPERIENCE_RE`'s `have you`/`your ... experience` branches — is written assuming the visitor addresses the assistant in the second person ("you"), as if it *were* Sudhanshu. A recruiter or engineer referring to Sudhanshu in the third person — "does **he** know Kubernetes," "has **he** worked with AWS," "would **he** recommend X" — which is arguably the *more* natural phrasing for a third-party portfolio assistant, is invisible to nearly the entire strategy layer today. First surfaced at Q167/Q168, but its blast radius is much larger: dozens of questions across this suite could plausibly be re-asked in third person by a real visitor, and every one of them would silently fall back to `classifyIntent()`'s older, coarser regex path instead of the newer Conversation Strategy layer. **This is the single highest-leverage fix identifiable from this entire suite** — extending the existing regexes to accept `he/him/his` alongside `you/your` is a small, targeted, low-risk change relative to its coverage impact.

## 6.2 No self-disclosure of "Local AI Mode" *(Critical, trust-defining)*

`docs/PORTFOLIO_AUDIT.md` already identified this as the single biggest credibility risk to an AI-focused portfolio *before this suite was written*: a technically curious visitor can inspect the Network tab, see zero AI inference calls, and conclude the assistant is faking intelligence — unless it proactively and confidently explains that it runs a deterministic, local, retrieval-based `LocalProvider` by design (offline-first, zero-dependency, per `docs/CURSOR_RULES.md`), with a provider-swappable architecture ready for a real LLM backend later. Today, no composer answers "are you a real AI model?" (Q162) or "can you access the internet?" (Q163) — both fall to generic retrieval/fallback. Getting this specific answer right is disproportionately important because the *visitors most likely to ask it* are exactly the technically sophisticated engineers/CTOs whose judgment matters most.

## 6.3 Data that already exists is not wired to the question that needs it *(High, low-effort-to-fix)*

Two concrete instances, both already fully solved at the data layer:

- `SKILLS_TAXONOMY`'s explicitly-flagged not-owned skills (AWS, Kubernetes, CI/CD, GraphQL, Redis, Node.js, Django, Kafka, formal testing) is the perfect, honest answer to "what are his weaknesses?" (Q152–154) — but that data is currently only reachable through the JD-paste flow (`jdmatch.js`), not through a direct question.
- `_recommendResponse()`'s "💪 What He's Strongest At" section is the perfect answer to "what are his greatest strengths?" (Q149–151) — but it's gated behind the recruiter-intent regex, which doesn't match "strengths" as a standalone word.

Both are "wiring" problems, not "new capability" problems — the ideal answer is already implemented and tested (in Sprint 3), just not universally reachable.

## 6.4 Composite / multi-question messages silently drop sub-questions *(High)*

`knowledge.js`'s retrieval scores a whole message against the tag index and surfaces the single best-matching document. A realistic run-on message with 3–4 embedded questions (Q175) will almost certainly get exactly one of them answered, with the others silently dropped rather than acknowledged. This is a direct, demonstrable instance of the "keyword retrieval, not true multi-intent parsing" limitation `docs/PORTFOLIO_AUDIT.md` already flagged.

## 6.5 Ellipsis / fragment follow-ups need question-shape memory, not just entity memory *(High)*

"What about Kubernetes?" (Q179) and especially bare "...and SQL?" (Q182) require carrying forward not just the last *entity* (`memory.lastProject`/`activeTopic`) but the last *question template* ("what's X used for in your projects"). `memory.js`'s `activeTopic` as currently scoped appears to track subject matter, not phrasing structure — a two-word fragment with no repeated verb is a materially harder resolution case than a full follow-up sentence, and is a strong candidate to fall through to a generic/fallback response today.

## 6.6 JD-match and Interview Mode results don't visibly persist into the next turn *(Medium–High)*

Q195 ("which project should I look at first?" right after a JD paste) and Q187 (follow-ups shown right after an interview session ends) both depend on state that may not be captured by `memory`/`activeTopic` at all, since `jdmatch.js` and `interview.js` are explicitly designed to be stateless/UI-agnostic per the Sprint 3 architectural requirement. That's the *correct* design for those modules individually, but it pushes the responsibility of remembering "we just did a JD match, and here's what it concluded" onto `assistant.js`/`memory.js`, which may not currently pick it up.

## 6.7 The honesty-under-pressure surface is large and adversarial by nature *(Medium, but high stakes per-question)*

Sections 4.30–4.40 collectively contain 43 questions and the highest concentration of "High" hallucination risk in the whole suite (salary, notice period, GPA, weaknesses, education). None of these are exotic edge cases — they are the single most likely opening questions from an actual recruiter screening a candidate. `_fallback()`'s generic wording is a *safe* default (it doesn't fabricate), but it's untested here whether it's confident and specific enough to build trust rather than reading as evasive.

---

# 7. Assistant Capability Matrix

| Capability Area | Maturity | Representative Questions | Notes |
|---|---|---|---|
| Greeting & small talk | **Strong** | Q1–5 | Dedicated `_greetingResponse()` composer with variant rotation; low risk. |
| Identity / self-description | **Strong** | Q6–10 | Dedicated `_identityResponse()`; Q9 (SRIIVERSE AI vs. SRIIVERSEAI disambiguation) is the only soft spot. |
| Recruiter Mode (Sprint 3 P1) | **Strong, if the recruiter regex matches** | Q130–131, Q183, Q185 | Excellent composer (`_recommendResponse()`) with repetition avoidance — but only reachable through a fairly narrow set of trigger phrases (see 6.3). |
| Resume Intelligence (Sprint 3 P2) | **Strong** | Q16–20, Q196–197 | Purpose-built synthesized `resume` doc + `_resumeResponse()`; clean separation from the literal PDF-download tool. |
| JD Matching (Sprint 3 P3) | **Strong for scoring, weak for follow-through** | Q11, Q192–195 | `jdmatch.js` scoring/gap logic is sound and honest; carrying its conclusions into a later turn (Q195) is unverified. |
| Interview Mode (Sprint 3 P4) | **Strong within a session, weak at the seams** | Q12, Q188–191 | Clean state machine and keyword-coverage feedback; entry (no topic given, Q188) and exit-then-resume (Q187, Q191) are the untested edges. |
| Memory / contextual awareness (Sprint 3 P5) | **Partial** | Q177–187 | `activeTopic`/`usedPhraseKeys`/`visitorProfile` are real, working primitives; multi-turn pronoun/ellipsis resolution and repetition avoidance are the parts most likely to still show gaps under this suite's specific pressure-tests. |
| Technology Q&A (Backend → Deployment) | **Strong** | Q46–101 | This is `content.js`'s deepest, most mature data; retrieval quality here is the least risky category in the whole suite. |
| Technology Comparisons | **Strong for authored pairs, honest-fallback otherwise** | Q111–116 | `persona.js`'s `TECH_TAKES` covers the common pairs well; anything outside the authored set degrades gracefully rather than fabricating an opinion. |
| Opinions | **Strong for authored takes, generic otherwise** | Q121–124 | Same pattern as Comparisons — good where authored, honest but unremarkable where not. |
| Engineering Decisions / Problem Solving reasoning | **Medium** | Q102–110 | Real documented decisions exist (five-layer split, FastAPI-for-async, terminal-style UI) but are scattered across `ARCHITECTURE`/project descriptions rather than centralized as "decision" records — answers will be correct but may require broader retrieval synthesis than a single-doc match provides. |
| Skill Verification / evidence-grounding | **Strong** | Q125–129 | The project-citation-first design principle (Section 2.3) is well-supported by `PROJECTS`' rich `tech`/`highlights` fields. |
| Honest degradation on undocumented "people" facts (salary, education, GPA, weaknesses, career goals) | **Unverified but well-designed for** | Q132–135, Q152–172 | `_fallback()` exists and is safe-by-default; whether it's *confident and specific* enough (rather than just non-fabricating) is the open question this suite exists to answer. |
| Third-person phrasing about Sudhanshu | **Weak** | Q167–168, and implicitly dozens more | See Section 6.1 — the single most significant capability gap identified in this document. |
| Self-disclosure of the assistant's own nature (local/offline/deterministic) | **Missing** | Q161–164 | No composer currently exists for this question family at all — see Section 6.2. |
| Composite / multi-intent message handling | **Weak** | Q175 | Single-best-match retrieval structurally can't answer 3–4 embedded questions in one pass. |
| Ellipsis / sentence-fragment follow-ups | **Weak** | Q179, Q182 | Requires question-shape memory, not just entity memory — see Section 6.5. |
| Cross-module state handoff (JD match → recommendation, interview end → follow-ups) | **Weak** | Q187, Q195 | Each module is individually well-designed and correctly decoupled; the handoff *between* them is the gap. |
| Pure tool/navigation actions | **Strong** | Q198–203 | Simple, direct regex-to-action mapping; low risk, high reliability. |

---

# 8. Top 25 Highest-Priority Questions

These 25 are the **minimum viable regression set** — if a future change to the assistant is only checked against 25 questions instead of all 203, it should be these. Selected for maximum coverage breadth (at least one from nearly every major section) combined with maximum stakes (P0/Critical, or a named cross-cutting risk from Section 6).

1. **Q1** — "Hi" (greeting must never break — the very first impression)
2. **Q6** — "Who are you?" (identity is the second-ever thing a visitor tests)
3. **Q9** — "What is SRIIVERSE AI?" (self vs. portfolio disambiguation)
4. **Q16** — "Can you summarize your resume?" (Sprint 3 P2 core value)
5. **Q27** — "What projects have you built?" (the portfolio's actual content, unfiltered)
6. **Q40** — "Explain the architecture" (the portfolio's single most-demonstrated engineering claim)
7. **Q55** — "Do you know Python?" (the Section 2.3 template question, verbatim)
8. **Q75** — "Do you use Docker?" (the literal worked example from the user's own brief)
9. **Q90** — "How do you use AI in your projects?" (the portfolio's central thesis)
10. **Q94** — "Is the AI layer just a wrapper around an LLM API, or something more?" (the hardest honest-technical-depth question in the whole suite)
11. **Q102** — "Why did you split the architecture into five layers?" (real engineering reasoning, not marketing copy)
12. **Q111** — "Flask vs FastAPI" (the cleanest authored comparison — must stay sharp)
13. **Q120** — "If I'm hiring for an AI engineer role, should I consider Sudhanshu?" (recruiter + recommendation + skill-verification, all at once)
14. **Q125** — "Can you prove you know backend engineering?" (the evidence-grounding design principle, under direct challenge)
15. **Q130** — "Why should we hire him?" (Sprint 3 P1's flagship question)
16. **Q152** — "What are his weaknesses?" (the single most important honesty test in the suite — see Section 6.3)
17. **Q158** — "What's his educational background?" (a cleanly pre-documented gap; zero excuse for hedging)
18. **Q162** — "Are you connected to a real AI model, or is this all scripted?" (Section 6.2 — the highest-stakes trust question identified)
19. **Q167** — "Has he worked with AWS?" (Section 6.1 — the third-person phrasing gap, in its highest-traffic realistic form)
20. **Q177** — Turn 1/2: QueryForgeAI → "what tech does it use?" (the cleanest, most common multi-turn context-carry case)
21. **Q182** — Turn 1/2: "...and SQL?" (the hardest ellipsis-resolution case in the suite)
22. **Q185** — Asking "why should we hire him?" twice (the direct, mechanical regression test for Sprint 3 P5's repetition-avoidance feature)
23. **Q189** — "Interview me on Python." (Sprint 3 P4's flagship entry point)
24. **Q192** — Pasting a realistic JD (Sprint 3 P3's flagship entry point)
25. **Q202** — "Open the SRIIVERSEAI demo." (the one navigation question where a *wrong project* is a distinct, checkable failure mode, not just "no action happened")

---

# 9. Current Weaknesses Expected

Synthesizing every `⚠ Predicted Gap` annotation across Section 4 (41 total) into themes, ordered by how many distinct questions each theme touches:

1. **Second-person-only phrasing in `conversation.js`.** The single broadest weakness — affects the *pattern*, not just the specific questions that happened to expose it (Q167, Q168, and implicitly a large fraction of every "Experience"/"Opinion"-shaped question in this suite if re-asked in third person). Expected failure mode: silent fallback to the older, coarser `classifyIntent()` path instead of the intended Conversation Strategy composer.

2. **No self-disclosure of the assistant's own nature.** Q161–164 collectively expose that the assistant currently has no way to honestly and confidently answer "are you real AI," "can you access the internet," "what can't you help with," or "do you remember me across visits" — despite every one of those answers being simple, known, and already implicit in the existing architecture (`LocalProvider`, offline-only design, `sessionStorage`-scoped memory). Expected failure mode: generic `_fallback()` instead of a confident, specific, trust-building answer.

3. **Existing data not wired to the most natural question phrasing for it.** `SKILLS_TAXONOMY`'s honest gap-list (→ Q152–154 "weaknesses") and `_recommendResponse()`'s strengths section (→ Q149–151 "strengths") are both fully built and tested, but reachable only through a narrower trigger phrase than the natural one a visitor would actually use. Expected failure mode: a *worse* answer than the codebase is actually capable of giving, purely due to routing.

4. **Single-best-match retrieval can't handle composite messages.** Q175 demonstrates that a message bundling 3–4 sub-questions gets exactly one answered. Expected failure mode: silently dropped sub-questions, with no acknowledgment that anything was skipped.

5. **Ellipsis/fragment follow-ups need question-shape memory.** Q179 and especially Q182 require carrying forward the *template* of the previous question, not just its topic entity. Expected failure mode: a generic or off-target answer to a 2–3 word follow-up that would be obvious in context to a human.

6. **Cross-module state doesn't visibly persist across turns.** Q187 (post-interview follow-ups) and Q195 (post-JD-match recommendation carryover) both depend on state that `interview.js`/`jdmatch.js` correctly don't own themselves (by design), but that `assistant.js`/`memory.js` may not be capturing on their behalf either. Expected failure mode: a "cold start" answer on the very next turn that ignores what was just established.

7. **Untested confidence level of honest degradation.** The `_fallback()` composer is architecturally safe (Sections 4.30–4.40's 43 questions all correctly predict it, not a hallucination), but this suite cannot verify from static code reading alone whether its actual wording reads as *confident and specific* versus *evasive and generic* — that distinction can only be measured by running these questions live. This is the single most important thing Section 10's first recommendation exists to resolve.

8. **JD-detection heuristic false-positive risk.** Q194 predicts that `looksLikeJobDescription()`'s length/keyword-density heuristic may misclassify a long, tech-dense, non-hiring-related paste as a job description, misrouting it into `_jdMatchResponse()` instead of a normal answer.

9. **Interview Mode's entry/exit seams.** Q188 (no topic specified) and Q191→next-turn (does `reset()` fully release the mode gate) are edge conditions at the boundary of an otherwise well-built state machine.

---

# 10. Recommendations for the Next Implementation Phase

These are **candidates for scoping**, not a plan — per the constraints of this task, no implementation detail is proposed here. Ordered by leverage (impact relative to expected effort), as evidenced by Sections 6 and 9:

1. **Run this suite manually against the live assistant, one section at a time, and record a pass/fail/partial verdict per question.** Everything in this document is a *prediction* grounded in reading the code, not yet an observed result. The single highest-value next step — before writing any new code — is turning this document from a static prediction into a live baseline scorecard, exactly as Sprint 3's manual testing checklist was run. That scorecard, not this document alone, is what the next sprint should actually be scoped against.

2. **Extend `conversation.js`'s regexes to recognize third-person phrasing (`he/him/his`) alongside second-person (`you/your`).** Identified in Section 6.1 as the single highest-leverage fix available — small, targeted, and disproportionately high in coverage impact given how naturally a portfolio visitor refers to Sudhanshu in the third person.

3. **Add a "what are you, really" / "Local AI Mode" self-disclosure capability.** Directly closes the gap `docs/PORTFOLIO_AUDIT.md` already flagged as the top credibility risk to an AI-focused portfolio, and answers Q161–164 confidently instead of generically.

4. **Wire `SKILLS_TAXONOMY`'s existing not-owned-skills data to a direct "weaknesses/gaps" question, and broaden the recruiter-regex (or add a dedicated move) so "what are his strengths" reaches `_recommendResponse()`'s existing strengths section.** Both are cases where the hard part (the data, the composer) is already done — this is a routing fix, not new capability.

5. **Give multi-turn ellipsis follow-ups access to the previous question's *shape*, not just its topic entity.** Targets Q179/Q182 directly; likely the smallest-scoped item on this list with the clearest before/after test case.

6. **Decide, deliberately, whether composite multi-question messages should be split and answered in sequence, or explicitly acknowledged as "ask me one at a time."** Either is a legitimate design choice; the current silent-single-answer behavior is the one option that isn't.

7. **Verify (and if needed, add) a mechanism for the very next turn after a JD match or an interview session to reference what just happened**, so Q187 and Q195 resolve correctly instead of reading as context-blind.

This document should be re-read in full, and re-run in full, at the start of whatever sprint takes on any of the above — and every future sprint plan should reference the specific question IDs it intends to move from a predicted gap to a passing result.

---

*End of `docs/AI_EVALUATION_SUITE.md` — Version 1.0, DRAFT. Awaiting approval before any implementation work begins.*

