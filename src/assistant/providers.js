/**
 * providers.js — LLM abstraction for SRIIVERSE AI 2.0.
 *
 * Default = Enhanced LocalProvider: produces beautifully structured,
 * grounded answers from content.js with the full engineering narrative:
 * What → Why → How → Trade-offs → Lessons → What this means for you.
 *
 * Hybrid provider selection: checks window.SRIIVERSE_AI_CONFIG first.
 * If no key configured, falls back to LocalProvider — no code change needed
 * to activate a real LLM later.
 *
 * Real LLM providers (OpenAI, Gemini, Claude, Ollama, OpenRouter) are included
 * and all receive the same grounded portfolio context so answers stay anchored.
 */

import { retrieve, getDoc, getProfile, getAllProjects, getStack } from './knowledge.js';
import { analyzeJobDescription } from './jdmatch.js';
import {
  ASSISTANT_CAPABILITIES,
  TECH_TAKES,
  SELF_MODEL,
  DIGITAL_BRAIN,
  WELCOME_VARIANTS,
} from './persona.js';
import {
  classifyReasoningStrategy,
  synthesizeReasoning,
  mayOverrideDecline,
  DECISION_FIRST_STRATEGIES,
} from './reasoning.js';
import { finalizeWithReflection } from './reflection.js';
import {
  adaptDraft,
  resolveAudienceMode,
  fillWelcome,
  getWelcomeTemplates,
  pickAudienceInvite,
  buildProjectAudienceCallout,
} from './adaptive.js';

/* ============================================================
   CONFIG
   ============================================================ */
export function getConfig() {
  return Object.assign({
    provider: 'local',
    apiKey: '',
    endpoint: '',
    model: '',
  }, window.SRIIVERSE_AI_CONFIG || {});
}

/* ============================================================
   SYSTEM PROMPT (shared by all real LLM providers)
   ============================================================ */
function buildSystemPrompt(profile) {
  const name = profile.name;
  return [
    `You are SRIIVERSE AI — the digital engineering brain of ${name}, a Python backend engineer, AI developer, and full-stack engineer.`,
    `You are NOT a chatbot or FAQ. You are the intelligent operating system of ${name}'s portfolio.`,
    `You think, communicate, and reason exactly as ${name} would during a live technical walkthrough or engineering interview.`,
    ``,
    `CORE RULES:`,
    `1. ONLY answer from the provided portfolio context. If the context doesn't cover it, say so honestly.`,
    `2. Never invent technologies, metrics, employers, or experience that are not in the context.`,
    `3. Explain engineering decisions — not just features. Always answer What → Why → How → Trade-offs.`,
    `4. Be concise and confident. Write like an engineer, not a marketer.`,
    `5. Adapt emphasis to the visitor: recruiter (fit/demos), engineer (trade-offs), founder (ownership/ship speed), student (teaching clarity).`,
    `5. Use markdown formatting. Structure responses with headers, bullets, and code where relevant.`,
    `6. Cite sources as [n] referencing the numbered context chunks.`,
    `7. End every substantive response with 2-3 meaningful follow-up suggestions.`,
    ``,
    `RESPONSE STRUCTURE for project questions:`,
    `## [ProjectName]`,
    `**[tagline]**`,
    `### 🎯 What it does`,
    `### 🏗️ How it's built`,
    `### ⚡ Technology Stack`,
    `### 💡 Engineering Decisions`,
    `### 🔗 Live`,
  ].join('\n');
}

/* ============================================================
   GROUNDED PROMPT BUILDER (shared by all real LLM providers)
   ============================================================ */
function buildGroundedPrompt(query, ctx) {
  const hits = retrieve(query, 5);
  const context = hits.map((h, i) => `[${i + 1}] (${h.doc.source}) ${h.doc.text}`).join('\n\n');
  const profile = getProfile();
  const system = buildSystemPrompt(profile);
  const transcript = ctx.memory?.transcript(6) || '';
  const awarenessCtx = ctx.awarenessContext || '';
  const visitorProfile = ctx.visitorProfile
    ? `\nVISITOR PROFILE: ${JSON.stringify(ctx.visitorProfile)}`
    : '';

  const userContent = [
    `PORTFOLIO CONTEXT (verified — cite by [n]):`,
    context,
    awarenessCtx ? `\nWEBSITE STATE: ${awarenessCtx}` : '',
    visitorProfile,
    transcript ? `\nCONVERSATION HISTORY:\n${transcript}` : '',
    `\nVISITOR QUESTION: ${query}`,
  ].filter(Boolean).join('\n');

  return { system, user: userContent, sources: hits.map((h) => h.doc) };
}

/* ============================================================
   ENHANCED LOCAL PROVIDER
   Produces structured, premium responses grounded in content.js.
   No API key, no network — fully offline.
   ============================================================ */
const LocalProvider = {
  name: 'local',

  async generate(query, ctx = {}) {
    await sleep(280 + Math.random() * 220);
    // Compose → Adaptive audience mode → Reflection (before render return).
    const draft = await this._draftAnswer(query, ctx);
    const adapted = adaptDraft(draft, { ...ctx, query });
    return finalizeWithReflection(adapted, { ...ctx, query });
  },

  /**
   * Compose a draft answer (plan render / legacy routes). Reflection runs
   * in `generate()` after this returns — do not call reflection here.
   */
  async _draftAnswer(query, ctx = {}) {
    // Job Description Matching short-circuits retrieval entirely — it's a
    // scoring operation over the raw pasted text, not a knowledge lookup.
    // Deliberately checked BEFORE the plan branch below and never migrated
    // into the block/plan system, per docs/REASONING_ENGINE_SPEC.md §8.3's
    // `_jdMatchResponse` row ("Not migrated — explicitly out of scope") and
    // §10's explicit out-of-scope note.
    if (ctx.intent === 'jd-match') return this._jdMatchResponse(query);

    // --- STAGE 8: RESPONSE COMPOSITION (docs/REASONING_ENGINE_SPEC.md §4.7/§8.3) ---
    // `ctx.plan` — a `ResponsePlan` built by Stage 7's `buildResponsePlan()`
    // (assistant.js's orchestration call, live as of Phase 5) — is rendered
    // directly here and REPLACES every branch below for any caller that
    // threads it through, per Implementation Order step 12's exact "add
    // the `ctx.plan`-present branch inside `generate()`, falling back to
    // today's existing routing when no plan is present." Everything from
    // here to the end of this function is retained, unmodified, as that
    // fallback — exercised only by a caller that invokes `generate()`
    // without Stage 7 having run (e.g. a bare unit test). This is a pure
    // render step: it does not retrieve evidence, classify the question,
    // modify `ctx.plan`, or reassess confidence — it only turns the plan's
    // already-decided blocks into markdown, in the order given.
    if (ctx.plan) {
      return this._renderPlan(ctx.plan, ctx);
    }

    // --- CONVERSATION STRATEGY ROUTING (Conversation Intelligence upgrade) ---
    // strategy (assistant/conversation.js's QuestionFrame — Question
    // Understanding stage, docs/REASONING_ENGINE_SPEC.md Section 8.2)
    // decides the conversational MOVE before retrieval runs. Each branch
    // below either answers directly (greeting/identity — no portfolio facts
    // needed) or resolves the grounding deterministically (explanation
    // scope) instead of leaving it to keyword scoring. Anything not handled
    // here falls through to the existing retrieval-first pipeline,
    // completely unchanged, below. `ctx.strategy` renamed to
    // `ctx.questionFrame` per Section 8.2's migration contract — the local
    // variable name `strategy` and every field it reads below (`.move`,
    // `.scope`, etc.) are unchanged, since buildQuestionFrame() still
    // returns all of those fields.
    const strategy = ctx.questionFrame;
    if (strategy) {
      if (strategy.move === 'greeting') return this._greetingResponse(ctx);
      if (strategy.move === 'identity') return this._identityResponse();
      if (strategy.move === 'comparison' && strategy.scope === 'tech') return this._techComparisonResponse(strategy);
      if (strategy.move === 'comparison' && strategy.scope === 'project') return this._comparisonResponse(query, retrieve(query, 5));
      if (strategy.move === 'opinion') return this._opinionResponse(strategy);
      if (strategy.move === 'experience') return this._experienceResponse(strategy, query);
      if (strategy.move === 'explanation' && strategy.scope === 'portfolio') {
        const overviewDoc = getDoc('arch-overview');
        if (overviewDoc) return this._archResponse(overviewDoc, [{ doc: overviewDoc }]);
      }
      if (strategy.move === 'explanation' && strategy.scope === 'project' && strategy.projectId) {
        const projectDoc = getDoc(`project-arch-${strategy.projectId}`);
        const proj = getAllProjects().find((p) => p.id === strategy.projectId);
        if (proj && projectDoc) {
          return this._projectResponse(proj, projectDoc, 'architecture', [{ doc: projectDoc }], ctx.visitorProfile, ctx.memory);
        }
      }
    }

    // Reasoning-engine migration (docs/REASONING_ENGINE_SPEC.md Stage 5,
    // "Evidence Selection"): `ctx.evidence.supportingDocs` — built by
    // `knowledge.js`'s `buildEvidenceSet()` from `assistant.js`'s Stage 5
    // orchestration call — replaces a raw `retrieve(query, 5)` call here.
    // Identical element shape (`{doc, score}[]`), and by construction
    // *at least as good* a candidate set: `buildEvidenceSet()` calls
    // `retrieveScoped()`, which prefers docs whose `kind` has affinity with
    // `questionFrame.questionType` (the direct fix for Cluster E's
    // "document-kind routing collisions") and transparently falls back to
    // the exact same unscoped result `retrieve()` would have returned
    // whenever that preference doesn't clear the score floor. Falls back to
    // a direct `retrieve()` call only when `ctx.evidence` itself is absent
    // (e.g. `generate()` invoked directly, outside the Stage 5-aware
    // `assistant.js` orchestration) — preserving this method's behavior for
    // any caller that doesn't thread the new stage through.
    const hits = ctx.evidence ? ctx.evidence.supportingDocs : retrieve(query, 5);
    if (!hits.length) {
      return { text: this._fallback(ctx), sources: [], kind: 'text', payload: null };
    }

    const top = hits[0].doc;
    // classifyIntent() no longer returns 'architecture'/'stack' (narrowed to
    // commands only — docs/REASONING_ENGINE_SPEC.md Section 8.2). Derive
    // the equivalent local hint from the QuestionFrame's questionType so
    // `_projectResponse()`'s `intent === 'architecture' | 'stack'` checks
    // below still route correctly, without changing that method itself.
    const qType = ctx.questionFrame?.questionType;
    const intent = ctx.intent
      || (qType === 'ArchitectureExplanation' ? 'architecture' : qType === 'TechnologyExplanation' ? 'stack' : 'question');
    const focusProject = ctx.focusProject;
    const visitorProfile = ctx.visitorProfile;

    // Route by top document kind
    if (top.kind === 'project' || top.kind === 'project-arch' || top.kind === 'project-stack') {
      const proj = getAllProjects().find((p) => p.id === top.projectId);
      if (proj) return this._projectResponse(proj, top, intent, hits, visitorProfile, ctx.memory);
    }

    if (top.kind === 'stack') return this._stackResponse(hits);
    if (top.kind === 'arch' || top.kind === 'arch-overview') return this._archResponse(top, hits);
    if (top.kind === 'recommend') return this._recommendResponse(top, ctx);
    if (top.kind === 'profile') return this._profileResponse(top, ctx);
    if (top.kind === 'resume') return this._resumeResponse(hits);

    // Comparison query detection
    if (/compare|vs\.?|versus|difference between/i.test(query)) {
      return this._comparisonResponse(query, hits);
    }

    // Generic QA
    return { text: top.text, sources: hits.slice(0, 3).map((h) => h.doc), kind: 'text', payload: null };
  },

  _fallback(ctx) {
    const suggestions = ['projects', 'architecture', 'tech stack', 'why hire Sudhanshu'];
    return `I didn't quite catch that — I'm trained specifically on Sudhanshu's portfolio. Try asking about his ${suggestions.join(', ')}, or say "open a project demo".`;
  },

  /* ============================================================
     CONVERSATION STRATEGY COMPOSERS (Conversation Intelligence upgrade)
     Answer directly from persona.js (authored voice) + real portfolio
     facts (knowledge.js) — never from fuzzy retrieval — for moves that
     retrieval structurally cannot serve well: self-description, opinion,
     tech-vs-tech comparison, and evidence-based experience answers.
     ============================================================ */
  _greetingResponse(ctx) {
    const profile = getProfile();
    const text = this._professionalWelcome(ctx, profile);
    return {
      text,
      sources: [],
      kind: 'text',
      payload: { _conversationalMove: 'Greeting', _digitalBrain: DIGITAL_BRAIN.title },
    };
  },

  /** Digital Engineering Brain professional welcome (no casual chatbot hello). */
  _professionalWelcome(ctx, profile = getProfile()) {
    const templates = getWelcomeTemplates().map((t) => fillWelcome(t, profile.name));
    const variants = templates.length
      ? templates
      : WELCOME_VARIANTS.map((t) => fillWelcome(t, profile.name));
    return this._pickVariant(ctx?.memory, 'greeting-brain', variants);
  },

  _identityResponse() {
    const profile = getProfile();
    const projects = getAllProjects();
    const text = [
      `## ${DIGITAL_BRAIN.brand}`,
      ``,
      DIGITAL_BRAIN.nature,
      ``,
      profile.tagline || '',
      ``,
      `### What I Can Do`,
      ASSISTANT_CAPABILITIES.map((c) => `- ${c.icon} **${c.label}** — ${c.desc}`).join('\n'),
      ``,
      `### Three Live Systems`,
      projects.map((p) => `- **${p.name}** — ${p.tagline}`).join('\n'),
      ``,
      DIGITAL_BRAIN.purpose,
      ``,
      `Ask about depth, hiring fit, architecture, or paste a job description to match.`,
    ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
    return {
      text,
      sources: [],
      kind: 'text',
      payload: { _digitalBrain: DIGITAL_BRAIN.title },
    };
  },

  /**
   * Resolve a TECH_TAKES entry from a strategy's category (preferred) or
   * entities. When exactly two entities were named (a real "X vs Y"
   * comparison), only an EXACT pair match counts — a partial match here
   * would silently substitute a different technology's opinion (e.g.
   * "Django vs Flask" must never render the "Flask vs FastAPI" take just
   * because Flask overlaps). Partial matching only applies for a single
   * named tech (opinion-style — "what do you think of FastAPI?").
   */
  _findTechTake(strategy) {
    if (strategy.category) {
      const byCategory = TECH_TAKES.find((t) => t.category === strategy.category);
      if (byCategory) return byCategory;
    }
    const entities = strategy.entities || [];
    if (entities.length >= 2) {
      const set = new Set(entities);
      return TECH_TAKES.find((t) => t.techs.length === entities.length && t.techs.every((x) => set.has(x))) || null;
    }
    if (entities.length === 1) {
      return TECH_TAKES.find((t) => t.techs.includes(entities[0])) || null;
    }
    return null;
  },

  /** Real-project evidence lines for a TECH_TAKES entry — skips entries with no shipped project (honesty over invention). */
  _renderTechEvidence(entry) {
    const projects = getAllProjects();
    return entry.evidence
      .filter((e) => e.project)
      .map((e) => {
        const proj = projects.find((p) => p.id === e.project);
        return proj ? `- **${e.tech}** — used in ${proj.name} (${proj.tagline}).` : '';
      })
      .filter(Boolean)
      .join('\n');
  },

  _techEvidenceSources(entry) {
    const projects = getAllProjects();
    return entry.evidence
      .filter((e) => e.project)
      .map((e) => projects.find((p) => p.id === e.project))
      .filter(Boolean)
      .map((p) => ({ source: p.name, link: '#projects' }));
  },

  /** Honest degradation when no TECH_TAKES entry covers the requested pair — never fabricates a take. */
  _techTakeFallback(strategy) {
    const entities = strategy.entities || [];
    const label = entities.length ? entities.join(' vs ') : 'that comparison';
    const stackNames = new Set(getStack().map((s) => s.name));
    const known = entities.filter((e) => stackNames.has(e));
    const text = [
      `## ${label}`,
      ``,
      `I don't have a first-hand comparison for that specific pair yet — I can speak most confidently about technologies actually in Sudhanshu's stack.`,
      ``,
      known.length
        ? `${known.join(' and ')} ${known.length > 1 ? 'are' : 'is'} part of that stack — ask me about ${known[0]} directly, or ask "what technologies does he know?" for the full picture.`
        : `Ask me "what technologies does he know?" for the full picture, or name a technology from his stack directly.`,
    ].join('\n');
    return { text, sources: [], kind: 'text', payload: null };
  },

  _techComparisonResponse(strategy) {
    const entry = this._findTechTake(strategy);
    if (!entry) return this._techTakeFallback(strategy);
    const [a, b] = entry.techs;
    const evidenceLines = this._renderTechEvidence(entry);
    const text = [
      `## ${a} vs ${b}`,
      ``,
      `| Dimension | ${a} | ${b} |`,
      `|---|---|---|`,
      entry.dimensions.map((d) => `| ${d.name} | ${d.a} | ${d.b} |`).join('\n'),
      ``,
      `### My Take`,
      entry.preference,
      entry.groundingNote ? `\n> ${entry.groundingNote}` : '',
      evidenceLines ? `\n### Where This Shows Up\n${evidenceLines}` : '',
    ].filter(Boolean).join('\n');
    return { text, sources: this._techEvidenceSources(entry), kind: 'text', payload: null };
  },

  _opinionResponse(strategy) {
    const entry = this._findTechTake(strategy);
    if (!entry) return this._techTakeFallback(strategy);
    const [a, b] = entry.techs;
    const evidenceLines = this._renderTechEvidence(entry);
    const text = [
      `## ${a} or ${b}?`,
      ``,
      entry.preference,
      ``,
      `### The Trade-offs`,
      entry.dimensions.map((d) => `- **${d.name}** — ${a}: ${d.a} · ${b}: ${d.b}`).join('\n'),
      entry.groundingNote ? `\n> ${entry.groundingNote}` : '',
      evidenceLines ? `\n### Where This Shows Up\n${evidenceLines}` : '',
    ].filter(Boolean).join('\n');
    return { text, sources: this._techEvidenceSources(entry), kind: 'text', payload: null };
  },

  // Function words filtered out before searching project text for
  // experience-question evidence — deliberately short so real tech nouns
  // (backend, database, sql, api…) always survive as search terms.
  _EXPERIENCE_STOPWORDS: new Set([
    'the', 'and', 'have', 'you', 'your', 'me', 'built', 'what', 'tell', 'about',
    'projects', 'demonstrate', 'show', 'used', 'worked', 'shipped', 'production',
    'experience', 'do', 'did', 'does', 'that', 'this', 'with', 'for', 'are', 'is',
  ]),

  _experienceResponse(strategy, query) {
    const projects = getAllProjects();
    const entities = (strategy.entities || []).map((e) => e.toLowerCase());
    const queryWords = String(query || '').toLowerCase().match(/[a-z][a-z0-9+.#]{1,}/g) || [];
    const searchTerms = [...new Set([...entities, ...queryWords])]
      .filter((w) => w.length > 2 && !this._EXPERIENCE_STOPWORDS.has(w));

    const haystack = (p) => [
      p.name, p.tagline, p.problem, p.solution, p.stack.join(' '),
      p.features.map((f) => `${f.title} ${f.desc}`).join(' '), p.decisions.join(' '),
    ].join(' ').toLowerCase();

    const matches = searchTerms.length ? projects.filter((p) => searchTerms.some((t) => haystack(p).includes(t))) : [];
    const relevant = matches.length ? matches : projects;
    const lead = matches.length
      ? `Yes — here's where that shows up directly:`
      : `Yes — across three shipped, production systems:`;

    const text = [
      `## ${lead}`,
      ``,
      relevant.map((p) => {
        const decision = p.decisions.find((d) => searchTerms.some((t) => d.toLowerCase().includes(t)));
        return `- **${p.name}** — ${p.tagline}${decision ? `\n  ${decision}` : ''}`;
      }).join('\n'),
      ``,
      `Ask me to open any of these live, or go deeper into one project's architecture.`,
    ].join('\n');

    return {
      text,
      sources: relevant.slice(0, 2).map((p) => ({ source: p.name, link: '#projects' })),
      kind: 'text',
      payload: null,
    };
  },

  _projectResponse(proj, doc, intent, hits, visitorProfile, memory) {
    const mode = (intent === 'architecture' || doc.kind === 'project-arch') ? 'architecture'
      : (intent === 'stack' || doc.kind === 'project-stack') ? 'stack' : 'full';
    const text = this._projectCardMarkdown(proj, mode, visitorProfile, memory);

    return {
      text,
      sources: [doc, ...hits.filter((h) => h.doc.kind === 'project-arch').map((h) => h.doc)].slice(0, 3),
      kind: 'project-card',
      payload: { project: proj },
    };
  },

  /**
   * Rich project-card markdown for a single project — factored out of
   * `_projectResponse` unchanged (same exact strings, same three modes)
   * so Stage 8's `_renderEvidence` can produce the identical polished
   * card for a plan-derived single-project Evidence block without
   * duplicating this template. `mode` is `'architecture' | 'stack' |
   * 'full'`; `visitorProfile`/`memory` are only used for the optional
   * recruiter callout in `'full'` mode, exactly as before.
   */
  _projectCardMarkdown(proj, mode, visitorProfile, memory) {
    if (mode === 'architecture') {
      return [
        `## ${proj.name}`,
        `**${proj.tagline}**`,
        ``,
        `### 🏗️ How It's Built`,
        proj.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n'),
        ``,
        `### ⚡ Technology Stack`,
        proj.stack.map((s) => `\`${s}\``).join(' · '),
        ``,
        `### 💡 Why These Choices`,
        `The architecture reflects a deliberate philosophy: the AI is a **reasoning layer over real data**, not a blind text generator. Flask/FastAPI keeps orchestration close to where it matters — the backend. The frontend is intentionally decoupled over REST.`,
        ``,
        `### 🔗 See It Live`,
        `[Open Demo ↗](${proj.live})${proj.repo ? ` · [GitHub ↗](${proj.repo})` : ''}`,
      ].join('\n');
    }
    if (mode === 'stack') {
      return [
        `## ${proj.name} — Technology Stack`,
        ``,
        `### ⚡ Technologies Used`,
        proj.stack.map((s) => `- \`${s}\``).join('\n'),
        ``,
        `### 💡 Why This Stack`,
        proj.decisions[0] || `The stack was chosen for production correctness and developer velocity.`,
        ``,
        `### 🔗 Live`,
        `[Open Demo ↗](${proj.live})`,
      ].join('\n');
    }
    // Full project response — core engineering narrative + audience callout
    const modeId = resolveAudienceMode({
      visitorProfile,
      memory,
      questionFrame: null,
    });
    // Prefer explicit visitorProfile.type when project cards render mid-session.
    const effectiveMode = (visitorProfile?.type && visitorProfile.type !== 'unknown')
      ? visitorProfile.type
      : modeId;
    const relevance = this._recruiterRelevance(proj, visitorProfile, memory);
    const audienceSection = buildProjectAudienceCallout(proj, effectiveMode, relevance);

    return [
      `## ${proj.name}`,
      `**${proj.tagline}**`,
      ``,
      `### 🎯 What It Does`,
      `**Problem:** ${proj.problem}`,
      ``,
      `**Solution:** ${proj.solution}`,
      ``,
      `### 🏗️ How It's Built`,
      proj.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n'),
      ``,
      `### ⚡ Technology Stack`,
      proj.stack.map((s) => `\`${s}\``).join(' · '),
      ``,
      `### ✨ Key Capabilities`,
      proj.features.slice(0, 4).map((f) => `- **${f.title}** — ${f.desc}`).join('\n'),
      audienceSection,
      ``,
      `### 🔗 Live`,
      `[Open Demo ↗](${proj.live})${proj.repo ? ` · [GitHub ↗](${proj.repo})` : ''}`,
    ].join('\n');
  },

  _recruiterRelevance(proj, visitorProfile, memory) {
    const area = visitorProfile?.focusArea || 'default';
    const variantsByArea = {
      backend: [
        'Python backend engineering, REST API design, and production system delivery',
        'server-side ownership — schema design, API contracts, and shipping backend systems that hold up under real traffic',
      ],
      ai: [
        'applied AI integration, LLM-powered feature development, and prompt engineering',
        'AI as a product feature, not a demo — retrieval-grounded LLM features shipped end to end',
      ],
      database: [
        'database engineering, query optimization, and schema intelligence',
        'treating the database as an intelligent system — indexing, query plans, and schema-aware tooling',
      ],
      frontend: [
        'full-stack delivery with modern React/TypeScript frontend',
        'a decoupled React/TypeScript frontend wired to a real backend over REST, not a static mockup',
      ],
      default: [
        'end-to-end product engineering from backend to AI layer to deployment',
        'ownership of the entire stack — one engineer taking a system from database to deployed product',
      ],
    };
    const variants = variantsByArea[area] || variantsByArea.default;
    return this._pickVariant(memory, `recruiter-relevance:${area}`, variants);
  },

  /**
   * Picks a phrase-variant not yet shown this session (Sprint 3 — Priority 1:
   * "highlight strengths without sounding repetitive"). Falls back to the
   * first variant when memory is unavailable, and cycles back once every
   * variant has been used, so it degrades gracefully rather than erroring.
   */
  _pickVariant(memory, key, variants) {
    if (!memory || typeof memory.hasUsedPhrase !== 'function') return variants[0];
    const candidates = variants.map((text, i) => ({ text, phraseKey: `${key}:${i}` }));
    const unused = candidates.filter((c) => !memory.hasUsedPhrase(c.phraseKey));
    const pool = unused.length ? unused : candidates;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    memory.markPhraseUsed(pick.phraseKey);
    return pick.text;
  },

  _stackResponse(hits) {
    const stackDoc = hits.find((h) => h.doc.kind === 'stack')?.doc;
    if (!stackDoc) return { text: 'Tech stack information not found.', sources: [], kind: 'text', payload: null };

    const text = [
      `## Technology Stack`,
      ``,
      `Sudhanshu's stack is production-proven — every technology listed here is used in a live, shipped system.`,
      ``,
      `### 🔷 Languages`,
      `\`Python\` · \`JavaScript\` · \`TypeScript\``,
      ``,
      `### 🟣 Backend`,
      `\`Flask\` · \`FastAPI\` · \`REST APIs\` · \`JWT\``,
      `Python is the backbone. Flask for tight control, FastAPI for async performance. JWT for stateless auth.`,
      ``,
      `### 🔵 Frontend`,
      `\`React\` · \`TailwindCSS\``,
      ``,
      `### 🔴 Data & AI`,
      `\`PostgreSQL\` · \`MongoDB\` · \`LLMs\` · \`Ollama\``,
      ``,
      `### 🚀 Deployment`,
      `\`Docker\` · \`Vercel\` · \`Netlify\` · \`Render\``,
      ``,
      `> The AI is always a **reasoning layer over real data** — not a black-box generator. Every LLM integration is grounded in schema, resumes, or repositories.`,
    ].join('\n');

    return { text, sources: [stackDoc], kind: 'stack-card', payload: null };
  },

  _archResponse(doc, hits) {
    const isOverview = doc.kind === 'arch-overview';
    if (isOverview) {
      const text = [
        `## Five-Layer System Architecture`,
        ``,
        `Every project follows the same deliberate topology:`,
        ``,
        `\`\`\``,
        `Frontend (React/TypeScript)`,
        `    ↓ REST`,
        `Backend (Python · Flask · FastAPI)`,
        `    ↓ Orchestration`,
        `AI Layer (LLMs · Ollama · Retrieval)`,
        `    ↓ Queries`,
        `Database (PostgreSQL · MongoDB)`,
        `    ↓ Containers`,
        `Deployment (Docker · Vercel · Netlify)`,
        `\`\`\``,
        ``,
        `### Why This Topology?`,
        `- **Backend owns correctness.** Auth, business logic, and data integrity live in Python — not scattered.`,
        `- **AI is a reasoning layer.** LLMs reason over real data (SQL schemas, resumes, repo graphs). They don't generate blindly.`,
        `- **Frontend is decoupled.** REST is the only contract — the surface can change without touching the core.`,
        `- **Deployment is reproducible.** Docker containers ensure local dev mirrors production exactly.`,
      ].join('\n');
      return { text, sources: hits.slice(0, 4).map((h) => h.doc), kind: 'arch-card', payload: null };
    }
    return { text: doc.text, sources: [doc], kind: 'text', payload: null };
  },

  _recommendResponse(doc, ctx) {
    const projects = getAllProjects();
    const profile = ctx.visitorProfile;
    // ctx.intent === 'recruiter' no longer exists post-narrowing (Spec
    // Section 8.2) — questionFrame.questionType === 'Recruiter' is its
    // direct replacement.
    const isRecruiter = ctx.questionFrame?.questionType === 'Recruiter' || profile?.type === 'recruiter';

    if (isRecruiter) {
      const focusArea = profile?.focusArea;
      let lead = this._pickVariant(ctx.memory, 'recommend-lead', [
        `Sudhanshu is a **backend-first engineer who also owns AI features and ships full product**. Three production systems are live — not prototypes:`,
        `Across three shipped systems, the pattern holds: **Python backend, applied AI, full ownership** — working production software, not isolated demos:`,
      ]);

      // Reorder projects based on focus area
      let orderedProjects = [...projects];
      if (focusArea === 'database') orderedProjects = [projects[0], projects[2], projects[1]]; // queryforge first
      if (focusArea === 'ai') orderedProjects = [projects[2], projects[0], projects[1]]; // reporadar first
      if (focusArea === 'fullstack') orderedProjects = [projects[1], projects[0], projects[2]]; // placementpro first

      const text = [
        `## Why Hire Sudhanshu Sinha`,
        ``,
        lead,
        ``,
        orderedProjects.map((p) => `- **${p.name}** — ${p.tagline}`).join('\n'),
        ``,
        `### 💪 What He's Strongest At`,
        `- **Python Backend Engineering** — Flask/FastAPI services, REST APIs, JWT auth, business logic`,
        `- **Applied AI** — LLM integrations that ship as product features, not demos`,
        `- **System Architecture** — end-to-end thinking across all five layers`,
        `- **Problem Solving** — turns ambiguous requirements into observable, reliable software`,
        ``,
        focusArea ? `### 🎯 Specifically for Your ${focusArea} Need\n${this._recruiterFocusText(focusArea, projects)}` : '',
        ``,
        `**Fastest way to assess fit:** ask me to open any project demo, or compare two projects.`,
      ].filter(Boolean).join('\n');

      return { text, sources: [doc], kind: 'text', payload: null };
    }

    return { text: doc.text, sources: [doc], kind: 'text', payload: null };
  },

  _recruiterFocusText(focusArea, projects) {
    const map = {
      backend:  `QueryForgeAI and RepoRadarAI both have Python backends in production. Flask for QueryForge's orchestration, FastAPI for RepoRadar's async GitHub ingestion. Both handle real user traffic.`,
      ai:       `All three products ship applied AI: QueryForgeAI uses LLMs for SQL optimization, Placement Pro+ for resume gap detection, and RepoRadarAI for repository understanding. AI is never a gimmick — it's the core product feature.`,
      database: `QueryForgeAI is the deepest database engineering project — natural language to SQL, execution plan analysis, and schema-aware query optimization. It treats the database as an intelligent system, not just storage.`,
      frontend: `Placement Pro+'s terminal-style OS interface and RepoRadarAI's React/TypeScript surface demonstrate full-stack delivery. The frontend is always decoupled from the backend over REST.`,
      fullstack: `Placement Pro+ is the most complete full-stack product — resume parsing backend, AI gap detection, personalized roadmap generation, and a terminal-style OS frontend. End-to-end ownership, single engineer.`,
    };
    return map[focusArea] || `See the projects section for a detailed walkthrough of each system.`;
  },

  _profileResponse(doc, ctx) {
    const text = [
      `## Sudhanshu Sinha`,
      `**Python Backend Engineer · AI Developer · Full-Stack Engineer**`,
      ``,
      `SRIIVERSEAI is his engineering practice — the philosophy that intelligent software should solve real problems, not just demonstrate technology.`,
      ``,
      `### What He Builds`,
      `- **AI-powered products** — LLMs as product features, not demos`,
      `- **Scalable backend systems** — Python services built for correctness`,
      `- **Modern web applications** — end-to-end, from API to interface`,
      ``,
      `### How He Thinks`,
      `Every system follows a deliberate architecture: Frontend → Backend → AI Layer → Database → Deployment. The AI is always a reasoning layer over real data.`,
      ``,
      `### Three Live Systems`,
      getAllProjects().map((p) => `- **${p.name}** — ${p.tagline}`).join('\n'),
      ``,
      `📧 ${getProfile().email} · GitHub ${getProfile().githubHandle}`,
    ].join('\n');

    return { text, sources: [doc], kind: 'text', payload: null };
  },

  /* ============================================================
     RESUME INTELLIGENCE (Sprint 3)
     Answers resume/experience questions from PROFILE/JOURNEY/PROJECTS/
     STACK directly — never requires the résumé PDF download to work.
     ============================================================ */
  _resumeResponse(hits) {
    const profile = getProfile();
    const projects = getAllProjects();

    const text = [
      `## ${profile.name} — Resume Summary`,
      `**${profile.title}**`,
      ``,
      `### 🧭 Background`,
      `${profile.tagline} His engineering practice is SRIIVERSEAI — intelligent software that solves real problems, not demos.`,
      ``,
      `### 🚀 Experience — Shipped Systems`,
      projects.map((p) => `- **${p.name}** — ${p.tagline}`).join('\n'),
      ``,
      `### ⚡ Technology Stack`,
      getStack().map((s) => `\`${s.name}\``).join(' · '),
      ``,
      `### 📬 Contact`,
      `${profile.email} · GitHub ${profile.githubHandle}`,
      ``,
      `*This is a conversational summary of his background — ask about any project, the architecture, or the stack for more depth. For anything not covered here (e.g. formal education or certifications), that information isn't part of this portfolio's knowledge base.*`,
    ].join('\n');

    return { text, sources: hits.slice(0, 1).map((h) => h.doc), kind: 'resume', payload: null };
  },

  /* ============================================================
     JOB DESCRIPTION MATCHING (Sprint 3)
     Formats jdmatch.js's structured result as markdown; "relevant
     projects" reuses the existing citations renderer via `sources`.
     ============================================================ */
  _jdMatchResponse(jdText) {
    const result = analyzeJobDescription(jdText);

    if (result.noSkillsDetected) {
      const text = [
        `## Job Description Match`,
        ``,
        `I couldn't detect specific technical requirements in that text — try pasting the requirements/qualifications section directly, or ask me about a specific technology instead.`,
      ].join('\n');
      return { text, sources: [], kind: 'jd-match', payload: null };
    }

    const { score, matchedSkills, missingSkills, relevantProjects, talkingPoints } = result;
    const skillRows = [
      ...matchedSkills.map((s) => `| ${s} | ✅ Matched |`),
      ...missingSkills.map((s) => `| ${s} | ✕ Missing |`),
    ];

    const text = [
      `## Job Description Match`,
      ``,
      `### 🎯 Match Score: ${score}%`,
      ``,
      `| Skill | Status |`,
      `|---|---|`,
      ...skillRows,
      ``,
      relevantProjects.length ? `### 🏗️ Relevant Projects` : '',
      relevantProjects.length ? relevantProjects.map((p) => `- **${p.name}** — ${p.tagline}`).join('\n') : '',
      ``,
      talkingPoints.length ? `### 💬 Suggested Interview Talking Points` : '',
      talkingPoints.length ? talkingPoints.map((t) => `- ${t}`).join('\n') : '',
      missingSkills.length ? `\n> Missing skills (${missingSkills.join(', ')}) aren't in this stack today — worth being upfront about in an interview rather than glossing over.` : '',
    ].filter(Boolean).join('\n');

    return {
      text,
      sources: relevantProjects.map((p) => ({ source: p.name, link: '#projects' })),
      kind: 'jd-match',
      payload: null,
    };
  },

  _comparisonResponse(query, hits) {
    const q = query.toLowerCase();
    const projects = getAllProjects();
    const found = projects.filter((p) => q.includes(p.id) || q.includes(p.name.toLowerCase()));

    if (found.length >= 2) {
      const [a, b] = found;
      const text = [
        `## ${a.name} vs ${b.name}`,
        ``,
        `| Dimension | ${a.name} | ${b.name} |`,
        `|---|---|---|`,
        `| Purpose | ${a.tagline} | ${b.tagline} |`,
        `| Backend | ${a.stack.filter((s) => ['Python', 'Flask', 'FastAPI'].includes(s)).join(', ')} | ${b.stack.filter((s) => ['Python', 'Flask', 'FastAPI'].includes(s)).join(', ')} |`,
        `| AI Role | ${a.features.find((f) => /ai|llm|intelligence/i.test(f.title))?.title || 'Core feature'} | ${b.features.find((f) => /ai|llm|intelligence/i.test(f.title))?.title || 'Core feature'} |`,
        `| Deployment | ${a.stack.filter((s) => ['Vercel', 'Netlify', 'Render', 'Docker'].includes(s)).join(', ')} | ${b.stack.filter((s) => ['Vercel', 'Netlify', 'Render', 'Docker'].includes(s)).join(', ')} |`,
        ``,
        `### ${a.name}`,
        `${a.solution}`,
        ``,
        `### ${b.name}`,
        `${b.solution}`,
        ``,
        `### Key Difference`,
        `**${a.name}** is focused on ${a.theme}-domain intelligence. **${b.name}** targets the ${b.theme} domain. Both share the same five-layer architecture — the difference is in what the AI layer reasons over.`,
      ].join('\n');

      return {
        text,
        sources: hits.slice(0, 3).map((h) => h.doc),
        kind: 'comparison',
        payload: { projectA: a, projectB: b },
      };
    }

    return { text: hits[0]?.doc.text || 'Could not compare.', sources: [], kind: 'text', payload: null };
  },

  /* ============================================================
     STAGE 8 — RESPONSE COMPOSITION (docs/REASONING_ENGINE_SPEC.md §4.7, §7, §8.3)

     Pure renderer over a `ResponsePlan` (Stage 7's output, `planning.js`).
     Consumes ONLY the plan: renders every `ResponseBlock` in the order the
     planner put them, joins the resulting markdown paragraphs, and
     collects `sources` from the blocks' own evidence — it never retrieves,
     classifies, reassesses confidence, mutates the plan, or reorders
     anything. Each `_render<Type>` below is the "render half" of a
     pre-migration `_xResponse` method per §8.3's disposition table; the
     "plan-building half" of that same method already lives in
     `planning.js` (frozen, Phase 5) and is not touched here.
     ============================================================ */

  /**
   * Renders a full `ResponsePlan` into the provider's standard
   * `{text, sources, kind, payload}` shape. Two renderer-owned formatting
   * decisions live here (both explicitly within Stage 8's remit as a
   * *renderer*, not as new reasoning about facts):
   *   1. `inline`-style Evidence fragments are appended to the previous
   *      paragraph instead of starting a new one (§7.2's render behavior).
   *   2. A block whose rendered text is byte-identical to an already
   *      -rendered paragraph is suppressed. This matters today because
   *      `planning.js`'s `SelfModel` and `GapDisclosure` branches
   *      intentionally set their own block's `data.text`/`items[0]` to the
   *      exact same string as the paired `DirectAnswer` (see
   *      `docs/PHASE_5_VALIDATION.md`) — rendering both verbatim would
   *      print the same sentence twice. Suppressing the repeat is a
   *      formatting decision, not a content decision: no fact, ordering,
   *      or confidence outcome changes, only whether an identical string
   *      is printed once or twice.
   *
   * Version 3 Sprint 1 — conversational moves after fragment assembly.
   * Version 3 Sprint 1.5 — Portfolio Intelligence synthesis + voice scrub.
   * Version 3 Sprint 2 — Reasoning Strategy Layer (reasoning.js): classify
   * the cognitive task (Recommend / Evaluate / Rank / …), compare portfolio
   * entity attributes, speak Decision-first for evaluative turns.
   * Understanding, entities, evidence, confidence, and planning stay frozen.
   */
  _renderPlan(plan, ctx) {
    if (!plan || !Array.isArray(plan.blocks)) {
      return { text: this._fallback(ctx), sources: [], kind: 'text', payload: null };
    }

    const seenFragments = new Set();
    const paragraphs = [];
    const sourcesAcc = [];
    let followupHint = null;
    let kind = plan.kind || 'text';
    let payload = plan.payload || null;

    for (const block of plan.blocks) {
      const rendered = this._renderBlock(block, ctx);
      if (!rendered) continue;

      const { fragment, sourcesForBlock, kindOverride, payloadOverride, inline, followupHint: fh } = rendered;

      if (fragment) {
        const key = fragment.trim();
        if (key && !seenFragments.has(key)) {
          seenFragments.add(key);
          if (inline && paragraphs.length) {
            const prev = paragraphs[paragraphs.length - 1];
            const sep = /[.:!?]\*{0,2}\s*$/.test(prev) ? ' ' : ' — ';
            paragraphs[paragraphs.length - 1] = prev + sep + fragment;
          } else {
            paragraphs.push(fragment);
          }
        }
      }
      if (sourcesForBlock?.length) sourcesAcc.push(...sourcesForBlock);
      if (kindOverride) kind = kindOverride;
      if (payloadOverride) payload = payloadOverride;
      if (fh) followupHint = fh;
    }

    let sources = plan.sourcesOverride || this._dedupeSources(sourcesAcc);
    const move = this._selectConversationalMove(plan, ctx);

    // Sprint 2 — Reasoning Strategy Layer (composition-adjacent)
    let spoken = null;
    let intelligenceIntent = null;
    let reasoningMeta = null;
    const qRaw = String(ctx?.questionFrame?.rawQuery || '');
    const classification = (move !== 'Greeting' && move !== 'Clarify')
      ? classifyReasoningStrategy(qRaw, ctx)
      : { strategy: null, task: null };
    const probedIntent = classification?.task || null;
    const maySynthesize = probedIntent && (
      move !== 'Decline'
      || mayOverrideDecline(probedIntent)
    );
    if (maySynthesize) {
      const intel = this._tryPortfolioIntelligence(plan, ctx, move, classification);
      if (intel?.text) {
        spoken = intel.text;
        intelligenceIntent = intel.intent;
        reasoningMeta = intel.reasoning || null;
        if (intel.sources?.length) sources = this._dedupeSources([...intel.sources, ...sources]);
        // Evaluative reasoning never surfaces as a project-card dump.
        if (intel.replaceKind || (classification.strategy && DECISION_FIRST_STRATEGIES.has(classification.strategy))) {
          kind = 'text';
        }
      }
    }

    if (!spoken) spoken = this._applyConversationalMove(paragraphs, move, plan, ctx);
    spoken = this._scrubImplementationVoice(spoken, ctx);

    payload = Object.assign({}, payload, {
      ...(followupHint ? { _followupHint: followupHint } : {}),
      _conversationalMove: move,
      ...(intelligenceIntent ? { _portfolioIntelligence: intelligenceIntent } : {}),
      ...(reasoningMeta ? { _reasoningStrategy: reasoningMeta } : {}),
    });

    return { text: spoken, sources, kind, payload };
  },

  /* ============================================================
     V3 SPRINT 1 — CONVERSATIONAL MOVES (composition-only)
     docs/V3_CONVERSATIONAL_ARCHITECTURE.md §3

     Selects a primary dialogue move from the frozen ResponsePlan +
     questionFrame already on ctx. Never re-runs understanding, entity
     resolution, evidence, confidence, or planning. May only change how
     the already-authorized text is spoken (leads, clarify phrasing,
     decline+pivot, invite). Deepen / visitor depth / discourse memory
     are out of Sprint 1 scope.
     ============================================================ */

  /**
   * Primary-move selection — mirrors V3 §3.10 using plan shape only.
   * Returns one of: Greeting | Clarify | Decline | Compare | Recommend | Answer
   * (Pivot and Invite are secondary framings applied onto Decline/Answer/etc.)
   */
  _selectConversationalMove(plan, ctx) {
    const qType = ctx?.questionFrame?.questionType || null;
    const blocks = plan?.blocks || [];
    const types = blocks.map((b) => b.type);
    const decline = blocks.find((b) => b.type === 'HonestDecline');

    if (qType === 'Greeting') return 'Greeting';
    if (decline?.data?.reason === 'ambiguous-subject') return 'Clarify';
    if (types.includes('Comparison')) return 'Compare';
    if (decline || (types.includes('GapDisclosure') && !types.includes('Evidence') && !types.includes('Comparison'))) {
      return 'Decline';
    }
    // Negative DirectAnswer + GapDisclosure (owned-gap skill checks) is still
    // a Decline move conversationally — Version 2 already decided the gap.
    const direct = blocks.find((b) => b.type === 'DirectAnswer');
    if (direct?.data?.polarity === 'negative' && types.includes('GapDisclosure')) return 'Decline';
    if (qType === 'Recruiter' || qType === 'Recommendation') return 'Recommend';
    return 'Answer';
  },

  /**
   * Presentation-only dialogue framing. Does not add portfolio facts.
   * Pivot targets are limited to already-public portfolio surface areas
   * (projects / architecture / stack / demos) — never new claims.
   */
  _applyConversationalMove(paragraphs, move, plan, ctx) {
    let parts = paragraphs.filter((p) => p && String(p).trim());
    if (!parts.length) return '';

    switch (move) {
      case 'Greeting':
        // Variants already embed an Invite; no extra footer.
        return parts.join('\n\n');

      case 'Clarify':
        return this._converseClarify(parts, plan);

      case 'Decline':
        return this._converseDeclineWithPivot(parts, plan, ctx);

      case 'Compare':
        return this._converseCompare(parts, plan, ctx);

      case 'Recommend':
        return this._converseRecommend(parts, plan, ctx);

      case 'Answer':
      default:
        return this._converseAnswer(parts, plan, ctx);
    }
  },

  /** Strip robotic doc-export leads; keep answer-before-prove order intact. */
  _converseAnswer(parts, plan, ctx) {
    const qType = ctx?.questionFrame?.questionType;
    let out = parts.map((p, i) => {
      if (i !== 0) return p;
      return this._softenDocumentaryLead(p, { preferGone: qType === 'SkillVerification' || /^(Yes —)/.test(p) });
    });

    const invite = this._inviteFor(plan, ctx, 'Answer');
    if (invite && !this._alreadyEndsWithInvite(out)) out = out.concat(invite);
    return out.join('\n\n');
  },

  /** Clarify: one short question turn — drop generic portfolio suggestion lists. */
  _converseClarify(parts) {
    // Prefer the planner's redirect question; keep the lead + redirect only.
    const text = parts.join(' ').replace(/\s+/g, ' ').trim();
    // If a generic "try asking about..." trailer leaked in, drop it for Clarify.
    const cleaned = text
      .replace(/\s*Try asking about his projects, architecture, tech stack, why hire Sudhanshu, or say "open a project demo"\.?/i, '')
      .trim();
    return cleaned;
  },

  /**
   * Decline + optional Pivot. Honesty text stays; pivot only offers nearby
   * portfolio threads (never invents the missing fact).
   */
  _converseDeclineWithPivot(parts, plan, ctx) {
    let out = parts.slice();
    const decline = (plan?.blocks || []).find((b) => b.type === 'HonestDecline');
    const gap = (plan?.blocks || []).find((b) => b.type === 'GapDisclosure');
    const reason = decline?.data?.reason;
    const gapText = (gap?.data?.items || []).join(' ') || out[0] || '';

    // Gap-tech declines: keep honesty; upgrade only the stock no-data suggestion
    // list into a Pivot-shaped offer (never invent the missing fact).
    if (decline && reason === 'no-data') {
      out = out.map((p, i) => {
        if (i !== 0) return p;
        return p.replace(
          /Try asking about his projects, architecture, tech stack, why hire Sudhanshu, or say "open a project demo"\.?/i,
          'Closest useful threads from here: his shipped projects, the five-layer architecture, or his production stack.',
        );
      });
    }

    const pivot = this._pivotForGap(gapText, ctx);
    if (pivot && !this._alreadyEndsWithInvite(out)) out = out.concat(pivot);

    const invite = this._inviteFor(plan, ctx, 'Decline');
    // Avoid stacking pivot + invite when pivot already asks a question.
    if (invite && pivot && /\?/.test(pivot)) {
      /* pivot carries the invite */
    } else if (invite && !this._alreadyEndsWithInvite(out)) {
      out = out.concat(invite);
    }
    return out.join('\n\n');
  },

  _converseCompare(parts, plan, ctx) {
    let out = parts.map((p, i) => {
      if (i !== 0) return p;
      // "Comparing X and Y:" → spoken contrast lead (same entities, no new claims).
      const m = /^(?:\*\*)?Comparing\s+(.+?)\s+and\s+(.+?):?(?:\*\*)?\s*$/i.exec(p.trim());
      if (m) return `Here's how I'd contrast ${m[1].trim()} and ${m[2].trim()}:`;
      return this._softenDocumentaryLead(p, { preferGone: false });
    });
    const invite = this._inviteFor(plan, ctx, 'Compare');
    if (invite && !this._alreadyEndsWithInvite(out)) out = out.concat(invite);
    return out.join('\n\n');
  },

  _converseRecommend(parts, plan, ctx) {
    let out = parts.map((p, i) => {
      if (i !== 0) return p;
      const softened = this._softenDocumentaryLead(p, { preferGone: true });
      // If the lead vanished (it was only the documentary opener), the next
      // paragraph already carries the hire/recommend substance — fine.
      return softened;
    }).filter((p) => p && String(p).trim());

    if (!out.length) out = parts.slice();

    // Ensure a recommend-shaped invite when missing.
    const invite = this._inviteFor(plan, ctx, 'Recommend');
    if (invite && !this._alreadyEndsWithInvite(out)) out = out.concat(invite);
    return out.join('\n\n');
  },

  /**
   * Softens Version 2's documentary DirectAnswer leads without adding claims.
   * Sprint 1.5: never replace with "From his portfolio" — that still sounds
   * like a doc export. Prefer removing the opener entirely.
   */
  _softenDocumentaryLead(text, { preferGone } = {}) {
    const raw = String(text || '');
    const trimmed = raw.trim();
    if (/^\*{0,2}Based on what is documented:\*{0,2}$/i.test(trimmed)) {
      return preferGone ? '' : '';
    }
    if (/^\*{0,2}Based on what is documented:\*{0,2}\s+/i.test(trimmed)) {
      return trimmed.replace(/^\*{0,2}Based on what is documented:\*{0,2}\s+/i, '');
    }
    if (/^\*{0,2}From his portfolio:\*{0,2}$/i.test(trimmed)) {
      return '';
    }
    if (/^\*{0,2}From his portfolio:\*{0,2}\s+/i.test(trimmed)) {
      return trimmed.replace(/^\*{0,2}From his portfolio:\*{0,2}\s+/i, '');
    }
    return raw;
  },

  /**
   * Sprint 1.5 — strip implementation / documentation-export voice from
   * composed speech. Does not add claims. If the visitor explicitly asks how
   * the assistant works, allow a plain local/bundled explanation (no RAG jargon).
   */
  _scrubImplementationVoice(text, ctx) {
    let t = String(text || '');
    if (!t) return t;

    const q = String(ctx?.questionFrame?.rawQuery || ctx?.query || '');
    const asksHowAssistantWorks = /how (do|does) (you|the assistant|this) work|are you (an |a )?(llm|ai|chatgpt|gpt|rag)|external api|do you (call|use) (an? )?(api|llm|openai|gemini)|retrieval|embedding|knowledge base|how (are|is) (you|this) (built|implemented)/i.test(q);

    // Always kill doc-export leads and RAG self-labels in visitor-facing speech.
    t = t.replace(/\*{0,2}Based on what is documented:\*{0,2}\s*/gi, '');
    t = t.replace(/\*{0,2}From his portfolio:\*{0,2}\s*/gi, '');
    t = t.replace(/\bAccording to (the )?(documentation|knowledge base|docs)\b[,:]?\s*/gi, '');
    t = t.replace(/\b(Based on|From) (the )?(documentation|knowledge base|docs)\b[,:]?\s*/gi, '');

    if (!asksHowAssistantWorks) {
      t = t.replace(/\bI'?m a retrieval-and-reasoning layer over Sudhanshu'?s own portfolio content, not a general-purpose model\s*[—–-]\s*/gi, '');
      t = t.replace(/\bretrieval-and-reasoning layer\b/gi, 'portfolio assistant');
      t = t.replace(/\bnot a general-purpose model\b/gi, 'focused on this portfolio');
      t = t.replace(/\bonly answer from what'?s actually documented here\b/gi, 'only speak to what\'s in this portfolio');
      t = t.replace(/\bwhen something isn'?t\.?\s*$/gim, 'when something isn\'t covered.');
      t = t.replace(/\b(matched locally|bundled into this page and matched)\b/gi, 'available in this portfolio');
      t = t.replace(/\bThis information isn'?t documented in the portfolio\./gi, 'I don\'t have that in Sudhanshu\'s portfolio.');
      t = t.replace(/\bisn'?t documented (here|in the portfolio)\b/gi, 'isn\'t covered in his portfolio');
      t = t.replace(/\bwhat is documented\b/gi, 'what\'s in the portfolio');
      t = t.replace(/\bfrom (the )?documentation\b/gi, 'from his work');
    } else {
      // Honest mechanism answer without RAG vocabulary.
      if (/retrieval-and-reasoning|knowledge base|embeddings?/i.test(t)) {
        t = "I run entirely in this page — I reason from Sudhanshu's portfolio content that's already here, and I don't call an external API. I only claim what's in the portfolio, and I'll say so when something isn't.";
      }
    }

    // Collapse leftover whitespace from removals.
    t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return t;
  },

  _alreadyEndsWithInvite(parts) {
    const last = String(parts[parts.length - 1] || '');
    return /\?\s*$/.test(last.trim()) || /would you like|want me to|ask me|open (a |any )?project|where would you/i.test(last);
  },

  /**
   * Pivot after a gap/decline — only to public portfolio surface areas.
   * Uses gap prose already in the plan to stay on-thread; does not claim
   * the missing skill.
   */
  _pivotForGap(gapText, ctx) {
    const t = String(gapText || '');
    if (/kubernetes|aws|azure|gcp|rust|graphql|kafka|terraform|django|redis/i.test(t)) {
      return this._pickVariant(ctx?.memory, 'v3-pivot-gap-tech', [
        'If useful, I can walk through the deployment and cloud-adjacent tools he does ship — Docker, Vercel, Netlify, Render — or open a project demo.',
        'Closest grounded thread: his production deployment layer (Docker / Vercel / Netlify / Render), or a shipped project walkthrough.',
      ]);
    }
    if (/educational|degree|gpa|salary|notice period|manager/i.test(t)) {
      return null; // Clarify/Decline already handled; no fake personal pivot
    }
    return null;
  },

  /**
   * Single-thread Invite — one natural fork, not a chip wall.
   * Wording is presentation-only; targets are existing portfolio capabilities.
   */
  _inviteFor(plan, ctx, move) {
    const qType = ctx?.questionFrame?.questionType;
    const blocks = plan?.blocks || [];
    const hasComparison = blocks.some((b) => b.type === 'Comparison');
    const hasProjectCard = blocks.some((b) => b.type === 'Evidence') && this._resolveSingleProjectFromFacts(
      (blocks.find((b) => b.type === 'Evidence')?.data?.facts) || [],
    );
    const primary = ctx?.entities?.primaryEntity;
    const modeId = resolveAudienceMode(ctx);
    const audienceInvite = pickAudienceInvite(modeId, move, ctx);
    if (audienceInvite && modeId !== 'default') {
      return this._pickVariant(ctx?.memory, `v4-invite-${modeId}-${move}`, [audienceInvite]);
    }

    if (move === 'Compare' || hasComparison) {
      return this._pickVariant(ctx?.memory, 'v3-invite-compare', [
        'Want me to relate that back to a shipped project, or compare a different pair?',
        'Should I show where this shows up in his projects next?',
      ]);
    }
    if (move === 'Recommend' || qType === 'Recruiter') {
      return this._pickVariant(ctx?.memory, 'v3-invite-recommend', [
        'Want me to open the strongest project demo for that fit, or match a job description next?',
        'I can open a project demo, or we can walk the five-layer architecture — which helps more?',
      ]);
    }
    if (hasProjectCard) {
      return this._pickVariant(ctx?.memory, 'v3-invite-project', [
        'Want the architecture decisions next, or should I open the live demo?',
        'Should I go deeper on how it was built, or open the demo?',
      ]);
    }
    if (qType === 'SkillVerification' && primary?.ownership === 'owned') {
      return this._pickVariant(ctx?.memory, 'v3-invite-skill-yes', [
        'Want a project where that shows up, or the broader stack view?',
        'I can point at a shipped system that uses it, or outline the full stack — your call.',
      ]);
    }
    if (qType === 'ArchitectureExplanation') {
      return this._pickVariant(ctx?.memory, 'v3-invite-arch', [
        'Want this applied to a specific project, or a comparison of backend choices?',
      ]);
    }
    if (move === 'Answer' && (qType === 'TechnologyExplanation' || qType === 'Experience')) {
      return this._pickVariant(ctx?.memory, 'v3-invite-generic', [
        'Want a project walkthrough next, or a hiring-fit angle?',
      ]);
    }
    return null;
  },

  /* ============================================================
     V3 SPRINT 1.5 + 2 — PORTFOLIO INTELLIGENCE / REASONING
     Sprint 2: classifyReasoningStrategy + synthesizeReasoning
     (reasoning.js) drive evaluative answers. Frozen V2 stages
     untouched. Greeting / Clarify never synthesize.
     ============================================================ */

  /**
   * Attempt expert synthesis from the Reasoning Strategy Layer.
   * `classification` — result of classifyReasoningStrategy (or legacy task string).
   */
  _tryPortfolioIntelligence(plan, ctx, move, classification = null) {
    const q = String(ctx?.questionFrame?.rawQuery || '').trim();
    if (!q) return null;

    const classified = (classification && typeof classification === 'object')
      ? classification
      : (classification
        ? { strategy: 'Recommend', task: classification }
        : classifyReasoningStrategy(q, ctx));

    const intent = classified?.task;
    if (!intent || intent === 'compare_passthrough') return null;

    // Leave structured tech tables alone unless the ask is a "why X" rationale.
    if (move === 'Compare' && !/^why_/.test(intent)) return null;

    const blocks = plan?.blocks || [];
    const hasGap = blocks.some((b) => b.type === 'GapDisclosure');
    const direct = blocks.find((b) => b.type === 'DirectAnswer');
    if ((hasGap || direct?.data?.polarity === 'negative') && !mayOverrideDecline(intent)) {
      return null;
    }

    const text = synthesizeReasoning(classified, q, ctx);
    if (!text) return null;

    let spoken = text;
    const inviteMove = move === 'Recommend' ? 'Recommend' : 'Answer';
    const invite = this._inviteFor(plan, ctx, inviteMove);
    if (invite && !this._alreadyEndsWithInvite([spoken])) {
      spoken = `${spoken}\n\n${invite}`;
    }

    return {
      text: spoken,
      intent,
      replaceKind: true,
      sources: [],
      reasoning: { strategy: classified.strategy, task: intent, focus: classified.focus || null },
    };
  },

  _capabilityVoice() {
    return synthesizeReasoning({ strategy: 'Summarize', task: 'capabilities' }, '', {})
      || DIGITAL_BRAIN.nature;
  },

  _identityVoice(profile) {
    return synthesizeReasoning({ strategy: 'Summarize', task: 'identity' }, '', { questionFrame: { questionType: 'Identity' } })
      || `I'm ${DIGITAL_BRAIN.brand} — the digital engineering brain of ${profile?.name || 'Sudhanshu Sinha'}.`;
  },

  /**
   * Per-block dispatcher. Unrecognized block types, and renderer functions
   * that throw, both degrade to the documented failure mode (§8, Stage 8
   * table): fall back to `block.data.text` as plain text if present,
   * otherwise drop the block silently. Never throws out to the caller.
   */
  _renderBlock(block, ctx) {
    const renderers = {
      DirectAnswer: this._renderDirectAnswer,
      Evidence: this._renderEvidence,
      Comparison: this._renderComparisonBlock,
      Strengths: this._renderStrengths,
      GapDisclosure: this._renderGapDisclosure,
      Recommendation: this._renderRecommendation,
      HonestDecline: this._renderHonestDecline,
      SelfModel: this._renderSelfModel,
      RecruiterFraming: this._renderRecruiterFraming,
      FollowupHint: this._renderFollowupHint,
    };
    const renderer = renderers[block?.type];
    const safeFallback = () => (block?.data?.text ? { fragment: String(block.data.text), sourcesForBlock: [] } : null);
    if (!renderer) {
      console.warn(`[providers.js] Response Composition: unrecognized block type "${block?.type}" — falling back to data.text.`);
      return safeFallback();
    }
    try {
      return renderer.call(this, block, ctx) || null;
    } catch (err) {
      console.warn(`[providers.js] Response Composition: renderer for "${block.type}" threw — falling back to data.text.`, err);
      return safeFallback();
    }
  },

  /** §7.1 — planner-composed text, with two presentation-only touches from
   *  the rendering-polish pass, neither of which changes WHICH sentence is
   *  shown for any non-greeting case:
   *   1. A `negative`-polarity answer never opens with "Yes" (defensive;
   *      `planning.js` never actually produces this combination today).
   *   2. Greeting phrase rotation is restored: `planning.js` (frozen)
   *      intentionally composes one static greeting sentence — a greeting
   *      carries no factual claim to preserve, so Stage 8 may still pick
   *      WHICH of the exact same two already-authored greeting phrasings
   *      `_greetingResponse` has always used to display, via the
   *      unchanged `_pickVariant` helper. `questionType` is read from
   *      `ctx`, never re-derived — the planner already decided this is a
   *      `Greeting`; Composition only decides which hello to print.
   *   3. A short lead-in that already ends in `:` (e.g. "Based on what is
   *      documented:") is bolded — a colon at the end of a DirectAnswer is
   *      structurally always introducing the block(s) that follow, so
   *      bolding it is pure visual hierarchy, not new text.
   */
  _renderDirectAnswer(block, ctx) {
    let text = block.data?.text || '';
    if (block.data?.polarity === 'negative') text = text.replace(/^yes\b[,:]?\s*/i, '');

    if (ctx?.questionFrame?.questionType === 'Greeting') {
      text = this._professionalWelcome(ctx, getProfile());
    } else if (text === SELF_MODEL.nature || text === DIGITAL_BRAIN.nature) {
      text = this._identityVoice(getProfile());
    } else if (text === SELF_MODEL.connectivity || text === DIGITAL_BRAIN.connectivity) {
      text = DIGITAL_BRAIN.connectivity;
    } else {
      const trimmed = text.trim();
      if (trimmed.length <= 60 && /:$/.test(trimmed)) text = `**${trimmed}**`;
    }

    return { fragment: text, sourcesForBlock: [] };
  },

  /** §7.2 — `'bulleted'` facts render as a markdown list; `'inline'` facts
   *  fold into the previous paragraph. Sources come from each fact's own
   *  `docId` (looked up via `knowledge.js`'s unchanged `getDoc()`), never
   *  from a hand-maintained list.
   *
   *  Presentation-only richness upgrade (rendering-polish pass): when
   *  EVERY fact in this block traces back to docs about the SAME shipped
   *  project — a signal already sitting in the plan's own `fact.docId`
   *  values, produced by Stage 5/7 (frozen), never re-derived here — the
   *  flat bullet list is replaced by the same interactive project-card
   *  markdown `_projectResponse` has always rendered, via
   *  `_resolveSingleProjectFromFacts`. This never fires when a block's
   *  facts span more than one project (e.g. the generic EvidenceRequest
   *  fallback's "two different projects'" engineering-decision facts) —
   *  Composition has no basis to pick one of several equally-cited
   *  projects to feature, and picking one would be inventing a planning
   *  decision, not rendering one. No fact, source, or block-order change
   *  results either way — same `sourcesForBlock`, same fragment count. */
  _renderEvidence(block, ctx) {
    const facts = block.data?.facts || [];
    if (!facts.length) return null;

    const proj = this._resolveSingleProjectFromFacts(facts);
    if (proj) {
      const kinds = facts.map((f) => (f.docId ? getDoc(f.docId)?.kind : null)).filter(Boolean);
      const mode = (kinds.includes('project-arch') && !kinds.includes('project')) ? 'architecture'
        : (kinds.includes('project-stack') && !kinds.includes('project')) ? 'stack' : 'full';
      const fragment = this._projectCardMarkdown(proj, mode, ctx?.visitorProfile, ctx?.memory);
      const sourcesForBlock = facts.filter((f) => f.docId).map((f) => this._factToSource(f)).filter(Boolean);
      return { fragment, sourcesForBlock, kindOverride: 'project-card', payloadOverride: { project: proj } };
    }

    const style = block.data?.style || 'bulleted';
    const fragment = style === 'inline'
      ? facts.map((f) => f.text).join(' — ')
      : facts.map((f) => `- ${this._boldLeadLabel(f.text)}`).join('\n');
    const sourcesForBlock = facts
      .filter((f) => f.docId)
      .map((f) => this._factToSource(f))
      .filter(Boolean);
    return { fragment, sourcesForBlock, inline: style === 'inline' };
  },

  /** Every fact resolves (via its own `docId`) to a doc about the same
   *  shipped project, and only project-kind docs (`project`,
   *  `project-arch`, `project-stack`) — never a mix with a non-project
   *  doc like the generic `stack`/`arch-overview` docs. Returns `null`
   *  (no rich card) the moment either condition fails, so a skill/stack/
   *  architecture question that merely CITES a project alongside a
   *  general doc is left exactly as a plain bulleted list. */
  _resolveSingleProjectFromFacts(facts) {
    const PROJECT_KINDS = new Set(['project', 'project-arch', 'project-stack']);
    const projectIds = new Set();
    for (const f of facts) {
      const doc = f.docId ? getDoc(f.docId) : null;
      if (!doc || !PROJECT_KINDS.has(doc.kind)) return null;
      if (doc.projectId) projectIds.add(doc.projectId);
    }
    if (projectIds.size !== 1) return null;
    const [id] = projectIds;
    return getAllProjects().find((p) => p.id === id) || null;
  },

  /** Maps an `EvidenceFact` to the `{source, link}` shape `renderer.js`'s
   *  `renderCitations()` expects, via `knowledge.js`'s `getDoc()` — the
   *  same unchanged lookup every pre-migration `_xResponse` method used. */
  _factToSource(fact) {
    const doc = fact.docId ? getDoc(fact.docId) : null;
    if (doc) return { source: doc.source, link: doc.link || null };
    if (fact.link) return { source: fact.text.slice(0, 60), link: fact.link };
    return null;
  },

  /** Formatting-only: bolds a fact's existing "Label: " lead-in (a colon-
   *  delimited prefix already present in the source text — e.g.
   *  "Technologies: Python, ..." → "**Technologies:** Python, ...") so a
   *  bulleted evidence list reads with visual hierarchy instead of as
   *  flat, undifferentiated prose. Never adds a word: if no short,
   *  sentence-internal colon-label exists at the very start of the text,
   *  the text is returned completely unchanged. */
  _boldLeadLabel(text) {
    const m = /^([^.!?:]{3,60}):\s*/.exec(String(text || ''));
    if (!m) return text;
    const rest = text.slice(m[0].length);
    return `**${m[1]}:**${rest ? ' ' + rest : ''}`;
  },

  /** §7.3 — tech branch only (the only branch `planning.js` emits today;
   *  the project-card branch described in the spec is unreachable until a
   *  future phase closes `planning.js`'s own documented Comparison gap —
   *  see `docs/PHASE_5_VALIDATION.md`). Renders `{entities, dimensions,
   *  verdict}` as the same compact table `_techComparisonResponse` used to
   *  produce; sources are the real shipped-project evidence for the pair,
   *  looked up the same way `_techEvidenceSources` always has. */
  _renderComparisonBlock(block) {
    const { entities = [], dimensions = [], verdict } = block.data || {};
    if (entities.length !== 2 || !dimensions.length) {
      return { fragment: verdict || '', sourcesForBlock: [] };
    }
    const [a, b] = entities;
    const stripPrefix = (v, name) => (typeof v === 'string' ? v.replace(new RegExp(`^${name}:\\s*`), '') : v);
    const rows = dimensions.map((d) => `| ${d.label} | ${stripPrefix(d.values[0], a)} | ${stripPrefix(d.values[1], b)} |`).join('\n');

    const entry = TECH_TAKES.find((t) => t.techs.length === entities.length && t.techs.every((x) => entities.includes(x)));
    // Presentation-only restoration: `_techComparisonResponse` always
    // showed which real shipped project each technology actually shows up
    // in, directly underneath the "My take" line, not just as citation
    // chips. Same unchanged `_renderTechEvidence` helper, same evidence —
    // only the table/verdict/evidence-line assembly is Stage 8's.
    const evidenceLines = entry ? this._renderTechEvidence(entry) : '';
    const fragment = [
      `| Dimension | ${a} | ${b} |`,
      `|---|---|---|`,
      rows,
      verdict ? `\n**My take:** ${verdict}` : '',
      evidenceLines ? `\n**Where this shows up:**\n${evidenceLines}` : '',
    ].filter(Boolean).join('\n');

    const sourcesForBlock = entry ? this._techEvidenceSources(entry) : [];
    return { fragment, sourcesForBlock };
  },

  /** §7.4 — bulleted strengths. Not emitted by `planning.js` in this phase
   *  (no authored `Strengths`-eligible content is wired into the Stage 7
   *  input whitelist yet — see `docs/PHASE_5_VALIDATION.md`'s deferred-
   *  block-types note); implemented for dispatcher completeness per the
   *  §4.7 module contract, so a future planning.js extension needs no
   *  provider-side change to render correctly. */
  _renderStrengths(block) {
    const items = block.data?.items || [];
    if (!items.length) return null;
    const lead = block.data?.lead || 'Strongest areas:';
    const fragment = [lead, items.map((i) => `- ${i}`).join('\n')].join('\n');
    return { fragment, sourcesForBlock: [] };
  },

  /** §7.5 — gap notes render as prose (not bullets — a gap is a single
   *  honest statement, not a list), with the reframe suggestion folded
   *  into the same sentence. No `sources`: per the spec's own Stage 8
   *  example, "no doc backs a negative claim." */
  _renderGapDisclosure(block) {
    const items = block.data?.items || [];
    if (!items.length) return null;
    const body = items.length > 1 ? items.join(' ') : items[0];
    const reframe = block.data?.reframe;
    const fragment = reframe ? `${body} ${reframe}` : body;
    return { fragment, sourcesForBlock: [] };
  },

  /** §7.6 — not emitted by `planning.js` in this phase (its plan-building
   *  half depends on `ctx` fields — visitor profile / focus area — outside
   *  Stage 7's permitted input whitelist; documented in
   *  `docs/PHASE_5_VALIDATION.md`). Implemented for dispatcher completeness
   *  only; when `targetType === 'project'`, sets `kind`/`payload` exactly
   *  as `_projectResponse` did for a recommendation-shaped answer. */
  _renderRecommendation(block) {
    const { text, targetType, targetId } = block.data || {};
    if (!text) return null;
    if (targetType === 'project' && targetId) {
      const proj = getAllProjects().find((p) => p.id === targetId);
      if (proj) return { fragment: text, sourcesForBlock: [], kindOverride: 'project-card', payloadOverride: { project: proj } };
    }
    return { fragment: text, sourcesForBlock: [] };
  },

  /** §7.7 — reason-coded honest decline. Prose relocated from `_fallback`'s
   *  concept (never guesses, never invents), specialized per reason code
   *  the way `planning.js`'s `honestDeclineBlock()` already tags its
   *  output (`'no-data'`, `'ambiguous-subject'`, `'out-of-scope'`).
   *
   *  Rendering-polish pass: the `'no-data'` lead now uses the exact
   *  "isn't documented in the portfolio" phrasing, and — only when the
   *  plan supplied no `redirect` of its own — is followed by the same
   *  warm, portfolio-branded suggestion list `_fallback()` has always
   *  used for an unmatched query. This is the SAME authored suggestion
   *  text `_fallback()` already contains (not new content); it restores
   *  the old fallback's helpfulness for exactly the cases that used to
   *  route through `_fallback()` before Stage 7 started emitting an
   *  explicit `HonestDecline(reason: 'no-data')` for them instead. */
  _renderHonestDecline(block) {
    const redirect = block.data?.redirect;
    const REASON_TEXT = {
      'no-data': "I don't have that in Sudhanshu's portfolio.",
      // Shorter when a redirect follows (planning.js's own
      // `honestDeclineBlock('ambiguous-subject', redirect)` always supplies
      // one) — the full "who or what you mean" phrasing already appears in
      // the redirect itself, per `buildResponsePlan()`'s current callers;
      // repeating it in the lead would read as asking the same question
      // twice in one breath.
      'ambiguous-subject': redirect ? "I'm not sure who you mean." : "I'm not sure who or what you mean by that.",
      'out-of-scope': "That's outside what I can speak to from his work here.",
    };
    const reason = block.data?.reason;
    const explicitText = block.data?.text;
    const lead = explicitText || REASON_TEXT[reason] || REASON_TEXT['no-data'];
    const defaultRedirect = (!redirect && reason === 'no-data')
      ? `Ask me about his projects, architecture, stack, why hire him, or say "open a project demo".`
      : null;
    const fragment = redirect ? `${lead} ${redirect}` : (defaultRedirect ? `${lead} ${defaultRedirect}` : lead);
    return { fragment, sourcesForBlock: [] };
  },

  /** §7.8 — self-referential fact. Sprint 1.5 rewrites implementation voice
   *  into capability-first speech when the authored SELF_MODEL string still
   *  uses retrieval/doc framing (planning remains frozen). */
  _renderSelfModel(block, ctx) {
    const text = block.data?.text;
    if (!text) return null;
    const aspect = block.data?.aspect;
    let spoken = text;
    if (aspect === 'nature' || text === SELF_MODEL.nature || text === DIGITAL_BRAIN.nature) {
      spoken = this._identityVoice(getProfile());
    } else if (aspect === 'connectivity' || text === SELF_MODEL.connectivity || text === DIGITAL_BRAIN.connectivity) {
      spoken = DIGITAL_BRAIN.connectivity;
    } else if (aspect === 'memory' || text === SELF_MODEL.memory || text === DIGITAL_BRAIN.memory) {
      spoken = DIGITAL_BRAIN.memory;
    }
    return { fragment: spoken, sourcesForBlock: [] };
  },

  /** §7.9 — not emitted by `planning.js` in this phase (its plan-building
   *  half needs `visitorProfile`/`memory`, outside Stage 7's whitelist —
   *  documented in `docs/PHASE_5_VALIDATION.md`). Implemented for
   *  dispatcher completeness, reusing today's unchanged
   *  `_recruiterRelevance`/`_recruiterFocusText` template logic exactly as
   *  §8.3's disposition table specifies. */
  _renderRecruiterFraming(block, ctx) {
    const { targetProjectId, focusArea } = block.data || {};
    const proj = targetProjectId ? getAllProjects().find((p) => p.id === targetProjectId) : null;
    if (proj) {
      const relevance = this._recruiterRelevance(proj, ctx?.visitorProfile, ctx?.memory);
      return { fragment: `This demonstrates **${relevance}**.`, sourcesForBlock: [] };
    }
    if (focusArea) {
      return { fragment: this._recruiterFocusText(focusArea, getAllProjects()), sourcesForBlock: [] };
    }
    return block.data?.text ? { fragment: block.data.text, sourcesForBlock: [] } : null;
  },

  /** §7.10 — not a text renderer. Per the spec's exact render-behavior
   *  note, this dispatcher entry is a no-op that only forwards `data` onto
   *  `plan`'s eventual `payload._followupHint`, for a future
   *  `buildFollowups()` integration to read (that integration is not part
   *  of Stage 8 and is not wired up in this phase — see the Phase 6
   *  validation report). Never contributes markdown text. */
  _renderFollowupHint(block) {
    return { fragment: null, sourcesForBlock: [], followupHint: block.data || null };
  },

  /** De-dupes `sources` by their citation identity (`source` + `link`),
   *  preserving first-seen order, capped at 4 — matching `renderer.js`'s
   *  own `renderCitations()` cap so this never silently disagrees with
   *  what's actually shown. */
  _dedupeSources(list) {
    const seen = new Set();
    const out = [];
    for (const s of list) {
      if (!s) continue;
      const key = `${s.source || ''}|${s.link || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= 4) break;
    }
    return out;
  },
};

/* ============================================================
   REMOTE PROVIDERS — all receive same grounded context
   ============================================================ */
const OpenAIProvider = {
  name: 'openai',
  async generate(query, ctx) {
    const cfg = getConfig();
    const { system, user, sources } = buildGroundedPrompt(query, ctx);
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.35,
        max_tokens: 800,
      }),
    });
    const data = await r.json();
    return { text: data.choices?.[0]?.message?.content || 'No response.', sources, kind: 'text', payload: null };
  },
};

const OpenRouterProvider = {
  name: 'openrouter',
  async generate(query, ctx) {
    const cfg = getConfig();
    const { system, user, sources } = buildGroundedPrompt(query, ctx);
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model || 'anthropic/claude-3.5-sonnet',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        temperature: 0.35,
        max_tokens: 800,
      }),
    });
    const data = await r.json();
    return { text: data.choices?.[0]?.message?.content || 'No response.', sources, kind: 'text', payload: null };
  },
};

const ClaudeProvider = {
  name: 'claude',
  async generate(query, ctx) {
    const cfg = getConfig();
    const { system, user, sources } = buildGroundedPrompt(query, ctx);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: cfg.model || 'claude-3-5-sonnet-20241022',
        system, max_tokens: 800,
        messages: [{ role: 'user', content: user }],
      }),
    });
    const data = await r.json();
    return { text: data.content?.[0]?.text || 'No response.', sources, kind: 'text', payload: null };
  },
};

const GeminiProvider = {
  name: 'gemini',
  async generate(query, ctx) {
    const cfg = getConfig();
    const { system, user, sources } = buildGroundedPrompt(query, ctx);
    const model = cfg.model || 'gemini-1.5-flash';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cfg.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 800 },
      }),
    });
    const data = await r.json();
    return { text: data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.', sources, kind: 'text', payload: null };
  },
};

const OllamaProvider = {
  name: 'ollama',
  async generate(query, ctx) {
    const cfg = getConfig();
    const { system, user, sources } = buildGroundedPrompt(query, ctx);
    const endpoint = cfg.endpoint || 'http://localhost:11434';
    const r = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: cfg.model || 'llama3.1',
        stream: false,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        options: { temperature: 0.35 },
      }),
    });
    const data = await r.json();
    return { text: data.message?.content || 'No response.', sources, kind: 'text', payload: null };
  },
};

/* ============================================================
   REGISTRY + SELECTOR
   ============================================================ */
const REGISTRY = {
  local: LocalProvider,
  openai: OpenAIProvider,
  openrouter: OpenRouterProvider,
  claude: ClaudeProvider,
  gemini: GeminiProvider,
  ollama: OllamaProvider,
};

let _active = null;
export function getProvider() {
  if (_active) return _active;
  const cfg = getConfig();
  _active = REGISTRY[cfg.provider] || LocalProvider;
  return _active;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
