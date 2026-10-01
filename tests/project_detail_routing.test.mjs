/**
 * Regression: engineering-detail QueryForge questions must not collapse
 * into project_overview + architecture invite menus.
 * Run: node tests/project_detail_routing.test.mjs
 */
import { buildQuestionFrame, wantsDirectAnswerOnly } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import {
  classifyReasoningStrategy,
  synthesizeReasoning,
  isEngineeringDetailQuery,
  isGenuineProjectOverviewQuery,
} from '../src/assistant/reasoning.js';
import { pickContextualInvite } from '../src/assistant/adaptive.js';

globalThis.window = globalThis.window || { SRIIVERSE_AI_CONFIG: { provider: 'local' } };
globalThis.sessionStorage = globalThis.sessionStorage || {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

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

const Q1 = 'When you generate SQL from a natural-language question, where does the database schema come from? Explain exactly what the user provides, what QueryForgeAI receives, and whether you actually connect to or inspect a live database.';
const Q2 = 'For QueryForgeAI specifically, what does a user have to provide before the AI can generate SQL? Describe only the actual user inputs and the information QueryForgeAI receives. Do not give me navigation options, project recommendations, or questions I could ask next. If the information is not documented, say that clearly.';

async function render(q) {
  const questionFrame = buildQuestionFrame(q, {});
  const entities = resolveEntities(q);
  const evidence = buildEvidenceSet(q, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  const provider = getProvider();
  return provider.generate(q, {
    questionFrame,
    entities,
    evidence,
    confidence,
    plan,
    memory: { turnCount: 1, turns: [], hasUsedPhrase: () => false, markPhraseUsed: () => {} },
    visitorProfile: { type: 'unknown' },
  });
}

test('helpers: detail vs overview shapes', () => {
  assert(isEngineeringDetailQuery(Q1), 'Q1 detail');
  assert(isEngineeringDetailQuery(Q2), 'Q2 detail');
  assert(!isGenuineProjectOverviewQuery(Q1), 'Q1 not overview');
  assert(!isGenuineProjectOverviewQuery(Q2), 'Q2 not overview');
  assert(isGenuineProjectOverviewQuery('Tell me about QueryForgeAI'), 'genuine overview');
  assert(isGenuineProjectOverviewQuery('Explain QueryForgeAI'), 'explain project overview');
  assert(!isGenuineProjectOverviewQuery('Explain exactly what the user provides for QueryForgeAI'), 'instructional explain');
  assert(wantsDirectAnswerOnly(Q2), 'Q2 wants direct only');
  assert(!wantsDirectAnswerOnly(Q1), 'Q1 does not force direct-only flag');
});

test('Q1 classify: queryforge_detail, not project_overview', () => {
  const frame = buildQuestionFrame(Q1, {});
  const r = classifyReasoningStrategy(Q1, { questionFrame: frame, memory: {} });
  assert(r.task !== 'project_overview', `got ${r.task}`);
  assert(r.task === 'queryforge_detail', `expected queryforge_detail, got ${r.task}`);
  const text = synthesizeReasoning(r, Q1, { questionFrame: frame, memory: {} });
  assert(/schema_def|user-provided schema|pasted/i.test(text), 'schema fact');
  assert(!/Optimize database queries at the speed of thought/i.test(text), 'no tagline dump');
  assert(!/Interested in why I chose this architecture/i.test(text), 'no architecture invite in synth');
});

test('Q2 classify: queryforge_detail, not project_overview', () => {
  const frame = buildQuestionFrame(Q2, {});
  const r = classifyReasoningStrategy(Q2, { questionFrame: frame, memory: {} });
  assert(r.task !== 'project_overview', `got ${r.task}`);
  assert(r.task === 'queryforge_detail', `expected queryforge_detail, got ${r.task}`);
});

test('Q1/Q2 end-to-end: code-proven answers, no overview menu', async () => {
  for (const q of [Q1, Q2]) {
    const out = await render(q);
    assert(out?.payload?._portfolioIntelligence === 'queryforge_detail', `${q.slice(0, 40)}… task=${out?.payload?._portfolioIntelligence}`);
    assert(/schema_def|dialect|user-provided|pasted schema/i.test(out.text), 'inputs fact');
    assert(!/Optimize database queries at the speed of thought/i.test(out.text), 'no tagline');
    assert(!/Interested in why I chose this architecture/i.test(out.text), 'no arch invite');
    assert(!/What should he learn next/i.test(out.text), 'no learn-next');
    assert(!/There are really two ways to look at this/i.test(out.text), 'no false or-reflection');
  }
});

test('Q2 suppresses contextual invites', () => {
  const invite = pickContextualInvite({
    query: Q2,
    questionFrame: { rawQuery: Q2, questionType: 'ProjectExplanation' },
    payload: { _portfolioIntelligence: 'queryforge_detail' },
  }, 'Answer');
  assert(invite == null, `invite should be null, got ${invite}`);
});

test('bare "or" does not match two-ways reflection pattern', () => {
  const when = /\b(?:vs\.?|versus|compare|either .{0,48} or|two (?:ways|approaches|options|angles))\b/i;
  assert(!when.test(Q1), 'Q1 should not match tightened reflection');
  assert(when.test('Flask vs FastAPI'), 'vs still matches');
  assert(when.test('either Flask or FastAPI'), 'either/or still matches');
});

test('QueryForge overview → How does it work? stays on CODE-PROVEN facets', () => {
  const mem = {
    lastProject: 'queryforge',
    lastCommitment: { projectId: 'queryforge', name: 'QueryForgeAI', task: 'project_overview' },
    activeMode: 'project_overview',
  };
  const follow = 'How does it work?';
  const enriched = `${follow} QueryForgeAI`;
  const frame = buildQuestionFrame(enriched, { focusProject: 'queryforge', memory: mem });
  const r = classifyReasoningStrategy(enriched, { questionFrame: frame, memory: mem });
  assert(r.task === 'queryforge_detail', `task=${r.task}`);
  assert(r.task !== 'arch_why', 'must not use generic five-layer arch_why');
  assert(
    ['qf-dataflow-overview', 'qf-dataflow-generator', 'qf-architecture'].includes(r.focus),
    `focus=${r.focus}`,
  );
  const text = synthesizeReasoning(r, enriched, { questionFrame: frame, memory: mem });
  assert(/generate-sql|schema_def|FastAPI|Gemini|\/analyze/i.test(text), `expected QF facet facts in: ${text.slice(0, 200)}`);
  assert(!/\bFlask\b/i.test(text), 'must not surface Flask');
  assert(!/five-layer split/i.test(text), 'must not dump generic five-layer spine');
});

test('QueryForge overview → How does it work? e2e', async () => {
  const mem = {
    lastProject: 'queryforge',
    lastCommitment: { projectId: 'queryforge', name: 'QueryForgeAI', task: 'project_overview' },
    activeMode: 'project_overview',
    turnCount: 2,
    turns: [],
    hasUsedPhrase: () => false,
    markPhraseUsed: () => {},
  };
  const q = 'How does it work? QueryForgeAI';
  const questionFrame = buildQuestionFrame(q, { focusProject: 'queryforge', memory: mem });
  const entities = resolveEntities(q);
  const evidence = buildEvidenceSet(q, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  const out = await getProvider().generate(q, {
    questionFrame,
    entities,
    evidence,
    confidence,
    plan,
    memory: mem,
    visitorProfile: { type: 'unknown' },
  });
  assert(out?.payload?._portfolioIntelligence === 'queryforge_detail', `got ${out?.payload?._portfolioIntelligence}`);
  assert(out.kind !== 'project-card', 'not brochure card');
  assert(!/\bFlask\b/i.test(out.text), 'no Flask');
  assert(/generate-sql|schema_def|FastAPI|Gemini|\/analyze/i.test(out.text), 'facet content');
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
