# Sprint 2 Implementation Plan — SRIIVERSEAI

> Status: **PROPOSED — not yet implemented.**
> This document is self-contained. A new Cursor chat with no prior conversation history should be able to implement Sprint 2 correctly using only this file, `cursor_rules.md` (repo root — see Phase 0, which moves it to `docs/CURSOR_RULES.md`), and the live repository.
>
> Written: Thursday, Jul 23, 2026. Verified directly against the repository at that commit — every claim below was checked against actual source files (see file/line references throughout), not assumed from documentation.

---

# Sprint 2 Goals

Sprint 1 (completed, tested, approved) removed dead code (`thinking.js`, `navigateTo`), consolidated scroll logic into `src/scroll.js`, unified the résumé-download flow into `triggerResumeDownload()`, and added baseline accessibility (`:focus-visible`, a skip link, `aria-live` on the assistant body).

Sprint 2 continues directly from the accessibility audit and roadmap docs that are still sitting at the repo root unactioned, plus one item Sprint 1 itself flagged as a follow-up (the `aria-live` region is currently too coarse). Objectives, **highest to lowest impact**:

## 1. Accessibility & mobile-content completion (Highest impact)
The architecture section's five node descriptions are **only revealed on `:hover`**, and on screens ≤980px they are **hidden entirely** (`display: none`, confirmed at `src/styles.css:922`). This is not just a screen-reader gap — it is a genuine content-loss bug: every mobile/tablet visitor, and every keyboard-only desktop visitor, currently cannot read what any of the 5 architecture layers do. Given the AI Assistant Rules' "Recruiter experience" priority and the Accessibility rule ("a requirement, not an enhancement"), this is the highest-value fix available — it restores real content to a majority-mobile audience, not just a compliance checkbox.

Bundled into the same objective (same files, same testing pass):
- `--text-faint` (`#5B6488`) fails WCAG AA contrast against the dark backgrounds it's used on (measured ~3.4:1; AA requires 4.5:1 for normal text — see Repository Analysis for the calculation). It's used for ~20 small labels/captions across the site.
- The Sprint-1-added `aria-live="polite"` on `#assistantBody` will announce every ~14–18ms word-chunk of the streamed reply, not just the finished message — noisy/unusable for screen-reader users. Sprint 1 explicitly flagged this as a follow-up.

## 2. Documentation consolidation into `docs/` (Foundational, low risk)
`CONTRIBUTING.md` (at repo root) describes a `docs/` folder in its repository-structure diagram that has never existed — confirmed via `Glob` (0 results for `docs/**` before this plan was written). The 12 governance files currently sit at the repo root as fragments (the 11 audit/roadmap files were split into pieces during export, e.g. `portfolio_audit.md` + `frontend__evaluation.md` + `accessibility__audit.md` are really one logical `PORTFOLIO_AUDIT.md`). This was already flagged as P3 in an earlier audit chat and deferred. Doing it now, first, is valuable because:
- It's pure file moves — zero code risk — and unblocks everything else being cleanly documented in one place going forward (this plan itself lives in `docs/`).
- It resolves a concrete inconsistency: this plan's own **Cursor Handoff** prompt (required by your instructions) needs to reference `docs/CURSOR_RULES.md`, which does not exist yet at that path. Doing the doc move as Phase 0 makes that reference correct by the time Sprint 2 finishes, instead of silently being wrong.

## 3. SEO / discoverability metadata (Real value, zero architectural risk)
`index.html` has only basic Open Graph tags — confirmed no JSON-LD, no `robots.txt`, no sitemap, no Twitter Card meta, no canonical URL (verified via `Grep` for `JSON-LD|sitemap|robots\.txt|twitter:card` — no matches). For a portfolio whose entire purpose is being discovered and shared with recruiters, this is a real, low-effort, zero-risk win — purely additive static markup/files, no logic changes.

## 4. Centralized error/warning logging (Lowest priority — code-quality only)
Error handling is currently scattered: `main.js:36`, `tools.js:339-345`, `assistant.js:435`, `memory.js:141,153` each independently call `console.warn`/`console.error` with ad-hoc message formats. `CURSOR_RULES.md`'s Error Handling rule requires errors to be "logged appropriately" and "degrade gracefully" — today that's true in spirit but inconsistent in practice. This is the lowest-impact item: it's a maintainability improvement with no user-facing effect, included because it's small, safe, and directly requested by the rules, not because it's urgent.

**Explicitly deferred (see Out of Scope):** the LLM-provider API-key security risk (`providers.js`) is real but requires backend/serverless infrastructure this static zero-build site doesn't have — too large and too risky to fit Sprint 2's incremental philosophy.

---

# Repository Analysis

Everything below was verified directly against the current repo, not assumed.

## Confirmed file inventory (post–Sprint 1)
```
index.html
serve.ps1
README.md
SRIIVERSE_AI_Implementation_Plan_Refined.md
contributing.md, change_log.md, cursor_rules.md, design_guidelines.md,
project_architecture.md, resume_analyzer.md, assistant.md,
portfolio_enhancement.md, implementation__roadmap.md,
accessibility__audit.md, frontend__evaluation.md, portfolio_audit.md
docs/
  SPRINT_2_PLAN.md          ← this file
src/
  main.js, core.js, content.js, sections.js, scene.js, scroll.js, styles.css
  assistant.js
  assistant/
    knowledge.js, memory.js, awareness.js, providers.js,
    tools.js, streaming.js, renderer.js
```
No `package.json`, no bundler — confirmed zero-build architecture is intact. `src/assistant/thinking.js` no longer exists (deleted in Sprint 1). No `assets/` folder exists — `./assets/resume.pdf` still does not exist (confirmed by `Glob assets/**` → 0 files); `triggerResumeDownload()` in `tools.js` already logs a `console.warn` when this HEAD-check fails, so this is not a new problem for Sprint 2.

## Objective 1 verification — Architecture section hover/mobile gap
- `src/sections.js` `buildArchitecture()` (current, post Sprint-1) renders each node as a plain `<div class="arch__node" data-cursor="link">` with **no `tabindex`, no `role`, no `aria-expanded`**. It is not part of the tab order and has no accessible name/state for its expandable description.
- `src/content.js` `ARCHITECTURE` array (lines 158–164) already has a stable `id` per node (`frontend`, `backend`, `ai`, `database`, `deploy`) — usable for deterministic `id`/`aria-controls` wiring instead of positional indices.
- `src/styles.css`:
  - `.arch__desc` (lines 710–716): `max-width: 0; opacity: 0;` by default, only expanded via `.arch__node:hover .arch__desc`. No `:focus`/`:focus-within` variant exists.
  - Line 922, inside `@media (max-width: 980px)`: `.arch__desc { display: none; }` — descriptions are unconditionally removed on tablet/mobile, hover or not.
- **Confirmed reusable:** the existing `reveal`/`data-reveal` IntersectionObserver pattern (`core.js` `initReveals()`) is unrelated and doesn't need touching. The fix is additive interaction logic, not a new subsystem.

## Objective 1 verification — Contrast
Computed relative luminance (WCAG 2.1 formula) directly from the actual token values in `src/styles.css:8,18-19`:
- `--bg-0: #050816` → relative luminance ≈ 0.00264
- `--text-faint: #5B6488` → relative luminance ≈ 0.1312 → **contrast ratio ≈ 3.44:1 against `--bg-0`** (fails WCAG AA for normal text, which requires 4.5:1; only clears the 3:1 "large text/UI component" bar)
- `--text-dim: #9AA3C7` → relative luminance ≈ 0.372 → contrast ratio ≈ 8.0:1 against `--bg-0` (passes AA/AAA comfortably — **`--text-dim` does not need to change**)

`--text-faint` is used in ~20 places (verified via `Grep`) — mostly 10–12px uppercase mono labels/captions (`.stat__label`, `.arch__label small`, `.project__panel h6`, `.hero__meta`, footer, etc.) — all of which count as "normal text" for WCAG purposes (none qualify as "large text").

## Objective 1 verification — `aria-live` scoping
- `src/assistant.js` `addBubble('bot')` (lines 324–335) appends a `.assistant__msg--bot` element to `#assistantBody` and returns its inner `.ai-content` node.
- The reply is streamed into that node word-by-word via `createStream()` (`assistant/streaming.js`), called at `assistant.js:459`, awaited via `await stream.done()` at line 464 — this is the exact point where the full message text is first stable.
- `index.html`'s `#assistantBody` currently has `aria-live="polite"` (added in Sprint 1) directly on the streaming container — this is the part that needs to change; it is not wrong in intent, just too coarse.
- No `.sr-only`/visually-hidden utility class exists yet in `styles.css` (confirmed via `Grep` — 0 matches) — one must be added to implement a properly scoped live region.

## Objective 2 verification — Documentation
- Confirmed via `Glob('docs/**')` → 0 files. `docs/` did not exist before this plan.
- Confirmed the 12 root-level `.md` files map to 8 logical documents (fragments were split during an earlier export, verified in a prior chat by reading each file's content):

| Logical document | Current file(s) at repo root |
|---|---|
| `PORTFOLIO_AUDIT.md` | `portfolio_audit.md` + `frontend__evaluation.md` + `accessibility__audit.md` |
| `IMPLEMENTATION_ROADMAP.md` | `implementation__roadmap.md` + `portfolio_enhancement.md` |
| `AI_ASSISTANT_SPEC.md` | `assistant.md` + `resume_analyzer.md` |
| `PROJECT_ARCHITECTURE.md` | `project_architecture.md` |
| `DESIGN_GUIDELINES.md` | `design_guidelines.md` |
| `CURSOR_RULES.md` | `cursor_rules.md` |
| `CHANGELOG.md` | `change_log.md` |
| `CONTRIBUTING.md` | `contributing.md` |

`README.md` and `SRIIVERSE_AI_Implementation_Plan_Refined.md` stay at the repo root (README always stays at root by convention; the implementation plan doc is the one file that already legitimately lived in-repo pre-audit and `README.md` doesn't reference it living in `docs/`).

## Objective 3 verification — SEO
- Confirmed via `Grep` (`JSON-LD|application/ld\+json|sitemap|robots\.txt|twitter:card`) — 0 matches anywhere in the repo.
- No canonical production URL exists anywhere in the codebase (`content.js` `PROFILE` has no `url`/`siteUrl` field; README lists deploy *options*, not a live URL). **Risk called out explicitly below** — this must be added as a clearly-marked placeholder, following the exact convention `README.md`'s own "Placeholders to replace" table already uses for `PROFILE.resume`/`PROFILE.email`.

## Objective 4 verification — Error handling call sites
Exact current call sites (all confirmed via `Grep`, nothing else exists):
- `src/main.js:36` — `catch (e) { console.warn('Scene init failed:', e); }`
- `src/assistant/tools.js:339-345` — two `console.warn` calls in the résumé HEAD-check
- `src/assistant.js:435` (inside the provider `try/catch`) — currently does **not** log; it silently builds a fallback response object. This is arguably fine (it's a graceful degrade, and the user is told inline), but it should still be logged for future debugging, per the rules.
- `src/assistant/memory.js:141,153` — two `try/catch` blocks around `sessionStorage` access (not yet inspected line-by-line by this plan — the implementer must read them before touching, per the Golden Rule).

## Risks / incorrect assumptions to watch for
- **Do not assume `assistant.js` needs to change for the `aria-live` fix beyond the two specific, additive lines described in the File-by-File Plan.** The 12-step pipeline is complex; touching anything beyond adding a live-region update call risks the exact kind of regression Sprint 1 deliberately avoided.
- **Do not assume a real production domain exists.** Any SEO work requiring an absolute URL must use a clearly-marked placeholder (see Objective 3 verification), not a fabricated domain.
- **Do not assume `--text-faint` can just be deleted/aliased to `--text-dim`.** They're used for deliberately different visual weights (primary dim text vs. faint meta text) — the fix is to *lighten* `--text-faint` itself, not to merge the tokens.
- **Re-verify `memory.js:141,153`'s exact try/catch content before wrapping it in the new logger** — this plan has not read those lines in full; the implementer must (Golden Rule: understand before modifying).

---

# Proposed Architecture

Sprint 2 introduces **one new module** (`src/log.js`) and **zero new abstractions** beyond it. Every other change reuses an existing module in its existing role:

- **`core.js`** already owns generic UI-interaction wiring (`initCursor`, `initReveals`, `initNav`, `initClock`, `initStats`, `initParallax`). The new keyboard/tap interaction for architecture nodes is one more function in this exact pattern — `initArchInteraction()` — not a new file. This preserves the "single responsibility per module" rule without inventing a new one for a five-node toggle.
- **`sections.js`** already owns rendering of all data-driven sections from `content.js`. It gains `id`/`aria-*` attributes on markup it already generates — no new responsibility, just more complete markup.
- **`assistant.js`** already owns the message-rendering pipeline. The live-region update is one line added at the exact point (after `await stream.done()`) where the full message text is already known — no new pipeline step, no new module.
- **`styles.css`** already owns all component styling, including the Sprint-1-added `:focus-visible`/skip-link rules. The new `:focus-within`/`.is-open` reveal rule and `.sr-only` utility belong in the same file, next to the accessibility rules Sprint 1 added.
- **`content.js`** already owns all copy/data as the single source of truth. It gains one new field (`PROFILE.siteUrl`, clearly marked as a placeholder like `PROFILE.resume` already is) — no new file, no new pattern.
- **`src/log.js` (new, small)** is the one genuinely new module — a ~15-line logging helper. This is justified because the alternative (leaving 4+ inconsistent `console.warn` call sites) directly contradicts the Error Handling rule, and a single-purpose logging utility is exactly the kind of "small function, single responsibility" module the existing codebase already favors (see `scroll.js` from Sprint 1 as precedent). It must **not** grow into anything more than "format + emit" — no remote logging, no batching, no dependencies.
- **`docs/`** is a new top-level folder for documentation only — it does not affect `src/` or the runtime architecture at all.
- **`robots.txt` / `sitemap.xml`** are new static files at the repo root, served as-is by the existing zero-build static-file setup (`serve.ps1` already serves arbitrary static files by extension; both Netlify/Vercel/GitHub Pages deploy options in `README.md` serve root-level static files automatically — no config changes needed).

No React/Vue/Angular, no bundler, no new runtime dependency is introduced anywhere in this plan — Rule 1 (zero-build architecture) and the Dependency Policy are fully preserved.

---

# File-by-File Plan

## Modified files

### `src/content.js`
- **Why:** Need a canonical (placeholder) site URL for OG/Twitter/canonical/JSON-LD tags and the sitemap, following the project's existing "single source of truth + clearly marked placeholder" convention.
- **What changes:** Add one field to `PROFILE`, e.g. `siteUrl: 'https://sriiverseai.dev', // PLACEHOLDER — replace with the real deployed domain`. Add a one-line comment (matching the existing `resume` field's comment style at line 16-17).
- **What must NOT change:** No other field, no restructuring of `PROFILE` or any other export. `ARCHITECTURE`, `PROJECTS`, `STACK`, etc. stay untouched.

### `src/sections.js`
- **Why:** `buildArchitecture()` currently renders no accessible affordance for the hover-only description (Objective 1).
- **What changes:** In `buildArchitecture()`'s template string, add to each `.arch__node`: `tabindex="0" role="button" aria-expanded="false" aria-controls="arch-desc-${n.id}"`; add `id="arch-desc-${n.id}"` to the corresponding `.arch__desc`. Use the existing `n.id` field from `content.js` (already present, e.g. `frontend`, `backend`) — do not invent new ids.
- **What must NOT change:** `buildProjects`, `buildStack`, `buildTimeline`, `buildStats`, `buildAll`, `hexToRgba`, and every other part of `buildArchitecture()`'s existing markup/classes. Do not touch the mockup-builder functions.

### `src/core.js`
- **Why:** Need a click/keyboard toggle for the architecture nodes' descriptions, matching the module's existing role as the home for generic UI-interaction wiring.
- **What changes:** Add one new exported function, e.g. `initArchInteraction()`, following the exact style of `initNav()`/`initReveals()` already in this file: query `.arch__node`, add a `click` handler and a `keydown` handler (`Enter`/`Space`) that toggle an `.is-open` class and flip `aria-expanded`. No changes to `initLenis`, `initCursor`, `initReveals`, `initNav`, `initHeroIntro`, `initClock`, `initStats`, or `initParallax` (already updated once in Sprint 1 for `scroll.js` — do not touch that code again).
- **What must NOT change:** The `import { scrollToId } from './scroll.js';` line and its one call site (Sprint 1 work) — leave exactly as-is.

### `src/main.js`
- **Why:** The new `initArchInteraction()` needs to be called during boot, in the same place the other `init*` core functions already are.
- **What changes:** Import `initArchInteraction` from `core.js` alongside the existing `core.js` imports; call it once in `boot()` next to `initReveals()`/`initNav()` (after `buildAll()`, since the architecture DOM must exist first).
- **What must NOT change:** The `triggerResumeDownload` import/handler and everything else added in Sprint 1. Do not reorder the existing boot sequence beyond inserting the one new call.

### `src/assistant.js`
- **Why:** Scope the `aria-live` announcement to complete messages only (Objective 1), per Sprint 1's own flagged follow-up.
- **What changes:** Two small, additive changes only:
  1. In `initAssistant()`, look up the new visually-hidden live-region element (added in `index.html`, see below) once, e.g. `const liveRegion = d.getElementById('assistantLive');`.
  2. Immediately after `await stream.done();` (line ~464), set its text once: `if (liveRegion) liveRegion.textContent = finalText;` — this announces the complete message exactly once per turn.
- **What must NOT change:** Nothing else in the 12-step pipeline. Do not touch `Workspace`, `decideTool`/`runTool` usage, `memory.add`, follow-ups, or any provider/knowledge/awareness logic. Do not remove or rework `addBubble()`.

### `src/assistant/tools.js`
- **Why:** Centralize its two existing `console.warn` calls (résumé HEAD-check, lines 339-345) through the new `log.js` helper, per Objective 4.
- **What changes:** Import the new helper and replace the two `console.warn(...)` calls with equivalent calls to it (e.g. `logWarn('resume', ...)`), preserving the exact same message content.
- **What must NOT change:** `triggerResumeDownload()`'s control flow, return shape (`{ok, msg}`), the `fetch(... {method:'HEAD'})` check itself, and every tool definition/`decideTool`/`runProactiveTool`/`runTool`/`setKnowledgeRef` — all Sprint-1-verified working code. Do not touch `scrollToId` usage (already correctly importing from `scroll.js`).

### `src/main.js` (second, unrelated change — same file, different reason)
- **Why:** Route its one `console.warn` (scene-init failure, line 36) through `log.js` too, per Objective 4.
- **What changes:** Import the new helper; replace `console.warn('Scene init failed:', e)` with the equivalent `logWarn` call.
- **What must NOT change:** The `try/catch` structure itself, `whenReady()`, and the résumé-handler wiring from Sprint 1.

### `src/assistant/memory.js`
- **Why:** Route its two `try/catch` warnings (lines 141, 153 — around `sessionStorage`) through `log.js`, per Objective 4. **The implementer must read both blocks in full before changing anything** — this plan has not inspected their exact current logging behavior line-by-line.
- **What changes:** If these blocks currently log (confirm first), replace with `log.js` calls preserving the exact message/behavior. If either block currently fails silently, add a `logWarn` call there (do not leave it silent — the rules explicitly forbid this) but do **not** change what happens to program flow (still degrade gracefully, never throw).
- **What must NOT change:** `VisitorProfile`, the scoring/classification logic, the sliding-window memory implementation — none of that is in scope. Only the two logging call sites.

### `index.html`
- **Why:** (a) skip-link target and message body already exist from Sprint 1 and are untouched; (b) add the new visually-hidden live region for Objective 1; (c) add SEO/meta tags for Objective 3.
- **What changes:**
  1. Change `#assistantBody`'s `aria-live="polite"` (added in Sprint 1) — remove it from this element (the container itself should no longer be the live region).
  2. Add one new element inside the `<aside id="assistant">` panel, visually hidden via the new `.sr-only` class: `<div id="assistantLive" class="sr-only" aria-live="polite" aria-atomic="true"></div>`.
  3. In `<head>`: add `<link rel="canonical" href="{{PROFILE.siteUrl}}">` (as a literal placeholder URL matching `content.js`'s new field — index.html is static and doesn't import `content.js`, exactly like the existing OG tags already manually mirror `content.js` content today), `og:url`, `og:image` (reuse the existing inline SVG favicon or state clearly that a real OG image is a placeholder — do not fabricate an image asset), four `twitter:card`/`twitter:title`/`twitter:description`/`twitter:creator` tags mirroring the existing OG copy, one `<link rel="sitemap" ...>` is not required (search engines don't need it referenced in HTML) but add `<meta name="robots" content="index, follow">` for explicitness, and one `<script type="application/ld+json">` block with a `Person` + `WebSite` schema mirroring `PROFILE` (name, url placeholder, sameAs: [github, linkedin], jobTitle).
- **What must NOT change:** The skip link, `<main id="view" tabindex="-1">`, the entire body markup structure, section ordering, and every existing `id`/class Sprint 1 or earlier work depends on.

### `src/styles.css`
- **Why:** (a) architecture keyboard/tap-focus reveal + mobile-content restoration; (b) contrast fix for `--text-faint`; (c) new `.sr-only` utility.
- **What changes:**
  1. Lighten `--text-faint` (line 19) from `#5B6488` to a value that reaches ≥4.5:1 against `--bg-0`/`--bg-1` while staying visually "faint" relative to `--text-dim` — e.g. `#7A84AD` (computed ≈5.4:1 against `--bg-0`; **the implementer must re-verify the final chosen value's contrast ratio and visually confirm it still reads as the "faintest" tier below `--text-dim`** before considering this done — do not skip the recompute if the value is adjusted for aesthetics).
  2. Add a reveal rule alongside the existing `.arch__node:hover .arch__desc` rule (line 716): also match `.arch__node:focus-visible .arch__desc` and `.arch__node.is-open .arch__desc` (the `.is-open` class is toggled by the new `core.js` function).
  3. Replace the mobile `.arch__desc { display: none; }` (line 922) with a mobile-appropriate always-reachable version: keep it collapsed by default but reachable via tap (the same `.is-open`/`:focus-visible` selectors from point 2 must also work at this breakpoint — do not re-hide it with `!important` or a separate rule that defeats point 2). If the existing `max-width`/`white-space: nowrap` transition doesn't look right in the mobile `auto 1fr` grid, adjust `.arch__desc` at this breakpoint to `grid-column: 1 / -1` with a `max-height` transition instead of `max-width` — implementer's judgment, but the *requirement* (reachable on mobile, no `display:none`) is fixed.
  4. Add a standard `.sr-only` utility class (absolute position, 1px size, clipped, no visual footprint) for the new live-region element in `index.html`.
- **What must NOT change:** Every other token, the entire glassmorphism/glow system, `:focus-visible`/`.skip-link` rules from Sprint 1, and all unrelated component styles. Do not touch `--text-dim` (already passes contrast — verified above).

## New files

- **`src/log.js`** — small logging helper (Objective 4). Suggested shape (implementer may adjust naming, not scope):
  ```js
  export function logWarn(scope, message, err) {
    console.warn(`[${scope}] ${message}`, err ?? '');
  }
  export function logError(scope, message, err) {
    console.error(`[${scope}] ${message}`, err ?? '');
  }
  ```
  No other exports. No dependencies. No remote/analytics integration — that's explicitly Out of Scope.

- **`docs/PORTFOLIO_AUDIT.md`**, **`docs/IMPLEMENTATION_ROADMAP.md`**, **`docs/AI_ASSISTANT_SPEC.md`**, **`docs/PROJECT_ARCHITECTURE.md`**, **`docs/DESIGN_GUIDELINES.md`**, **`docs/CURSOR_RULES.md`**, **`docs/CHANGELOG.md`**, **`docs/CONTRIBUTING.md`** — created by merging/moving the root-level fragments per the table in Repository Analysis → Objective 2. Merge fragments in the order the earlier chat identified (e.g. `portfolio_audit.md` content, then `frontend__evaluation.md` content, then `accessibility__audit.md` content, concatenated under clear `##` headers into one `docs/PORTFOLIO_AUDIT.md`) — do not summarize or drop content during the merge, this is a reorganization, not a rewrite.

- **`robots.txt`** (repo root) — simple, allow-all, pointing at the sitemap:
  ```
  User-agent: *
  Allow: /

  Sitemap: {siteUrl}/sitemap.xml
  ```

- **`sitemap.xml`** (repo root) — this is a single-page site, so a minimal one-URL sitemap is correct and sufficient; do not invent additional URLs that don't exist.

## Deleted files

- The 12 fragment `.md` files at the repo root (`contributing.md`, `change_log.md`, `cursor_rules.md`, `design_guidelines.md`, `project_architecture.md`, `resume_analyzer.md`, `assistant.md`, `portfolio_enhancement.md`, `implementation__roadmap.md`, `accessibility__audit.md`, `frontend__evaluation.md`, `portfolio_audit.md`) — **only after** their content has been merged into the corresponding `docs/*.md` file above and the merge has been visually diffed/confirmed complete. Do not delete-then-merge; merge-and-verify-then-delete.
- Nothing in `src/` is deleted in Sprint 2.

---

# Implementation Order

## Pre-Implementation Baseline (do this before Phase 0)
The Definition of Done requires proving the Lighthouse Accessibility score "has not decreased," which is only checkable if a **before** number exists. Before touching any file:
- [ ] Run a Lighthouse Accessibility audit (Chrome DevTools → Lighthouse, or `npx lighthouse` if Node is available — no install into the repo itself) against the site as served by `serve.ps1`, on the current (pre-Sprint-2) code. Record the numeric score.
- [ ] Note it directly in this plan's Definition of Done section (see below) or in your own working notes, so it can be compared after Phase 1.

## Phase 0 — Documentation consolidation
- **Objective:** Create `docs/`, merge the 12 root fragments into 8 canonical files, delete the fragments, update any internal cross-references inside those docs that mention a `docs/` folder not existing.
- **Files touched:** New `docs/*.md` (8 files); deleted: 12 root `.md` fragments; `README.md` is **not** touched (confirm it doesn't hardcode paths to the fragments — if it does, that's a separate, explicitly-scoped micro-fix, not silent scope creep).
- **Expected outcome:** `docs/CURSOR_RULES.md` and 7 sibling files exist; root directory has only `README.md`, `SRIIVERSE_AI_Implementation_Plan_Refined.md`, and this plan's parent `docs/SPRINT_2_PLAN.md`.
- **Validation checklist:**
  - [ ] Every fragment's content is present in its merged `docs/*.md` counterpart (spot-check word counts or diff).
  - [ ] No fragment file remains at repo root.
  - [ ] No code in `src/` or `index.html` referenced any of the deleted files (confirm via search before deleting — expected: none do).

## Phase 1 — Accessibility & mobile-content completion
- **Objective:** Make architecture descriptions reachable via keyboard and touch/mobile; fix `--text-faint` contrast; scope `aria-live` to completed messages only.
- **Files touched:** `src/content.js` (no change needed here for this phase — `id` fields already exist), `src/sections.js`, `src/core.js`, `src/main.js`, `src/assistant.js`, `index.html`, `src/styles.css`.
- **Expected outcome:** Tabbing to an architecture node reveals its description with a visible focus ring; tapping it on a phone-width viewport does the same; `--text-faint` passes a contrast checker at ≥4.5:1; a screen reader announces exactly one complete message per assistant turn, not a stream of fragments.
- **Validation checklist:**
  - [ ] Keyboard: `Tab` reaches every `.arch__node`; `Enter`/`Space` toggles the description open/closed; `aria-expanded` reflects state.
  - [ ] Mobile viewport (≤980px, e.g. 375px wide in dev tools): descriptions are reachable (tap or focus), not permanently hidden.
  - [ ] Run any contrast checker (browser devtools "Inspect → Accessibility" contrast ratio, or a WebAIM-style checker) against the new `--text-faint` value on `--bg-0` and `--bg-1` — must read ≥4.5:1.
  - [ ] With a screen reader (or by watching the DOM in devtools), confirm the new `#assistantLive` region updates exactly once per assistant turn, after the message is fully streamed — not on every token.
  - [ ] `#assistantBody` no longer has `aria-live` on itself.
  - [ ] All Sprint 1 accessibility features (skip link, `:focus-visible`, resume flow) still work unchanged.

## Phase 2 — SEO & discoverability metadata
- **Objective:** Add JSON-LD, Twitter Card, canonical/OG URL, `robots.txt`, `sitemap.xml`.
- **Files touched:** `src/content.js` (add `PROFILE.siteUrl` placeholder), `index.html`, new `robots.txt`, new `sitemap.xml`.
- **Expected outcome:** View-source on `index.html` shows valid JSON-LD (validate structure, e.g. with any JSON-LD validator or by eyeballing required `@context`/`@type` fields), Twitter Card tags, and a canonical link. `robots.txt`/`sitemap.xml` are reachable at the site root once deployed.
- **Validation checklist:**
  - [ ] JSON-LD block is valid JSON (no trailing commas/syntax errors) and includes `@context: "https://schema.org"`.
  - [ ] All new URLs consistently use the same `PROFILE.siteUrl` placeholder (no mismatched hardcoded domains).
  - [ ] `robots.txt` and `sitemap.xml` are plain, reachable static files (test locally via `serve.ps1`).
  - [ ] No existing OG tags were duplicated or broken.

## Phase 3 — Centralized logging
- **Objective:** Route all existing `console.warn`/`console.error` call sites through the new `src/log.js`.
- **Files touched:** new `src/log.js`; modified `src/main.js`, `src/assistant/tools.js`, `src/assistant.js`, `src/assistant/memory.js`.
- **Expected outcome:** Identical console output content/behavior to before (same messages, same conditions), just emitted through one shared, consistently-formatted function.
- **Validation checklist:**
  - [ ] Trigger each existing warning condition (e.g. temporarily rename `styles.css` to force a 404-like scene failure, or use devtools to simulate the résumé-HEAD-check failing — it already fails today since `assets/resume.pdf` doesn't exist) and confirm the console output still appears, just via the new format.
  - [ ] No behavior change to `memory.js`'s `sessionStorage` degrade-gracefully behavior — profile/memory still work with `sessionStorage` disabled (e.g. private browsing edge cases), just logged consistently.
  - [ ] No new console **errors** introduced anywhere on the site (open every section, open the assistant, send a message, download the résumé).

## Phase 4 — Documentation & changelog closeout
- **Objective:** Bring documentation in sync with everything Phases 0–3 actually changed, per `CURSOR_RULES.md`'s Documentation Rules ("whenever architecture changes, update `PROJECT_ARCHITECTURE.md`, `AI_ASSISTANT_SPEC.md`, `CHANGELOG.md`") and the Definition of Done's explicit requirements.
- **Files touched:** `docs/CHANGELOG.md` (moved there in Phase 0), `docs/PROJECT_ARCHITECTURE.md` (moved there in Phase 0), `README.md`.
- **Expected outcome:** Anyone reading the docs afterward sees Sprint 2's actual changes reflected, not just the plan.
- **What changes:**
  1. `docs/CHANGELOG.md` — add a new dated entry listing every Sprint 2 change (new `src/log.js`, new `initArchInteraction()`, `--text-faint` value change, `aria-live` rescoping, new SEO tags/files, doc reorg), following whatever entry format the existing changelog already uses (read it first — do not invent a new format).
  2. `docs/PROJECT_ARCHITECTURE.md` — add `src/log.js` to its module list/diagram, and a short note that architecture-node descriptions are now keyboard/tap-accessible (not hover-only). Do not rewrite unrelated sections of this doc.
  3. `README.md` — update the file-structure block (lines ~34-44) to list `scroll.js` (Sprint 1 — confirm it's already there; add if not) and `log.js` (Sprint 2); update the "Architecture" section's bullet for the Architecture section (currently says "hover-reveal descriptions" — line 57) to reflect keyboard/tap support too.
- **Validation checklist:**
  - [ ] `docs/CHANGELOG.md` has a new entry for Sprint 2, in the existing format.
  - [ ] `docs/PROJECT_ARCHITECTURE.md` lists every new/changed module from Phases 0–3.
  - [ ] `README.md`'s file tree and section descriptions match reality (spot-check every filename mentioned actually exists at that path).
  - [ ] No unrelated content in any of these three docs was rewritten or removed.

---

# Risks

- **Architectural risk — scope creep in `core.js`:** `initArchInteraction()` must stay a small, self-contained function. If implementing it reveals a need for a broader "component interaction" abstraction, stop and flag it — that would violate Rule 3 (No Large-Scale Rewrites) and is not approved.
- **Accessibility risk — over-scoping the mobile fix:** The instruction is "reachable on mobile," not "redesign the architecture section for mobile." Resist adding new mobile-only UI (accordions, modals, etc.) beyond what's needed to unhide the existing description text via tap/focus.
- **Accessibility risk — `aria-live` under/over-announcing:** If the chosen implementation still feels noisy in manual testing (e.g. because `aria-atomic="true"` behaves differently across screen readers), that's an acceptable partial win to ship, flagged for Sprint 3 — do not spiral into building a full notification/toast system to solve it (explicitly Out of Scope, per Sprint 1's own prior finding that no toast system exists).
- **Performance implication:** None of Sprint 2's changes touch the Three.js scene, GSAP, or Lenis — no performance-sensitive code is in scope. The only new runtime cost is a handful of DOM attribute writes and one small logging function call — negligible.
- **Future maintenance consideration:** `PROFILE.siteUrl` will be a placeholder until a real domain is deployed. Whoever eventually deploys this site for real must update it in exactly one place (`content.js`) and then manually mirror it into `index.html`'s static tags and `robots.txt`/`sitemap.xml` — this is a manual-sync limitation inherent to the zero-build architecture (the same limitation `PROFILE.email`/`PROFILE.resume` already have today with the existing OG tags). Not a new problem introduced by this plan, but worth flagging so it isn't forgotten.
- **Documentation risk:** Merging 12 fragments into 8 files by hand is mechanical but must be done carefully — losing or duplicating content during the merge would be worse than the current fragmented-but-complete state. Verify before deleting originals (see Phase 0 checklist).

---

# Testing Checklist

## Functionality
- [ ] Site loads with no changes to hero, about, projects, stack sections.
- [ ] Architecture nodes: mouse hover still reveals descriptions (unchanged desktop behavior).
- [ ] Architecture nodes: keyboard `Tab` + `Enter`/`Space` reveals/hides descriptions.
- [ ] Architecture nodes: tap reveals/hides descriptions on a touch/mobile-width viewport.
- [ ] AI assistant: open, ask a question, receive a streamed reply — identical visual behavior to Sprint 1.
- [ ] AI assistant: "download resume" chat command still triggers the same `triggerResumeDownload()` flow from Sprint 1.
- [ ] Résumé buttons (if ever wired to real DOM elements) still call the same canonical flow.
- [ ] Skip link (Sprint 1) still jumps to `#view` and receives focus.

## Accessibility
- [ ] `--text-faint` passes ≥4.5:1 contrast against both `--bg-0` and `--bg-1` (verify with devtools).
- [ ] Every interactive element remains reachable via `Tab` in a logical order (skip link → nav → hero CTAs → ... → architecture nodes → ... → assistant).
- [ ] `:focus-visible` rings (Sprint 1) still render correctly; the chat input's explicit focus ring still works.
- [ ] `aria-expanded` on architecture nodes toggles correctly and matches visible state.
- [ ] New `#assistantLive` region exists, is visually hidden (`.sr-only`), and updates once per completed assistant turn.
- [ ] `prefers-reduced-motion` still respected (unchanged from before Sprint 2 — verify no new animation was added that ignores it).

## Responsiveness
- [ ] Test at ≥3 widths: desktop (~1440px), tablet (~900px, just above/below the 980px breakpoint), mobile (~375px).
- [ ] Architecture section descriptions are reachable at all three widths.
- [ ] No layout breakage from the `.arch__desc` mobile CSS change (check for overlap, overflow, or clipped text).
- [ ] New skip link / live region introduce no visible layout shift.

## Console errors
- [ ] Zero uncaught errors in devtools console on initial load.
- [ ] Zero uncaught errors after: opening the assistant, sending 2-3 messages, triggering the résumé download, tabbing through the whole page, resizing the viewport across the 980px breakpoint.
- [ ] The résumé `console.warn` (expected, since `assets/resume.pdf` doesn't exist) still appears in its new `log.js`-routed form — confirm it's a `warn`, not an unhandled `error`.

## Regression (re-verify Sprint 1 work is untouched)
- [ ] `src/scroll.js` still the single scroll implementation; nav-link clicks, chat-tool navigation, and any anchor links still scroll correctly.
- [ ] `src/assistant/thinking.js` remains deleted; no re-introduction.
- [ ] `navigateTo` remains removed from `sections.js`.
- [ ] `triggerResumeDownload()` in `tools.js` unchanged in behavior (only its internal `console.warn` calls are re-routed through `log.js` in Phase 3).
- [ ] No file outside this plan's File-by-File list was modified.

---

# Out of Scope

Do **not** implement any of the following during Sprint 2 — they are explicitly deferred:

- **Moving LLM provider calls behind a serverless/backend proxy** (the API-key exposure risk in `providers.js`). This requires actual backend infrastructure that doesn't exist in this zero-build static site — a real architectural addition, not an incremental fix. Revisit only if/when a real API key is about to be configured for production.
- **Building a toast/notification UI system.** Already explicitly rejected once (Sprint 1 planning) as bigger-than-incremental UI work with no existing precedent in the codebase.
- **Splitting `content.js` into multiple domain files.** Still not urgent at its current size (~250 lines); revisit only once it grows meaningfully.
- **Replacing decorative SVG/CSS project mockups with real screenshots.** Unrelated to any Sprint 2 objective; a content/asset task, not a code task.
- **Adding conversation history persistence beyond `sessionStorage`, message regeneration/editing, or file attachments to the AI assistant.** Feature additions to the assistant pipeline are out of scope; Sprint 2 is accessibility/SEO/hygiene only.
- **Any redesign of the architecture section's visual layout.** The fix is "make existing content reachable," not "redesign this section."
- **Migrating away from the zero-build/no-framework architecture.** Never in scope, per `CURSOR_RULES.md` Rule 1 (non-negotiable).
- **Adding a real résumé PDF asset or fixing the underlying missing-asset problem.** Sprint 1 already made this fail gracefully (logged, not silent); actually sourcing a real PDF is a content task for the site owner, not an engineering task.
- **Any new npm dependency, bundler, or build step.** Not required for anything in this plan; do not introduce one "to make X easier."

---

# Definition of Done

Sprint 2 is considered complete only when every item below is checked — this is the authoritative closeout gate for the whole sprint, not just a summary of the phases above. Each item maps to specific work already described in this plan; nothing here should require new, unplanned scope.

- [ ] **All planned objectives are implemented.** All four objectives from Sprint 2 Goals (accessibility/mobile-content, documentation consolidation, SEO metadata, centralized logging) are done — i.e. Phases 0–3 are complete and each phase's own validation checklist passed.
- [ ] **No console errors are introduced.** Covered by the Testing Checklist's "Console errors" section — zero uncaught errors after a full manual pass (load, open assistant, send messages, download résumé, tab through the page, resize across the 980px breakpoint).
- [ ] **Lighthouse Accessibility score has not decreased.** Requires the Pre-Implementation Baseline score (captured before Phase 0) and a second Lighthouse run after Phase 1 (the only phase that touches accessibility-relevant markup/CSS). The after-score must be **≥** the before-score. If it decreased, do not proceed to Phase 2 — diagnose and fix first (Lighthouse will name the specific failing audit).
- [ ] **Mobile layout has been verified.** Covered by the Testing Checklist's "Responsiveness" section — explicitly includes verifying the architecture section at ≤980px no longer hides content, with no overlap/overflow regressions from the new `.arch__desc` mobile CSS.
- [ ] **Keyboard navigation is fully functional.** Covered by the Testing Checklist's "Accessibility" section — full `Tab` order reachable, architecture nodes toggle via `Enter`/`Space` with correct `aria-expanded`, Sprint 1's `:focus-visible` rings still render.
- [ ] **Existing functionality remains unchanged.** Covered by the Testing Checklist's "Regression" section — Sprint 1 work (scroll consolidation, dead-code removal, résumé flow) re-verified working exactly as before.
- [ ] **Documentation reflects all implemented changes.** Covered by Phase 4 — `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, and `README.md` all updated to match what was actually built (not just what was planned — re-check them against the real diff once Phases 0–3 are done, in case anything was adjusted from this plan's suggestions during implementation).
- [ ] **`CHANGELOG.md` has been updated.** The specific Phase 4 deliverable — note that by the time Phase 4 runs, this file lives at `docs/CHANGELOG.md` (moved there in Phase 0, per the mapping table in Repository Analysis). If Phase 0 is somehow skipped or reordered, update whichever path currently holds it (`change_log.md` at root, or `docs/CHANGELOG.md`) — do not create a second, duplicate changelog file at the other path.

---

## New Chat Handoff

Paste the following into a brand-new Cursor chat (Sonnet 5, high reasoning) to implement Sprint 2:

```
We previously completed a full repository analysis and produced an approved implementation plan for Sprint 2.

The plan is saved at docs/SPRINT_2_PLAN.md — read it in full before doing anything else.

Also read cursor_rules.md and follow it as the permanent engineering standard for this repository. Note: Phase 0 of this plan moves that file to docs/CURSOR_RULES.md — if it's already there when you start, read it from that path instead.

Your task: implement Sprint 2 exactly as described in docs/SPRINT_2_PLAN.md, phase by phase (Pre-Implementation Baseline → Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4), in order.

Requirements:
- Before writing any code, capture the Pre-Implementation Baseline (Lighthouse Accessibility score on the current, unmodified site) — you cannot prove the Definition of Done's "score has not decreased" requirement without this.
- Before writing any code, re-verify the specific files/lines docs/SPRINT_2_PLAN.md references are still accurate (the repo may have changed since the plan was written) — per the Golden Rule in cursor_rules.md, understand the repository before modifying it.
- Preserve the existing zero-build architecture and all current module boundaries. Do not introduce a framework, bundler, or new abstraction beyond what the plan explicitly specifies (e.g. src/log.js).
- Implement only what is listed under each phase's "Files touched" — do not expand scope.
- Do NOT implement anything listed under the plan's "Out of Scope" section.
- If you discover that any verified claim in docs/SPRINT_2_PLAN.md no longer matches the actual code (e.g. a line number shifted, a function was already changed, a file no longer exists), STOP, explain the discrepancy clearly, and wait for confirmation before continuing — do not silently improvise around it.
- Work through each phase's validation checklist before moving to the next phase.
- Do not consider Sprint 2 complete until every item in the plan's "Definition of Done" section is checked off — that section is the authoritative closeout gate, not just the per-phase checklists.
- After completing all phases, summarize exactly what changed, file by file, report the before/after Lighthouse Accessibility scores, walk through the Definition of Done checklist explicitly (checked or not, with reasons), and call out any deviation from the plan and why.

Wait for my go-ahead between phases if you're unsure, but you may proceed through all phases in one session if each phase's validation checklist passes cleanly.
```
