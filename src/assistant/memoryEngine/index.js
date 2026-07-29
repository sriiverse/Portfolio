/**
 * memoryEngine public barrel.
 * In-memory conversation memory — no persistence, no LLM.
 */

export {
  createMemoryEngine,
  remember,
  recall,
  forget,
  summarize,
  resetDefaultMemory,
} from './memoryEngine.js';

export { default } from './memoryEngine.js';

export { CONVERSATION_STAGES, emptyState, cloneState } from './interfaces.js';
export {
  extractProjects,
  extractInterests,
  extractTopic,
  inferStage,
  PROJECT_CATALOG,
} from './extractors.js';
