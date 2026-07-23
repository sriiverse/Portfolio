# Conversation Intelligence Plan — SRIIVERSEAI

> Status: **APPROVED — implementation in progress.**
>
> This document was produced by reading the live, post–Sprint 3 repository — `src/assistant.js`, `src/assistant/knowledge.js`, `src/assistant/providers.js`, `src/assistant/memory.js`, `src/assistant/awareness.js`, `src/assistant/jdmatch.js`, `src/content.js` — line by line, and by hand-tracing the exact scoring math for all four reported examples against the real data in `content.js`. Every root cause below is a **reproduced, deterministic finding**, not a guess.
>
> **Approved with two refinements to the original draft:**
> 1. The new Conversation Strategy module is named `src/assistant/conversation.js` (not `strategy.js`), to better reflect its responsibility and read naturally alongside `knowledge.js`, `memory.js`, `awareness.js`.
> 2. Authored conversational prose (assistant identity/capabilities, framework opinions, comparison templates) is **not** added to `content.js`. `content.js` remains the single source of truth for **portfolio data only**. A new dedicated module, `src/assistant/persona.js`, holds this authored conversational content instead. Both refinements are reflected throughout this document.

---

# Problem Analysis

## 1. The real pipeline today (not the documented one)

`assistant.js`'s header describes a 12-step pipeline, and step 1 is "INTENT". In practice, intent is classified — and then almost entirely **ignored** for routing purposes. The actual decision-maker is `knowledge.js`'s `retrieve()`, called unconditionally inside `providers.js`:

```95:131:src/assistant/providers.js
async generate(query, ctx = {}) {
    await sleep(280 + Math.random() * 220);

    // Job Description Matching short-circuits retrieval entirely — it's a
    // scoring operation over the raw pasted text, not a knowledge lookup.
    if (ctx.intent === 'jd-match') return this._jdMatchResponse(query);

    const hits = retrieve(query, 5);
    if (!hits.length) {
      return { text: this._fallback(ctx), sources: [], kind: 'text', payload: null };
    }

    const top = hits[0].doc;
    const intent = ctx.intent || 'question';
    ...
    // Route by top document kind
    if (top.kind === 'project' || top.kind === 'project-arch' || top.kind === 'project-stack') { ... }
    if (top.kind === 'stack') return this._stackResponse(hits);
    if (top.kind === 'arch' || top.kind === 'arch-overview') return this._archResponse(top, hits);
    if (top.kind === 'recommend') return this._recommendResponse(top, ctx);
    if (top.kind === 'profile') return this._profileResponse(top, ctx);
    if (top.kind === 'resume') return this._resumeResponse(hits);

    // Comparison query detection
    if (/compare|vs\.?|versus|difference between/i.test(query)) {
      return this._comparisonResponse(query, hits);
    }
    ...
```

`ctx.intent` (the output of `classifyIntent()`) is read in exactly **three** narrow places in the whole file: inside `_projectResponse` (to pick architecture vs. stack vs. full narrative, but only once a project doc has already won retrieval), inside `_recommendResponse` (to decide the recruiter framing), and inside `_comparisonResponse`'s caller. Everywhere else, **the winning document's `kind` field is the router**, and that document is chosen purely by keyword/stem overlap scoring. This is precisely the "keyword retrieval engine" feeling described in the request — intent exists, but it never gets a vote on *whether retrieval should even run* or *what to do when retrieval returns nothing/the wrong thing*.

## 2. Root cause, traced per example

### Example 1 — "Who are you?" → falls back to "I didn't quite catch that"

`classifyIntent()` actually classifies this correctly:

```138:138:src/assistant.js
if (/who|about|introduce|background/.test(q)) return 'profile';
```

The bug is downstream, in `knowledge.js`'s tokenizer:

```15:30:src/assistant/knowledge.js
const STOP = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being',
  'to','of','in','on','for','with','about','as','by','at','from','it','its',
  'this','that','these','those','i','you','he','she','they','we','me','my','your',
  'his','their','our','do','does','did','can','could','would','should','will',
  'what','which','who','whom','how','why','when','where','tell','show','explain',
  'me','please','help','know','like','want','need','have','has','had','there','here',
]);
...
function tokenize(s) {
  return normalize(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
}
```

`"who"`, `"are"`, and `"you"` are **all three** in `STOP`. `tokenize("Who are you?")` returns `[]`. And:

```248:251:src/assistant/knowledge.js
export function retrieve(query, limit = 4) {
  const queryTokens = tokenize(query);
  const queryStems = new Set(queryTokens.map(stem));
  if (!queryTokens.length) return [];
```

`retrieve()` returns `[]` unconditionally whenever a query is composed entirely of function words — which is exactly what greetings and identity questions look like. Back in `providers.js`, `hits.length === 0` triggers the hardcoded fallback **before `ctx.intent` is ever read**. `classifyIntent` correctly said "profile", and it was never consulted. This is 100% reproducible for *any* phrasing that happens to tokenize to nothing (`"who are you"`, `"what are you"`, `"tell me about yourself"` — "tell" is also a stopword).

### Example 2 — "What backend framework do you prefer?" → returns backend architecture doc

Tokenizes to `['backend','framework','prefer']` (real tokens survive, so retrieval *does* return hits). Those tokens tag-match the generic `stack` and `arch-*` docs, so `top.kind` becomes `'stack'` or `'arch'`, and `_stackResponse()`/`_archResponse()` render — both are **factual inventory templates**. Nothing in `generate()` distinguishes *"list what you know"* (factual) from *"tell me your personal take between two named options"* (opinion/recommendation) — because that distinction doesn't exist anywhere in the routing logic. The query *type* (opinion vs. fact) is invisible to the system; only the query's *topic* (backend) is visible, via keyword overlap.

### Example 3 — "Compare Flask vs FastAPI" → returns Technology Stack

`classifyIntent` does detect this as `'comparison'`, and `generate()` does call `_comparisonResponse(query, hits)` — but only as a **last resort**, after `top.kind` fails to match `project|project-arch|project-stack|stack|arch|arch-overview|recommend|profile|resume` (line 118-122 above) — and in this case `top.kind` for this query resolves to `'stack'` first, on line 118: `if (top.kind === 'stack') return this._stackResponse(hits);` — so `_comparisonResponse` is **never even reached**, confirmed by re-reading the routing order. Even in the case where it *is* reached, its own implementation only understands project-vs-project comparisons:

```473:476:src/assistant/providers.js
_comparisonResponse(query, hits) {
    const q = query.toLowerCase();
    const projects = getAllProjects();
    const found = projects.filter((p) => q.includes(p.id) || q.includes(p.name.toLowerCase()));

    if (found.length >= 2) { ... }
    return { text: hits[0]?.doc.text || 'Could not compare.', sources: [], kind: 'text', payload: null };
```

"Flask" and "FastAPI" are `STACK` entries, not `PROJECTS`, so `found.length` is `0`, and the function silently degrades to `hits[0].doc.text` — the same top-scored `stack` doc. Two independent bugs compound here: (a) the routing order lets `stack`-kind docs win before comparison intent is even checked, and (b) the comparison feature's scope was implicitly limited to "two projects" and has no tech-vs-tech capability at all.

### Example 4 — "Explain the architecture" → sometimes returns a project's architecture instead of the portfolio's

This one is the most subtle, and it is **fully deterministic**, not session-dependent. Hand-tracing `scoreDoc()` for the single-token query `architecture` (queryTokens tokenize to `['architecture']` only — "explain" and "the" are both stopwords):

| Doc | tag hit (×3.0) | title hit (×2.0) | body freq (×0.6/match) | kindWeight | **Final score** |
|---|---|---|---|---|---|
| `arch-overview` | 3.0 | 2.0 | **0** (body text never repeats the word "architecture" — see below) | **0.9** | **4.5** |
| `project-arch-queryforge` | 3.0 | 2.0 | 0 | 0.95 | 4.75 |
| `project-arch-placementpro` | 3.0 | 2.0 | 0 | 0.95 | 4.75 |
| `project-arch-reporadar` | 3.0 | 2.0 | **0.6** (decisions text literally contains "architecture" — see below) | 0.95 | **5.32** |

`arch-overview`'s body text is authored without ever repeating the word "architecture":

```145:145:src/assistant/knowledge.js
text: `The five-layer topology: ${ARCHITECTURE.map((n) => n.label).join(' → ')}. Every project follows this: ... The AI is a reasoning layer over real data, never a blind text generator.`,
```

Meanwhile RepoRadarAI's `decisions` array (content.js) happens, incidentally, to contain the literal word:

```125:129:src/content.js
decisions: [
  'Shipped on Vercel with a FastAPI backend — a clean split between the React intelligence surface and the Python AI core.',
  'Open-source friendly: the engine lives at github.com/sriiverse/RepoRadar.',
  'Intelligence is layered — summary, then architecture, then deep code explanation — so users descend at their own pace.',
],
```

So for **every single visitor**, on the **first-ever, most generic possible phrasing** of "explain the architecture," `project-arch-reporadar` mathematically outscores the general `arch-overview` doc by 5.32 vs. 4.5 — and even without that incidental match, `kindWeight` alone (0.95 vs. 0.9) guarantees any project-arch doc beats the overview on a tie. The system has no concept of *"this question didn't name a project, so it probably means the portfolio as a whole"* — it just lets fuzzy scoring, and an unrelated turn of phrase in unrelated prose, decide.

## 3. The meta-finding

All four examples trace back to the same architectural gap: **there is exactly one routing signal — the top-scored document's `kind` — and it fires only *after* keyword retrieval has already run and already picked a winner.** `classifyIntent()`'s output is real and mostly correct, but it is consulted too late, too narrowly, and never as the primary decision of *whether retrieval should run at all*, *what it should be scoped to*, or *what kind of answer (fact vs. opinion vs. comparison vs. self-description) is being requested*. Knowledge retrieval is structurally *in front of* conversational reasoning instead of *behind* it.

---

# Architecture

## Proposed pipeline

```
User
 ↓
1. INTENT              classifyIntent()              — UNCHANGED
 ↓
2. AWARENESS           buildAwarenessContext()       — UNCHANGED
 ↓
3. CONTEXT             resolveContext()               — UNCHANGED
 ↓
4. PROFILE             memory.profile                 — UNCHANGED
 ↓
5. CONVERSATION STRATEGY   analyzeStrategy()  ← NEW STEP, NEW MODULE (conversation.js)
 ↓
6+7. KNOWLEDGE + MEMORY (inside provider, now strategy-aware)
 ↓
8. PROACTIVE TOOL       — UNCHANGED
 ↓
9. PROVIDER             provider.generate() ← EXTENDED, not rewritten
 ↓
10. TOOL EXECUTION      — UNCHANGED
 ↓
11. RICH RESPONSE       — UNCHANGED
 ↓
12. WORKSPACE           — UNCHANGED
 ↓
13. FOLLOW-UPS          buildFollowups() ← lightly extended (optional phase)
 ↓
Render
```

This is the exact shape requested — `Intent → Conversation Strategy → Knowledge Retrieval → Response Composition → Render` — inserted as **one new step** into the existing 12-step pipeline (making it 13), immediately after `PROFILE` (step 4), because Strategy needs `focusProject`, `memory`, and `awareness` state that are only available once steps 2–4 have run.

## Why two new modules — and why only two

Per the explicit instruction to prefer extension over new files, each existing module was checked against these two responsibilities:

| Module | Could it own "decide the conversational move + scope"? | Could it own "authored conversational prose (identity, opinions, comparisons)"? | Verdict |
|---|---|---|---|
| `knowledge.js` | No — its job is text→score→doc retrieval over **portfolio data**. Teaching it about "greeting" or "opinion" would make it stop being a pure retrieval index. | No — it indexes `content.js`'s portfolio data; it has no concept of assistant self-description or opinion. | Extend narrowly (one new export), don't add strategy or persona logic |
| `content.js` | No. | **No — this is the key refinement.** `content.js`'s entire charter is "single source of truth for **portfolio data**" (`PROFILE`, `PROJECTS`, `STACK`, `ARCHITECTURE`, `JOURNEY`, `STATS`). The assistant's own identity blurb, its opinion about Flask vs. FastAPI, and comparison templates are not portfolio facts — they're the assistant's *authored voice*. Adding them here would blur "what Sudhanshu built" with "what the assistant says about itself," which is exactly the mixing the refinement asks to avoid. | **Do not modify.** New authored content gets its own module. |
| `providers.js` | No — its job is turning *already-decided* inputs into response text/markdown. It's the right place to *consume* strategy + persona data, not to *compute* or *author* them. | Partially — it already contains some hardcoded narrative (e.g. `_archResponse`'s five-layer prose), but that's presentation glue around portfolio facts, not free-standing authored opinion content reused across multiple composers. | Extend (new composer methods + one new branch); import persona data rather than inlining it |
| `assistant.js` | Partially — it already owns `classifyIntent()`. But `classifyIntent()` is a topic classifier (recruiter/stack/project/…), not a conversational-move + scope-disambiguation engine, and this file already carries the entire pipeline, `Workspace`, `buildFollowups`, and interview-event formatting. | No. | Add 3–4 lines to call the new module; don't inline the logic |
| `memory.js` | No new fields needed — `activeTopic` and `lastProject` (added in Sprint 3) are already exactly the conversational-context signals scope disambiguation needs. | No. | **Zero changes** — pure reuse |
| `jdmatch.js` | Close, but its responsibility is JD-scoring, not general conversation strategy. It does, however, already contain the *exact* alias-matching primitive (`SKILLS_TAXONOMY` lookup) that strategy needs for entity extraction. | No. | Extend by exporting one existing internal helper; no logic duplicated |

Conclusion: **two genuinely new responsibilities exist, and neither fits an existing module's charter without either violating single-responsibility or blurring the portfolio-data/authored-voice boundary:**
1. "Decide the conversational move and disambiguate scope, before retrieval runs" → `src/assistant/conversation.js` (renamed from the draft's `strategy.js`, per refinement 1).
2. "Hold authored conversational prose that isn't portfolio data — assistant identity/capabilities, framework opinions, comparison templates" → `src/assistant/persona.js` (new, per refinement 2).

Both are deliberately small, single-purpose files, following the exact contract already established by `jdmatch.js` and `interview.js`: no rendering, no DOM, no provider calls, no network. `conversation.js` is pure classification logic (functions, no data). `persona.js` is pure data (constants, no logic) — mirroring how `content.js` itself is pure data and `knowledge.js` is the logic that reads it.

## Module responsibility after this change

```
conversation.js →  WHAT kind of conversational move is this, and what scope?    (NEW, pure classification)
persona.js      →  WHAT does the assistant itself say about identity/opinions?   (NEW, pure authored data)
knowledge.js    →  WHAT grounded portfolio facts exist for a query?              (unchanged, + 1 reused export elsewhere)
content.js      →  WHAT is the portfolio's ground truth data?                    (UNCHANGED — no additions)
providers.js    →  HOW do we compose an answer, given strategy + facts + voice?  (extended: new composers)
assistant.js    →  ORCHESTRATES the above, in order                             (extended: 1 new pipeline step)
memory.js       →  WHAT has already been discussed?                             (unchanged, reused as-is)
```

No module gains a second responsibility; each new module has exactly one, and `content.js`'s "portfolio data only" charter is preserved exactly as the refinement requires.

---

# Data Flow

Concrete walkthroughs under the new architecture, for the four reported examples.

## "Who are you?"

1. `classifyIntent` → `'profile'` (unchanged).
2. `analyzeStrategy("Who are you?", {...})` (in `conversation.js`) → anchors on `IDENTITY_RE` → `{ move: 'identity', scope: null, entities: [], category: null }`.
3. `provider.generate(query, { ..., strategy })` — the new strategy-routing block at the top of `LocalProvider.generate()` sees `strategy.move === 'identity'` and calls `_identityResponse(ctx)` **directly** — `retrieve()` is never called, so the empty-tokenization bug can't fire.
4. `_identityResponse` composes from `getProfile()` (portfolio fact, via `knowledge.js`/`content.js`) + `persona.js`'s `ASSISTANT_CAPABILITIES` (authored voice, not a portfolio fact) — grounded, deterministic, always succeeds.

## "What backend framework do you prefer?"

1. `classifyIntent` → `'stack'` (unchanged — harmless, since strategy now takes priority).
2. `analyzeStrategy` → `OPINION_RE` matches "prefer"; no explicit tech named, but `CATEGORY_HINTS['backend-framework']` matches "backend framework" → `{ move: 'opinion', scope: null, entities: [], category: 'backend-framework' }`.
3. `generate()` sees `strategy.move === 'opinion'` → `_opinionResponse(strategy, ctx)`.
4. Looks up `persona.js`'s `TECH_TAKES` by `category === 'backend-framework'` → renders the Flask-vs-FastAPI take: preference statement, the 5 requested dimensions, and evidence cross-referenced against `getAllProjects()` (a portfolio fact from `content.js`, read via `knowledge.js`) — which project actually ships which framework.

## "Compare Flask vs FastAPI"

1. `classifyIntent` → `'comparison'` (unchanged).
2. `analyzeStrategy` → `COMPARISON_RE` matches; entity extraction (reusing `SKILLS_TAXONOMY` alias matching from `jdmatch.js`) finds `['Flask', 'FastAPI']` → both are tech names, zero project-name matches → `{ move: 'comparison', scope: 'tech', entities: ['Flask','FastAPI'], category: null }`.
3. `generate()` sees `move === 'comparison' && scope === 'tech'` → `_techComparisonResponse(strategy)`.
4. Looks up the matching `persona.js` `TECH_TAKES` entry by `techs` overlap, renders the structured comparison table (performance/validation/async/ecosystem/DX) + real-project evidence (from `content.js`, via `knowledge.js`). If no `TECH_TAKES` entry matches the named pair, degrades honestly (see Risks) instead of returning an unrelated doc.

*(Project-vs-project comparisons — e.g. "Compare QueryForgeAI and RepoRadarAI" — still resolve `scope: 'project'` and still call the existing, unmodified `_comparisonResponse`, now invoked deterministically by strategy instead of as a probabilistic last resort.)*

## "Explain the architecture"

1. `classifyIntent` → `'architecture'` (unchanged).
2. `analyzeStrategy` sees `intent === 'architecture'` and runs scope disambiguation: no explicit project name in the query; checks `ctx.memory.activeTopic` / `ctx.memory.lastProject` / `ctx.focusProject` for an in-progress project discussion; checks the query itself for portfolio-signaling words (`"overall"`, `"whole"`, `"five-layer"`, `"system"`, `"portfolio"`). None present, and no active project context (first-turn scenario, matching the report) → **defaults to `scope: 'portfolio'`** → `{ move: 'explanation', scope: 'portfolio', projectId: null }`.
3. `generate()` sees `move === 'explanation' && scope === 'portfolio'` → fetches `getDoc('arch-overview')` **directly** (bypassing `retrieve()`'s scoring entirely) and calls the existing `_archResponse(overviewDoc, [{doc: overviewDoc}])` unmodified. RepoRadarAI's incidental keyword collision can no longer win, because scoring never runs for this disambiguated path.
4. If a visitor is mid-conversation about a specific project (`memory.lastProject` set, or an explicit project named) and then asks "explain the architecture," scope resolves to `'project'` instead, and `generate()` calls the existing project-arch branch of `_projectResponse` directly — this is the "distinguish portfolio vs. project architecture using conversational context" behavior explicitly requested.

In all four flows, if strategy resolution is inconclusive (no greeting, no identity phrase, no 2 comparable entities, no opinion/category hint, intent isn't `'architecture'`), `strategy.move` falls through to `'factual'` and **`generate()`'s existing code runs completely untouched** — this is what makes the change additive rather than a rewrite.

---

# Module Changes

| Module | Change type | Summary |
|---|---|---|
| `src/assistant/conversation.js` | **New file** | Classifies conversational move + scope. Pure, offline, provider/UI-agnostic. (Named per refinement 1 — was `strategy.js` in the draft.) |
| `src/assistant/persona.js` | **New file** | Authored conversational prose: assistant identity/capabilities, framework opinions, comparison templates. Pure data, no logic. (Per refinement 2 — this content does **not** go into `content.js`.) |
| `src/assistant/jdmatch.js` | Extend | Export the existing internal alias-matching helper (generalized name) so `conversation.js` can reuse it instead of duplicating it. |
| `src/assistant/providers.js` | Extend | Import `getDoc` from `knowledge.js` and the new constants from `persona.js`; add one strategy-routing block at the top of `LocalProvider.generate()`; add 5 new composer methods (`_greetingResponse`, `_identityResponse`, `_techComparisonResponse`, `_opinionResponse`, `_experienceResponse`). Zero changes to existing methods. |
| `src/content.js` | **No changes** | Refinement 2 — remains portfolio-data-only. Nothing is added here for this feature. |
| `src/assistant.js` | Extend | Import `analyzeStrategy` from `conversation.js`; add one new pipeline step (step 5) between `PROFILE` and the provider call; pass `strategy` through `ctx` exactly like `intent`/`focusProject`/`visitorProfile` already are. Update the header's step list. Optionally extend `buildFollowups()`'s switch with a few `strategy.move`-based cases. |
| `src/assistant/knowledge.js` | **No changes** | `retrieve()`, `getDoc()`, `getAllProjects()`, `getStack()` are all already exported and sufficient. |
| `src/assistant/memory.js` | **No changes** | `activeTopic` and `lastProject` (Sprint 3) already provide the conversational-context signal scope disambiguation needs. |
| `src/assistant/awareness.js` | **No changes** | `currentProject` already available and already read by `resolveContext()`; `conversation.js` reads it the same way. |
| `src/assistant/tools.js`, `renderer.js`, `streaming.js`, `interview.js` | **No changes** | Not implicated by this change. |

---

# File-by-File Plan

## New files

### `src/assistant/conversation.js`

Why it's necessary as a new file: see "Why two new modules" above — no existing module's charter covers "classify the conversational move and disambiguate scope before retrieval," and none should be stretched to cover it without acquiring a second responsibility. Named `conversation.js` (refinement 1) rather than the draft's `strategy.js`.

Exact contents planned:

```js
/**
 * conversation.js — Conversation Strategy layer for SRIIVERSE AI.
 * Decides the conversational MOVE (greeting / identity / comparison /
 * opinion / experience / explanation / factual) and, where relevant, its
 * SCOPE — before any knowledge retrieval runs. Pure, offline,
 * provider-agnostic and UI-agnostic, exactly like jdmatch.js/interview.js:
 * it returns structured data only, never renders, never calls a provider.
 */
import { matchTaxonomyEntities } from './jdmatch.js';

// ...regex constants for GREETING / IDENTITY / COMPARISON / OPINION / EXPERIENCE
// ...CATEGORY_HINTS map (backend-framework / database / frontend-framework)

export function analyzeStrategy(query, ctx = {}) { /* returns Strategy */ }
```

Public API: `analyzeStrategy(query, { intent, focusProject, memory, awareness }) → Strategy`, where:

```ts
Strategy = {
  move: 'greeting' | 'identity' | 'comparison' | 'opinion' | 'experience' | 'explanation' | 'factual',
  scope: 'portfolio' | 'project' | 'tech' | null,
  projectId: string | null,
  entities: string[],       // canonical tech or project names found in the raw query
  category: string | null,  // 'backend-framework' | 'database' | 'frontend-framework' | null
}
```

Internal detection order (first confident match wins; anything inconclusive falls through to `'factual'`):
1. Greeting (anchored `^`, short-circuits everything else)
2. Identity
3. Comparison (requires ≥2 resolvable entities of the *same* type — project or tech — otherwise falls through)
4. Opinion/recommendation (requires a preference-phrasing trigger; entities or category hint optional)
5. Experience ("have you built…", "what projects demonstrate…", "your X experience")
6. Explanation (only when `ctx.intent === 'architecture'`; resolves `scope` from explicit project mention → conversational context (`memory.lastProject`/`focusProject`/`awareness.currentProject`) → portfolio-signaling words → default `'portfolio'`)
7. Factual (default — no interception; downstream code behaves exactly as it does today)

### `src/assistant/persona.js`

Why it's necessary as a new file (refinement 2): the response composers need authored, opinionated, "this is what the assistant says about itself and its takes" content — an assistant identity blurb, a capability list, and framework opinion/comparison templates. This is categorically different from `content.js`'s portfolio-facts charter (`PROFILE`, `PROJECTS`, `STACK`, etc. describe *Sudhanshu's work*; this new content describes *the assistant's own voice*). Keeping it in its own module means `content.js` never needs a "which of these exports are actual portfolio facts vs. assistant opinion" mental split.

Exact contents planned — pure data, two exports:

```js
/**
 * persona.js — Authored conversational content for SRIIVERSE AI.
 *
 * Deliberately separate from content.js: content.js is the single source
 * of truth for PORTFOLIO DATA (what Sudhanshu built). This file holds the
 * assistant's own authored VOICE — how it describes itself and its
 * engineering opinions — which is not a portfolio fact and must never be
 * confused with one. Pure data only: no logic, no rendering, no DOM.
 *
 * Every `evidence`/cross-reference claim here is checked against the real
 * PROJECTS[].stack in content.js at write time — nothing is invented.
 */

export const ASSISTANT_CAPABILITIES = [
  { icon: '🧑‍💼', label: 'Recruiter Mode', desc: '...' },
  { icon: '📄', label: 'Resume Intelligence', desc: '...' },
  { icon: '📋', label: 'Job Description Matching', desc: '...' },
  { icon: '🎯', label: 'Interview Practice', desc: '...' },
  { icon: '🏗️', label: 'Project & Architecture Explanations', desc: '...' },
];

export const TECH_TAKES = [
  {
    category: 'backend-framework',
    techs: ['Flask', 'FastAPI'],       // canonical names, matching content.js's SKILLS_TAXONOMY
    preference: '...',                  // first-person engineering opinion, honestly scoped
    dimensions: [
      { name: 'Performance', a: '...', b: '...' },
      { name: 'Validation', a: '...', b: '...' },
      { name: 'Async', a: '...', b: '...' },
      { name: 'Ecosystem', a: '...', b: '...' },
      { name: 'Developer Experience', a: '...', b: '...' },
    ],
    evidence: [ { project: 'queryforge', tech: 'Flask' }, { project: 'reporadar', tech: 'FastAPI' } ],
  },
  // + 'database' (PostgreSQL vs MongoDB), + 'frontend-framework' (React vs Vue)
];
```

- **Grounding constraint (important, called out again in Risks):** `PROJECTS[].stack` in the *current* repository does **not** list `PostgreSQL` or `MongoDB` for any individual project — only `STACK`/`ARCHITECTURE` mention databases at the portfolio level. The `database` `TECH_TAKES` entry's `evidence` must **not** claim a specific project uses a specific DB unless that's actually present in `p.stack`; it should honestly state the general architecture-level fact instead. This must be respected during implementation, not just planning.
- Vue is not in `STACK` at all — the `frontend-framework` entry's `preference`/`evidence` must make clear that React is what's actually shipped (RepoRadarAI) and Vue commentary is general engineering knowledge, not first-hand project experience.
- `persona.js` may *import read-only* from `knowledge.js`/`content.js` (e.g. to validate an `evidence` project id resolves), but never the other way around — `content.js` never imports from `persona.js`, preserving the one-way "portfolio data has no dependency on assistant voice" boundary.

## Modified files

### `src/assistant/jdmatch.js`

- **Why it changes:** its private `detectRequestedSkills(normalizedText)` already implements the exact alias-matching primitive `conversation.js` needs for entity extraction (comparison/opinion). Duplicating that logic in the new module would violate "avoid duplication."
- **Exact change:** rename/generalize to `export function matchTaxonomyEntities(text, { normalized = false } = {})`, update the one internal call site (`analyzeJobDescription`) to use the exported name. No behavioral change to JD matching — same regex, same `SKILLS_TAXONOMY` traversal, same `containsAlias` helper (also kept internal, unchanged).
- **Must remain untouched:** `analyzeJobDescription`'s scoring, `looksLikeJobDescription`, `rankRelevantProjects`, `buildTalkingPoints` — none of these change.

### `src/assistant/providers.js`

- **Why it changes:** this is where "Response Composition" lives today (as ad hoc `_xResponse` methods keyed by doc `kind`); the new moves need their own composers, and `generate()` needs one new branch to reach them before the existing retrieval fallback.
- **Exact changes:**
  - Add `getDoc` to the existing `import { retrieve, getProfile, getAllProjects, getStack } from './knowledge.js';` line.
  - Add `import { ASSISTANT_CAPABILITIES, TECH_TAKES } from './persona.js';` (**not** from `content.js` — refinement 2).
  - In `LocalProvider.generate()`, immediately after the existing `if (ctx.intent === 'jd-match') ...` line and before `const hits = retrieve(query, 5);`, add:
    ```js
    const strategy = ctx.strategy;
    if (strategy) {
      if (strategy.move === 'greeting') return this._greetingResponse(ctx);
      if (strategy.move === 'identity') return this._identityResponse(ctx);
      if (strategy.move === 'comparison' && strategy.scope === 'tech') return this._techComparisonResponse(strategy);
      if (strategy.move === 'opinion') return this._opinionResponse(strategy, ctx);
      if (strategy.move === 'experience') return this._experienceResponse(strategy, query);
      if (strategy.move === 'explanation' && strategy.scope === 'portfolio') {
        const doc = getDoc('arch-overview');
        return this._archResponse(doc, [{ doc }]);
      }
      if (strategy.move === 'explanation' && strategy.scope === 'project' && strategy.projectId) {
        const doc = getDoc(`project-arch-${strategy.projectId}`);
        const proj = getAllProjects().find((p) => p.id === strategy.projectId);
        if (proj && doc) return this._projectResponse(proj, doc, 'architecture', [{ doc }], ctx.visitorProfile, ctx.memory);
      }
    }
    // existing retrieval fallback — UNCHANGED below this line
    const hits = retrieve(query, 5);
    ...
    ```
  - Add 5 new methods alongside the existing `_xResponse` methods (same style/placement as `_resumeResponse`/`_jdMatchResponse` added in Sprint 3): `_greetingResponse`, `_identityResponse`, `_techComparisonResponse`, `_opinionResponse`, `_experienceResponse`.
- **Must remain untouched:** every existing method (`_projectResponse`, `_stackResponse`, `_archResponse`, `_recommendResponse`, `_comparisonResponse`, `_resumeResponse`, `_jdMatchResponse`, `_pickVariant`, `_fallback`, all remote providers, `buildGroundedPrompt`, `buildSystemPrompt`) — zero edits to their bodies. The existing retrieval fallback path is reached, byte-for-byte unchanged, whenever `strategy` is absent or inconclusive.

### `src/assistant.js`

- **Why it changes:** it's the orchestrator; the new pipeline step is wired in here, exactly like every previous sprint's new step/gate was.
- **Exact changes:**
  - Add `import { analyzeStrategy } from './assistant/conversation.js';`
  - In `ask()`, immediately after the existing PROFILE step (after `const visitorProfile = memory.profile;` and the profile-badge update) and before the `think.update('knowledge')` line, add:
    ```js
    // --- 5. CONVERSATION STRATEGY ---
    const strategy = analyzeStrategy(query, { intent, focusProject, memory, awareness });
    ```
  - In the existing `provider.generate(query, { memory, intent, focusProject, awarenessContext, visitorProfile: ... })` call, add `strategy,` to the ctx object literal.
  - Update the file header's step-list comment (12 → 13 steps) to document the new step, matching how Sprint 3's mode-gate addition updated the same header.
  - *(Optional, separate phase)* extend `buildFollowups(intent, payload, focusProject)` to accept an optional `strategy` argument and add a small number of `case` branches keyed off `strategy?.move` (e.g. after an `identity` response, suggest "Show me his projects" / "Why hire him?"; after a `comparison`/`tech` response, suggest "Open a live demo" / a different tech pairing).
- **Must remain untouched:** `classifyIntent()` (all 20 lines, unchanged), `resolveContext()` (unchanged), the interview mode gate, `Workspace`, all DOM/event wiring, `formatInterviewEvent`, `buildProjectActions`, `startThinkingSteps`.

### `src/content.js`

- **No changes.** Refinement 2 explicitly keeps this file portfolio-data-only. The original draft's plan to add `ASSISTANT_CAPABILITIES`/`TECH_TAKES` here has been superseded by `src/assistant/persona.js` above.

## Deleted files

None.

---

# Implementation Phases

## Phase 0 — Reuse groundwork
- **Objective:** make `jdmatch.js`'s alias-matching reusable without duplicating it.
- **Files:** `src/assistant/jdmatch.js`.
- **Validation:** existing JD-matching test scenarios (Sprint 3 checklist) still pass unmodified; `matchTaxonomyEntities` returns identical results to the old private `detectRequestedSkills` for the same input.
- **Expected outcome:** zero behavior change, one new export.

## Phase 1 — Strategy module (classification only, not yet wired in)
- **Objective:** build `conversation.js` and unit-verify its classification against the 4 reported examples plus a battery of paraphrases, in isolation, *before* touching `assistant.js`/`providers.js`.
- **Files:** `src/assistant/conversation.js` (new).
- **Validation:** for each of "Who are you?", "Hi", "What backend framework do you prefer?", "Compare Flask vs FastAPI", "Explain the architecture" (with and without prior project context), confirm the returned `Strategy` object matches the Data Flow section above.
- **Expected outcome:** a correct, side-effect-free classifier; nothing in the live app calls it yet, so there is no risk to existing behavior at the end of this phase.

## Phase 2 — Persona content module
- **Objective:** author `persona.js`'s `ASSISTANT_CAPABILITIES` and `TECH_TAKES`, respecting the grounding constraint on per-project DB claims and the Vue/React honesty requirement, and keeping this content entirely out of `content.js`.
- **Files:** `src/assistant/persona.js` (new).
- **Validation:** every `evidence` entry cross-checked against real `PROJECTS[].stack`/`decisions` values in `content.js`; no invented claim; `content.js` itself is diffed to confirm zero changes.
- **Expected outcome:** data ready for the composers in Phase 3; no behavior change yet (nothing imports `persona.js` until Phase 3).

## Phase 3 — Response composers + strategy-routing in `providers.js`
- **Objective:** implement the 5 new composer methods and the strategy-routing block, with the existing retrieval fallback untouched below it.
- **Files:** `src/assistant/providers.js`.
- **Validation:** call `LocalProvider.generate(query, { intent, strategy })` directly (or via the not-yet-wired assistant) with hand-built `strategy` objects for each move; confirm correct composer fires and existing methods are byte-identical to before.
- **Expected outcome:** all new response paths work when a `strategy` is supplied; since `assistant.js` doesn't supply one yet, live behavior is still 100% unchanged.

## Phase 4 — Wire the pipeline step into `assistant.js`
- **Objective:** add the new step and pass `strategy` through `ctx`.
- **Files:** `src/assistant.js`.
- **Validation:** the four reported examples now produce the expected natural-first answers end-to-end in the browser; every Sprint 1–3 regression scenario (see Testing Checklist) still passes.
- **Expected outcome:** the fix is live.

## Phase 5 — (Optional) Follow-up quality pass
- **Objective:** extend `buildFollowups()` with `strategy.move`-aware suggestions.
- **Files:** `src/assistant.js`.
- **Validation:** follow-ups after identity/opinion/tech-comparison responses are topically relevant, not generic defaults.
- **Expected outcome:** minor conversational polish; can be deferred without blocking Definition of Done if time-boxed.

## Phase 6 — Documentation
- **Objective:** update `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/AI_ASSISTANT_SPEC.md`, and `README.md` to describe the 13-step pipeline and the two new modules (`conversation.js`, `persona.js`), matching how Sprint 3's changes were documented.
- **Files:** the four docs above.
- **Validation:** step counts and module inventories in the docs match the live code.
- **Expected outcome:** documentation stays truthful.

---

# Risks

## Architectural
- **New moves must fail closed.** Every detector in `conversation.js` must require high-confidence signal (anchored greeting regex, ≥2 resolvable entities for comparison, explicit preference phrasing for opinion) — an over-eager match would *intercept* a query that used to work fine via retrieval and route it somewhere wrong. Mitigation: default to `'factual'` on any ambiguity, which is provably safe because it reproduces today's exact code path.
- **Scope-default risk (Example 4 fix).** Defaulting unresolved architecture-scope to `'portfolio'` is a judgment call — it's correct for the reported first-turn case, but if a visitor has been discussing a specific project for several turns and then asks a *very* generic "explain the architecture," conversational context (`memory.lastProject`) is checked *before* the portfolio default, specifically to avoid this becoming a regression for engaged, project-focused conversations.
- **Portfolio-data / authored-voice boundary.** Keeping `persona.js` separate from `content.js` only works if implementers respect it going forward — any future PR that adds an "opinion" or "assistant self-description" field directly to `content.js` would silently undo refinement 2. Mitigated by `persona.js`'s own header comment stating the boundary explicitly, and by `content.js` never importing from `persona.js` (one-way dependency, easy to lint/spot in review).

## Performance
- `conversation.js` adds a handful of regex tests per turn — the same order of magnitude `classifyIntent()` already performs. No measurable latency impact; still fully offline, still synchronous.

## Accessibility
- No UI/DOM/ARIA changes are part of this plan — all new response text flows through the exact same `createStream`/`renderMarkdown`/`renderCitations`/`renderFollowups` pipeline already in place. No new risk surface.

## Maintainability
- **Authored-content drift.** `persona.js`'s `TECH_TAKES` and `ASSISTANT_CAPABILITIES` are hand-authored narrative, like `_archResponse`'s hardcoded prose already is — they will need occasional review as the actual stack/feature set evolves, same as any other hardcoded narrative in `providers.js` today. This is an accepted, pre-existing pattern in this codebase, not a new category of risk.
- **Un-covered comparison/opinion pairs.** `TECH_TAKES` only covers 3 pairs at launch. A query like "Compare Django vs Flask" will find 0 matching entries. `_techComparisonResponse`/`_opinionResponse` must degrade **honestly** (state plainly that a first-hand comparison isn't available for that pair, then fall back to what's actually grounded — e.g. "Sudhanshu's shipped backend work uses Flask and FastAPI…") rather than either fabricating a take or returning `undefined`/an empty response.
- **Module count.** This plan adds exactly two new files (`conversation.js`, `persona.js`) — one logic module, one data module, mirroring the existing `knowledge.js`/`content.js` split. `providers.js` grows by ~5 focused methods (comparable in size to the Sprint 3 addition of `_resumeResponse`/`_jdMatchResponse`) — it does not become materially harder to navigate.

---

# Testing Checklist

## The four reported examples (must all pass)
- [ ] "Who are you?" → identity introduction (who/what/recruiter features/JD matching/interview mode/projects/architecture), not the fallback message.
- [ ] "Hi" / "Hello" / "Hey" / "Good morning" → a short, warm greeting, not the fallback message and not an unrelated architecture/stack doc.
- [ ] "What backend framework do you prefer?" → an opinionated, evidence-backed Flask-vs-FastAPI answer naming a preference, not the Technology Stack card.
- [ ] "Which database would you choose?" → an opinionated Postgres-vs-Mongo answer, honestly scoped to what `PROJECTS[].stack` actually supports.
- [ ] "Compare Flask vs FastAPI" → a structured tech comparison (performance/validation/async/ecosystem/DX) + real project evidence, not the Technology Stack card.
- [ ] "React vs Vue" → comparison rendered, honestly noting Vue isn't part of the shipped stack.
- [ ] "Explain the architecture" (first turn, no prior context) → the five-layer portfolio overview (`arch-overview`), never a specific project's architecture.
- [ ] After discussing a specific project (e.g. ask about RepoRadarAI first), then ask "explain the architecture" → resolves to that project's architecture, demonstrating context-aware scope resolution.
- [ ] "Explain QueryForgeAI architecture" / "Explain RepoRadarAI architecture" (explicit project named) → still resolves to that project directly, unaffected by the new default.

## Comparison/opinion edge cases
- [ ] "Compare QueryForgeAI and RepoRadarAI" (project-vs-project) → still uses the existing `_comparisonResponse` project comparison card, unaffected by the new tech-comparison path.
- [ ] "Compare Django vs Flask" (un-covered pair) → graceful, honest degradation — no fabricated opinion, no silent unrelated doc.
- [ ] "Have you built production APIs?" / "What projects demonstrate SQL?" / "Tell me about your backend experience." → evidence-based experience answers naming specific projects, not the generic profile blurb.

## Regression — Sprint 1/2/3 scenarios must still pass unmodified
- [ ] "Tell me about QueryForgeAI" / "Explain RepoRadarAI" / "Explain Placement Pro+" → full project cards unchanged.
- [ ] "What technologies does he know?" → Technology Stack card unchanged.
- [ ] "Why should we hire you?" / recruiter-phrased questions → recruiter framing + phrase-variant rotation unchanged.
- [ ] Résumé questions ("summarize his experience", "walk me through his background") → `_resumeResponse` unchanged.
- [ ] Paste a job description → JD match score/table/talking points unchanged.
- [ ] "Practice a Python interview" → interview mode start/question/feedback/summary/exit unchanged; mode gate still bypasses the full pipeline while active.
- [ ] "Open the RepoRadarAI live demo" / "download resume" / navigation commands → tool execution unchanged.
- [ ] Pronoun follow-ups ("what about its architecture?" after discussing a project) → `resolveContext()`'s pronoun enrichment unchanged.
- [ ] Multi-turn conversation → follow-up suggestions still dedupe via `usedPhraseKeys`, `activeTopic` still updates correctly for both old and new intents/moves.
- [ ] No console errors across all of the above; visible streaming/markdown/citation rendering unchanged in appearance.

## Definition of Done
Sprint is complete only if:
- [ ] All four reported examples behave as specified above, verified in the live browser (not just traced on paper).
- [ ] `classifyIntent()` and `resolveContext()` are byte-identical to their pre-change versions.
- [ ] Every existing `providers.js` method body is byte-identical to its pre-change version; only new methods and one new branch were added.
- [ ] `content.js` is **completely unchanged** — zero diff. All new authored conversational content lives in `src/assistant/persona.js` instead, honestly grounded in real `PROJECTS`/`STACK` data (no fabricated per-project claims).
- [ ] No new abstraction layer beyond the two modules (`conversation.js`, `persona.js`) — no generic "intent bus," no plugin registry, no config-driven rule engine.
- [ ] No dozens-of-if-statements sprawl: `conversation.js`'s detection order is a short, explicit, documented list (7 checks), not an intent switch with dozens of branches.
- [ ] Full regression checklist above passes with no console errors.
- [ ] `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/AI_ASSISTANT_SPEC.md`, `README.md` updated to reflect the 13-step pipeline and the two new modules.
- [ ] Everything still works fully offline — no network calls introduced.

---

# Ready-to-Use Implementation Handoff

Paste the following into a new chat to begin implementation once this plan is approved:

```
This repository's AI assistant conversational-intelligence upgrade has been
planned and approved (including two refinements: the strategy module is
named src/assistant/conversation.js, and authored conversational content
lives in a new src/assistant/persona.js module, NOT in content.js). Do NOT
re-plan or redesign anything.

Before making any changes:
1. Read docs/CONVERSATION_INTELLIGENCE_PLAN.md completely.
2. Read docs/CURSOR_RULES.md (or docs/CONTRIBUTING.md if rules moved there).
3. Verify the repository against the plan before editing any files — in
   particular, re-check that src/assistant/providers.js's generate() routing
   order and src/assistant/knowledge.js's scoreDoc()/retrieve() still match
   what the plan describes. If you find any material contradiction between
   the repository and the approved plan, stop and explain it before
   continuing.

Implementation requirements:
- Follow the Implementation Phases in the plan in order (Phase 0 through
  Phase 6). Phase 5 (follow-up quality pass) may be deferred if time-boxed,
  but all other phases are required.
- Preserve the existing architecture and module boundaries exactly as
  described in the "Module Changes" and "File-by-File Plan" sections —
  do not touch classifyIntent(), resolveContext(), or any existing
  providers.js method body.
- content.js must remain completely unchanged — it is portfolio-data-only.
  All authored conversational content (assistant identity/capabilities,
  framework opinions, comparison templates) goes into the new
  src/assistant/persona.js module.
- Reuse existing modules and exports wherever the plan specifies reuse
  (SKILLS_TAXONOMY, memory.activeTopic/lastProject, awareness.currentProject,
  getDoc/getAllProjects/getStack) — do not duplicate logic that already
  exists.
- Do not introduce new abstractions beyond the two new modules described
  in the plan.
- Respect the grounding constraint in persona.js's TECH_TAKES: do not claim
  a specific project uses PostgreSQL or MongoDB unless that is actually
  present in that project's `stack` array in content.js; be honest that
  Vue is not part of the shipped stack.
- Stay strictly within this plan's scope — no visual redesign, no new
  Three.js work, no animation changes, no theme switching.

After implementation:
- Summarize every file changed and why.
- Report any deviations from the approved plan.
- Manually verify every item in the plan's Testing Checklist, including
  all four originally reported examples, in the live browser (use a local
  static server, e.g. `python -m http.server`).
- Confirm every Definition of Done item has been satisfied.
```
