/**
 * conversationEngine public barrel.
 * Context preparation only — no LLM calls.
 */

export {
  prepareContext,
  computePackageConfidence,
  detectIntent,
  detectPersona,
  detectEmotion,
  buildRetrievalPlan,
  rankKnowledgeDocuments,
  buildConversationStrategy,
} from './conversationEngine.js';

export { default } from './conversationEngine.js';

export { extractQueryTokens } from './retrievalPlanner.js';
