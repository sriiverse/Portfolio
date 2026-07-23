# SRIIVERSE AI 2.0 — Implementation Plan

The goal is to evolve SRIIVERSE AI from a capable side-panel chatbot into the **intelligent operating system of the portfolio** — a Jarvis-grade AI workspace that thinks in systems, controls the website live, and feels like talking directly to Sudhanshu Sinha.

---

## Architecture Overview

```
Visitor Query
    ↓
[Website Awareness Layer]  ←── Scroll position, visible section, open projects
    ↓
[Intent + Recruiter Profiler]  ←── Classify intent + build visitor profile
    ↓
[Context Resolver]  ←── Pronoun resolution, topic continuity, focus project
    ↓
[Knowledge Retrieval]  ←── RAG from content.js knowledge index
    ↓
[Provider Layer]  ←── Local (smart composer) OR Real LLM (Gemini/OpenAI/Claude/Ollama)
    ↓
[Tool Orchestrator]  ←── Decide website actions proactively, not just on commands
    ↓
[Rich Response Renderer]  ←── Premium structured sections with tabs, cards, action buttons
    ↓
[Dynamic Workspace UI]  ←── Side panel → expanded workspace → focus mode transitions
    ↓
[Follow-up Engine]  ←── Contextual next steps based on visitor profile
```

---

## User Review Required

> [!IMPORTANT]
> **Provider Selection**: The hybrid model means SRIIVERSE AI will first check `window.SRIIVERSE_AI_CONFIG` for a real LLM key. If none is set, it falls back to the enhanced local provider. No code changes are needed to activate a real LLM later — just drop a config object on the page.

> [!IMPORTANT]
> **No Breaking Changes**: Every existing HTML element ID, CSS class name, and public API (`window.SRIIVERSE_AI`) is preserved. This is an evolution, not a replacement. All v1/v2 architecture is retained and upgraded.

> [!WARNING]
> **CSS Additions**: The new workspace mode (panel → split-view → focus mode) requires ~400 new CSS lines. These are additions only — no existing styles are removed.

---

## Open Questions

> [!NOTE]
> **Resume PDF**: `PROFILE.resume` points to `./assets/resume.pdf` which is currently a placeholder. When the resume is dropped in, the "Download Resume" tool will automatically work. No code changes needed.

> [!NOTE]
> **LLM API Keys**: To activate a real LLM provider at any time, add this script tag before `main.js`:
> ```html
> <script>
>   window.SRIIVERSE_AI_CONFIG = { provider: 'gemini', apiKey: 'YOUR_KEY' };
> </script>
> ```

---

## Proposed Changes

### Component 1: Website Awareness Engine

The assistant currently has zero awareness of where the visitor is. This is the most foundational upgrade.

---

#### [NEW] `src/assistant/awareness.js`

A real-time observer that tracks:
- **Current visible section** (using `IntersectionObserver` on all `[id]` sections)
- **Current scroll position** and scroll velocity
- **Last project viewed** (which project card is in the viewport)
- **Time spent on each section** (to infer interest)
- **Page state** (`loading | browsing | reading | engaged`)

Exposes a singleton `awareness` object consumed by `assistant.js` during query processing:
```js
awareness.currentSection    // 'projects' | 'about' | 'architecture' | ...
awareness.currentProject    // 'queryforge' | 'reporadar' | null
awareness.sessionTime       // ms since page load
awareness.sectionHistory    // ['hero', 'about', 'projects', ...]
awareness.getContext()      // Structured snapshot for prompt injection
```

---

### Component 2: Visitor / Recruiter Intelligence

> [!NOTE]
> The assistant will build a visitor profile silently across the conversation. No data leaves the browser — this is all in-memory.

#### [MODIFY] `src/assistant/memory.js`

Extend `Memory` with a `VisitorProfile` model:
```js
memory.profile = {
  type: 'unknown' | 'recruiter' | 'engineer' | 'founder' | 'student',
  focusArea: 'backend' | 'ai' | 'database' | 'frontend' | 'fullstack',
  projectsViewed: Set,       // which projects they've asked about
  questionsAsked: number,    // engagement depth
  interests: Set,            // topics mentioned (sql, llm, fastapi, etc.)
  inferredRole: string,      // e.g. "backend recruiter", "SDE evaluator"
}
```

Profile is updated on every turn by analyzing the user's vocabulary. A "backend recruiter" asking about Python APIs gets steered toward QueryForgeAI backend decisions. A "startup founder" asking about shipping gets steered toward the full product story.

---

### Component 3: Proactive Tool Orchestration

Currently tools only fire when the user explicitly says "open" / "show me" / "navigate". This must change.

#### [MODIFY] `src/assistant/tools.js`

Add **proactive tool decisions**:
- When the assistant answers about **any named project** → automatically scroll + highlight that project card in the background
- When answering about **architecture** → scroll to the architecture section
- When answering about **tech stack** → subtly highlight the relevant orbs in the stack section
- When answering about **contact/hire** → scroll to contact section

The orchestrator will call a new `runProactiveTool(intent, focusProject, knowledge)` function that decides whether to trigger a background action alongside the text response.

Also add new tools:
- `downloadResume` — triggers the resume PDF download
- `compareProjects` — scrolls to projects and highlights two project cards simultaneously
- `highlightTechOrbs` — highlights specific tech orbs in the stack section by technology group

---

### Component 4: Enhanced Local Provider

The current `LocalProvider` returns basic markdown. It must produce structured, premium responses.

#### [MODIFY] `src/assistant/providers.js`

The `LocalProvider` will be rewritten to produce **structured responses** in a defined schema:

```
## {ProjectName}
**{tagline}**

### 🎯 What it does
{problem + solution paragraph}

### 🏗️ How it's built  
{engineering decisions as numbered list}

### ⚡ Technology Stack
{stack chips with rationale}

### 💡 Engineering Decisions
- Why {tech A} over {tech B}?
- {decision 2}
- {decision 3}

### 🔗 Live
[Open Demo](url) · [GitHub](url)
```

This structured format is always grounded in `content.js` data — never invented. The same `buildGroundedPrompt` system passes this structure as the system prompt to real LLMs so they follow the same format.

**Recruiter-specific path**: When `memory.profile.type === 'recruiter'`, responses include a "Why this matters for you" section mapping the project to the recruiter's likely hiring need.

---

### Component 5: Dynamic AI Workspace UI

This is the most visible change. The assistant evolves through **three states**:

#### State 1 — Compact Panel (default, current behavior)
Side panel, 380px wide. Opens on FAB click. Unchanged from current.

#### State 2 — Expanded Workspace (new)
When a conversation becomes multi-turn (2+ exchanges), a subtle expand button appears. Clicking it widens the panel to ~600px and reveals:
- A **Visitor Profile Badge** (inferred role + interest area)
- **Tabbed response cards** (Overview / Architecture / Stack / Decisions)
- **Website Mirror Preview** — a miniature live preview showing where the assistant is currently navigating
- **Action Command Bar** — quick-access buttons for "Open Demo", "View GitHub", "Download Resume", "Compare Projects"

#### State 3 — Focus Mode (new)
A `[⊞ Focus]` button triggers focus mode:
- The assistant panel expands to 50vw
- The portfolio behind it dims (30% opacity) but remains interactive
- The conversation area becomes taller with more breathing room
- A "Close Focus" button or `Escape` returns to Expanded Workspace

**Transitions**: All three states use CSS transitions (300ms ease) and respect `prefers-reduced-motion`. No GSAP dependency for panel transitions.

---

#### [MODIFY] `index.html`

Add to the `<aside class="assistant">` element:
- A workspace expand button (`assistant__expand`)
- A focus mode button (`assistant__focus`)
- A visitor profile badge (`assistant__profile`) — hidden until profile is inferred
- A quick-action command bar (`assistant__commands`)
- A thinking visualization upgrade (steps shown as animated cards instead of dots)

The HTML panel grows by ~30 lines but remains semantic.

---

#### [MODIFY] `src/styles.css`

Add four new CSS blocks (~400 lines total, zero removals):

1. **`/* === WORKSPACE STATES === */`** — panel width transitions, backdrop blur, split-view layout
2. **`/* === VISITOR PROFILE BADGE === */`** — animated role label in panel header  
3. **`/* === RICH RESPONSE CARDS === */`** — tabbed project card with Overview/Architecture/Stack tabs
4. **`/* === COMMAND BAR === */`** — quick-access action button row with glow effects
5. **`/* === FOCUS MODE === */`** — portfolio dim overlay, expanded panel, ESC handler

---

### Component 6: Enhanced Response Renderer

#### [MODIFY] `src/assistant/renderer.js`

Add new render functions:
- `renderTabbedProjectCard(project)` — a tabbed card with Overview / Architecture / Stack / Decisions tabs (pure CSS tabs, no JS)
- `renderCommandBar(actions)` — renders a row of glowing action buttons
- `renderVisitorProfile(profile)` — renders the inferred visitor profile badge
- `renderThinkingSteps(steps)` — replaces the dot animation with animated reasoning-step cards that light up sequentially:
  ```
  ✓ Understanding intent...
  ✓ Reading context...
  ⟳ Retrieving knowledge...
  ○ Generating response...
  ```
- `renderComparisonCard(projectA, projectB)` — side-by-side comparison of two projects for "compare X and Y" queries

---

### Component 7: Main Orchestrator Upgrade

#### [MODIFY] `src/assistant.js`

The pipeline expands to:

```
1. INTENT         — classify query
2. AWARENESS      — inject current website state (new)
3. CONTEXT        — resolve pronouns + focus
4. PROFILE        — update visitor profile (new)
5. KNOWLEDGE      — retrieve relevant docs
6. MEMORY         — inject conversation history
7. PROACTIVE TOOL — decide background website action (new)
8. PROVIDER       — generate response (local or LLM)
9. TOOL EXECUTION — run decided tools
10. RICH RESPONSE — stream + render structured response
11. WORKSPACE     — update panel state if needed (new)
12. FOLLOW-UPS    — contextual suggestions based on profile (new)
```

New follow-up logic uses `memory.profile` to suggest the most relevant next question for this specific visitor type.

---

## File Change Summary

| File | Change | Reason |
|---|---|---|
| `src/assistant/awareness.js` | **[NEW]** | Website awareness engine |
| `src/assistant/memory.js` | **[MODIFY]** | Add VisitorProfile model |
| `src/assistant/providers.js` | **[MODIFY]** | Rich structured LocalProvider |
| `src/assistant/tools.js` | **[MODIFY]** | Proactive tools + 3 new tools |
| `src/assistant/renderer.js` | **[MODIFY]** | Tabbed cards, command bar, thinking steps |
| `src/assistant.js` | **[MODIFY]** | Full pipeline upgrade |
| `index.html` | **[MODIFY]** | Workspace mode HTML additions |
| `src/styles.css` | **[MODIFY]** | Workspace CSS additions |

---

## Verification Plan

### Automated Tests
No build tooling → manual verification via browser DevTools console and live testing.

### Manual Verification Checklist

**Awareness**
- [ ] Open DevTools, type `window.SRIIVERSE_AI.awareness.getContext()` — should return current section

**Conversations**
- [ ] Ask "Tell me about RepoRadar" → assistant navigates + highlights the RepoRadar card automatically
- [ ] Follow up "Why FastAPI?" → assistant understands context is still RepoRadar without re-asking
- [ ] Ask "Compare QueryForge and RepoRadar" → comparison card renders, both projects scroll into view
- [ ] Ask "Why hire Sudhanshu?" as a second message → recruiter profile badge appears in panel

**Workspace States**
- [ ] After 2 exchanges → expand button becomes visible
- [ ] Click expand → panel smoothly widens, command bar appears
- [ ] Click Focus → portfolio dims, panel expands further
- [ ] Press Escape → returns to expanded workspace
- [ ] Test on mobile → compact panel only, workspace mode disabled

**Providers**
- [ ] Set `window.SRIIVERSE_AI_CONFIG = { provider: 'gemini', apiKey: '...' }` → responses use Gemini
- [ ] Remove config → reverts to local provider seamlessly

**Rich Responses**
- [ ] Project responses show tabbed card (Overview / Architecture / Stack tabs work)
- [ ] Citations point to correct portfolio sections when clicked
- [ ] Thinking animation shows sequential step labels

**Recruiter Intelligence**
- [ ] Ask "I'm looking for a backend Python engineer" → profile badge shows "Backend Recruiter"
- [ ] Subsequent follow-ups prioritize backend-focused project context


---

# NEW SECTION: AI Behavioral Model (Critical)

## Why this section exists

The previous implementation plan explains **how the assistant is built**.
This section explains **how the assistant should think**.

SRIIVERSE AI is not simply a chatbot. It is the digital representation of Sudhanshu Sinha and should guide visitors through the portfolio exactly as Sudhanshu would during a technical interview or project walkthrough.

## Core Identity

- Not ChatGPT.
- Not customer support.
- Not a FAQ bot.
- The intelligence layer of the portfolio.
- The primary interface through which visitors experience the website.

## Primary Objectives

1. Help visitors understand Sudhanshu's engineering ability.
2. Recommend the most relevant projects based on inferred intent.
3. Explain engineering decisions, not just features.
4. Control the portfolio whenever visual demonstrations improve understanding.
5. Ground every answer in verified portfolio knowledge.
6. End every response with meaningful next steps.

## Behavioral Principles

The assistant should be:

- Proactive instead of reactive.
- Context-aware instead of keyword-driven.
- Explanatory instead of descriptive.
- Honest when information is unavailable.
- Helpful without becoming intrusive.

## Reflection Engine

Before every response perform:

Intent
→ Website Awareness
→ Conversation Memory
→ Knowledge
→ Reasoning
→ Reflection
→ Response

Reflection should consider:

- Is this the best answer?
- Would another project better demonstrate the requested skill?
- Should I automatically navigate the portfolio?
- Would a comparison or diagram improve understanding?
- Should I ask a follow-up question?

## Initiative

The assistant should occasionally guide visitors.

Examples:

- Suggest explaining RepoRadar architecture after detecting sustained interest.
- Recommend backend projects to backend recruiters.
- Recommend QueryForge for SQL-focused discussions.
- Recommend Placement Pro for full-stack discussions.

## Knowledge Graph

Model relationships instead of isolated content.

Project ↔ Technology

Project ↔ Skill

Project ↔ Architecture

Project ↔ Challenge

Project ↔ Deployment

Project ↔ GitHub

This enables intelligent reasoning such as:

"Which project demonstrates FastAPI?"

or

"Compare all backend projects."

## Response Philosophy

Every answer should explain:

- What
- Why
- How
- Trade-offs
- Lessons learned
- Why it matters to the current visitor

## Expanded Definition of Success

Visitors should not think:

"This portfolio has a chatbot."

They should think:

"I just had a conversation with the engineer who built these systems."

The assistant should become the defining feature of SRIIVERSEAI.
