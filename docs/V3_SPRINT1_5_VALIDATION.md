# V3 Sprint 1.5 Validation — Portfolio Intelligence

> Project: **SRIIVERSEAI**  
> Sprint: **Version 3 / Sprint 1.5 — Portfolio Intelligence**  
> Builds on: [`docs/V3_SPRINT1_VALIDATION.md`](./V3_SPRINT1_VALIDATION.md) · [`docs/V3_CONVERSATIONAL_ARCHITECTURE.md`](./V3_CONVERSATIONAL_ARCHITECTURE.md)  
> Date: 2026-07-24  
> Status: **Complete — stop here (Sprint 2 not started)**

---

## 1. Implementation summary

Sprint 1.5 adds a **composition-only Portfolio Intelligence** layer so answers feel like an expert who has mastered Sudhanshu’s portfolio — not like a document retrieval bot.

After Sprint 1’s conversational move selection, composition may:

1. **Detect an evaluative / capability intent** from the visitor’s question (projects, skills, architecture, recruiter, portfolio meta, identity)
2. **Synthesize** an evidence-backed judgment from live `PROJECTS` / `STACK` / `ARCHITECTURE` (via `knowledge.js` getters — same source of truth as the frozen pipeline)
3. **Scrub implementation / doc-export voice** (`retrieval-and-reasoning`, `Based on what is documented`, `From his portfolio:`, knowledge-base phrasing)
4. **Annotate** `payload._portfolioIntelligence` with the intent id (observability only)

**Capability-first identity:** “who are you” / “what can you do” speak capabilities, not internal architecture. Mechanism questions (“external API?”) get a plain local/bundled honesty line without RAG jargon.

**Honesty preserved:** Greeting / Clarify never synthesize. Real skill gaps (e.g. Kubernetes) still Decline. Synthesis may override a *false* Decline only when a clear intelligence intent matches (e.g. “external API”, “demonstrates AI”) — never invents missing tech.

**Not modified:** Question Understanding, Entity Resolution, Evidence Selection, Confidence Assessment, Response Planning (`conversation.js`, `entities.js`, `knowledge.js`, `planning.js`). `persona.js` `SELF_MODEL` strings left as authored data; composition rewrites visitor-facing speech.

---

## 2. Architecture notes

```
Version 2 (frozen)
  QuestionFrame → Entities → Evidence → Confidence → ResponsePlan
                         ↓
Version 3 Sprint 1 (composition)
  render blocks → select move → (optional) speak framing
                         ↓
Version 3 Sprint 1.5 (composition)
  detect intelligence intent
    → synthesize from PROJECTS/STACK/ARCHITECTURE  (when intent matches)
    → else Sprint 1 move framing
  → scrub implementation / doc-export voice
                         ↓
  { text, sources, kind, payload + _conversationalMove + _portfolioIntelligence? }
```

| Layer | Role in Sprint 1.5 |
|---|---|
| Understanding / Entities / Evidence / Confidence / Planning | **Untouched** — sole authority on truth for normal turns |
| Composition (`providers.js`) | Intent detect + synthesize + voice scrub |
| Compare move | Keeps TECH_TAKES tables; “Why Flask instead of FastAPI?” may use rationale synthesis |

---

## 3. Files changed

| File | Change |
|---|---|
| `src/assistant/providers.js` | Portfolio Intelligence helpers; voice scrub; SelfModel/Decline/DirectAnswer capability voice; wired in `_renderPlan` |
| `docs/V3_SPRINT1_5_VALIDATION.md` | This report |

**Not modified:** `conversation.js`, `entities.js`, `knowledge.js`, `planning.js`, `persona.js`, `assistant.js`, `memory.js`, `content.js`.

---

## 4. Before vs After examples

### Identity — “Who are you?” / “What can you do?”
| | |
|---|---|
| **Before** | *I'm a retrieval-and-reasoning layer over Sudhanshu's own portfolio content…* |
| **After** | Capability-first guide voice: explain projects, compare tech, architecture, recruiter questions, skill judgments; honest when something isn’t covered · intent=`identity` / `capabilities` |

### Judgment — “Which project is your best work?”
| | |
|---|---|
| **Before** | Often a retrieved project blurb or documentary lead |
| **After** | Cross-project comparison → **RepoRadarAI** with why (live + open source + full-stack story) · intent=`best_work` |

### Skills — “Are you stronger in backend or frontend?”
| | |
|---|---|
| **Before** | Stack dump or doc-export tone |
| **After** | Evidence-backed inference: backend-leaning full-stack; cites Python services + title · intent=`backend_vs_frontend` |

### Recruiter — “Why should I hire Sudhanshu?”
| | |
|---|---|
| **Before** | Documentary opener + hire FAQ |
| **After** | Natural hire case from shipped systems + architecture philosophy · intent=`why_hire` |

### Honesty — “Does he know Kubernetes?”
| | |
|---|---|
| **Before / After** | Honest Decline + pivot to owned deploy surface · **no** intelligence override · intent=`null` |

### Mechanism — “Are you calling an external API?”
| | |
|---|---|
| **Before** | False skill-gap on “API” or RAG self-description |
| **After** | Plain: runs in-page, no external API · intent=`assistant_mechanism` |

---

## 5. Validation report

Focused harness (30 cases): intelligence intents + honesty guards + Compare leave-alone.

| Metric | Result |
|---|---|
| Cases | 30 |
| Pass | **30 / 30** |
| Fail | 0 |
| Banned phrases in samples (`retrieval-and-reasoning`, `Based on what is documented`, `From his portfolio:`, `knowledge base`, `RAG`, embeddings) | **0** |
| Frozen stages edited | **No** |
| Invented seniority / fake metrics in samples | **0** |

### Case coverage

| Group | IDs | Focus |
|---|---|---|
| Identity / capability | I1–I3 | capabilities, identity, assistant_mechanism |
| Project judgments | P1–P5 | best / difficult / interview / backend / AI |
| Skills | S1–S5 | backend vs frontend, Docker, Flask, DB, scale |
| Architecture | A1–A3 | why / trade-offs / scale |
| Recruiter | R1–R6 | hire, type, role, production, strengths, learn next |
| Portfolio meta | M1–M4 | different, decision, tech frequency, philosophy |
| Honesty / leave-alone | H1–H3, C1 | Kubernetes Decline, Clarify, Greeting, Compare table |

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Synthesis invents seniority or unstated employers | Copy only reasons from shipped projects/stack/architecture; explicit “won’t invent” lines on scale/learn-next/production |
| False Decline override papers over real gaps | Override only when `_detectIntelligenceIntent` matches; Kubernetes and similar stay Decline |
| Compare tables lost for “Flask vs FastAPI” | Full Compare left intact; only “why Flask/FastAPI” rationale overrides |
| Scrub removes useful honesty | Mechanism questions keep a clear local/no-external-API answer |
| Intent regex misses a phrasing | Falls back to Sprint 1 move framing + scrub — still no RAG voice |
| Sprint creep into Deepen / discourse memory | Explicitly deferred; stop after 1.5 |

---

## 7. Deliverable checklist

1. ✓ Implementation summary (§1)  
2. ✓ Architecture notes (§2)  
3. ✓ Files changed (§3)  
4. ✓ Before vs After (§4)  
5. ✓ Validation report (§5)  
6. ✓ Risks (§6)  

**Sprint 1.5 complete. Do not begin Sprint 2 in this change set.**

The assistant should now behave like an expert who understands Sudhanshu’s portfolio — not like a search engine retrieving documents.
