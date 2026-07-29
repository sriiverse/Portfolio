# CHANGELOG.md

All notable changes to **SRIIVERSEAI** will be documented in this file.

The format follows the principles of **Keep a Changelog** and **Semantic Versioning**.

---

# Versioning Strategy

```
MAJOR.MINOR.PATCH
```

Example

```
1.0.0

↑ Major Architecture

↑ Minor Feature

↑ Bug Fix
```

---

# [Unreleased]

## Planned Features

### AI Assistant

- Secure LLM backend
- Persistent cross-session memory
- Semantic (embedding) retrieval
- Advanced interview difficulty levels / evidence generation

> Resume analysis, JD matching, recruiter mode, interview mode, Conversation Intelligence, the Reasoning Engine (Phases 1–6), V3–V4 intelligence layers, V4.5 conversation quality, and V4.6.1 conversation-first rendering are **shipped**. Items above are future vision from `docs/AI_ASSISTANT_SPEC.md`, not missing base features.

---

### Portfolio

- Real project screenshots
- Architecture diagrams
- Embedded walkthrough videos
- Analytics dashboard

---

# [1.7.0] - 2026-07-29 (V4.6.1 Conversation-First Rendering)

### Added

- Conversation-first rendering contract: answer the question first; use projects as supporting evidence; emit brochure cards only in explicit documentation mode.
- `intro` conversation mode (`tell me about yourself` / `introduce yourself`) → spoken `self_intro`.
- Spoken `project_overview` for explain/tell-me-about project asks (non-walkthrough).
- Named-project walkthrough resolution in composition (query → project card even when retrieval ranks resume higher).
- Repository overview: `docs/UPGRADE_HISTORY.md`, `docs/V4_6_CONVERSATION_FIRST_RENDERING.md`.

### Changed

- `buildSystemPrompt()` no longer instructs Problem/Solution/Features section dumps by default.
- `_allowsProjectBrochure()` tightened; project retrieval no longer implies project rendering.
- Continuity leads only on genuine follow-ups (`isBoundFollowUpQuery`).
- Default conversational length budget (~4–8 sentences) unless the visitor asks to expand or requests documentation mode.
- Recommend routing covers “which project should I look at first…” style asks.

### Validation

- Sprint 2 **51/51**; V4 adaptive / reflection / graph / decisions / identity suites green.

---

# [1.6.0] - 2026-07-29 (V4.5 Conversation Quality)

### Added

- Conversational Intent Gate (`challenge`, `self`, `opinion`, `preference_gap`, `ops_story`, `probe`, `brief`).
- Bound follow-up state on session memory (`lastCommitment`, `activeMode`, `bindConversationState`).
- Gap/fallback dedupe; presentation gate; answer-shape budget (V4.5 Phase 2–3 quality mods).
- Phase 1 first-person voice polish (short-first openings, no lens stickers / internal IDs).

### Changed

- Employment-at-FAANG asks no longer misroute to interview project pitches.
- Soft-skill / opinion / failure-mode asks prefer spoken operators over brochure or false gaps.
- Adaptive invites and trade-off garnish become policy-gated rather than always-on.

### Validation

- Sprint 2 **51/51** preserved through quality mods.

---

# [1.5.0] - 2026-07-28 (V4 Digital Engineering Brain)

### Added

- V4 Phase 1 knowledge graph (`graph.js`) + validation docs/tests.
- V4 Phase 2 decision records (`decisions.js`).
- V4 Phase 3 engineering identity (`identity.js`).
- Generic reasoning operators over graph / decisions / identity (`reasoning.js` rewrite).
- Reflection engine (`reflection.js`) wired before render return.
- Digital Engineering Brain persona + adaptive audience modes (`adaptive.js`, `persona.js`).

### Changed

- Sprint 2 synthesis path dispatches to operators instead of project-id case tables.
- Audience emphasis (recruiter / engineer / founder / student) without inventing facts.

---

# [1.4.0] - 2026-07-24 (Reasoning Engine)

### Added

- Full reasoning pipeline (Phases 1–6): Question Understanding → Entity Resolution → Evidence Selection → Confidence → Response Planning → Response Composition.
- `src/assistant/entities.js` — entity resolution + `assessConfidence()`.
- `src/assistant/planning.js` — `buildResponsePlan()` / `ResponseBlock` system.
- Question-type-scoped retrieval via `knowledge.buildEvidenceSet()` / `retrieveScoped()`.
- `docs/REASONING_ENGINE_SPEC.md`, `docs/REASONING_ENGINE_PLAN.md`, phase validation reports (`PHASE_1`…`PHASE_6`), `docs/AI_EVALUATION_SUITE.md` (203 questions), `docs/FINAL_BENCHMARK.md`, `docs/RENDERING_POLISH_VALIDATION.md`.

### Changed

- `LocalProvider.generate()` renders `ctx.plan` (Stage 8) when present; legacy routing retained as fallback.
- Rendering polish: rich project cards when Evidence is single-project; greeting variant rotation; honest-decline tone; comparison “where this shows up” lines.
- **Greeting plans bypass confidence gating** — `Greeting` branch runs before `tier: 'low'` HonestDecline (fixes Q3–Q5).

### Benchmark

- Full suite: **203/203** run · **0 hallucinations** · **0 hard fails** after greeting fix (see `docs/FINAL_BENCHMARK.md`).

---

# [1.3.0] - 2026-07-23 (Conversation Intelligence)

### Added

- `src/assistant/conversation.js` — Conversation Strategy layer: `analyzeStrategy(query, ctx)` classifies the conversational *move* (`greeting`, `identity`, `comparison`, `opinion`, `experience`, `explanation`, `factual`) and, for `explanation`, disambiguates *scope* (`portfolio` vs. a specific project) using conversational context — all before knowledge retrieval runs. Pure, offline, provider-agnostic and UI-agnostic, same contract as `jdmatch.js`/`interview.js`.
- `src/assistant/persona.js` — new, dedicated module for authored conversational content that is *not* portfolio data: `ASSISTANT_CAPABILITIES` (assistant self-description) and `TECH_TAKES` (Flask vs. FastAPI, PostgreSQL vs. MongoDB, React vs. Vue — engineering opinions + structured comparison dimensions + real-project evidence). Deliberately kept out of `content.js`, which remains portfolio-data-only.
- `matchTaxonomyEntities()` (`src/assistant/jdmatch.js`) — generalized/exported from the previously-private `detectRequestedSkills()` so `conversation.js` can reuse the same `SKILLS_TAXONOMY` alias-matching instead of duplicating it.
- Five new response composers (`src/assistant/providers.js`): `_greetingResponse`, `_identityResponse`, `_techComparisonResponse`, `_opinionResponse`, `_experienceResponse` — plus `_findTechTake`, `_renderTechEvidence`, `_techEvidenceSources`, `_techTakeFallback` helpers.

### Changed

- `src/assistant.js` — new pipeline step 5, "CONVERSATION STRATEGY," inserted between `PROFILE` and the provider call (12-step pipeline → 13-step); `strategy` is now passed through `ctx` into `provider.generate()` alongside `intent`/`focusProject`/`visitorProfile`; `buildFollowups()` now also accepts `strategy` and suggests move-specific follow-ups for `greeting`/`identity`/`opinion`/tech-`comparison`/`experience` before falling back to the existing recruiter/engineer/intent-based logic, unchanged for every other case.
- `src/assistant/providers.js` — `LocalProvider.generate()` gained a strategy-routing block, checked immediately after the existing `jd-match` short-circuit and before the existing `retrieve()` call: it answers `greeting`/`identity` directly (no retrieval needed), routes tech-vs-tech `comparison`/`opinion` to the new composers, routes `experience` to evidence-based project filtering, and resolves `explanation` scope deterministically via `getDoc('arch-overview')` or `getDoc('project-arch-<id>')` instead of leaving portfolio-vs-project architecture questions to keyword-scoring luck. Every existing method and the existing retrieval fallback are unchanged and still reached whenever `strategy` is absent or inconclusive.

### Fixed

- "Who are you?" / "What can you do?" and similar identity/greeting phrasing no longer fall back to "I didn't quite catch that" — `knowledge.js`'s stopword-heavy tokenizer (`who`/`are`/`you` are all stopwords, so these queries tokenized to zero retrievable tokens) is now bypassed entirely for these moves instead of being asked to serve them.
- "What backend framework do you prefer?" / "Which database would you choose?" no longer return the generic Technology Stack or architecture-layer doc — these are now recognized as opinion/recommendation questions and answered with a grounded, evidence-backed take.
- "Compare Flask vs FastAPI" (and other named tech-vs-tech pairs) no longer silently returns the Technology Stack doc — `_comparisonResponse()`'s project-only scope gap is now covered by a dedicated tech-comparison composer for non-project entities.
- "Explain the architecture" now deterministically returns the portfolio's five-layer overview on a generic first-turn ask, instead of occasionally losing to a specific project's architecture doc due to `knowledge.js`'s `kindWeight` favoring `project-arch` (0.95) over `arch-overview` (0.9) and an incidental keyword collision (RepoRadarAI's decisions text happens to contain the literal word "architecture"). Conversational context (an actively-discussed project) is now checked before falling back to the portfolio-wide default, so mid-conversation "explain the architecture" still resolves to the right project when that's clearly what's meant.

### Documentation

- `docs/CONVERSATION_INTELLIGENCE_PLAN.md` — full problem analysis (root-caused and reproduced against the live scoring math for all four reported examples), architecture, data flow, module changes, file-by-file plan, implementation phases, risks, testing checklist, and definition of done for this upgrade.
- `docs/AI_ASSISTANT_SPEC.md`, `docs/PROJECT_ARCHITECTURE.md`, `README.md` — updated for the two new modules and the 13-step pipeline.

### Notes

- Everything remains fully offline — no network calls, no new external dependencies. `conversation.js` and `persona.js` are both provider-agnostic and UI-agnostic: one is pure classification logic, the other is pure authored data; `providers.js` alone turns them into response text.
- `content.js` is completely unchanged by this release — it remains the single source of truth for portfolio data only. All new authored conversational content lives in `persona.js` instead, by design (see `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s refinements).

---

# [1.2.0] - 2026-07-23 (Sprint 3)

### Added

- `src/assistant/jdmatch.js` — Job Description Matching engine (pure, provider-agnostic, UI-agnostic): `looksLikeJobDescription()`, `analyzeJobDescription()`.
- `src/assistant/interview.js` — Interview Mode session state machine (pure, provider-agnostic, UI-agnostic): `start()`, `handleTurn()`, `isActive()`, `getProgress()`, `reset()`.
- `SKILLS_TAXONOMY` and `INTERVIEW_QUESTIONS` (`src/content.js`) — skill-alias taxonomy and a 5-topic (Python/SQL/React/Backend/AI-ML) question bank.
- Synthesized `resume` knowledge doc (`src/assistant/knowledge.js`), built live from `PROFILE`/`JOURNEY`/`PROJECTS`/`STACK` — powers Resume Intelligence without the résumé PDF download needing to work.
- `_resumeResponse()` and `_jdMatchResponse()` (`src/assistant/providers.js`).
- `_pickVariant()` helper (`src/assistant/providers.js`) — rotates recruiter-facing phrasing so repeated questions in one session don't get an identical sentence twice.
- Two new assistant chips (`src/content.js`'s `ASSISTANT_CHIPS`): "Paste a job description to match", "Practice a Python interview".

### Changed

- `src/assistant.js` — new mode gate ahead of intent classification, routing every turn to `interview.js` while a session is active; `classifyIntent()` gained `'resume'`, `'jd-match'`, and `'interview'` branches; `resolveContext()` skips pronoun/project enrichment for `'jd-match'`; the proactive-tool and pure-action/tool-decision checks now exclude `'jd-match'`; `buildFollowups()` now reads `memory.activeTopic`, dedupes suggestions against `memory.usedPhraseKeys`, and gained `'resume'`/`'jd-match'` cases.
- `src/assistant/memory.js` — added `activeTopic` and `usedPhraseKeys`; `add()` gained an `entities.skipProfileIngest` guard so a pasted job description or an interview answer never skews `VisitorProfile`'s inferred type/focus area; storage key bumped `v3` → `v4` (no migration — same tolerant-defaults-on-load pattern as prior bumps).
- `src/assistant/providers.js` — `_projectResponse()`'s and `_recommendResponse()`'s recruiter-facing copy now rotates through phrase variants instead of a single fixed sentence.

### Documentation

- `docs/AI_ASSISTANT_SPEC.md` — Recruiter Mode, Interview Mode, Resume Analyzer, and Job Description Matching sections annotated with what Sprint 3 actually implemented vs. what remains future.
- `docs/PROJECT_ARCHITECTURE.md` — `jdmatch.js`/`interview.js` added to the AI Assistant Modules list; `memory.js`/`knowledge.js` sections note their Sprint 3 additions; Assistant Lifecycle notes the new mode gate.
- `README.md` — file-structure block and customization notes updated for the two new modules and the `content.js` additions.

### Notes

- Everything remains fully offline — no network calls, no new external dependencies, no production LLM backend. `jdmatch.js` and `interview.js` are provider-agnostic and UI-agnostic by design: they return structured data only, and `assistant.js`/`providers.js` own turning that into response text.
- Job Description Matching and Interview Mode both reuse the existing single-line chat input and the existing `renderMarkdown()`/`renderCitations()` renderer — no new UI components or styles were introduced.

---

# [1.1.0] - 2026-07-23 (Sprint 2)

### Added

- `src/log.js` — centralized `logWarn`/`logError` helper.
- `#assistantLive` visually-hidden live region (`index.html`) — announces one complete assistant message per turn.
- `.sr-only` utility class (`src/styles.css`).
- `initArchInteraction()` (`src/core.js`) — keyboard (`Enter`/`Space`) and tap toggle for architecture-node descriptions.
- `PROFILE.siteUrl` placeholder (`src/content.js`).
- JSON-LD (`Person` + `WebSite`), Twitter Card tags, canonical link, `robots` meta (`index.html`).
- `robots.txt` and `sitemap.xml` (repo root).
- `docs/` folder — 8 canonical documentation files, consolidated from 12 root-level fragments.

### Changed

- `--text-faint` lightened from `#5B6488` to `#7A84AD` to pass WCAG AA contrast (≈5.4:1 against `--bg-0`, ≈5.1:1 against `--bg-1`; was ≈3.4:1).
- `#assistantBody`'s `aria-live="polite"` removed in favor of the new scoped `#assistantLive` region, so screen readers announce the completed message instead of every streamed word-chunk.
- Architecture-node markup (`src/sections.js`) gained `tabindex`, `role="button"`, `aria-expanded`, `aria-controls`/`id` wiring.
- Mobile architecture description (`≤980px`) no longer uses `display: none` — collapsed by default, reachable via tap/focus, per the same `.is-open`/`:focus-visible` rules used on desktop.
- All existing `console.warn`/`console.error` call sites (`main.js`, `assistant/tools.js`, `assistant/memory.js`) now route through `src/log.js`.
- `assistant/memory.js`'s two `sessionStorage` `try/catch` blocks, which previously failed silently, now log via `logWarn` (behavior otherwise unchanged — still degrades gracefully).

### Fixed

- Architecture-section descriptions are no longer permanently unreachable for keyboard-only and mobile/tablet visitors (previously hover-only on desktop, fully hidden at ≤980px).

### Accessibility

- `--text-faint` now passes WCAG AA (≥4.5:1) for normal text.
- Architecture node descriptions reachable via `Tab` + `Enter`/`Space` and via tap on touch devices.
- Assistant live-region announcements scoped to one per completed turn instead of per streamed chunk.

### Documentation

- Consolidated the 12 root-level `.md` fragments into 8 canonical files under `docs/` (`PORTFOLIO_AUDIT.md`, `IMPLEMENTATION_ROADMAP.md`, `AI_ASSISTANT_SPEC.md`, `PROJECT_ARCHITECTURE.md`, `DESIGN_GUIDELINES.md`, `CURSOR_RULES.md`, `CHANGELOG.md`, `CONTRIBUTING.md`); originals deleted after merge.
- `docs/PROJECT_ARCHITECTURE.md` updated with `scroll.js` and `log.js` module entries.
- `README.md` file-structure block and Architecture section updated to match.

### Notes

- `PROFILE.siteUrl` is a placeholder domain (`https://sriiverseai.dev`) until a real domain is deployed — must be manually mirrored into `index.html`'s static tags, `robots.txt`, and `sitemap.xml` (same manual-sync limitation `PROFILE.resume`/`PROFILE.email` already have).
- No LLM-provider backend/serverless proxy work was done — explicitly out of scope for this sprint.

---

# [1.0.0] - Initial Public Release

## Added

- Zero-build JavaScript architecture
- Modular ES Module system
- Three.js immersive background
- GSAP animations
- Lenis smooth scrolling
- AI portfolio assistant
- Knowledge retrieval system
- Visitor awareness engine
- Portfolio projects
- Timeline
- Technology stack
- Responsive layout

---

## Architecture

Introduced

- Modular rendering
- Centralized content layer
- Assistant pipeline
- Scene engine
- Progressive rendering

---

## Performance

Implemented

- Native browser rendering
- ES module loading
- Lightweight dependency footprint

---

## Documentation

Created

- PORTFOLIO_AUDIT.md
- IMPLEMENTATION_ROADMAP.md
- AI_ASSISTANT_SPEC.md
- PROJECT_ARCHITECTURE.md
- DESIGN_GUIDELINES.md
- CURSOR_RULES.md

---

# Release Template

## [x.y.z] - YYYY-MM-DD

### Added

-

### Changed

-

### Improved

-

### Fixed

-

### Removed

-

### Performance

-

### Accessibility

-

### Documentation

-

### Notes

-

---

# Planned Milestones

## Version 1.1

Focus

Production Readiness

Goals

- Resume download
- Accessibility improvements
- Cleanup
- Analytics
- Better metadata

---

## Version 1.2

Focus

AI Evolution

Goals

- Real LLM backend
- Conversation history
- Streaming
- Regenerate
- Memory

---

## Version 1.3

Focus

Recruiter Experience

Goals

- Resume Analyzer
- JD Matching
- Recruiter Mode
- Interview Mode

---

## Version 2.0

Focus

AI Engineering Platform

Goals

- Hybrid Retrieval
- Semantic Search
- Multi-provider orchestration
- Persistent Memory
- Voice Interaction
- Advanced Analytics

---

# Breaking Changes

Document any API or architectural changes that require migration.

Template

```
Breaking

- Changed provider interface
- Updated assistant module contract

Migration

- Replace X with Y
- Update configuration
```

---

# Deprecation Policy

Deprecated features should remain available for at least one minor release before removal.

Every deprecation should include:

- Reason
- Recommended replacement
- Planned removal version

---

# Contributor Notes

When releasing a new version:

- Update this file.
- Tag the release.
- Update documentation if architecture changed.
- Verify accessibility and performance benchmarks.

---

**End of CHANGELOG.md**