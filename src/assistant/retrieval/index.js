/**
 * retrieval public barrel.
 *
 * Semantic retrieval layer — prepares context packages; does not call an LLM
 * or the live assistant.
 */

export {
  SEARCH_CHANNELS,
  buildRetrievalQuery,
  normalizeHit,
  dedupeHits,
  tokenize,
  normalizeTag,
  filterCorpus,
} from './interfaces.js';

export { keywordSearch, keywordSearchChannel } from './keywordSearch.js';
export { tagSearch, tagSearchChannel } from './tagSearch.js';
export {
  relationshipSearch,
  relationshipSearchChannel,
  findNeighbors,
  readExplicitEdges,
} from './relationshipSearch.js';
export { rankHits, DEFAULT_CHANNEL_WEIGHTS } from './ranking.js';
export { vectorSearch, vectorSearchChannel, vectorSearchStatus } from './vectorSearch.js';
export { retrieve, INTENT_CATEGORY_HINTS, computeRetrievalConfidence, categoryPriorHits } from './pipeline.js';
export { loadDefaultCorpus } from './corpus.js';

export { default } from './pipeline.js';
