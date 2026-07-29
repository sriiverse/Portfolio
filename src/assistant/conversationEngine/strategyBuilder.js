/**
 * strategyBuilder.js — Derive conversationStrategy from detections.
 * Context preparation only — does not generate answer text.
 */

/**
 * @param {{
 *   intent: { id: string, confidence?: number },
 *   persona: { id: string, confidence?: number },
 *   emotion: { id: string, confidence?: number },
 *   retrievalPlan?: { categories?: string[] },
 *   rankedCount?: number
 * }} input
 */
export function buildConversationStrategy(input) {
  const intentId = input?.intent?.id || 'unknown';
  const personaId = input?.persona?.id || 'unknown';
  const emotionId = input?.emotion?.id || 'neutral';
  const rankedCount = input?.rankedCount ?? 0;

  /** @type {'spoken'|'documentation'|'clarify'|'acknowledge'} */
  let mode = 'spoken';
  if (intentId === 'walkthrough') mode = 'documentation';
  if (intentId === 'greeting') mode = 'acknowledge';
  if (intentId === 'unknown' && rankedCount === 0) mode = 'clarify';

  /** @type {'short'|'standard'|'deep'} */
  let answerShape = 'standard';
  if (intentId === 'greeting' || emotionId === 'frustrated') answerShape = 'short';
  if (intentId === 'walkthrough' || intentId === 'architecture') answerShape = 'deep';
  if (personaId === 'recruiter' && intentId === 'recommend') answerShape = 'short';
  if (personaId === 'student') answerShape = intentId === 'explain' ? 'standard' : answerShape;

  /** @type {'candid'|'warm'|'precise'|'calm'} */
  let tone = 'precise';
  if (emotionId === 'skeptical' || intentId === 'critique') tone = 'candid';
  if (emotionId === 'enthusiastic' || intentId === 'introduce_self') tone = 'warm';
  if (emotionId === 'frustrated') tone = 'calm';
  if (personaId === 'student') tone = tone === 'precise' ? 'warm' : tone;

  const knowledgeEmphasis = (input?.retrievalPlan?.categories || []).slice(0, 4);

  /** @type {'none'|'invite-demo'|'invite-depth'|'invite-clarify'} */
  let followUpStyle = 'invite-depth';
  if (mode === 'documentation') followUpStyle = 'invite-demo';
  if (mode === 'clarify') followUpStyle = 'invite-clarify';
  if (emotionId === 'frustrated') followUpStyle = 'none';
  if (intentId === 'greeting') followUpStyle = 'invite-demo';

  return {
    mode,
    answerShape,
    tone,
    knowledgeEmphasis,
    followUpStyle,
    expandOnlyIfAsked: mode !== 'documentation',
    useProjectAsEvidence: !['introduce_self', 'greeting', 'opinion'].includes(intentId)
      || intentId === 'recommend',
    notes: [
      `intent=${intentId}`,
      `persona=${personaId}`,
      `emotion=${emotionId}`,
      `hits=${rankedCount}`,
    ],
  };
}

export default { buildConversationStrategy };
