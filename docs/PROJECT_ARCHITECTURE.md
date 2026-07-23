# PROJECT_ARCHITECTURE.md

> Project: **SRIIVERSEAI**
>
> Version: 1.0
>
> Purpose:
>
> Define the software architecture, module interactions, rendering lifecycle, data flow, engineering decisions, and scalability strategy of the SRIIVERSEAI portfolio.

---

# Architectural Philosophy

SRIIVERSEAI follows a **Zero-Build Architecture**.

Instead of relying on frontend frameworks such as React, Vue, Angular, or Next.js, the project intentionally uses native browser capabilities to demonstrate engineering fundamentals.

Core technologies include:

- HTML5
- CSS3
- ES Modules
- Three.js
- GSAP
- ScrollTrigger
- Lenis

The philosophy behind this architecture is:

> Build only what is necessary. Avoid unnecessary abstraction. Preserve maintainability through modular JavaScript instead of framework components.

---

# High-Level Architecture

```
Browser

↓

index.html

↓

main.js

↓

──────────────────────────────

Scene Engine

↓

scene.js

──────────────────────────────

UI Renderer

↓

sections.js

↓

content.js

──────────────────────────────

Core Engine

↓

core.js

──────────────────────────────

AI Assistant

↓

assistant.js

↓

knowledge.js

↓

memory.js

↓

providers.js

↓

awareness.js

↓

streaming.js

↓

renderer.js

↓

tools.js

──────────────────────────────

DOM
```

---

# Architectural Layers

The repository is divided into six logical layers.

---

## Layer 1 — Presentation

Responsible for

- HTML
- CSS
- Layout
- Visual hierarchy

Files

```
index.html

styles.css
```

Responsibilities

✓ Structure

✓ Styling

✓ Accessibility

✓ Responsive Layout

---

## Layer 2 — Bootstrapping

Responsible for application startup.

File

```
main.js
```

Responsibilities

Initialize

↓

Scene

↓

Assistant

↓

Navigation

↓

Animations

↓

Content

Acts as the application's entry point.

---

## Layer 3 — Rendering

Responsible for generating UI.

Files

```
sections.js

content.js
```

Responsibilities

Generate

Projects

↓

Timeline

↓

Technology Stack

↓

Statistics

↓

Architecture Cards

↓

Journey

The renderer remains data-driven.

No hardcoded content should exist outside content.js.

---

## Layer 4 — Core Systems

File

```
core.js
```

Responsibilities

Loader

↓

Navigation

↓

Cursor

↓

Reveal Animations

↓

Counters

↓

Parallax

↓

Clock

↓

Architecture Node Interaction (`initArchInteraction()`, Sprint 2 — keyboard/tap toggle for node descriptions)

These systems remain independent of the assistant.

---

## Layer 5 — Three.js Scene

File

```
scene.js
```

Responsibilities

Particle System

↓

AI Core

↓

Glow

↓

Camera

↓

Mouse Interaction

↓

Rendering Loop

This layer is isolated from UI rendering.

The scene should never contain business logic.

---

## Layer 6 — AI Layer

The largest subsystem.

Responsible for

Understanding

↓

Reasoning

↓

Navigation

↓

Conversation

↓

Rendering

↓

Memory

↓

Knowledge

---

# Assistant Architecture

```
assistant.js

│

├── awareness.js

├── knowledge.js

├── memory.js

├── providers.js

├── renderer.js

├── streaming.js

├── tools.js

├── jdmatch.js  (Sprint 3 — Job Description Matching, pure/stateless)

├── interview.js  (Sprint 3 — Interview Mode session state)

├── conversation.js  (Conversation Intelligence — Strategy classification, pure/stateless)

└── persona.js  (Conversation Intelligence — authored conversational content, pure data)
```

Each module owns one responsibility.

No module should directly manipulate another's internal state.

Communication occurs through clearly defined interfaces.

---

# Module Responsibilities

## main.js

Responsibilities

- Application startup
- Dependency initialization
- Module orchestration
- Event registration

Should remain small.

Business logic belongs elsewhere.

---

## scene.js

Purpose

Render the immersive AI background.

Responsibilities

- Renderer
- Camera
- Animation Loop
- Lighting
- Mouse Response

Never interacts directly with portfolio content.

---

## sections.js

Purpose

Generate page sections.

Responsibilities

Render

Projects

↓

Technology Stack

↓

Journey

↓

Statistics

↓

Architecture

Uses content.js as the single source of truth.

Architecture-node descriptions (Sprint 2) are keyboard- and tap-accessible, not hover-only — the toggle behaviour itself lives in `core.js`'s `initArchInteraction()`, per Layer 4 below.

---

## content.js

Purpose

Centralized data storage.

Contains

Profile

Projects

Skills

Journey

Architecture

Statistics

Knowledge Base

Suggestion Chips

Future Recommendation

Split into

```
profile.js

projects.js

skills.js

assistant.js

journey.js
```

once the repository grows significantly.

---

## core.js

Purpose

General UI infrastructure.

Responsibilities

Loader

↓

Navigation

↓

Animations

↓

Scroll

↓

Counters

↓

Cursor

Avoid adding unrelated business logic here.

---

## scroll.js

Purpose

Single canonical smooth-scroll utility (introduced in Sprint 1).

Responsibilities

- Resolve a section id or element to a scroll target
- Delegate to `window.__lenis` when available, else fall back to native `scrollIntoView`
- Shared by `core.js` (anchor links), `assistant/tools.js` (chat-driven navigation), and any other module that needs to scroll the page

Consolidates what were previously two divergent scroll implementations into one.

---

## log.js

Purpose

Small, single-purpose logging helper (introduced in Sprint 2).

Responsibilities

- `logWarn(scope, message, err)` / `logError(scope, message, err)` — format + emit console output consistently
- No remote logging, no batching, no dependencies — intentionally minimal

Used by `main.js`, `assistant.js`, `assistant/tools.js`, and `assistant/memory.js` so every existing `console.warn`/`console.error` call site is routed through one consistently-formatted function instead of ad-hoc calls.

---

# AI Assistant Modules

---

## awareness.js

Tracks

Current Section

Current Project

Viewport

Scroll Position

Future

Reading Behaviour

Attention Score

Interaction Heatmap

---

## knowledge.js

Current

Keyword Search

↓

Scoring

↓

Context

Future

Embeddings

↓

Vector Search

↓

Hybrid Search

↓

Knowledge Ranking

Sprint 3 added one synthesized document (`kind: 'resume'`), built live from `PROFILE`/`JOURNEY`/`PROJECTS`/`STACK` — same pattern as the pre-existing `arch-overview`/`why-hire` synthesized docs. No new retrieval mechanism.

---

## memory.js

Current

Session Storage

Conversation

Visitor Profile

Sprint 3 additions (same module, no new file):

- `activeTopic` — last intent, for lightweight follow-up continuity
- `usedPhraseKeys` — a small session-scoped set so phrase-variants and follow-up suggestions aren't repeated verbatim
- `add()`'s `entities.skipProfileIngest` — guards `VisitorProfile.ingest()` against non-conversational text (a pasted job description, an interview answer)

Future

Persistent Memory

↓

Pinned Chats

↓

Conversation Threads

↓

Search

↓

Bookmarks

---

## providers.js

Current Providers

Local

OpenAI

Claude

Gemini

Ollama

OpenRouter

Future

Azure

Anthropic Enterprise

Custom Company Models

Local Quantized Models

---

## renderer.js

Purpose

Convert responses into UI.

Responsibilities

Markdown

↓

Cards

↓

Tables

↓

Code

↓

Streaming

↓

Commands

---

## streaming.js

Current

Animated Reveal

Future

Token Streaming

Cancellation

Backpressure Handling

Latency Tracking

---

## tools.js

Current

Scroll

Highlight

Open Links

Download Résumé (canonical `triggerResumeDownload()` flow, shared with `main.js`'s static résumé buttons)

Future

Copy

Search

Navigate

Bookmark

---

## jdmatch.js

Purpose (Sprint 3)

Analyze a pasted job description — pure data in, structured data out.

Responsibilities

- `looksLikeJobDescription(text)` — length + posting-shape heuristic, used by `assistant.js`'s intent classifier
- `analyzeJobDescription(jdText)` — detects requested skills against `content.js`'s `SKILLS_TAXONOMY`, cross-references `STACK` for matched/missing, ranks `PROJECTS` by stack overlap, and pulls talking points only from existing `PROJECTS[].decisions`

Deliberately provider-agnostic and UI-agnostic: never calls a provider, never touches the DOM. `providers.js`'s `_jdMatchResponse` is the only consumer, and owns turning this module's structured result into response text.

---

## interview.js

Purpose (Sprint 3)

Own interview-session state and progression — pure state machine, in-memory only (not persisted, like `awareness.js`).

Responsibilities

- `start()` / `handleTurn()` — resolve a topic, hand back the next question, score an answer's keyword coverage, produce a session summary
- `isActive()` / `getProgress()` / `reset()` — session introspection and control

Deliberately provider-agnostic and UI-agnostic: never calls a provider, never renders markdown/HTML. `assistant.js`'s mode gate is the only caller, and owns formatting this module's structured events (`question` / `feedback` / `summary` / `exited` / `awaiting-topic`) into response text — mirroring how `providers.js` formats `jdmatch.js`'s output.

---

## conversation.js

Purpose (Conversation Intelligence)

Decide the *conversational move* a query represents — before knowledge retrieval runs, not after. Pure classification, no side effects.

Responsibilities

- `analyzeStrategy(query, ctx)` — returns `{ move, scope, projectId, entities, category }`, where `move` is one of `greeting` / `identity` / `comparison` / `opinion` / `experience` / `explanation` / `factual`
- For `comparison`/`opinion`, extracts named technologies by reusing `jdmatch.js`'s `matchTaxonomyEntities()` against `content.js`'s `SKILLS_TAXONOMY` — no duplicated alias-matching logic
- For `explanation` (only when `assistant.js`'s `classifyIntent()` already said `'architecture'`), disambiguates `scope` (`'portfolio'` vs. `'project'`) from an explicit project mention → portfolio-signaling words ("overall", "whole system"...) → conversational context (`memory.lastProject` / `focusProject` / `awareness.currentProject`) → a safe default of `'portfolio'`

Deliberately provider-agnostic and UI-agnostic: never calls a provider, never touches the DOM, never calls `retrieve()`. Every detector requires a high-confidence signal; anything ambiguous returns `move: 'factual'`, which is a no-op for the rest of the pipeline — `providers.js`'s pre-existing retrieval-first logic runs exactly as it did before this module existed. `assistant.js`'s step 5 is the only caller; `providers.js`'s `LocalProvider.generate()` is the only consumer of its output.

---

## persona.js

Purpose (Conversation Intelligence)

Hold authored conversational content that is *not* portfolio data: the assistant's own identity/capability description, and its engineering opinions on well-known technology trade-offs. Pure data, no logic — mirrors how `content.js` is pure data for portfolio facts.

Responsibilities

- `ASSISTANT_CAPABILITIES` — a short list of `{ icon, label, desc }` entries describing what the assistant itself can do (used by `_identityResponse`)
- `TECH_TAKES` — comparison/opinion entries (`category`, `techs`, `preference`, `dimensions`, `evidence`) for a small set of well-known pairs (Flask vs. FastAPI, PostgreSQL vs. MongoDB, React vs. Vue), each cross-checked against real `PROJECTS[].stack` data at write time; where no shipped project explicitly uses a technology, that gap is stated honestly (`groundingNote`) rather than invented

Deliberately kept **out of `content.js`** — `content.js`'s single-source-of-truth charter is portfolio data only (what Sudhanshu built), and this module's charter is the assistant's own voice, which is categorically different and must never be confused with a portfolio fact. `content.js` never imports from `persona.js`; the dependency is one-way. `providers.js`'s new composer methods are the only consumer.

---

# Application Lifecycle

```
Browser Loads

↓

index.html

↓

Import Map

↓

main.js

↓

Scene Initialized

↓

Sections Rendered

↓

Core Systems

↓

Assistant

↓

Ready
```

The lifecycle is intentionally linear.

This minimizes startup complexity.

---

# Assistant Lifecycle

```
User Input

↓

Intent Detection

↓

Visitor Detection

↓

Conversation Strategy

↓

Knowledge Search

↓

Provider

↓

Streaming

↓

Render

↓

Memory Update

↓

Suggested Questions
```

Each stage is isolated.

Errors should never propagate across modules.

Sprint 3 added a **mode gate** ahead of Intent Detection: while `assistant/interview.js` reports an active session, every turn is routed straight to it and the rest of this lifecycle (knowledge search, provider, proactive tools) is skipped entirely for that turn.

The Conversation Intelligence upgrade added **Conversation Strategy** (`assistant/conversation.js`) between Visitor Detection and Knowledge Search: it decides the conversational *move* (greeting/identity/comparison/opinion/experience/explanation-scope/factual) first, so Knowledge Search supports the answer instead of a keyword-scoring race deciding it outright. When the move is inconclusive, this stage is a no-op and Knowledge Search behaves exactly as it did before this stage existed.

---

# Data Flow

```
content.js

↓

sections.js

↓

DOM

↓

User

↓

Assistant

↓

knowledge.js

↓

Provider

↓

Renderer

↓

DOM
```

All knowledge originates from content.js.

This ensures consistency across both the UI and the assistant.

---

# State Management

Unlike React applications, state is distributed across modules.

Types of state

## UI State

DOM classes

Examples

```
.is-open

.is-focused

.is-expanded

.is-visible
```

---

## Assistant State

Conversation

Visitor

Memory

Workspace

---

## Scene State

Camera

Mouse

Animation

Particles

---

## Global State

Only

```
window.__lenis
```

is intentionally shared.

Global variables should remain extremely limited.

---

# Rendering Strategy

The project follows **progressive rendering**.

Sequence

```
Boot

↓

Critical UI

↓

Scene

↓

Assistant

↓

Animations
```

Heavy systems initialize only after the base interface exists.

This improves perceived performance.

---

# Error Handling Strategy

Sprint 2 introduced `src/log.js` — a small, single-purpose helper (`logWarn`/`logError`) that every existing call site now routes through, so console output is consistently formatted instead of ad-hoc per module.

Remaining future improvements should continue to centralize error handling for:

- Provider failures
- Rendering failures
- Missing assets
- Navigation errors
- Storage failures

Errors should degrade gracefully without breaking the application.

---

# Scalability

The architecture scales well for a portfolio-sized application.

Recommended future evolution:

### Stage 1

Split `content.js` into domain-specific files.

### Stage 2

Introduce a serverless backend for secure LLM access.

### Stage 3

Replace keyword retrieval with hybrid retrieval.

### Stage 4

Persist conversation history.

### Stage 5

Introduce analytics and monitoring.

These enhancements preserve the existing architecture rather than replacing it.

---

# Architectural Strengths

- Excellent modularity.
- Clear separation of concerns.
- Zero-build simplicity.
- Data-driven rendering.
- Strong assistant subsystem.
- Maintainable code organization.
- Low dependency footprint.

---

# Architectural Risks

- `content.js` will become difficult to maintain as content grows.
- No schema validation for structured data.
- Client-side provider configuration is unsuitable for production.
- Heavy graphics are always loaded regardless of device capability.

These are evolutionary concerns rather than architectural flaws.

---

# Final Architectural Assessment

The architecture demonstrates engineering maturity beyond what is typically expected of a personal portfolio.

Its strongest qualities are simplicity, modularity, and intentional design.

Future development should focus on extending this foundation through incremental improvements rather than introducing unnecessary frameworks or large-scale rewrites.

---

**End of PROJECT_ARCHITECTURE.md**