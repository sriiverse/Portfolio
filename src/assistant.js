/**
 * assistant.js — SRIIVERSE AI 2.0 Orchestrator.
 *
 * Evolved from v2 with a full pipeline. A mode gate runs before step 1:
 * while an interview session is active (assistant/interview.js), every
 * turn is routed straight to it and the pipeline is skipped entirely for
 * that turn.
 *
 *  1. INTENT              — classify visitor query
 *  2. AWARENESS           — inject live website state (section, project, engagement)
 *  3. CONTEXT             — resolve pronouns + conversational focus
 *  4. PROFILE             — update + use visitor profile (recruiter/engineer/founder)
 *  5. QUESTION UNDERSTANDING — build the QuestionFrame (assistant/conversation.js)
 *                       BEFORE retrieval runs — questionType/subject/polarity
 *                       replaces the old greeting/identity/comparison/opinion/
 *                       experience/explanation-scope move classification
 *  5b. ENTITY RESOLUTION  — resolve named tech/project entities + ownership
 *                       (assistant/entities.js — docs/REASONING_ENGINE_SPEC.md
 *                       Stage 3, orchestrated live as of Phase 3)
 *  6. EVIDENCE SELECTION  — question-type-scoped knowledge retrieval,
 *                       gap-aware (assistant/knowledge.js's buildEvidenceSet() —
 *                       Stage 5, additive)
 *  6b. CONFIDENCE         — pure assessment of how sure Stage 5/3's outputs are
 *                       (assistant/entities.js's assessConfidence() — Stage 6,
 *                       additive; orchestrated live as of Phase 4)
 *  6c. RESPONSE PLANNING  — decide which ResponseBlocks answer this turn, as
 *                       data (assistant/planning.js's buildResponsePlan() —
 *                       Stage 7; plan is threaded onto ctx.plan)
 *  6d. RESPONSE COMPOSITION — LocalProvider renders ctx.plan into markdown
 *                       (providers.js Stage 8; falls back to legacy routing
 *                       when no plan is present)
 *  7. MEMORY              — inject conversation history
 *  8. PROACTIVE TOOL      — decide background website action (not just on commands)
 *  9. PROVIDER            — generate response (local or configured LLM)
 * 10. TOOL EXECUTION      — run explicit tool if user commanded one
 * 11. RICH RESPONSE       — stream + render structured response with cards
 * 12. WORKSPACE           — update panel expand state if needed
 * 13. FOLLOW-UPS          — contextual suggestions based on visitor profile + strategy
 *
 * Same UI, same animations, same IDs. Zero breaking changes.
 */

import { ASSISTANT_KB, ASSISTANT_CHIPS } from './content.js';
import * as knowledge from './assistant/knowledge.js';
import memory from './assistant/memory.js';
import awareness from './assistant/awareness.js';
import { createStream } from './assistant/streaming.js';
import { decideTool, runTool, runProactiveTool, setKnowledgeRef } from './assistant/tools.js';
import { getProvider } from './assistant/providers.js';
import { looksLikeJobDescription } from './assistant/jdmatch.js';
import { interview } from './assistant/interview.js';
import { buildQuestionFrame, isBoundFollowUpQuery } from './assistant/conversation.js';
import { resolveEntities, assessConfidence } from './assistant/entities.js';
import { buildResponsePlan } from './assistant/planning.js';
import {
  renderMarkdown, renderCitations, renderProjectCard, renderTabbedProjectCard,
  renderFollowups, renderCommandBar, renderVisitorProfile, renderComparisonCard,
  renderThinkingSteps, updateThinkingStep,
} from './assistant/renderer.js';


const d = document;
setKnowledgeRef(knowledge);

/* ============================================================
   WORKSPACE STATE MANAGER
   Handles compact → expanded → focus mode transitions.
   ============================================================ */
const Workspace = {
  state: 'compact',   // 'compact' | 'expanded' | 'focus'
  panel: null,
  overlay: null,
  expandBtn: null,
  focusBtn: null,

  init(panel) {
    this.panel = panel;
    this.overlay = d.getElementById('assistantOverlay');
    this.expandBtn = d.getElementById('assistantExpand');
    this.focusBtn = d.getElementById('assistantFocus');

    this.expandBtn?.addEventListener('click', () => this.toggleExpand());
    this.focusBtn?.addEventListener('click', () => this.toggleFocus());
    this.overlay?.addEventListener('click', () => this.exitFocus());

    d.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state === 'focus') this.exitFocus();
    });
  },

  /** Called after every exchange — show expand button after 2 turns. */
  onExchange(turnCount) {
    if (turnCount >= 2 && this.expandBtn) {
      this.expandBtn.classList.add('is-visible');
    }
  },

  toggleExpand() {
    if (this.state === 'compact') this.expand();
    else this.collapse();
  },

  expand() {
    this.state = 'expanded';
    this.panel?.classList.add('is-expanded');
    this.panel?.classList.remove('is-focused');
    this.expandBtn && (this.expandBtn.title = 'Collapse');
    this.overlay?.classList.remove('is-active');
  },

  collapse() {
    this.state = 'compact';
    this.panel?.classList.remove('is-expanded', 'is-focused');
    this.expandBtn && (this.expandBtn.title = 'Expand workspace');
    this.overlay?.classList.remove('is-active');
  },

  toggleFocus() {
    if (this.state === 'focus') this.exitFocus();
    else this.enterFocus();
  },

  enterFocus() {
    this.state = 'focus';
    this.panel?.classList.add('is-expanded', 'is-focused');
    this.overlay?.classList.add('is-active');
    this.focusBtn && (this.focusBtn.textContent = '⊠ Exit Focus');
  },

  exitFocus() {
    this.state = this.panel?.classList.contains('is-expanded') ? 'expanded' : 'compact';
    this.panel?.classList.remove('is-focused');
    this.overlay?.classList.remove('is-active');
    this.focusBtn && (this.focusBtn.textContent = '⊞ Focus');
  },
};

/* ============================================================
   INTENT CLASSIFICATION
   Reasoning-engine migration (docs/REASONING_ENGINE_SPEC.md Section 8.2,
   Phase 2 / Phase C, step 6): narrowed to COMMAND detection only. The 7
   semantic branches this function used to also classify (recruiter/
   architecture/stack/comparison/resume/profile/project, plus the generic
   'question' fallback) are deleted, not left dead — their regex patterns
   are relocated verbatim into assistant/conversation.js's buildQuestionFrame()
   priority chain, which now owns all semantic (non-command) classification
   as `questionType`. Returns one of 8 command labels, or `null` for every
   ordinary question (in place of the old 'question'/'profile'/'project'/etc.
   fallback values).
   ============================================================ */
function classifyIntent(query) {
  const q = query.toLowerCase().trim();
  // Checked first: a pasted job description or an interview-start command
  // is long/keyword-dense enough to otherwise false-positive-match several
  // of the checks below (e.g. a JD almost always contains "skills").
  if (looksLikeJobDescription(query)) return 'jd-match';
  if (/\binterview\b/.test(q) && /\b(start|begin|practice|mock|take|do|want|ready)\b/.test(q)) return 'interview';
  if (/demo|launch|try it|open.*project|visit/.test(q)) return 'action-demo';
  if (/github|repo|repository|source code/.test(q)) return 'action-github';
  if (/contact|email|reach|get in touch/.test(q)) return 'action-contact';
  if (/navigate|scroll|go to|show me|take me|jump to/.test(q)) return 'action-nav';
  if (/highlight|focus on/.test(q)) return 'action-highlight';
  if (/download.*resume|resume.*pdf/.test(q)) return 'action-resume';
  return null;
}

// tools.js's runProactiveTool() switches on the legacy semantic-intent
// strings classifyIntent() used to return for these 4 categories. Rather
// than touch that switch, translate the new questionType back to its old
// label at this one call site (see "8. PROACTIVE TOOL" below).
const PROACTIVE_INTENT_FROM_QUESTION_TYPE = {
  ArchitectureExplanation: 'architecture',
  TechnologyExplanation: 'stack',
  Recruiter: 'recruiter',
  Identity: 'profile',
};

/* ============================================================
   CONTEXT RESOLUTION
   ============================================================ */
function resolveContext(query, intent) {
  let focusProject = memory.lastProject;

  // A pasted job description is long free-form prose, not a conversational
  // reference — skip pronoun/project resolution so the raw JD text reaches
  // jdmatch.js unmodified.
  if (intent === 'jd-match') return { focusProject, query };

  // Explicit project reference in query
  const explicit = knowledge.getAllProjects().find((p) => {
    const q = query.toLowerCase();
    return q.includes(p.id) || q.includes(p.name.toLowerCase());
  });
  if (explicit) focusProject = explicit.id;

  // Awareness context: if visitor is looking at a project and uses pronouns
  if (!explicit && awareness.currentProject) {
    const q = query.toLowerCase();
    const needsRef = /\b(it|that|this|its|second|third|first|one|both|other|next)\b/i.test(q);
    if (needsRef) focusProject = focusProject || awareness.currentProject;
  }

  // Pronoun / follow-up resolution: rewrite query with project name for retrieval
  const needsRef = /\b(it|that|this|its|second|third|first|one|both|other|next)\b/i.test(query)
    || isBoundFollowUpQuery(query);
  let enrichedQuery = query;
  if (needsRef && focusProject) {
    const proj = knowledge.getProject(focusProject);
    if (proj && !explicit) enrichedQuery = `${query} ${proj.name}`;
  }

  return { focusProject, query: enrichedQuery };
}

/* ============================================================
   AWARENESS CONTEXT STRING
   ============================================================ */
function buildAwarenessContext() {
  return awareness.getContextString();
}

/* ============================================================
   PROFILE-AWARE FOLLOW-UPS
   ============================================================ */
function buildFollowups(intent, payload, focusProject, questionFrame) {
  const f = [];
  const proj = payload?.project
    ? payload.project
    : (focusProject ? knowledge.getProject(focusProject) : null);
  const profile = memory.profile;
  // Sprint 3 — are we still on the same topic as last turn? Used below to
  // nudge toward a different angle instead of a near-duplicate suggestion.
  // `intent` alone is no longer a reliable topic key post-narrowing (it's
  // `null` for every ordinary question now) — fall back to `questionType`
  // so two different ordinary questions in a row aren't both `null` and
  // therefore mistaken for "the same topic".
  const topicKey = intent || questionFrame?.questionType || null;
  const continuingSameTopic = memory.activeTopic === topicKey;

  // Conversation Intelligence upgrade — moves the intent-based switch below
  // has no concept of get their own, more relevant suggestions first. Only
  // intercepts the moves that don't already have a good intent-based case
  // (e.g. project-scoped 'comparison' still falls through to the switch).
  if (questionFrame?.move === 'greeting') {
    f.push('Who are you?', 'Show me his projects', 'Why hire him?');
  } else if (questionFrame?.move === 'identity') {
    f.push('Show me his projects', 'Why hire him?', 'Explain the architecture');
  } else if (questionFrame?.move === 'opinion' || (questionFrame?.move === 'comparison' && questionFrame.scope === 'tech')) {
    f.push('What technologies does he know?', 'Compare his projects');
  } else if (questionFrame?.move === 'experience') {
    f.push('Paste a job description to match', 'Show me his projects');
  }

  // Recruiter-specific follow-ups
  if (f.length) {
    // questionFrame-aware suggestions above already decided this turn's followups
  } else if (profile.type === 'recruiter') {
    f.push('Why hire Sudhanshu for my team?');
    if (proj) f.push(`Open the ${proj.name} live demo`);
    else f.push('Show me the most impressive project');
    f.push('Open contact section');
  } else if (profile.type === 'engineer') {
    // Engineer follow-ups
    if (proj) {
      f.push(`Architecture of ${proj.name}?`);
      f.push(`Tech stack decisions for ${proj.name}?`);
    }
    f.push('Explain the five-layer architecture');
  } else if (profile.type === 'founder') {
    f.push('Would he fit a startup?');
    if (proj) f.push(`Open the ${proj.name} live demo`);
    else f.push('Which project shows end-to-end ownership?');
    f.push('Why hire Sudhanshu?');
  } else if (profile.type === 'student') {
    f.push('Explain the architecture simply');
    f.push('What should he learn next?');
    if (proj) f.push(`How was ${proj.name} built?`);
    else f.push('Show me his projects');
  } else {
    // Reasoning-engine migration (docs/REASONING_ENGINE_SPEC.md Section 3.1,
    // "Read by" list): classifyIntent() no longer returns a semantic label
    // for these cases (narrowed to commands only — see classifyIntent()'s
    // header comment), so this switch now routes on
    // `questionFrame.questionType` in place of the old semantic `intent`
    // values. `intent` is still checked first so the still-valid 'jd-match'
    // command routes exactly as before.
    switch (intent || questionFrame?.questionType) {
      case 'ProjectExplanation':
        if (proj) {
          f.push(`Architecture of ${proj.name}?`);
          f.push(`Tech stack for ${proj.name}?`);
          f.push('Open the live demo');
        }
        break;
      case 'ArchitectureExplanation':
        f.push('What technologies does he know?');
        f.push('Show me the backend projects');
        break;
      case 'TechnologyExplanation':
        f.push('Show me the backend projects');
        f.push('Explain the architecture');
        break;
      case 'Recruiter':
        f.push('Show me the projects');
        f.push('Open contact section');
        break;
      case 'Identity':
        f.push('Show me his projects');
        f.push('Why hire him?');
        break;
      case 'Comparison':
        f.push('Open a live demo');
        f.push('Explain the architecture differences');
        break;
      case 'Experience':
        f.push('Paste a job description to match');
        f.push('Show me his projects');
        break;
      case 'jd-match':
        f.push('Show me the most relevant project');
        f.push('Practice a Python interview');
        break;
      default:
        break;
    }
  }

  // Still talking about the same thing as last turn — offer a different angle.
  if (continuingSameTopic && proj) f.push(`Compare ${proj.name} with another project`);

  if (f.length < 2) f.push('Explain QueryForgeAI', 'Why hire him?');

  memory.setActiveTopic(topicKey);
  return dedupeFollowups(f);
}

/**
 * Prefers suggestions not already shown this session (Sprint 3 — Priority 5:
 * "avoid repeating previous responses"). Degrades gracefully: if fewer than
 * two fresh options remain, falls back to the full candidate list rather
 * than returning an empty/too-short set.
 */
function dedupeFollowups(candidates) {
  const unique = [...new Set(candidates)];
  const unused = unique.filter((text) => !memory.hasUsedPhrase(`followup:${text}`));
  const pool = unused.length >= 2 ? unused : unique;
  const final = pool.slice(0, 3);
  final.forEach((text) => memory.markPhraseUsed(`followup:${text}`));
  return final;
}

/* ============================================================
   INTERVIEW MODE — event → response text
   interview.js returns structured data only (no markdown, no UI); this is
   the orchestrator-side formatting step, mirroring how providers.js turns
   jdmatch.js's structured output into response text.
   ============================================================ */
const INTERVIEW_TOPIC_LABELS = { python: 'Python', sql: 'SQL', react: 'React', backend: 'Backend', 'ai-ml': 'AI/ML' };

function formatInterviewEvent(event) {
  switch (event.event) {
    case 'awaiting-topic': {
      const list = event.topics.map((t) => `**${INTERVIEW_TOPIC_LABELS[t]}**`).join(', ');
      return `## 🎯 Interview Mode\n\nWhich topic would you like to practice — ${list}? (Say "stop" anytime to end the session.)`;
    }
    case 'question': {
      const label = INTERVIEW_TOPIC_LABELS[event.topic];
      return `## 🎯 ${label} Interview — Question ${event.questionIndex + 1} of ${event.total}\n\n**${event.question.q}**\n\n*Answer in the chat, or say "stop" to end the session.*`;
    }
    case 'feedback': {
      const label = INTERVIEW_TOPIC_LABELS[event.topic];
      const feedbackLine = event.coverage >= 0.6
        ? `**Solid answer** — you covered: ${event.matchedKeywords.join(', ') || 'the core idea'}.`
        : event.coverage > 0
          ? `**Partial answer** — you touched on ${event.matchedKeywords.join(', ')}, but a stronger answer would also mention: ${event.missingKeywords.join(', ')}.`
          : `That's okay — this is just practice. A stronger answer would mention: ${event.missingKeywords.join(', ')}.`;
      return `${feedbackLine}\n\n## 🎯 ${label} Interview — Question ${event.questionIndex + 1} of ${event.total}\n\n**${event.question.q}**`;
    }
    case 'summary': {
      const label = INTERVIEW_TOPIC_LABELS[event.topic];
      const pct = Math.round(event.averageCoverage * 100);
      return `## 🏁 Interview Complete — ${label}\n\nYou answered all ${event.totalQuestions} questions. Average keyword coverage: **${pct}%**.\n\nWant to try another topic, or go back to exploring the projects?`;
    }
    case 'exited': {
      const p = event.progress;
      if (!p || !p.topic) return `Interview session ended.`;
      return `Interview session ended — you answered ${p.questionIndex} of ${p.total} ${INTERVIEW_TOPIC_LABELS[p.topic]} questions. Ask me anything else, or start a new one anytime.`;
    }
    default:
      return "Let's continue — what would you like to do next?";
  }
}

/* ============================================================
   BUILD COMMAND BAR ACTIONS for a project
   ============================================================ */
function buildProjectActions(proj) {
  if (!proj) return null;
  const actions = [
    { icon: '🚀', label: 'Open Demo', action: `demo:${proj.live}` },
  ];
  if (proj.repo) actions.push({ icon: '⌥', label: 'GitHub', action: `github:${proj.repo}` });
  actions.push({ icon: '🏗️', label: `Architecture of ${proj.name}`, action: `ask:Architecture of ${proj.name}` });
  return actions;
}

/* ============================================================
   THINKING STATE
   ============================================================ */
function startThinkingSteps(body) {
  const thinkId = `think-${Date.now()}`;
  const el = d.createElement('div');
  el.id = thinkId;
  el.innerHTML = renderThinkingSteps();
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;

  return {
    update: (step) => updateThinkingStep(thinkId, step),
    done: () => { el.remove(); },
  };
}

/* ============================================================
   INIT
   ============================================================ */
export function initAssistant() {
  const fab = d.getElementById('fab');
  const navBtn = d.getElementById('navAssistant');
  const footBtn = d.getElementById('footerAssistant');
  const panel = d.getElementById('assistant');
  const closeBtn = d.getElementById('assistantClose');
  const body = d.getElementById('assistantBody');
  const form = d.getElementById('assistantForm');
  const input = d.getElementById('assistantText');
  const chips = d.getElementById('assistantChips');
  const profileSlot = d.getElementById('assistantProfileSlot');
  const liveRegion = d.getElementById('assistantLive');

  if (!panel || !body) return;

  // Init workspace state manager
  Workspace.init(panel);

  // Make body focusable so keyboard arrow keys / Page Up/Down also scroll it
  body.setAttribute('tabindex', '-1');

  /* ---------- open / close ---------- */
  const open = () => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    fab && fab.classList.add('is-hidden');
    setTimeout(() => input && input.focus(), 350);
  };
  const close = () => {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    fab && fab.classList.remove('is-hidden');
    Workspace.exitFocus();
  };

  fab && fab.addEventListener('click', open);
  navBtn && navBtn.addEventListener('click', open);
  footBtn && footBtn.addEventListener('click', open);
  closeBtn && closeBtn.addEventListener('click', close);
  d.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open') && Workspace.state === 'compact') close();
  });

  /* ---------- initial chips ---------- */
  const renderChips = (items) => {
    chips.innerHTML = items.map((c) =>
      `<button type="button" class="assistant__chip" data-cursor="link">${c}</button>`
    ).join('');
  };
  renderChips(ASSISTANT_CHIPS);
  chips.addEventListener('click', (e) => {
    const btn = e.target.closest('.assistant__chip');
    if (btn) ask(btn.textContent);
  });

  /* ---------- message DOM helpers ---------- */
  function addBubble(who) {
    const el = d.createElement('div');
    el.className = `assistant__msg assistant__msg--${who}`;
    if (who === 'bot') {
      el.innerHTML = '<span class="assistant__msg-name">SRIIVERSE AI</span><div class="ai-content"></div>';
    } else {
      el.innerHTML = '<div class="ai-content"></div>';
    }
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el.querySelector('.ai-content');
  }

  /* ---------- delegated events ---------- */
  body.addEventListener('click', (e) => {
    // follow-up chips
    const fu = e.target.closest('.ai-followup');
    if (fu) { ask(fu.textContent); return; }

    // citation → scroll to source section
    const cite = e.target.closest('.ai-cite');
    if (cite && cite.dataset.link) {
      const id = cite.dataset.link.replace('#', '');
      const target = d.getElementById(id);
      if (target) {
        if (window.__lenis) window.__lenis.scrollTo(target, { offset: -60 });
        else target.scrollIntoView({ behavior: 'smooth' });
      }
    }

    // code copy
    const copy = e.target.closest('.ai-code__copy');
    if (copy) {
      const code = copy.closest('.ai-code__block')?.querySelector('code');
      if (code) {
        navigator.clipboard?.writeText(code.textContent).catch(() => {});
        copy.textContent = 'copied';
        setTimeout(() => (copy.textContent = 'copy'), 1200);
      }
    }

    // command bar actions
    const cmdBtn = e.target.closest('.ai-cmd-btn');
    if (cmdBtn) {
      const action = cmdBtn.dataset.action;
      if (action?.startsWith('demo:')) window.open(action.slice(5), '_blank', 'noopener');
      else if (action?.startsWith('github:')) window.open(action.slice(7), '_blank', 'noopener');
      else if (action?.startsWith('ask:')) ask(action.slice(4));
    }
  });

  /* ---------- interview mode rendering (needs body/addBubble/liveRegion) ---------- */
  async function renderInterviewTurn(event) {
    const text = formatInterviewEvent(event);
    const contentEl = addBubble('bot');
    const stream = createStream(contentEl, (buf) => renderMarkdown(buf), { speed: 14 });
    stream.push(text);
    await stream.done();
    if (liveRegion) liveRegion.textContent = text;
    memory.add('assistant', text, {});
    memory.setActiveTopic(event.topic ? `interview:${event.topic}` : 'interview');
    Workspace.onExchange(memory.turnCount);
  }

  /* ============================================================
     THE 12-STEP PIPELINE
     ============================================================ */
  async function ask(rawText) {
    const userText = (rawText || '').trim();
    if (!userText) return;

    // Hide chips after first interaction
    chips.style.display = 'none';

    // --- MODE GATE: an interview session is in progress ---
    // Bypasses the entire pipeline below (no intent classification, no
    // provider call, no proactive tool) — interview.js owns the turn.
    if (interview.isActive()) {
      memory.add('user', userText, { skipProfileIngest: true });
      addBubble('user').textContent = userText;
      await renderInterviewTurn(interview.handleTurn(userText));
      return;
    }

    // A pasted job description isn't "how the visitor talks" — don't let it
    // skew VisitorProfile's inferred type/focus area.
    const isJD = looksLikeJobDescription(userText);
    memory.add('user', userText, { skipProfileIngest: isJD });
    addBubble('user').textContent = userText;

    // --- thinking state ---
    const think = startThinkingSteps(body);

    // --- 1. INTENT ---
    const intent = classifyIntent(userText);
    think.update('intent');
    await tick();

    // Fresh interview-start command (session not yet active)
    if (intent === 'interview') {
      think.done();
      await renderInterviewTurn(interview.start(userText));
      return;
    }

    // --- 2. AWARENESS ---
    const awarenessContext = buildAwarenessContext();
    think.update('context');
    await tick();

    // --- 3. CONTEXT (pronoun resolution) ---
    const { query, focusProject } = resolveContext(userText, intent);

    // --- 4. PROFILE ---
    // Profile was already updated in memory.add() above. Read it here.
    const visitorProfile = memory.profile;
    // Update profile badge in panel header
    if (profileSlot && visitorProfile.isInferred) {
      profileSlot.innerHTML = renderVisitorProfile(visitorProfile);
    }

    // --- 5. QUESTION UNDERSTANDING ---
    // Decides the QuestionFrame (questionType/subject/polarity plus the
    // legacy move/scope/projectId fields — docs/REASONING_ENGINE_SPEC.md
    // Section 3.1) BEFORE retrieval runs, so knowledge SUPPORTS the answer
    // instead of a keyword-scoring race deciding it. Renamed from
    // analyzeStrategy() per Section 8.2's migration contract.
    const questionFrame = buildQuestionFrame(query, { intent, focusProject, memory, awareness });

    // --- 5b. ENTITY RESOLUTION ---
    // Stage 3 of docs/REASONING_ENGINE_SPEC.md, orchestrated from the live
    // request path for the first time in this phase (Phase 1 built
    // entities.js's resolveEntities() but deliberately left it uncalled
    // here — see docs/PHASE_1_VALIDATION.md Section 3's "not yet visible
    // end-to-end" caveat). Stage 4 ("Conversation Context" / discourse
    // focus-entity carryover) is explicitly out of scope for this phase —
    // resolveEntities() reads only the current turn's own text.
    const resolvedEntities = resolveEntities(query);

    // --- 6. EVIDENCE SELECTION ---
    // Stage 5 of docs/REASONING_ENGINE_SPEC.md: scopes retrieval by
    // `questionFrame.questionType` BEFORE the provider decides how to
    // route the response, instead of the keyword-similarity race across
    // the entire knowledge base deciding it by accident (Cluster E).
    const evidence = knowledge.buildEvidenceSet(query, questionFrame, resolvedEntities.entities);

    // --- 6b. CONFIDENCE ---
    // Stage 6 of docs/REASONING_ENGINE_SPEC.md Section 3.5/§1: a pure
    // assessment over Stage 5's `evidence` and Stage 3's `resolvedEntities`
    // — no retrieval, no routing change, no response text, no evidence
    // mutation. Stage 7 (Response Planning) and Stage 8 (Response
    // Composition) remain out of scope for this phase, so — exactly like
    // `entities`/`evidence` before it — `confidence` is threaded onto `ctx`
    // below purely as additive, already-computed data; `providers.js` does
    // not read it to change what it renders (see docs/PHASE_4_VALIDATION.md).
    const confidence = assessConfidence(evidence, resolvedEntities.entities);

    // --- 6c. RESPONSE PLANNING ---
    // Stage 7 of docs/REASONING_ENGINE_SPEC.md §3.6/§4.2: decides which
    // ResponseBlocks answer this turn, in what order, purely as structured
    // data — no markdown, no DOM, no provider call. Threaded onto `ctx`
    // below exactly like `entities`/`evidence`/`confidence` before it, but
    // per this phase's explicit instruction `providers.js` does not read
    // `ctx.plan` yet (Stage 8/Response Composition is not implemented) —
    // confirmed inert by direct test in docs/PHASE_5_VALIDATION.md.
    const plan = buildResponsePlan(questionFrame, resolvedEntities, evidence, confidence);

    // --- 7. MEMORY happens inside the provider ---
    think.update('knowledge');

    // --- 8. PROACTIVE TOOL (run in background, don't block response) ---
    // Fire intent-based navigation after a delay so text streams first.
    // 'jd-match' is excluded — a pasted JD's prose shouldn't trigger
    // incidental scroll/highlight actions.
    const proactiveShouldRun = !['action-nav', 'action-demo', 'action-github', 'action-contact', 'action-highlight', 'action-resume', 'jd-match'].includes(intent);
    if (proactiveShouldRun) {
      // classifyIntent() no longer returns 'architecture'/'stack'/
      // 'recruiter'/'profile' (narrowed to commands only — Spec Section
      // 8.2); tools.js's runProactiveTool() still switches on those exact
      // strings, so translate the QuestionFrame's questionType back to its
      // legacy proactive-tool label rather than changing that switch.
      const proactiveIntent = intent || PROACTIVE_INTENT_FROM_QUESTION_TYPE[questionFrame.questionType] || null;
      runProactiveTool(proactiveIntent, focusProject, knowledge);
    }

    // --- 9. PROVIDER ---
    think.update('reasoning');
    const provider = getProvider();
    let response;
    try {
      response = await provider.generate(query, {
        memory,
        intent,
        questionFrame,
        entities: resolvedEntities,
        evidence,
        confidence,
        plan,
        focusProject,
        awarenessContext,
        visitorProfile: visitorProfile.toJSON?.() || {},
      });
    } catch (e) {
      response = {
        text: `I encountered an issue generating that response. (${e.message}) Try rephrasing your question.`,
        sources: [],
        kind: 'text',
        payload: null,
      };
    }

    // --- 10. EXPLICIT TOOL EXECUTION ---
    think.update('memory');
    let toolResult = null;
    // 'jd-match' is excluded — a JD may happen to start with a word like
    // "Open" or contain "download" without meaning it as a command.
    const isPureAction = intent !== 'jd-match' && (
      ['action-nav', 'action-demo', 'action-github', 'action-contact', 'action-highlight', 'action-resume'].includes(intent)
      || /^(open|launch|go to|show me|take me to|navigate to|scroll to|download)\b/i.test(userText)
    );
    const decision = isPureAction ? decideTool(query, knowledge) : null;
    if (decision) {
      toolResult = runTool(decision);
    }

    // done thinking
    think.done();

    // --- 11. RICH RESPONSE ---
    const contentEl = addBubble('bot');
    const stream = createStream(contentEl, (buf) => renderMarkdown(buf), { speed: 14 });

    // Prepend tool confirmation if a tool ran
    const finalText = (toolResult?.msg) ? `${toolResult.msg}\n\n${response.text}` : response.text;
    stream.push(finalText);
    await stream.done();
    // Announce the complete message exactly once per turn (not every
    // streamed word-chunk) — see index.html's #assistantLive.
    if (liveRegion) liveRegion.textContent = finalText;

    // Append tabbed project card (for project responses)
    if ((response.kind === 'project-card') && response.payload?.project) {
      const cardWrap = d.createElement('div');
      cardWrap.className = 'ai-card-wrap';
      cardWrap.innerHTML = renderTabbedProjectCard(response.payload.project);
      contentEl.appendChild(cardWrap);
      body.scrollTop = body.scrollHeight;

      // Append command bar for project
      const actions = buildProjectActions(response.payload.project);
      if (actions) {
        const cmdWrap = d.createElement('div');
        cmdWrap.innerHTML = renderCommandBar(actions);
        contentEl.appendChild(cmdWrap);
      }
    }

    // Append comparison card
    if (response.kind === 'comparison' && response.payload?.projectA && response.payload?.projectB) {
      const compWrap = d.createElement('div');
      compWrap.innerHTML = renderComparisonCard(response.payload.projectA, response.payload.projectB);
      contentEl.appendChild(compWrap);
      body.scrollTop = body.scrollHeight;
    }

    // Append citations
    if (response.sources?.length) {
      const citeWrap = d.createElement('div');
      citeWrap.innerHTML = renderCitations(response.sources);
      contentEl.appendChild(citeWrap);
      body.scrollTop = body.scrollHeight;
    }

    // Record assistant turn
    const resolvedProject = focusProject || response.payload?.project?.id || response.payload?.projectA?.id || null;
    memory.add('assistant', response.text, { project: resolvedProject });

    // --- 12. WORKSPACE STATE ---
    Workspace.onExchange(memory.turnCount);

    // --- 13. FOLLOW-UPS ---
    const followups = buildFollowups(intent, response.payload, focusProject, questionFrame);
    if (followups.length) {
      const fuWrap = d.createElement('div');
      fuWrap.innerHTML = renderFollowups(followups);
      contentEl.appendChild(fuWrap);
      body.scrollTop = body.scrollHeight;
    }
  }

  /* ---------- form submit ---------- */
  form && form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    ask(v);
  });

  /* ---------- expose global handle ---------- */
  window.SRIIVERSE_AI = { ask, memory, knowledge, awareness, workspace: Workspace };
}

function tick(ms = 60) { return new Promise((r) => setTimeout(r, ms)); }
