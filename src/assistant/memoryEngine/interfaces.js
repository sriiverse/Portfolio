/**
 * interfaces.js — Memory engine contracts (in-memory only).
 */

/**
 * @typedef {'opening'|'exploring'|'deepening'|'comparing'|'closing'|'unknown'} ConversationStage
 */

/**
 * @typedef {object} MemoryState
 * @property {string|null} topic
 * @property {string[]} projectsDiscussed
 * @property {Array<{ text: string, at: string, intent?: string|null }>} previousQuestions
 * @property {number} conversationDepth
 * @property {string[]} userInterests
 * @property {ConversationStage} conversationStage
 * @property {Array<{ role: 'user'|'assistant'|'system', text: string, at: string, meta?: object }>} turns
 * @property {Record<string, unknown>} slots
 * @property {string} updatedAt
 * @property {string} createdAt
 */

/**
 * @typedef {object} RememberInput
 * @property {string} [topic]
 * @property {string|string[]} [project]
 * @property {string|string[]} [projects]
 * @property {string} [question]
 * @property {string|string[]} [interest]
 * @property {string|string[]} [interests]
 * @property {ConversationStage} [stage]
 * @property {number} [depthDelta]
 * @property {'user'|'assistant'|'system'} [role]
 * @property {string} [text]
 * @property {string} [intent]
 * @property {Record<string, unknown>} [slot]
 * @property {Record<string, unknown>} [slots]
 * @property {object} [meta]
 */

export const CONVERSATION_STAGES = [
  'opening',
  'exploring',
  'deepening',
  'comparing',
  'closing',
  'unknown',
];

export function emptyState() {
  const now = new Date().toISOString();
  return {
    topic: null,
    projectsDiscussed: [],
    previousQuestions: [],
    conversationDepth: 0,
    userInterests: [],
    conversationStage: /** @type {import('./interfaces.js').ConversationStage} */ ('opening'),
    turns: [],
    slots: {},
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneState(state) {
  return {
    topic: state.topic,
    projectsDiscussed: [...(state.projectsDiscussed || [])],
    previousQuestions: (state.previousQuestions || []).map((q) => ({ ...q })),
    conversationDepth: state.conversationDepth || 0,
    userInterests: [...(state.userInterests || [])],
    conversationStage: state.conversationStage || 'opening',
    turns: (state.turns || []).map((t) => ({ ...t, meta: t.meta ? { ...t.meta } : undefined })),
    slots: { ...(state.slots || {}) },
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
  };
}

export default {
  CONVERSATION_STAGES,
  emptyState,
  cloneState,
};
