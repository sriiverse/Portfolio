/**
 * evaluationEngine public barrel.
 * Rule-based regression scoring — no LLM.
 */

export {
  evaluateAnswer,
  aggregateResults,
  evaluateFixtures,
  passesGate,
} from './evaluationEngine.js';

export { default } from './evaluationEngine.js';

export { METRIC_IDS, metricResult, clamp10 } from './interfaces.js';
export {
  METRIC_RUNNERS,
  scoreNaturalness,
  scoreTechnicalAccuracy,
  scoreConfidence,
  scoreHumility,
  scoreStorytelling,
  scoreConciseness,
  scoreVoiceConsistency,
  scoreEngineeringReasoning,
  scoreTradeoffQuality,
  scoreProjectConsistency,
} from './metrics/index.js';
