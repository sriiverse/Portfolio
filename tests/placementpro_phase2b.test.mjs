/**
 * Phase 2B — Placement Pro+ CODE-PROVEN facet regressions.
 * Run: node tests/placementpro_phase2b.test.mjs
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
  PLACEMENTPRO_FACETS,
  matchPlacementProFacet,
} from '../src/assistant/placementproKnowledge.js';
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

async function render(q, memory = {
  turnCount: 1,
  turns: [],
  hasUsedPhrase: () => false,
  markPhraseUsed: () => {},
}) {
  const questionFrame = buildQuestionFrame(q, { memory });
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
    memory,
    visitorProfile: { type: 'unknown' },
  });
}

const REQUIRED_FACETS = [
  'purpose',
  'user_flow',
  'data_flow.profile',
  'data_flow.dashboard',
  'architecture',
  'ai_model',
  'skill_gap',
  'roadmap_generation',
  'prerequisite_logic',
  'company_matching',
  'api_surface',
  'database',
  'authentication',
  'caching',
  'validation',
  'failure_modes',
  'limitations',
  'deployment',
  'explicit_unknowns',
];

test('all justified facets exist', () => {
  const ids = new Set(PLACEMENTPRO_FACETS.map((f) => f.facet));
  for (const facet of REQUIRED_FACETS) {
    assert(ids.has(facet), `missing facet ${facet}`);
  }
});

test('CODE-PROVEN confidence is preserved', () => {
  for (const f of PLACEMENTPRO_FACETS) {
    assert(f.confidence === 'documented' || f.confidence === 'unknown', `${f.id} confidence`);
    if (f.facet === 'explicit_unknowns') {
      assert(f.confidence === 'unknown', 'unknowns must be unknown');
    } else {
      assert(f.confidence === 'documented', `${f.id} must stay documented, not inferred`);
    }
  }
});

test('explicit unknowns exist', () => {
  const unk = PLACEMENTPRO_FACETS.find((f) => f.facet === 'explicit_unknowns');
  assert(unk, 'explicit_unknowns facet');
  assert(/why Flask/i.test(unk.text), 'flask unknown');
  assert(/MiniLM/i.test(unk.text), 'minilm unknown');
  assert(/NetworkX/i.test(unk.text), 'networkx unknown');
  assert(/hardest/i.test(unk.text), 'hardest unknown');
});

test('content.js no longer claims resume parser / LLM stack / persistent progress', () => {
  const pp = PROJECTS.find((p) => p.id === 'placementpro');
  assert(pp, 'placementpro project');
  assert(!pp.stack.includes('LLMs'), 'stack must not list LLMs as implementation');
  assert(pp.stack.includes('React') && pp.stack.includes('TypeScript'), 'React/TS on stack');
  assert(/github.com\/sriiverse\/Placement-Pro/i.test(String(pp.repo || '')), 'canonical repo');
  const blob = `${pp.problem} ${pp.solution} ${pp.features.map((f) => `${f.title} ${f.desc}`).join(' ')} ${pp.decisions.join(' ')}`;
  assert(!/resume analysis/i.test(blob), 'no Resume Analysis feature');
  assert(!/parse and evaluate the resume/i.test(blob), 'no resume parse claim');
  assert(!/real resume/i.test(blob), 'no real-resume claim');
  assert(!/shift as detected gaps close/i.test(blob), 'no adaptive stored-gap claim');
  assert(!/measurable progress over time/i.test(blob), 'no persistent progress tracking');
});

const CASES = [
  {
    q: 'How does Placement Pro+ generate my roadmap?',
    must: [/deterministic|template/i, /12 week/i, /not persisted|React state/i],
    ban: [/gemini|groq|openai/i, /AI-generated roadmap/i, /five-layer/i],
    task: 'placementpro_detail',
  },
  {
    q: 'What model does Placement Pro+ use?',
    must: [/all-MiniLM-L6-v2|MiniLM/i, /cosine/i],
    ban: [/gemini-flash|Groq llama/i],
    task: 'placementpro_detail',
  },
  {
    q: 'Does Placement Pro+ actually use a knowledge graph?',
    must: [/networkx|DiGraph/i, /shortest_path|shortest path/i, /Programming Logic/i],
    ban: [/five-layer/i],
    task: 'placementpro_detail',
  },
  {
    q: 'How does skill-gap analysis work in Placement Pro+?',
    must: [/0\.60/, /networkx\.DiGraph/, /nx\.shortest_path/, /no resume parser/i],
    ban: [/parses the resume against/i, /semantic portfolio content/i],
    task: 'placementpro_detail',
  },
  {
    q: 'What data does Placement Pro+ use?',
    must: [/profile|skills|CGPA/i],
    ban: [/resume-file parser|parses the resume/i],
    task: 'placementpro_detail',
  },
  {
    q: 'How is the roadmap stored in Placement Pro+?',
    must: [/not persisted in SQL|React state/i],
    ban: [/roadmap history is stored in postgres/i],
    task: 'placementpro_detail',
  },
  {
    q: 'How does authentication work in Placement Pro+?',
    must: [/JWT/i, /bcrypt/i, /sessionStorage/i],
    ban: [/silently rotating tokens on 401/i],
    task: 'placementpro_detail',
  },
  {
    q: 'What database does Placement Pro+ use?',
    must: [/SQLite/i, /SQLAlchemy/i],
    ban: [/definitely uses production Postgres/i],
    task: 'placementpro_detail',
  },
  {
    q: 'Does Placement Pro+ parse resumes?',
    must: [/no resume parser/i],
    ban: [/parse and evaluate the resume/i],
    task: 'placementpro_detail',
  },
  {
    q: 'Does Placement Pro+ use an LLM?',
    must: [/does not use Gemini|not a chat model|MiniLM/i],
    ban: [/Gemini\/Groq generate the roadmap/i],
    task: 'placementpro_detail',
  },
  {
    q: 'What happens when MiniLM fails in Placement Pro+?',
    must: [/exact string/i],
    ban: [/five-layer/i],
    task: 'placementpro_detail',
  },
  {
    q: 'How does company matching work in Placement Pro+?',
    must: [/in-memory|10 companies/i, /top 6/i],
    ban: [/live job-board API integration is used/i],
    task: 'placementpro_detail',
  },
  {
    q: 'Why did you choose Flask for Placement Pro+?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I chose Flask because/i, /five-layer/i],
    task: 'placementpro_unknown',
  },
  {
    q: 'Why MiniLM for Placement Pro+?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I chose MiniLM because/i],
    task: 'placementpro_unknown',
  },
  {
    q: 'What was the hardest part of building Placement Pro+?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/resume-anchored|If parsing is weak/i],
    task: 'placementpro_unknown',
  },
  {
    q: 'What would you improve next about Placement Pro+?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I would rebuild/i],
    task: 'placementpro_unknown',
  },
];

for (const c of CASES) {
  test(`classify: ${c.q.slice(0, 56)}…`, () => {
    const frame = buildQuestionFrame(c.q, {});
    const r = classifyReasoningStrategy(c.q, { questionFrame: frame, memory: {} });
    assert(r.task === c.task, `expected ${c.task}, got ${r.task}`);
    assert(r.task !== 'project_overview', 'must not be overview');
    assert(r.task !== 'probe_hardest', 'must not use stale probe_hardest');
    const text = synthesizeReasoning(r, c.q, { questionFrame: frame, memory: {} });
    for (const re of c.must) assert(re.test(text), `missing ${re} in: ${text.slice(0, 220)}`);
    for (const re of (c.ban || [])) assert(!re.test(text), `banned ${re}`);
  });
}

test('follow-up: overview → How does it work? stays on Placement Pro+', () => {
  const mem = {
    lastProject: 'placementpro',
    lastCommitment: { projectId: 'placementpro', name: 'Placement Pro+', task: 'project_overview' },
    activeMode: 'project_overview',
  };
  const q = 'How does it work? Placement Pro+';
  const frame = buildQuestionFrame(q, { focusProject: 'placementpro', memory: mem });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: mem });
  assert(r.task === 'placementpro_detail', `task=${r.task}`);
  assert(r.task !== 'arch_why', 'not generic five-layer');
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: mem });
  assert(/Flask|React|MiniLM|NetworkX|\/api/i.test(text), `expected PP mechanics: ${text.slice(0, 200)}`);
  assert(!/five-layer topology/i.test(text), 'no generic five-layer');
});

test('follow-up: roadmap → How is that generated?', () => {
  const mem = {
    lastProject: 'placementpro',
    lastCommitment: { projectId: 'placementpro', name: 'Placement Pro+', task: 'placementpro_detail' },
    activeMode: 'placementpro_detail',
  };
  const q = 'How is that generated? Placement Pro+';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'placementpro_detail', `task=${r.task}`);
  assert(r.focus === 'pp-roadmap', `focus=${r.focus}`);
  const text = synthesizeReasoning(r, q, { questionFrame: {}, memory: mem });
  assert(/template|12 week/i.test(text), text.slice(0, 180));
});

test('follow-up: skill gap → What model does that use?', () => {
  const mem = {
    lastProject: 'placementpro',
    lastCommitment: { projectId: 'placementpro', name: 'Placement Pro+', task: 'placementpro_detail' },
    activeMode: 'placementpro_detail',
  };
  const q = 'What model does that use? Placement Pro+';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'placementpro_detail', `task=${r.task}`);
  assert(r.focus === 'pp-ai-model', `focus=${r.focus}`);
  const text = synthesizeReasoning(r, q, { questionFrame: {}, memory: mem });
  assert(/MiniLM/i.test(text), text.slice(0, 180));
});

test('follow-up: Why did you choose that? → unknown', () => {
  const mem = {
    lastProject: 'placementpro',
    lastCommitment: { projectId: 'placementpro', name: 'Placement Pro+', task: 'placementpro_detail' },
    activeMode: 'placementpro_detail',
  };
  const q = 'Why did you choose that? Placement Pro+';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'placementpro_unknown', `task=${r.task}`);
});

test('brochure suppression: engineering detail is not a project card', async () => {
  const qs = [
    'How does Placement Pro+ generate my roadmap?',
    'Walk me through the skill-gap flow in Placement Pro+.',
    'What happens under the hood in Placement Pro+?',
    'How does authentication work in Placement Pro+?',
    'What database does Placement Pro+ use?',
  ];
  for (const q of qs) {
    const out = await render(q);
    assert(out.kind !== 'project-card', `${q} kind=${out.kind}`);
    assert(
      out?.payload?._portfolioIntelligence === 'placementpro_detail'
      || out?.payload?._portfolioIntelligence === 'placementpro_unknown',
      `${q} → ${out?.payload?._portfolioIntelligence}`,
    );
    assert(!/Resume Analysis/i.test(out.text), `stale brochure copy in ${q}`);
  }
});

test('broad overview may still be overview/brochure-shaped', () => {
  const q = 'Tell me about Placement Pro+';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, {}), memory: {} });
  assert(r.task === 'project_overview' || r.task === 'placementpro_detail', `got ${r.task}`);
  if (r.task === 'placementpro_detail') {
    const facet = matchPlacementProFacet(q);
    assert(facet?.facet === 'purpose' || facet?.depth === 'overview', 'overview-ish facet only');
  }
});

test('end-to-end cases answer without menus', async () => {
  for (const c of CASES) {
    const out = await render(c.q);
    assert(
      out?.payload?._portfolioIntelligence === c.task,
      `${c.q.slice(0, 40)} → ${out?.payload?._portfolioIntelligence}`,
    );
    for (const re of c.must) assert(re.test(out.text), `e2e missing ${re}`);
    for (const re of (c.ban || [])) assert(!re.test(out.text), `e2e banned ${re}`);
    assert(!/Interested in why I chose this architecture/i.test(out.text), 'no arch invite');
  }
});

test('skill-gap retrieve prefers project-detail facets', () => {
  const q = 'Walk me through the skill-gap flow in Placement Pro+.';
  const hits = retrieveScoped(q, { limit: 5, questionType: 'ProjectExplanation' });
  assert(hits.length, 'hits');
  assert(hits[0].doc.kind === 'project-detail', `top kind ${hits[0].doc.kind}`);
  assert(hits[0].doc.projectId === 'placementpro', `projectId ${hits[0].doc.projectId}`);
});

test('generate() preserves skill-gap technical tokens', async () => {
  const out = await render('How does skill-gap analysis work?');
  assert(out?.payload?._portfolioIntelligence === 'placementpro_detail', `intel=${out?.payload?._portfolioIntelligence}`);
  assert(out.text.includes('0.60'), `lost 0.60: ${out.text.slice(0, 280)}`);
  assert(out.text.includes('networkx.DiGraph'), `lost networkx.DiGraph: ${out.text.slice(0, 280)}`);
  assert(out.text.includes('nx.shortest_path'), `lost nx.shortest_path: ${out.text.slice(0, 280)}`);
  assert(!/0\.\s+60/.test(out.text), 'decimal split');
  assert(!/networkx\.\s+DiGraph/.test(out.text), 'DiGraph split');
  assert(!/nx\.\s+shortest_path/.test(out.text), 'shortest_path split');
  assert(!/semantic portfolio content/i.test(out.text), 'embedding scrubbed to portfolio content');
});

test('unscoped authentication routes to Placement Pro+ auth facet', async () => {
  const qs = [
    'How does authentication work?',
    'How does auth work?',
    'How does login work?',
    'How are users authenticated?',
    'How are users logged in?',
  ];
  for (const q of qs) {
    const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, {}), memory: {} });
    assert(r.task === 'placementpro_detail', `${q} task=${r.task}`);
    assert(r.focus === 'pp-auth', `${q} focus=${r.focus}`);
    const out = await render(q);
    assert(out?.payload?._portfolioIntelligence === 'placementpro_detail', `${q} intel=${out?.payload?._portfolioIntelligence}`);
    assert(/JWT|bcrypt|sessionStorage/i.test(out.text), `${q} missing auth facts`);
    assert(!/not documented in the portfolio knowledge yet/i.test(out.text), `${q} undocumented_detail leak`);
  }
});

test('unscoped auth does not steal a QueryForge-bound thread', () => {
  const mem = {
    lastProject: 'queryforge',
    lastCommitment: { projectId: 'queryforge', name: 'QueryForgeAI', task: 'queryforge_detail' },
    activeMode: 'queryforge_detail',
  };
  const q = 'How does authentication work?';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task !== 'placementpro_detail', `QF-bound auth stole PP, task=${r.task}`);
});

test('bound improve-next variants stay placementpro_unknown', () => {
  const mem = {
    lastProject: 'placementpro',
    lastCommitment: { projectId: 'placementpro', name: 'Placement Pro+', task: 'project_overview' },
    activeMode: 'project_overview',
  };
  const qs = [
    'What would you improve next?',
    'What would you change next?',
    'What would you rebuild?',
  ];
  for (const q of qs) {
    const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
    assert(r.task === 'placementpro_unknown', `${q} task=${r.task}`);
    assert(r.task !== 'weakest_area', `${q} leaked to weakest_area`);
    const text = synthesizeReasoning(r, q, { questionFrame: {}, memory: mem });
    assert(/not documented as CODE-PROVEN/i.test(text), `${q} missing unknown`);
    assert(!/Kubernetes/i.test(text), `${q} generic ops`);
    assert(!/softest public signal/i.test(text), `${q} weakest_area copy`);
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
