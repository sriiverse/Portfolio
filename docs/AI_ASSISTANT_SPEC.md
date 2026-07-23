# AI_ASSISTANT_SPEC.md

> Project: **SRIIVERSEAI**
>
> Version: 1.0
>
> Purpose:
>
> Define the architecture, responsibilities, future evolution, and engineering standards of the SRIIVERSE AI Assistant.

---

# Vision

The AI Assistant is **not** a chatbot.

It is the primary interface between the recruiter and the portfolio.

Instead of forcing visitors to manually browse pages, the assistant should become an intelligent engineering guide capable of:

- understanding the visitor
- understanding the portfolio
- understanding context
- explaining projects
- navigating the website
- demonstrating engineering ability

The assistant is the flagship feature of SRIIVERSEAI.

Every future enhancement should strengthen this identity.

---

# Design Philosophy

The assistant should feel like

```
ChatGPT

+

Cursor

+

Perplexity

+

Linear

+

Portfolio Guide
```

rather than

```
Customer Support Chatbot
```

---

# Core Principles

## Principle 1

The assistant always helps.

Never simply answer.

Guide.

Navigate.

Recommend.

Teach.

---

## Principle 2

The assistant knows the portfolio.

Every answer should be grounded in project knowledge.

Never hallucinate.

---

## Principle 3

Context matters.

A recruiter

↓

receives hiring-focused explanations.

An engineer

↓

receives architectural discussions.

A student

↓

receives educational guidance.

---

## Principle 4

Actions are better than words.

Whenever possible,

the assistant should

highlight

↓

scroll

↓

focus

↓

navigate

instead of merely replying.

---

# Architecture Overview

```
User

↓

Intent Detection

↓

Context Resolution

↓

Visitor Profiling

↓

Knowledge Retrieval

↓

Context Builder

↓

LLM / Local Provider

↓

Tool Selection

↓

Streaming Renderer

↓

Memory

↓

UI
```

Each stage has exactly one responsibility.

---

# Module Responsibilities

## assistant.js

Primary orchestrator.

Responsible for

- conversation lifecycle
- request routing
- provider execution
- workspace
- event handling

Never contains business logic belonging elsewhere.

---

## knowledge.js

Responsible for

Knowledge Base

Search

Ranking

Context Assembly

Future

Vector Search

Embeddings

Hybrid Retrieval

---

## memory.js

Responsible for

Conversation Memory

Visitor Memory

Preferences

Session History

Future

Persistent Memory

Conversation Threads

Pinned Chats

Bookmarks

---

## awareness.js

Responsible for

Current Section

Current Project

Scroll Position

Visibility

Viewport Awareness

Future

Mouse Intent

Reading Speed

Engagement Score

---

## providers.js

Responsible for

Response Generation.

Current Providers

Local

OpenAI

Claude

Gemini

Ollama

OpenRouter

Future

Custom Company Models

Azure OpenAI

Anthropic Enterprise

Self Hosted Models

---

## renderer.js

Responsible for

Markdown

Cards

Code Blocks

Streaming

Tables

Command Bar

Future

Charts

Diagrams

Interactive Widgets

Artifacts

---

## streaming.js

Responsible for

Typing

Streaming

Cancellation

Future

Real Token Streaming

---

## tools.js

Responsible for

Scroll

Highlight

Open

Navigation

Future

Search

Copy

Download

Share

---

## conversation.js

Responsible for (Conversation Intelligence upgrade)

Conversation Move Classification

Comparison/Opinion Entity Extraction

Architecture Scope Disambiguation (portfolio vs. project)

Runs before Knowledge Search, never after — pure classification, no retrieval, no rendering, no provider calls.

---

## persona.js

Responsible for (Conversation Intelligence upgrade)

Assistant Identity/Capability Description

Technology Opinions & Comparison Templates

Pure authored data — deliberately kept separate from `content.js`, which remains portfolio-data-only.

---

# Current Pipeline

```
Question

↓

Regex Intent

↓

Conversation Strategy

↓

Knowledge Search

↓

Template Generation

↓

Thinking Animation

↓

Streaming

↓

Render
```

> **Updated (Conversation Intelligence upgrade):** `assistant/conversation.js` now sits between Regex Intent and Knowledge Search. It classifies the conversational *move* (greeting/identity/comparison/opinion/experience/explanation-scope/factual) before any retrieval runs, so identity/greeting questions no longer depend on `knowledge.js` finding a retrievable token, opinion/recommendation questions get an authored take instead of a factual doc, and "explain the architecture" resolves deterministically to the portfolio overview or a specific project instead of losing to keyword-scoring collisions. See `docs/CONVERSATION_INTELLIGENCE_PLAN.md` for the full root-cause analysis and design. This closes part of the "No reasoning" / "No semantic understanding" gap below for a bounded set of conversational moves — it does not add a real LLM or embeddings-based retrieval, which remain Future Pipeline work.

Advantages

✓ Fast

✓ Free

✓ Offline

✓ Predictable

---

Limitations

No reasoning beyond the bounded conversational moves `conversation.js` recognizes.

No inference beyond explicit regex/alias detection.

No semantic understanding (still no embeddings/vector search).

No long-term memory.

---

# Future Pipeline

```
Question

↓

Intent Detection

↓

Hybrid Retrieval

↓

Context Builder

↓

Conversation Memory

↓

LLM

↓

Streaming

↓

Tool Calls

↓

Render

↓

Memory Update
```

This architecture preserves every existing module while significantly increasing intelligence.

---

# Knowledge System

Current

Keyword Matching

↓

Scoring

↓

Document Selection

↓

Template

Future

```
Question

↓

Embeddings

↓

Hybrid Search

↓

Knowledge Ranking

↓

Relevant Sections

↓

Context Window

↓

LLM
```

Benefits

- better retrieval

- typo tolerance

- semantic search

- richer conversations

---

# Conversation Memory

Current

```
Session

↓

Reset
```

Future

```
Conversation

↓

Thread

↓

Pinned Chats

↓

Recent History

↓

Visitor Preferences

↓

Context Recall
```

Features

- rename conversation

- delete

- archive

- search

- export

- import

---

# Visitor Profile

Current Detection

Recruiter

Engineer

Student

General Visitor

Future

Add

Hiring Manager

Founder

CTO

Developer Advocate

Product Manager

Responses become increasingly personalized.

---

# Recruiter Mode

The assistant automatically shifts priorities.

Instead of

explaining technology,

it demonstrates value.

Example

Recruiter asks

```
Tell me about QueryForge.
```

Instead of

```
It uses Flask...
```

The assistant responds

```
QueryForge demonstrates backend engineering, SQL optimization, API design, and AI-assisted developer tooling.

These skills directly align with backend engineering roles requiring Python, SQL, REST APIs, and LLM integration.
```

Recruiters care about outcomes.

Not implementation details.

> **Implemented (Sprint 3):** recruiter detection (`memory.js`'s `VisitorProfile`), automatic project reordering by inferred focus area, and phrase-variant rotation (`providers.js`'s `_pickVariant`) so repeated recruiter questions in one session don't get the identical sentence twice. Still future: hiring-manager/founder/CTO sub-personas and a dedicated analytics view of recruiter engagement.

---

# Engineer Mode

Engineers want architecture.

Responses should include

Design Decisions

Trade-offs

Scalability

Security

Performance

Maintainability

Avoid marketing language.

---

# Student Mode

Students need education.

Responses become

step-by-step

with examples

and learning resources.

---

# Interview Mode

A completely new capability.

The assistant becomes the interviewer.

Supported topics

Python

React

SQL

Backend

System Design

REST APIs

Docker

PostgreSQL

MongoDB

LLMs

Prompt Engineering

Behavioral Interviews

Features

Difficulty Levels

↓

Hints

↓

Evaluation

↓

Feedback

↓

Improvement Plan

> **Implemented (Sprint 3):** one question at a time across five topics — **Python, SQL, React, Backend, AI/ML** (`content.js`'s `INTERVIEW_QUESTIONS`, driven by `assistant/interview.js`) — with live progress ("Question 2 of 5"), keyword-coverage feedback per answer, and a session summary. Entirely offline and provider-agnostic; no scoring model, just directional keyword coverage. Still future: difficulty levels, hints, System Design / Docker / PostgreSQL / MongoDB / prompt-engineering topics, and behavioral interviews.

---

# Resume Analyzer

One of the strongest differentiators the assistant can offer is intelligent résumé analysis.

Instead of simply displaying projects, the assistant should help recruiters and candidates understand how those projects relate to real-world job requirements.

> **Note:** this section describes a visitor **uploading their own résumé** for analysis — that remains fully future work (no upload UI, no parsing pipeline exists). What Sprint 3 implemented instead is narrower and already live: **Resume Intelligence**, where the assistant answers questions about *Sudhanshu's own* background/experience/projects (a synthesized `resume` knowledge doc in `knowledge.js`, built from `PROFILE`/`JOURNEY`/`PROJECTS`/`STACK` — see `providers.js`'s `_resumeResponse`). This lets a visitor get a resume-style summary conversationally, without the PDF download working. The upload-and-analyze-a-visitor's-résumé feature described below is unrelated and unimplemented.

---

## Objective

Allow users to upload a résumé and receive intelligent analysis.

Pipeline

```
Resume

↓

Text Extraction

↓

Skill Detection

↓

Project Mapping

↓

Gap Analysis

↓

Recommendations

↓

Final Report
```

---

## Features

### Skill Extraction

Automatically identify

- Programming Languages
- Frameworks
- Databases
- Cloud Platforms
- AI Technologies
- Tools
- Soft Skills

---

### Experience Analysis

Identify

- Years of experience
- Internship history
- Projects
- Leadership
- Research
- Certifications

---

### Portfolio Matching

The assistant compares résumé skills with projects inside SRIIVERSEAI.

Example

```
Resume contains

Python

SQL

Flask

↓

Assistant recommends

QueryForge

Placement Pro+

↓

Explains why those projects demonstrate those skills.
```

---

### Missing Skills

Example response

```
Detected Skills

✓ Python
✓ SQL
✓ Flask

Missing Skills

• Docker
• CI/CD
• AWS

Recommendation

Build a deployment-focused project.
```

---

### Recruiter View

Instead of generic feedback,

the assistant answers

"What would a recruiter notice first?"

This becomes significantly more valuable than simple résumé scoring.

---

# Job Description Matching

One of the most valuable future features.

> **Implemented (Sprint 3):** paste a job description directly into the chat input; `assistant/jdmatch.js` detects it (length + posting-shape heuristics), extracts requested skills against `content.js`'s `SKILLS_TAXONOMY`, cross-references them against `STACK` to compute a match score, matched/missing skill lists, ranked relevant projects, and talking points sourced from existing `PROJECTS[].decisions` (never invented). Fully offline, no résumé mapping (there's no uploaded résumé to map) and no automatic hand-off into Interview Mode yet — those remain future work, along with the richer "Evidence Generation" and "Interview Preparation" flows described below.

---

## Pipeline

```
Job Description

↓

Requirement Extraction

↓

Skill Classification

↓

Portfolio Mapping

↓

Resume Mapping

↓

Match Score

↓

Improvement Suggestions
```

---

## Example

Input

```
Backend Engineer

Python

SQL

FastAPI

Docker

AWS

REST APIs
```

Output

```
Overall Match

87%

Strong Matches

✓ Python

✓ SQL

✓ REST APIs

✓ Flask

Partial Match

△ Docker

Missing

✕ AWS
```

---

## Evidence Generation

Instead of only giving percentages,

the assistant should provide evidence.

Example

```
Requirement

REST APIs

Satisfied By

QueryForge

Placement Pro+

Explanation

Both projects expose modular REST endpoints demonstrating API design principles.
```

Evidence builds trust.

---

## Interview Preparation

After matching a job description,

the assistant automatically suggests interview topics.

Example

```
Likely Questions

↓

Python

↓

SQL

↓

REST APIs

↓

System Design

↓

Docker
```

---

# Tool Calling Specification

Unlike ordinary chatbots,

the assistant should manipulate the portfolio itself.

---

## Current Tools

✓ Scroll

✓ Highlight

✓ Navigation

---

## Future Tools

### Open Project

```
User

Show QueryForge

↓

Assistant

Open project

↓

Scroll

↓

Highlight

↓

Explain architecture
```

---

### Copy

Copy

Code

Project Links

GitHub

Email

Resume

---

### Download

Resume

Case Studies

Architecture PDF

Project Summary

---

### Share

Generate shareable links.

Copy conversation.

Export markdown.

---

### Search

Search the portfolio.

Search documentation.

Search conversations.

---

# Streaming Experience

Streaming should feel natural.

Current

```
Entire Answer

↓

Typewriter
```

Future

```
LLM

↓

Tokens

↓

Renderer

↓

User
```

Benefits

✓ Lower perceived latency

✓ More authentic

✓ Better interaction quality

---

# Thinking States

Current

Artificial timing.

Future

Reflect real execution.

Example

```
Understanding Question...

Searching Knowledge...

Building Context...

Calling Model...

Generating Response...

Done
```

Each state should correspond to actual work.

---

# Conversation UX

The assistant should behave like a modern AI application.

---

## Multiple Conversations

Support

New Chat

Rename

Delete

Archive

Search

Pinned Conversations

---

## Message Actions

Every assistant message should include

Copy

Regenerate

Share

Delete

Bookmark

---

## User Message Actions

Edit

Resend

Delete

Pin

---

## Keyboard Shortcuts

Ctrl/Cmd + K

↓

Open Assistant

---

/

↓

Focus Input

---

Esc

↓

Close Workspace

---

Ctrl + Enter

↓

Send

---

↑

↓

Edit Previous Message

---

# Suggested Questions

Instead of static chips,

generate suggestions dynamically.

Examples

```
Tell me about QueryForge

↓

How does it scale?

↓

What challenges did you face?

↓

Show architecture.
```

This creates more natural conversations.

---

# Conversation Personalization

Remember

Preferred Topics

↓

Frequently Viewed Projects

↓

Previous Questions

↓

Visitor Type

↓

Conversation Style

The assistant gradually adapts.

---

# Modern AI Features

## ChatGPT Parity

Target Features

✓ Real Streaming

✓ Regenerate

✓ Edit Prompt

✓ History

✓ Multiple Chats

✓ Copy

✓ Markdown

✓ Citations

✓ Keyboard Shortcuts

✓ Attachments

---

## Claude Parity

Future

Artifacts

Long Reasoning

Project Workspace

Document Analysis

---

## Cursor Inspiration

Repository Awareness

Architecture Understanding

Project Navigation

Code Explanation

Engineering Discussions

---

## Perplexity Inspiration

Evidence

Sources

Comparisons

Research

Follow-up Questions

---

# Future Features

## Portfolio Analytics

Track

Projects Viewed

↓

Questions Asked

↓

Time Spent

↓

Recruiter Interest

↓

Popular Skills

Use anonymized analytics only.

---

## Voice Mode

Future

Speech Input

↓

Speech Output

↓

Hands-Free Navigation

---

## Multi-language

Support

English

Hindi

Additional languages

Future

Automatic language detection.

---

## AI Demonstration Mode

A guided walkthrough.

Example

```
Welcome.

Let me show you QueryForge.

↓

Scroll

↓

Highlight

↓

Explain

↓

Move to Placement Pro

↓

Continue

↓

Summary
```

Ideal for recruiters.

---

## Offline Mode

If no provider is available

↓

Automatically switch

↓

LocalProvider

↓

Continue functioning

Graceful degradation is essential.

---

# Engineering Rules

The assistant should always satisfy the following principles.

---

## Rule 1

Never hallucinate.

If information is unavailable,

say so.

---

## Rule 2

Prefer evidence over assumptions.

---

## Rule 3

Ground every answer in portfolio knowledge.

---

## Rule 4

Actions are better than explanations.

Navigate whenever appropriate.

---

## Rule 5

Never expose API keys.

All providers operate behind a secure proxy.

---

## Rule 6

Preserve modular architecture.

No monolithic assistant implementation.

---

## Rule 7

Performance matters.

Streaming should never block the UI.

---

## Rule 8

Accessibility is mandatory.

Every interaction must support

Keyboard

Screen Readers

Reduced Motion

---

# Success Metrics

The assistant succeeds when users can

✓ Understand every project without browsing manually.

✓ Discover relevant projects in under one minute.

✓ Receive recruiter-focused explanations.

✓ Receive engineering-focused explanations.

✓ Upload a résumé.

✓ Compare job descriptions.

✓ Practice interviews.

✓ Navigate the portfolio naturally.

✓ Trust the assistant's responses.

---

# Long-Term Vision

The SRIIVERSE AI Assistant should not merely answer questions.

It should become an **AI Engineering Companion** capable of explaining architecture, demonstrating projects, evaluating résumés, comparing job descriptions, preparing candidates for interviews, and guiding recruiters through the portfolio with contextual, trustworthy, and actionable responses.

Its goal is not to imitate ChatGPT.

Its goal is to become the most capable AI-powered portfolio assistant a recruiter has interacted with.

---

# Final Verdict

The current assistant already possesses an outstanding architectural foundation.

Its modular pipeline, awareness engine, visitor profiling, and integrated tooling distinguish it from typical portfolio chatbots.

The next stage is to replace simulated intelligence with production-grade AI capabilities while preserving the existing architecture.

This evolution should focus on:

- Secure LLM integration
- Persistent memory
- Hybrid retrieval
- Recruiter-centric workflows
- Interview simulation
- Résumé and job-description analysis
- Rich conversation UX
- Accessibility
- Performance

By following these principles, the assistant can evolve into the defining feature of SRIIVERSEAI and a compelling demonstration of AI engineering expertise.

---

**End of AI_ASSISTANT_SPEC.md**