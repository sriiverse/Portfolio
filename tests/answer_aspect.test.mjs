/**
 * Regression: question aspect routing, grounded answers, retrieval scope,
 * follow-ups, and brochure/card duplication.
 * Run: node tests/answer_aspect.test.mjs
 */
import { readFileSync } from 'node:fs';
import { buildQuestionFrame, classifyAnswerAspect, enrichBoundContext, suggestFollowupAngles } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet, retrieveScoped } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import { classifyReasoningStrategy, synthesizeReasoning } from '../src/assistant/reasoning.js';
import { pickContextualInvite, adaptDraft } from '../src/assistant/adaptive.js';
import { finalizeWithReflection } from '../src/assistant/reflection.js';
import { renderMarkdown } from '../src/assistant/renderer.js';

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
const pending = [];
function test(name, fn) {
  let result;
  try {
    result = fn();
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message || err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message || err}`);
    return;
  }
  if (result && typeof result.then === 'function') {
    pending.push(Promise.resolve(result).then(() => {
      results.push({ name, ok: true });
      console.log(`PASS  ${name}`);
    }, (err) => {
      results.push({ name, ok: false, error: String(err.message || err) });
      console.log(`FAIL  ${name}`);
      console.log(`      ${err.message || err}`);
    }));
    return;
  }
  results.push({ name, ok: true });
  console.log(`PASS  ${name}`);
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
  assert(/Netlify/i.test(text) && /Render/i.test(text), `hosts missing: ${text}`);
  assert(/Gemini/i.test(text) && /Groq/i.test(text), `providers missing: ${text}`);
  assert(!/heuristic|no provider key|no LLM key/i.test(text), `heuristic caveat leaked: ${text}`);
  assert(!/WebSocket/i.test(text), `CLI agent leaked: ${text}`);
  assert(!/simulat/i.test(text), `simulated execution leaked: ${text}`);
  assert(!/database driver|no database/i.test(text), `database caveat leaked: ${text}`);
  assert(!/outdated/i.test(text), `portfolio discrepancy leaked: ${text}`);
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
  assert(!/outdated|portfolio wording/i.test(text), 'portfolio discrepancy leaked into an architecture answer');
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
  assert(/not Flask/i.test(text), text);
  assert(!/outdated|portfolio wording/i.test(text), text);
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
  assert(!/What did he use to build/i.test(joined), joined);
  assert(/SQL generation|external AI providers|live database/i.test(joined), joined);

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
  assert(/not Flask/i.test(text), text);
  assert(!/outdated/i.test(text), text);
  assert(!/Groq/i.test(text), text);
  assert(!/WebSocket/i.test(text), text);
  assert(!/database driver/i.test(text), text);
  assert(!/simulat/i.test(text), text);
  assert(!/heuristic/i.test(text), text);
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
  assert(!/outdated|portfolio wording/i.test(text), text);
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
  const { bound, reasoning, text } = askInContext(q, memory);
  assert(bound.focusProject === 'placementpro', bound.focusProject);
  assert(bound.enriched === false, bound.query);
  assert(!/queryforge/i.test(bound.query), bound.query);
  assert(reasoning.task === 'placementpro_detail', reasoning.task);
  assert(reasoning.task !== 'cross_project_compare', reasoning.task);
  assert(reasoning.focus === 'pp-purpose', reasoning.focus);
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
  assert(!/outdated|portfolio wording/i.test(text), text);
  assert(!/^Verified implementation architecture/i.test(text.trim()), text.slice(0, 80));
  assert(!/five-layer/i.test(text), text);
  assert(!/strongest demo/i.test(text), text);
});

test('a bound Flask follow-up stays a short no on QueryForge', () => {
  const q = 'Is it built with Flask?';
  const memory = boundMemory('queryforge', 'queryforge_detail');
  const bound = enrichBoundContext(q, { lastProject: 'queryforge', projectIds: ['queryforge'] });
  assert(/queryforge/i.test(bound.query), bound.query);
  const frame = buildQuestionFrame(bound.query, { memory, focusProject: 'queryforge' });
  const r = classifyReasoningStrategy(bound.query, { questionFrame: frame, memory });
  assert(r.task === 'queryforge_detail', r.task);
  assert(r.aspect === 'yesno', r.aspect);
  const text = synthesizeReasoning(r, bound.query, { questionFrame: frame, memory });
  assert(/^No\b/.test(text.trim()), text);
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(!/Groq|WebSocket|database driver|simulat|outdated/i.test(text), text);
});

test('complete QueryForge architecture stays detailed', () => {
  const q = 'Explain the complete architecture of QueryForgeAI.';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.aspect === 'architecture', r.aspect);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
  assert(/Gemini/i.test(text) && /Groq/i.test(text), text);
  assert(/WebSocket/i.test(text), text);
  assert(/database driver|no database/i.test(text), text);
  assert(!/outdated|portfolio wording/i.test(text), text);
  assert(!/does not execute real EXPLAIN|simulated/i.test(text), text);
  assert(text.length > 300, `architecture was over-shortened (${text.length})`);
});

test('Placement Pro built answer stays on Placement facts', () => {
  const q = 'How is Placement Pro+ built?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  assert(r.task === 'placementpro_detail', r.task);
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/React/i.test(text) && /Flask/i.test(text), text);
  assert(/SQLAlchemy|SQLite/i.test(text), text);
  assert(/MiniLM|NetworkX/i.test(text), text);
  assert(!/generate-sql/i.test(text), text);
  assert(!/Gemini/i.test(text), text);
});

function askInContext(raw, memory) {
  const bound = enrichBoundContext(raw, {
    lastProject: memory.lastProject,
    projectIds: memory.lastCommitment?.projectIds || (memory.lastProject ? [memory.lastProject] : []),
  });
  const frame = buildQuestionFrame(bound.query, { memory, focusProject: bound.focusProject });
  const reasoning = classifyReasoningStrategy(bound.query, { questionFrame: frame, memory });
  const text = synthesizeReasoning(reasoning, bound.query, { questionFrame: frame, memory });
  return { bound, frame, reasoning, text };
}

test('a bound architecture contrast keeps Placement Pro+ and compares both backends', () => {
  const memory = boundMemory('placementpro', 'placementpro_detail');
  const variants = [
    'How does its architecture differ from QueryForgeAI?',
    'How is its architecture different from QueryForgeAI?',
    'How does Placement Pro+ differ architecturally from QueryForgeAI?',
    'Compare its architecture with QueryForgeAI.',
  ];
  for (const q of variants) {
    const { bound, frame, reasoning, text } = askInContext(q, memory);
    assert(bound.focusProject === 'placementpro', `${q} focus ${bound.focusProject}`);
    assert(/placement pro/i.test(bound.query) && /queryforge/i.test(bound.query), bound.query);
    assert(frame.questionType === 'Comparison', `${q} type ${frame.questionType}`);
    assert(reasoning.task === 'cross_project_compare', `${q} task ${reasoning.task}`);
    assert(reasoning.projectIds?.[0] === 'placementpro', `${q} ids ${reasoning.projectIds}`);
    assert(reasoning.projectIds.includes('queryforge'), `${q} ids ${reasoning.projectIds}`);
    assert(/Placement Pro/i.test(text) && /QueryForgeAI/i.test(text), text);
    assert(/Flask/i.test(text) && /FastAPI/i.test(text), text);
    assert(/Core technical distinction/i.test(text), text);
    assert(/skill-gap|placement-preparation|roadmap/i.test(text), text);
    assert(!/^QueryForgeAI is a SQL\/Mongo query generator[^\n]*$/i.test(text.trim()), text);
    assert(!/outdated|portfolio wording|WebSocket|database driver|simulat/i.test(text), text);
  }

  const skill = askInContext('How does its skill-gap analysis work?', memory);
  assert(skill.bound.focusProject === 'placementpro', skill.bound.focusProject);
  assert(skill.reasoning.task === 'placementpro_detail', skill.reasoning.task);
  assert(skill.reasoning.focus === 'pp-skill-gap', skill.reasoning.focus);
});

test('an explicit portfolio-wording question still reports the Flask discrepancy', () => {
  const q = 'Why does the portfolio say QueryForgeAI uses Flask?';
  const frame = buildQuestionFrame(q, {});
  const r = classifyReasoningStrategy(q, { questionFrame: frame, memory: {} });
  const text = synthesizeReasoning(r, q, { questionFrame: frame, memory: {} });
  assert(/FastAPI/i.test(text), text);
  assert(/outdated|portfolio wording/i.test(text), text);
});

test('RepoRadar generative-model questions use the documented denial', () => {
  const variants = [
    'Does RepoRadar use a generative AI model?',
    'Does RepoRadar use generative AI?',
    'Does RepoRadar use an LLM?',
    'Does RepoRadar use Gemini or OpenAI?',
  ];
  for (const q of variants) {
    const { reasoning, text } = askInContext(q, memoryStub);
    assert(reasoning.task === 'reporadar_detail', `${q} task ${reasoning.task}`);
    assert(reasoning.focus === 'rr-ai-model', `${q} focus ${reasoning.focus}`);
    assert(/does not use a generative AI model/i.test(text), text);
    assert(!/not documented/i.test(text), text);
  }
});

test('a backend follow-up stays on the active project and answers the backend', () => {
  const queryforge = boundMemory('queryforge', 'queryforge_detail');
  const variants = [
    'What about the backend?',
    'And the backend?',
    'What backend does it use?',
    'Which technology powers the backend?',
    'Tell me about its server side.',
  ];
  for (const q of variants) {
    const { bound, reasoning, text } = askInContext(q, queryforge);
    assert(bound.focusProject === 'queryforge', `${q} focus ${bound.focusProject}`);
    assert(reasoning.task === 'queryforge_detail', `${q} task ${reasoning.task}`);
    assert(reasoning.focus === 'qf-architecture', `${q} focus ${reasoning.focus}`);
    assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
    assert(!/query generator|SQL\/Mongo/i.test(text), text);
    assert(!/outdated|portfolio wording/i.test(text), text);
    assert(!/React \+ Vite/i.test(text), text);
  }

  const placement = askInContext('What about the backend?', boundMemory('placementpro', 'placementpro_detail'));
  assert(placement.bound.focusProject === 'placementpro', placement.bound.focusProject);
  assert(/Flask 3\.1/i.test(placement.text), placement.text);
  assert(!/FastAPI/i.test(placement.text), placement.text);

  const radar = askInContext('What about the backend?', boundMemory('reporadar', 'reporadar_detail'));
  assert(radar.bound.focusProject === 'reporadar', radar.bound.focusProject);
  assert(/Next\.js/i.test(radar.text) && /\/api\/analyze/i.test(radar.text), radar.text);
  assert(!/Flask|FastAPI/i.test(radar.text), radar.text);

  const switched = askInContext('What backend does QueryForgeAI use?', boundMemory('placementpro', 'placementpro_detail'));
  assert(switched.reasoning.task === 'queryforge_detail', switched.reasoning.task);
  assert(/FastAPI/i.test(switched.text) && /Uvicorn/i.test(switched.text), switched.text);
  assert(!/Flask 3\.1/i.test(switched.text), switched.text);
});

test('explicit backend depth keeps the documented architecture', () => {
  const detailed = [
    'Explain the complete backend architecture of QueryForgeAI.',
    "Describe QueryForgeAI's backend architecture in detail.",
    'Walk me through the entire QueryForgeAI backend.',
    "Explain how QueryForgeAI's backend works, including its providers and CLI path.",
  ];
  for (const q of detailed) {
    const { reasoning, text } = askInContext(q, memoryStub);
    assert(reasoning.task === 'queryforge_detail', `${q} task ${reasoning.task}`);
    assert(reasoning.aspect === 'architecture', `${q} aspect ${reasoning.aspect}`);
    assert(reasoning.focus === 'qf-architecture', `${q} focus ${reasoning.focus}`);
    assert(/FastAPI/i.test(text) && /Uvicorn/i.test(text), text);
    assert(/Gemini/i.test(text) && /Groq/i.test(text), text);
    assert(/WebSocket/i.test(text), text);
    assert(/database driver|no database/i.test(text), text);
    assert(!/outdated|portfolio wording/i.test(text), text);
    assert(text.length > 300, `${q} was over-shortened (${text.length})`);
  }

  const compared = askInContext('Compare the backends of QueryForgeAI and Placement Pro+.', memoryStub);
  assert(compared.reasoning.task === 'cross_project_compare', compared.reasoning.task);
  assert(/FastAPI/i.test(compared.text) && /Flask 3\.1/i.test(compared.text), compared.text);
  assert(/QueryForgeAI/i.test(compared.text) && /Placement Pro/i.test(compared.text), compared.text);

  const stack = askInContext('What technologies were used across the full QueryForgeAI stack?', memoryStub);
  assert(stack.reasoning.task === 'queryforge_detail', stack.reasoning.task);
  assert(stack.reasoning.aspect === 'stack', stack.reasoning.aspect);
  assert(/React/i.test(stack.text) && /Vite/i.test(stack.text), stack.text);
  assert(/FastAPI/i.test(stack.text) && /Uvicorn/i.test(stack.text), stack.text);
  assert(/Gemini/i.test(stack.text) && /Groq/i.test(stack.text), stack.text);
});

test('a specific unknown QueryForge question does not become the overview', () => {
  const overview = askInContext('What is QueryForgeAI?', memoryStub);
  assert(overview.reasoning.task === 'queryforge_detail', overview.reasoning.task);
  assert(overview.reasoning.focus === 'qf-purpose', overview.reasoning.focus);
  assert(/SQL\/Mongo query generator|query generator and optimizer/i.test(overview.text), overview.text);
  assert(!/not documented/i.test(overview.text), overview.text);

  const about = askInContext('Tell me about QueryForgeAI.', memoryStub);
  assert(about.reasoning.task === 'project_overview', about.reasoning.task);
  assert(/QueryForge/i.test(about.text), about.text);
  assert(!/not documented in the portfolio knowledge/i.test(about.text), about.text);

  const unknowns = [
    "What is QueryForgeAI's Kubernetes autoscaler configuration?",
    "What is QueryForgeAI's service mesh traffic policy?",
    "What is QueryForgeAI's multi-region failover topology?",
  ];
  for (const q of unknowns) {
    const { reasoning, text } = askInContext(q, memoryStub);
    assert(reasoning.task === 'undocumented_detail', `${q} task ${reasoning.task}`);
    assert(text.trim().length > 40, `${q} empty`);
    assert(/not documented/i.test(text), text);
    assert(!/SQL\/Mongo query generator/i.test(text), text);
  }
});

test('what about its database selects the documented persistence facet', () => {
  const radar = askInContext('What about its database?', boundMemory('reporadar', 'reporadar_detail'));
  assert(radar.bound.focusProject === 'reporadar', radar.bound.focusProject);
  assert(/reporadar/i.test(radar.bound.query), radar.bound.query);
  assert(radar.reasoning.task === 'reporadar_detail', radar.reasoning.task);
  assert(radar.reasoning.focus === 'rr-data-flow', radar.reasoning.focus);
  assert(/no durable database/i.test(radar.text), radar.text);
  assert(!/SQLAlchemy|PostgreSQL/i.test(radar.text), radar.text);

  const placement = askInContext('What about its database?', boundMemory('placementpro', 'placementpro_detail'));
  assert(placement.bound.focusProject === 'placementpro', placement.bound.focusProject);
  assert(placement.reasoning.task === 'placementpro_detail', placement.reasoning.task);
  assert(placement.reasoning.focus === 'pp-database', placement.reasoning.focus);
  assert(/SQLAlchemy/i.test(placement.text), placement.text);
  assert(/SQLite/i.test(placement.text), placement.text);
  assert(/PostgreSQL/i.test(placement.text), placement.text);
  assert(!/no durable database/i.test(placement.text), placement.text);

  const queryforge = askInContext('What about its database?', boundMemory('queryforge', 'queryforge_detail'));
  assert(queryforge.bound.focusProject === 'queryforge', queryforge.bound.focusProject);
  assert(queryforge.reasoning.task === 'queryforge_detail', queryforge.reasoning.task);
  assert(queryforge.reasoning.focus === 'qf-limitations', queryforge.reasoning.focus);
  assert(/no live database/i.test(queryforge.text), queryforge.text);
  assert(/simulat/i.test(queryforge.text), queryforge.text);
  assert(!/SQLAlchemy|executes live SQL/i.test(queryforge.text), queryforge.text);
});

test('What about Placement Pro does not become a comparison', () => {
  const switched = askInContext('What about Placement Pro?', boundMemory('queryforge', 'queryforge_detail'));
  assert(switched.bound.focusProject === 'placementpro', switched.bound.focusProject);
  assert(switched.reasoning.task === 'placementpro_detail', switched.reasoning.task);
  assert(switched.reasoning.task !== 'cross_project_compare', switched.reasoning.task);
  assert(!/queryforge/i.test(switched.bound.query), switched.bound.query);

  const compared = askInContext('Compare QueryForgeAI and Placement Pro+.', boundMemory('queryforge', 'queryforge_detail'));
  assert(compared.reasoning.task === 'cross_project_compare', compared.reasoning.task);
  assert(compared.reasoning.projectIds?.includes('queryforge'), compared.reasoning.projectIds);
  assert(compared.reasoning.projectIds?.includes('placementpro'), compared.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(compared.text) && /Placement Pro/i.test(compared.text), compared.text);
});

test('a backend question with no project asks for clarification', () => {
  const fresh = askInContext('What backend does it use?', memoryStub);
  assert(fresh.reasoning.task === 'context_clarify', fresh.reasoning.task);
  assert(typeof fresh.text === 'string' && fresh.text.trim().length > 0, fresh.text);
  assert(/which project/i.test(fresh.text), fresh.text);
  assert(!/FastAPI|Flask|Next\.js/i.test(fresh.text), fresh.text);

  const active = askInContext('What backend does it use?', boundMemory('queryforge', 'queryforge_detail'));
  assert(active.bound.focusProject === 'queryforge', active.bound.focusProject);
  assert(active.reasoning.task === 'queryforge_detail', active.reasoning.task);
  assert(active.reasoning.focus === 'qf-architecture', active.reasoning.focus);
  assert(active.text.trim().length > 0, active.text);
  assert(/FastAPI/i.test(active.text) && /Uvicorn/i.test(active.text), active.text);
  assert(!/which project/i.test(active.text), active.text);
});

test('follow-ups after yes/no and Placement architecture stay on the project', () => {
  const flask = suggestFollowupAngles('Is QueryForgeAI built with Flask?', 'QueryForgeAI');
  assert(flask?.some((item) => /SQL generation|live database|AI providers/i.test(item)), flask?.join(' | '));
  assert(!flask?.some((item) => /built with Flask/i.test(item)), flask?.join(' | '));

  const placement = suggestFollowupAngles('How is Placement Pro+ built?', 'Placement Pro+');
  const joined = (placement || []).join(' | ');
  assert(/skill-gap/i.test(joined) && /roadmap/i.test(joined), joined);
  assert(!/generate-sql/i.test(joined), joined);

  const radar = suggestFollowupAngles('How does RepoRadar work?', 'RepoRadar');
  const radarJoined = (radar || []).join(' | ');
  assert(/GitHub data|heuristic scoring|generative model/i.test(radarJoined), radarJoined);
  assert(!/FastAPI|Gemini/i.test(radarJoined), radarJoined);
});

test('ordinary answers render as one prose block, not a bubble per paragraph', () => {
  const html = renderMarkdown('Frontend: React.\n\nBackend: FastAPI.\n\nPersistence: SQLAlchemy.');
  assert(html.startsWith('<div class="ai-prose">'), html);
  assert((html.match(/class="ai-p"/g) || []).length === 3, html);
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert(!/\.assistant__msg--bot p\s*\{/.test(css), 'unscoped bot paragraph bubble is still present');
  assert(/\.assistant__msg--bot \.ai-prose\s*\{/.test(css), 'prose bubble missing');
  assert(/\.assistant__msg--bot > p\s*\{/.test(css), 'welcome bubble missing');
});

test('Placement Pro specific unknowns do not become the overview', () => {
  const what = askInContext('What is Placement Pro?', memoryStub);
  assert(what.reasoning.task === 'placementpro_detail', what.reasoning.task);
  assert(what.reasoning.focus === 'pp-purpose', what.reasoning.focus);
  assert(/placement-preparation/i.test(what.text), what.text);
  assert(!/not documented/i.test(what.text), what.text);

  const about = askInContext('Tell me about Placement Pro.', memoryStub);
  assert(about.reasoning.task === 'project_overview', about.reasoning.task);
  assert(/Placement Pro/i.test(about.text), about.text);
  assert(!/not documented in the portfolio knowledge/i.test(about.text), about.text);

  const explained = askInContext('Explain Placement Pro+', memoryStub);
  assert(explained.reasoning.task === 'project_overview', explained.reasoning.task);
  assert(/Placement Pro/i.test(explained.text), explained.text);

  const database = askInContext('What database does Placement Pro+ use?', memoryStub);
  assert(database.reasoning.task === 'placementpro_detail', database.reasoning.task);
  assert(database.reasoning.focus === 'pp-database', database.reasoning.focus);
  assert(/SQLAlchemy/i.test(database.text) && /SQLite/i.test(database.text), database.text);
  assert(!/not documented in the portfolio knowledge/i.test(database.text), database.text);

  const unknowns = [
    "What is Placement Pro's Kubernetes configuration?",
    "What is Placement Pro+'s undocumented failover configuration?",
  ];
  for (const q of unknowns) {
    const { reasoning, text } = askInContext(q, memoryStub);
    assert(reasoning.task === 'undocumented_detail', `${q} task ${reasoning.task}`);
    assert(/not documented/i.test(text), text);
    assert(!/placement-preparation product/i.test(text), text);
    assert(!/skill-gap analysis/i.test(text), text);
  }
});

test('QueryForge cues do not match inside unrelated words', () => {
  const validation = askInContext('How does QueryForgeAI handle validation?', memoryStub);
  assert(validation.reasoning.focus === 'qf-validation', validation.reasoning.focus);
  assert(/static post-parse validator/i.test(validation.text), validation.text);

  const invalidation = askInContext('How does QueryForgeAI handle invalidation?', memoryStub);
  assert(invalidation.reasoning.focus !== 'qf-validation', invalidation.reasoning.focus);
  assert(invalidation.reasoning.task === 'undocumented_detail', invalidation.reasoning.task);
  assert(!/static post-parse validator/i.test(invalidation.text), invalidation.text);
  assert(/not documented/i.test(invalidation.text), invalidation.text);

  const hosted = askInContext('Where is QueryForgeAI hosted?', memoryStub);
  assert(hosted.reasoning.focus === 'qf-deployment', hosted.reasoning.focus);
  assert(/Netlify/i.test(hosted.text) && /Render/i.test(hosted.text), hosted.text);

  const ghosted = askInContext('How does QueryForgeAI handle ghosted sessions?', memoryStub);
  assert(ghosted.reasoning.focus !== 'qf-deployment', ghosted.reasoning.focus);
  assert(ghosted.reasoning.task === 'undocumented_detail', ghosted.reasoning.task);
  assert(!/Frontend is deployed on Netlify/i.test(ghosted.text), ghosted.text);

  const generator = askInContext('How does the QueryForgeAI generator work?', memoryStub);
  assert(generator.reasoning.focus === 'qf-dataflow-generator', generator.reasoning.focus);
  assert(/generate-sql/i.test(generator.text), generator.text);

  const regenerator = askInContext('How does QueryForgeAI handle regenerator output?', memoryStub);
  assert(regenerator.reasoning.focus !== 'qf-dataflow-generator', regenerator.reasoning.focus);
  assert(regenerator.reasoning.task === 'undocumented_detail', regenerator.reasoning.task);
  assert(!/generate-sql/i.test(regenerator.text), regenerator.text);

  const renderPage = askInContext('How does QueryForgeAI render the results page?', memoryStub);
  assert(renderPage.reasoning.focus !== 'qf-deployment', renderPage.reasoning.focus);
  assert(renderPage.reasoning.task === 'undocumented_detail', renderPage.reasoning.task);
  assert(!/Frontend is deployed on Netlify/i.test(renderPage.text), renderPage.text);

  const parsed = askInContext('How does QueryForgeAI parse a failed response?', memoryStub);
  assert(parsed.reasoning.task === 'queryforge_detail', parsed.reasoning.task);
  assert(parsed.reasoning.focus === 'qf-failure', parsed.reasoning.focus);
  assert(/Failed response parsing|Gemini 429/i.test(parsed.text), parsed.text);

  const parser = askInContext('How does QueryForgeAI handle a parser plugin?', memoryStub);
  assert(parser.reasoning.focus !== 'qf-failure', parser.reasoning.focus);
  assert(parser.reasoning.task === 'undocumented_detail', parser.reasoning.task);
  assert(!/Gemini 429/i.test(parser.text), parser.text);

  const preoptimizer = askInContext('How does QueryForgeAI handle preoptimizer hints?', memoryStub);
  assert(preoptimizer.reasoning.focus !== 'qf-dataflow-optimizer', preoptimizer.reasoning.focus);
  assert(preoptimizer.reasoning.task === 'undocumented_detail', preoptimizer.reasoning.task);
  assert(!/POST \/analyze/i.test(preoptimizer.text), preoptimizer.text);
});

test('RepoRadar specific unknowns do not become the overview', () => {
  const what = askInContext('What is RepoRadar?', memoryStub);
  assert(what.reasoning.task === 'reporadar_detail', what.reasoning.task);
  assert(what.reasoning.focus === 'rr-purpose', what.reasoning.focus);
  assert(/GitHub repository health/i.test(what.text), what.text);
  assert(!/not documented/i.test(what.text), what.text);

  const purpose = askInContext("What is RepoRadar's purpose?", memoryStub);
  assert(purpose.reasoning.focus === 'rr-purpose', purpose.reasoning.focus);

  const hosted = askInContext('Where is RepoRadar hosted?', memoryStub);
  assert(hosted.reasoning.focus === 'rr-deployment', hosted.reasoning.focus);
  assert(/vercel/i.test(hosted.text), hosted.text);

  const health = askInContext('How does RepoRadar calculate the health score?', memoryStub);
  assert(health.reasoning.focus === 'rr-scoring', health.reasoning.focus);
  assert(/0–100|0-100/i.test(health.text), health.text);

  const cache = askInContext("What is RepoRadar's cache TTL?", memoryStub);
  assert(cache.reasoning.focus === 'rr-caching', cache.reasoning.focus);
  assert(/1-hour TTL/i.test(cache.text), cache.text);

  const model = askInContext('Does RepoRadar use a generative AI model?', memoryStub);
  assert(model.reasoning.focus === 'rr-ai-model', model.reasoning.focus);
  assert(/does not use a generative AI model/i.test(model.text), model.text);

  for (const q of [
    "What is RepoRadar's Kubernetes configuration?",
    "What is RepoRadarAI's undocumented failover configuration?",
  ]) {
    const { reasoning, text } = askInContext(q, memoryStub);
    assert(reasoning.task === 'undocumented_detail', `${q} task ${reasoning.task}`);
    assert(reasoning.focus !== 'rr-purpose', reasoning.focus);
    assert(/not documented/i.test(text), text);
    assert(!/GitHub repository health and activity intelligence tool/i.test(text), text);
  }
});

test('Placement and RepoRadar cues do not match inside unrelated words', () => {
  const validation = askInContext('How does Placement Pro+ handle validation?', memoryStub);
  assert(validation.reasoning.focus === 'pp-validation', validation.reasoning.focus);
  assert(/HTTP 422/i.test(validation.text), validation.text);

  const invalidation = askInContext('How does Placement Pro+ handle invalidation?', memoryStub);
  assert(invalidation.reasoning.focus !== 'pp-validation', invalidation.reasoning.focus);
  assert(invalidation.reasoning.task === 'undocumented_detail', invalidation.reasoning.task);
  assert(!/HTTP 422/i.test(invalidation.text), invalidation.text);

  const prereg = askInContext('How does Placement Pro+ handle preregistered accounts?', memoryStub);
  assert(prereg.reasoning.focus !== 'pp-auth', prereg.reasoning.focus);
  assert(prereg.reasoning.task === 'undocumented_detail', prereg.reasoning.task);
  assert(!/bcrypt/i.test(prereg.text), prereg.text);

  const bottleneck = askInContext('How does Placement Pro+ handle a bottleneck?', memoryStub);
  assert(bottleneck.reasoning.focus !== 'pp-caching', bottleneck.reasoning.focus);
  assert(bottleneck.reasoning.task === 'undocumented_detail', bottleneck.reasoning.task);
  assert(!/TTLCache/i.test(bottleneck.text), bottleneck.text);

  const drafts = askInContext('How does Placement Pro+ handle unpersisted drafts?', memoryStub);
  assert(drafts.reasoning.focus !== 'pp-database', drafts.reasoning.focus);
  assert(drafts.reasoning.task === 'undocumented_detail', drafts.reasoning.task);
  assert(!/SQLAlchemy/i.test(drafts.text), drafts.text);

  const ghosted = askInContext('How does RepoRadar handle ghosted sessions?', memoryStub);
  assert(ghosted.reasoning.focus !== 'rr-deployment', ghosted.reasoning.focus);
  assert(ghosted.reasoning.task === 'undocumented_detail', ghosted.reasoning.task);
  assert(!/repoai\.sriiverseai\.vercel\.app/i.test(ghosted.text), ghosted.text);

  for (const q of [
    'How does RepoRadar handle the last scan?',
    'How does RepoRadar handle a forecast?',
    'How does RepoRadar handle unzipping archives?',
  ]) {
    const row = askInContext(q, memoryStub);
    assert(row.reasoning.focus !== 'rr-ingestion', `${q} focus ${row.reasoning.focus}`);
    assert(row.reasoning.task === 'undocumented_detail', `${q} task ${row.reasoning.task}`);
    assert(!/parseGitHubUrl/i.test(row.text), row.text);
  }

  for (const q of [
    'How does RepoRadar handle a fragment?',
    'How does RepoRadar handle drag and drop?',
  ]) {
    const row = askInContext(q, memoryStub);
    assert(row.reasoning.focus !== 'rr-ai-model', `${q} focus ${row.reasoning.focus}`);
    assert(row.reasoning.task === 'undocumented_detail', `${q} task ${row.reasoning.task}`);
    assert(!/does not use a generative AI model/i.test(row.text), row.text);
  }

  const cachet = askInContext('How does RepoRadar handle cachet badges?', memoryStub);
  assert(cachet.reasoning.focus !== 'rr-caching', cachet.reasoning.focus);
  assert(cachet.reasoning.task === 'undocumented_detail', cachet.reasoning.task);
  assert(!/1-hour TTL/i.test(cachet.text), cachet.text);
});

test('a specific property does not fall back to the project overview', () => {
  const hosted = askInContext('Where is Placement Pro+ hosted?', memoryStub);
  assert(hosted.reasoning.task === 'placementpro_detail', hosted.reasoning.task);
  assert(hosted.reasoning.focus === 'pp-deployment', hosted.reasoning.focus);
  assert(/Netlify/i.test(hosted.text) && /Gunicorn|render\.yaml/i.test(hosted.text), hosted.text);
  assert(!/placement-preparation product/i.test(hosted.text), hosted.text);

  const kubernetes = askInContext('Does QueryForgeAI use Kubernetes?', memoryStub);
  assert(kubernetes.reasoning.task === 'undocumented_detail', kubernetes.reasoning.task);
  assert(/not documented/i.test(kubernetes.text), kubernetes.text);
  assert(!/SQL\/Mongo query generator/i.test(kubernetes.text), kubernetes.text);

  const highlighting = askInContext('How does QueryForgeAI handle syntax highlighting?', memoryStub);
  assert(highlighting.reasoning.focus !== 'qf-validation', highlighting.reasoning.focus);
  assert(highlighting.reasoning.task === 'undocumented_detail', highlighting.reasoning.task);
  assert(!/static post-parse validator/i.test(highlighting.text), highlighting.text);

  const encryption = askInContext('How does QueryForgeAI handle payload encryption?', memoryStub);
  assert(encryption.reasoning.focus !== 'qf-dataflow-generator', encryption.reasoning.focus);
  assert(encryption.reasoning.task === 'undocumented_detail', encryption.reasoning.task);
  assert(!/generate-sql/i.test(encryption.text), encryption.text);

  const backpressure = askInContext('How does QueryForgeAI handle websocket backpressure?', memoryStub);
  assert(backpressure.reasoning.focus !== 'qf-api', backpressure.reasoning.focus);
  assert(backpressure.reasoning.task === 'undocumented_detail', backpressure.reasoning.task);
  assert(!/GET \/health/i.test(backpressure.text), backpressure.text);
});

function createPipelineMemory() {
  return {
    turns: [],
    lastProject: null,
    lastCommitment: null,
    activeMode: null,
    profile: { type: 'unknown' },
    hasUsedPhrase() { return false; },
    markPhraseUsed() {},
    add(role, text, entities = {}) {
      this.turns.push({ role, text });
      const compared = Array.isArray(this.lastCommitment?.projectIds)
        && this.lastCommitment.projectIds.length >= 2;
      if (entities.project && !compared) this.lastProject = entities.project;
    },
    bindConversationState({ projectId, mode, commitment, clearProject } = {}) {
      if (clearProject || (Array.isArray(commitment?.projectIds) && commitment.projectIds.length >= 2)) {
        this.lastProject = null;
      } else if (projectId) {
        this.lastProject = projectId;
      }
      if (mode) this.activeMode = mode;
      if (commitment) this.lastCommitment = commitment;
    },
    get turnCount() { return this.turns.length; },
  };
}

async function composeTurn(userText, memory, { awarenessProject = null } = {}) {
  memory.add('user', userText);
  const pendingClarification = memory.lastCommitment?.task === 'context_clarify'
    && memory.lastCommitment?.pendingProject === true;
  const bound = enrichBoundContext(userText, {
    lastProject: memory.lastProject,
    projectIds: Array.isArray(memory.lastCommitment?.projectIds) ? memory.lastCommitment.projectIds : [],
    awarenessProject,
    pendingClarification,
  });
  const questionFrame = buildQuestionFrame(bound.query, { intent: null, focusProject: bound.focusProject, memory });
  const entities = resolveEntities(bound.query);
  const evidence = buildEvidenceSet(bound.query, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  const reasoning = classifyReasoningStrategy(bound.query, { questionFrame, memory, entities });
  const ctx = {
    memory,
    intent: null,
    questionFrame,
    entities,
    evidence,
    confidence,
    plan,
    focusProject: bound.focusProject,
    visitorProfile: memory.profile,
    query: bound.query,
  };
  const draft = await getProvider()._draftAnswer(bound.query, ctx);
  const response = finalizeWithReflection(adaptDraft(draft, ctx), ctx);
  const resolved = bound.focusProject || response.payload?.project?.id || null;
  memory.add('assistant', response.text || '', { project: resolved });
  return { bound, reasoning, text: response.text || '', memory };
}

test('clarification text does not become the active project', async () => {
  const memory = createPipelineMemory();

  const clarify = await composeTurn('What backend does it use?', memory);
  assert(clarify.reasoning.task === 'context_clarify', clarify.reasoning.task);
  assert(/which project/i.test(clarify.text), clarify.text);
  assert(clarify.memory.lastProject == null, `stored ${clarify.memory.lastProject}`);
  assert(!/FastAPI|Flask 3\.1|\/api\/analyze/i.test(clarify.text), clarify.text);

  const follow = await composeTurn('What about its database?', memory);
  assert(follow.reasoning.task === 'context_clarify', follow.reasoning.task);
  assert(/which project/i.test(follow.text), follow.text);
  assert(!/Staying with QueryForgeAI/i.test(follow.text), follow.text);
  assert(!/no live database|SQLAlchemy|no durable database/i.test(follow.text), `${follow.reasoning.task} :: ${follow.text}`);
  assert(follow.bound.focusProject == null, follow.bound.focusProject);

  const queryforge = createPipelineMemory();
  const established = await composeTurn('Tell me about QueryForgeAI.', queryforge);
  assert(established.memory.lastProject === 'queryforge', established.memory.lastProject);
  const backend = await composeTurn('What backend does it use?', queryforge);
  assert(backend.reasoning.focus === 'qf-architecture', backend.reasoning.focus);
  assert(/FastAPI/i.test(backend.text) && /Uvicorn/i.test(backend.text), backend.text);
  const database = await composeTurn('What about its database?', queryforge);
  assert(database.bound.focusProject === 'queryforge', database.bound.focusProject);
  assert(database.reasoning.focus === 'qf-limitations', database.reasoning.focus);
  assert(/Staying with QueryForgeAI/i.test(database.text), `${database.reasoning.task} :: ${database.text.slice(0, 120)}`);
  assert(/no live database/i.test(database.text), database.text);
  assert(/simulat/i.test(database.text), database.text);

  const placement = createPipelineMemory();
  const placed = await composeTurn('Tell me about Placement Pro+.', placement);
  assert(placed.memory.lastProject === 'placementpro', placed.memory.lastProject);
  const placementBackend = await composeTurn('What about the backend?', placement);
  assert(placementBackend.bound.focusProject === 'placementpro', placementBackend.bound.focusProject);
  assert(/Staying with Placement Pro\+/i.test(placementBackend.text), placementBackend.text);
  assert(/Flask 3\.1/i.test(placementBackend.text), placementBackend.text);
  assert(!/FastAPI/i.test(placementBackend.text), placementBackend.text);
});

test('an unresolved database follow-up does not adopt the viewport project', async () => {
  for (const awarenessProject of ['reporadar', 'placementpro', 'queryforge']) {
    const memory = createPipelineMemory();
    const clarify = await composeTurn('What backend does it use?', memory);
    assert(clarify.reasoning.task === 'context_clarify', clarify.reasoning.task);
    assert(/which project/i.test(clarify.text), clarify.text);
    assert(clarify.memory.lastProject == null, `stored ${clarify.memory.lastProject}`);
    assert(clarify.memory.lastCommitment?.pendingProject === true, 'clarification was not left pending');
    assert(clarify.memory.lastCommitment?.projectId == null, clarify.memory.lastCommitment?.projectId);

    const follow = await composeTurn('What about its database?', memory, { awarenessProject });
    assert(follow.reasoning.task === 'context_clarify', `${awarenessProject} task ${follow.reasoning.task}`);
    assert(follow.bound.query === 'What about its database?', follow.bound.query);
    assert(follow.bound.focusProject == null, follow.bound.focusProject);
    assert(follow.bound.enriched === false, `${awarenessProject} enriched the unresolved follow-up`);
    assert(/which project/i.test(follow.text), follow.text);
    assert(!/GitHub repository URL string|Octokit|SQLAlchemy persists|no live database connection/i.test(follow.text), follow.text);
    assert(follow.memory.lastProject == null, `${awarenessProject} stored ${follow.memory.lastProject}`);
    assert(follow.memory.lastCommitment?.pendingProject === true, 'pending clarification was cleared');
    assert(follow.memory.lastCommitment?.aspect === 'database', follow.memory.lastCommitment?.aspect);
  }
});

test('repeating an unresolved database follow-up keeps asking which project', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  const again = await composeTurn('What about its database?', memory, { awarenessProject: 'placementpro' });
  assert(again.reasoning.task === 'context_clarify', again.reasoning.task);
  assert(again.bound.query === 'What about its database?', again.bound.query);
  assert(/which project/i.test(again.text), again.text);
  assert(!/GitHub repository URL string|SQLAlchemy persists|no live database connection/i.test(again.text), again.text);
  assert(again.memory.lastProject == null, `stored ${again.memory.lastProject}`);
  assert(again.memory.lastCommitment?.pendingProject === true, 'pending clarification was cleared');
});

test('naming a project resolves the pending database clarification', async () => {
  const cases = [
    ['QueryForgeAI', 'queryforge', /no live database connection/i, /GitHub repository URL string|SQLAlchemy persists auth_users/i],
    ['Placement Pro+', 'placementpro', /SQLAlchemy persists auth_users/i, /GitHub repository URL string|no live database connection/i],
    ['RepoRadar', 'reporadar', /GitHub repository URL string/i, /SQLAlchemy persists auth_users|no live database connection/i],
  ];
  for (const [choice, id, expectText, rejectText] of cases) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does it use?', memory);
    await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
    const selected = await composeTurn(choice, memory, { awarenessProject: id === 'reporadar' ? 'queryforge' : 'reporadar' });
    assert(selected.reasoning.task === `${id}_detail`, `${choice} task ${selected.reasoning.task}`);
    assert(selected.reasoning.aspect === 'database', `${choice} aspect ${selected.reasoning.aspect}`);
    assert(selected.memory.lastProject === id, `${choice} stored ${selected.memory.lastProject}`);
    assert(selected.memory.lastCommitment?.pendingProject !== true, `${choice} left the clarification pending`);
    assert(expectText.test(selected.text), `${choice} :: ${selected.text.slice(0, 180)}`);
    assert(!rejectText.test(selected.text), `${choice} :: ${selected.text.slice(0, 180)}`);

    const again = await composeTurn('What about its database?', memory, { awarenessProject: id === 'reporadar' ? 'queryforge' : 'reporadar' });
    assert(again.memory.lastProject === id, `${choice} follow-up stored ${again.memory.lastProject}`);
    assert(again.reasoning.task === `${id}_detail`, `${choice} follow-up task ${again.reasoning.task}`);
    assert(expectText.test(again.text), `${choice} follow-up :: ${again.text.slice(0, 180)}`);
    assert(!rejectText.test(again.text), `${choice} follow-up :: ${again.text.slice(0, 180)}`);
  }
});

test('a project named inside the follow-up resolves that project', async () => {
  const cases = [
    ['What about QueryForgeAI\'s database?', 'queryforge', /no live database connection/i],
    ['What about Placement Pro+\'s database?', 'placementpro', /SQLAlchemy persists auth_users/i],
    ['What about RepoRadar\'s database?', 'reporadar', /GitHub repository URL string/i],
  ];
  for (const [question, id, expectText] of cases) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does it use?', memory);
    const named = await composeTurn(question, memory, { awarenessProject: id === 'queryforge' ? 'reporadar' : 'queryforge' });
    assert(named.bound.focusProject === id, `${question} focus ${named.bound.focusProject}`);
    assert(named.reasoning.task === `${id}_detail`, `${question} task ${named.reasoning.task}`);
    assert(named.memory.lastProject === id, `${question} stored ${named.memory.lastProject}`);
    assert(named.memory.lastCommitment?.pendingProject !== true, `${question} stayed pending`);
    assert(expectText.test(named.text), `${question} :: ${named.text.slice(0, 180)}`);
    assert(!/which project do you mean/i.test(named.text), named.text);
  }
});

test('comparison follow-ups still cover both projects when a card is in view', async () => {
  const memory = createPipelineMemory();
  const awarenessProject = 'reporadar';
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject });
  assert(compared.reasoning.task === 'cross_project_compare', compared.reasoning.task);
  assert(/QueryForgeAI/i.test(compared.text) && /Placement Pro/i.test(compared.text), compared.text);

  const which = await composeTurn('Which one uses Flask?', memory, { awarenessProject });
  assert(which.reasoning.task === 'cross_project_compare', which.reasoning.task);
  assert(which.reasoning.projectIds?.includes('queryforge') && which.reasoning.projectIds?.includes('placementpro'), which.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(which.text) && /Placement Pro/i.test(which.text), which.text);
  assert(/FastAPI/i.test(which.text) && /Flask/i.test(which.text), which.text);
  assert(which.text.trim().length > 0, 'empty flask answer');

  const database = await composeTurn('What about its database?', memory, { awarenessProject });
  assert(database.reasoning.task === 'cross_project_compare', database.reasoning.task);
  assert(database.reasoning.projectIds?.includes('queryforge') && database.reasoning.projectIds?.includes('placementpro'), database.reasoning.projectIds);
  assert(/no live database/i.test(database.text) && /SQLAlchemy/i.test(database.text), database.text);
  assert(!/GitHub repository URL string/i.test(database.text), database.text);

  const frontend = await composeTurn('And the frontend?', memory, { awarenessProject });
  assert(frontend.text.trim().length > 0, 'empty frontend answer');
  assert(frontend.reasoning.task === 'cross_project_compare', frontend.reasoning.task);
  assert(frontend.reasoning.projectIds?.includes('queryforge') && frontend.reasoning.projectIds?.includes('placementpro'), frontend.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(frontend.text) && /Placement Pro/i.test(frontend.text), frontend.text);
  assert(/React/i.test(frontend.text), frontend.text);
});

test('an explicit project switch is not replaced by the viewport project', async () => {
  const memory = createPipelineMemory();
  const established = await composeTurn('Tell me about QueryForgeAI.', memory, { awarenessProject: 'reporadar' });
  assert(established.memory.lastProject === 'queryforge', established.memory.lastProject);

  const switched = await composeTurn('What about Placement Pro+?', memory, { awarenessProject: 'reporadar' });
  assert(switched.bound.focusProject === 'placementpro', switched.bound.focusProject);
  assert(switched.memory.lastProject === 'placementpro', switched.memory.lastProject);
  assert(/Placement Pro/i.test(switched.text), switched.text);
  assert(!/GitHub repository URL string/i.test(switched.text), switched.text);

  const database = await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  assert(database.memory.lastProject === 'placementpro', `stored ${database.memory.lastProject}`);
  assert(database.reasoning.task === 'placementpro_detail', database.reasoning.task);
  assert(/SQLAlchemy persists auth_users/i.test(database.text), database.text);
  assert(!/GitHub repository URL string/i.test(database.text), database.text);
  assert(!/no live database connection/i.test(database.text), database.text);
});

test('an unrelated identity question does not resolve a pending project', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  const identity = await composeTurn('Who are you?', memory, { awarenessProject: 'reporadar' });
  assert(identity.reasoning.task === 'identity', identity.reasoning.task);
  assert(/digital brain/i.test(identity.text), identity.text);
  assert(identity.memory.lastProject == null, `stored ${identity.memory.lastProject}`);
  assert(identity.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(identity.memory.lastCommitment?.aspect === 'backend', identity.memory.lastCommitment?.aspect);

  const follow = await composeTurn('What about its database?', memory, { awarenessProject: 'queryforge' });
  assert(follow.reasoning.task === 'context_clarify', follow.reasoning.task);
  assert(follow.bound.query === 'What about its database?', follow.bound.query);
  assert(/which project/i.test(follow.text), follow.text);
  assert(!/no live database connection|SQLAlchemy persists|GitHub repository URL/i.test(follow.text), follow.text);
  assert(follow.memory.lastProject == null, `stored ${follow.memory.lastProject}`);
  assert(follow.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(follow.memory.lastCommitment?.aspect === 'database', follow.memory.lastCommitment?.aspect);
});

test('a portfolio question does not select QueryForge from the assistant answer', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  const brand = await composeTurn('What is SRIIVERSEAI?', memory, { awarenessProject: 'reporadar' });
  assert(brand.reasoning.task === 'brand_explain', brand.reasoning.task);
  assert(/SRIIVERSEAI/i.test(brand.text), brand.text);
  assert(brand.memory.lastProject == null, `stored ${brand.memory.lastProject}`);
  assert(brand.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(brand.memory.lastCommitment?.aspect === 'backend', brand.memory.lastCommitment?.aspect);

  const follow = await composeTurn('What about its database?', memory, { awarenessProject: 'queryforge' });
  assert(follow.reasoning.task === 'context_clarify', follow.reasoning.task);
  assert(follow.bound.query === 'What about its database?', follow.bound.query);
  assert(follow.memory.lastProject == null, `stored ${follow.memory.lastProject}`);
  assert(follow.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(!/no live database connection/i.test(follow.text), follow.text);
});

test('a learning question does not bind a project during clarification', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  const learn = await composeTurn('What should I learn next?', memory, { awarenessProject: 'reporadar' });
  assert(learn.reasoning.task === 'learn_next', learn.reasoning.task);
  assert(learn.memory.lastProject == null, `stored ${learn.memory.lastProject}`);
  assert(learn.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(learn.memory.lastCommitment?.aspect === 'backend', learn.memory.lastCommitment?.aspect);

  const follow = await composeTurn('What about its database?', memory, { awarenessProject: 'queryforge' });
  assert(follow.reasoning.task === 'context_clarify', follow.reasoning.task);
  assert(follow.memory.lastProject == null, `stored ${follow.memory.lastProject}`);
  assert(follow.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(follow.bound.enriched === false, 'viewport resolved the pending choice');
});

test('a greeting leaves the pending project choice in place', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  const hello = await composeTurn('Hello', memory, { awarenessProject: 'queryforge' });
  assert(/welcome/i.test(hello.text), hello.text);
  assert(hello.memory.lastProject == null, `stored ${hello.memory.lastProject}`);
  assert(hello.memory.lastCommitment?.pendingProject === true, 'pending choice was cleared');
  assert(hello.memory.lastCommitment?.aspect === 'backend', hello.memory.lastCommitment?.aspect);

  const follow = await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  assert(follow.reasoning.task === 'context_clarify', follow.reasoning.task);
  assert(follow.memory.lastProject == null, `stored ${follow.memory.lastProject}`);
  assert(/which project/i.test(follow.text), follow.text);
});

test('an explicit aspect question replaces the pending database aspect', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  const validation = await composeTurn('How does QueryForgeAI handle validation?', memory, { awarenessProject: 'reporadar' });
  assert(validation.reasoning.task === 'queryforge_detail', validation.reasoning.task);
  assert(validation.reasoning.focus === 'qf-validation', validation.reasoning.focus);
  assert(validation.reasoning.focus !== 'qf-limitations', validation.reasoning.focus);
  assert(/static post-parse validator/i.test(validation.text), validation.text);
  assert(!/no live database connection/i.test(validation.text), validation.text);
  assert(validation.memory.lastProject === 'queryforge', `stored ${validation.memory.lastProject}`);
  assert(validation.memory.lastCommitment?.pendingProject !== true, 'clarification stayed pending');
});

test('a bare name after a backend clarification answers the backend clause', async () => {
  const memory = createPipelineMemory();
  const clarify = await composeTurn('What backend does it use?', memory);
  assert(clarify.memory.lastCommitment?.aspect === 'backend', clarify.memory.lastCommitment?.aspect);
  const selected = await composeTurn('QueryForgeAI', memory, { awarenessProject: 'reporadar' });
  assert(selected.reasoning.task === 'queryforge_detail', selected.reasoning.task);
  assert(selected.reasoning.focus === 'qf-architecture', selected.reasoning.focus);
  assert(selected.reasoning.aspect === 'backend', selected.reasoning.aspect);
  assert(/FastAPI/i.test(selected.text) && /Uvicorn/i.test(selected.text), selected.text);
  assert(!/React \+ Vite/i.test(selected.text), selected.text);
  assert(selected.memory.lastProject === 'queryforge', `stored ${selected.memory.lastProject}`);
  assert(selected.memory.lastCommitment?.pendingProject !== true, 'clarification stayed pending');
});

test('a comparison does not bind one side as the active project', async () => {
  const memory = createPipelineMemory();
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  assert(compared.reasoning.task === 'cross_project_compare', compared.reasoning.task);
  assert(compared.reasoning.projectIds?.includes('queryforge'), compared.reasoning.projectIds);
  assert(compared.reasoning.projectIds?.includes('placementpro'), compared.reasoning.projectIds);
  assert(compared.memory.lastProject == null, `stored ${compared.memory.lastProject}`);
  assert(compared.memory.lastCommitment?.projectId == null, compared.memory.lastCommitment?.projectId);
  assert(compared.memory.lastCommitment?.pendingProject !== true, 'comparison stayed a clarification');

  const database = await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  assert(database.reasoning.task === 'cross_project_compare', database.reasoning.task);
  assert(database.memory.lastProject == null, `stored ${database.memory.lastProject}`);
  assert(database.reasoning.projectIds?.includes('queryforge') && database.reasoning.projectIds?.includes('placementpro'), database.reasoning.projectIds);
  assert(/no live database/i.test(database.text) && /SQLAlchemy/i.test(database.text), database.text);
  assert(database.text.trim().length > 0, 'empty comparison database answer');
});

test('a comparison follow-up keeps both projects', async () => {
  const memory = createPipelineMemory();
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory);
  assert(compared.reasoning.task === 'cross_project_compare', compared.reasoning.task);
  assert(compared.reasoning.projectIds?.includes('queryforge'), compared.reasoning.projectIds);
  assert(compared.reasoning.projectIds?.includes('placementpro'), compared.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(compared.text) && /Placement Pro/i.test(compared.text), compared.text);

  const which = await composeTurn('Which one uses Flask?', memory);
  assert(which.reasoning.task === 'cross_project_compare', which.reasoning.task);
  assert(which.reasoning.projectIds?.includes('queryforge'), which.reasoning.projectIds);
  assert(which.reasoning.projectIds?.includes('placementpro'), which.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(which.text) && /Placement Pro/i.test(which.text), which.text);
  assert(/FastAPI/i.test(which.text) && /Flask/i.test(which.text), which.text);
  assert(which.reasoning.task !== 'queryforge_detail', which.reasoning.task);

  const database = await composeTurn('What about its database?', memory);
  assert(database.reasoning.task === 'cross_project_compare', database.reasoning.task);
  assert(database.reasoning.projectIds?.includes('queryforge'), database.reasoning.projectIds);
  assert(database.reasoning.projectIds?.includes('placementpro'), database.reasoning.projectIds);
  assert(/no live database/i.test(database.text) && /SQLAlchemy/i.test(database.text), database.text);

  const frontend = await composeTurn('And the frontend?', memory);
  assert(frontend.text.trim().length > 0, 'empty frontend answer');
  assert(frontend.reasoning.task === 'cross_project_compare', frontend.reasoning.task);
  assert(frontend.reasoning.task !== 'queryforge_detail', frontend.reasoning.task);
  assert(frontend.reasoning.projectIds?.includes('queryforge'), frontend.reasoning.projectIds);
  assert(frontend.reasoning.projectIds?.includes('placementpro'), frontend.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(frontend.text) && /Placement Pro/i.test(frontend.text), frontend.text);
  assert(/React/i.test(frontend.text), frontend.text);
});

await Promise.all(pending);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
