/**
 * Phase 2C — RepoRadarAI CODE-PROVEN facet regressions.
 * Run: node tests/reporadar_phase2c.test.mjs
 */
import { buildQuestionFrame, wantsDirectAnswerOnly } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet, retrieveScoped } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import {
  classifyReasoningStrategy,
  synthesizeReasoning,
  isEngineeringDetailQuery,
  isGenuineProjectOverviewQuery,
} from '../src/assistant/reasoning.js';
import {
  REPORADAR_FACETS,
  matchRepoRadarFacet,
} from '../src/assistant/reporadarKnowledge.js';
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
  results.push({ name, fn });
}

async function run() {
  let passed = 0;
  for (const t of results) {
    try {
      await t.fn();
      passed += 1;
      console.log(`PASS  ${t.name}`);
    } catch (err) {
      console.log(`FAIL  ${t.name}`);
      console.log(`      ${err.message || err}`);
      t.ok = false;
      t.error = String(err.message || err);
    }
  }
  const failed = results.filter((r) => r.ok === false);
  console.log(`\n${passed}/${results.length} passed`);
  if (failed.length) process.exit(1);
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
  'repository_ingestion',
  'github_integration',
  'scoring',
  'bus_factor',
  'recommendations',
  'ai_model',
  'architecture',
  'data_flow',
  'api_surface',
  'caching',
  'security',
  'privacy',
  'failure_modes',
  'limitations',
  'deployment',
  'explicit_unknowns',
];

test('all justified facets exist', () => {
  const ids = new Set(REPORADAR_FACETS.map((f) => f.facet));
  for (const facet of REQUIRED_FACETS) {
    assert(ids.has(facet), `missing facet ${facet}`);
  }
});

test('CODE-PROVEN confidence is preserved', () => {
  for (const f of REPORADAR_FACETS) {
    assert(f.confidence === 'documented' || f.confidence === 'unknown', `${f.id} confidence`);
    if (f.facet === 'explicit_unknowns') {
      assert(f.confidence === 'unknown', 'unknowns must be unknown');
    } else {
      assert(f.confidence === 'documented', `${f.id} must stay documented, not inferred`);
    }
  }
});

test('explicit unknowns exist', () => {
  const unk = REPORADAR_FACETS.find((f) => f.facet === 'explicit_unknowns');
  assert(unk, 'explicit_unknowns facet');
  assert(/Next\.js/i.test(unk.text), 'next unknown');
  assert(/Octokit/i.test(unk.text), 'octokit unknown');
  assert(/hardest/i.test(unk.text), 'hardest unknown');
  assert(/not FastAPI/i.test(unk.text), 'must not claim FastAPI');
});

test('no unsupported FastAPI/LLM facts encoded in facets', () => {
  for (const f of REPORADAR_FACETS) {
    if (f.facet === 'explicit_unknowns' || f.facet === 'architecture' || f.facet === 'ai_model' || f.facet === 'limitations' || f.facet === 'privacy') {
      continue;
    }
    assert(!/\buses FastAPI\b/i.test(f.text), `${f.id} must not claim FastAPI`);
    assert(!/Gemini|Groq llama|OpenAI API|Ollama/i.test(f.text), `${f.id} must not claim LLMs as implementation`);
  }
  const ai = REPORADAR_FACETS.find((f) => f.facet === 'ai_model');
  assert(/does not use a generative AI model/i.test(ai.text), 'ai_model denial');
  const arch = REPORADAR_FACETS.find((f) => f.facet === 'architecture');
  assert(/Next\.js 14/i.test(arch.text) && /No separate Python/i.test(arch.text), 'arch next not python');
});

test('content.js no longer claims FastAPI/LLM/code X-ray', () => {
  const rr = PROJECTS.find((p) => p.id === 'reporadar');
  assert(rr, 'reporadar project');
  assert(!rr.stack.includes('FastAPI'), 'stack must not list FastAPI');
  assert(!rr.stack.includes('Python'), 'stack must not list Python');
  assert(!rr.stack.includes('LLMs'), 'stack must not list LLMs');
  assert(rr.stack.includes('Next.js') && rr.stack.includes('React'), 'Next/React on stack');
  const blob = `${rr.title} ${rr.tagline} ${rr.problem} ${rr.solution} ${rr.features.map((f) => `${f.title} ${f.desc}`).join(' ')} ${rr.decisions.join(' ')}`;
  assert(!/x-ray/i.test(blob), 'no x-ray');
  assert(!/auto-generate docs/i.test(blob), 'no gen docs');
  assert(!/conversational explanations of what the repo does/i.test(blob), 'no conversational code');
  assert(!/FastAPI backend/i.test(blob), 'no fastapi backend claim');
});

const CASES = [
  {
    q: 'How does RepoRadar analyze a repository?',
    must: [/\/api\/analyze|Octokit|metadata/i, /not.{0,40}source files|no git clone|does not read/i],
    ban: [/FastAPI \+ Uvicorn/i, /gemini-flash/i, /five-layer/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar clone the repo?',
    must: [/no git clone|There is no git clone/i],
    ban: [/clones the repository into/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar use an LLM?',
    must: [/does not use a generative AI model/i],
    ban: [/Gemini\/Groq/i, /primary model when configured/i],
    task: 'reporadar_detail',
  },
  {
    q: 'What model does RepoRadar use?',
    must: [/does not use a generative AI model/i],
    ban: [/gemini-flash-latest/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar use RAG?',
    must: [/no Gemini|does not use a generative|RAG/i],
    ban: [/vector database is used/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar use embeddings?',
    must: [/does not use a generative|no Gemini|embeddings pipeline/i],
    ban: [/all-MiniLM-L6-v2/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar use FastAPI?',
    must: [/Next\.js 14/i, /No separate Python|not FastAPI/i],
    ban: [/Shipped on Vercel with a FastAPI backend/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar analyze source code?',
    must: [/no git clone|no source-file ingestion|metadata-based/i],
    ban: [/AST parsing of the target/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does RepoRadar clone the repository?',
    must: [/no git clone/i],
    ban: [/git clone https/i],
    task: 'reporadar_detail',
  },
  {
    q: 'How does RepoRadar analyze architecture?',
    must: [/does not|no target-repo architecture|not understand the internal architecture/i],
    ban: [/architecture visualization of the target source/i],
    task: 'reporadar_detail',
  },
  {
    q: 'How is the health score calculated?',
    must: [/0–100|0-100/, /Activity/, /50 commits/i],
    ban: [/is an ML prediction|neural network/i],
    task: 'reporadar_detail',
  },
  {
    q: 'How does bus factor work?',
    must: [/50%/, /LOW/, /CRITICAL/],
    ban: [/is a learned model/i],
    task: 'reporadar_detail',
  },
  {
    q: 'How does GitHub integration work?',
    must: [/octokit/i, /listCommits|365/i, /1000/],
    ban: [/tree, file, or blob APIs are used to read source/i],
    task: 'reporadar_detail',
  },
  {
    q: 'What data does RepoRadar fetch?',
    must: [/repos\.get|Octokit/i],
    ban: [/fetches file contents|reads file contents/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Does it analyze the source code? RepoRadar',
    must: [/no git clone|source-file ingestion/i],
    ban: [/parses every file/i],
    task: 'reporadar_detail',
  },
  {
    q: 'What happens with private repositories?',
    must: [/404|not found|public/i],
    ban: [/OAuth login for private GitHub apps/i],
    task: 'reporadar_detail',
  },
  {
    q: 'How is repository data stored?',
    must: [/in-memory Map|Zustand|no durable database/i],
    ban: [/Postgres stores analysis history/i],
    task: 'reporadar_detail',
  },
  {
    q: 'Why did you choose Next.js?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I chose Next\.js because/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'Why these scoring formulas? RepoRadar',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I picked the 50-commit cap because/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'What was the hardest part of building RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/layered intelligence that stays useful/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'What trade-offs did you make in RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I traded FastAPI for/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'What did you learn building RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/lesson I learned was/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'What would you improve about RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I would add RAG next/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'Why Vercel for RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I chose Vercel because/i],
    task: 'reporadar_unknown',
  },
  {
    q: 'Why Octokit for RepoRadar?',
    must: [/not documented as CODE-PROVEN|will not invent/i],
    ban: [/I chose Octokit because/i],
    task: 'reporadar_unknown',
  },
];

for (const c of CASES) {
  test(`classify: ${c.q.slice(0, 64)}`, () => {
    const frame = buildQuestionFrame(c.q, {});
    const r = classifyReasoningStrategy(c.q, { questionFrame: frame, memory: {} });
    assert(r.task === c.task, `expected ${c.task}, got ${r.task}`);
    assert(r.task !== 'project_overview', 'must not be overview');
    assert(r.task !== 'queryforge_detail', 'must not steal QueryForge');
    assert(r.task !== 'placementpro_detail', 'must not steal Placement Pro+');
    assert(r.task !== 'why_fastapi', 'must not generic FastAPI');
    const text = synthesizeReasoning(r, c.q, { questionFrame: frame, memory: {} });
    for (const re of c.must) assert(re.test(text), `missing ${re} in: ${text.slice(0, 240)}`);
    for (const re of (c.ban || [])) assert(!re.test(text), `banned ${re}`);
  });
}

test('follow-up: overview → How does it work? stays on RepoRadar', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'project_overview' },
    activeMode: 'project_overview',
  };
  const q = 'How does it work? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_detail', `task=${r.task}`);
  assert(r.task !== 'arch_why', 'not generic five-layer');
  const text = synthesizeReasoning(r, q, { questionFrame: {}, memory: mem });
  assert(/\/api\/analyze|Octokit|Zustand|metadata/i.test(text), `expected RR mechanics: ${text.slice(0, 200)}`);
  assert(!/five-layer topology/i.test(text), 'no generic five-layer');
});

test('follow-up: scoring → How is that calculated?', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'reporadar_detail' },
    activeMode: 'reporadar_detail',
  };
  const q = 'How is that calculated? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_detail', `task=${r.task}`);
  assert(r.focus === 'rr-scoring', `focus=${r.focus}`);
});

test('follow-up: GitHub → What does it fetch?', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'reporadar_detail' },
    activeMode: 'reporadar_detail',
  };
  const q = 'What does it fetch? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_detail', `task=${r.task}`);
  assert(r.focus === 'rr-github', `focus=${r.focus}`);
});

test('follow-up: AI → What model does that use?', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'reporadar_detail' },
    activeMode: 'reporadar_detail',
  };
  const q = 'What model does that use? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_detail', `task=${r.task}`);
  assert(r.focus === 'rr-ai-model', `focus=${r.focus}`);
  const text = synthesizeReasoning(r, q, { questionFrame: {}, memory: mem });
  assert(/does not use a generative AI model/i.test(text), text.slice(0, 180));
});

test('follow-up: architecture → Why did you choose that? → unknown', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'reporadar_detail' },
    activeMode: 'reporadar_detail',
  };
  const q = 'Why did you choose that? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_unknown', `task=${r.task}`);
});

test('follow-up: overview → What would you improve?', () => {
  const mem = {
    lastProject: 'reporadar',
    lastCommitment: { projectId: 'reporadar', name: 'RepoRadarAI', task: 'project_overview' },
    activeMode: 'project_overview',
  };
  const q = 'What would you improve next? RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, { memory: mem }), memory: mem });
  assert(r.task === 'reporadar_unknown', `task=${r.task}`);
  assert(r.task !== 'weakest_area', 'not recruiter weakest_area');
});

test('brochure suppression: engineering detail is not a project card', async () => {
  const qs = [
    'How does RepoRadar calculate health?',
    'Does it clone the repo? RepoRadar',
    'Does RepoRadar use AI?',
    'How does GitHub integration work in RepoRadar?',
    'What exactly does RepoRadar analyze?',
  ];
  for (const q of qs) {
    const out = await render(q);
    assert(out.kind !== 'project-card', `${q} kind=${out.kind}`);
    assert(
      out?.payload?._portfolioIntelligence === 'reporadar_detail'
      || out?.payload?._portfolioIntelligence === 'reporadar_unknown',
      `${q} → ${out?.payload?._portfolioIntelligence}`,
    );
    assert(!/X-ray vision/i.test(out.text), `stale brochure in ${q}`);
    assert(!/Auto-generate docs/i.test(out.text), `docs brochure in ${q}`);
  }
});

test('broad overview may still be overview/brochure-shaped', () => {
  const q = 'Tell me about RepoRadar';
  const r = classifyReasoningStrategy(q, { questionFrame: buildQuestionFrame(q, {}), memory: {} });
  assert(r.task === 'project_overview' || r.task === 'reporadar_detail', `got ${r.task}`);
  if (r.task === 'reporadar_detail') {
    const facet = matchRepoRadarFacet(q);
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
    for (const re of c.must) assert(re.test(out.text), `e2e missing ${re} in ${out.text.slice(0, 220)}`);
    for (const re of (c.ban || [])) assert(!re.test(out.text), `e2e banned ${re}`);
    assert(!/Interested in why I chose this architecture/i.test(out.text), 'no arch invite');
    assert(!/Want to explore the AI pipeline/i.test(out.text), 'no stale AI-pipeline invite');
  }
});

test('retrieve prefers project-detail facets', () => {
  const q = 'How is the health score calculated in RepoRadar?';
  const hits = retrieveScoped(q, { limit: 5, questionType: 'ProjectExplanation' });
  assert(hits.length, 'hits');
  assert(hits[0].doc.kind === 'project-detail', `top kind ${hits[0].doc.kind}`);
  assert(hits[0].doc.projectId === 'reporadar', `projectId ${hits[0].doc.projectId}`);
});

test('generate() preserves Next.js and /api/analyze tokens', async () => {
  const out = await render('How is RepoRadar structured?');
  assert(out?.payload?._portfolioIntelligence === 'reporadar_detail', `intel=${out?.payload?._portfolioIntelligence}`);
  assert(/Next\.js 14/.test(out.text), `lost Next.js 14: ${out.text.slice(0, 280)}`);
  assert(out.text.includes('/api/analyze') || /GET \/api\/analyze/.test(out.text), `lost /api/analyze: ${out.text.slice(0, 280)}`);
  assert(!/semantic portfolio content/i.test(out.text), 'impl leak rewrite');
});

test('generate() keeps RAG/embeddings denial vocabulary', async () => {
  const out = await render('Does RepoRadar use an LLM?');
  assert(out?.payload?._portfolioIntelligence === 'reporadar_detail');
  assert(/does not use a generative AI model/i.test(out.text), out.text.slice(0, 280));
  assert(/embeddings pipeline/i.test(out.text) && /\bRAG\b/.test(out.text), `lost denial terms: ${out.text.slice(0, 320)}`);
  assert(!/portfolio content pipeline/i.test(out.text), 'embeddings rewritten');
  assert(!/portfolio reasoning/i.test(out.text), 'RAG rewritten');
});

test('engineering vs overview helpers', () => {
  assert(isEngineeringDetailQuery('How is the health score calculated?'), 'score is detail');
  assert(isGenuineProjectOverviewQuery('Tell me about RepoRadarAI'), 'genuine overview');
  assert(!isGenuineProjectOverviewQuery('How does RepoRadar analyze a repository?'), 'analyze not overview');
  assert(!wantsDirectAnswerOnly('How does RepoRadar analyze a repository?'));
});

await run();
