/**
 * Phase 2A — QueryForgeAI CODE-PROVEN facet regressions.
 * Run: node tests/queryforge_phase2a.test.mjs
 */
import { buildQuestionFrame, wantsDirectAnswerOnly } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet, retrieveScoped } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import {
  classifyReasoningStrategy,
  synthesizeReasoning,
} from '../src/assistant/reasoning.js';
import {
  QUERYFORGE_FACETS,
  matchQueryForgeFacet,
} from '../src/assistant/queryforgeKnowledge.js';
import { PROJECTS } from '../src/content.js';

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

const CASES = [
  {
    q: 'What does a user provide to QueryForgeAI before generating SQL?',
    must: [/schema_def|schema\/DDL|pasted schema|dialect/i, /question/i],
    ban: [/live database introspection|connects to your database/i, /Interested in why I chose/i, /project_overview/i],
    task: 'queryforge_detail',
  },
  {
    q: 'Does QueryForgeAI connect to my database?',
    must: [/does not connect|no live database/i],
    ban: [/reasons over the live schema/i, /Interested in why I chose/i],
    task: 'queryforge_detail',
  },
  {
    q: 'Does the optimizer actually execute EXPLAIN ANALYZE?',
    must: [/does not execute real EXPLAIN|no real EXPLAIN/i],
    ban: [/runs EXPLAIN ANALYZE against your database/i, /Interested in why I chose/i],
    task: 'queryforge_detail',
  },
  {
    q: 'What model does QueryForgeAI use?',
    must: [/gemini-flash-latest|Google Gemini/i],
    ban: [/Interested in why I chose/i],
    task: 'queryforge_detail',
  },
  {
    q: 'What happens when Gemini fails?',
    must: [/429|Groq|demo\/heuristic|HTTP 500|ERROR/i],
    ban: [/Interested in why I chose/i],
    task: 'queryforge_detail',
  },
  {
    q: 'Is QueryForgeAI built with Flask?',
    must: [/FastAPI/i, /not Flask|outdated|inspected implementation/i],
    ban: [/Flask keeps the AI \+ DB orchestration/i, /Interested in why I chose/i],
    task: 'queryforge_detail',
  },
  {
    q: 'What is the actual data flow of QueryForgeAI?',
    must: [/generate-sql|\/analyze/i, /schema_def/i],
    ban: [/Interested in why I chose/i, /What should he learn next/i],
    task: 'queryforge_detail',
  },
  {
    q: 'How does QueryForgeAI actually generate SQL from a natural-language question? Walk me through the complete flow from user input to the final SQL.',
    must: [/schema_def/i, /generate-sql/i, /gemini|Gemini/i],
    ban: [
      /Python backend \(Flask\)|Flask keeps the AI/i,
      /live schema|reasons over the live/i,
      /Interested in why I chose/i,
      /### 🏗️ How It's Built|### ⚡ Technology Stack|project_walkthrough/i,
      /Optimize database queries at the speed of thought/i,
    ],
    task: 'queryforge_detail',
    focus: 'qf-dataflow-generator',
    kindBan: 'project-card',
  },
];

test('facet catalog is authored', () => {
  assert(QUERYFORGE_FACETS.length >= 13, `facet count ${QUERYFORGE_FACETS.length}`);
  const ids = new Set(QUERYFORGE_FACETS.map((f) => f.facet));
  for (const need of [
    'purpose', 'user_flow', 'data_flow.generator', 'data_flow.optimizer',
    'architecture', 'ai_model', 'api_surface', 'failure_modes', 'limitations',
    'validation', 'deployment', 'pro_agent', 'explicit_unknowns',
  ]) {
    assert(ids.has(need) || [...ids].some((x) => x.startsWith(need.split('.')[0])), `missing ${need}`);
  }
});

test('content.js QueryForge stack is FastAPI not Flask', () => {
  const qf = PROJECTS.find((p) => p.id === 'queryforge');
  assert(qf.stack.includes('FastAPI'), 'FastAPI in stack');
  assert(!qf.stack.includes('Flask'), 'Flask removed from stack');
  assert(!/dissects execution plans|live schema/i.test(qf.solution), 'solution not stale');
  assert(!/live database introspection|reasons over the live/i.test(qf.features.map((f) => f.desc).join(' ')), 'features not live-schema');
});

test('retrieval prefers project-detail facets for schema questions', () => {
  const hits = retrieveScoped(
    'Where does the database schema come from in QueryForgeAI?',
    { limit: 4, questionType: 'ProjectExplanation' },
  );
  assert(hits.length, 'hits');
  assert(hits[0].doc.kind === 'project-detail', `top kind ${hits[0].doc.kind}`);
});

test('design-intent unknown facet', () => {
  const f = matchQueryForgeFacet('Why was FastAPI chosen for QueryForgeAI?');
  assert(f?.confidence === 'unknown', `got ${f?.confidence} ${f?.id}`);
  const r = classifyReasoningStrategy('Why was FastAPI chosen for QueryForgeAI?', {
    questionFrame: buildQuestionFrame('Why was FastAPI chosen for QueryForgeAI?', {}),
  });
  assert(r.task === 'queryforge_unknown', `task=${r.task}`);
});

for (const c of CASES) {
  test(`classify: ${c.q.slice(0, 48)}…`, () => {
    const frame = buildQuestionFrame(c.q, {});
    const r = classifyReasoningStrategy(c.q, { questionFrame: frame, memory: {} });
    assert(r.task === c.task, `expected ${c.task}, got ${r.task}`);
    assert(r.task !== 'project_overview', 'must not be overview');
    assert(r.task !== 'project_walkthrough', 'must not be walkthrough card');
    if (c.focus) assert(r.focus === c.focus, `focus want=${c.focus} got=${r.focus}`);
    const text = synthesizeReasoning(r, c.q, { questionFrame: frame, memory: {} });
    for (const re of c.must) assert(re.test(text), `missing ${re} in: ${text.slice(0, 180)}`);
    for (const re of (c.ban || [])) assert(!re.test(text), `banned ${re}`);
  });
}

test('NL→SQL walkthrough retrieves generator facets over project card docs', () => {
  const q = 'How does QueryForgeAI actually generate SQL from a natural-language question? Walk me through the complete flow from user input to the final SQL.';
  const hits = retrieveScoped(q, { limit: 5, questionType: 'ProjectExplanation' });
  assert(hits.length, 'hits');
  assert(hits[0].doc.kind === 'project-detail', `top kind ${hits[0].doc.kind}`);
  assert(
    /data_flow|user_flow/i.test(hits[0].doc.facet || ''),
    `top facet ${hits[0].doc.facet}`,
  );
  assert(hits[0].doc.id !== 'project-queryforge', 'must not top-rank project overview doc');
});

test('end-to-end cases answer without menus', async () => {
  for (const c of CASES) {
    const out = await render(c.q);
    assert(
      out?.payload?._portfolioIntelligence === c.task,
      `${c.q.slice(0, 40)} → ${out?.payload?._portfolioIntelligence}`,
    );
    if (c.kindBan) assert(out.kind !== c.kindBan, `kind must not be ${c.kindBan}`);
    for (const re of c.must) assert(re.test(out.text), `e2e missing ${re}`);
    for (const re of (c.ban || [])) assert(!re.test(out.text), `e2e banned ${re}`);
    assert(!/Interested in why I chose this architecture/i.test(out.text), 'no arch invite');
    assert(!/What should he learn next/i.test(out.text), 'no learn-next');
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
