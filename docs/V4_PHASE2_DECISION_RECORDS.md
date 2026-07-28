# V4 Phase 2 — Decision Records

> Status: **Complete — stop here**  
> Date: 2026-07-28  
> Depends on: Phase 1 Engineering Knowledge Graph  
> Scope: DecisionRecord derivation from the graph only — **reasoning unmodified**

---

## 1. What shipped

First-class **Decision Records** built from Phase 1 graph Decision nodes + related Project / Technology / ArchLayer structure.

```
getEngineeringGraph()
        │
        ▼
buildDecisionRecords(graph)
        │
        ▼
DecisionRecord[]  (query + validate APIs)
```

`content.js` is not re-read as a parallel store. Project stacks, decision text, and architecture context come from **graph nodes/edges**.

`TECH_TAKES` (persona) is used only to attach authored trade-off dimensions / named counterparts when the **chosen** tech is already on the graph — alternatives are never labeled “rejected.”

---

## 2. DecisionRecord shape

| Field | Meaning |
|---|---|
| `id` | `{projectId}:{index}` |
| `graphNodeId` | Phase 1 Decision node id |
| `context` | Architecture layer alignment (documented/inferred) |
| `chosen` / `relatedTechs` | Techs named in decision text ∩ project `used_in` |
| `chosenKind` | `technology` \| `approach` |
| `problemSolved` | Project problem from graph props (documented) |
| `reasons` | Raw decision text (documented) |
| `tradeoffs` | From TECH_TAKES when applicable |
| `alternatives` | Counterpart techs with graph-honest status |
| `currentEvaluation.wouldChooseAgain` | `unknown` \| `lean-yes` \| `depends` (inferred from later projects only) |
| `evidenceRefs` | Graph node/edge citations |
| `confidence` | Per-field honesty tags |

---

## 3. Files

| File | Role |
|---|---|
| `src/assistant/decisions.js` | Build / query / validate Decision Records |
| `tests/v4_phase2_decisions.test.mjs` | Phase 2 tests |
| `docs/V4_PHASE2_DECISION_RECORDS.md` | This note |

**Unmodified:** `reasoning.js`, `providers.js`, UI, conversation, Phase 1 graph behavior (read-only consumer).

---

## 4. Validation output

```bash
node tests/v4_phase1_graph.test.mjs   # regression
node tests/v4_phase2_decisions.test.mjs
```

| Suite | Result |
|---|---|
| Phase 1 graph | **18 / 18 PASS** |
| Phase 2 decisions | **12 / 12 PASS** |
| `validateDecisionRecords` | **ok** (0 errors) |

### Record stats (live run)

| Metric | Count |
|---|---|
| Records | 9 (= Decision nodes) |
| With chosen tech | (see latest test run) |
| Approach-only | (see latest test run) |

---

## 5. Stop

**Phase 2 Decision Records complete. Reasoning was not modified. Do not begin the next phase until instructed.**
