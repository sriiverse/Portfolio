/**
 * Regression: question aspect routing, grounded answers, retrieval scope,
 * follow-ups, and brochure/card duplication.
 * Run: node tests/answer_aspect.test.mjs
 */
import { buildQuestionFrame, classifyAnswerAspect, suggestFollowupAngles } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet, retrieveScoped } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import { classifyReasoningStrategy, synthesizeReasoning } from '../src/assistant/reasoning.js';
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

const memoryStub = {
  turnCount: 1,
  turns: [],
  hasUsedPhrase: () => false,
  markPhraseUsed: () => {},
  lastProject: null,
  lastCommitment: null,
};

async function render(q, memory = memoryStub) {
  const questionFrame = buildQuestionFrame(q, { memory });
  const entities = resolveEntities(q);
  const evidence = buildEvidenceSet(q, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  return getProvider().generate(q, {
    questionFrame,
    entities,
    evidence,
    confidence,
    plan,
    memory,
    visitorProfile: { type: 'unknown' },
    focusProject: memory.lastProject,
  });
}

test('stack question is not swallowed by the project name', () => {
  const q = 'What did he use to build QueryForge?';
  assert(classifyAnswerAspect(q) === 'stack', `aspect ${classifyAnswerAspect(q)}`);
  const frame = buildQuestionFrame(q, {});
  assert(frame.questionType === 'TechnologyExplanation', `type ${frame.questionType}`);
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  assert(r.aspect === 'stack', `aspect on route ${r.aspect}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(text && text.length > 40, 'empty stack answer');
  assert(/React/i.test(text) && /Vite/i.test(text), `frontend missing: ${text}`);
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), `backend missing: ${text}`);
  assert(/Gemini/i.test(text) && /Groq/i.test(text), `providers missing: ${text}`);
  assert(/heuristic|no provider key|no LLM key/i.test(text), 'demo heuristic missing');
  assert(/WebSocket/i.test(text), 'CLI agent missing');
  assert(/simulat/i.test(text) || /no database|database driver/i.test(text), 'limitation missing');
  assert(!/^Verified implementation architecture/i.test(text.trim()), 'audit lead');
  assert(!/five-layer/i.test(text), 'portfolio diagram');
  assert(!/I designed the architecture/i.test(text), 'false personal design claim');
});

test('motivation uses the documented problem, not the stack', () => {
  const q = 'What was the motivation behind building QueryForgeAI?';
  assert(classifyAnswerAspect(q) === 'motivation', classifyAnswerAspect(q));
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  assert(r.aspect === 'motivation', `aspect ${r.aspect}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/Writing efficient SQL is hard/i.test(text), `problem missing: ${text}`);
  assert(/natural language/i.test(text), `benefit missing: ${text}`);
  assert(!/^Verified implementation/i.test(text.trim()), 'opens as architecture audit');
  assert(!/React \+ Vite/.test(text), 'stack dump');
  assert(/not documented/i.test(text), 'should qualify undocumented framework motives');
  assert(!/because FastAPI is/i.test(text), 'invented framework motive');
});

test('how QueryForge was built uses its architecture, not the five-layer diagram', () => {
  const q = 'How is QueryForge built?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  assert(r.task !== 'arch_why', 'five-layer route');
  assert(r.focus === 'qf-architecture', `focus ${r.focus}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(/Gemini/i.test(text), text);
  assert(/not Flask|outdated/i.test(text), 'Flask correction');
  assert(!/five-layer/i.test(text), text);
  assert(!/I designed the architecture as a deliberate/i.test(text), text);
  assert(!/PostgreSQL · MongoDB/i.test(text), 'portfolio database layer');
});

test('Flask question stays a correction, not a silent miss', () => {
  const q = 'Is QueryForgeAI built with Flask?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/FastAPI/i.test(text), text);
  assert(/not Flask|outdated|inspected implementation/i.test(text), text);
  assert(!/Flask keeps the AI/i.test(text), text);
});

test('ordinary stack question does not render a brochure card', async () => {
  const q = 'Tech stack for QueryForgeAI?';
  const out = await render(q);
  assert(out.kind !== 'project-card', `kind ${out.kind} would also append the tabbed card`);
  assert(!/## QueryForgeAI — Technology Stack/.test(out.text), 'brochure heading');
  assert(!/### 🏗️ How It's Built/.test(out.text), 'brochure architecture section');
  assert(/FastAPI/i.test(out.text) && /React/i.test(out.text), out.text);
  assert(out.payload?._portfolioIntelligence === 'queryforge_detail', out.payload?._portfolioIntelligence);
});

test('explicit walkthrough still uses the project card', async () => {
  const out = await render('Walk me through QueryForgeAI');
  assert(out.kind === 'project-card', `walkthrough kind ${out.kind}`);
  assert(/What It Does|Problem:/i.test(out.text), 'walkthrough body');
});

test('API question distinguishes the two projects instead of pasting both architectures', async () => {
  const q = 'Did he use APIs in QueryForge and Placement Pro?';
  const frame = buildQuestionFrame(q, {});
  assert(classifyAnswerAspect(q) === 'api', classifyAnswerAspect(q));
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'cross_project_compare', `task ${r.task}`);
  assert(r.lens === 'api', `lens ${r.lens}`);
  const out = await render(q);
  const text = out.text;
  assert(/QueryForgeAI/i.test(text) && /Placement Pro/i.test(text), 'both projects');
  assert(/Gemini/i.test(text), 'QueryForge external provider');
  assert(/generate-sql|\/analyze/i.test(text), 'QueryForge internal route');
  assert(/Flask/i.test(text) && /\/api/i.test(text), 'Placement internal API');
  assert(/does not use Gemini|not a chat model|MiniLM/i.test(text), 'Placement is not a Gemini app');
  assert(!/React \+ Vite\/React Router frontend on Netlify/i.test(text), 'architecture essay pasted');
  assert(!/Verified implementation architecture/i.test(text), 'audit lead');
  assert(!/five-layer/i.test(text), text);
  assert(!/Interested in why I chose/i.test(text), 'undocumented motive invite');
  assert(text.length < 1600, `still an essay (${text.length} chars)`);
});

test('QueryForge architecture answer is project-specific and not a card', async () => {
  const q = 'Explain the architecture of QueryForgeAI.';
  const hits = retrieveScoped(q, { limit: 4, questionType: 'ArchitectureExplanation' });
  assert(hits.length, 'no hits');
  assert(/queryforge/i.test(hits[0].doc.projectId || hits[0].doc.id), `top doc ${hits[0].doc.id}`);
  assert(!/reporadar/i.test(hits[0].doc.id), `RepoRadar outranked QueryForge: ${hits[0].doc.id}`);
  const out = await render(q);
  assert(out.kind !== 'project-card', `kind ${out.kind}`);
  assert(/FastAPI/i.test(out.text) && /Uvicorn/i.test(out.text), out.text);
  assert(/Gemini/i.test(out.text) && /Groq/i.test(out.text), out.text);
  assert(/WebSocket/i.test(out.text), out.text);
  assert(/no database|does not connect|no live database|database driver/i.test(out.text), out.text);
  assert(!/^Verified implementation architecture/i.test(out.text.trim()), out.text.slice(0, 80));
  assert(!/GET \/api\/analyze/i.test(out.text), 'RepoRadar route leaked');
  assert(!/## QueryForgeAI/.test(out.text), 'brochure heading');
});

test('RepoRadar architecture does not import QueryForge', async () => {
  const q = 'Explain the architecture of RepoRadar.';
  const hits = retrieveScoped(q, { limit: 4, questionType: 'ArchitectureExplanation' });
  assert(/reporadar/i.test(hits[0].doc.projectId || hits[0].doc.id), `top ${hits[0].doc.id}`);
  const out = await render(q);
  assert(/Next\.js/i.test(out.text), out.text);
  assert(/\/api\/analyze/i.test(out.text), out.text);
  assert(/No separate Python|not a Python\/FastAPI/i.test(out.text), out.text);
  assert(!/generate-sql/i.test(out.text), 'QueryForge route leaked');
  assert(!/React \+ Vite\/React Router/i.test(out.text), 'QueryForge frontend leaked');
  assert(out.kind !== 'project-card', out.kind);
});

test('follow-ups change dimension and do not ask for undocumented motives', () => {
  const q = 'What did he use to build QueryForge?';
  const angles = suggestFollowupAngles(q, 'QueryForgeAI');
  assert(angles && angles.length >= 2, 'missing angles');
  const joined = angles.join(' | ');
  assert(!/why I chose|hardest engineering/i.test(joined), joined);
  assert(!/Architecture of QueryForgeAI/i.test(joined), joined);
  assert(!/Tech stack for QueryForgeAI/i.test(joined), joined);
  assert(/request|external services/i.test(joined), joined);

  const invite = pickContextualInvite({
    query: q,
    questionFrame: { rawQuery: q },
    payload: { _portfolioIntelligence: 'project_overview' },
    memory: { turns: [], lastProject: 'queryforge' },
  }, 'Answer');
  assert(invite, 'expected an invite');
  assert(!/why I chose|hardest engineering problem I solved/i.test(invite), invite);
});

test('a follow-up about external services stays on QueryForge APIs', () => {
  const q = 'Which external services does QueryForgeAI call?';
  assert(classifyAnswerAspect(q) === 'api', classifyAnswerAspect(q));
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  assert(r.aspect === 'api', r.aspect);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/Gemini/i.test(text) && /Groq/i.test(text), text);
  assert(/generate-sql|\/analyze/i.test(text), text);
  assert(/heuristic/i.test(text), text);
  assert(!/five-layer/i.test(text), text);
  assert(!/Placement Pro/i.test(text), 'other project pasted');
});

function boundMemory(projectId, task = 'queryforge_detail') {
  return {
    turnCount: 2,
    turns: [],
    hasUsedPhrase: () => false,
    markPhraseUsed: () => {},
    lastProject: projectId,
    lastCommitment: { projectId, task },
    activeMode: task,
  };
}

test('How does QueryForgeAI work uses the data-flow facet', async () => {
  const q = 'How does QueryForgeAI work?';
  assert(classifyAnswerAspect(q) === 'flow', classifyAnswerAspect(q));
  const frame = buildQuestionFrame(q, {});
  assert(frame.questionType === 'ProjectExplanation', frame.questionType);
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', `task ${r.task}`);
  assert(r.focus === 'qf-dataflow-overview', `focus ${r.focus}`);
  assert(r.aspect === 'flow', r.aspect);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/schema_def|natural-language/i.test(text), text);
  assert(/\/analyze|SQL\/pipeline|pasted SQL/i.test(text), text);
  assert(/no live DB|No live DB/i.test(text), text);
  assert(/EXPLAIN ANALYZE|real EXPLAIN/i.test(text), text);
  assert(text.trim().length > 80, 'empty');
  const out = await render(q);
  assert(out.text.trim().length > 80, 'pipeline empty');
  assert(out.kind !== 'project-card', out.kind);
});

test('How does QueryForge work uses the same data-flow facet', () => {
  const q = 'How does QueryForge work?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.focus === 'qf-dataflow-overview', r.focus);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/schema_def/i.test(text) && /EXPLAIN/i.test(text), text);
  assert(text.trim().length > 80, 'empty');
});

test('How does QueryForgeAI actually work stays on the same flow', () => {
  const q = 'How does QueryForgeAI actually work?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.focus === 'qf-dataflow-overview', r.focus);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/generate-sql|schema_def/i.test(text), text);
  assert(/no real EXPLAIN|EXPLAIN ANALYZE/i.test(text), text);
});

test('How does this work stays on the bound QueryForge flow', () => {
  const q = 'How does this work?';
  const memory = boundMemory('queryforge', 'project_overview');
  const frame = buildQuestionFrame(q, { memory, focusProject: 'queryforge' });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.focus === 'qf-dataflow-overview', `focus ${r.focus}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory });
  assert(/schema_def/i.test(text), text);
  assert(/No live DB connection|no live DB/i.test(text), text);
  assert(!/Placement Pro/i.test(text), text);
});

test('how-it-works questions resolve Placement Pro and RepoRadar separately', () => {
  const placement = 'How does Placement Pro+ work?';
  const placementRoute = classifyReasoningStrategy(placement, { questionFrame: buildQuestionFrame(placement, {}), memory: {} });
  assert(placementRoute.task === 'placementpro_detail', placementRoute.task);
  assert(placementRoute.focus === 'pp-dataflow-dashboard', placementRoute.focus);
  const placementText = synthesizeReasoning(placementRoute, placement, {});
  assert(/skill-gap|roadmap/i.test(placementText), placementText);
  assert(!/generate-sql/i.test(placementText), placementText);

  const radar = 'How does RepoRadar work?';
  const radarRoute = classifyReasoningStrategy(radar, { questionFrame: buildQuestionFrame(radar, {}), memory: {} });
  assert(radarRoute.task === 'reporadar_detail', radarRoute.task);
  assert(radarRoute.focus === 'rr-user-flow', radarRoute.focus);
  const radarText = synthesizeReasoning(radarRoute, radar, {});
  assert(/GitHub|\/api\/analyze/i.test(radarText), radarText);
  assert(!/generate-sql/i.test(radarText), radarText);

  const assistant = 'How does the assistant work?';
  const assistantRoute = classifyReasoningStrategy(assistant, { questionFrame: buildQuestionFrame(assistant, {}), memory: {} });
  assert(assistantRoute.task !== 'queryforge_detail', assistantRoute.task);
});

test('Flask yes/no leads with no and does not dump the stack', () => {
  const q = 'Is QueryForgeAI built with Flask?';
  assert(classifyAnswerAspect(q) === 'yesno', classifyAnswerAspect(q));
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.aspect === 'yesno', r.aspect);
  assert(r.focus === 'qf-architecture', r.focus);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/^No\b/.test(text.trim()), text);
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(/not Flask|outdated/i.test(text), text);
  assert(!/Optional failover: Groq/i.test(text), text);
  assert(!/WebSocket/i.test(text), text);
  assert(text.length < 500, `still a stack dump (${text.length})`);
});

test('FastAPI yes/no leads with yes', () => {
  const q = 'Does QueryForgeAI use FastAPI?';
  assert(classifyAnswerAspect(q) === 'yesno', classifyAnswerAspect(q));
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.aspect === 'yesno', r.aspect);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/^Yes\b/.test(text.trim()), text);
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(!/Optional failover: Groq/i.test(text), text);
  assert(text.length < 400, `too long (${text.length})`);
});

test('difference between QueryForge and Placement Pro is a short contrast', () => {
  const q = 'What is the difference between QueryForgeAI and Placement Pro+?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'cross_project_compare', r.task);
  assert(r.lens === 'differentiate', r.lens);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/SQL\/Mongo query generator/i.test(text), text);
  assert(/placement-preparation|skill-gap|roadmap/i.test(text), text);
  assert(/FastAPI|Uvicorn/i.test(text), text);
  assert(/Flask/i.test(text), text);
  assert(!/Framer Motion/i.test(text), text);
  assert(!/Verified implementation architecture/i.test(text), text);
  assert(text.length < 1400, `still an essay (${text.length})`);
});

test('an explicit architecture comparison keeps the longer detail', () => {
  const q = 'Compare the architecture of QueryForgeAI and Placement Pro+';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'cross_project_compare', r.task);
  assert(r.lens === 'architecture', `lens ${r.lens}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/FastAPI/i.test(text) && /Flask/i.test(text), text);
  assert(text.length > 700, `architecture detail was shortened (${text.length})`);
});

test('Why after an architecture answer does not invent a ranking', () => {
  const q = 'Why?';
  const memory = boundMemory('queryforge', 'queryforge_detail');
  memory.lastCommitment.focus = 'qf-architecture';
  const frame = buildQuestionFrame(q, { memory, focusProject: 'queryforge' });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory });
  assert(r.task === 'queryforge_unknown', `task ${r.task}`);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory });
  assert(/not documented|do not establish|will not invent/i.test(text), text);
  assert(!/strongest demo/i.test(text), text);
  assert(!/what we were ranking/i.test(text), text);
});

test('Why with no referent asks for clarification', () => {
  const q = 'Why?';
  const frame = buildQuestionFrame(q, { memory: memoryStub });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: memoryStub });
  assert(r.task === 'why_clarify', r.task);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: memoryStub });
  assert(/which decision|name the project/i.test(text), text);
  assert(!/strongest demo/i.test(text), text);
});

test('What about Placement Pro switches project without an empty answer', () => {
  const q = 'What about Placement Pro?';
  const memory = boundMemory('queryforge', 'queryforge_detail');
  const frame = buildQuestionFrame(q, { memory, focusProject: 'queryforge' });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory });
  assert(r.task === 'placementpro_detail', r.task);
  assert(r.focus === 'pp-purpose', r.focus);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory });
  assert(text.trim().length > 40, 'empty');
  assert(/Placement Pro/i.test(text), text);
  assert(/skill-gap|roadmap|placement-preparation/i.test(text), text);
  assert(!/strongest demo/i.test(text), text);
  assert(!/generate-sql/i.test(text), text);
});

test('How is it built stays on the bound QueryForge architecture', () => {
  const q = 'How is it built?';
  const memory = boundMemory('queryforge', 'queryforge_detail');
  const frame = buildQuestionFrame(q, { memory, focusProject: 'queryforge' });
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.focus === 'qf-architecture', r.focus);
  assert(r.aspect === 'architecture', r.aspect);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory });
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(!/^Verified implementation architecture/i.test(text.trim()), text.slice(0, 80));
  assert(!/five-layer/i.test(text), text);
  assert(!/strongest demo/i.test(text), text);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
