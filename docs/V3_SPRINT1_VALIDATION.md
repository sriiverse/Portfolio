# V3 Sprint 1 Validation — Conversational Moves

> Project: **SRIIVERSEAI**  
> Sprint: **Version 3 / Sprint 1 — Conversational Moves only**  
> Contract: [`docs/V3_CONVERSATIONAL_ARCHITECTURE.md`](./V3_CONVERSATIONAL_ARCHITECTURE.md)  
> Date: 2026-07-24  
> Status: **Complete — stop here (Sprint 2 not started)**

---

## 1. Implementation

Sprint 1 adds a **composition-only** conversational-move layer on top of the frozen Version 2 reasoning pipeline.

After `_renderPlan` assembles fragments from the existing `ResponsePlan` (unchanged), it:

1. **Selects a primary move** from plan shape + `questionFrame` already on `ctx`  
   (`Greeting` · `Clarify` · `Decline` · `Compare` · `Recommend` · `Answer`)
2. **Applies dialogue framing** (presentation only): soften documentary leads, clarify wording, Decline+Pivot, thread-local Invite
3. **Annotates** `payload._conversationalMove` for observability (no UI dependency)

**Secondary framings:** `Pivot` (on Decline) and `Invite` (on Answer / Compare / Recommend / Decline when appropriate).

**Not in this sprint:** Deepen, adaptive depth levels, discourse memory, visitor-profile emphasis (Sprints 2+).

### Honesty preserved

- No new portfolio facts
- No confidence / planning / evidence / entity / understanding changes
- Gap and HonestDecline substance unchanged; Pivot only offers already-public threads (projects, architecture, owned deployment tools)

---

## 2. Architecture notes

```
Version 2 (frozen)
  QuestionFrame → Entities → Evidence → Confidence → ResponsePlan
                         ↓
Version 3 Sprint 1 (composition)
  render blocks → select move → speak (lead / clarify / pivot / invite)
                         ↓
                   { text, sources, kind, payload+_conversationalMove }
```

| Layer | Role in Sprint 1 |
|---|---|
| Understanding / Entities / Evidence / Confidence / Planning | **Untouched** — sole authority on truth |
| Composition (`providers.js` `_renderPlan` path) | Selects move from plan; reframes speech |
| Memory | Only existing `_pickVariant` phrase rotation for invite/pivot wording |

Move selection follows V3 §3.10 using **plan blocks**, not a new classifier:

| Signal | Primary move |
|---|---|
| `questionType === 'Greeting'` | Greeting |
| `HonestDecline` reason `ambiguous-subject` | Clarify |
| `Comparison` block present | Compare |
| `HonestDecline` / gap-only / negative+GapDisclosure | Decline (+ Pivot) |
| `questionType` Recruiter / Recommendation | Recommend |
| Else | Answer (+ Invite when natural) |

---

## 3. Files changed

| File | Change |
|---|---|
| `src/assistant/providers.js` | Conversational move selection + framing helpers wired into `_renderPlan` |
| `docs/V3_SPRINT1_VALIDATION.md` | This report |

**Not modified:** `conversation.js`, `entities.js`, `knowledge.js`, `planning.js`, `persona.js`, `assistant.js`, `memory.js`.

---

## 4. Behavioral examples (before vs after)

### Greeting
| | |
|---|---|
| **Before** | Warm greeting variants (already restored in polish) |
| **After** | Same; tagged `Greeting`; Invite stays inside the greeting (no FAQ footer) |

### Answer — “Do you know Docker?”
| | |
|---|---|
| **Before** | `Yes — Docker is part of…` + evidence |
| **After** | Same lead + evidence, plus Invite: *“I can point at a shipped system that uses it, or outline the full stack — your call.”* · move=`Answer` |

### Clarify — “what does your manager think about this”
| | |
|---|---|
| **Before** | `I'm not sure who you mean. Could you clarify…?` |
| **After** | Same clarification; move=`Clarify`; no bolted-on project FAQ list |

### Compare — “Compare Flask and FastAPI”
| | |
|---|---|
| **Before** | `Comparing Flask and FastAPI:` + table + take |
| **After** | `Here's how I'd contrast Flask and FastAPI:` + same table/take/evidence + Invite fork · move=`Compare` |

### Recommend — “Why should we hire him?”
| | |
|---|---|
| **Before** | Often opened with documentary `Based on what is documented:` + hire prose |
| **After** | Documentary opener removed; hire substance first; Invite: demo vs architecture · move=`Recommend` |

### Decline + Pivot — “Does he know Kubernetes?”
| | |
|---|---|
| **Before** | `Kubernetes is not part of Sudhanshu's shipped project history.` |
| **After** | Same honest decline + Pivot: owned deployment tools / demo offer · move=`Decline` |

### Decline + Pivot — nonsense / no-data
| | |
|---|---|
| **Before** | Documented-gap line + long “Try asking about…” list |
| **After** | Same honesty; suggestion list spoken as *closest useful threads* (projects / architecture / stack) · move=`Decline` |

---

## 5. Validation report

Focused harness (12 cases covering all Sprint 1 moves):

| Metric | Result |
|---|---|
| Cases | 12 |
| Pass | **12 / 12** |
| Fail | 0 |
| Moves observed | Greeting 2 · Answer 3 · Clarify 1 · Compare 1 · Recommend 2 · Decline 3 |
| Fabricated salary/metrics in samples | **0** |
| `planning.js` / understanding / evidence / confidence edited | **No** |
| Plan `kind` remains planner-owned (`text` unless project-card override from existing polish) | **Yes** |

### Case table

| ID | Question | Expected move | Got | Pass |
|---|---|---|---|---|
| G1 | Hi | Greeting | Greeting | ✓ |
| G2 | Good morning | Greeting | Greeting | ✓ |
| A1 | Do you know Docker? | Answer | Answer | ✓ |
| A2 | Do you know Python? | Answer | Answer | ✓ |
| C1 | what does your manager think about this | Clarify | Clarify | ✓ |
| Cmp1 | Compare Flask and FastAPI | Compare | Compare | ✓ |
| R1 | Why should we hire him? | Recommend | Recommend | ✓ |
| R2 | AI engineer hire consideration | Recommend | Recommend | ✓ |
| D1 | Does he know Kubernetes? | Decline | Decline | ✓ |
| D2 | Does he know AWS? | Decline | Decline | ✓ |
| D3 | nonsense | Decline | Decline | ✓ |
| P1 | Tell me about QueryForgeAI | Answer | Answer | ✓ |

Benchmark posture: Sprint 1 is presentation-only on authorized plans. Core Version 2 honesty paths (gap tech, ambiguous subject, greetings-before-confidence) remain intact. A full 203-question re-run was **not** required for Sprint 1 scope; spot checks above cover every move in scope.

---

## 6. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Invites feel spammy or FAQ-like | Single invite; skipped if turn already ends in a question; phrase rotation via existing `_pickVariant` |
| Pivot invents missing skills | Pivot copy only names owned deployment surface / projects / architecture — never claims the declined tech |
| Move mis-selected vs planner intent | Selection keyed off plan blocks + frozen `questionType`, not a new NLU pass |
| Softening “Based on what is documented” hides low-confidence caution | Softening applies on Answer/Recommend presentation; Decline/Clarify paths untouched; low-confidence no-data still declines |
| Double Invite + Pivot | If pivot already asks a question, extra invite suppressed |
| Sprint creep into Deepen / memory | Explicitly deferred; no discourse-state store added |

---

## 7. Deliverable checklist

1. ✓ Implementation (composition moves in `providers.js`)  
2. ✓ Architecture notes (§2)  
3. ✓ Files changed (§3)  
4. ✓ Behavioral before/after (§4)  
5. ✓ Validation report (§5)  
6. ✓ Risks and mitigations (§6)  

**Sprint 1 complete. Do not begin Sprint 2 in this change set.**
