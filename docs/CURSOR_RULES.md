# CURSOR_RULES.md

> Project: **SRIIVERSEAI**
>
> Version: 1.0
>
> Purpose:
>
> Define permanent engineering rules for Cursor Agent and any future AI coding assistants working on this repository.
>
> These rules exist to preserve architecture, maintain code quality, and ensure consistent development.

---

# Primary Objective

Every change should improve the portfolio while preserving its architecture.

Do **not** optimize for the fastest implementation.

Optimize for:

- Maintainability
- Performance
- Simplicity
- Readability
- Scalability

---

# Golden Rule

**Understand the repository before modifying it.**

Before making changes, always:

1. Read the relevant modules.
2. Understand existing patterns.
3. Preserve established architecture.
4. Make incremental improvements.

Never begin implementation without repository analysis.

---

# Architecture Rules

## Rule 1 — Preserve Zero-Build Architecture

The project intentionally avoids React, Vue, Angular, and similar frameworks.

Do **not** migrate the application to another framework.

Native ES Modules are a core architectural decision.

---

## Rule 2 — Respect Module Boundaries

Every module has a single responsibility.

Never place unrelated logic into an existing module.

Examples:

- Rendering logic belongs in `renderer.js`
- Knowledge retrieval belongs in `knowledge.js`
- Memory belongs in `memory.js`
- Scene logic belongs in `scene.js`

Avoid creating "god files."

---

## Rule 3 — No Large-Scale Rewrites

Do not rewrite working code simply because another implementation is possible.

Prefer:

```
Small Refactor

↓

Review

↓

Improve

↓

Repeat
```

Incremental evolution is preferred over replacement.

---

## Rule 4 — Preserve Existing APIs

When modifying modules:

- Keep public interfaces stable whenever possible.
- Avoid breaking downstream consumers.
- Introduce changes behind well-defined abstractions.

---

# AI Assistant Rules

The AI Assistant is the flagship feature of the portfolio.

Prioritize improvements that enhance:

- Accuracy
- Context awareness
- Navigation
- Recruiter experience
- Engineering explanations

Avoid adding gimmicks that do not improve usefulness.

---

## Knowledge First

Responses should always be grounded in the portfolio's knowledge base.

Never fabricate information.

If information is unavailable:

- State the limitation.
- Suggest the closest relevant content.

---

## Tool Calling

Prefer actions over explanations.

If a user asks:

> "Show me QueryForge"

The assistant should:

1. Navigate to the project.
2. Highlight it.
3. Explain it.

Not simply describe it in chat.

---

# Frontend Rules

## Preserve Visual Identity

Do not redesign components unnecessarily.

Future UI should remain consistent with:

- Typography
- Colors
- Motion
- Glassmorphism
- Layout
- Interaction patterns

---

## Accessibility

Every new feature must support:

- Keyboard navigation
- Focus states
- Screen readers
- Reduced motion preferences
- Semantic HTML

Accessibility is a requirement, not an enhancement.

---

## Performance

Every new feature should answer:

- Does it increase bundle size?
- Does it block rendering?
- Does it increase GPU usage?
- Can it be lazy-loaded?

Performance regressions require justification.

---

# Three.js Rules

The 3D scene supports the experience.

It should never dominate it.

Guidelines:

- Avoid excessive particle counts.
- Pause rendering when inactive.
- Detect low-end devices.
- Maintain smooth interaction.

---

# Code Style

Follow the existing coding style.

Do not introduce inconsistent formatting.

Prefer:

- Descriptive variable names
- Small functions
- Early returns
- Pure functions where practical
- Explicit imports

Avoid unnecessary abstraction.

---

# Dependency Policy

Before adding a dependency, ask:

1. Can this be implemented with native browser APIs?
2. Does an existing library already solve it?
3. Is the dependency actively maintained?
4. Does it justify its weight?

Every dependency should have a clear benefit.

---

# Error Handling

Never fail silently.

Errors should:

- Be logged appropriately.
- Degrade gracefully.
- Preserve the user experience.

Avoid uncaught runtime exceptions.

---

# Security Rules

Never expose:

- API keys
- Tokens
- Secrets
- Environment variables

All production AI providers must be accessed through a secure backend or serverless proxy.

Validate and sanitize all external input.

---

# Testing Expectations

Before completing any implementation:

- Verify functionality.
- Check responsive layouts.
- Confirm keyboard accessibility.
- Test reduced motion.
- Ensure no console errors.
- Verify no existing behavior regressed.

---

# Documentation Rules

Whenever architecture changes:

Update:

- `PROJECT_ARCHITECTURE.md`
- `AI_ASSISTANT_SPEC.md`
- `CHANGELOG.md`

Documentation should evolve alongside the code.

---

# Pull Request Checklist

Every significant change should answer:

- What changed?
- Why was it necessary?
- Which modules were affected?
- Were accessibility checks performed?
- Were performance implications considered?
- Were related documents updated?

---

# Commit Message Convention

Use clear, conventional commit messages.

Examples:

```
feat: add recruiter mode to AI assistant

fix: resolve resume download issue

refactor: split content into domain modules

perf: lazy-load Three.js assets

docs: update assistant architecture specification
```

Avoid vague messages such as:

```
update

changes

fix stuff

misc
```

---

# AI Agent Workflow

For every task:

1. Understand the problem.
2. Inspect affected modules.
3. Propose the smallest effective change.
4. Implement incrementally.
5. Verify correctness.
6. Update documentation if needed.

Do not skip analysis.

---

# Definition of Success

A successful implementation:

- Preserves architecture.
- Improves maintainability.
- Enhances user experience.
- Maintains performance.
- Respects accessibility.
- Keeps the codebase understandable.

---

# Non-Negotiable Principles

- Do not rewrite for the sake of rewriting.
- Do not introduce unnecessary frameworks.
- Do not sacrifice maintainability for speed.
- Do not compromise accessibility.
- Do not expose secrets.
- Do not add dependencies without justification.
- Do not break existing module boundaries.

---

# Long-Term Engineering Vision

SRIIVERSEAI should evolve as a showcase of software engineering discipline.

Every contribution should reinforce:

- Clean architecture
- Modular design
- Thoughtful UX
- AI-first interaction
- High performance
- Long-term maintainability

The codebase should remain approachable for both human developers and AI coding agents.

---

**End of CURSOR_RULES.md**