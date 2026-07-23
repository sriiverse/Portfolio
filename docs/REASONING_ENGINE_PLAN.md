# REASONING_ENGINE_PLAN.md

> Project: **SRIIVERSEAI**
>
> Version: 1.0
>
> Status: **DRAFT — architecture proposal only. No source code has been modified. This document does not implement anything.**
>
> Scope note: this plan was produced by reading `docs/AI_EVALUATION_SUITE.md`, `docs/AI_ASSISTANT_SPEC.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/CONVERSATION_INTELLIGENCE_PLAN.md`, `docs/SPRINT_3_PLAN.md`, and `docs/CURSOR_RULES.md`, then re-reading the live implementation line-by-line: `src/assistant.js`, `src/assistant/conversation.js`, `src/assistant/providers.js`, `src/assistant/persona.js`, `src/assistant/knowledge.js`, `src/assistant/memory.js`, `src/assistant/jdmatch.js`, and `src/content.js`. Every claim below traces to a specific function, regex, or data structure in the current repository — not a hypothetical future state.

---

# 1. Executive Summary

The Conversation Intelligence upgrade (documented in `docs/CONVERSATION_INTELLIGENCE_PLAN.md`) fixed four specific reported bugs by inserting one new classification step — `assistant/conversation.js` — ahead of knowledge retrieval. It worked, and it worked by the same method every prior sprint used: find the broken example, trace the exact code path, write a regex or a branch that intercepts it. That method has now been run three times (Sprint 3's intent additions, the Conversation Intelligence upgrade's move detection, and implicitly every `_xResponse` method added since v1). `docs/AI_EVALUATION_SUITE.md` — 203 questions, 41 explicitly predicted gaps — is what happens when that method is pointed at the *next* 200 questions instead of the next 4. The result is not 41 new regexes to write. It is **8 recurring architectural gaps**, each one manifesting across 5–30 questions apiece, because the underlying pipeline has no concept of them at all.

The core finding: **this assistant has a Question *Answering* pipeline (retrieve → route by document kind → render a hardcoded template), not a Question *Understanding* pipeline.** Every one of the 8 clusters in Section 3 is a different symptom of the same shape of gap — the system is missing a structured, reusable representation for something (the question's subject, its entities, the conversation's state, its own confidence, or a response's composition), and instead re-derives an ad hoc, narrow answer to that missing representation every time a new capability is bolted on. That is why "do you know Python?", "do you know Docker?", and "do you know Flask?" are not three separate retrieval bugs — they are one missing capability (**Evidence Selection scoped by a Skill-Verification question type**) manifesting through three different nouns. It's also why "does he know Kubernetes?" and "would he recommend X?" are not twenty separate missed regexes — they are one missing capability (**subject/person resolution during Question Understanding**) manifesting through twenty different verbs.

This plan proposes evolving the current pipeline toward the seven-stage shape the user specified — **Question Understanding → Entity Resolution → Conversation Context → Evidence Selection → Confidence → Response Planning → Response Composition** — as an **additive, incremental evolution**, not a rewrite. Every existing module keeps its name and its charter; two new small, pure, single-purpose modules are added (`assistant/entities.js`, `assistant/planning.js`), following the exact justification method `docs/CONVERSATION_INTELLIGENCE_PLAN.md` already established and proved out for `conversation.js`/`persona.js`. Nothing here proposes a real LLM, embeddings, or a network call — the entire design remains fully offline, deterministic, and framework-free, per `docs/CURSOR_RULES.md`'s non-negotiable principles. What changes is that the system gains explicit, reusable, typed representations of *what kind of question this is*, *what it's about*, *what's already been established in this conversation*, *how confident the evidence is*, and *what shape the answer should take* — each computed once, each consumed by every capability, instead of being silently re-derived (or never derived at all) inside dozens of independent, hand-written composer methods.

---

# 2. Current Pipeline (As-Built, Verified Against Live Code)

## 2.1 The documented 13-step pipeline

`src/assistant.js`'s header (and `docs/PROJECT_ARCHITECTURE.md`'s "Assistant Lifecycle") describes:

```
Mode Gate (interview.js active?)
 ↓
1. INTENT          classifyIntent(query)                    — regex, 17 branches
 ↓
2. AWARENESS       buildAwarenessContext()                  — website state string
 ↓
3. CONTEXT         resolveContext(query, intent)             — pronoun + explicit-project matching
 ↓
4. PROFILE         memory.profile (VisitorProfile)           — recruiter/engineer/founder/student scoring
 ↓
5. STRATEGY        analyzeStrategy(query, ctx)                — conversation.js, 7 ordered checks
 ↓
6+7. KNOWLEDGE + MEMORY  (inside provider.generate())
 ↓
8. PROACTIVE TOOL   runProactiveTool(intent, focusProject)
 ↓
9. PROVIDER         provider.generate(query, ctx)             — LocalProvider by default
 ↓
10. TOOL EXECUTION  decideTool() / runTool()
 ↓
11. RICH RESPONSE   streaming + markdown + cards
 ↓
12. WORKSPACE       panel expand-state
 ↓
13. FOLLOW-UPS      buildFollowups(intent, payload, focusProject, strategy)
```

## 2.2 What actually decides the answer, once you're inside step 9

This is the part `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s "Problem Analysis" already exposed once, and it is still true today for every query strategy doesn't intercept:

```96:160:src/assistant/providers.js
async generate(query, ctx = {}) {
    if (ctx.intent === 'jd-match') return this._jdMatchResponse(query);

    const strategy = ctx.strategy;
    if (strategy) {
      if (strategy.move === 'greeting') return this._greetingResponse(ctx);
      if (strategy.move === 'identity') return this._identityResponse();
      if (strategy.move === 'comparison' && strategy.scope === 'tech') return this._techComparisonResponse(strategy);
      if (strategy.move === 'comparison' && strategy.scope === 'project') return this._comparisonResponse(query, retrieve(query, 5));
      if (strategy.move === 'opinion') return this._opinionResponse(strategy);
      if (strategy.move === 'experience') return this._experienceResponse(strategy, query);
      if (strategy.move === 'explanation' && strategy.scope === 'portfolio') { /* getDoc('arch-overview') */ }
      if (strategy.move === 'explanation' && strategy.scope === 'project' && strategy.projectId) { /* getDoc(project-arch) */ }
    }

    const hits = retrieve(query, 5);
    if (!hits.length) return { text: this._fallback(ctx), sources: [], kind: 'text', payload: null };

    const top = hits[0].doc;
    // Route by top document kind — this is still the router for
    // everything strategy doesn't already intercept:
    if (top.kind === 'project' || 'project-arch' || 'project-stack') { /* _projectResponse */ }
    if (top.kind === 'stack') return this._stackResponse(hits);
    if (top.kind === 'arch' || 'arch-overview') return this._archResponse(top, hits);
    if (top.kind === 'recommend') return this._recommendResponse(top, ctx);
    if (top.kind === 'profile') return this._profileResponse(top, ctx);
    if (top.kind === 'resume') return this._resumeResponse(hits);
    if (/compare|vs\.?|versus|difference between/i.test(query)) return this._comparisonResponse(query, hits);
    return { text: top.text, sources: hits.slice(0, 3).map((h) => h.doc), kind: 'text', payload: null };
}
```

**`conversation.js`'s strategy layer is a set of 7 hand-picked, high-precision escape hatches out of a retrieval-first system, not a general reasoning layer.** Its own header says so explicitly: *"anything ambiguous falls through to `move: 'factual'`, which reproduces today's exact retrieval-first behavior."* That is the correct, safe design for the four bugs it was built to fix — but it means every one of `docs/AI_EVALUATION_SUITE.md`'s 203 questions that doesn't match one of those 7 regex families lands right back in the pre-Conversation-Intelligence world: **the winning document's `kind` field is the only router, decided purely by keyword/stem overlap, computed *before* anyone asks what kind of answer the question actually wants.**

## 2.3 What the current pipeline gets right (must be preserved, not rewritten)

- **`classifyIntent()`'s command detection** (`action-nav`, `action-demo`, `action-github`, `action-contact`, `action-highlight`, `action-resume`, `jd-match`, `interview`) is *correctly* regex-based — these are literal imperative commands ("open the demo", "download resume"), not semantic reasoning, and `docs/AI_EVALUATION_SUITE.md`'s Section 7 rates Tool Calls and Navigation as **Strong**. Nothing in this plan should touch this.
- **`jdmatch.js` and `interview.js`'s stateless, provider-agnostic, UI-agnostic contract** is the right shape for a self-contained capability and is followed exactly by this plan's new modules.
- **`conversation.js`'s "fail closed, fall through to `factual`" design** is the single most important safety property in the current architecture — it is why the Conversation Intelligence upgrade could not regress anything. This plan's new stages inherit that property explicitly (Section 9).
- **The rendering pipeline** (`renderer.js`, `streaming.js`, markdown/citation/card rendering) is untouched by every failure cluster below and is untouched by this plan.

---

# 3. Failure Cluster Analysis

`docs/AI_EVALUATION_SUITE.md`'s 41 `⚠ Predicted Gap` annotations were re-read as a dataset, not a list. Grouping them by *underlying mechanism* (not by category, not by keyword) collapses them into **8 clusters**. Every cluster below names the architectural capability that is missing, not the individual questions that expose it — per the explicit instruction, "Do you know Python / Docker / Flask" is one row, not three.

| # | Cluster | Missing capability | Representative questions (eval suite) | Approx. blast radius |
|---|---|---|---|---|
| A | Second-person-only pattern matching | Subject/person resolution during understanding | Q167, Q168, and implicitly any third-person rephrasing of Q21–26, Q121–124, Q144–148 | 20–40+ questions if re-asked in third person |
| B | Document-kind routing conflates topic with question type | Question-type-aware evidence selection | Q55, Q59, Q63, Q67, Q71, Q75, Q78, Q81, Q84, Q87 ("do you know/use X") | ~24 Skill-Verification/Technology questions |
| C | Duplicated, inconsistent entity extraction | A single canonical Entity Resolution stage | Q166, Q168 (Go, Rust — invisible), Q13/Q193 (SKILLS_TAXONOMY gaps), Q149–151 (strengths routing) | ~15–20 questions |
| D | No explicit confidence signal | Confidence tiering over evidence | Q45, Q94 (depth-probing), Q175 (composite messages), the Example-4 "explain the architecture" 4.5-vs-4.75-vs-5.32 knife-edge finding from `docs/CONVERSATION_INTELLIGENCE_PLAN.md` | Cross-cutting — affects every retrieval-fallback question |
| E | Response composition hardwired per-composer | A shared Response Planning layer over reusable blocks | Q149–151 (strengths), Q152–154 (weaknesses), Q161–164 (self-disclosure) | ~15 questions, but the *pattern* affects any future capability |
| F | Conversational state is scalar breadcrumbs, not structured | A Discourse State model | Q179, Q182 (ellipsis follow-ups), Q187 (post-interview), Q195 (post-JD-match) | ~10 multi-turn questions, growing every sprint |
| G | No self-model / meta-cognition | An assistant self-description capability | Q161, Q162, Q163, Q164 | 4 questions today, but a *category*, not an edge case |
| H | Single-pass, single-answer message handling | Composite question decomposition | Q175 | 1 question today, unbounded exposure as real visitors type naturally |

---

# 4. Root Cause Analysis

For each cluster: the exact code-level cause, the architectural limitation it reveals, and why it gets *worse*, not better, as the assistant grows.

## 4.A — Second-person-only pattern matching

**Root cause.** Every high-precision regex in `conversation.js` is written against second-person surface forms:

```26:32:src/assistant/conversation.js
const IDENTITY_RE = /\b(who are you|what are you|introduce yourself|what is sriiverse\s*ai|what can you do|what do you do)\b/i;
const OPINION_RE = /\b(prefer|would you (use|choose|recommend|pick)|your opinion|which\s+\w+\s+(would you|do you)\s+(use|choose|recommend|pick)|what.*(is|'s)?\s*(better|best))\b/i;
const EXPERIENCE_RE = /\b(have you (built|worked|shipped|used)|what projects.*(demonstrate|show|use|involve)|your\s+(backend|frontend|database|ai|full.?stack)\s+experience|tell me about your.*experience)\b/i;
```

`OPINION_RE`'s and `EXPERIENCE_RE`'s trigger phrases are hardcoded to "you"/"your". A visitor asking **about Sudhanshu**, in the third person — "does he prefer Postgres or Mongo," "has he worked with AWS," "what's his backend experience" — matches **none** of these patterns, because the regex author had to write "you" literally into the pattern for every single trigger phrase, and did not (and structurally could not, with this design) also write "he"/"his"/"Sudhanshu" into every one.

**Architectural limitation.** There is no step in the pipeline that normalizes *who the question is about* into a canonical subject before pattern-matching runs. Person (1st/2nd/3rd) is entangled inside each individual trigger regex instead of being resolved once, up front, as its own typed fact. This is not a missing regex — it's a missing **layer**: subject resolution needs to happen *before* move-detection, so move-detection can match against a person-neutral canonical form ("PREFER + database", not "you prefer" vs. "he prefers" vs. "would Sudhanshu prefer").

**Scalability impact.** Every new trigger phrase added to `conversation.js` (and there will be more, per Section 6.6 of `docs/AI_EVALUATION_SUITE.md`'s "recommendations") must be hand-duplicated in second- and third-person form, forever, with no mechanism to catch a phrase where the author forgot the third-person variant. The regex count grows linearly with capability count *and* with person-variant count — a multiplicative growth curve the current design has no way to collapse.

## 4.B — Document-kind routing conflates topic with question type

**Root cause.** `LocalProvider.generate()`'s fallback routing switch is keyed on `top.doc.kind` — a property of the *document that won retrieval* — not on any property of *what the question is asking for*:

```147:151:src/assistant/providers.js
if (top.kind === 'stack') return this._stackResponse(hits);
```

`_stackResponse()` is a single hardcoded method that always renders the full 19-item technology stack card, regardless of whether the query was "what's your full stack?" (a genuine inventory request) or "do you know Docker?" (a yes/no + evidence question that happens to retrieve the `stack` doc as its top hit because "Docker" is a `stack` tag). `docs/AI_EVALUATION_SUITE.md`'s Section 2.3 success criteria for exactly this question ("avoids dumping the entire tech stack in response to a single yes/no question") is **structurally unmeetable** by the current routing design — not because the composer is badly written, but because the routing key (`doc.kind`) has no way to distinguish these two question shapes; they retrieve the identical document.

**Architectural limitation.** The system conflates two independent axes that should be resolved separately: **what is this about** (topic — correctly solved by retrieval scoring) and **what shape of answer does the question want** (type — never resolved anywhere). `conversation.js`'s 7 moves partially address this for a *narrow* slice (greeting/identity/comparison/opinion/experience/explanation), but `SkillVerification` ("do you know X?") is not one of the 7 moves, so every single-technology yes/no question still falls through to the doc-kind router and gets whichever composer happens to own that doc's `kind` — usually the wrong shape of answer.

**Scalability impact.** `docs/AI_EVALUATION_SUITE.md` alone identified ~24 questions in exactly this shape (one per technology: Python, SQL, React, Flask, FastAPI, Docker, PostgreSQL, MongoDB, REST, Auth...). Fixing them one at a time — a new `if (query mentions "docker" && /do you (know\|use)/)` branch per technology — is exactly the anti-pattern the user's prompt warns against ("one architectural problem, not three bugs"). The correct fix generalizes across all current *and future* technologies in `SKILLS_TAXONOMY`/`STACK` in one pass; the wrong fix requires a new branch every time a new technology is added to the stack, forever.

## 4.C — Duplicated, inconsistent entity extraction

**Root cause.** There are, today, **four independent, differently-scoped implementations** of "find the named thing in this text":

1. `jdmatch.js`'s `matchTaxonomyEntities()` — matches against `SKILLS_TAXONOMY`'s aliases (skills/tech only).
2. `assistant.js`'s `resolveContext()` — matches against `PROJECTS[].id`/`.name` only (projects only), plus a separate pronoun-heuristic (`/\b(it|that|this|its|second|third...)\b/`).
3. `conversation.js`'s `resolveComparison()`/`resolveOpinion()` — reuses (1) for tech, and independently re-implements project matching (duplicating a *third* copy of the project-name-matching logic already in (2)).
4. `providers.js`'s `_experienceResponse()` — yet a *fourth*, ad hoc implementation: strips a hand-maintained stopword set (`_EXPERIENCE_STOPWORDS`) from the raw query and substring-searches project text directly, with no taxonomy at all.

None of these four communicate with each other, and — critically — **none of them distinguishes three different outcomes that are currently collapsed into one**: an entity that is *known and owned* (Python), an entity that is *known and explicitly not owned* (AWS, Kubernetes — present in `SKILLS_TAXONOMY` specifically as gap-tracking data), and an entity that the system has *never heard of at all* (Go, Rust — absent from every data structure in the codebase). A query about Go and a query about Kubernetes currently produce the same downstream behavior (zero tag/entity hits → `_fallback()`), even though the *correct* answers are meaningfully different in confidence and phrasing ("that's not part of the current stack" vs. "I don't have anything on that").

**Architectural limitation.** Entity resolution has no single owner and no shared vocabulary of outcomes. It is re-derived, at different quality levels, by whichever module happens to need it that sprint.

**Scalability impact.** Every new module that needs to know "what technology/project is this query about" (and there have been four so far, one per sprint) either duplicates existing logic or reinvents a narrower version of it. The `_EXPERIENCE_STOPWORDS` set in particular is a hand-maintained list that silently drifts out of sync with `SKILLS_TAXONOMY`'s alias list — a second, informal taxonomy nobody is required to keep matching the first.

## 4.D — No explicit confidence signal

**Root cause.** `knowledge.js`'s `retrieve()` computes a numeric score per document and returns whatever clears a flat `> 0.5` threshold, sorted descending — with no representation of *how much better* the winner was than the runner-up:

```248:259:src/assistant/knowledge.js
export function retrieve(query, limit = 4) {
  const scored = docs.map((doc) => ({ doc, score: scoreDoc(doc, queryTokens, queryStems) }))
    .filter((r) => r.score > 0.5).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
```

`docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s own hand-traced "Example 4" table is the clearest existing proof this is a real, live problem: `arch-overview` (4.5), `project-arch-queryforge`/`project-arch-placementpro` (4.75), `project-arch-reporadar` (5.32) — four documents within 0.82 points of each other, on the single most generic possible query ("explain the architecture"), with the system committing 100% to the top score and expressing zero awareness that three other candidates were nearly as strong. That specific case was patched by giving `explanation`-move queries a deterministic override — but the *general* problem (any retrieval-fallback query can land on a knife-edge, winner-take-all decision with no signal that it was one) was not solved; it was routed around for one query shape.

**Architectural limitation.** Confidence is a transient number used once, inside one function, then discarded. There is no persistent, typed representation of "this was a confident, singular match" vs. "this was a close multi-way tie" vs. "nothing cleared the bar at all" that any downstream stage (response planning, honest-degradation phrasing, composite-message handling) can consult.

**Scalability impact.** Every one of `docs/AI_EVALUATION_SUITE.md`'s 24 "High hallucination risk" questions (Section 5.3) depends entirely on `_fallback()`'s generic wording being *confident and specific* rather than evasive — but the system currently cannot distinguish "confidently nothing exists" from "retrieval simply lost a close race" internally, so it can't modulate that phrasing even if a future composer wanted to. As the knowledge base grows (more projects, more stack entries, more `TECH_TAKES` pairs), near-tie collisions like Example 4 become *more* frequent, not less — more documents competing for the same query tokens — while the system's ability to detect that it's happening stays at zero.

## 4.E — Response composition hardwired per-composer

**Root cause.** Every `_xResponse` method in `providers.js` is a single function that *both decides what facts to include* and *formats them as a specific markdown string*, with no shared intermediate representation between the two:

```548:566:src/assistant/providers.js
const text = [
  `## Why Hire Sudhanshu Sinha`, ``, lead, ``,
  orderedProjects.map((p) => `- **${p.name}** — ${p.tagline}`).join('\n'), ``,
  `### 💪 What He's Strongest At`,
  `- **Python Backend Engineering** — Flask/FastAPI services, REST APIs, JWT auth, business logic`,
  `- **Applied AI** — LLM integrations that ship as product features, not demos`,
  ...
].filter(Boolean).join('\n');
```

The "💪 What He's Strongest At" bullet list — a perfect, ready-made answer to `docs/AI_EVALUATION_SUITE.md`'s Q149 ("what are his greatest strengths?") — exists **only** as inline markdown strings hardcoded inside `_recommendResponse()`, reachable **only** when `ctx.intent === 'recruiter'`. There is no representation of "here is a reusable fact block: Sudhanshu's top strengths" independent of that one method's one markdown template. Likewise, `SKILLS_TAXONOMY`'s explicitly-flagged not-owned skills (the honest, ready-made answer to Q152, "what are his weaknesses?") is read **only** by `jdmatch.js`, for scoring a pasted JD — no composer anywhere else even imports it.

**Architectural limitation.** "What facts should this answer contain" and "how should those facts be formatted as markdown" are fused into one function per doc-kind/strategy-move combination. There is no shared vocabulary of reusable answer *components* (a strengths list, a gap list, an evidence citation, an honest-decline sentence) that any qualifying question — regardless of which regex happened to fire — can assemble from.

**Scalability impact.** Every new question *shape* that wants to reuse an existing fact (as Q149–154 do) requires either duplicating that fact's markdown into a new composer, or widening an existing composer's trigger condition (risking regressions in what it already correctly serves). Neither scales: fact duplication drifts out of sync over time (the exact risk `docs/PROJECT_ARCHITECTURE.md`'s "Architectural Risks" section already flags for `content.js`'s growth, here recurring one level up in `providers.js`), and widening trigger conditions is precisely the kind of ad hoc, one-off patching this plan exists to move away from.

## 4.F — Conversational state is scalar breadcrumbs, not structured

**Root cause.** `memory.js`'s conversational-context fields were added one at a time, one per sprint, each a single scalar with a narrow purpose: `lastProject` (v1, a project id string), `activeTopic` (Sprint 3, an intent-label string), `usedPhraseKeys` (Sprint 3, a Set of shown-phrase-keys for repetition avoidance). None of these three fields talk to each other, and none of them records the *shape* of the previous question — only its topic label:

```201:206:src/assistant.js
function buildFollowups(intent, payload, focusProject, strategy) {
  const continuingSameTopic = memory.activeTopic === intent;
```

A follow-up like "...and SQL?" (`docs/AI_EVALUATION_SUITE.md`'s Q182) needs to know that the *previous question's template* was "what's X used for in your projects" so it can substitute SQL for Python — but `activeTopic` only stores `'stack'` or `'python'` (a topic/intent label), never the question's shape. Similarly, nothing in `memory.js` records "we just completed a JD-match analysis and here's what it concluded" (Q195) or "we just finished an interview session on this topic" (Q187) in a form any later turn could read back.

**Architectural limitation.** Conversational state is a loose bag of independently-motivated scalar fields bolted onto `Memory` incrementally, rather than one structured, versioned "what do we currently know about this conversation" model that every new capability is expected to read from and write to.

**Scalability impact.** Every sprint that needs a new piece of conversational context (and there have been three so far: `lastProject`, then `activeTopic`+`usedPhraseKeys`) adds one more independent field with its own ad hoc semantics, its own save/load logic in `_load()`/`_save()`, and no relationship to the others. This is the same "fields added ad hoc, forever, no shared model" pattern as Cluster C's entity extraction, one layer up — and it is why the eval suite's hardest multi-turn questions (Q179, Q182, Q187, Q195) are hard: they need *composed* context (topic + shape + pending-result), and no single field, nor any combination of the three existing ones, represents that.

## 4.G — No self-model / meta-cognition

**Root cause.** `persona.js` was introduced specifically to hold "the assistant's own authored voice" — but its two exports, `ASSISTANT_CAPABILITIES` and `TECH_TAKES`, describe *what the assistant can help with* and *what it thinks about technology*. Neither describes *what the assistant fundamentally is* — deterministic, local, offline, `LocalProvider`-by-default with a swappable-but-currently-inert remote-provider registry, session-scoped (`sessionStorage`) memory. `docs/PORTFOLIO_AUDIT.md` (read during the evaluation-suite task) had already identified this exact gap as the single biggest credibility risk to an AI-focused portfolio, *before* `docs/AI_EVALUATION_SUITE.md` operationalized it into Q161–164.

**Architectural limitation.** There is no data structure anywhere in the codebase representing the assistant's own operating characteristics as queryable facts — self-description is treated as out of scope for `persona.js`'s "voice" charter and out of scope for `content.js`'s "portfolio data" charter, so it has fallen into the gap between the two and been implemented nowhere.

**Scalability impact.** This is not an edge case that will fix itself — it is a *category* of question ("are you real," "can you access the internet," "do you remember me") that will keep growing as the assistant grows more capable and technically sophisticated visitors keep probing exactly this boundary. Every additional capability added to the assistant (per this very plan) makes the gap between "what it can do" and "what it honestly is" larger, not smaller, if this category continues to have no home.

## 4.H — Single-pass, single-answer message handling

**Root cause.** Both `analyzeStrategy()` and `retrieve()` operate on one message as one indivisible unit and produce exactly one decision. A message bundling several sub-questions ("what languages do you use and also do you use Docker and what's your architecture" — Q175) tokenizes into one combined token/stem set, scores against the document index once, and returns one winning document — the other two topics' tokens simply blend into the scoring math as noise rather than being recognized as separate questions at all.

**Architectural limitation.** There is no decomposition step anywhere in the pipeline. This is a structural ceiling of the current single-pass design, not a missing regex — no amount of additional pattern-matching inside a single-pass architecture can make it answer three questions with three answers.

**Scalability impact.** Currently exposed by exactly one eval-suite question, but real visitors write exactly this way constantly (it is, if anything, the *most* natural way to type into a chat box), so the actual exposure in production is almost certainly far higher than the eval suite's single explicit test case suggests.

---

# 5. Proposed Reasoning Pipeline

## 5.1 Design principle

Each cluster in Section 4 is missing exactly one **typed, reusable representation** — not a fix, a *representation*. The proposed pipeline introduces exactly one new stage per missing representation, in the order the user specified, and every stage produces a plain-data object (no rendering, no DOM, no provider calls — the same contract `jdmatch.js`, `interview.js`, and `conversation.js` already follow). A stage that finds nothing confident **always** falls through, never guesses — inheriting `conversation.js`'s proven "fail closed" property (Section 2.3) at every single new stage, not just the first one.

## 5.2 The pipeline

```
User Input
 ↓
[COMMAND GATE]           looksLikeJobDescription() / interview trigger / classifyIntent()'s
                          literal action-* regexes — UNCHANGED. Genuine imperative commands
                          short-circuit everything below, exactly as today. Regexes are the
                          right tool here; this stage is deliberately NOT touched by this plan.
 ↓  (falls through if no literal command matched)
1. QUESTION UNDERSTANDING     buildQuestionFrame(query, ctx)
   → { questionType, subject, polarity, requiresEvidence }
   Absorbs conversation.js's 7 moves + classifyIntent()'s non-command branches
   (recruiter/architecture/stack/comparison/profile/project/resume/question)
   into ONE typed frame, resolved against a canonical (person-neutral) subject.
 ↓
2. ENTITY RESOLUTION          resolveEntities(query, questionFrame)
   → [{ type, canonical, ownership: 'owned'|'gap'|'unknown', confidence }]
   ONE resolver, reused by every stage below, replacing 4 duplicated
   implementations (Cluster C).
 ↓
3. CONVERSATION CONTEXT       discourse.resolve(questionFrame, entities)
   → merges with discourse.update() after response — structured state:
   { lastQuestionFrame, focusEntities, pendingResult, sessionFacts }
   Evolves memory.js's activeTopic/lastProject/usedPhraseKeys into one
   coherent model (Cluster F) — same module, richer shape.
 ↓
4. EVIDENCE SELECTION         selectEvidence(questionFrame, entities, discourse)
   → { primaryFacts, supportingDocs, gapNotes }
   Evolves knowledge.js's retrieve() to be scoped BY questionType + entity
   ownership, not run as an undifferentiated keyword race (Cluster B).
 ↓
5. CONFIDENCE                 assessConfidence(evidence, entities)
   → 'high' | 'medium' | 'low' | 'ambiguous'
   New, small, explicit synthesis step (Cluster D) — makes today's
   implicit, discarded score numbers into a persistent, typed signal
   every later stage can read.
 ↓
6. RESPONSE PLANNING          buildResponsePlan(questionFrame, entities, discourse, evidence, confidence)
   → ordered list of typed blocks: DirectAnswer, EvidenceCitation,
     ComparisonTable, HonestGapDisclosure, RecruiterFraming, FollowupHint...
   Decides WHAT to say, from a small shared vocabulary of blocks that ANY
   qualifying question can assemble from (Cluster E) — not one bespoke
   method per doc-kind.
 ↓
7. RESPONSE COMPOSITION       providers.js renders each block → markdown
   Purely mechanical: block type → markdown fragment. No decisions left
   here. Feeds the EXISTING renderer.js/streaming.js pipeline, unchanged.
 ↓
[TOOL EXECUTION / RICH RESPONSE / WORKSPACE / FOLLOW-UPS]  — UNCHANGED
 ↓
Render
```

## 5.3 How this maps onto the existing 13 steps

| Current step | Disposition |
|---|---|
| Mode Gate (interview) | **Unchanged.** |
| 1. INTENT (`classifyIntent`) | **Split.** Command-detection half unchanged (stays in `assistant.js`). Semantic-classification half (recruiter/architecture/stack/comparison/profile/project/resume/question) merges into new step 1, Question Understanding. |
| 2. AWARENESS | **Unchanged** — feeds Conversation Context (new step 3) exactly as it feeds `resolveContext()`/`conversation.js` today. |
| 3. CONTEXT (`resolveContext`) | **Absorbed** into Conversation Context (new step 3) — pronoun/explicit-project resolution becomes one of several things Conversation Context resolves, alongside discourse state. |
| 4. PROFILE | **Unchanged** — `VisitorProfile` continues to live in `memory.js`, read by Response Planning (new step 6) exactly as `providers.js` reads it today. |
| 5. STRATEGY (`conversation.js`) | **Evolves** into new step 1 (Question Understanding) — `conversation.js`'s existing move/scope detection logic is the direct ancestor of `buildQuestionFrame()`, not a replacement of it. |
| 6+7. KNOWLEDGE + MEMORY | **Splits and expands** into new steps 2–5 (Entity Resolution, Conversation Context, Evidence Selection, Confidence). |
| 8. PROACTIVE TOOL | **Unchanged.** |
| 9. PROVIDER | **Splits** into new steps 6–7 (Response Planning decides, `providers.js` composes). |
| 10–13. TOOL EXECUTION / RICH RESPONSE / WORKSPACE / FOLLOW-UPS | **Unchanged**, except Follow-ups (step 13) gains access to the richer `discourse`/`confidence` objects for better suggestions — an extension of the exact `strategy`-aware branch `buildFollowups()` already has today. |

No step is deleted. No step's inputs from outside the pipeline (DOM, `awareness.js`, `memory.js`'s existing fields) change shape. This is 7 new/evolved internal stages replacing 2 of the current 13 (Strategy, and the retrieval-then-route half of Provider) — not a 20-step pipeline, and not a rewrite of the other 11.

---

# 6. New Module Responsibilities

Per `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s own justification method (reused deliberately, not reinvented): **before proposing a new file, check whether an existing module's charter already covers the responsibility.** Applying that check to each of the 7 new stages:

| New capability | Could an existing module own it? | Verdict |
|---|---|---|
| Question Understanding | `conversation.js` already owns "decide the conversational move" — this is a **direct extension** of its existing charter (merging in `classifyIntent()`'s semantic branches), not a new one. | **Extend `conversation.js`.** No new file. |
| Entity Resolution | `jdmatch.js` owns JD-specific scoring (not general entity resolution); `knowledge.js` owns portfolio-fact retrieval (not entity typing/ownership classification); `conversation.js`'s own charter is *move* classification, and stretching it to also own generic entity resolution would give it a second responsibility — exactly what Rule 2 (`docs/CURSOR_RULES.md`) prohibits. | **New file: `assistant/entities.js`.** Pure, stateless — mirrors `jdmatch.js`'s existing contract exactly. |
| Conversation Context | `memory.js` already owns conversational state (`activeTopic`, `lastProject`, `usedPhraseKeys`) — this is a **direct extension**: one richer `discourse` object alongside the existing fields, not a new module. | **Extend `memory.js`.** No new file. |
| Evidence Selection | `knowledge.js` already owns "what grounded portfolio facts exist for a query" — this is a **direct extension**: `retrieve()` gains an optional scoping parameter. | **Extend `knowledge.js`.** No new file. |
| Confidence | Not `knowledge.js` alone — confidence synthesizes evidence scores (from `knowledge.js`) *and* entity-ownership state (from the new `entities.js`) *and* discourse ambiguity (from `memory.js`) into one signal. No single existing module has visibility into all three without acquiring a second responsibility. However, this is a small enough, single-purpose-enough function that it does not need a fifth file — it belongs with the stage that most needs it and most naturally produces its inputs. | **Add as an exported function inside `assistant/entities.js`** (renamed conceptually to cover "resolution + confidence," both being "how sure are we about what this question refers to and what evidence backs it" — a single coherent charter). Documented explicitly in that file's header, same pattern as `conversation.js` documenting its own scope. |
| Response Planning | `providers.js`'s charter is "Response Generation" — but today that conflates *deciding* content with *formatting* it (Cluster E's root cause). Splitting "decide the blocks" from "render the blocks" is a genuine second responsibility hiding inside one file today; separating it is the fix, not a violation of single-responsibility — it's the *restoration* of it. | **New file: `assistant/planning.js`.** Pure, stateless, no markdown strings — only decides which typed blocks, in which order, with which data, exactly mirroring how `conversation.js` decides *moves* without rendering anything. |
| Response Composition | This is `providers.js`'s existing charter, done correctly — it becomes a set of small block-renderers instead of a set of large bespoke per-intent methods. | **`providers.js` stays.** Internally restructured (Section 12), external contract (`generate()` returns `{ text, sources, kind, payload }`) unchanged. |

**Net result: exactly two new files** (`assistant/entities.js`, `assistant/planning.js`), extending four existing modules (`conversation.js`, `memory.js`, `knowledge.js`, `providers.js`), touching zero others. This is the same *number* of new files as the Conversation Intelligence upgrade (which added exactly two: `conversation.js`, `persona.js`) — this plan is not a bigger-scoped change in file count, only in what each existing file is asked to do.

## 6.1 Full module responsibility table (post-evolution)

```
entities.js   (NEW)  →  WHAT entities does this query reference, and does Sudhanshu
                        actually own them? Confidence over that resolution.
planning.js   (NEW)  →  GIVEN everything upstream, what BLOCKS should the answer
                        contain, and in what order? Never renders markdown.
conversation.js      →  WHAT kind of question is this — merges classifyIntent()'s
             (EXTENDED)  semantic branches with existing move/scope detection into
                        one QuestionFrame. Command detection stays in assistant.js.
knowledge.js →  WHAT grounded portfolio facts exist — now scoped by QuestionFrame +
    (EXTENDED)  entities, not just raw keyword overlap. retrieve() keeps working
                        unscoped for any caller that doesn't pass the new hint.
memory.js    →  WHAT has already been discussed — now a structured `discourse`
    (EXTENDED)  object alongside the unchanged turns/profile/activeTopic fields.
persona.js           →  WHAT does the assistant say about identity/opinions — GAINS
             (EXTENDED)  one new export, a self-model section, closing Cluster G.
content.js           →  WHAT is the portfolio's ground truth data — UNCHANGED.
providers.js →  HOW do we render a Response Plan's blocks as markdown — RESTRUCTURED
    (RESTRUCTURED)  internally (block renderers replace bespoke per-intent methods),
                        external contract identical.
assistant.js →  ORCHESTRATES the pipeline — gains 4 new step calls, loses none.
    (EXTENDED)
awareness.js, tools.js, renderer.js, streaming.js, interview.js, jdmatch.js  →  UNCHANGED.
```

---

# 7. Module Interaction Diagram

```
                          ┌────────────────┐
                          │  assistant.js   │  (orchestrator — unchanged role)
                          └───────┬────────┘
                                  │ calls, in order
        ┌─────────────────────────┼──────────────────────────────────┐
        │                         │                                  │
        ▼                         ▼                                  ▼
┌───────────────┐        ┌────────────────┐                 ┌────────────────┐
│ conversation.js│◄──────►│  entities.js   │                 │  awareness.js  │
│ (Q-Understand) │ reuses │ (Entity Resol. │                 │  (unchanged)   │
│                │ SKILLS_│  + Confidence) │                 └───────┬────────┘
└───────┬────────┘ TAXONOMY└────────┬───────┘                        │
        │ QuestionFrame              │ EntityResolution[]             │
        │                            │                                │
        ▼                            ▼                                ▼
┌──────────────────────────────────────────────────────────────────────┐
│                          memory.js  (discourse)                      │
│   reads QuestionFrame + EntityResolution → resolves/updates          │
│   { lastQuestionFrame, focusEntities, pendingResult, sessionFacts }  │
└──────────────────────────────────┬─────────────────────────────────┘
                                    │ DiscourseState
                                    ▼
                          ┌────────────────┐
                          │  knowledge.js   │  (Evidence Selection)
                          │  retrieve(query,│  scoped by QuestionFrame +
                          │  { entities,    │  EntityResolution — NOT raw
                          │  questionType })│  keyword race alone
                          └───────┬────────┘
                                  │ Evidence { primaryFacts, supportingDocs, gapNotes }
                                  ▼
                          ┌────────────────┐
                          │  planning.js    │  (Response Planning)
                          │  reads: QFrame, │  imports persona.js (voice) +
                          │  Entities, Disc-│  knowledge.js (facts) — decides
                          │  ourse, Evidence│  blocks, NEVER renders markdown
                          └───────┬────────┘
                                  │ ResponsePlan { blocks: [...] }
                                  ▼
                          ┌────────────────┐
                          │  providers.js   │  (Response Composition)
                          │  block → markdown│ same external contract:
                          │  renderers      │ { text, sources, kind, payload }
                          └───────┬────────┘
                                  │
                                  ▼
                    renderer.js / streaming.js  (UNCHANGED)

persona.js  ──── read-only ────►  planning.js, providers.js   (authored voice + self-model)
content.js  ──── read-only ────►  knowledge.js, entities.js   (portfolio facts, SKILLS_TAXONOMY)
jdmatch.js  ──── reuses ───────►  entities.js's resolver (generalized further, same reuse
                                   trajectory conversation.js already started)
interview.js ─── unchanged, still bypasses this entire diagram via the mode gate ───►
```

Dependency direction is preserved exactly as today: `content.js` and `persona.js` remain pure, dependency-free data; every logic module reads from them, never the reverse. `entities.js` and `planning.js` are both pure/stateless (no DOM, no provider calls, no network) — the same non-negotiable contract `jdmatch.js`, `interview.js`, and `conversation.js` already established and that this plan does not weaken anywhere.

---

# 8. Data Flow

Concrete walkthroughs for one representative question per major cluster, in the proposed pipeline.

## 8.1 "Do you know Docker?" (Cluster B — question-type-aware evidence)

1. **Question Understanding:** `buildQuestionFrame` → `{ questionType: 'SkillVerification', subject: 'sudhanshu', polarity: 'neutral', requiresEvidence: true }`. (Today: falls through `conversation.js`'s 7 moves untouched, `classifyIntent` says `'stack'`, and that's the *only* signal downstream ever sees.)
2. **Entity Resolution:** `resolveEntities` → `[{ type: 'tech', canonical: 'Docker', ownership: 'owned', confidence: 'high' }]` (owned because `STACK` lists it).
3. **Conversation Context:** no prior discourse needed; `discourse.focusEntities` updates to `['Docker']` for any follow-up.
4. **Evidence Selection:** scoped by `{ questionType: 'SkillVerification', entities: ['Docker'] }` — deliberately retrieves the *narrow* fact ("Docker: deployment layer, containerization") rather than the whole `stack` document's full 19-item text.
5. **Confidence:** `'high'` — a single owned entity, direct data-structure hit, no ambiguity.
6. **Response Planning:** blocks = `[DirectAnswer('yes'), EvidenceCitation('Deployment layer, alongside Vercel/Netlify/Render'), FollowupHint('ask about the five-layer architecture')]` — explicitly **excludes** a `FullInventoryBlock` because `questionType` is `SkillVerification`, not `TechnologyInventory`.
7. **Response Composition:** two short sentences + one follow-up. Meets `docs/AI_EVALUATION_SUITE.md` Section 2.3's success criteria exactly, generalizing automatically to Python/Flask/SQL/React/PostgreSQL/etc. — the same 6 steps, different `canonical` value, zero new code.

## 8.2 "Does he know Kubernetes?" (Clusters A + C — third person + gap vs. unknown)

1. **Question Understanding:** subject resolution runs *before* move-matching — "he" resolves to the canonical subject `sudhanshu` (the same resolution "you"/"your" already produces), so `questionType: 'SkillVerification'` is detected identically regardless of person. (Today: `IDENTITY_RE`/`OPINION_RE`/`EXPERIENCE_RE` never see this because they're pattern-anchored to "you"; this specific query doesn't hit those regexes anyway, but the *general* fix — resolving subject once, before any move regex runs — is what makes third-person phrasing work across the *entire* set of moves, not just this one question.)
2. **Entity Resolution:** `resolveEntities` → `[{ type: 'tech', canonical: 'Kubernetes', ownership: 'gap', confidence: 'high' }]` — **`'gap'`**, not `'unknown'`, because `Kubernetes` exists in `SKILLS_TAXONOMY` specifically as a tracked not-owned skill.
3. **Confidence:** `'high'` — the *ownership state itself* is confidently known, even though the skill isn't owned. (This is the key distinction Cluster C's root cause identifies: confidence is about the resolution, not about whether the answer is favorable.)
4. **Response Planning:** blocks = `[DirectAnswer('no'), HonestGapDisclosure('not part of the current stack'), FollowupHint('ask what technologies he does know, or paste a job description')]`.
5. If the same question named **Go** or **Rust** instead: Entity Resolution returns `ownership: 'unknown'` (absent from `SKILLS_TAXONOMY` entirely), and Response Planning selects a *different* phrasing — `HonestGapDisclosure('unknown')` reads as "I don't have anything on that specifically" rather than "gap" reads as "not part of the current stack" — a small but real, previously-impossible distinction (Section 4.C).

## 8.3 "What are his weaknesses?" (Cluster E — response planning over reusable blocks)

1. **Question Understanding:** `{ questionType: 'Limitation', subject: 'sudhanshu', polarity: 'adversarial-neutral', requiresEvidence: true }`.
2. **Entity Resolution:** no specific tech named — entities list empty.
3. **Evidence Selection:** for `questionType: 'Limitation'` with no named entity, Evidence Selection knows to pull `SKILLS_TAXONOMY`'s `ownership: 'gap'` entries in bulk (AWS, Kubernetes, CI/CD, GraphQL, Redis, Node.js, Django, Kafka, Unit Testing) — the exact data `jdmatch.js` already uses for JD scoring, now reachable by *any* qualifying question, not only a pasted job description.
4. **Confidence:** `'high'` — the gap list itself is a real, structured fact, not a guess.
5. **Response Planning:** blocks = `[DirectAnswer('a few, and here they are')`, `GapListBlock(the gap entries)`, `ReframeBlock('these are documented gaps, not a personality flaw')`, `FollowupHint('paste a job description to see if they matter for a specific role')]`. **Note:** this is the same `GapListBlock` a "what could he improve on?" or "what's he not good at?" question also selects — one block, three trigger phrasings, instead of three composers or one narrowly-gated composer.
6. **Response Composition:** a confident, specific, non-evasive answer — directly addressing the exact concern raised in `docs/AI_EVALUATION_SUITE.md` Section 6.3/6.7 that this question's honesty is "unverified but well-designed for" today.

## 8.4 "What's Python used for in your projects?" → "...and SQL?" (Cluster F — structured discourse)

1. **Turn 1 — Question Understanding:** `{ questionType: 'Experience', subject: 'sudhanshu', entities: ['Python'] }`.
2. **Turn 1 — Conversation Context write:** `discourse.update()` stores not just `focusEntities: ['Python']` but **`lastQuestionFrame: { questionType: 'Experience', template: 'tech-usage-in-projects' }`** — the question's *shape*, not only its topic.
3. **Turn 2, "...and SQL?" — Question Understanding:** the fragment alone carries almost no signal (`entities: ['SQL']`, `questionType: unresolved`). Question Understanding explicitly checks `discourse.lastQuestionFrame` **before** giving up, and — recognizing a short elliptical fragment plus a `discourse` with a recent, resolved `template` — reuses `lastQuestionFrame.template` with the new entity substituted: `{ questionType: 'Experience', entities: ['SQL'], template: 'tech-usage-in-projects' (inherited) }`.
4. **Evidence Selection / Response Planning:** proceed exactly as Turn 1 did, scoped to SQL instead of Python — same blocks, same shape, correct substitution. (Today: `activeTopic` stores only `'stack'` or similar intent label, with no question-shape field to inherit from, so this fragment has nothing correct to fall back on beyond generic retrieval on the single token "SQL".)

## 8.5 Composite messages (Cluster H — explicitly *not* solved by Sections 5–7 alone)

The four walkthroughs above all resolve within the proposed 7-stage pipeline as designed. Composite, multi-question messages (Q175) are the one cluster this plan does **not** claim to fully solve with the stages above — Question Understanding could be extended to detect *multiple* candidate `QuestionFrame`s in one message (a straightforward extension: instead of returning one frame, return a ranked list and let Response Planning decide whether to answer the top one and explicitly invite the rest, or attempt more than one). This is flagged here deliberately rather than glossed over: it is a real, named limitation of even the proposed architecture, addressed as an explicit Phase 7 (Section 12) rather than folded silently into "Question Understanding" as if it were free.

---

# 9. Migration Strategy

## 9.1 Strangler-fig, not big-bang

`docs/CURSOR_RULES.md`'s Rule 3 ("No Large-Scale Rewrites") and Rule 4 ("Preserve Existing APIs") apply in full here. The migration follows the exact precedent `docs/CONVERSATION_INTELLIGENCE_PLAN.md` set and proved safe: **build the new stage in isolation first, verify it in isolation, then wire it in as one additional, optional, fail-closed branch — never replace the old code path until the new one has been live and verified.** Every one of the 7 new/evolved stages is developed and tested exactly this way, in this order:

1. Build the stage as a pure function with no callers in the live app (zero risk — nothing imports it yet).
2. Unit-verify it in isolation against the specific eval-suite questions it targets (hand-constructed inputs, checked against `docs/AI_EVALUATION_SUITE.md`'s `Expected Assistant Behaviour` field).
3. Wire it in as an **additive** branch — `if (questionFrame.confidence === 'unresolved') { /* fall through to existing code, unchanged */ }` — never a replacement of the branch it sits next to.
4. Re-run the full existing regression checklist (Sprint 1–3 + Conversation Intelligence's own checklist in `docs/CONVERSATION_INTELLIGENCE_PLAN.md`) before moving to the next stage.

## 9.2 One cluster at a time, not one stage at a time

Because the 8 clusters are largely independent (Cluster B doesn't need Cluster F to ship first), migration is scheduled by **cluster impact**, not strictly by pipeline order — Section 12's phases interleave stage-building with cluster-closing so that every phase produces a *user-visible* improvement against a *named subset* of `docs/AI_EVALUATION_SUITE.md`, not an invisible internal refactor with no observable payoff until everything is done.

## 9.3 The eval suite becomes the migration's test harness

`docs/AI_EVALUATION_SUITE.md` was designed exactly for this moment (its own Section 1: *"Every future reasoning improvement has a target... a ground truth to design against and grade against — before and after"*). Each phase in Section 12 below names the exact question IDs it is expected to move from failing/predicted-gap to passing, and the manual testing step of each phase is running those specific questions live, not the whole suite every time (though the full suite should be re-run at the end of every phase as a regression gate).

## 9.4 No parallel classifier debt

A real risk of "build the new thing next to the old thing" migrations is ending up with two classifiers permanently, silently disagreeing. This plan avoids that by **merging, not duplicating**, at each step: `conversation.js`'s move-detection logic becomes the direct inside of `buildQuestionFrame()` (Section 6), not a second classifier consulted alongside it. `classifyIntent()`'s command-detection half stays exactly where it is (Section 2.3) precisely because it is a genuinely different concern (literal commands, not semantic questions) — this is a deliberate, permanent split, not two temporary systems destined to converge later.

---

# 10. Risks

## 10.1 Architectural risks

- **Scope creep into a "mini NLP framework."** The single biggest risk of this plan is over-building: a personal portfolio assistant does not need a general-purpose intent-classification framework, a plugin registry, or a rule engine. Every new stage in Section 5 is scoped narrowly to the specific clusters in Section 4 — `entities.js` resolves against `SKILLS_TAXONOMY` and `PROJECTS`, nothing more general; `planning.js`'s block vocabulary starts at roughly 6–8 block types (Section 8's walkthroughs use `DirectAnswer`, `EvidenceCitation`, `HonestGapDisclosure`, `GapListBlock`, `ComparisonTable`, `FollowupHint`, `ReframeBlock`, `RecruiterFraming`), not an open-ended plugin system. **Mitigation:** the Definition of Done (Section 14) explicitly caps the number of new abstractions, mirroring how `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s own Definition of Done capped `conversation.js` at "a short, explicit, documented list (7 checks), not an intent switch with dozens of branches."
- **Subject-resolution false positives.** Resolving "he"/"his" to `sudhanshu` is safe in this single-subject portfolio context (there is only one person the assistant discusses), but the resolver must not casually resolve every third-person pronoun in the entire history of English to Sudhanshu — a question like "who's the CEO of the company I'm hiring for" uses third-person phrasing about someone else entirely. **Mitigation:** subject resolution should require the same "fail closed to `factual`/ambiguous" discipline as every other stage — resolve confidently only when the sentence's grammatical subject is a known referent (Sudhanshu, "you", "the assistant", a named project), never a blanket "any third-person pronoun = Sudhanshu" rule.
- **Entity Resolution becoming a second, competing taxonomy.** If `entities.js` grows its own understanding of what's "owned" independently of `SKILLS_TAXONOMY`, it recreates Cluster C instead of fixing it. **Mitigation:** `entities.js` must read `SKILLS_TAXONOMY`/`PROJECTS[].stack` directly, never duplicate their contents — enforced the same way `persona.js`'s `TECH_TAKES` evidence is already required to cross-check against real `PROJECTS[].stack` at write time.

## 10.2 Performance risks

- Each new stage adds a small, synchronous, in-memory computation per turn (regex tests, a handful of `Array.filter`/`.find` calls over `PROJECTS`/`SKILLS_TAXONOMY` — both small, fixed-size arrays). This is the same order of magnitude `classifyIntent()` and `conversation.js` already cost today. **No measurable latency risk** — everything remains synchronous, offline, and dependency-free, consistent with `docs/CURSOR_RULES.md`'s Performance rules. The existing `sleep(280 + random*220)` artificial "thinking" delay in `LocalProvider.generate()` already dwarfs any realistic cost this plan adds.

## 10.3 Accessibility risks

- **None identified.** No DOM, ARIA, keyboard, or motion surface is touched anywhere in this plan — every new stage produces plain data consumed by the existing, unchanged rendering pipeline.

## 10.4 Maintainability risks

- **Block vocabulary drift.** `planning.js`'s block types must stay small and well-documented, or `providers.js`'s renderers will multiply just as unboundedly as the `_xResponse` methods they replace. **Mitigation:** treat the block vocabulary itself as a reviewed, deliberately-small enum, the same discipline `conversation.js`'s 7-move list already models successfully.
- **Discourse state growing unbounded.** `memory.js`'s new `discourse` object must remain a small, fixed-shape record (Section 5.2's four fields), not an ever-growing free-form log — otherwise Cluster F's fix recreates Cluster F's own root cause (ad hoc fields added forever) one level up.
- **Two-classifier debt during migration.** Addressed explicitly in Section 9.4 — the migration plan itself is the mitigation.
- **No automated test runner exists.** `docs/PORTFOLIO_AUDIT.md` already flags this as a pre-existing gap, unrelated to this plan. Every validation step in Section 12 is manual, in the live browser, against named eval-suite question IDs — consistent with how Sprint 3 and the Conversation Intelligence upgrade were both validated, and not a new risk this plan introduces, but also not a risk this plan is positioned to fix (out of scope, noted honestly rather than silently ignored).

## 10.5 Scalability risk if not done carefully

- Done as designed, every cluster fix generalizes (Section 8.1's Docker walkthrough works identically for any future stack addition with zero new code). Done carelessly — e.g., if `planning.js`'s blocks end up hardcoded per-entity instead of parameterized — the plan would silently regress back into Cluster E's exact failure mode with a different file name. This is the single most important thing to verify during code review of any implementation phase.

---

# 11. Success Criteria

This plan succeeds if, measured against the live assistant using `docs/AI_EVALUATION_SUITE.md` as the scoring instrument:

1. **Cluster-level pass rates, not question-level patching.** Re-asking *any* technology name in the Cluster B shape ("do you know X?") produces a scoped, evidence-appropriate answer — verified by sampling at least 8 of the ~24 affected questions, not by adding 24 special cases.
2. **Third-person parity.** Every question in `docs/AI_EVALUATION_SUITE.md` that has a natural third-person rephrasing (Q21–26, Q121–124, Q144–148, and Q167/168 as originally written) produces the *same* answer whether asked in second or third person.
3. **Weaknesses/strengths questions reach existing data.** Q149–154 correctly surface `_recommendResponse()`'s strengths list and `SKILLS_TAXONOMY`'s gap list respectively, without a new bespoke composer per phrasing.
4. **Self-disclosure exists.** Q161–164 receive a confident, specific, honest answer instead of `_fallback()`'s generic text.
5. **Ellipsis/fragment follow-ups resolve correctly.** Q179, Q182 correctly substitute the new entity into the previous turn's question template.
6. **Zero regressions.** Every item in `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s Testing Checklist and every Sprint 1–3 regression scenario still passes, byte-for-byte-equivalent behavior where this plan doesn't intentionally change it.
7. **`content.js` remains portfolio-data-only; `persona.js`'s one-way dependency is preserved.** No architectural boundary established in prior sprints is blurred.
8. **No new dependencies, no network calls, no framework migration.** The entire pipeline remains synchronous and offline.
9. **The eval suite's own Section 5.3 numbers move in the right direction** when the suite is re-run against the live assistant after implementation: the count of "High" hallucination-risk questions answered evasively should drop, and the 41 `⚠ Predicted Gap` annotations should be re-verified one by one, with each either resolved or explicitly re-classified as still-open with a reason.

---

# 12. Implementation Phases

Each phase is independently shippable, regression-safe on its own, and named against specific eval-suite question IDs — following the exact phase structure `docs/CONVERSATION_INTELLIGENCE_PLAN.md` used successfully.

## Phase 0 — Consolidate entity extraction (groundwork, zero behavior change)
- **Objective:** Create `assistant/entities.js`; migrate the *existing* four duplicated extraction implementations (Section 4.C) to call into it, with identical output to today for every existing caller.
- **Files:** `assistant/entities.js` (new), `jdmatch.js` (delegate `matchTaxonomyEntities` to the new module or re-export), `conversation.js` (delegate its comparison/opinion entity extraction), `assistant.js` (delegate `resolveContext()`'s project matching), `providers.js` (delegate `_experienceResponse`'s ad hoc search — retire `_EXPERIENCE_STOPWORDS`).
- **Validation:** every existing eval-suite question that currently passes still produces byte-identical output. This phase changes zero visible behavior — it only removes duplication.
- **Expected outcome:** one authoritative entity resolver, with `ownership` classification (`owned`/`gap`/`unknown`) added as new, currently-unused metadata on each result.

## Phase 1 — Question Understanding merge (closes part of Cluster A)
- **Objective:** Merge `classifyIntent()`'s semantic branches into `conversation.js`'s move detection, producing one `QuestionFrame`; add subject resolution (Section 8.2) as a pre-step before move-matching.
- **Files:** `conversation.js` (extended), `assistant.js` (keeps command-detection branches of `classifyIntent()`, delegates the rest).
- **Validation:** Q167, Q168, and hand-constructed third-person rephrasings of Q21–26/Q121–124/Q144–148 now classify identically to their second-person originals.
- **Expected outcome:** third-person parity (Success Criterion 2) achieved for every move `conversation.js` already detects.

## Phase 2 — Question-type-aware Evidence Selection (closes Cluster B)
- **Objective:** Add `questionType: 'SkillVerification'` detection to Question Understanding (a new, 8th move, following the same fail-closed pattern as the existing 7); extend `knowledge.js`'s `retrieve()` to accept an optional `{ entities, questionType }` scoping hint.
- **Files:** `conversation.js` (new move), `knowledge.js` (extended `retrieve()` signature — backward-compatible, existing unscoped calls unaffected), `providers.js` (new lightweight composer for the `SkillVerification` move).
- **Validation:** Q55, Q59, Q63, Q67, Q71, Q75, Q78, Q81, Q84, Q87 ("do you know/use X") each produce a scoped, non-inventory-dumping answer.
- **Expected outcome:** Success Criterion 1 (cluster-level pass rate).

## Phase 3 — Response Planning + block vocabulary (closes Cluster E)
- **Objective:** Build `assistant/planning.js` with an initial, deliberately small block vocabulary (Section 10.1's ~8 types); wire the "strengths" and "weaknesses/gap" data (already correctly computed by `_recommendResponse()`/`SKILLS_TAXONOMY`) into reusable `StrengthsBlock`/`GapListBlock` types reachable from any qualifying `Limitation`/`SkillVerification`-with-negative-framing question.
- **Files:** `assistant/planning.js` (new), `providers.js` (restructured — existing methods become block renderers, one at a time, verified individually).
- **Validation:** Q149–154 (strengths/weaknesses) pass; every existing composer's *current* trigger condition (recruiter intent, JD paste) still produces its current output unchanged.
- **Expected outcome:** Success Criterion 3.

## Phase 4 — Self-model (closes Cluster G)
- **Objective:** Extend `persona.js` with a new, small self-model export (e.g. describing `LocalProvider`-by-default, offline-only, session-scoped memory — all already-true facts about the live architecture, none invented); wire a `Limitation`/meta-question type in Question Understanding to route to it.
- **Files:** `persona.js` (extended — one new export), `conversation.js` (new move or category), `providers.js` (one new composer).
- **Validation:** Q161–164 pass with confident, specific, honest answers.
- **Expected outcome:** Success Criterion 4.

## Phase 5 — Structured Discourse State (closes Cluster F)
- **Objective:** Extend `memory.js`'s state from three independent scalars into one `discourse` object (Section 5.2); update `_load()`/`_save()`/`STORAGE_KEY` version bump, following the exact precedent Sprint 3 already set for `activeTopic`/`usedPhraseKeys`.
- **Files:** `memory.js` (extended), `conversation.js`/Question Understanding (reads/writes `discourse.lastQuestionFrame`).
- **Validation:** Q179, Q182 (ellipsis follow-ups), Q187, Q195 (post-interview/post-JD-match carryover) resolve correctly.
- **Expected outcome:** Success Criterion 5.

## Phase 6 — Confidence tiering (closes Cluster D, cross-cutting hardening)
- **Objective:** Add the confidence-assessment function (Section 6, folded into `entities.js`); wire its output into Response Planning so retrieval-fallback answers can distinguish "confidently nothing" from "lost a close race" in their phrasing.
- **Files:** `entities.js` (extended), `knowledge.js` (expose near-tie detection — e.g. return the score gap between rank 1 and rank 2, not just the winner), `planning.js` (consumes confidence tier).
- **Validation:** re-verify `docs/CONVERSATION_INTELLIGENCE_PLAN.md`'s Example 4 scenario stays fixed; spot-check several of the eval suite's 36 "High hallucination risk" questions for more confident, specific decline phrasing.
- **Expected outcome:** incremental quality improvement across the entire honesty-under-pressure surface (Sections 4.30–4.40 of the eval suite), not a single fixed question.

## Phase 7 — Composite message handling (Cluster H, explicitly scoped smaller)
- **Objective:** Extend Question Understanding to detect *multiple* plausible `QuestionFrame`s in one message; extend Response Planning with a `MultiTopicAcknowledgement` block (answer the strongest one, explicitly invite the rest) rather than attempting true multi-answer composition in one turn.
- **Files:** `conversation.js` (multi-frame detection), `planning.js` (new block type).
- **Validation:** Q175 passes with at least an explicit acknowledgment of the un-answered sub-questions, verified not to regress single-question message handling.
- **Expected outcome:** the smallest, most contained phase — deliberately scheduled last, since it is the least architecturally load-bearing cluster (blast radius: 1 named question today).

## Phase 8 — Documentation
- **Objective:** Update `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, `docs/AI_ASSISTANT_SPEC.md` to describe the evolved pipeline and the two new modules, matching the precedent both prior sprints already set.
- **Files:** the three docs above.
- **Validation:** module inventories and pipeline-step counts in the docs match the live code exactly.

---

# 13. Estimated Complexity

Complexity is estimated relative to the two most recent comparable efforts (Sprint 3's five features, and the Conversation Intelligence upgrade's single new module + composers) — not in engineering-hours, since this document does not propose a schedule.

| Phase | Complexity | Rationale |
|---|---|---|
| 0 — Consolidate entities | **Low** | Pure refactor/consolidation of existing logic into one file; no new behavior, low regression surface (mechanical delegation). |
| 1 — Question Understanding merge | **Medium** | Requires careful, case-by-case verification that every one of `classifyIntent()`'s existing 8 semantic branches (recruiter/architecture/stack/comparison/profile/project/resume/question) merges into `QuestionFrame` without behavior drift — comparable to the original Conversation Intelligence upgrade's Phase 1. |
| 2 — Question-type-aware Evidence Selection | **Medium** | One new move + one new composer, similar shape to the Conversation Intelligence upgrade's `_greetingResponse`/`_identityResponse` additions — but touches `knowledge.js`'s core `retrieve()` signature, requiring care that unscoped callers are unaffected. |
| 3 — Response Planning + blocks | **High** | The largest phase — restructures the majority of `providers.js`'s existing composer methods into block renderers. Comparable in scope to Sprint 3's entire feature set combined, because it touches every existing response shape, even though each individual change is mechanical. |
| 4 — Self-model | **Low** | Small, additive, self-contained — comparable to adding `_resumeResponse` in Sprint 3. |
| 5 — Structured Discourse State | **Medium** | Touches `memory.js`'s persistence layer (`_load`/`_save`/version bump) — same shape and risk profile as Sprint 3's `activeTopic`/`usedPhraseKeys` addition, which already proved this pattern is safe. |
| 6 — Confidence tiering | **Medium** | Conceptually simple (expose the existing score gap that's already computed, just discarded today) but requires careful tuning of thresholds to avoid over- or under-triggering "ambiguous" tier. |
| 7 — Composite messages | **Low–Medium** | Deliberately narrow scope (Section 12's Phase 7 objective); smallest cluster, smallest fix. |
| 8 — Documentation | **Low** | Mechanical, same as every prior sprint's doc-update phase. |

**Overall assessment:** comparable in total scope to **Sprint 3 + the Conversation Intelligence upgrade combined** — larger than either individually, because it generalizes patterns both of them introduced narrowly, but not larger than the two of them together, because it reuses their exact module-addition discipline (2 new files) rather than introducing a new framework. This is explicitly **not** a single-sprint effort; Section 12's 9 phases are sized to be spread across multiple future sprints, each independently shippable per Section 9.1.

---

# 14. Definition of Done

This architecture is successfully realized only if, once implemented:

- [ ] Every success criterion in Section 11 is met, verified live against `docs/AI_EVALUATION_SUITE.md`'s actual questions (not just traced on paper).
- [ ] Exactly **two** new files exist beyond today's module set: `assistant/entities.js` and `assistant/planning.js`. No third new module, no generic "reasoning engine" abstraction, no plugin/rule-registry system.
- [ ] `content.js` remains completely unchanged in charter — still portfolio-data-only. Any new data needed (e.g. self-model facts) lives in `persona.js`, honestly grounded, per the existing one-way-dependency rule.
- [ ] `classifyIntent()`'s literal command-detection branches (`action-*`, `jd-match`, `interview`) are functionally unchanged — still regex-based, still short-circuit first, exactly as `docs/AI_EVALUATION_SUITE.md`'s Section 7 already rates them "Strong."
- [ ] `planning.js`'s block vocabulary is a small, explicit, documented list (target: under 10 block types at initial ship) — not an open-ended plugin system.
- [ ] `conversation.js`'s move list remains a short, explicit, documented, ordered list of checks (7 today, growing by at most 1–2 per phase above) — not a sprawling intent switch.
- [ ] `memory.js`'s new `discourse` object is a fixed-shape record (Section 5.2's four named fields) — not an unbounded free-form log.
- [ ] Every existing Sprint 1–3 and Conversation Intelligence regression scenario passes with no console errors.
- [ ] No new dependencies, no network calls, no framework migration — everything remains fully offline and synchronous, per `docs/CURSOR_RULES.md`'s non-negotiable principles.
- [ ] `docs/CHANGELOG.md`, `docs/PROJECT_ARCHITECTURE.md`, and `docs/AI_ASSISTANT_SPEC.md` are updated to describe the evolved pipeline and both new modules.
- [ ] `docs/AI_EVALUATION_SUITE.md` is re-run in full against the live, updated assistant, and its 41 `⚠ Predicted Gap` annotations are each explicitly re-classified as resolved, partially resolved, or still open (with a stated reason) — turning this plan's own success claim into a checkable, dated record rather than an assumption.

---

*End of `docs/REASONING_ENGINE_PLAN.md` — Version 1.0, DRAFT. This is an architecture proposal only; no implementation has begun. Awaiting approval before any Phase in Section 12 is started.*






