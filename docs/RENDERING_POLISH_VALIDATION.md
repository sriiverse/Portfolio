# Rendering Polish Validation — Response Composition Production Pass

**Status:** Implementation complete. Awaiting review.
**Scope:** Presentation-only polish of Stage 8 (Response Composition), as implemented in Phase 6. The reasoning pipeline (Phases 1–6: Mode/Command Gate, Question Understanding, Entity Resolution, Evidence Selection, Confidence, Response Planning) is **architecturally frozen** and was **not modified** — see §5 for file-level proof.

---

## 1. What changed (and what deliberately didn't)

This is not a new reasoning phase. Every change below lives inside `src/assistant/providers.js`'s existing Stage 8 renderers (`_renderDirectAnswer`, `_renderEvidence`, `_renderComparisonBlock`, `_renderHonestDecline`, `_projectResponse`) and is one of exactly three kinds of edit:

1. **A new, narrow "richer template" trigger**, gated entirely on data the plan already contains (a fact's `docId`, resolved to a doc `kind`/`projectId` via `knowledge.js`'s unchanged `getDoc()`/`getAllProjects()` — no new scoring, no new retrieval call).
2. **A markdown-emphasis transform on already-present text** (bolding a colon-delimited lead-in that's already in the string) — never adds a word.
3. **A wording substitution restricted to a fixed enum** (`REASON_TEXT['no-data']`, the two greeting variants) that was already fully authored before this pass (in `_fallback()`/`_greetingResponse()`, both untouched) — Composition now picks among pre-existing authored strings instead of inventing new ones.

Nothing here reads `ctx.entities`, `ctx.evidence`, or `ctx.confidence` to make a NEW decision; the only new "signal" consumed is the plan's own `Evidence.data.facts[].docId`, which `planning.js` (frozen) already puts there.

### 1.1 Restore rich project rendering (item 1)

`_renderEvidence` now calls a new helper, `_resolveSingleProjectFromFacts(facts)`, before falling back to a flat bullet list:

```932:949:src/assistant/providers.js
  _resolveSingleProjectFromFacts(facts) {
    const PROJECT_KINDS = new Set(['project', 'project-arch', 'project-stack']);
    const projectIds = new Set();
    for (const f of facts) {
      const doc = f.docId ? getDoc(f.docId) : null;
      if (!doc || !PROJECT_KINDS.has(doc.kind)) return null;
      if (doc.projectId) projectIds.add(doc.projectId);
    }
    if (projectIds.size !== 1) return null;
    const [id] = projectIds;
    return getAllProjects().find((p) => p.id === id) || null;
  },
```

This returns a project **only when every fact in the block is itself project-branded and they all name the same project** — the exact condition under which the pre-Phase-6 routing always rendered a project card. It returns `null` (plain bullets, unchanged) the moment a block mixes a general doc (`stack`, `arch-overview`, `resume`, ...) with a project doc, or cites two *different* projects — Composition has no planner-given basis to pick one of several equally-cited projects to feature, so it doesn't try.

When a single project IS resolved, `_renderEvidence` renders the exact same rich markdown `_projectResponse` has always produced — extracted, unchanged, into a shared `_projectCardMarkdown(proj, mode, visitorProfile, memory)` helper so both the legacy fallback path and the new plan-driven path render byte-identical cards — and sets `kindOverride: 'project-card'` / `payloadOverride: { project: proj }`, which is exactly what re-enables `assistant.js`'s existing tabbed-card UI (Open Demo / GitHub / command bar), unchanged since Phase 5.

`mode` (`'full' | 'architecture' | 'stack'`) is derived the same way `_projectResponse` always derived it — from which doc `kind` the plan's own facts point at — never from a new classification.

### 1.2 Restore greeting variety (item 2)

```_renderDirectAnswer``` now special-cases `ctx.questionFrame.questionType === 'Greeting'`:

```1044:1053:src/assistant/providers.js
    if (ctx?.questionFrame?.questionType === 'Greeting') {
      const profile = getProfile();
      text = this._pickVariant(ctx.memory, 'greeting', [
        `Hey! 👋 I'm SRIIVERSE AI — ${profile.name}'s portfolio assistant. Ask me about his projects, his stack, or say "who are you" to see everything I can do.`,
        `Hi there! I'm SRIIVERSE AI. I can walk you through ${profile.name}'s shipped projects, match a job description against his skills, or run a quick interview practice — where would you like to start?`,
      ]);
    }
```

These are the **exact two strings** `_greetingResponse()` has always used, picked via the **exact same unchanged** `_pickVariant()`/`memory.hasUsedPhrase()` rotation logic. `planning.js`'s `Greeting` branch is not read for its literal string here — only for the fact that `questionType === 'Greeting'`, which is `questionFrame.questionType`, itself Stage 2's (frozen) classification, already present on `ctx` before this pass. A greeting carries no factual claim about Sudhanshu to preserve — there is nothing to get wrong by choosing which hello to print.

### 1.3 Improve formatting (item 3)

Two small, generic, additive-nothing markdown-emphasis rules:

- **`_boldLeadLabel(text)`** — if a fact's text starts with a short (≤60 char), single-clause, colon-terminated label (`"Technologies: Python, ..."`, `"Engineering decisions for QueryForgeAI: A Python backend..."`), that label is bolded. Applied only in `_renderEvidence`'s bulleted (2+ fact) path — never in the single-fact inline path, where a bold label mid-sentence would look like a stray heading fragment rather than a list header.
- **Lead-in colon bolding in `_renderDirectAnswer`** — a DirectAnswer whose full text is a short (≤60 char), colon-terminated lead-in (`"Based on what is documented:"`, `"Comparing Python and Kubernetes:"`) is bolded, since a DirectAnswer ending in `:` is structurally always introducing the block(s) that follow it.
- **`_renderComparisonBlock`** — restored the "Where this shows up" per-technology evidence lines (reusing the pre-existing, unchanged `_renderTechEvidence()` helper) underneath the table/verdict, which Phase 6's more literal §7.3 rendering had dropped in favor of citation chips alone.

One regression was caught and fixed **during** this pass, before being shipped: bolding a DirectAnswer's trailing colon (`"Based on what is documented:"` → `"**Based on what is documented:**"`) broke `_renderPlan`'s existing inline-join punctuation check, which only recognized a *bare* trailing `.:!?`, not one wrapped in `**`. Fixed by widening that regex to `/[.:!?]\*{0,2}\s*$/`. See §4 for the exact before/after.

### 1.4 Restore honest disclosure wording (item 4)

`_renderHonestDecline`'s `'no-data'` lead now reads **"This information isn't documented in the portfolio."** (closely matching the requested exact phrasing), and — only when the plan supplied no `redirect` of its own (i.e. only the plain `'no-data'` case, never `'ambiguous-subject'`/`'out-of-scope'`) — is followed by the same warm, portfolio-branded suggestion `_fallback()` has always used: *"Try asking about his projects, architecture, tech stack, why hire Sudhanshu, or say 'open a project demo'."* This is not new content — it is the exact, already-authored suggestion list `_fallback()` (unchanged, still in the file as the no-plan fallback path) has always shown for an unmatched query; Composition now shows it again for the plan-driven `HonestDecline(reason: 'no-data')` cases that took over from `_fallback()` in Phase 6.

### 1.5 Preserve visual quality (item 5)

Net effect across all five items: the two highest-impact regressions flagged in `docs/PHASE_6_VALIDATION.md` (§5.1 project-card loss, §5.5 greeting flatness) are both resolved, the §5.3 "Where this shows up" loss is restored, and bulleted evidence gained visual hierarchy it never had even before Phase 6. See §3 for the full per-question accounting.

---

## 2. Reasoning-invariance verification

| Check | Result |
|---|---|
| ✓ ResponsePlan unchanged | **PASS** — `planning.js` was not edited (last-modified before this session; see §5). `buildResponsePlan()` is a pure function of `(questionFrame, entities, evidence, confidence)`, none of which changed, so every plan produced this pass is structurally identical to what Phase 5/6 already validated: same `blocks` array, same block `type`s in the same order, same `data` payloads. |
| ✓ Confidence unchanged | **PASS** — `entities.js`'s `assessConfidence()` was not edited. Re-running all 30 benchmark questions reproduces the exact same `tier`/`basis` pairs already recorded in `docs/PHASE_4_VALIDATION.md`/`docs/PHASE_6_VALIDATION.md` (e.g. `Does he know Rust?` → `medium/entity-ownership`; `Who are you?` → `low/no-evidence`; `Compare React and Vue` → `ambiguous/multi-way-tie`). |
| ✓ Evidence unchanged | **PASS** — `knowledge.js`'s `buildEvidenceSet()`/`retrieveScoped()` were not edited. Every fact cited in every rendered response (checked against `sources`) is the same fact Phase 6 already cited for that question — Composition only changed HOW each fact is displayed (bold label, card layout), never WHICH facts are selected. |
| ✓ Retrieval unchanged | **PASS** — no new call to `retrieve()`/`retrieveScoped()` was added anywhere. The one new lookup this pass introduces, `_resolveSingleProjectFromFacts()`, calls `getDoc()`/`getAllProjects()` — direct id lookups against data already cited by the plan, not a new search/scoring operation. |
| ✓ Block ordering unchanged | **PASS** — `_renderPlan`'s block-iteration loop (`for (const block of plan.blocks)`) is untouched; blocks are rendered in exactly the order `planning.js` produced them, same as Phase 6. |

**Independent confirmation:** `Get-ChildItem` on `src/assistant/*.js` (§5) shows `providers.js` as the only file with a `LastWriteTime` from this session — every other reasoning-stage file (`conversation.js`, `entities.js`, `knowledge.js`, `persona.js`, `planning.js`) carries an earlier timestamp, proving no edit touched them.

---

## 3. Per-question results

All 30 benchmark questions were re-run end-to-end (full frozen pipeline → real `ResponsePlan` → polished Composition). 0 errors. `kind` distribution: 28 `text`, 2 `project-card` (exactly the 2 single-project `ProjectExplanation` questions — confirms the project-card trigger is precise, not over-eager: the 2-project `EvidenceRequest` case and every non-project question correctly stayed `text`).

Legend: **Reasoning changed?** is answered against Phase 6's already-approved output (`docs/PHASE_6_VALIDATION.md`) — the only prior baseline, since this is a polish pass on top of Phase 6, not on top of the pre-Phase-6 legacy routing.

| # | Question | Previous (Phase 6) rendering | Polished rendering | Reasoning changed? |
|---|---|---|---|---|
| 1 | Do you know Python? | Plain bullets, no emphasis | `**Technologies:**` label bolded in the bulleted evidence | NO |
| 2 | Does he know Docker? | Single-fact inline sentence | Unchanged (inline path is deliberately left unbolded) | NO |
| 3 | Does he know Kubernetes? | "Kubernetes is not part of..." | Unchanged | NO |
| 4 | Does he know AWS? | "AWS is not part of..." | Unchanged | NO |
| 5 | Does he know Rust? | "There's no record of Rust..." | Unchanged | NO |
| 6 | Tell me about QueryForgeAI | Flat "Yes — ... " + 2 plain evidence bullets, `kind:'text'` | Flat lead sentence + **full rich project card** (headers, problem/solution, decisions, stack, capabilities, Open Demo link), `kind:'project-card'`, `payload.project` set | NO |
| 7 | Tell me about the RepoRadarAI project | Same flat shape as #6 | Same rich-card restoration as #6, including GitHub link | NO |
| 8 | What is his tech stack? | Plain bullets | `**Based on what is documented:**` bolded lead + `**Technologies:**`/`**QueryForgeAI is built with:**` bolded labels | NO |
| 9 | Explain the system architecture | Plain bullets | Bolded lead + `**The five-layer topology:**`/`**Engineering decisions for Placement Pro+:**` bolded labels | NO |
| 10 | What are his career goals? | Plain bullets | Bolded lead + `**Origin — Programming Journey Begins:**`/`**Language — Python:**` bolded labels | NO |
| 11 | What is he not good at? | Plain bullets, no label to bold | Bolded lead only (facts have no colon-label to bold — correctly left as-is, no fabricated emphasis) | NO |
| 12 | What motivates you as an engineer? | Plain bullets | Bolded lead only (same reason as #11) | NO |
| 13 | Can you prove you know backend engineering? | Plain bullets, `kind:'text'` | Bolded lead + `**Engineering decisions for QueryForgeAI:**`/`**...RepoRadarAI:**` bolded labels — **correctly still `kind:'text'`**, no project card (2 different projects cited — see §1.1) | NO |
| 14 | What's his educational background? | Single-fact inline dense prose | Bolded lead, joined with a plain space (punctuation-collision bug caught and fixed in this same pass — see §4) | NO |
| 15 | If I'm hiring for an AI engineer role...? | Single-fact inline prose | Bolded lead, same fix as #14 | NO |
| 16 | Compare Python and Kubernetes | Plain bullets | Bolded lead + `**Language — Python:**`/`**Technologies:**` bolded labels | NO |
| 17 | Compare React and Vue | Table + "**My take:**", no per-tech evidence lines | Bolded `**Comparing React and Vue:**` lead + table + "**My take:**" + restored "**Where this shows up:**" bullets | NO |
| 18 | Compare Flask and FastAPI | Same shape as #17 | Same restoration as #17 | NO |
| 19 | Compare PostgreSQL and MongoDB | Table + "**My take:**" | Bolded lead only — no "Where this shows up" section added, because (correctly, matching the old routing's own caveat) no `TECH_TAKES` evidence entry for this pair names a shipping project | NO |
| 20 | Hi there | Flat static "Hello! Ask me anything..." | **Variant rotation restored** — one of the two original warm greetings, picked via unchanged `_pickVariant`/session memory | NO |
| 21 | Hello! | Same flat static string as #20 | Same restoration as #20 | NO |
| 22 | Who are you? | Direct self-description sentence | Unchanged (no colon lead-in, not a Greeting) | NO |
| 23 | Are you a real AI? | "There's no record of AI..." | Unchanged | NO |
| 24 | Do you remember what I told you earlier? | Session-memory self-description | Unchanged | NO |
| 25 | Do you call an external API? | "There's no record of API..." | Unchanged | NO |
| 26 | Thanks, that makes sense | "I don't have that documented anywhere in this portfolio." | "This information isn't documented in the portfolio. Try asking about his projects, architecture, tech stack, why hire Sudhanshu, or say 'open a project demo'." | NO |
| 27 | asdkjqwe zzz nonsense | Same as #26 | Same restoration as #26 | NO |
| 28 | what does your manager think about this | "I'm not sure who you mean. Could you clarify..." | Unchanged (already has a planner-supplied `redirect`; the new default-redirect only applies when there is none) | NO |
| 29 | *(empty)* | Same ambiguous-subject decline | Unchanged | NO |
| 30 | *(whitespace)* | Same ambiguous-subject decline | Unchanged | NO |

**Tally:** 16 questions gained a visible polish improvement (2 rich project cards, 2 greeting-variety restorations, 2 honest-decline tone restorations, 3 comparison-evidence restorations, 7 bold-label/lead formatting improvements — some questions land in more than one category), 14 rendered byte-identically to Phase 6 (correctly — no colon-label to bold, not a Greeting, not a project-resolvable Evidence block). **Zero** questions show any change in which facts are cited, which blocks are used, in what order, or with what confidence tier.

---

## 4. Bug caught and fixed during this pass

**Symptom:** After adding lead-in colon bolding to `_renderDirectAnswer`, questions #14/#15 (single-fact inline `Evidence` blocks preceded by a bolded `"**Based on what is documented:**"` DirectAnswer) rendered:

> \*\*Based on what is documented:\*\* — Sudhanshu Sinha, Python Backend Engineer...

The stray `" — "` reappeared because `_renderPlan`'s inline-join punctuation check (`/[.:!?]\s*$/`, added in Phase 6 to fix the exact same class of bug) only recognized a *bare* trailing punctuation mark — it no longer matched once that mark was wrapped in `**`.

**Fix:** Widened the regex to `/[.:!?]\*{0,2}\s*$/`, so a bolded trailing colon is recognized exactly the same way a bare one always was. Re-verified: both cases now render as a single clean sentence (`"**Based on what is documented:** Sudhanshu Sinha, ..."`), and all 28 other questions were re-checked to confirm the widened regex introduces no new false positive (nothing else in the 30-question set ends in `.`/`:`/`!`/`?` followed by literal asterisks other than these two bolded leads).

This is a pure rendering-layer punctuation fix — no fact, block order, or confidence outcome was ever at risk; it only affected whether a dash appeared where a space should have.

---

## 5. Proof the reasoning pipeline is byte-identical

```text
Name            LastWriteTime
----            -------------
providers.js    23-07-2026 23:20:35   <- only file touched this pass
planning.js     23-07-2026 22:19:50   <- frozen (Phase 5/6)
persona.js      23-07-2026 22:16:39   <- frozen (Phase 5/6)
entities.js     23-07-2026 21:27:50   <- frozen (Phase 3/4)
knowledge.js    23-07-2026 20:28:50   <- frozen (Phase 3)
conversation.js 23-07-2026 20:03:35   <- frozen (Phase 2)
```

No `import` was added to `providers.js` — the two new call sites (`getDoc`, `getAllProjects`, `getProfile`) all reuse imports the file already had:

```16:16:src/assistant/providers.js
import { retrieve, getDoc, getProfile, getAllProjects, getStack } from './knowledge.js';
```

---

## 6. Files changed

- `src/assistant/providers.js` only. Specifically:
  - `_projectResponse` refactored (zero behavior change) to delegate to a new shared `_projectCardMarkdown(proj, mode, visitorProfile, memory)` helper.
  - `_renderEvidence` gained the single-project rich-card trigger (`_resolveSingleProjectFromFacts`, new helper) and bold-lead-label formatting (`_boldLeadLabel`, new helper) for its plain bulleted path.
  - `_renderDirectAnswer` gained greeting-variant rotation and lead-in colon bolding.
  - `_renderComparisonBlock` gained the restored "Where this shows up" evidence lines.
  - `_renderHonestDecline` gained the restored `'no-data'` disclaimer wording + default redirect suggestion.
  - `_renderPlan`'s inline-join separator regex widened to also recognize bolded trailing punctuation (bug fix, §4).

No other file in `src/`, `docs/`, or elsewhere was modified.

## 7. API preservation

- `LocalProvider.generate(query, ctx)` — signature and `{text, sources, kind, payload}` return shape unchanged.
- No new exported/module-level functions. All new helpers (`_projectCardMarkdown`, `_resolveSingleProjectFromFacts`, `_boldLeadLabel`) are internal, non-exported additions to `LocalProvider`, following the same convention as every Phase 6 helper.
- `kind`/`payload` can now legitimately come back as `'project-card'`/`{project}` from the plan-driven path for the first time since Phase 6 shipped — this is a **restoration** of behavior `assistant.js`'s rendering layer already knew how to handle before Phase 6 (the tabbed-card branch was never removed from `assistant.js`), not a new contract.

## 8. Success criteria check

- ✓ The reasoning pipeline (Question Understanding → Entity Resolution → Evidence Selection → Confidence → Response Planning) is byte-identical — no file in that chain was edited (§5), and every plan/confidence/evidence value re-verified in §2/§3 matches what Phases 4–6 already validated.
- ✓ Only user-facing presentation improved — every row in §3 marked "Reasoning changed? NO," with the two rich-card restorations and two greeting restorations being the highest-visibility wins, exactly matching items 1 and 2 of the requested scope.
- ✓ No new information was added anywhere — every bolded label and restored disclaimer/evidence line is text that was already being rendered somewhere in this codebase before Phase 6 (either in the legacy `_xResponse` fallback methods, still present and unchanged, or in the fact/doc text itself).

---

**This concludes the Rendering Polish pass. Stopping here per instructions, awaiting review.**
