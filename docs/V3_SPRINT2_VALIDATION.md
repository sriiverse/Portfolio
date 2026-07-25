# V3 Sprint 2 Validation — Portfolio Reasoning Engine

> Project: **SRIIVERSEAI**  
> Sprint: **Version 3 / Sprint 2 — Portfolio Reasoning Engine**  
> Builds on: Sprint 1 (Conversational Moves) · Sprint 1.5 (Portfolio Intelligence)  
> Date: 2026-07-25  
> Status: **Complete — stop here**

---

## 1. Architecture changes

Sprint 2 adds a **Reasoning Strategy Layer** beside Response Composition. It answers *how to think* before composition answers *how to speak*.

```
Version 2 (frozen)
  QuestionFrame → Entities → Evidence → Confidence → ResponsePlan
                         ↓
Version 3 Sprint 1–1.5 (composition)
  render blocks → conversational move → voice scrub
                         ↓
Version 3 Sprint 2 (composition-adjacent)
  classifyReasoningStrategy(query)
    → Describe | Explain | Compare | Recommend | Evaluate
      | Rank | Critique | Infer | Summarize | Justify
  buildProjectProfiles()  // attribute model from live PROJECTS
  synthesizeReasoning()   // Decision → Reasoning → Evidence
                         ↓
  { text, kind:'text' for evaluative turns,
    payload._reasoningStrategy, payload._portfolioIntelligence }
```

| Piece | Responsibility |
|---|---|
| `reasoning.js` | Strategy classification, project attribute model, synthesis |
| `providers.js` `_renderPlan` | Calls classifier; overrides false Decline/gap collisions; forces `kind:'text'` for decision-first strategies (no project-card dumps) |
| Frozen V2 stages | Untouched — still sole authority on facts for Describe / skill-gap honesty |

**Core rule:** Evidence supports the conclusion; evidence is not the conclusion.

**Decision-first** (Recommend / Evaluate / Rank / Critique / Infer / Justify):

1. Conclusion  
2. Reasoning  
3. Supporting evidence  
4. Invite (from Sprint 1)

---

## 2. Files modified

| File | Change |
|---|---|
| `src/assistant/reasoning.js` | **New** — strategy layer + attribute model + synthesis |
| `src/assistant/providers.js` | Wire Sprint 2 into `_renderPlan`; delegate synthesis to `reasoning.js` |
| `docs/V3_SPRINT2_VALIDATION.md` | This report |

**Not modified:** `content.js`, `knowledge.js`, `conversation.js`, `entities.js`, `planning.js`, UI, honesty guarantees for real gaps (Kubernetes, Clarify, Greeting).

---

## 3. Reasoning flow

```
User question
    ↓
What is the user trying to accomplish?   ← classifyReasoningStrategy
    ↓
Select cognitive task (e.g. Recommend / Evaluate / Critique)
    ↓
Compare portfolio entity attributes
  (complexity, backendDepth, frontendDepth, aiUsage, databases,
   deployment, architecture, scalability, innovation,
   recruiterImpact, productionReadiness, softwareEngineering)
    ↓
Form conclusion (Decision-first when evaluative)
    ↓
Support with shipped evidence only
    ↓
Scrub implementation voice · Invite
```

Attributes are derived from live `PROJECTS` / `STACK` / `ARCHITECTURE` fields — never invented employers, metrics, or seniority.

---

## 4. Before vs After

| Question | Before (failure mode) | After |
|---|---|---|
| Which project would impress a FAANG interviewer? | Treats “FAANG” as unknown entity / decline | **Recommend** → QueryForgeAI with systems/correctness rationale |
| What's his weakest area? | Opens a project card | **Critique** → strengths first, then evidence-backed ops/cloud gaps; `kind=text` |
| Can he design REST APIs? | Dumps technology list | **Evaluate** → Yes + confidence + cross-project REST evidence |
| Which project shows the best software engineering? | Retrieves engineering paragraphs | **Rank** → I'd choose QueryForgeAI + why |
| Would he fit a startup? | Weak / no-data path | **Infer** → Yes for ship-backend+AI startups; honest non-fits |
| Does he know Kubernetes? | Honest decline | Unchanged honest Decline (no false override) |

---

## 5. Validation report

Harness: **51 reasoning-focused cases** (success-criteria set + Recommend/Rank/Evaluate/Critique/Infer/Explain/Justify/Summarize + honesty leave-alones).

| Metric | Result |
|---|---|
| Cases | 51 |
| Pass | **51 / 51** |
| Fail | 0 |
| Implementation-leak phrases (RAG / “Based on what is documented” / …) | **0** |
| Evaluative turns forced away from `project-card` | **Yes** |
| Frozen stages edited | **No** |

### Coverage map

| Group | Count | Focus |
|---|---|---|
| Success criteria (S01–S10) | 10 | FAANG, best engineering, keep two, REST, backend/frontend, startup, weakest, AI, memorable, hire |
| Recommend / Rank | 10 | See first, recruiter, demo, best work, difficult, top two, backend/frontend/AI/FAANG variants |
| Evaluate | 7 | Production, scale, Docker, DB, REST competency |
| Critique / Infer | 7 | Weakest, learn next, backend team, product-oriented, role, startup |
| Explain / Justify / Summarize | 12 | Why Flask/React/Postgres/arch, hire, about Sudhanshu, strengths |
| Honesty / leave-alone | 5 | Kubernetes, Greeting, Compare table, Describe project card, Clarify |

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Attribute scores mis-rank projects | Narrative calibration for FAANG / best-engineering / keep-two; scores remain internal ranking aids, not visitor-facing metrics |
| False Decline override invents missing tech | Override only when a reasoning `task` classifies; bare Kubernetes stays Decline |
| Compare tables lost | `compare_passthrough` leaves TECH_TAKES Compare path alone |
| Over-inference of seniority | Explicit “won’t invent” lines on production / scale / learn-next / critique |
| Classifier misses a phrasing | Falls back to Sprint 1 move framing + Describe plan — still scrubbed of RAG voice |

---

## 7. Deliverable checklist

1. ✓ Architecture changes (§1)  
2. ✓ Files modified (§2)  
3. ✓ Reasoning flow (§3)  
4. ✓ Before vs After (§4)  
5. ✓ Validation ≥50 cases (§5 — **51/51**)  
6. ✓ Risks and mitigations (§6)  

**Sprint 2 complete. Stop here.**
