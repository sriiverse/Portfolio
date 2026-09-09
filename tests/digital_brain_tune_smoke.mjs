/**
 * Smoke harness for Digital Brain tuning — exercises classify + synthesize
 * without the DOM. Run: node tests/digital_brain_tune_smoke.mjs
 */
import { buildQuestionFrame, isBoundFollowUpQuery } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { classifyReasoningStrategy, synthesizeReasoning } from '../src/assistant/reasoning.js';

function turn(query, memory = {}) {
  const questionFrame = buildQuestionFrame(query);
  const entities = resolveEntities(query, { hint: questionFrame });
  const evidence = buildEvidenceSet(query, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  const ctx = { questionFrame, entities, evidence, confidence, memory, query, plan };
  const classification = classifyReasoningStrategy(query, ctx);
  const spoken = synthesizeReasoning(classification, query, ctx);
  return {
    query,
    mode: questionFrame.conversationMode,
    qType: questionFrame.questionType,
    subject: questionFrame.subject,
    primary: entities.primaryEntity?.canonical || null,
    primaryType: entities.primaryEntity?.type || null,
    gaps: evidence.gapNotes,
    task: classification.task,
    planLead: plan.blocks?.find((b) => b.type === 'DirectAnswer')?.data?.text || '',
    selfAspect: plan.blocks?.find((b) => b.type === 'SelfModel')?.data?.aspect || null,
    spoken: String(spoken || '').slice(0, 480),
  };
}

const tests = [
  'Who is Sudhanshu, beyond what\'s written on his resume?',
  'What is SRIIVERSEAI?',
  'What makes SRIIVERSEAI different from a typical portfolio?',
  'Are you Sudhanshu, SRIIVERSEAI, or something else?',
  'What do you actually know about SRIIVERSEAI, and what is your role inside it?',
  'I don\'t want to see Sudhanshu\'s resume. Talk to me like I\'m meeting the person behind the projects.',
  'Describe Sudhanshu in 30 seconds.',
  'Tell me about QueryForgeAI.',
  'How was QueryForgeAI built?',
  'Why did Sudhanshu choose this architecture?',
  'What should I learn next if I want to build systems like this?',
  'What does Sudhanshu actually specialize in?',
  'What is something you don\'t know about Sudhanshu?',
];

console.log('=== Digital Brain smoke ===\n');
let failures = 0;
for (const q of tests) {
  const r = turn(q);
  console.log('Q:', q);
  console.log(JSON.stringify({
    mode: r.mode, qType: r.qType, subject: r.subject,
    primary: r.primary, primaryType: r.primaryType,
    task: r.task, gaps: r.gaps, selfAspect: r.selfAspect,
    planLead: (r.planLead || '').slice(0, 80),
  }));
  console.log('A:', (r.spoken || '(null — plan/self-model path)').replace(/\n/g, ' / '));
  if (/skill set/i.test(r.spoken) || (r.gaps || []).some((g) => /SRIIVERSEAI.*skill/i.test(g))) {
    console.error('  !! skill-set dump');
    failures += 1;
  }
  if (/@sriiverse|mailto:|📧/i.test(r.spoken) && !/contact/i.test(q)) {
    console.error('  !! contact dump');
    failures += 1;
  }
  console.log('---');
}

console.log('\n=== Follow-up chain ===');
let mem = { lastProject: 'queryforge', lastCommitment: { projectId: 'queryforge', task: 'project_overview' } };
for (const q of ['Tell me about QueryForgeAI.', 'How does it work?', 'Why that architecture?', 'What would you improve?']) {
  const enriched = isBoundFollowUpQuery(q) && mem.lastProject ? `${q} QueryForgeAI` : q;
  const r = turn(enriched, mem);
  console.log('Q:', q, '→', enriched);
  console.log(' bound?', isBoundFollowUpQuery(q), 'task', r.task);
  console.log('A:', (r.spoken || '').replace(/\n/g, ' / ').slice(0, 300));
  if (isBoundFollowUpQuery(q) && !/queryforge/i.test(enriched)) failures += 1;
  console.log('---');
  mem = { lastProject: 'queryforge', lastCommitment: { projectId: 'queryforge', task: r.task || 'project_overview' } };
}

const bad = turn('Does he know SRIIVERSEAI?');
console.log('\nBrand skill check:', {
  primary: bad.primary, type: bad.primaryType, gaps: bad.gaps, task: bad.task,
  spoken: (bad.spoken || '').slice(0, 220),
});
if ((bad.gaps || []).some((g) => /skill set/i.test(g))) {
  console.error('FAIL: SRIIVERSEAI treated as missing skill');
  failures += 1;
}

if (failures) {
  console.error(`\nFAILED with ${failures} issue(s)`);
  process.exit(1);
}
console.log('\nOK smoke complete');
