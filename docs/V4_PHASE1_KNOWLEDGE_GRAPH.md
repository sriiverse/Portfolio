# V4 Phase 1 — Engineering Knowledge Graph

> Status: **Complete — stop here (Phase 2 not started)**  
> Date: 2026-07-28  
> Scope: Graph derivation + query/validation utilities only

---

## 1. Architecture notes

Phase 1 introduces a **derived** Engineering Knowledge Graph. It is a structural view over `content.js`, not a second knowledge store.

```
content.js
  PROFILE · PROJECTS · STACK · ARCHITECTURE · JOURNEY
        │
        ▼  buildEngineeringGraph()
src/assistant/graph.js
  nodes + directed edges
        │
        ├── query utilities (neighbors, project↔tech, arch path, …)
        └── validateEngineeringGraph()
```

**Rules honored**

- Derived entirely from existing `content.js` exports  
- No duplicated portfolio prose store  
- No hardcoded project↔technology maps (`used_in` comes from each project’s `stack[]`)  
- No changes to `reasoning.js`, `providers.js`, UI, or conversation behavior  
- Sprint 1 / 1.5 / 2 paths untouched  

**Out of scope (later phases)**

- Decision Records enrichment  
- Engineering Identity Layer  
- Operator / reasoning refactor  
- Provider wiring  

---

## 2. Node & edge model (Phase 1)

### Nodes

| Type | Source |
|---|---|
| `Profile` | `PROFILE` |
| `Project` | `PROJECTS[]` |
| `Technology` | `STACK[]` (+ orphan flag if a project stack name is missing from STACK) |
| `ArchLayer` | `ARCHITECTURE[]` |
| `Feature` | `PROJECTS[].features[]` |
| `Decision` | `PROJECTS[].decisions[]` (raw text; `recordStatus: 'raw'`) |
| `JourneyPhase` | `JOURNEY[]` |

### Edges

| Type | Meaning |
|---|---|
| `ships` | Profile → Project |
| `used_in` | Technology → Project |
| `has_feature` | Project → Feature |
| `has_decision` | Project → Decision |
| `next_layer` | ArchLayer → ArchLayer (topology order) |
| `talks_to` | Frontend → Backend (from architecture description) |
| `via` | Layer → `REST APIs` (documented protocol) |
| `appears_in_layer` | Technology → ArchLayer (names parsed from `sub`) |
| `journey_step` | JourneyPhase → JourneyPhase |
| `journey_ships` | JourneyPhase → Project when journey `title` matches a project `name` |

---

## 3. Files

| File | Role |
|---|---|
| `src/assistant/graph.js` | Build, query, validate |
| `tests/v4_phase1_graph.test.mjs` | Phase 1 test harness |
| `docs/V4_PHASE1_KNOWLEDGE_GRAPH.md` | This note |

**Unmodified:** `providers.js`, `reasoning.js`, `conversation.js`, `planning.js`, `persona.js`, UI, `content.js`.

---

## 4. Public API (Phase 1)

| Export | Purpose |
|---|---|
| `buildEngineeringGraph(sources?)` | Pure build (injectable sources for tests) |
| `getEngineeringGraph()` | Memoized live graph |
| `resetEngineeringGraph()` | Test helper |
| `getNode` / `getNodesByType` / `getEdges` / `getNeighbors` | Queries |
| `getProjectTechnologies` / `getTechnologyProjects` | Project↔tech |
| `getProjectFeatures` / `getProjectDecisions` | Project children |
| `getArchitecturePath` | Topology walk |
| `graphStats` / `validateEngineeringGraph` | Observability / integrity |

---

## 5. Validation output

Command: `node tests/v4_phase1_graph.test.mjs`

| Metric | Result |
|---|---|
| Tests | **18 / 18 PASS** |
| `validateEngineeringGraph().ok` | **true** |
| Errors | **0** |
| Warnings | **0** |

### Live graph stats (from validation run)

| | Count |
|---|---|
| Nodes | 63 |
| Edges | 80 |
| Profile | 1 |
| Project | 3 |
| Technology | 19 |
| ArchLayer | 5 |
| Feature | 18 |
| Decision | 9 |
| JourneyPhase | 8 |

| Edge type | Count |
|---|---|
| `used_in` | 20 |
| `has_feature` | 18 |
| `appears_in_layer` | 13 |
| `has_decision` | 9 |
| `journey_step` | 7 |
| `next_layer` | 4 |
| `ships` | 3 |
| `journey_ships` | 3 |
| `via` | 2 |
| `talks_to` | 1 |

---

## 6. How to re-run

```bash
node tests/v4_phase1_graph.test.mjs
```

---

## 7. Stop

**Phase 1 complete. Do not begin Phase 2 in this change set.**
