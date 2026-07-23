# SRIIVERSEAI

**The digital headquarters of Sudhanshu Sinha** — Python backend engineer, AI developer, and full-stack engineer.

> *Building Intelligent Software That Solves Real Problems.*

A handcrafted, **build-free** single-page portfolio with an embedded reasoning assistant (**SRIIVERSE AI**). No npm install, no bundler — serve the folder and open it.

[Live demo](https://github.com/sriiverse/Portfolio) · [Evaluation suite](docs/AI_EVALUATION_SUITE.md) · [Final benchmark](docs/FINAL_BENCHMARK.md)

---

## Quick start

ES modules require HTTP (browsers block `file://` imports).

```bash
# Python
python -m http.server 5500
# → http://localhost:5500

# Node
npx serve .
```

Or use VS Code **Live Server**, or deploy the folder to Netlify / Vercel / GitHub Pages (zero build step).

Windows helper: `.\serve.ps1`

---

## What you get

| Surface | What it does |
|---|---|
| **Portfolio** | Hero (Three.js), projects, stack, five-layer architecture, journey, contact |
| **SRIIVERSE AI** | Offline portfolio assistant with a full reasoning pipeline |
| **Recruiter mode** | Hiring-fit answers grounded in shipped work |
| **Resume intelligence** | Conversational background summary (no PDF required) |
| **JD matching** | Paste a job description → match score, gaps, talking points |
| **Interview practice** | Topic-scoped mock interview (Python, SQL, React, Backend, AI/ML) |

---

## Reasoning pipeline

SRIIVERSE AI runs an eight-stage pipeline (Phases 1–6 + composition polish), validated against a **203-question** suite:

```
Mode / Command Gate
  → Question Understanding
  → Entity Resolution
  → Evidence Selection
  → Confidence
  → Response Planning
  → Response Composition
```

| Doc | Purpose |
|---|---|
| [`docs/REASONING_ENGINE_SPEC.md`](docs/REASONING_ENGINE_SPEC.md) | Implementation contract |
| [`docs/AI_EVALUATION_SUITE.md`](docs/AI_EVALUATION_SUITE.md) | 203-question ground truth |
| [`docs/FINAL_BENCHMARK.md`](docs/FINAL_BENCHMARK.md) | Full-suite results (**0 hard fails**, **0 hallucinations** after greeting fix) |

**Design rules:** knowledge first, never fabricate, honest decline when data is missing, greetings do not require evidence.

---

## Repository layout

```
index.html                 Entry + import map (Three.js) + CDN libs
src/
  main.js                  Boot sequence
  content.js               Source of truth — profile, projects, stack, KB
  scene.js / core.js       3D hero + scroll / UI chrome
  sections.js              Projects, orbs, architecture, timeline
  assistant.js             Orchestrator (pipeline + mode gates)
  assistant/
    conversation.js        Question Understanding
    entities.js            Entity Resolution + Confidence
    knowledge.js           Evidence Selection (scoped retrieval)
    planning.js            Response Planning (ResponsePlan / blocks)
    providers.js           Response Composition + LocalProvider
    persona.js             Authored voice (SELF_MODEL, TECH_TAKES)
    memory.js / awareness.js
    jdmatch.js / interview.js / tools.js / renderer.js
  styles.css               Design system
docs/                      Specs, plans, phase validations, benchmark
assets/                    Static assets (e.g. resume.pdf)
```

---

## Customise

Almost everything lives in **`src/content.js`**:

- `PROFILE`, `PROJECTS`, `STACK`, `ARCHITECTURE`, `JOURNEY`, `STATS`
- `ASSISTANT_KB`, `SKILLS_TAXONOMY`, `INTERVIEW_QUESTIONS`

Assistant voice and tech opinions live in **`src/assistant/persona.js`** (`ASSISTANT_CAPABILITIES`, `TECH_TAKES`, `SELF_MODEL`).

| Placeholder | Where |
|---|---|
| `resume.pdf` | `assets/` + `PROFILE.resume` |
| Email / socials | `PROFILE` |
| Stats marked `placeholder: true` | `STATS` |

---

## Stack

**Three.js · GSAP · Lenis · WebGL** — vanilla ES modules, no framework, no build step.

- Dark, space-inspired UI; `prefers-reduced-motion` respected  
- Cursor / 3D / assistant degrade gracefully if a CDN lib fails  
- Content grounded in live demos + public profile — nothing invented

---

## Docs index

| Document | Topic |
|---|---|
| [PROJECT_ARCHITECTURE.md](docs/PROJECT_ARCHITECTURE.md) | System overview |
| [AI_ASSISTANT_SPEC.md](docs/AI_ASSISTANT_SPEC.md) | Assistant product spec |
| [CURSOR_RULES.md](docs/CURSOR_RULES.md) | Engineering constraints |
| [CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md) | How to contribute |
| [PHASE_1…6_VALIDATION.md](docs/) | Per-phase validation reports |
| [RENDERING_POLISH_VALIDATION.md](docs/RENDERING_POLISH_VALIDATION.md) | Composition polish |

---

## License

Personal portfolio project. © Sudhanshu Sinha / SRIIVERSEAI.

---

Built to demonstrate **architecture, backend judgment, applied AI, and product honesty** — not just a pretty landing page.
