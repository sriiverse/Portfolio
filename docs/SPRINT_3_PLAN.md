# Sprint 3 Implementation Plan — SRIIVERSEAI

> Status: **DRAFT — awaiting approval. No implementation has occurred.**
>
> This document was produced by reading the live repository (post–Sprint 2) in full — every module under `src/assistant/`, `src/content.js`, `src/assistant.js`, `docs/CURSOR_RULES.md`, `docs/AI_ASSISTANT_SPEC.md`, `docs/PROJECT_ARCHITECTURE.md`, and `docs/CHANGELOG.md` — before any design decision below was made. Nothing here is assumed from Sprint 1/2 plans; every claim about "what exists today" is grounded in the actual current source.

---

# Sprint Goals

Sprint 1 hardened the codebase (dead code, scroll consolidation, canonical résumé flow). Sprint 2 hardened accessibility, SEO, documentation, and logging. Both sprints deliberately avoided touching the AI assistant's *intelligence* — they were infrastructure sprints.

Sprint 3 is different in kind: **it is the first sprint that grows the assistant's actual reasoning capability**, not its plumbing. The goal is to move SRIIVERSE AI from *"a well-engineered scripted chatbot"* to *"a portfolio assistant that demonstrably reasons about hiring fit, résumé content, job descriptions, and technical interviews"* — entirely offline, with zero new external dependencies, and without touching the Three.js scene, animations, or visual design system.

Concretely, Sprint 3 delivers five capabilities inside the existing 12-step assistant pipeline:

1. **Recruiter Mode** — sharpen the *existing* recruiter detection/response path so it explains hiring fit clearly and stops repeating identical sentences across a session.
2. **Resume Intelligence** — let the assistant answer questions about Sudhanshu's own experience/background directly, without requiring the résumé PDF download.
3. **Job Description Matching** — let a visitor paste a job description and receive a grounded match score, matched/missing skills, relevant projects, and interview talking points.
4. **Interview Mode** — a one-question-at-a-time mock technical interview across five topics, with lightweight offline evaluation and session progress tracking.
5. **Memory Improvements** — track the active conversational topic and avoid repeating previously-shown phrasing, improving multi-turn follow-up quality.

Every capability must be explainable from `content.js`'s existing data (or small, clearly-scoped additions to it) — **never** from an invented fact, and never from a network call. This sprint explicitly prioritizes *functional depth* over *visual surface*; where a design choice trades a prettier widget for a smaller, more reusable implementation, this plan takes the smaller implementation.

---

# Repository Verification

This section documents what was actually found in the repository, module by module, as of the start of Sprint 3 (Sprint 2 fully merged). It exists so nothing below is designed against a stale or imagined version of the code.

## Assistant module inventory (verified)

```
src/assistant.js            orchestrator — the 12-step pipeline, Workspace state, event wiring
src/assistant/
  knowledge.js               retrieval index over content.js (keyword+stem scoring, no embeddings)
  memory.js                  Memory class (turns, rolling summary, sessionStorage) + VisitorProfile class
  awareness.js               WebsiteAwareness singleton (IntersectionObserver-based section/project tracking)
  providers.js                provider registry: LocalProvider (default, offline) + 5 stub remote providers
  renderer.js                 markdown/table/code renderer + rich card renderers (project, comparison, command bar, thinking steps, visitor badge)
  streaming.js                 typewriter streaming engine (createStream)
  tools.js                     9 declarative "tools" (scroll/highlight/open/download) + decideTool + runProactiveTool
```

`src/content.js` is confirmed as the single source of truth: `PROFILE`, `PROJECTS` (3, with `id`/`stack`/`decisions`/`features`), `STACK` (19 orbs with `name`/`group`/`color`, **no alias/synonym data**), `ARCHITECTURE`, `JOURNEY`, `STATS`, `ASSISTANT_KB` (11 legacy Q&A entries, still indexed by `knowledge.js` for backward compatibility), `ASSISTANT_CHIPS` (6 static suggestions).

## Pipeline verification (`assistant.js`)

The documented "12-step pipeline" in the file header matches the live `ask()` function exactly:

```
memory.add(user turn) → classifyIntent() → buildAwarenessContext() → resolveContext()
  → visitorProfile read → runProactiveTool() (background, non-blocking)
  → provider.generate() → decideTool()/runTool() (only if isPureAction)
  → stream + render → append kind-specific card → append citations
  → memory.add(assistant turn) → Workspace.onExchange() → buildFollowups()
```

Verified specifics that matter for this plan:
- `classifyIntent()` is a **flat if-chain of regexes**, evaluated top-to-bottom, first match wins. There is already an `action-resume` branch (`/download.*resume|resume.*pdf/`) — informational resume questions are *not* currently handled; they fall through to generic `'question'`.
- `isPureAction` (which gates whether `decideTool()`/`runTool()` even run) is computed from a fixed intent whitelist plus a verb regex (`open|launch|go to|show me|take me to|navigate to|scroll to|download`) tested against the **raw user text**. This regex is evaluated against *any* message, including arbitrarily long pasted text — verified as a real collision risk for job-description paste (see Feature Design → Priority 3 → Edge Cases).
- `resolveContext()` always runs a pronoun regex (`it|that|this|its|second|third|first|one|both|other|next`) against the raw query and, if `awareness.currentProject` is set, will attach it as `focusProject` — again evaluated against any message length, including a full pasted job description (see same edge-case discussion).
- `memory.add('user', userText)` is called **before** `classifyIntent()` runs, and unconditionally feeds `VisitorProfile.ingest()` — meaning the profile-scoring regexes described below are already run against *every* user message today, with no opt-out. Confirmed by reading `memory.js` lines 168–182.

## Knowledge system verification (`knowledge.js`)

`retrieve(query, limit)` scores every doc via tag/stem overlap + title hits + body frequency + kind-weighting, no embeddings, no network. The doc index is built once at module load from `content.js`, plus **two synthesized docs that already exist and set the exact precedent this plan will follow**: `arch-overview` (kind `'arch-overview'`, built by concatenating `ARCHITECTURE` labels) and `why-hire` (kind `'recommend'`, hand-written recruiter narrative). This confirms synthesizing a new doc kind from existing structured data, rather than adding new raw content, is already an established pattern in this codebase — Resume Intelligence (Priority 2) will follow it exactly.

`getAllProjects()`, `getStack()`, `getProfile()`, `getProject(id)`, `resolveProject(ref)` are all already public exports and sufficient for every new module this plan proposes — no new exports are required from `knowledge.js` itself beyond one new doc entry.

## Memory verification (`memory.js`)

`Memory` persists `{turns, summary, lastProject, profile}` to `sessionStorage` under key `sriiverse.memory.v3`, tolerant of missing fields on load (`data.turns || []` etc.) — confirmed this is a "best-effort" schema, not a versioned migration system. `VisitorProfile.ingest(text)` regex-scores **every** user message against `PROFILE_SIGNALS` (recruiter/engineer/founder/student) and `FOCUS_SIGNALS` (backend/ai/database/frontend/fullstack) with no filtering by message type or length. There is currently no concept of "active topic" beyond `lastProject` (a project id only — nothing tracks that the visitor is mid-discussion about, say, architecture or pricing-adjacent recruiter talk).

## Provider verification (`providers.js`)

`LocalProvider.generate()` routes purely by the **top retrieved doc's `kind`** (`project`/`project-arch`/`project-stack`/`stack`/`arch`/`arch-overview`/`recommend`/`profile`, else generic text, else a regex comparison check). Confirmed exact repetition risk for Recruiter Mode: `_recommendResponse()`'s recruiter branch always opens with the identical lead sentence, and `_projectResponse()`'s `recruiterSection` always closes with the identical `"It's not a prototype — it's live in production."` sentence for every project, every time, with no session memory of what's already been said.

All five remote providers (`OpenAIProvider`, `OpenRouterProvider`, `ClaudeProvider`, `GeminiProvider`, `OllamaProvider`) are implemented but inert (`getConfig()` defaults `provider: 'local'`, and `window.SRIIVERSE_AI_CONFIG` is not set anywhere in the codebase) — confirmed Sprint 3 has no live-LLM surface to touch, consistent with the Out of Scope instruction ("no production LLM backend, no external APIs").

## Renderer / streaming verification

`renderMarkdown()` already supports headings (h1–h3), blockquotes, ordered/unordered lists, tables (`| a | b |`), fenced code blocks with mini syntax highlighting, and inline bold/italic/code/links — confirmed sufficient to express every structured output this plan needs (match-score tables, skill lists, interview questions) **without any new renderer function**. `renderCitations(sources)` already renders any `{source, link}` array as clickable citation chips that scroll to a section — confirmed reusable as-is for "relevant projects" in Job Description Matching (project knowledge docs already carry `link: '#projects'`). `createStream()` is renderer-agnostic (accepts any `renderFn`), so no changes are needed there either.

## Content verification — what data already exists vs. what's missing

- **Résumé PDF**: `PROFILE.resume` points to `./assets/resume.pdf`, which — per the Sprint 1/2 record and `docs/CURSOR_RULES.md`'s own dependency note — **does not exist as a real file yet**. This is exactly why Priority 2 exists: the assistant must be able to talk about Sudhanshu's background *without* that download working.
- **Formal résumé sections**: `content.js` has no education history, employment dates, or certifications fields — only `PROFILE`, `PROJECTS`, `JOURNEY`, `STACK`. This is a real content gap, not an oversight to silently paper over: **Resume Intelligence in Sprint 3 can only answer from what already exists** (profile, projects, journey, stack). It will not fabricate a university, a graduation year, or an employment history that isn't in `content.js`. If real résumé content (education, dates, certifications) should be added, that is a content decision for the site owner, not an assumption this plan will make.
- **Skill synonyms**: `STACK` entries are exact display names only (`"PostgreSQL"`, `"REST APIs"`, …) — there is no alias table (e.g. `"Postgres"` → `"PostgreSQL"`, `"JS"` → `"JavaScript"`). Job Description Matching needs this and it does not exist today.
- **Interview question bank**: does not exist in any form.

## An important scope disambiguation (flagging, not guessing)

`docs/AI_ASSISTANT_SPEC.md` already describes a **"Resume Analyzer"** feature (§ Resume Analyzer) where a *visitor* uploads *their own* résumé for gap analysis against the portfolio. That is a different, larger feature from this sprint's **Priority 2 "Resume Intelligence,"** which — per the literal Sprint 3 instructions ("answer questions about **my** resume… without requiring resume download") — means the assistant explains **Sudhanshu's own** background conversationally. This plan implements the latter only. The former (visitor résumé upload) requires file-input UI and text extraction from an arbitrary uploaded document — a materially larger feature that would likely need a new client-side parsing dependency, which conflicts with this sprint's "no unnecessary dependencies" and "no production LLM backend" constraints. It is deferred to **Future Improvements** below, not implemented or assumed here.

---

# Architecture Analysis

## What gets reused (unchanged)

- The entire 12-step pipeline shape in `assistant.js` — intent → awareness → context → profile → knowledge → proactive tool → provider → tool exec → stream/render → memory → workspace → follow-ups.
- `renderMarkdown()` + `renderCitations()` for **all** new output. No new renderer function is introduced anywhere in this plan (see design decision below).
- `createStream()` unchanged — every new response streams exactly like existing ones.
- `knowledge.js`'s retrieval algorithm (`scoreDoc`, `tokenize`, `stem`) — untouched. Only one new doc is added to the index, using the index's existing extension point.
- The synthesized-doc pattern already proven by `arch-overview`/`why-hire`.
- `awareness.js`, `scroll.js`, `tools.js`, `streaming.js`, `scene.js`, `core.js`, `sections.js`, `main.js`, `log.js` — **zero changes**. None of Sprint 3's objectives require website navigation changes, scene changes, or bootstrapping changes.

## What gets extended

- `content.js` — new data only (a skills-alias table, an interview question bank, two new suggestion chips). No existing field is renamed, removed, or restructured.
- `knowledge.js` — one new synthesized doc (`kind: 'resume'`). No change to any existing doc, scoring weight, or exported function signature.
- `memory.js` — two new `Memory` fields (`activeTopic`, `usedPhraseKeys`) and one new optional parameter on the existing `add()` method (backward compatible — every existing call site keeps working unchanged). Storage key version bumped (`v3` → `v4`) because the persisted shape changed; this is the same "no explicit migration, just tolerant defaults on load" strategy the codebase already uses, not a new pattern.
- `providers.js` — two new response branches on `LocalProvider` (`_resumeResponse`, `_jdMatchResponse`) and one small repetition-avoidance helper used at exactly the 2–3 call sites verified above as repetitive. No existing branch's *output* changes except the specific repeated sentences.
- `assistant.js` — new intent branches, a new "mode gate" for Interview Mode, and three small correctness guards (detailed in Feature Design) that prevent long pasted text from mis-firing existing regex-based systems (`decideTool`, `resolveContext`'s pronoun logic, `VisitorProfile.ingest`).

## What must NOT be modified

`scene.js`, `core.js`, `sections.js`, `main.js`, `scroll.js`, `log.js`, `awareness.js`, `streaming.js`, `index.html`, `styles.css`. Also **not modified**: `tools.js` (no new "tool" is needed — see design decision below) and `renderer.js` (no new render function is needed — see design decision below). Keeping these untouched is a deliberate outcome of the two design decisions immediately below, not an oversight.

## Key design decision 1 — Reuse markdown+citations instead of building new UI surfaces

Both Job Description Matching and Interview Mode *could* be built as bespoke rich cards (new `renderer.js` functions + new `styles.css` classes), following the precedent of `renderTabbedProjectCard`/`renderComparisonCard`. This plan deliberately does **not** do that.

Instead: `_jdMatchResponse()` and the Interview Mode text (built in the new `interview.js`) both produce **markdown text** — headings, a `| Skill | Status |` table, bullet lists, blockquotes — using the block types `renderMarkdown()` already supports today. "Relevant projects" for a JD match reuses `renderCitations()` exactly as-is, because project knowledge docs already carry the `{source, link}` shape citations expect.

Why this is the right call for this sprint specifically: the instructions explicitly say to prioritize functionality over visual work and to avoid unnecessary abstraction. A new card type is a new abstraction (new render function, new CSS, new escaping surface to keep secure, new thing to keep visually consistent with the existing glass/gradient language). A markdown response is *zero* new abstraction — it is the same code path every existing text answer already takes, it inherits the Sprint 2 `aria-live` announcement and keyboard accessibility for free, and it is trivially extended later (Sprint 4) into a richer card if desired without discarding any Sprint 3 work — the underlying data shape (`{score, matchedSkills, missingSkills, relevantProjects, talkingPoints}` / `{topic, question, progress}`) is unchanged either way.

## Key design decision 2 — Interview Mode is a pipeline mode-gate, not a new intent branch

Once an interview session is active, **every subsequent message is an answer to a question**, not a new knowledge query. Running such a message through `classifyIntent()` → `knowledge.retrieve()` → `provider.generate()` would be actively wrong (e.g. a Python answer mentioning "list" and "dictionary" could get misclassified as a `'stack'` intent and derail the session with an unrelated tech-stack answer).

So: a single check — `if (interview.isActive())` — is added at the very top of `ask()`, before intent classification. While true, the turn is handed entirely to the new `interview.js` module and the rest of the pipeline (awareness, context resolution, knowledge retrieval, provider call, proactive tools) is skipped for that turn. This preserves the pipeline's shape for the 95% case (normal conversation) while cleanly carving out the one case where the pipeline's assumptions don't hold.

## Key design decision 3 — Profile ingestion must not learn from pasted/answer text

Verified above: `VisitorProfile.ingest()` runs against every user message unconditionally. A pasted job description is *saturated* with backend/AI/database keywords by construction — feeding it through the recruiter/engineer/focus-area scorer would badly corrupt the inferred visitor profile (a recruiter pasting a backend JD would get mis-classified as an "engineer, backend focus" visitor). The same is true for interview answers, which are dense with topic keywords by design.

`Memory.add(role, text, entities)` gains one new optional field on `entities` — a boolean skip flag — checked before calling `this.profile.ingest()`. Every existing call site is unaffected (the field is simply absent, defaulting falsy). `assistant.js` sets it for the two new turn types. This is a two-line, additive, backward-compatible change to an existing method signature — not a rewrite.

---

# Feature Design

## Priority 1 — Recruiter Mode

**Current state (verified):** detection already exists (`classifyIntent`'s `'recruiter'` branch + `VisitorProfile`'s `PROFILE_SIGNALS.recruiter` regex, cross-validated by two independent code paths already). Response generation already exists (`_recommendResponse`, `_projectResponse`'s `recruiterSection`, `renderVisitorProfile` badge, recruiter-specific follow-ups in `buildFollowups`). What's missing is exactly what the sprint goal names: **not sounding repetitive**, and **recommending projects a little more intelligently than a fixed reorder**.

**Architecture:** no new module. Two small, targeted changes inside `providers.js`'s `LocalProvider`.

**Data flow:** unchanged — `memory.profile.type === 'recruiter'` already flows into `ctx.visitorProfile` on every `provider.generate()` call.

**Internal flow — repetition avoidance:** a small helper (conceptually: "given a phrase key and a list of 2–3 pre-written variants, return the first variant not yet recorded as used this session; if all are used, fall back to the first one rather than erroring") is added to `providers.js`. It consults `ctx.memory.usedPhraseKeys` (new, see Memory Improvements below) and records its choice back into it. Applied at exactly two verified repetition points: the `_recommendResponse` recruiter lead sentence, and the `_projectResponse` recruiter closing sentence. No other text changes.

**User flow:** a recruiter asks "why hire him," then later asks about two different projects. Today, all three responses end with a near-identical sentence. After this change, each uses a different (still accurate, still grounded) phrasing of the same fact.

**Edge cases:**
- Recruiter asks the *same* question twice in one session → variants exhaust after 2–3 repeats; falling back to variant #1 is an accepted, documented trade-off rather than growing a large templating system for a portfolio chatbot (Rule 3 — no large-scale rewrites).
- A visitor who never uses recruiter-sounding vocabulary but *behaves* like a recruiter (views many projects fast, jumps to contact) is **not** newly detected by this sprint — behavioral (non-textual) profiling is a larger change and is listed under Future Improvements, not silently smuggled into this plan.

**Risks:** none architectural — this is the lowest-risk objective in the sprint, purely additive text variation behind an existing, already-working detection path.

---

## Priority 2 — Resume Intelligence

**Architecture:** one new synthesized knowledge doc (`knowledge.js`) + one new response branch (`providers.js`). No new module — this is the smallest objective in the sprint, deliberately, because the underlying data (`PROFILE`, `JOURNEY`, `PROJECTS`, `STACK`) already exists and only needs a new *presentation* of itself.

**Data flow:**

```
content.js (PROFILE + JOURNEY + PROJECTS + STACK)
        ↓  (module load, same pattern as existing why-hire / arch-overview docs)
knowledge.js  → new doc { id:'resume', kind:'resume', ... }
        ↓  (retrieve() ranks it like any other doc — no special-casing needed)
providers.js LocalProvider.generate()
        ↓  new: if (top.kind === 'resume') → _resumeResponse()
renderMarkdown() + renderCitations()  (unchanged)
```

**User flow:** visitor asks "summarize your resume," "walk me through your experience," or "what's your background" (without the word "download" or "pdf," which must keep routing to the existing download tool). The assistant responds with a structured, markdown "resume-style" answer: title/tagline, a condensed journey timeline, the three shipped projects as an "experience" list, and the technology stack — all pulled from data that already exists elsewhere on the page, just reassembled for a conversational answer instead of requiring a scroll-and-read.

**Internal flow — intent routing:** `classifyIntent()` gets one new branch, inserted **immediately after** the existing `action-resume` line (so "download resume"/"resume pdf" keep matching that first, unchanged) — requiring the word "resume"/"cv," or an explicit "summarize experience"/"walk me through" phrasing, to avoid over-triggering on unrelated messages that merely contain the word "experience."

**Edge cases:**
- Visitor asks about something genuinely absent from `content.js` (education, certifications, employment dates, GPA). Per the Knowledge First rule, the response must say so plainly rather than inventing an answer — `_resumeResponse()` is scoped to only ever describe fields that exist, and if `retrieve()` doesn't find the resume doc relevant enough for a very specific unanswerable question, the existing generic fallback (`_fallback()`) already handles "I don't have that" gracefully — no new fallback logic is needed.
- A recruiter asks a resume-flavored question — the response should still route through the resume doc, and the *existing* recruiter follow-up logic in `buildFollowups()` still applies afterward (no interaction risk; `intent` and `visitorProfile.type` are independent signals already).

**Risks:** low. The only real risk is content accuracy drift if `PROJECTS`/`JOURNEY` change later without `_resumeResponse()`'s template being re-checked — mitigated by the fact that it reads those arrays live at call time (no duplicated/cached copy of the data), so it can never drift out of sync by construction.

---

## Priority 3 — Job Description Matching

**Architecture:** one new, self-contained module, `src/assistant/jdmatch.js`, plus a small data addition to `content.js` (`SKILLS_TAXONOMY`), plus one new response branch in `providers.js`. This is *not* added to `knowledge.js` — it is a comparison/scoring operation, not a retrieval operation, and `knowledge.js`'s documented responsibility (per `CURSOR_RULES.md` Rule 2) is retrieval, not scoring against arbitrary pasted input. Keeping it separate also means `knowledge.js`'s well-tested retrieval scoring is provably untouched.

**Data flow:**

```
Visitor pastes JD text into the existing chat input (no new UI element)
        ↓
assistant.js classifyIntent() → 'jd-match'
   (heuristic: explicit trigger phrase, OR [length above threshold
    AND ≥2 job-posting-shaped keywords like "responsibilities",
    "requirements", "qualifications", "years of experience"])
        ↓
providers.js LocalProvider._jdMatchResponse(query, ctx)
        ↓
jdmatch.js analyzeJobDescription(jdText)
   - normalize JD text
   - match content.js's SKILLS_TAXONOMY aliases against JD text
   - cross-reference matches against STACK (what Sudhanshu actually has)
      → matchedSkills / missingSkills
   - score = matched / (matched + missing), with a defined
     "couldn't detect recognizable technical requirements" fallback
     if zero skills were detected at all (never a fabricated 0%/100%)
   - relevantProjects = PROJECTS ranked by stack-overlap with matchedSkills
   - talkingPoints = pulled from each top-matched project's existing
     `decisions` array (never invented — only sentences that already
     exist in content.js)
        ↓
_jdMatchResponse formats the result as markdown (headings, a
matched/missing table, a talking-points list) + sets `sources` to the
relevant project docs
        ↓
renderMarkdown() streams the text; renderCitations() renders the
relevant projects as clickable citations — both unchanged, existing code
```

**User flow:** visitor pastes a job posting into the same chat box used for every other question. They get back a match percentage, a clear matched/missing skills breakdown, the (at most two) most relevant of the three projects with clickable links, and a short list of interview talking points they could raise given the overlap — all in one streamed response, exactly like any other answer.

**Why no new textarea/upload UI:** verified that pasting multi-line text into the existing single-line `<input>` does not block the feature — browsers collapse newlines on paste into `<input type="text">`, and the matching algorithm below is line-agnostic (it scans the whole string for keyword occurrences regardless of line breaks). The only cost is that the visitor can't see the full pasted text in the input before submitting — a cosmetic limitation, explicitly acceptable given this sprint's "functionality over visual polish" priority, and reversible in a future sprint (a textarea toggle is a pure visual/UX improvement, not a functional dependency) without touching any matching logic.

**Internal flow — the two correctness guards this feature requires (found during repository verification, not hypothetical):**
1. **`decideTool` must not run for `'jd-match'`.** Verified `decideTool`'s action-verb regex (`open|launch|go to|show|...`) will very plausibly match somewhere inside a multi-paragraph job posting (e.g. "you will **show** initiative" contains "show"). `assistant.js`'s existing `isPureAction`/`decision` block gets one added exclusion for the `'jd-match'` intent so a JD paste can never accidentally trigger an unrelated scroll/highlight/open action.
2. **`resolveContext`'s pronoun-enrichment and `runProactiveTool` must be skipped for `'jd-match'`.** Verified the pronoun regex (`it|that|this|its|...`) will almost certainly match somewhere in normal job-posting prose ("this role," "the team," …), which could spuriously set `focusProject` from whatever project section the visitor happens to be scrolled past and trigger an irrelevant proactive scroll/highlight. For `'jd-match'`, `assistant.js` uses the raw query with `focusProject` forced to `null` and skips the proactive-tool call entirely — the JD's own analysis already tells the visitor which projects are relevant, so a proactive scroll would be redundant *and* potentially wrong.
3. **`memory.add()`'s profile ingestion is skipped for the JD-paste turn itself** (Key Design Decision 3, above) — the JD's vocabulary is not the visitor's own words and must not corrupt `VisitorProfile`.

**Edge cases:**
- JD contains zero recognizable technical keywords (e.g. a purely behavioral/HR posting) → graceful "I couldn't detect specific technical requirements in that" response, not a fake score.
- Extremely long paste (multi-page JD) → the analysis function must cap its own work (a defined maximum character length it will scan) so a pathological paste can't cause a noticeable UI stall; content beyond the cap is simply not scanned, which is an accepted, documented trade-off, not silently unbounded regex work.
- Visitor pastes the *same* JD twice in a session → works identically each time; no special-casing needed since the module is stateless per call.
- A short, technical-sounding *question* (not a JD) is long enough to trip the length heuristic → mitigated by requiring the keyword-density condition (job-posting-shaped phrases) in addition to length, not length alone.

**Risks:** the primary risk is heuristic misclassification in either direction (a real JD not detected as one, or a long technical question wrongly treated as one). Both failure modes degrade to "answered as a normal question" rather than crashing or fabricating data, which is an acceptable failure mode for an offline, keyword-based system — and is called out explicitly in the Testing Checklist below so it gets manually verified before sign-off.

---

## Priority 4 — Interview Mode

**Architecture:** one new, self-contained module, `src/assistant/interview.js` (singleton, same shape as the existing `awareness.js` singleton), plus a new question bank in `content.js` (`INTERVIEW_QUESTIONS`), plus the one pipeline mode-gate in `assistant.js` described in Key Design Decision 2. No changes to `providers.js` at all — interview turns never reach the provider.

**Data flow:**

```
content.js INTERVIEW_QUESTIONS = { python:[...], sql:[...], react:[...],
                                    backend:[...], 'ai-ml':[...] }
        ↓ (read directly, no retrieval/scoring needed — deterministic sequence)
interview.js  — session state machine:
   idle → awaitingTopic → inProgress → complete
        ↓
assistant.js — mode gate at top of ask():
   if (interview.isActive()) → interview.handleTurn(userText) → stream result → return early
```

**User flow:**
1. Visitor says something like "start a Python interview" (must contain the word "interview" plus a recognizable topic keyword — deliberately not a fuzzy match, to avoid accidentally starting a session from an unrelated message; see Edge Cases).
2. If a topic keyword was found, the session moves straight to `inProgress` and the first question streams back with a small progress header ("Python Interview — Question 1 of N").
3. If "interview" was said without a topic, the session enters `awaitingTopic` and the assistant asks which of the five topics the visitor wants — the *next* message (even a one-word "python") is still intercepted by the mode gate and resolves the topic.
4. Each subsequent message is treated as an answer: `interview.js` does lightweight keyword-coverage evaluation against that question's known key terms, returns short directional feedback (not a fabricated "correct/incorrect" verdict — see Edge Cases below on evaluation honesty), then either the next question or, once the bank for that topic is exhausted, a session summary (topics covered, questions answered, rough coverage).
5. Saying "stop interview" / "end interview" / "exit interview" at any point ends the session immediately with a short summary and returns control to normal conversation.

**Internal flow — progress tracking:** `interview.js` keeps `{ topic, questionIndex, totalForTopic, coverageScores[] }` in module-level memory only — **not** persisted to `sessionStorage** (a page reload cleanly resets an interview, which is the correct behavior for a mock-interview session, and avoids growing `memory.js`'s persisted schema for a fast-moving, session-scoped feature). `memory.activeTopic` (new, see Memory Improvements) is set to a value like `"interview:python"` while a session is active, so follow-up suggestions and any future logic can be aware a session is running.

**Edge cases:**
- Visitor tries to change subject mid-interview without an explicit exit phrase (e.g. asks "what's the tech stack?" mid-question). Design decision: the mode gate is strict — **any** message while active is treated as an answer/exit-check, never silently re-routed to normal Q&A. This is a deliberate trade-off (documented, not accidental): guessing at "did they mean to exit?" from free text is exactly the kind of fragile heuristic this plan avoids elsewhere; an explicit exit phrase is required. This will be verified in manual testing and called out to the user if it feels too strict in practice.
- Topic's question bank is exhausted → session ends with a summary rather than silently repeating questions or erroring.
- Evaluation honesty: because there is no real language understanding available (explicitly out of scope — "no production LLM backend"), keyword-coverage feedback must be phrased as directional ("touched on X, worth also mentioning Y") — never as a false "92% correct" score that implies grading precision the system doesn't have. This is a Knowledge-First-adjacent honesty requirement, not just a style choice.
- Visitor starts a *second* interview topic before finishing the first → treated as a fresh `start`, replacing the current session (simplest, most predictable behavior; no hidden multi-session state).

**Risks:** the main architectural risk is the mode gate itself — if it has a bug that leaves `isActive()` stuck `true`, the entire assistant becomes unusable for normal conversation. This is why the Testing Checklist explicitly includes forcing an interview session, then verifying the exit phrase reliably restores normal conversation, as a required regression check before sign-off.

---

## Priority 5 — Assistant Memory Improvements

**Architecture:** two new fields on the existing `Memory` class (`activeTopic`, `usedPhraseKeys`), one new optional parameter on the existing `add()` method (the profile-ingestion skip flag from Key Design Decision 3), and a small, module-local (non-persisted) "recently shown follow-ups" set inside `assistant.js`. No new module.

**Data flow / internal flow:**
- `activeTopic` is set on every turn from whichever signal is most specific: an active interview session name, else the current `focusProject`, else the classified intent (`'architecture'`, `'stack'`, `'recruiter'`, …), else left unchanged from the previous turn. This gives `buildFollowups()` a cheap way to ask "are we still talking about the same thing?" without re-deriving it from scratch every time.
- `usedPhraseKeys` is a `Set<string>` of phrase-variant keys already shown this session (Priority 1's repetition fix reads and writes it; nothing else needs to).
- The "recently shown follow-ups" set lives in `assistant.js`'s module scope (not `Memory`) because it's a pure cosmetic de-duplication concern scoped to the current tab load — persisting it would grow `Memory`'s serialized schema for something that doesn't need to survive a refresh.

**User flow:** a visitor asking several follow-up questions in a row about the same topic (e.g. drilling into one project's architecture, then its stack, then "why that stack") should feel like the assistant is tracking the thread — evidenced by follow-up suggestions that don't just repeat the same three options every time, and by responses that vary their phrasing rather than reusing an identical sentence.

**Edge cases:**
- `sessionStorage` unavailable (private browsing edge case) — already handled gracefully by the existing try/catch + `logWarn` in `_load()`/`_save()`; the two new fields simply won't persist across a refresh in that case, same as the rest of `Memory` today. No new failure mode introduced.
- Old `v3` sessionStorage data from a browser tab that had Sprint 2's assistant open when Sprint 3 ships — verified the existing `_load()` pattern (`data.turns || []`) already tolerates missing fields; bumping to `v4` simply means that old entry is never read (a fresh `v4` record starts), which is the same non-migrating strategy already used for every prior version bump in this file. Not a regression, an existing accepted pattern.

**Risks:** low — purely additive fields with defined defaults; the only way this breaks existing behavior is if the new optional `add()` parameter is passed incorrectly at an existing call site, which the File-by-File plan below calls out explicitly to prevent.

---

# File-by-File Plan

## New files

### `src/assistant/jdmatch.js`
**Why:** Job Description Matching is a distinct algorithm (parsing + scoring), not a retrieval operation — doesn't belong in `knowledge.js` per its documented single responsibility.
**What:** exports `analyzeJobDescription(jdText)` (returns `{score, matchedSkills, missingSkills, relevantProjects, talkingPoints}`) and `looksLikeJobDescription(text)` (the length+keyword-density heuristic used by `classifyIntent`). Consumes only already-public exports of `knowledge.js` (`getAllProjects`, `getStack`, `getProfile`) and the new `SKILLS_TAXONOMY` from `content.js`. No DOM access, no side effects — pure functions, fully unit-testable in isolation even though this sprint's testing is manual.
**Must remain untouched by future changes to:** `knowledge.js`'s internal scoring (it never imports `retrieve`/`scoreDoc`).

### `src/assistant/interview.js`
**Why:** a stateful session/quiz engine is a distinct responsibility from every existing assistant module (closest analog is `awareness.js`'s singleton pattern, which this follows).
**What:** exports a singleton `interview` with `isActive()`, `handleTurn(text)`, `start(topicOrNull)`, `getProgress()`, `reset()`. Reads `INTERVIEW_QUESTIONS` from `content.js`. Holds its own in-memory (non-persisted) session state.
**Must remain untouched by:** `providers.js` — this module is never called from a provider; only from `assistant.js`'s mode gate.

## Modified files

### `src/content.js`
**Why it changes:** Job Description Matching needs a skill-alias table that doesn't exist; Interview Mode needs a question bank that doesn't exist; discoverability of both new features benefits from two additional suggestion chips.
**Exactly what changes:** add `export const SKILLS_TAXONOMY = [...]` (canonical skill name + alias list per entry, built only from technologies already named in `STACK`/`PROJECTS` plus a handful of common JD-phrasing synonyms for those *same* technologies — no new technology claims about Sudhanshu are introduced); add `export const INTERVIEW_QUESTIONS = {...}` (five topics × a small starter set of generic technical questions with associated evaluation keywords — general CS/engineering knowledge questions, not claims about Sudhanshu, so this doesn't risk fabricating anything about him); append two entries to the existing `ASSISTANT_CHIPS` array.
**What must remain untouched:** `PROFILE`, `PROJECTS`, `STACK`, `ARCHITECTURE`, `JOURNEY`, `STATS`, `ASSISTANT_KB` arrays and every existing field within them — zero edits to existing content.

### `src/assistant/knowledge.js`
**Why it changes:** Resume Intelligence needs one new synthesized doc, following the exact pattern `arch-overview`/`why-hire` already establish.
**Exactly what changes:** one new `addDoc({ id:'resume', kind:'resume', ... })` call, built from `PROFILE`+`JOURNEY`+`PROJECTS`+`STACK` at module load time (read live, not duplicated/cached).
**What must remain untouched:** `retrieve()`, `scoreDoc()`, `tokenize()`, `stem()`, every existing `addDoc()` call, and every existing exported function's signature.

### `src/assistant/memory.js`
**Why it changes:** Priority 5 (active topic + repetition tracking) and the Priority 3/4 profile-ingestion guard (Key Design Decision 3) both require small, additive extensions to `Memory`.
**Exactly what changes:** two new `Memory` instance fields (`activeTopic`, `usedPhraseKeys`), included in `toJSON()`/`fromJSON()`/`_save()`/`_load()` alongside the existing fields; `add(role, text, entities)` gains one new check — if `entities.skipProfileIngest` is truthy, skip the `this.profile.ingest()` call (every other line of `add()` unchanged); `STORAGE_KEY` bumped from `'sriiverse.memory.v3'` to `'sriiverse.memory.v4'`.
**What must remain untouched:** `VisitorProfile` class internals (`PROFILE_SIGNALS`, `FOCUS_SIGNALS`, scoring logic), `MAX_TURNS`, `SUMMARY_EVERY`, `_summarize()`, `transcript()`, `resolveEntity()`, `clear()` — all unchanged. Every existing call to `memory.add('user'|'assistant', text, entities)` in `assistant.js` continues to work identically because the new field is optional.

### `src/assistant/providers.js`
**Why it changes:** Priority 1 (repetition), Priority 2 (resume response), and Priority 3 (JD-match response) all live on `LocalProvider`.
**Exactly what changes:** one new small helper for phrase-variant selection (consulted by exactly two existing call sites — the `_recommendResponse` recruiter lead and the `_projectResponse` recruiter closing line — both keep their current *meaning*, only their exact wording rotates); one new `_resumeResponse()` method plus a new `if (top.kind === 'resume')` branch in `generate()`'s existing routing chain; one new `_jdMatchResponse(query, ctx)` method plus a new `if (ctx.intent === 'jd-match')` early-check in `generate()` (checked before the retrieval-based routing, since JD analysis doesn't need `knowledge.retrieve()` at all — it needs `jdmatch.js` directly).
**What must remain untouched:** every other `_xResponse()` method's text, the entire remote-provider section (`OpenAIProvider` through `OllamaProvider`), `getConfig()`, `getProvider()`, `buildSystemPrompt()`, `buildGroundedPrompt()`.

### `src/assistant.js`
**Why it changes:** this is the orchestrator — every new feature needs a small, explicit wire-up here, plus the three correctness guards identified during verification.
**Exactly what changes:**
- Import `interview` (default export of `interview.js`) and `looksLikeJobDescription` from `jdmatch.js`.
- Add a mode-gate check (`if (interview.isActive())`) at the very top of `ask()`, before the existing `memory.add('user', ...)` call — this requires a small reordering: intent classification (or at least the interview-active check) must happen before that `memory.add()` call so the new `skipProfileIngest` flag can be computed and passed in. `classifyIntent()` itself is a pure function with no side effects, so evaluating it slightly earlier than today is safe.
- Add `'resume'`, `'jd-match'`, and `'interview'` branches to `classifyIntent()`'s existing if-chain, in the positions detailed in Feature Design above (resume branch after the existing `action-resume` line; jd-match and interview checked via their own heuristics/keywords).
- Add the `'jd-match'` exclusion to the existing `isPureAction`/`decideTool` block, and skip `resolveContext()`'s pronoun-enrichment + `runProactiveTool()` for `'jd-match'` (both detailed in Feature Design → Priority 3).
- Extend `buildFollowups()` to read `memory.activeTopic` and avoid repeating a suggestion already shown in the last few turns (tracked in the new module-local, non-persisted `Set`).
**What must remain untouched:** the `Workspace` state manager, `startThinkingSteps()`, `buildProjectActions()`, `addBubble()`, the delegated click-event handler, and the overall shape/order of the remaining pipeline steps for every message that is *not* a JD paste and *not* part of an active interview.

### `docs/CHANGELOG.md`
**Why it changes:** every notable change must be recorded, per `CURSOR_RULES.md`'s Documentation Rules.
**What changes:** a new dated `[Unreleased]` → versioned entry once implemented, listing every Sprint 3 change, grouped Added/Changed the same way the Sprint 2 entry already does.
**What remains untouched:** every prior version entry.

### `docs/PROJECT_ARCHITECTURE.md`
**Why it changes:** two new modules (`jdmatch.js`, `interview.js`) join the AI Assistant Modules list; `memory.js`'s and `knowledge.js`'s entries need a one-line note about their new responsibilities.
**What changes:** additions only, in the existing per-module sections, following the same terse style already used for `scroll.js`/`log.js`'s Sprint 1/2 entries.
**What remains untouched:** every unrelated section (Layers 1–5, Rendering Strategy, State Management, etc.).

### `docs/AI_ASSISTANT_SPEC.md`
**Why it changes:** this document already *describes* Recruiter Mode, Interview Mode, and JD Matching as future vision — once implemented, the "Current"/"Future" framing for those sections needs to reflect that a scoped version now exists, and the "Resume Analyzer" section should get a short note distinguishing it from the (now-implemented) "Resume Intelligence" to avoid the ambiguity flagged in Repository Verification.
**What changes:** targeted updates to the specific sections named above only.
**What remains untouched:** the Vision, Design Philosophy, and every section describing features still out of scope (persistent memory, real token streaming, multi-language, etc.).

### `README.md`
**Why it changes:** the `src/assistant/` module list and `ASSISTANT_KB`/chip customization notes should mention the two new files and two new chips, consistent with how Sprint 1/2's new files were documented there.
**What changes:** the file-structure block and the "Customising" section only.
**What remains untouched:** everything else.

## Deleted files

None.

## Explicitly untouched files (confirmed by design, not by omission)

`index.html`, `main.js`, `core.js`, `sections.js`, `scene.js`, `scroll.js`, `log.js`, `awareness.js`, `streaming.js`, `renderer.js`, `tools.js`, `styles.css`.

---

# Implementation Phases

## Phase 0 — Foundation data + memory schema
**Objective:** land the non-behavioral groundwork every other phase depends on, with zero visible change to the running assistant.
**Files:** `src/content.js` (add `SKILLS_TAXONOMY`, `INTERVIEW_QUESTIONS`, two chips), `src/assistant/memory.js` (add `activeTopic`/`usedPhraseKeys`, `v4` storage key, `skipProfileIngest` param).
**Validation checklist:**
- [ ] Existing assistant still boots and answers normal questions identically to pre-Sprint-3 behavior.
- [ ] `sessionStorage` under the new `v4` key round-trips `activeTopic`/`usedPhraseKeys` correctly across a page refresh.
- [ ] Every existing `memory.add()` call site still works with no change to its call signature.
**Expected outcome:** no user-visible change yet; the codebase now has the data and memory surface later phases need.

## Phase 1 — Resume Intelligence
**Objective:** ship Priority 2 end-to-end.
**Files:** `src/assistant/knowledge.js` (new `resume` doc), `src/assistant/providers.js` (`_resumeResponse`), `src/assistant.js` (new `'resume'` intent branch).
**Validation checklist:**
- [ ] "Summarize your resume" / "walk me through your experience" / "what's your background" all return the new structured answer.
- [ ] "Download my resume" / "resume pdf" still trigger the existing download tool, unchanged.
- [ ] The response never states anything not present in `content.js` (education/dates/certifications are never mentioned).
**Expected outcome:** the assistant can discuss Sudhanshu's background conversationally without the PDF working.

## Phase 2 — Job Description Matching
**Objective:** ship Priority 3 end-to-end.
**Files:** new `src/assistant/jdmatch.js`, `src/assistant/providers.js` (`_jdMatchResponse`), `src/assistant.js` (`'jd-match'` intent + the three correctness guards).
**Validation checklist:**
- [ ] Pasting a realistic backend/AI job posting produces a plausible score, a matched/missing table, at least one relevant project citation, and talking points grounded in `content.js`.
- [ ] Pasting the same JD does not trigger `decideTool` (verified: no unexpected scroll/highlight/navigation fires).
- [ ] Pasting the same JD does not corrupt `VisitorProfile` (verified: profile scores unchanged before/after the paste).
- [ ] A non-JD long question is not misclassified as a JD (heuristic checked against a few realistic long questions).
- [ ] A JD with no recognizable technical keywords degrades gracefully (no crash, no fabricated score).
**Expected outcome:** the headline new feature of the sprint works reliably and safely alongside every existing pipeline behavior.

## Phase 3 — Interview Mode
**Objective:** ship Priority 4 end-to-end.
**Files:** new `src/assistant/interview.js`, `src/assistant.js` (mode gate + `'interview'` intent).
**Validation checklist:**
- [ ] "Start a Python interview" begins a session and asks question 1 of N.
- [ ] "Start an interview" (no topic) prompts for topic, and the next message resolves it correctly.
- [ ] Answering advances through the bank one question at a time; exhausting the bank produces a summary.
- [ ] "Stop interview" / "exit interview" reliably ends the session and restores normal conversation on the next message (critical regression check — see Risks).
- [ ] All five topics (Python, SQL, React, Backend, AI/ML) are reachable and each returns topic-appropriate questions.
**Expected outcome:** a working, bounded, offline mock-interview experience.

## Phase 4 — Recruiter Mode polish + follow-up/memory improvements
**Objective:** ship Priority 1 and the remainder of Priority 5.
**Files:** `src/assistant/providers.js` (variant helper), `src/assistant.js` (`buildFollowups()` topic-awareness + de-duplication).
**Validation checklist:**
- [ ] Asking "why hire him" twice, or asking about two different projects as a recruiter, no longer produces an identically-worded closing sentence both times.
- [ ] Follow-up suggestions vary across a multi-turn conversation about the same topic rather than repeating verbatim.
- [ ] `activeTopic` visibly tracks the conversation thread (spot-checked via `window.SRIIVERSE_AI.memory.activeTopic` in devtools during manual testing).
**Expected outcome:** multi-turn conversations — especially recruiter ones — feel noticeably less scripted.

## Phase 5 — Documentation & changelog closeout
**Objective:** bring documentation in sync with everything Phases 0–4 actually shipped.
**Files:** `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/AI_ASSISTANT_SPEC.md`, `README.md`.
**Validation checklist:**
- [ ] `docs/CHANGELOG.md` has a new entry in the established format.
- [ ] `docs/PROJECT_ARCHITECTURE.md` lists both new modules.
- [ ] `docs/AI_ASSISTANT_SPEC.md`'s Recruiter/Interview/JD-Matching/Resume sections reflect what's actually implemented vs. still future.
- [ ] `README.md`'s module list and customization notes are accurate.
**Expected outcome:** documentation matches reality, not just this plan's intentions.

---

# Risks

## Architectural risks
- **Mode-gate correctness (Interview Mode).** If `interview.isActive()` ever gets stuck true, the assistant becomes unusable until the page is reloaded. Mitigated by keeping the state machine small (four states) and making the exit path a required regression test, not an afterthought.
- **Regex-heuristic false positives (JD Matching, new intents generally).** `classifyIntent()` is, and remains, a flat regex chain — this sprint adds three more branches to it, increasing the surface area for miscategorization. Mitigated by requiring *compound* conditions (length + keyword density, or explicit phrase + topic) for the two new higher-stakes intents, rather than single-keyword matches.
- **Scope creep into `content.js`'s data model.** Adding `SKILLS_TAXONOMY` and `INTERVIEW_QUESTIONS` grows `content.js` further, compounding the maintainability risk already flagged in `PROJECT_ARCHITECTURE.md` ("content.js will become difficult to maintain as content grows"). Not fixed in this sprint (a content.js split is out of scope here), but flagged so it isn't forgotten.

## Performance risks
- **Unbounded JD-length regex scanning.** Mitigated by a defined maximum scan length inside `jdmatch.js` (see Feature Design → Priority 3 → Edge Cases) — without this cap, a pathologically long paste could cause a noticeable stall since every taxonomy alias is checked against the full text.
- **No other performance-sensitive code is touched.** Three.js, GSAP, and Lenis are entirely untouched by this sprint; the new work is a handful of string operations and one new session-state object, negligible relative to the existing scene/animation cost.

## Accessibility risks
- **Net risk is low, by design.** Because Key Design Decision 1 reuses `renderMarkdown()`/`renderCitations()` for all new output instead of building new widgets, every new feature automatically inherits Sprint 2's `aria-live` single-announcement behavior, keyboard focus handling, and screen-reader-readable markup — no new accessibility surface is introduced. The one thing to explicitly verify (Testing Checklist, below) is that long JD-match/interview responses don't produce an excessively long single `aria-live` announcement that overwhelms a screen-reader user; if that proves to be a real problem in manual testing, the mitigation is confined to how much text is placed in the live region, not a redesign.

## Maintainability risks
- **`memory.js`'s versioning stays non-migrating.** Bumping to `v4` silently drops old sessions rather than migrating them — acceptable for `sessionStorage` (inherently short-lived, per-tab), but this pattern would not scale if `Memory` ever moved to persistent (cross-session) storage, which is explicitly a "Future" item in `AI_ASSISTANT_SPEC.md`, not this sprint's problem to solve.
- **Two new modules increase the assistant's module count from 7 to 9.** Justified individually above (each has one clear responsibility, no overlap with an existing module), but worth naming as a real increase in surface area for whoever maintains this next.
- **The interview question bank and skills taxonomy are hand-authored, static data.** They will need periodic manual upkeep (new questions, new skill aliases as JD phrasing evolves) — no automated generation is introduced, deliberately, to avoid a "content pipeline" abstraction this sprint's scope doesn't call for.

---

# Testing Checklist

## Recruiter scenarios
- [ ] Ask "why should I hire him" as a fresh session — get the full recruiter narrative.
- [ ] Ask about two different projects in the same recruiter session — confirm the closing sentence is not word-for-word identical both times.
- [ ] Ask "why hire him" a second time in the same session — confirm graceful fallback behavior (repeat is acceptable once all variants are exhausted; a crash or blank response is not).
- [ ] Confirm the visitor-profile badge still appears after 2+ recruiter-flavored messages, unchanged from pre-Sprint-3 behavior.

## Resume scenarios
- [ ] "Summarize your resume" returns a structured, accurate answer sourced only from existing `content.js` fields.
- [ ] "What's your educational background?" (or similarly unanswerable) is met with an honest "I don't have that" rather than an invented answer.
- [ ] "Download my resume" / "resume pdf" still trigger the existing download tool exactly as before Sprint 3.

## Job description matching
- [ ] Paste a realistic backend-heavy JD → plausible score, correct matched/missing split, at least one relevant project.
- [ ] Paste a realistic frontend-only JD → lower backend-skill match, still a coherent, non-crashing result.
- [ ] Paste a very short, vague JD with no tech keywords → graceful "couldn't detect requirements" response, not a fabricated score.
- [ ] Paste an extremely long JD (multiple pages) → completes without a noticeable UI stall.
- [ ] Confirm pasting a JD does **not** trigger an unrelated `decideTool` action (watch for unexpected scroll/highlight/new-tab).
- [ ] Confirm pasting a JD does **not** change `VisitorProfile`'s inferred type/focus area (check via `window.SRIIVERSE_AI.memory.profile` in devtools before/after).
- [ ] Ask a normal, long, technical *question* (not a JD) → confirm it is **not** misclassified as `'jd-match'`.

## Interview mode
- [ ] "Start a Python interview" → question 1 of N appears.
- [ ] Answer with something reasonable → feedback + question 2 appears; progress indicator increments correctly.
- [ ] Exhaust a topic's full question bank → session summary appears, not a repeat or an error.
- [ ] "Start an interview" with no topic → topic-selection prompt appears; a one-word topic reply correctly resolves it.
- [ ] Mid-session, say "exit interview" → session ends immediately; the **very next** normal message is answered normally (this is the critical regression check called out in Risks).
- [ ] Attempt each of the five topics (Python, SQL, React, Backend, AI/ML) at least once.

## Follow-up conversations / memory
- [ ] Have a 5+ turn conversation drilling into one project (overview → architecture → stack → "why that stack") → confirm follow-up suggestions vary rather than repeating identically each turn.
- [ ] Refresh the page mid-conversation → confirm `sessionStorage` (`v4` key) restores turns/profile/`activeTopic` correctly.
- [ ] Open the assistant in a fresh private/incognito-style context where `sessionStorage` may be restricted → confirm graceful degradation (existing behavior, re-verified unchanged).

## Regression
- [ ] Every Sprint 1 and Sprint 2 manual test (résumé download flow, skip link, architecture keyboard/tap toggle, `aria-live` single-announcement behavior, SEO tags, centralized logging) still passes unchanged.
- [ ] Normal (non-JD, non-interview) conversation — ask about each project, the stack, the architecture, "who is Sudhanshu" — all behave identically to pre-Sprint-3.
- [ ] No new console errors across a full manual pass: open the assistant, exercise every one of the five new capabilities at least once, close and reopen the assistant, resize across the 980px breakpoint.
- [ ] Command bar, comparison card, tabbed project card, thinking-steps animation — all still render exactly as before (none of their rendering code was touched, but verify the shared `assistant.js` pipeline changes didn't disturb them).

---

# Definition of Done

Sprint 3 is complete only when every item below is checked:

- [ ] **All five objectives are implemented** — Recruiter Mode polish, Resume Intelligence, Job Description Matching, Interview Mode, and Memory Improvements are all functional per their Feature Design sections above.
- [ ] **Existing functionality remains intact** — every item in the Testing Checklist's Regression section passes.
- [ ] **No console errors are introduced** — verified via the full manual pass described in Regression.
- [ ] **Assistant performance remains smooth** — no noticeable stall on JD paste (including the length-cap edge case), interview turns, or normal conversation; streaming still feels identical to pre-Sprint-3.
- [ ] **No duplicated logic** — JD matching logic lives only in `jdmatch.js`; interview logic lives only in `interview.js`; no copy-pasted regex/scoring logic between them and `knowledge.js`.
- [ ] **Documentation updated** — `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/AI_ASSISTANT_SPEC.md`, and `README.md` all reflect what was actually built (re-checked against the real diff, not just this plan's intentions).
- [ ] **`CHANGELOG.md` updated** with a dated Sprint 3 entry in the established format.
- [ ] **All Testing Checklist items pass**, including every recruiter, resume, JD-matching, interview-mode, follow-up/memory, and regression item above.

---

# Future Improvements

Explicitly deferred to Sprint 4 or later — not started, not assumed, not partially implemented in Sprint 3:

- **True Résumé Analyzer** (visitor uploads *their own* résumé for gap analysis against the portfolio, per `AI_ASSISTANT_SPEC.md`'s existing "Resume Analyzer" section) — requires file-input UI and text extraction, a materially larger feature than this sprint's "Resume Intelligence."
- **Difficulty levels, hints, and a formal improvement plan for Interview Mode** — Sprint 3 ships single-difficulty, sequential questions only, per the literal Sprint 3 priorities given.
- **Behavioral (non-textual) recruiter/visitor-type detection** (e.g. inferring recruiter intent from browsing speed or section-jump patterns via `awareness.js`, rather than only from message text).
- **Expanding the interview question bank** beyond the initial starter set per topic, and adding more topics (System Design, Docker, PostgreSQL/MongoDB specifically, prompt engineering) as named in `AI_ASSISTANT_SPEC.md`'s fuller vision.
- **A dedicated JD-paste textarea/expanding input** for better visual feedback while pasting a long job description — a pure UX improvement on top of the Sprint 3 matching logic, not a functional dependency of it.
- **Persistent (cross-session) memory, real token streaming, secure LLM backend integration** — all already named as "Future" in `AI_ASSISTANT_SPEC.md` and unaffected by this sprint.
- **A visual JD-match/interview card** (progress bar, score gauge) replacing the markdown-based presentation this sprint deliberately chose for leanness — worth revisiting once the underlying data/logic has proven itself in real use.

---

# New Chat Handoff

Paste the following into a brand-new Cursor chat (Sonnet 5, high reasoning) to implement Sprint 3:

```
We previously completed a full repository analysis and produced an approved implementation plan for Sprint 3.

The plan is saved at docs/SPRINT_3_PLAN.md — read it in full before doing anything else.

Also read docs/CURSOR_RULES.md and follow it as the permanent engineering standard for this repository.

Your task: implement Sprint 3 exactly as described in docs/SPRINT_3_PLAN.md, phase by phase (Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5), in order.

Requirements:
- Before writing any code, verify the current repository state against every claim in docs/SPRINT_3_PLAN.md's "Repository Verification" section — the codebase may have changed since this plan was written. If you find any material contradiction between the repository and the approved plan, stop and explain it before continuing.
- Follow the implementation phases exactly as defined in the plan.
- Preserve the existing architecture and module boundaries — do not modify any file listed under "Explicitly untouched files" unless you first flag why the plan's assumption about it was wrong.
- Reuse existing modules whenever possible; do not introduce unnecessary abstractions or dependencies.
- Stay strictly within Sprint 3 scope — everything under "Future Improvements" is explicitly out of scope for this implementation.
- Follow the Definition of Done in the plan before considering Sprint 3 complete.

After implementation:
- Summarize every file changed and why.
- Report any deviations from the approved plan.
- Confirm every item in the Testing Checklist was manually verified (or explain what blocked verification).
- Confirm every Definition of Done item has been satisfied.
```
