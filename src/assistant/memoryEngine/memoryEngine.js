/**
 * memoryEngine.js — In-memory conversation memory (no persistence).
 *
 * Remembers:
 *   - current conversation topic
 *   - projects discussed
 *   - previous questions
 *   - conversation depth
 *   - user interests
 *   - conversation stage
 *
 * API: remember() · recall() · forget() · summarize()
 */

import { emptyState, cloneState, CONVERSATION_STAGES } from './interfaces.js';
import {
  extractProjects,
  extractInterests,
  extractTopic,
  inferStage,
} from './extractors.js';

/**
 * Create an isolated memory session (in-memory only).
 * @param {{ maxQuestions?: number, maxTurns?: number, maxInterests?: number }} [opts]
 */
export function createMemoryEngine(opts = {}) {
  const maxQuestions = Math.max(1, opts.maxQuestions ?? 40);
  const maxTurns = Math.max(1, opts.maxTurns ?? 60);
  const maxInterests = Math.max(1, opts.maxInterests ?? 32);

  /** @type {import('./interfaces.js').MemoryState} */
  let state = emptyState();

  /**
   * Write facts into memory. Accepts structured fields and/or free text
   * (auto-extracts projects, interests, topic hints).
   *
   * @param {import('./interfaces.js').RememberInput|string} input
   * @returns {import('./interfaces.js').MemoryState} snapshot after write
   */
  function remember(input) {
    const patch = typeof input === 'string'
      ? { text: input, role: /** @type {'user'} */ ('user'), question: input }
      : (input && typeof input === 'object' ? input : {});

    const text = String(patch.text || patch.question || '');
    const now = new Date().toISOString();

    // Projects
    const projectList = normalizeList(patch.project ?? patch.projects);
    const inferredProjects = text ? extractProjects(text) : [];
    for (const p of [...projectList, ...inferredProjects]) {
      addUnique(state.projectsDiscussed, normalizeProjectId(p));
    }

    // Interests
    const interestList = normalizeList(patch.interest ?? patch.interests);
    const inferredInterests = text ? extractInterests(text) : [];
    for (const i of [...interestList, ...inferredInterests]) {
      addUnique(state.userInterests, String(i).toLowerCase().trim());
    }
    if (state.userInterests.length > maxInterests) {
      state.userInterests = state.userInterests.slice(-maxInterests);
    }

    // Topic
    if (patch.topic) {
      state.topic = String(patch.topic);
    } else if (text) {
      const inferred = extractTopic(text, { projects: state.projectsDiscussed });
      if (inferred) state.topic = inferred;
    }

    // Question history
    if (patch.question || (patch.role === 'user' && text)) {
      const qText = String(patch.question || text).trim();
      if (qText) {
        state.previousQuestions.push({
          text: qText,
          at: now,
          intent: patch.intent || null,
        });
        if (state.previousQuestions.length > maxQuestions) {
          state.previousQuestions = state.previousQuestions.slice(-maxQuestions);
        }
      }
    }

    // Turns
    if (patch.role && (patch.text || patch.question)) {
      state.turns.push({
        role: patch.role,
        text: String(patch.text || patch.question || ''),
        at: now,
        meta: patch.meta || undefined,
      });
      if (state.turns.length > maxTurns) {
        state.turns = state.turns.slice(-maxTurns);
      }
    }

    // Depth
    const delta = Number.isFinite(Number(patch.depthDelta))
      ? Number(patch.depthDelta)
      : (patch.role === 'user' || patch.question ? 1 : 0);
    if (delta) {
      state.conversationDepth = Math.max(0, state.conversationDepth + delta);
    }

    // Free-form slots
    if (patch.slot && typeof patch.slot === 'object') {
      Object.assign(state.slots, patch.slot);
    }
    if (patch.slots && typeof patch.slots === 'object') {
      Object.assign(state.slots, patch.slots);
    }

    // Stage
    if (patch.stage && CONVERSATION_STAGES.includes(patch.stage)) {
      state.conversationStage = patch.stage;
    } else {
      state.conversationStage = /** @type {any} */ (inferStage({
        depth: state.conversationDepth,
        questionCount: state.previousQuestions.length,
        text,
        explicit: patch.stage,
      }));
    }

    state.updatedAt = now;
    return snapshot();
  }

  /**
   * Read memory. Keys:
   *   - omit / '*' / 'all' → full snapshot
   *   - 'topic' | 'projects' | 'projectsDiscussed' | 'questions' | 'previousQuestions'
   *   - 'depth' | 'conversationDepth' | 'interests' | 'userInterests'
   *   - 'stage' | 'conversationStage' | 'turns' | 'slots' | 'summary'
   *   - 'slot:<name>' → single slot
   *
   * @param {string|string[]|null} [key]
   * @returns {unknown}
   */
  function recall(key = null) {
    if (key == null || key === '' || key === '*' || key === 'all') {
      return snapshot();
    }

    if (Array.isArray(key)) {
      /** @type {Record<string, unknown>} */
      const out = {};
      for (const k of key) out[String(k)] = recallOne(String(k));
      return out;
    }

    return recallOne(String(key));
  }

  function recallOne(key) {
    const k = key.trim();
    if (k === 'summary') return summarize();
    if (k.startsWith('slot:')) return state.slots[k.slice(5)] ?? null;

    switch (k) {
      case 'topic':
      case 'currentTopic':
      case 'currentConversationTopic':
        return state.topic;
      case 'projects':
      case 'projectsDiscussed':
        return [...state.projectsDiscussed];
      case 'questions':
      case 'previousQuestions':
        return state.previousQuestions.map((q) => ({ ...q }));
      case 'depth':
      case 'conversationDepth':
        return state.conversationDepth;
      case 'interests':
      case 'userInterests':
        return [...state.userInterests];
      case 'stage':
      case 'conversationStage':
        return state.conversationStage;
      case 'turns':
        return state.turns.map((t) => ({ ...t }));
      case 'slots':
        return { ...state.slots };
      case 'state':
        return snapshot();
      default:
        if (Object.prototype.hasOwnProperty.call(state.slots, k)) {
          return state.slots[k];
        }
        return undefined;
    }
  }

  /**
   * Clear memory. Targets:
   *   - omit / '*' / 'all' → full reset
   *   - field names (topic, projects, questions, depth, interests, stage, turns, slots)
   *   - 'slot:<name>'
   *   - project id string → remove from projectsDiscussed
   *
   * @param {string|string[]|null} [target]
   * @returns {import('./interfaces.js').MemoryState}
   */
  function forget(target = null) {
    if (target == null || target === '' || target === '*' || target === 'all') {
      state = emptyState();
      return snapshot();
    }

    const targets = Array.isArray(target) ? target : [target];
    for (const raw of targets) {
      forgetOne(String(raw));
    }
    state.updatedAt = new Date().toISOString();
    return snapshot();
  }

  function forgetOne(target) {
    const t = target.trim();
    if (t.startsWith('slot:')) {
      delete state.slots[t.slice(5)];
      return;
    }

    switch (t) {
      case 'topic':
      case 'currentTopic':
        state.topic = null;
        return;
      case 'projects':
      case 'projectsDiscussed':
        state.projectsDiscussed = [];
        return;
      case 'questions':
      case 'previousQuestions':
        state.previousQuestions = [];
        return;
      case 'depth':
      case 'conversationDepth':
        state.conversationDepth = 0;
        return;
      case 'interests':
      case 'userInterests':
        state.userInterests = [];
        return;
      case 'stage':
      case 'conversationStage':
        state.conversationStage = 'opening';
        return;
      case 'turns':
        state.turns = [];
        return;
      case 'slots':
        state.slots = {};
        return;
      default:
        // Remove a specific project id / interest token
        state.projectsDiscussed = state.projectsDiscussed.filter((p) => p !== t && p !== normalizeProjectId(t));
        state.userInterests = state.userInterests.filter((i) => i !== t.toLowerCase());
        if (Object.prototype.hasOwnProperty.call(state.slots, t)) delete state.slots[t];
    }
  }

  /**
   * Compact textual / structured summary of the session memory.
   * @param {{ format?: 'text'|'object' }} [opts]
   * @returns {string|object}
   */
  function summarize(opts = {}) {
    const format = opts.format || 'text';
    const lastQuestions = state.previousQuestions.slice(-3).map((q) => q.text);
    const obj = {
      topic: state.topic,
      projectsDiscussed: [...state.projectsDiscussed],
      conversationDepth: state.conversationDepth,
      userInterests: [...state.userInterests],
      conversationStage: state.conversationStage,
      questionCount: state.previousQuestions.length,
      recentQuestions: lastQuestions,
      turnCount: state.turns.length,
      slots: { ...state.slots },
    };

    if (format === 'object') return obj;

    const parts = [];
    parts.push(`Stage: ${state.conversationStage} (depth ${state.conversationDepth}).`);
    parts.push(state.topic ? `Topic: ${state.topic}.` : 'Topic: none yet.');
    parts.push(
      state.projectsDiscussed.length
        ? `Projects discussed: ${state.projectsDiscussed.join(', ')}.`
        : 'Projects discussed: none.',
    );
    parts.push(
      state.userInterests.length
        ? `Interests: ${state.userInterests.slice(0, 8).join(', ')}.`
        : 'Interests: none detected.',
    );
    parts.push(`Questions remembered: ${state.previousQuestions.length}.`);
    if (lastQuestions.length) {
      parts.push(`Recent: ${lastQuestions.map((q) => `"${truncate(q, 72)}"`).join(' · ')}`);
    }
    return parts.join(' ');
  }

  function snapshot() {
    return cloneState(state);
  }

  return {
    remember,
    recall,
    forget,
    summarize,
    /** @deprecated use recall() — exposed for debugging */
    getState: snapshot,
  };
}

/** Default shared session (still in-memory only; reset with forget()). */
const defaultEngine = createMemoryEngine();

export const remember = (input) => defaultEngine.remember(input);
export const recall = (key) => defaultEngine.recall(key);
export const forget = (target) => defaultEngine.forget(target);
export const summarize = (opts) => defaultEngine.summarize(opts);

export function resetDefaultMemory() {
  return defaultEngine.forget('all');
}

function normalizeList(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => v != null && String(v).trim());
  return [value].filter((v) => v != null && String(v).trim());
}

function addUnique(arr, value) {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
}

function normalizeProjectId(value) {
  const raw = String(value || '').trim();
  const lower = raw.toLowerCase().replace(/\s+/g, '');
  if (lower.includes('queryforge')) return 'queryforge';
  if (lower.includes('reporadar')) return 'reporadar';
  if (lower.includes('placement')) return 'placementpro';
  return raw.toLowerCase();
}

function truncate(s, n) {
  const t = String(s || '');
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

export default {
  createMemoryEngine,
  remember,
  recall,
  forget,
  summarize,
  resetDefaultMemory,
};
