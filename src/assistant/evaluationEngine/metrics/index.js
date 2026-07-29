/**
 * metrics/index.js — All rule-based metric scorers.
 */

export { scoreNaturalness } from './naturalness.js';
export { scoreTechnicalAccuracy } from './technicalAccuracy.js';
export { scoreConfidence } from './confidence.js';
export { scoreHumility } from './humility.js';
export { scoreStorytelling } from './storytelling.js';
export { scoreConciseness } from './conciseness.js';
export { scoreVoiceConsistency } from './voiceConsistency.js';
export { scoreEngineeringReasoning } from './engineeringReasoning.js';
export { scoreTradeoffQuality } from './tradeoffQuality.js';
export { scoreProjectConsistency } from './projectConsistency.js';

import { scoreNaturalness } from './naturalness.js';
import { scoreTechnicalAccuracy } from './technicalAccuracy.js';
import { scoreConfidence } from './confidence.js';
import { scoreHumility } from './humility.js';
import { scoreStorytelling } from './storytelling.js';
import { scoreConciseness } from './conciseness.js';
import { scoreVoiceConsistency } from './voiceConsistency.js';
import { scoreEngineeringReasoning } from './engineeringReasoning.js';
import { scoreTradeoffQuality } from './tradeoffQuality.js';
import { scoreProjectConsistency } from './projectConsistency.js';

/** Ordered metric runners for the evaluation engine. */
export const METRIC_RUNNERS = [
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
];

export default METRIC_RUNNERS;
