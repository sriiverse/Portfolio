# CONTRIBUTING.md

> Thank you for contributing to **SRIIVERSEAI**.

This document explains how to contribute while preserving the project's engineering philosophy.

---

# Project Goals

SRIIVERSEAI is an AI-powered engineering portfolio designed to demonstrate:

- Software Architecture
- Frontend Engineering
- Backend Engineering
- AI Integration
- Product Thinking
- User Experience

Every contribution should reinforce these goals.

---

# Before You Start

Please read:

1. PROJECT_ARCHITECTURE.md
2. AI_ASSISTANT_SPEC.md
3. DESIGN_GUIDELINES.md
4. CURSOR_RULES.md

Understanding the architecture is required before making changes.

---

# Development Principles

Follow these principles:

- Preserve modularity.
- Keep functions focused.
- Prefer composition over duplication.
- Avoid unnecessary abstraction.
- Optimize for readability.

---

# Repository Structure

```
/
├── index.html
├── README.md
├── robots.txt
├── sitemap.xml
├── assets/
├── docs/                 # Specs, plans, validation, benchmark
└── src/
    ├── main.js
    ├── content.js        # Portfolio source of truth
    ├── styles.css
    ├── scene.js
    ├── core.js
    ├── sections.js
    ├── assistant.js      # Orchestrator
    └── assistant/        # Pipeline modules (see README)
```

Future modules should follow the same organizational style.

---

# Coding Standards

Prefer:

- Small, focused functions.
- Clear naming.
- Pure functions where practical.
- Explicit imports.
- Early returns.

Avoid:

- Deep nesting.
- Duplicate logic.
- Large utility files.
- Hidden side effects.

---

# Architecture Guidelines

Do not:

- Rewrite working systems.
- Introduce frameworks.
- Merge unrelated responsibilities.
- Break module boundaries.

Instead:

- Extend existing modules.
- Refactor incrementally.
- Preserve public interfaces.

---

# Accessibility Checklist

Every feature should support:

- Keyboard navigation.
- Focus visibility.
- Semantic HTML.
- Screen readers.
- Reduced motion.

Accessibility is part of the definition of done.

---

# Performance Checklist

Before merging:

- No unnecessary dependencies.
- No blocking rendering.
- No excessive animations.
- No significant increase in asset size.
- No avoidable GPU overhead.

---

# Documentation

Whenever architecture or behavior changes:

Update:

- PROJECT_ARCHITECTURE.md
- AI_ASSISTANT_SPEC.md
- CHANGELOG.md

If visual behavior changes:

Update:

- DESIGN_GUIDELINES.md

Documentation should never fall behind the code.

---

# Commit Messages

Use Conventional Commits.

Examples

```
feat: add conversation history

fix: improve assistant scrolling

perf: optimize Three.js rendering

refactor: split content module

docs: update architecture guide
```

---

# Pull Requests

Every pull request should include:

- Summary of changes.
- Motivation.
- Screenshots (if UI changed).
- Testing notes.
- Accessibility considerations.
- Performance considerations.
- Documentation updates.

---

# Testing Checklist

Before submitting:

- Application starts without errors.
- Console is clean.
- Responsive layouts verified.
- Keyboard navigation works.
- AI assistant functions correctly.
- Animations remain smooth.

---

# Working With AI Coding Agents

When using Cursor, Claude Code, or ChatGPT:

1. Share the relevant documentation.
2. Ask the agent to inspect the repository first.
3. Request incremental changes.
4. Avoid "rewrite everything" prompts.
5. Review generated code before merging.

AI should accelerate development, not replace engineering judgment.

---

# Roadmap Alignment

Contributions should align with the documented roadmap.

High-priority areas include:

- AI assistant evolution.
- Accessibility.
- Production readiness.
- Performance.
- Authentic project presentation.

---

# Code Review Philosophy

Reviews should focus on:

- Correctness.
- Maintainability.
- Simplicity.
- User experience.
- Long-term scalability.

Feedback should improve the codebase rather than merely enforce style preferences.

---

# License

Unless otherwise stated, contributions are accepted under the project's license.

By contributing, you agree that your changes may be modified, reviewed, or redistributed as part of the project.

---

# Final Note

SRIIVERSEAI is intended to be more than a portfolio—it is a demonstration of engineering discipline.

Every contribution, whether made by a human developer or an AI coding assistant, should leave the project cleaner, more understandable, and more maintainable than before.

---

**End of CONTRIBUTING.md**