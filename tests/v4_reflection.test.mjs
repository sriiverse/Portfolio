/**
 * V4 Reflection Engine tests
 * Run: node tests/v4_reflection.test.mjs
 */
import {
  reflectAnswer,
  finalizeWithReflection,
  validateReflectionReport,
} from '../src/assistant/reflection.js';
import { getEngineeringGraph, resetEngineeringGraph } from '../src/assistant/graph.js';
import { resetDecisionRecordsCache } from '../src/assistant/decisions.js';
import { resetEngineeringIdentityCache } from '../src/assistant/identity.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message || err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message || err}`);
  }
}

resetEngineeringGraph();
resetDecisionRecordsCache();
resetEngineeringIdentityCache();
getEngineeringGraph({ forceRebuild: true });

test('reflectAnswer returns six checks + valid report', () => {
  const out = reflectAnswer({
    text: "I'd put **QueryForgeAI** in front of a FAANG-style interviewer. That kind of interview rewards depth of systems thinking and clear trade-offs.",
    kind: 'text',
    sources: [],
    payload: {
      _conversationalMove: 'Answer',
      _portfolioIntelligence: 'faang_interview',
      _reasoningStrategy: { strategy: 'Recommend', task: 'faang_interview' },
    },
  }, { confidence: { tier: 'high' } });

  assert(out.reflection, 'missing reflection');
  const v = validateReflectionReport(out.reflection);
  assert(v.ok, v.errors.join('; '));
  assert(out.payload._reflection, 'payload missing _reflection');
  assert(out.reflection.checks.evidence, 'evidence');
  assert(out.reflection.checks.assumptions, 'assumptions');
  assert(out.reflection.checks.confidence, 'confidence');
  assert(out.reflection.checks.completeness, 'completeness');
  assert(out.reflection.checks.teachingQuality, 'teachingQuality');
  assert(out.reflection.checks.engineeringReasoning, 'engineeringReasoning');
});

test('Greeting is soft-passed without rewriting', () => {
  const greeting = 'Hey! 👋 I\'m SRIIVERSE AI — Sudhanshu Sinha\'s portfolio assistant.';
  const out = reflectAnswer({
    text: greeting,
    kind: 'text',
    payload: { _conversationalMove: 'Greeting' },
  }, {});
  assert(out.text === greeting, 'greeting rewritten');
  assert(out.reflection.overall === 'pass', `overall=${out.reflection.overall}`);
});

test('scrubs implementation-voice leaks', () => {
  const out = reflectAnswer({
    text: 'Based on what is documented: he ships QueryForgeAI with a retrieval-and-reasoning layer over the knowledge base.',
    kind: 'text',
    payload: {
      _conversationalMove: 'Answer',
      _reasoningStrategy: { strategy: 'Summarize', task: 'about_sudhanshu' },
    },
  }, {});
  assert(!/Based on what is documented/i.test(out.text), 'doc lead remains');
  assert(!/retrieval-and-reasoning/i.test(out.text), 'RAG phrase remains');
  assert(!/\bknowledge base\b/i.test(out.text), 'knowledge base remains');
  assert(out.reflection.actions.some((a) => a.type === 'scrub-impl-voice'), 'expected scrub action');
});

test('honest Kubernetes gap is not rewritten into ownership', () => {
  const text = 'Kubernetes is not part of Sudhanshu\'s shipped project history. Closest grounded thread: Docker / Vercel.';
  const out = reflectAnswer({
    text,
    kind: 'text',
    payload: { _conversationalMove: 'Decline' },
  }, {
    entities: { entities: [{ canonical: 'Kubernetes', ownership: 'gap', confidence: 'high' }] },
    confidence: { tier: 'high' },
  });
  assert(/not part/i.test(out.text), 'honesty lost');
  assert(out.reflection.checks.evidence.ok, 'evidence should ok for honest gap');
});

test('finalizeWithReflection preserves kind/sources and attaches payload meta', () => {
  const finalized = finalizeWithReflection({
    text: 'Yes — he can design REST APIs. Confidence is high because REST APIs appear across the shipped systems.',
    kind: 'text',
    sources: [{ id: 'x' }],
    payload: {
      _conversationalMove: 'Answer',
      _portfolioIntelligence: 'eval_rest_apis',
      _reasoningStrategy: { strategy: 'Evaluate', task: 'eval_rest_apis' },
    },
  }, { confidence: { tier: 'high' } });

  assert(finalized.kind === 'text', 'kind');
  assert(finalized.sources.length === 1, 'sources');
  assert(finalized.payload._reflection?.overall, 'overall missing');
  assert(!('reflection' in finalized), 'full report must not leak onto result root');
});

test('Decision-first dump lead is stripped', () => {
  const out = reflectAnswer({
    text: '## Engineering decisions\n\nFlask was chosen for QueryForgeAI because of explicit control.',
    kind: 'text',
    payload: {
      _conversationalMove: 'Answer',
      _reasoningStrategy: { strategy: 'Explain', task: 'why_flask' },
    },
  }, {});
  assert(!/^##\s*Engineering decisions/i.test(out.text.trim()), 'dump lead remains');
  assert(/Flask/i.test(out.text), 'content lost');
});

const pass = results.filter((r) => r.ok).length;
console.log(`\nRESULT ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
