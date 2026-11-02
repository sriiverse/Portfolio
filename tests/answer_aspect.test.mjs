/**
 * Regression: question aspect routing, grounded answers, retrieval scope,
 * follow-ups, and brochure/card duplication.
 * Run: node tests/answer_aspect.test.mjs
 */
import { readFileSync } from 'node:fs';
import { buildQuestionFrame, classifyAnswerAspect, enrichBoundContext, isBoundFollowUpQuery, suggestFollowupAngles } from '../src/assistant/conversation.js';
import { QUERYFORGE_FACETS } from '../src/assistant/queryforgeKnowledge.js';
import { PLACEMENTPRO_FACETS } from '../src/assistant/placementproKnowledge.js';
import { REPORADAR_FACETS } from '../src/assistant/reporadarKnowledge.js';
import { resolveEntities, assessConfidence, matchTaxonomyEntities } from '../src/assistant/entities.js';
import { analyzeJobDescription } from '../src/assistant/jdmatch.js';
import { buildEvidenceSet, retrieveScoped } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import { classifyReasoningStrategy, isIncidentalProjectMention, synthesizeReasoning, taskAvoidsProjectSelection } from '../src/assistant/reasoning.js';
import { getIdentityClaimById } from '../src/assistant/identity.js';
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

function displayedFacetLabel(facet) {
  const title = String(facet.title || '').trim();
  const parts = title.split(/\s[—–]\s/);
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

function facetForDisplayedLabel(projectId, label) {
  const facets = {
    queryforge: QUERYFORGE_FACETS,
    placementpro: PLACEMENTPRO_FACETS,
    reporadar: REPORADAR_FACETS,
  }[projectId] || [];
  const matches = facets.filter((facet) => displayedFacetLabel(facet).toLowerCase() === String(label).toLowerCase());
  return matches.length === 1 ? matches[0] : null;
}

function answerSharesFacet(answer, facetText) {
  const compact = String(facetText || '').replace(/\s+/g, ' ');
  const spoken = String(answer || '').replace(/\s+/g, ' ');
  for (let i = 0; i < compact.length - 24; i += 8) {
    const slice = compact.slice(i, i + 28);
    if (/[A-Za-z]{4}/.test(slice) && spoken.includes(slice)) return true;
  }
  return false;
}

function offeredLabels(text) {
  const offer = String(text || '').match(/you can ask about ([^.]+)\./i);
  if (!offer) return [];
  return offer[1].split(/,| or /).map((part) => part.trim()).filter(Boolean);
}

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
  const awareness = awarenessProject ? { currentProject: awarenessProject } : undefined;
  const questionFrame = buildQuestionFrame(bound.query, {
    intent: null,
    focusProject: bound.focusProject,
    memory,
    awareness,
  });
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
  const resolved = (isIncidentalProjectMention(userText) || taskAvoidsProjectSelection(reasoning.task))
    ? null
    : (bound.focusProject || response.payload?.project?.id || null);
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

test('an unscoped architecture question asks which project', async () => {
  const memory = createPipelineMemory();
  const turn = await composeTurn('Explain the architecture', memory);
  assert(turn.text.trim().length > 0, 'empty architecture answer');
  assert(turn.reasoning.task === 'context_clarify', turn.reasoning.task);
  assert(turn.reasoning.aspect === 'architecture', turn.reasoning.aspect);
  assert(/which project/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject == null, `stored ${turn.memory.lastProject}`);
  assert(turn.memory.lastCommitment?.pendingProject === true, 'clarification was not left pending');
  assert(!/FastAPI \+ Uvicorn|Flask 3\.1|GET \/api\/analyze/i.test(turn.text), turn.text);
});

test('an explicit architecture question overrides the visible project', async () => {
  const memory = createPipelineMemory();
  const turn = await composeTurn('Explain the architecture of QueryForgeAI', memory, { awarenessProject: 'reporadar' });
  assert(turn.reasoning.task === 'queryforge_detail', turn.reasoning.task);
  assert(turn.reasoning.aspect === 'architecture', turn.reasoning.aspect);
  assert(/FastAPI/i.test(turn.text) && /Uvicorn/i.test(turn.text), turn.text);
  assert(!/GET \/api\/analyze/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject === 'queryforge', `stored ${turn.memory.lastProject}`);
});

test('an established project keeps the architecture follow-up', async () => {
  const memory = createPipelineMemory();
  await composeTurn('Tell me about QueryForgeAI.', memory);
  const turn = await composeTurn('Explain the architecture', memory, { awarenessProject: 'reporadar' });
  assert(turn.reasoning.task === 'queryforge_detail', turn.reasoning.task);
  assert(turn.reasoning.focus === 'qf-architecture', turn.reasoning.focus);
  assert(/FastAPI/i.test(turn.text) && /Uvicorn/i.test(turn.text), turn.text);
  assert(!/which project do you mean/i.test(turn.text), turn.text);
  assert(!/GET \/api\/analyze/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject === 'queryforge', `stored ${turn.memory.lastProject}`);
});

test('a pending clarification is not resolved by an architecture question on a visible card', async () => {
  const memory = createPipelineMemory();
  await composeTurn('What backend does it use?', memory);
  const turn = await composeTurn('Explain the architecture', memory, { awarenessProject: 'reporadar' });
  assert(turn.reasoning.task === 'context_clarify', turn.reasoning.task);
  assert(turn.reasoning.aspect === 'architecture', turn.reasoning.aspect);
  assert(/which project/i.test(turn.text), turn.text);
  assert(!/GET \/api\/analyze/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject == null, `stored ${turn.memory.lastProject}`);
  assert(turn.memory.lastCommitment?.pendingProject === true, 'pending choice was resolved');
  assert(turn.bound.focusProject == null, turn.bound.focusProject);

  const named = await composeTurn('QueryForgeAI', memory, { awarenessProject: 'reporadar' });
  assert(named.reasoning.task === 'queryforge_detail', named.reasoning.task);
  assert(named.reasoning.aspect === 'architecture', named.reasoning.aspect);
  assert(/FastAPI/i.test(named.text) && /Uvicorn/i.test(named.text), named.text);
  assert(!/GET \/api\/analyze/i.test(named.text), named.text);
  assert(named.memory.lastProject === 'queryforge', `stored ${named.memory.lastProject}`);
});

test('a visible card can answer architecture only when nothing else is bound', async () => {
  const memory = createPipelineMemory();
  const turn = await composeTurn('Explain the architecture', memory, { awarenessProject: 'reporadar' });
  assert(turn.reasoning.task === 'reporadar_detail', turn.reasoning.task);
  assert(turn.reasoning.aspect === 'architecture', turn.reasoning.aspect);
  assert(/Next\.js/i.test(turn.text), turn.text);
  assert(/\/api\/analyze/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject === 'reporadar', `stored ${turn.memory.lastProject}`);
});

test('an architecture follow-up keeps an active comparison', async () => {
  const memory = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const turn = await composeTurn('Explain the architecture', memory, { awarenessProject: 'reporadar' });
  assert(turn.text.trim().length > 0, 'empty comparison architecture answer');
  assert(turn.reasoning.task === 'cross_project_compare', turn.reasoning.task);
  assert(turn.reasoning.lens === 'architecture', turn.reasoning.lens);
  assert(turn.reasoning.projectIds?.includes('queryforge') && turn.reasoning.projectIds?.includes('placementpro'), turn.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(turn.text) && /Placement Pro/i.test(turn.text), turn.text);
  assert(/FastAPI/i.test(turn.text) && /Flask/i.test(turn.text), turn.text);
  assert(!/GET \/api\/analyze/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject == null, `stored ${turn.memory.lastProject}`);
});

test('a portfolio-wide architecture question stays general', async () => {
  const memory = createPipelineMemory();
  const turn = await composeTurn('Explain the overall architecture', memory, { awarenessProject: 'reporadar' });
  assert(turn.text.trim().length > 0, 'empty overall architecture answer');
  assert(turn.reasoning.task === 'arch_why', turn.reasoning.task);
  assert(/five-layer/i.test(turn.text), turn.text);
  assert(turn.memory.lastProject == null, `stored ${turn.memory.lastProject}`);
});

test('a bare project name keeps the pending frontend aspect', async () => {
  const memory = createPipelineMemory();
  const clarify = await composeTurn('What frontend does it use?', memory);
  assert(clarify.reasoning.task === 'context_clarify', clarify.reasoning.task);
  assert(clarify.reasoning.aspect === 'frontend', clarify.reasoning.aspect);
  assert(clarify.memory.lastCommitment?.aspect === 'frontend', clarify.memory.lastCommitment?.aspect);
  assert(/which project/i.test(clarify.text), clarify.text);
  assert(clarify.memory.lastProject == null, `stored ${clarify.memory.lastProject}`);

  const selected = await composeTurn('Placement Pro+', memory, { awarenessProject: 'reporadar' });
  assert(selected.reasoning.task === 'placementpro_detail', selected.reasoning.task);
  assert(selected.reasoning.aspect === 'frontend', selected.reasoning.aspect);
  assert(selected.reasoning.focus === 'pp-architecture', selected.reasoning.focus);
  assert(/React 19/i.test(selected.text), selected.text);
  assert(!/Flask 3\.1/i.test(selected.text), selected.text);
  assert(!/GET \/api\/analyze/i.test(selected.text), selected.text);
  assert(selected.memory.lastProject === 'placementpro', `stored ${selected.memory.lastProject}`);
  assert(selected.memory.lastCommitment?.pendingProject !== true, 'clarification stayed pending');
});

test('a frontend follow-up stays on the established project', async () => {
  const queryforge = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', queryforge);
  const frontend = await composeTurn('What about its frontend?', queryforge, { awarenessProject: 'reporadar' });
  assert(frontend.reasoning.task === 'queryforge_detail', frontend.reasoning.task);
  assert(frontend.reasoning.aspect === 'frontend', frontend.reasoning.aspect);
  assert(/React \+ Vite/i.test(frontend.text), frontend.text);
  assert(!/FastAPI \+ Uvicorn/i.test(frontend.text), frontend.text);
  assert(!/Optimize database queries/i.test(frontend.text), frontend.text);
  assert(frontend.memory.lastProject === 'queryforge', `stored ${frontend.memory.lastProject}`);

  const radar = createPipelineMemory();
  await composeTurn('What backend does RepoRadar use?', radar);
  const radarFrontend = await composeTurn('What about its frontend?', radar, { awarenessProject: 'queryforge' });
  assert(radarFrontend.reasoning.task === 'reporadar_detail', radarFrontend.reasoning.task);
  assert(radarFrontend.reasoning.aspect === 'frontend', radarFrontend.reasoning.aspect);
  assert(/Next\.js 14/i.test(radarFrontend.text), radarFrontend.text);
  assert(!/GET \/api\/analyze/i.test(radarFrontend.text), radarFrontend.text);
  assert(radarFrontend.memory.lastProject === 'reporadar', `stored ${radarFrontend.memory.lastProject}`);
});

test('an identity question does not drop an active comparison', async () => {
  const memory = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const identity = await composeTurn('Who are you?', memory, { awarenessProject: 'reporadar' });
  assert(identity.reasoning.task === 'identity', identity.reasoning.task);
  assert(/digital brain/i.test(identity.text), identity.text);
  assert(identity.memory.lastProject == null, `stored ${identity.memory.lastProject}`);
  assert(identity.memory.lastCommitment?.projectIds?.includes('queryforge'), identity.memory.lastCommitment?.projectIds);
  assert(identity.memory.lastCommitment?.projectIds?.includes('placementpro'), identity.memory.lastCommitment?.projectIds);

  const database = await composeTurn('What about its database?', memory, { awarenessProject: 'reporadar' });
  assert(database.reasoning.task === 'cross_project_compare', database.reasoning.task);
  assert(database.reasoning.projectIds?.includes('queryforge') && database.reasoning.projectIds?.includes('placementpro'), database.reasoning.projectIds);
  assert(/no live database/i.test(database.text) && /SQLAlchemy/i.test(database.text), database.text);
  assert(!/GitHub repository URL string/i.test(database.text), database.text);
  assert(database.memory.lastProject == null, `stored ${database.memory.lastProject}`);
});

test('an unmatched question is not an empty answer', async () => {
  const second = await composeTurn('The second one', createPipelineMemory());
  assert(second.text.trim().length > 0, 'empty second-one answer');
  assert(/don't have that in Sudhanshu's portfolio/i.test(second.text), second.text);
  assert(second.reasoning.task == null, second.reasoning.task);
  assert(second.memory.lastProject == null, `stored ${second.memory.lastProject}`);

  const cache = await composeTurn('Explain exactly how the cache works', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(cache.text.trim().length > 0, 'empty cache answer');
  assert(/don't have that in Sudhanshu's portfolio/i.test(cache.text), cache.text);
  assert(cache.reasoning.task == null, cache.reasoning.task);
  assert(cache.memory.lastProject == null, `stored ${cache.memory.lastProject}`);
  assert(!/Octokit|Redis|TTLCache|repository health/i.test(cache.text), cache.text);
});

test('a project mention does not answer a pending clarification', async () => {
  const mentions = [
    'I was reading about Placement Pro+ yesterday.',
    'I saw QueryForgeAI mentioned online.',
    'RepoRadar is an interesting project.',
    'I have heard about Placement Pro+.',
    'Someone told me about QueryForgeAI.',
  ];
  for (const mention of mentions) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does it use?', memory);
    const aside = await composeTurn(mention, memory, { awarenessProject: 'reporadar' });
    assert(aside.reasoning.task === 'context_clarify', `${mention} -> ${aside.reasoning.task} :: ${aside.text.slice(0, 80)}`);
    assert(aside.reasoning.aspect === 'backend', `${mention} aspect ${aside.reasoning.aspect}`);
    assert(aside.memory.lastCommitment?.pendingProject === true, mention);
    assert(aside.memory.lastCommitment?.aspect === 'backend', mention);
    assert(aside.memory.lastProject == null, `${mention} stored ${aside.memory.lastProject}`);
    assert(/which project/i.test(aside.text), aside.text);
    assert(!/Placement\.OS|FastAPI \+ Uvicorn|repository health/i.test(aside.text), aside.text);
    const choice = await composeTurn('Placement Pro+', memory, { awarenessProject: 'queryforge' });
    assert(/Flask 3\.1/i.test(choice.text), `${mention} then choice: ${choice.text}`);
    assert(choice.memory.lastProject === 'placementpro', choice.memory.lastProject);
    assert(choice.memory.lastCommitment?.pendingProject !== true, mention);
  }
});

test('a bare project choice resolves the pending aspect', async () => {
  const choices = [
    ['Placement Pro+', 'placementpro', /Flask 3\.1/],
    ['I mean Placement Pro+.', 'placementpro', /Flask 3\.1/],
    ['The Placement Pro+ project.', 'placementpro', /Flask 3\.1/],
    ["Let's switch to RepoRadar.", 'reporadar', /GET \/api\/analyze/],
  ];
  for (const [choice, project, pattern] of choices) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does it use?', memory);
    const answer = await composeTurn(choice, memory, { awarenessProject: 'queryforge' });
    assert(pattern.test(answer.text), `${choice} :: ${answer.text}`);
    assert(answer.memory.lastProject === project, `${choice} stored ${answer.memory.lastProject}`);
    assert(answer.memory.lastCommitment?.pendingProject !== true, choice);
    assert(!/placement-preparation product|GitHub repository health and activity/i.test(answer.text), answer.text.slice(0, 140));
  }
});

test('an explicit project question is not forced into the pending aspect', async () => {
  const overview = createPipelineMemory();
  await composeTurn('What backend does it use?', overview);
  const told = await composeTurn('Tell me about Placement Pro+.', overview, { awarenessProject: 'reporadar' });
  assert(/Placement\.OS/i.test(told.text), told.text);
  assert(told.memory.lastProject === 'placementpro', told.memory.lastProject);
  assert(told.memory.lastCommitment?.pendingProject !== true, 'overview left the clarification pending');

  const direct = createPipelineMemory();
  await composeTurn('What backend does it use?', direct);
  const backend = await composeTurn('For QueryForgeAI, what backend does it use?', direct, { awarenessProject: 'reporadar' });
  assert(/FastAPI/i.test(backend.text) && /Uvicorn/i.test(backend.text), backend.text);
  assert(!/Flask 3\.1|GET \/api\/analyze/i.test(backend.text), backend.text);
  assert(backend.memory.lastProject === 'queryforge', backend.memory.lastProject);

  const visible = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', visible);
  const switched = await composeTurn('What backend does RepoRadar use?', visible, { awarenessProject: 'queryforge' });
  assert(/GET \/api\/analyze/i.test(switched.text), switched.text);
  assert(switched.memory.lastProject === 'reporadar', switched.memory.lastProject);
});

test('a project mention does not replace established context or a comparison', async () => {
  const established = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', established);
  const aside = await composeTurn('I saw RepoRadar mentioned online.', established, { awarenessProject: 'placementpro' });
  assert(aside.reasoning.task == null, aside.reasoning.task);
  assert(aside.memory.lastProject === 'queryforge', `stored ${aside.memory.lastProject}`);
  assert(aside.memory.lastCommitment?.task === 'queryforge_detail', aside.memory.lastCommitment?.task);
  assert(!/repository health|Placement\.OS/i.test(aside.text), aside.text);
  const database = await composeTurn('What about its database?', established, { awarenessProject: 'placementpro' });
  assert(database.reasoning.focus === 'qf-limitations', database.reasoning.focus);
  assert(/no live database/i.test(database.text), database.text);
  assert(!/SQLAlchemy|Octokit/i.test(database.text), database.text);

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared, { awarenessProject: 'reporadar' });
  const mention = await composeTurn('RepoRadar is an interesting project.', compared, { awarenessProject: 'reporadar' });
  assert(mention.memory.lastCommitment?.task === 'cross_project_compare', mention.memory.lastCommitment?.task);
  assert((mention.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro', (mention.memory.lastCommitment?.projectIds || []).join(','));
  assert(mention.memory.lastProject == null, mention.memory.lastProject);
  const comparedDatabase = await composeTurn('What about its database?', compared, { awarenessProject: 'reporadar' });
  assert(comparedDatabase.reasoning.task === 'cross_project_compare', comparedDatabase.reasoning.task);
  assert(/no live database/i.test(comparedDatabase.text) && /SQLAlchemy/i.test(comparedDatabase.text), comparedDatabase.text);
  assert(!/GitHub repository URL string/i.test(comparedDatabase.text), comparedDatabase.text);

  const idle = createPipelineMemory();
  const heard = await composeTurn('I have heard about Placement Pro+.', idle, { awarenessProject: 'reporadar' });
  assert(heard.reasoning.task == null, heard.reasoning.task);
  assert(heard.memory.lastProject == null, heard.memory.lastProject);
  assert(!/Placement\.OS|repository health/i.test(heard.text), heard.text);

  const interrupted = createPipelineMemory();
  await composeTurn('Who are you?', interrupted);
  const afterIdentity = await composeTurn('I saw QueryForgeAI mentioned online.', interrupted, { awarenessProject: 'reporadar' });
  assert(afterIdentity.memory.lastProject == null, afterIdentity.memory.lastProject);
  assert(afterIdentity.memory.lastCommitment?.task !== 'queryforge_detail', afterIdentity.memory.lastCommitment?.task);
  assert(!/SQL\/Mongo query generator/i.test(afterIdentity.text), afterIdentity.text);
});

test('an unresolved pointer does not select the visible project', async () => {
  const pending = createPipelineMemory();
  await composeTurn('What backend does it use?', pending);
  const that = await composeTurn('That one.', pending, { awarenessProject: 'reporadar' });
  assert(that.reasoning.task === 'context_clarify', that.reasoning.task);
  assert(that.memory.lastCommitment?.aspect === 'backend', that.memory.lastCommitment?.aspect);
  assert(that.memory.lastProject == null, that.memory.lastProject);
  assert(!/GET \/api\/analyze|repository health/i.test(that.text), that.text);
  const second = await composeTurn('The second one.', pending, { awarenessProject: 'placementpro' });
  assert(second.reasoning.task === 'context_clarify', second.reasoning.task);
  assert(!/Flask 3\.1|Placement\.OS/i.test(second.text), second.text);

  const established = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', established);
  const other = await composeTurn('The other project.', established, { awarenessProject: 'reporadar' });
  assert(other.memory.lastProject === 'queryforge', `stored ${other.memory.lastProject}`);
  assert(other.memory.lastCommitment?.task === 'queryforge_detail', other.memory.lastCommitment?.task);
  assert(!/GET \/api\/analyze|repository health|FastAPI \+ Uvicorn/i.test(other.text), other.text);

  const both = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', both);
  const secondOfPair = await composeTurn('The second one.', both, { awarenessProject: 'reporadar' });
  assert(secondOfPair.reasoning.task === 'cross_project_compare', secondOfPair.reasoning.task);
  assert(secondOfPair.memory.lastProject == null, secondOfPair.memory.lastProject);
  assert(!/GET \/api\/analyze/i.test(secondOfPair.text), secondOfPair.text);
  const them = await composeTurn('Both of them.', both, { awarenessProject: 'reporadar' });
  assert(them.reasoning.task === 'cross_project_compare', them.reasoning.task);
  assert((them.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const otherOne = await composeTurn('What about the other one?', both, { awarenessProject: 'reporadar' });
  assert(otherOne.reasoning.task === 'cross_project_compare', otherOne.reasoning.task);
  assert(otherOne.memory.lastProject == null, otherOne.memory.lastProject);
});

test('Placement Pro+ keeps its trailing plus through follow-up matching', async () => {
  assert(isBoundFollowUpQuery('How? Placement Pro+') === true, 'plus follow-up was not stripped');
  assert(isBoundFollowUpQuery('What about its frontend? Placement Pro+') === true, 'frontend plus');
  assert(isBoundFollowUpQuery('How? placement professional') === false, 'professional false match');

  const memory = createPipelineMemory();
  const backend = await composeTurn('What backend does Placement Pro+ use?', memory, { awarenessProject: 'reporadar' });
  assert(/Flask 3\.1/i.test(backend.text), backend.text);
  assert(!/GET \/api\/analyze/i.test(backend.text), backend.text);
  const database = await composeTurn('What about its database?', memory, { awarenessProject: 'queryforge' });
  assert(/SQLAlchemy/i.test(database.text), database.text);
  assert(database.reasoning.aspect === 'database', database.reasoning.aspect);
  assert(database.memory.lastProject === 'placementpro', database.memory.lastProject);
  const frontend = await composeTurn('What about its frontend?', memory, { awarenessProject: 'reporadar' });
  assert(/React 19/i.test(frontend.text), frontend.text);
  assert(frontend.reasoning.aspect === 'frontend', frontend.reasoning.aspect);
  assert(!/Flask 3\.1/i.test(frontend.text), frontend.text);

  const howMemory = createPipelineMemory();
  await composeTurn('What backend does Placement Pro+ use?', howMemory);
  const how = await composeTurn('How?', howMemory, { awarenessProject: 'reporadar' });
  assert(how.reasoning.focus === 'pp-architecture', `${how.reasoning.task} ${how.reasoning.focus}`);
  assert(how.memory.lastProject === 'placementpro', how.memory.lastProject);
  assert(!/registers\/logs in/i.test(how.text), how.text);

  const switched = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', switched);
  const next = await composeTurn('What about Placement Pro+?', switched, { awarenessProject: 'reporadar' });
  assert(next.memory.lastProject === 'placementpro', next.memory.lastProject);
  assert(/placement-preparation|Placement\.OS/i.test(next.text), next.text);
  const placedDb = await composeTurn('What about its database?', switched, { awarenessProject: 'reporadar' });
  assert(/SQLAlchemy/i.test(placedDb.text), placedDb.text);
  assert(!/no live database/i.test(placedDb.text), placedDb.text);

  const compared = createPipelineMemory();
  const pair = await composeTurn('Compare Placement Pro+ and QueryForgeAI.', compared, { awarenessProject: 'reporadar' });
  assert(pair.reasoning.task === 'cross_project_compare', pair.reasoning.task);
  const backends = await composeTurn('What about its backend?', compared, { awarenessProject: 'reporadar' });
  assert(backends.reasoning.task === 'cross_project_compare', backends.reasoning.task);
  assert(/Flask 3\.1/i.test(backends.text) && /FastAPI/i.test(backends.text), backends.text);
});

test('a bare why stays on the previous answer instead of the purpose overview', async () => {
  const cases = [
    ['What backend does QueryForgeAI use?', /FastAPI/, /SQL\/Mongo query generator/],
    ['What database does QueryForgeAI use?', /no live database/, /SQL\/Mongo query generator/],
    ['What backend does Placement Pro\+ use?', /Flask 3\.1/, /placement-preparation product/],
    ['What database does Placement Pro\+ use?', /SQLAlchemy/, /placement-preparation product/],
    ['How is the health score calculated in RepoRadar?', /heuristic/, /GitHub repository health and activity intelligence tool/],
  ];
  for (const [question, firstPattern, purposePattern] of cases) {
    const memory = createPipelineMemory();
    const first = await composeTurn(question, memory, { awarenessProject: 'placementpro' });
    assert(firstPattern.test(first.text), `${question} :: ${first.text.slice(0, 120)}`);
    const why = await composeTurn('Why?', memory, { awarenessProject: 'placementpro' });
    assert(/not documented as CODE-PROVEN|will not invent/i.test(why.text), `${question} why :: ${why.text.slice(0, 180)}`);
    assert(!purposePattern.test(why.text), `${question} why became overview :: ${why.text.slice(0, 180)}`);
    assert(why.memory.lastProject === first.memory.lastProject, `${question} project ${why.memory.lastProject}`);
    const database = await composeTurn('What about its database?', memory, { awarenessProject: 'placementpro' });
    assert(database.memory.lastProject === first.memory.lastProject, `follow-up left ${database.memory.lastProject}`);
    assert(database.reasoning.aspect === 'database', database.reasoning.aspect);
  }

  const way = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', way);
  const because = await composeTurn('Why does it work that way?', way, { awarenessProject: 'reporadar' });
  assert(because.reasoning.task === 'queryforge_unknown', because.reasoning.task);
  assert(/will not invent/i.test(because.text), because.text.slice(0, 180));
  assert(!/SQL\/Mongo query generator/i.test(because.text), because.text.slice(0, 180));
  assert(because.memory.lastProject === 'queryforge', because.memory.lastProject);
});

test('a vague explanation request does not replace the previous topic', async () => {
  for (const follow of ['Explain that.', 'What about that?', 'What does that mean?']) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does QueryForgeAI use?', memory);
    const again = await composeTurn(follow, memory, { awarenessProject: 'reporadar' });
    assert(again.reasoning.task === 'queryforge_detail', `${follow} -> ${again.reasoning.task}`);
    assert(again.reasoning.elaborate === true, follow);
    assert(/not Flask|database drivers|full documented record/i.test(again.text), again.text.slice(0, 220));
    assert(again.memory.lastProject === 'queryforge', `${follow} stored ${again.memory.lastProject}`);
    assert(again.memory.lastCommitment?.task === 'queryforge_detail', again.memory.lastCommitment?.task);
    assert(!/SQL\/Mongo query generator|repository health|don't have that in Sudhanshu/i.test(again.text), again.text.slice(0, 180));
    const database = await composeTurn('What about its database?', memory);
    assert(/no live database/i.test(database.text), database.text);
  }
});

test('an elaboration stays on the previous answer', async () => {
  const backend = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', backend);
  const explained = await composeTurn('Can you explain?', backend, { awarenessProject: 'reporadar' });
  assert(/not Flask|database drivers/i.test(explained.text), explained.text.slice(0, 240));
  assert(!/React \+ Vite/i.test(explained.text), explained.text.slice(0, 240));
  assert(explained.memory.lastProject === 'queryforge', explained.memory.lastProject);

  const database = createPipelineMemory();
  await composeTurn('What database does QueryForgeAI use?', database);
  const more = await composeTurn('Tell me more.', database, { awarenessProject: 'placementpro' });
  assert(/full documented record for QueryForgeAI/i.test(more.text), more.text);
  assert(!/SQL\/Mongo query generator/i.test(more.text), more.text.slice(0, 180));

  const architecture = createPipelineMemory();
  await composeTurn('Explain the architecture of QueryForgeAI.', architecture);
  const further = await composeTurn('Explain further.', architecture, { awarenessProject: 'reporadar' });
  assert(/outdated relative to the code|full documented record/i.test(further.text), further.text.slice(0, 220));
  assert(further.memory.lastProject === 'queryforge', further.memory.lastProject);

  const placementDb = createPipelineMemory();
  await composeTurn('What database does Placement Pro+ use?', placementDb);
  const elaborated = await composeTurn('Could you elaborate?', placementDb, { awarenessProject: 'queryforge' });
  assert(/full documented record for Placement Pro\+/i.test(elaborated.text), elaborated.text);
  assert(!/FastAPI \+ Uvicorn/i.test(elaborated.text), elaborated.text);

  const frontend = createPipelineMemory();
  await composeTurn('What frontend does Placement Pro+ use?', frontend);
  const broken = await composeTurn('Can you break that down?', frontend, { awarenessProject: 'reporadar' });
  assert(/full documented record for Placement Pro\+/i.test(broken.text), broken.text);
  assert(!/Flask 3\.1/i.test(broken.text), broken.text);

  const scoring = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', scoring);
  const scoreExplain = await composeTurn('Can you explain that?', scoring, { awarenessProject: 'queryforge' });
  assert(/full documented record for RepoRadarAI/i.test(scoreExplain.text), scoreExplain.text);
  assert(!/GitHub repository health and activity intelligence tool/i.test(scoreExplain.text), scoreExplain.text.slice(0, 180));

  const method = createPipelineMemory();
  await composeTurn('How does RepoRadar analyze a repository?', method);
  const details = await composeTurn('Give me more details.', method, { awarenessProject: 'placementpro' });
  assert(/full documented record for RepoRadarAI/i.test(details.text), details.text);
  assert(details.memory.lastProject === 'reporadar', details.memory.lastProject);

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared, { awarenessProject: 'reporadar' });
  const comparedMore = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  assert(comparedMore.reasoning.task === 'why_clarify', comparedMore.reasoning.task);
  assert((comparedMore.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(comparedMore.memory.lastProject == null, comparedMore.memory.lastProject);

  const pendingChoice = createPipelineMemory();
  await composeTurn('What backend does it use?', pendingChoice);
  const pendingExplain = await composeTurn('Can you explain?', pendingChoice, { awarenessProject: 'reporadar' });
  assert(pendingExplain.reasoning.task === 'context_clarify', pendingExplain.reasoning.task);
  assert(pendingExplain.memory.lastCommitment?.aspect === 'backend', pendingExplain.memory.lastCommitment?.aspect);
  assert(!/FastAPI|Flask 3\.1|GET \/api\/analyze/i.test(pendingExplain.text), pendingExplain.text);

  const switched = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', switched);
  await composeTurn("Let's switch to RepoRadar.", switched, { awarenessProject: 'queryforge' });
  const switchedMore = await composeTurn('Tell me more.', switched, { awarenessProject: 'queryforge' });
  assert(switchedMore.reasoning.task === 'reporadar_detail', switchedMore.reasoning.task);
  assert(switchedMore.reasoning.elaborate === true, switchedMore.reasoning.elaborate);
  assert(/heuristic health|not a code X-ray|full documented record/i.test(switchedMore.text), switchedMore.text.slice(0, 240));
  assert(switchedMore.memory.lastProject === 'reporadar', switchedMore.memory.lastProject);
  assert(!/FastAPI \+ Uvicorn/i.test(switchedMore.text), switchedMore.text);

  const interrupted = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', interrupted);
  await composeTurn('Who are you?', interrupted, { awarenessProject: 'reporadar' });
  const afterIdentity = await composeTurn('Can you explain?', interrupted, { awarenessProject: 'reporadar' });
  assert(afterIdentity.memory.lastProject === 'queryforge', afterIdentity.memory.lastProject);
  assert(/not Flask|database drivers/i.test(afterIdentity.text), afterIdentity.text.slice(0, 220));
  assert(!/I'm the Digital Brain/i.test(afterIdentity.text), afterIdentity.text.slice(0, 80));

  const mentioned = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', mentioned);
  await composeTurn('I was reading about RepoRadar yesterday.', mentioned, { awarenessProject: 'reporadar' });
  const afterMention = await composeTurn('Tell me more.', mentioned, { awarenessProject: 'placementpro' });
  assert(afterMention.memory.lastProject === 'queryforge', afterMention.memory.lastProject);
  assert(/not Flask|database drivers/i.test(afterMention.text), afterMention.text.slice(0, 220));
  assert(!/repository health and activity/i.test(afterMention.text), afterMention.text.slice(0, 180));

  const greeted = createPipelineMemory();
  await composeTurn('Hello', greeted);
  const afterGreeting = await composeTurn('Tell me more.', greeted, { awarenessProject: 'reporadar' });
  assert(afterGreeting.reasoning.task == null, afterGreeting.reasoning.task);
  assert(afterGreeting.memory.lastProject == null, afterGreeting.memory.lastProject);
  assert(/don't have that in Sudhanshu's portfolio/i.test(afterGreeting.text), afterGreeting.text);

  const none = await composeTurn('Can you expand on that?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(none.reasoning.task == null, none.reasoning.task);
  assert(none.memory.lastProject == null, none.memory.lastProject);
  assert(/don't have that in Sudhanshu's portfolio/i.test(none.text), none.text);
});

test('how still asks for the mechanism, and an explicit question still switches', async () => {
  const memory = createPipelineMemory();
  await composeTurn('Explain the architecture of QueryForgeAI.', memory);
  const how = await composeTurn('How?', memory, { awarenessProject: 'reporadar' });
  assert(how.reasoning.focus === 'qf-architecture', `${how.reasoning.task} ${how.reasoning.focus}`);
  assert(/not Flask|FastAPI/i.test(how.text), how.text.slice(0, 220));
  assert(!/two cloud paths/i.test(how.text), how.text.slice(0, 180));
  assert(how.memory.lastProject === 'queryforge', how.memory.lastProject);
  const worked = await composeTurn('How does that work?', memory, { awarenessProject: 'placementpro' });
  assert(worked.reasoning.focus === 'qf-architecture', worked.reasoning.focus);
  assert(worked.memory.lastProject === 'queryforge', worked.memory.lastProject);
  assert(!/SQL\/Mongo query generator/i.test(worked.text), worked.text.slice(0, 180));

  const switched = await composeTurn('What database does RepoRadar use?', memory, { awarenessProject: 'queryforge' });
  assert(switched.memory.lastProject === 'reporadar', switched.memory.lastProject);
  assert(/GitHub repository URL|Octokit/i.test(switched.text), switched.text.slice(0, 160));
});

test('an explicit project move switches, and a preference or mention does not', async () => {
  for (const phrase of ["Let's switch to RepoRadar.", 'I want to switch to RepoRadar.', 'Switch to RepoRadar.', "Now let's discuss Placement Pro+."]) {
    const memory = createPipelineMemory();
    await composeTurn('What backend does QueryForgeAI use?', memory);
    const moved = await composeTurn(phrase, memory, { awarenessProject: 'queryforge' });
    const expected = /placement/i.test(phrase) ? 'placementpro' : 'reporadar';
    assert(moved.memory.lastProject === expected, `${phrase} stored ${moved.memory.lastProject}`);
    assert(moved.memory.lastCommitment?.pendingProject !== true, phrase);
    const database = await composeTurn('What about its database?', memory, { awarenessProject: 'queryforge' });
    assert(database.memory.lastProject === expected, `${phrase} database stored ${database.memory.lastProject}`);
    if (expected === 'reporadar') assert(/Octokit|GitHub repository URL/i.test(database.text), database.text.slice(0, 160));
    else assert(/SQLAlchemy/i.test(database.text), database.text.slice(0, 160));
  }

  const prefer = createPipelineMemory();
  await composeTurn('What backend does Placement Pro+ use?', prefer);
  const preference = await composeTurn('I prefer QueryForgeAI.', prefer, { awarenessProject: 'reporadar' });
  assert(preference.reasoning.task == null, preference.reasoning.task);
  assert(preference.memory.lastProject === 'placementpro', preference.memory.lastProject);
  const mention = await composeTurn('I was reading about RepoRadar yesterday.', prefer, { awarenessProject: 'queryforge' });
  assert(mention.memory.lastProject === 'placementpro', mention.memory.lastProject);
  const database = await composeTurn('What about its database?', prefer, { awarenessProject: 'reporadar' });
  assert(/SQLAlchemy/i.test(database.text), database.text.slice(0, 160));
  assert(!/no live database|Octokit/i.test(database.text), database.text.slice(0, 160));
});

test('comparison follow-ups keep both projects', async () => {
  const why = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', why, { awarenessProject: 'reporadar' });
  const because = await composeTurn('Why?', why, { awarenessProject: 'reporadar' });
  assert(because.reasoning.task === 'cross_project_compare', because.reasoning.task);
  assert(because.reasoning.lens === 'why', because.reasoning.lens);
  assert((because.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(/not CODE-PROVEN|will not invent/i.test(because.text), because.text.slice(0, 220));
  assert(because.memory.lastProject == null, because.memory.lastProject);

  const how = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and RepoRadar.', how, { awarenessProject: 'placementpro' });
  const mechanism = await composeTurn('How?', how, { awarenessProject: 'placementpro' });
  assert(mechanism.reasoning.task === 'cross_project_compare', mechanism.reasoning.task);
  assert((mechanism.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,reporadar');
  assert(mechanism.memory.lastProject == null, mechanism.memory.lastProject);

  const chain = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', chain);
  await composeTurn('Who are you?', chain, { awarenessProject: 'reporadar' });
  const afterIdentity = await composeTurn('What about its database?', chain, { awarenessProject: 'reporadar' });
  assert(afterIdentity.reasoning.task === 'cross_project_compare', afterIdentity.reasoning.task);
  assert(/no live database/i.test(afterIdentity.text) && /SQLAlchemy/i.test(afterIdentity.text), afterIdentity.text.slice(0, 220));

  const other = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', other);
  const pointer = await composeTurn('The other one.', other, { awarenessProject: 'reporadar' });
  assert(pointer.reasoning.task === 'cross_project_compare', pointer.reasoning.task);
  assert(pointer.memory.lastProject == null, pointer.memory.lastProject);
  assert((pointer.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
});

test('a completed facet offers documented next steps without leaving the project', async () => {
  const database = createPipelineMemory();
  await composeTurn('What database does QueryForgeAI use?', database);
  const more = await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  assert(/full documented record for QueryForgeAI/i.test(more.text), more.text);
  assert(/you can ask about/i.test(more.text), more.text);
  assert(!/SQL\/Mongo query generator/i.test(more.text), more.text);
  assert(more.memory.lastProject === 'queryforge', more.memory.lastProject);
  const again = await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  assert(/full documented record for QueryForgeAI/i.test(again.text), again.text);
  assert(!/you can ask about/i.test(again.text), again.text);
  const validation = await composeTurn('What about validation?', database, { awarenessProject: 'reporadar' });
  assert(validation.reasoning.focus === 'qf-validation', `${validation.reasoning.task} ${validation.reasoning.focus}`);
  assert(/MongoDB|SQL dialects/i.test(validation.text), validation.text.slice(0, 180));
  assert(validation.memory.lastProject === 'queryforge', validation.memory.lastProject);
  assert(!/health score|heuristic 0–100/i.test(validation.text), validation.text.slice(0, 180));

  const overview = createPipelineMemory();
  const about = await composeTurn('Tell me about Placement Pro+.', overview);
  const elseAsk = await composeTurn('What else can you explain?', overview, { awarenessProject: 'queryforge' });
  assert(elseAsk.reasoning.facetMenu === true, elseAsk.reasoning.facetMenu);
  assert(/you can ask about/i.test(elseAsk.text), elseAsk.text);
  assert(/only the short version/i.test(elseAsk.text), elseAsk.text.slice(0, 180));
  assert(elseAsk.memory.lastProject === 'placementpro', elseAsk.memory.lastProject);
  assert(!about.text.slice(0, 80).length || !elseAsk.text.includes(about.text.slice(0, 80)), elseAsk.text.slice(0, 180));
  const auth = await composeTurn('How does authentication work?', overview, { awarenessProject: 'reporadar' });
  assert(auth.reasoning.focus === 'pp-auth', `${auth.reasoning.task} ${auth.reasoning.focus}`);
  assert(/JWT/i.test(auth.text), auth.text.slice(0, 160));
  assert(auth.memory.lastProject === 'placementpro', auth.memory.lastProject);

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and RepoRadar.', compared, { awarenessProject: 'placementpro' });
  const comparedMore = await composeTurn('Tell me more.', compared, { awarenessProject: 'placementpro' });
  assert(comparedMore.reasoning.task === 'why_clarify', comparedMore.reasoning.task);
  assert(comparedMore.reasoning.comparisonElaboration === true, comparedMore.reasoning.comparisonElaboration);
  assert(/keep both projects/i.test(comparedMore.text), comparedMore.text);
  assert(!/cloud path|GitHub REST caps/i.test(comparedMore.text), comparedMore.text);
  assert((comparedMore.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,reporadar');
  assert(comparedMore.memory.lastProject == null, comparedMore.memory.lastProject);
  const architecture = await composeTurn('What about the architecture?', compared, { awarenessProject: 'placementpro' });
  assert(architecture.reasoning.task === 'cross_project_compare', architecture.reasoning.task);
  assert(architecture.reasoning.lens === 'architecture', architecture.reasoning.lens);
  assert((architecture.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,reporadar');
  assert(/FastAPI/i.test(architecture.text) && /Next\.js/i.test(architecture.text), architecture.text.slice(0, 220));

  const pending = createPipelineMemory();
  await composeTurn('What database does it use?', pending);
  const pendingMore = await composeTurn('What else can you explain?', pending, { awarenessProject: 'reporadar' });
  assert(pendingMore.reasoning.task === 'context_clarify', pendingMore.reasoning.task);
  assert(pendingMore.memory.lastCommitment?.aspect === 'database', pendingMore.memory.lastCommitment?.aspect);
  assert(!/you can ask about|SQLAlchemy|no live database/i.test(pendingMore.text), pendingMore.text);

  const missing = createPipelineMemory();
  await composeTurn('Does QueryForgeAI use Kubernetes?', missing);
  const missingMore = await composeTurn('Can you explain?', missing, { awarenessProject: 'placementpro' });
  assert(missingMore.reasoning.task === 'undocumented_detail', missingMore.reasoning.task);
  assert(/QueryForgeAI/i.test(missingMore.text), missingMore.text.slice(0, 180));
  assert(!/Kubernetes is|uses Kubernetes/i.test(missingMore.text), missingMore.text.slice(0, 180));
  assert(missingMore.memory.lastProject === 'queryforge', missingMore.memory.lastProject);

  const mentioned = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', mentioned);
  await composeTurn('I saw QueryForgeAI mentioned online.', mentioned, { awarenessProject: 'queryforge' });
  const afterMention = await composeTurn('Tell me more.', mentioned, { awarenessProject: 'queryforge' });
  assert(afterMention.memory.lastProject === 'reporadar', afterMention.memory.lastProject);
  assert(/full documented record for RepoRadarAI/i.test(afterMention.text), afterMention.text);
  assert(!/SQL\/Mongo query generator/i.test(afterMention.text), afterMention.text.slice(0, 180));
});

test('an explicit facet stays on that facet instead of the purpose overview', async () => {
  const bound = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', bound);
  const architecture = await composeTurn('What about the architecture?', bound, { awarenessProject: 'reporadar' });
  assert(architecture.reasoning.focus === 'qf-architecture', architecture.reasoning.focus);
  assert(/FastAPI/i.test(architecture.text), architecture.text.slice(0, 180));
  assert(!/SQL\/Mongo query generator/i.test(architecture.text), architecture.text.slice(0, 180));
  assert(architecture.memory.lastProject === 'queryforge', architecture.memory.lastProject);
  const api = await composeTurn('What about the API surface?', bound, { awarenessProject: 'reporadar' });
  assert(api.reasoning.focus === 'qf-api', api.reasoning.focus);
  assert(/\/generate-sql|\/health/i.test(api.text), api.text.slice(0, 180));
  assert(!/External provider APIs, internal application routes/i.test(api.text), api.text.slice(0, 120));
  const failure = await composeTurn('Tell me about failure handling.', bound, { awarenessProject: 'placementpro' });
  assert(failure.reasoning.focus === 'qf-failure', failure.reasoning.focus);
  assert(/Gemini 429|HTTP 500/i.test(failure.text), failure.text.slice(0, 180));
  const database = await composeTurn('Explain the database.', bound, { awarenessProject: 'reporadar' });
  assert(database.reasoning.focus === 'qf-limitations', database.reasoning.focus);
  assert(/no live database/i.test(database.text), database.text.slice(0, 160));
  const deploy = await composeTurn('What about deployment?', bound, { awarenessProject: 'reporadar' });
  assert(deploy.reasoning.focus === 'qf-deployment', deploy.reasoning.focus);
  assert(/Netlify|Render/i.test(deploy.text), deploy.text.slice(0, 160));
  const missing = await composeTurn('What about Kubernetes?', bound, { awarenessProject: 'reporadar' });
  assert(missing.reasoning.task === 'undocumented_detail', missing.reasoning.task);
  assert(!/SQL\/Mongo query generator/i.test(missing.text), missing.text.slice(0, 180));
  assert(missing.memory.lastProject === 'queryforge', missing.memory.lastProject);

  const placement = createPipelineMemory();
  await composeTurn('What backend does Placement Pro+ use?', placement);
  const auth = await composeTurn('What about authentication?', placement, { awarenessProject: 'queryforge' });
  assert(auth.reasoning.focus === 'pp-auth', auth.reasoning.focus);
  assert(/JWT/i.test(auth.text), auth.text.slice(0, 160));
  assert(auth.memory.lastProject === 'placementpro', auth.memory.lastProject);
  const how = await composeTurn('How?', placement, { awarenessProject: 'reporadar' });
  assert(how.reasoning.focus === 'pp-auth', how.reasoning.focus);
  assert(!/React 19, TypeScript, Vite 8/i.test(how.text), how.text.slice(0, 180));
  const because = await composeTurn('Why?', placement, { awarenessProject: 'queryforge' });
  assert(because.reasoning.task === 'placementpro_unknown', because.reasoning.task);
  assert(/will not invent/i.test(because.text), because.text.slice(0, 180));

  const scoring = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', scoring);
  const scoreHow = await composeTurn('Can you explain how?', scoring, { awarenessProject: 'queryforge' });
  assert(scoreHow.reasoning.focus === 'rr-scoring', scoreHow.reasoning.focus);
  assert(!/pastes a public GitHub/i.test(scoreHow.text), scoreHow.text.slice(0, 180));
  assert(scoreHow.memory.lastProject === 'reporadar', scoreHow.memory.lastProject);
  const offer = scoreHow.text.match(/you can ask about ([^.]+)\./i);
  assert(offer, scoreHow.text.slice(0, 240));
  const labels = offer[1].split(/,| or /).map((part) => part.trim()).filter(Boolean);
  assert(labels.length > 0, scoreHow.text);
  for (const label of labels) {
    const facet = facetForDisplayedLabel('reporadar', label);
    assert(facet, `no documented facet for displayed label "${label}"`);
    assert(facet.id !== 'rr-scoring', `${label} is the facet just completed`);
    const picked = await composeTurn(`What about ${label}?`, scoring, { awarenessProject: 'queryforge' });
    assert(picked.memory.lastProject === 'reporadar', `${label} stored ${picked.memory.lastProject}`);
    assert(picked.reasoning.focus === facet.id, `${label} -> ${picked.reasoning.focus}, expected ${facet.id}`);
    assert(answerSharesFacet(picked.text, facet.text), `${label} answer did not use ${facet.id}`);
    assert(!/GitHub repository health and activity intelligence tool/i.test(picked.text), picked.text.slice(0, 160));
  }

  const unbound = await composeTurn('What about the architecture?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(unbound.reasoning.task === 'context_clarify', unbound.reasoning.task);
  assert(unbound.memory.lastProject == null, unbound.memory.lastProject);
  assert(!/Next\.js 14/i.test(unbound.text), unbound.text);

  const pending = createPipelineMemory();
  await composeTurn('What database does it use?', pending);
  const pendingArch = await composeTurn('What about the architecture?', pending, { awarenessProject: 'reporadar' });
  assert(pendingArch.reasoning.task === 'context_clarify', pendingArch.reasoning.task);
  assert(pendingArch.reasoning.aspect === 'architecture', pendingArch.reasoning.aspect);
  assert(pendingArch.memory.lastProject == null, pendingArch.memory.lastProject);
  assert(!/FastAPI|Next\.js 14/i.test(pendingArch.text), pendingArch.text);

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared, { awarenessProject: 'reporadar' });
  const comparedArch = await composeTurn('What about the architecture?', compared, { awarenessProject: 'reporadar' });
  assert(comparedArch.reasoning.task === 'cross_project_compare', comparedArch.reasoning.task);
  assert(comparedArch.reasoning.lens === 'architecture', comparedArch.reasoning.lens);
  assert((comparedArch.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(/FastAPI/i.test(comparedArch.text) && /Flask/i.test(comparedArch.text), comparedArch.text.slice(0, 220));
});

test('each displayed facet label routes to that facet', async () => {
  const cases = [
    ['reporadar', 'How is the health score calculated in RepoRadar?', 'rr-scoring', 'queryforge'],
    ['queryforge', 'What database does QueryForgeAI use?', 'qf-limitations', 'reporadar'],
    ['placementpro', 'How does authentication work in Placement Pro+?', 'pp-auth', 'queryforge'],
  ];
  for (const [projectId, seed, currentId, card] of cases) {
    const memory = createPipelineMemory();
    await composeTurn(seed, memory, { awarenessProject: card });
    const more = await composeTurn('Tell me more.', memory, { awarenessProject: card });
    const labels = offeredLabels(more.text);
    assert(labels.length > 0, `${projectId} offered nothing: ${more.text.slice(0, 180)}`);
    for (const label of labels) {
      const facet = facetForDisplayedLabel(projectId, label);
      assert(facet, `${projectId} label "${label}" is not one documented title`);
      assert(facet.id !== currentId, `${label} repeats ${currentId}`);
      const picked = await composeTurn(`What about ${label}?`, memory, { awarenessProject: card });
      assert(picked.reasoning.focus === facet.id, `${label} -> ${picked.reasoning.focus}, expected ${facet.id}`);
      assert(picked.memory.lastProject === projectId, `${label} stored ${picked.memory.lastProject}`);
      assert(answerSharesFacet(picked.text, facet.text), `${label} did not speak ${facet.id}`);
    }
  }
});

test('a new facet can offer its own menu after an earlier one', async () => {
  const scoring = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', scoring, { awarenessProject: 'queryforge' });
  const scoringMore = await composeTurn('Tell me more.', scoring, { awarenessProject: 'queryforge' });
  assert(offeredLabels(scoringMore.text).length > 0, scoringMore.text.slice(0, 180));
  const architecture = await composeTurn('What about Architecture?', scoring, { awarenessProject: 'queryforge' });
  assert(architecture.reasoning.focus === 'rr-architecture', architecture.reasoning.focus);
  const architectureMore = await composeTurn('Tell me more.', scoring, { awarenessProject: 'queryforge' });
  assert(architectureMore.reasoning.focus === 'rr-architecture', architectureMore.reasoning.focus);
  assert(offeredLabels(architectureMore.text).length > 0, architectureMore.text.slice(0, 220));
  assert(!offeredLabels(architectureMore.text).some((label) => /health scoring/i.test(label)), architectureMore.text);
  const repeated = await composeTurn('Tell me more.', scoring, { awarenessProject: 'queryforge' });
  assert(repeated.reasoning.focus === 'rr-architecture', repeated.reasoning.focus);
  assert(offeredLabels(repeated.text).length === 0, repeated.text.slice(0, 180));
  assert(/full documented record/i.test(repeated.text), repeated.text.slice(0, 160));

  const database = createPipelineMemory();
  await composeTurn('What database does QueryForgeAI use?', database, { awarenessProject: 'reporadar' });
  await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  const validation = await composeTurn('What about Validation?', database, { awarenessProject: 'reporadar' });
  assert(validation.reasoning.focus === 'qf-validation', validation.reasoning.focus);
  const validationMore = await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  assert(validationMore.reasoning.focus === 'qf-validation', validationMore.reasoning.focus);
  assert(offeredLabels(validationMore.text).length > 0, validationMore.text.slice(0, 200));
  assert(validationMore.memory.lastProject === 'queryforge', validationMore.memory.lastProject);

  const auth = createPipelineMemory();
  await composeTurn('How does authentication work in Placement Pro+?', auth, { awarenessProject: 'queryforge' });
  await composeTurn('Tell me more.', auth, { awarenessProject: 'queryforge' });
  const persistence = await composeTurn('What about Persistence?', auth, { awarenessProject: 'queryforge' });
  assert(persistence.reasoning.focus === 'pp-database', persistence.reasoning.focus);
  const persistenceMore = await composeTurn('Tell me more.', auth, { awarenessProject: 'queryforge' });
  assert(persistenceMore.reasoning.focus === 'pp-database', persistenceMore.reasoning.focus);
  assert(offeredLabels(persistenceMore.text).length > 0, persistenceMore.text.slice(0, 200));

  const switched = createPipelineMemory();
  await composeTurn('What database does QueryForgeAI use?', switched, { awarenessProject: 'reporadar' });
  await composeTurn('Tell me more.', switched, { awarenessProject: 'reporadar' });
  const move = await composeTurn("Let's switch to RepoRadar.", switched, { awarenessProject: 'queryforge' });
  assert(move.memory.lastProject === 'reporadar', move.memory.lastProject);
  await composeTurn('How is the health score calculated?', switched, { awarenessProject: 'queryforge' });
  const scoreMore = await composeTurn('Tell me more.', switched, { awarenessProject: 'queryforge' });
  assert(scoreMore.reasoning.focus === 'rr-scoring', scoreMore.reasoning.focus);
  assert(offeredLabels(scoreMore.text).length > 0, scoreMore.text.slice(0, 200));
  assert(scoreMore.memory.lastProject === 'reporadar', scoreMore.memory.lastProject);

  const identity = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', identity, { awarenessProject: 'queryforge' });
  await composeTurn('Tell me more.', identity, { awarenessProject: 'queryforge' });
  await composeTurn('What about Architecture?', identity, { awarenessProject: 'queryforge' });
  const who = await composeTurn('Who are you?', identity, { awarenessProject: 'placementpro' });
  assert(who.reasoning.task === 'identity', who.reasoning.task);
  assert(who.memory.lastProject === 'reporadar', who.memory.lastProject);
  const afterWho = await composeTurn('Tell me more.', identity, { awarenessProject: 'placementpro' });
  assert(afterWho.reasoning.focus === 'rr-architecture', afterWho.reasoning.focus);
  assert(afterWho.memory.lastProject === 'reporadar', afterWho.memory.lastProject);
  assert(offeredLabels(afterWho.text).length > 0, afterWho.text.slice(0, 200));

  const mention = createPipelineMemory();
  await composeTurn('How is the health score calculated in RepoRadar?', mention, { awarenessProject: 'queryforge' });
  const firstMenu = await composeTurn('Tell me more.', mention, { awarenessProject: 'queryforge' });
  assert(offeredLabels(firstMenu.text).length > 0, firstMenu.text.slice(0, 160));
  await composeTurn('I built QueryForgeAI last year.', mention, { awarenessProject: 'placementpro' });
  const afterMention = await composeTurn('Tell me more.', mention, { awarenessProject: 'placementpro' });
  assert(afterMention.reasoning.focus === 'rr-scoring', afterMention.reasoning.focus);
  assert(afterMention.memory.lastProject === 'reporadar', afterMention.memory.lastProject);
  assert(offeredLabels(afterMention.text).length === 0, afterMention.text.slice(0, 180));

  const overview = createPipelineMemory();
  await composeTurn('Tell me about RepoRadar.', overview, { awarenessProject: 'queryforge' });
  const firstOverview = await composeTurn('What else can you explain?', overview, { awarenessProject: 'queryforge' });
  assert(firstOverview.reasoning.facetMenu === true, firstOverview.reasoning.facetMenu);
  assert(offeredLabels(firstOverview.text).length > 0, firstOverview.text.slice(0, 160));
  const secondOverview = await composeTurn('What else can you explain?', overview, { awarenessProject: 'queryforge' });
  assert(offeredLabels(secondOverview.text).length === 0, secondOverview.text.slice(0, 180));
  assert(/full documented record/i.test(secondOverview.text), secondOverview.text.slice(0, 160));
});

test('natural API questions use the documented surface, not another facet', async () => {
  const projects = [
    ['queryforge', 'What backend does QueryForgeAI use?', 'reporadar', /\/generate-sql|\/health/i, 'qf-api', 'qf-failure'],
    ['placementpro', 'What backend does Placement Pro+ use?', 'queryforge', /\/api\/auth|skill-gap/i, 'pp-api', 'pp-failure'],
    ['reporadar', 'What backend does RepoRadar use?', 'queryforge', /\/api\/analyze/i, 'rr-api', 'rr-failure'],
  ];
  const surface = [
    'What APIs does it expose?',
    'Which endpoints are available?',
    'What routes does it have?',
    'How do clients communicate with the backend?',
    'What about the API?',
    'Explain its endpoints.',
    'What is the API surface?',
    'Tell me about its backend interface.',
  ];
  for (const [projectId, seed, card, marker, apiFocus, failureFocus] of projects) {
    for (const question of surface) {
      const memory = createPipelineMemory();
      await composeTurn(seed, memory, { awarenessProject: card });
      const turn = await composeTurn(question, memory, { awarenessProject: card });
      assert(turn.reasoning.focus === apiFocus, `${projectId} "${question}" -> ${turn.reasoning.focus}`);
      assert(turn.memory.lastProject === projectId, `${question} stored ${turn.memory.lastProject}`);
      assert(marker.test(turn.text), `${question}: ${turn.text.slice(0, 160)}`);
      assert(!/External provider APIs, internal application routes/i.test(turn.text), turn.text.slice(0, 120));
    }
    const memory = createPipelineMemory();
    await composeTurn(seed, memory, { awarenessProject: card });
    const errors = await composeTurn('What API errors can occur?', memory, { awarenessProject: card });
    assert(errors.reasoning.focus === failureFocus, `${projectId} errors -> ${errors.reasoning.focus}`);
    assert(errors.memory.lastProject === projectId, errors.memory.lastProject);
    assert(/429|500|422|400/i.test(errors.text), errors.text.slice(0, 180));
    const how = await composeTurn('How?', memory, { awarenessProject: card });
    assert(how.reasoning.focus === failureFocus, `${projectId} how after errors -> ${how.reasoning.focus}`);
    const unknown = await composeTurn('Does it have a billing API?', memory, { awarenessProject: card });
    assert(unknown.reasoning.task === 'undocumented_detail', `${projectId} billing -> ${unknown.reasoning.task} ${unknown.reasoning.focus}`);
    assert(!/billing api is|graphql/i.test(unknown.text), unknown.text.slice(0, 160));
  }

  const placement = createPipelineMemory();
  await composeTurn('What backend does Placement Pro+ use?', placement, { awarenessProject: 'queryforge' });
  const authApi = await composeTurn('Does it have an authentication API?', placement, { awarenessProject: 'queryforge' });
  assert(authApi.reasoning.focus === 'pp-auth', authApi.reasoning.focus);
  assert(/JWT/i.test(authApi.text), authApi.text.slice(0, 160));
  assert(authApi.memory.lastProject === 'placementpro', authApi.memory.lastProject);
  const authFollow = await composeTurn('What about authentication?', placement, { awarenessProject: 'reporadar' });
  assert(authFollow.reasoning.focus === 'pp-auth', authFollow.reasoning.focus);

  const queryforge = createPipelineMemory();
  await composeTurn('What backend does QueryForgeAI use?', queryforge, { awarenessProject: 'reporadar' });
  const noAuth = await composeTurn('Does it have an authentication API?', queryforge, { awarenessProject: 'reporadar' });
  assert(noAuth.reasoning.task === 'undocumented_detail', noAuth.reasoning.task);
  assert(/QueryForgeAI/i.test(noAuth.text), noAuth.text.slice(0, 160));
  assert(!/JWT|bcrypt/i.test(noAuth.text), noAuth.text.slice(0, 160));
  assert(noAuth.memory.lastProject === 'queryforge', noAuth.memory.lastProject);

  const radar = createPipelineMemory();
  await composeTurn('What backend does RepoRadar use?', radar, { awarenessProject: 'queryforge' });
  const radarAuth = await composeTurn('Does it have an authentication API?', radar, { awarenessProject: 'queryforge' });
  assert(radarAuth.reasoning.focus === 'rr-security', radarAuth.reasoning.focus);
  assert(/no application authentication/i.test(radarAuth.text), radarAuth.text.slice(0, 180));
  assert(radarAuth.memory.lastProject === 'reporadar', radarAuth.memory.lastProject);

  const external = classifyReasoningStrategy('Which external services does QueryForgeAI call?', {
    questionFrame: buildQuestionFrame('Which external services does QueryForgeAI call?', {}),
    memory: {},
  });
  assert(external.aspect === 'api', external.aspect);
  const compared = classifyReasoningStrategy('Did he use APIs in QueryForge and Placement Pro?', {
    questionFrame: buildQuestionFrame('Did he use APIs in QueryForge and Placement Pro?', {}),
    memory: {},
  });
  assert(compared.task === 'cross_project_compare', compared.task);
  assert(compared.lens === 'api', compared.lens);
});

test('facet menus skip the subject just discussed and keep hyphenated titles', async () => {
  const database = createPipelineMemory();
  await composeTurn('What database does QueryForgeAI use?', database, { awarenessProject: 'reporadar' });
  const databaseMenu = await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  const databaseLabels = offeredLabels(databaseMenu.text);
  assert(databaseLabels.length > 0, databaseMenu.text.slice(0, 180));
  assert(!databaseLabels.some((label) => /limitations/i.test(label)), databaseLabels.join(' | '));
  assert(databaseLabels.some((label) => /architecture|api surface|data flow/i.test(label)), databaseLabels.join(' | '));
  const validation = await composeTurn('What about Validation?', database, { awarenessProject: 'reporadar' });
  assert(validation.reasoning.focus === 'qf-validation', validation.reasoning.focus);
  const validationMenu = await composeTurn('Tell me more.', database, { awarenessProject: 'reporadar' });
  const validationLabels = offeredLabels(validationMenu.text);
  assert(validationLabels.length > 0, validationMenu.text.slice(0, 200));
  assert(!validationLabels.some((label) => /^limitations$/i.test(label)), validationLabels.join(' | '));
  assert(!validationLabels.some((label) => /^validation$/i.test(label)), validationLabels.join(' | '));
  assert(validationLabels.some((label) => /architecture|api surface|data flow/i.test(label)), validationLabels.join(' | '));
  for (const label of validationLabels) {
    const facet = facetForDisplayedLabel('queryforge', label);
    assert(facet && facet.id !== 'qf-validation' && facet.id !== 'qf-limitations', `${label} -> ${facet?.id}`);
    const picked = await composeTurn(`What about ${label}?`, database, { awarenessProject: 'reporadar' });
    assert(picked.reasoning.focus === facet.id, `${label} -> ${picked.reasoning.focus}`);
    assert(picked.memory.lastProject === 'queryforge', picked.memory.lastProject);
    assert(answerSharesFacet(picked.text, facet.text), label);
  }

  const cold = createPipelineMemory();
  await composeTurn('How does QueryForgeAI handle validation?', cold, { awarenessProject: 'reporadar' });
  const coldMenu = await composeTurn('Tell me more.', cold, { awarenessProject: 'reporadar' });
  const coldLabels = offeredLabels(coldMenu.text);
  assert(coldLabels.some((label) => /architecture|api surface/i.test(label)), coldLabels.join(' | '));
  assert(!coldLabels.some((label) => /^validation$/i.test(label)), coldLabels.join(' | '));

  const roadmap = createPipelineMemory();
  await composeTurn('How is the roadmap generated in Placement Pro+?', roadmap, { awarenessProject: 'queryforge' });
  const roadmapMenu = await composeTurn('Tell me more.', roadmap, { awarenessProject: 'queryforge' });
  const roadmapLabels = offeredLabels(roadmapMenu.text);
  assert(roadmapLabels.includes('Skill-gap pipeline'), roadmapLabels.join(' | '));
  assert(!roadmapLabels.some((label) => label === 'gap pipeline'), roadmapLabels.join(' | '));
  const skill = await composeTurn('What about Skill-gap pipeline?', roadmap, { awarenessProject: 'reporadar' });
  assert(skill.reasoning.focus === 'pp-skill-gap', skill.reasoning.focus);
  assert(skill.memory.lastProject === 'placementpro', skill.memory.lastProject);
  assert(/cosine|networkx|missing skills|graph node/i.test(skill.text), skill.text.slice(0, 180));
  const skillMore = await composeTurn('Tell me more.', roadmap, { awarenessProject: 'reporadar' });
  assert(skillMore.reasoning.focus === 'pp-skill-gap', skillMore.reasoning.focus);
  assert(skillMore.memory.lastProject === 'placementpro', skillMore.memory.lastProject);
  assert(!offeredLabels(skillMore.text).includes('Skill-gap pipeline'), skillMore.text.slice(0, 200));
  assert(!offeredLabels(skillMore.text).some((label) => /roadmap generation/i.test(label)), skillMore.text.slice(0, 200));

  const pending = createPipelineMemory();
  const ask = await composeTurn('What database does it use?', pending);
  assert(ask.reasoning.task === 'context_clarify', ask.reasoning.task);
  const pendingMore = await composeTurn('Tell me more.', pending, { awarenessProject: 'reporadar' });
  assert(pendingMore.reasoning.task === 'context_clarify', pendingMore.reasoning.task);
  assert(pendingMore.memory.lastCommitment?.aspect === 'database', pendingMore.memory.lastCommitment?.aspect);
  assert(pendingMore.memory.lastProject == null, pendingMore.memory.lastProject);
  assert(!/you can ask about|SQLAlchemy|no live database|Octokit/i.test(pendingMore.text), pendingMore.text.slice(0, 180));

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and RepoRadar.', compared, { awarenessProject: 'placementpro' });
  const once = await composeTurn('Tell me more.', compared, { awarenessProject: 'placementpro' });
  const twice = await composeTurn('Tell me more.', compared, { awarenessProject: 'placementpro' });
  assert(once.reasoning.task === 'why_clarify' && twice.reasoning.task === 'why_clarify', twice.reasoning.task);
  assert((twice.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,reporadar');
  assert(/keep both projects/i.test(twice.text), twice.text.slice(0, 160));
  assert(!/you can ask about/i.test(twice.text), twice.text.slice(0, 160));
});

test('a repeated comparison elaboration does not ask the same lens question', async () => {
  const firstPrompt = 'I can expand this comparison on architecture, the database, the API, or what model each one uses.';
  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared, { awarenessProject: 'reporadar' });
  const once = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  const twice = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  const third = await composeTurn('Can you explain?', compared, { awarenessProject: 'reporadar' });
  assert(once.reasoning.task === 'why_clarify' && once.reasoning.comparisonElaboration === true, once.reasoning.task);
  assert(twice.reasoning.task === 'why_clarify' && third.reasoning.task === 'why_clarify', third.reasoning.task);
  assert(once.text.includes(firstPrompt), once.text);
  assert(!twice.text.includes(firstPrompt), twice.text);
  assert(/choice is still open/i.test(twice.text), twice.text);
  assert(third.text === twice.text, third.text);
  assert(/keep both projects/i.test(third.text), third.text);
  assert((third.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(third.memory.lastProject == null, third.memory.lastProject);
  const who = await composeTurn('Who are you?', compared, { awarenessProject: 'reporadar' });
  assert(who.reasoning.task === 'identity', who.reasoning.task);
  assert((who.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const afterWho = await composeTurn('Tell me more.', compared, { awarenessProject: 'placementpro' });
  assert(afterWho.reasoning.task === 'why_clarify', afterWho.reasoning.task);
  assert(!afterWho.text.includes(firstPrompt), afterWho.text);
  assert((afterWho.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  await composeTurn('I saw RepoRadar mentioned online.', compared, { awarenessProject: 'reporadar' });
  const afterMention = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  assert(afterMention.reasoning.task === 'why_clarify', afterMention.reasoning.task);
  assert((afterMention.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(afterMention.memory.lastProject == null, afterMention.memory.lastProject);

  const lens = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', lens, { awarenessProject: 'reporadar' });
  await composeTurn('Tell me more.', lens, { awarenessProject: 'reporadar' });
  await composeTurn('Tell me more.', lens, { awarenessProject: 'reporadar' });
  const database = await composeTurn('What about the database?', lens, { awarenessProject: 'reporadar' });
  assert(database.reasoning.task === 'cross_project_compare', database.reasoning.task);
  assert(database.reasoning.lens === 'storage', database.reasoning.lens);
  assert(/no live database/i.test(database.text) && /SQLAlchemy/i.test(database.text), database.text.slice(0, 240));
  assert((database.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const more = await composeTurn('Tell me more.', lens, { awarenessProject: 'reporadar' });
  assert(more.reasoning.task === 'why_clarify', more.reasoning.task);
  assert(/database comparison is the full documented record/i.test(more.text), more.text);
  assert(/will not invent/i.test(more.text), more.text);
  assert(!/I can expand this comparison on architecture, the database/i.test(more.text), more.text);
  assert(!/\bthe database, the API\b/i.test(more.text), more.text);
  assert(/architecture/i.test(more.text) && /API/i.test(more.text) && /model/i.test(more.text), more.text);
  assert((more.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const again = await composeTurn('Tell me more.', lens, { awarenessProject: 'reporadar' });
  assert(/choice is still open/i.test(again.text), again.text);
  assert(!/full documented record/i.test(again.text), again.text);
  assert((again.memory.lastCommitment?.lens) === 'storage', again.memory.lastCommitment?.lens);

  const architecture = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and RepoRadar.', architecture, { awarenessProject: 'placementpro' });
  const arch = await composeTurn('What about the architecture?', architecture, { awarenessProject: 'placementpro' });
  assert(arch.reasoning.lens === 'architecture', arch.reasoning.lens);
  assert(/FastAPI/i.test(arch.text) && /Next\.js/i.test(arch.text), arch.text.slice(0, 220));
  const archMore = await composeTurn('Tell me more.', architecture, { awarenessProject: 'placementpro' });
  assert(/architecture comparison is the full documented record/i.test(archMore.text), archMore.text);
  assert(!/I can expand this comparison on architecture, the database/i.test(archMore.text), archMore.text);
  assert((archMore.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,reporadar');

  const switched = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', switched, { awarenessProject: 'reporadar' });
  const move = await composeTurn("Let's switch to RepoRadar.", switched, { awarenessProject: 'queryforge' });
  assert(move.memory.lastProject === 'reporadar', move.memory.lastProject);
  assert(!Array.isArray(move.memory.lastCommitment?.projectIds) || move.memory.lastCommitment.projectIds.length < 2, move.memory.lastCommitment?.projectIds);
  const movedMore = await composeTurn('Tell me more.', switched, { awarenessProject: 'queryforge' });
  assert(movedMore.reasoning.task === 'reporadar_detail', movedMore.reasoning.task);
  assert(movedMore.memory.lastProject === 'reporadar', movedMore.memory.lastProject);
  assert(!/keep both projects/i.test(movedMore.text), movedMore.text.slice(0, 160));

  const pending = createPipelineMemory();
  await composeTurn('What database does it use?', pending);
  const pendingMore = await composeTurn('Can you explain?', pending, { awarenessProject: 'reporadar' });
  assert(pendingMore.reasoning.task === 'context_clarify', pendingMore.reasoning.task);
  assert(pendingMore.memory.lastCommitment?.aspect === 'database', pendingMore.memory.lastCommitment?.aspect);
  assert(pendingMore.memory.lastProject == null, pendingMore.memory.lastProject);
  assert(!/keep both projects|SQLAlchemy|no live database/i.test(pendingMore.text), pendingMore.text.slice(0, 180));

  const unknown = createPipelineMemory();
  const kubernetes = await composeTurn('Compare how QueryForgeAI and Placement Pro+ use Kubernetes.', unknown, { awarenessProject: 'reporadar' });
  assert(kubernetes.reasoning.task === 'cross_project_compare', kubernetes.reasoning.task);
  assert(kubernetes.reasoning.lens === 'subject', kubernetes.reasoning.lens);
  assert((kubernetes.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(/don't have documented evidence of how either project uses Kubernetes/i.test(kubernetes.text), kubernetes.text.slice(0, 280));
  assert(!/neither project uses Kubernetes/i.test(kubernetes.text), kubernetes.text.slice(0, 240));
  assert(!/Kubernetes cluster|uses Kubernetes to/i.test(kubernetes.text), kubernetes.text.slice(0, 240));
  assert(!/SQL\/Mongo query generator/i.test(kubernetes.text), kubernetes.text.slice(0, 240));
});

test('an undocumented comparison subject is not replaced by the general comparison', async () => {
  const memory = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const kubernetes = await composeTurn('How do they use Kubernetes?', memory, { awarenessProject: 'reporadar' });
  assert(kubernetes.reasoning.task === 'cross_project_compare', kubernetes.reasoning.task);
  assert(kubernetes.reasoning.lens === 'subject', kubernetes.reasoning.lens);
  assert(kubernetes.reasoning.subject === 'kubernetes', kubernetes.reasoning.subject);
  assert((kubernetes.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(kubernetes.memory.lastProject == null, kubernetes.memory.lastProject);
  assert(/don't have documented evidence of how either project uses Kubernetes/i.test(kubernetes.text), kubernetes.text);
  assert(/will not treat that as proof that they do not use it/i.test(kubernetes.text), kubernetes.text);
  assert(!/neither project uses Kubernetes|Kubernetes cluster|uses Kubernetes to/i.test(kubernetes.text), kubernetes.text);
  assert(!/SQL\/Mongo query generator/i.test(kubernetes.text), kubernetes.text.slice(0, 220));

  const more = await composeTurn('Tell me more.', memory, { awarenessProject: 'reporadar' });
  assert(more.reasoning.task === 'cross_project_compare', more.reasoning.task);
  assert(more.reasoning.lens === 'subject', more.reasoning.lens);
  assert(/still don't have documented evidence of how either project uses Kubernetes/i.test(more.text), more.text);
  assert(!/SQL\/Mongo query generator/i.test(more.text), more.text.slice(0, 220));
  assert(!/I can expand this comparison on architecture, the database, the API/i.test(more.text), more.text);
  assert((more.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const again = await composeTurn('Tell me more.', memory, { awarenessProject: 'placementpro' });
  assert(/still don't have documented evidence of how either project uses Kubernetes/i.test(again.text), again.text);
  assert((again.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const who = await composeTurn('Who are you?', memory, { awarenessProject: 'reporadar' });
  assert(who.reasoning.task === 'identity', who.reasoning.task);
  assert((who.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(who.memory.lastCommitment?.lens === 'subject', who.memory.lastCommitment?.lens);
  await composeTurn('I saw RepoRadar mentioned online.', memory, { awarenessProject: 'reporadar' });
  assert((memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(memory.lastProject == null, memory.lastProject);
  const afterMention = await composeTurn('Tell me more.', memory, { awarenessProject: 'reporadar' });
  assert(/still don't have documented evidence of how either project uses Kubernetes/i.test(afterMention.text), afterMention.text);
  assert(!/SQL\/Mongo query generator/i.test(afterMention.text), afterMention.text.slice(0, 220));
  assert((afterMention.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const architecture = await composeTurn('What about the architecture?', memory, { awarenessProject: 'reporadar' });
  assert(architecture.reasoning.task === 'cross_project_compare', architecture.reasoning.task);
  assert(architecture.reasoning.lens === 'architecture', architecture.reasoning.lens);
  assert(/FastAPI/i.test(architecture.text) && /Flask/i.test(architecture.text), architecture.text.slice(0, 240));
  assert((architecture.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const architectureMore = await composeTurn('Tell me more.', memory, { awarenessProject: 'reporadar' });
  assert(architectureMore.reasoning.task === 'why_clarify', architectureMore.reasoning.task);
  assert(/architecture comparison is the full documented record/i.test(architectureMore.text), architectureMore.text);
  assert((architectureMore.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const switched = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', switched, { awarenessProject: 'reporadar' });
  await composeTurn('How do they use Kubernetes?', switched, { awarenessProject: 'reporadar' });
  const move = await composeTurn("Let's switch to RepoRadar.", switched, { awarenessProject: 'queryforge' });
  assert(move.memory.lastProject === 'reporadar', move.memory.lastProject);
  assert(!Array.isArray(move.memory.lastCommitment?.projectIds) || move.memory.lastCommitment.projectIds.length < 2, move.memory.lastCommitment?.projectIds);

  const redis = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', redis, { awarenessProject: 'reporadar' });
  const oneSided = await composeTurn('How do they use Redis?', redis, { awarenessProject: 'reporadar' });
  assert(oneSided.reasoning.lens === 'subject', oneSided.reasoning.lens);
  assert(/Redis when configured\/available/i.test(oneSided.text), oneSided.text);
  assert(/not proven as the production cache/i.test(oneSided.text), oneSided.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Redis/i.test(oneSided.text), oneSided.text);
  assert(!/QueryForgeAI does not use Redis|neither project uses Redis/i.test(oneSided.text), oneSided.text);
  assert((oneSided.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const redisMore = await composeTurn('Tell me more.', redis, { awarenessProject: 'reporadar' });
  assert(/still don't have documented evidence of how QueryForgeAI uses Redis/i.test(redisMore.text), redisMore.text);
  assert(/Redis when configured\/available/i.test(redisMore.text), redisMore.text);
  assert(!/SQL\/Mongo query generator/i.test(redisMore.text), redisMore.text.slice(0, 180));

  const gemini = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', gemini, { awarenessProject: 'reporadar' });
  const both = await composeTurn('How do they use Gemini?', gemini, { awarenessProject: 'reporadar' });
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(both.reasoning.lens === 'model', both.reasoning.lens);
  assert(/Gemini/i.test(both.text) && /does not use Gemini/i.test(both.text), both.text.slice(0, 320));
  assert(!/don't have documented evidence of how either project uses Gemini/i.test(both.text), both.text.slice(0, 240));
  assert((both.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const database = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', database, { awarenessProject: 'reporadar' });
  await composeTurn('How do they use Kubernetes?', database, { awarenessProject: 'reporadar' });
  const stored = await composeTurn('What about the database?', database, { awarenessProject: 'reporadar' });
  assert(stored.reasoning.lens === 'storage', stored.reasoning.lens);
  assert(/no live database/i.test(stored.text) && /SQLAlchemy/i.test(stored.text), stored.text.slice(0, 240));
  assert((stored.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const pending = createPipelineMemory();
  const card = await composeTurn('What about the architecture?', pending, { awarenessProject: 'reporadar' });
  assert(card.reasoning.task === 'context_clarify', card.reasoning.task);
  assert(card.memory.lastProject == null, card.memory.lastProject);
  assert(card.memory.lastCommitment?.pendingProject === true, card.memory.lastCommitment?.pendingProject);
  assert(!/Next\.js 14/i.test(card.text), card.text.slice(0, 180));

  const alone = await composeTurn('Does QueryForgeAI use Kubernetes?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(alone.reasoning.task === 'undocumented_detail', alone.reasoning.task);
  assert(/QueryForgeAI/i.test(alone.text), alone.text.slice(0, 180));
  assert(!/either project uses Kubernetes/i.test(alone.text), alone.text.slice(0, 180));
  assert(alone.memory.lastProject === 'queryforge', alone.memory.lastProject);
  const geminiAlone = await composeTurn('How does QueryForgeAI use Gemini?', createPipelineMemory());
  assert(geminiAlone.reasoning.task === 'queryforge_detail', geminiAlone.reasoning.task);
  assert(/Gemini/i.test(geminiAlone.text), geminiAlone.text.slice(0, 180));
  assert(!/either project uses Gemini/i.test(geminiAlone.text), geminiAlone.text.slice(0, 180));
});

test('a comparison subject is recognized without the use-X wording', async () => {
  const gap = /don't have documented evidence of how either project uses Kubernetes/i;
  const phrases = [
    "What's their Kubernetes setup?",
    'Compare their Kubernetes configurations.',
    "What's the difference between their Kubernetes deployments?",
    'Do both projects support Kubernetes?',
    'How does their Kubernetes integration differ?',
    'Are they using Kubernetes?',
  ];
  for (const phrase of phrases) {
    const memory = createPipelineMemory();
    await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
    const asked = await composeTurn(phrase, memory, { awarenessProject: 'reporadar' });
    assert(asked.reasoning.task === 'cross_project_compare', `${phrase} ${asked.reasoning.task}`);
    assert(asked.reasoning.lens === 'subject', `${phrase} ${asked.reasoning.lens}`);
    assert(String(asked.reasoning.subject || '').toLowerCase() === 'kubernetes', `${phrase} ${asked.reasoning.subject}`);
    assert((asked.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro', phrase);
    assert(gap.test(asked.text), `${phrase} ${asked.text.slice(0, 180)}`);
    assert(!/neither project uses Kubernetes|SQL\/Mongo query generator|not part of Sudhanshu's shipped project history/i.test(asked.text), phrase);
  }

  const memory = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  await composeTurn("What's their Kubernetes setup?", memory, { awarenessProject: 'reporadar' });
  const more = await composeTurn('Tell me more.', memory, { awarenessProject: 'reporadar' });
  assert(/still don't have documented evidence of how either project uses Kubernetes/i.test(more.text), more.text);
  assert((more.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const who = await composeTurn('Who are you?', memory, { awarenessProject: 'reporadar' });
  assert(who.reasoning.task === 'identity', who.reasoning.task);
  assert((who.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  await composeTurn('I saw RepoRadar mentioned online.', memory, { awarenessProject: 'reporadar' });
  assert(memory.lastProject == null, memory.lastProject);
  assert((memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const architecture = await composeTurn('What about the architecture?', memory, { awarenessProject: 'reporadar' });
  assert(architecture.reasoning.lens === 'architecture', architecture.reasoning.lens);
  assert(/FastAPI/i.test(architecture.text) && /Flask/i.test(architecture.text), architecture.text.slice(0, 220));
  assert((architecture.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const databases = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', databases, { awarenessProject: 'reporadar' });
  const stored = await composeTurn("What's different about their databases?", databases, { awarenessProject: 'reporadar' });
  assert(stored.reasoning.lens === 'storage', stored.reasoning.lens);
  assert(/no live database/i.test(stored.text) && /SQLAlchemy/i.test(stored.text), stored.text.slice(0, 240));
  assert(!gap.test(stored.text), stored.text.slice(0, 160));

  const apis = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', apis, { awarenessProject: 'reporadar' });
  const api = await composeTurn('Compare their APIs.', apis, { awarenessProject: 'reporadar' });
  assert(api.reasoning.lens === 'api', api.reasoning.lens);
  assert(/Gemini|\/api/i.test(api.text), api.text.slice(0, 180));
  assert(!gap.test(api.text), api.text.slice(0, 160));

  const models = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', models, { awarenessProject: 'reporadar' });
  const model = await composeTurn('How do their AI models differ?', models, { awarenessProject: 'reporadar' });
  assert(model.reasoning.lens === 'model', model.reasoning.lens);
  assert(/Gemini/i.test(model.text) && /MiniLM|does not use Gemini/i.test(model.text), model.text.slice(0, 280));
  assert(!gap.test(model.text), model.text.slice(0, 160));

  const architectures = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', architectures, { awarenessProject: 'reporadar' });
  const arch = await composeTurn('Compare their architectures.', architectures, { awarenessProject: 'reporadar' });
  assert(arch.reasoning.lens === 'architecture', arch.reasoning.lens);
  assert(/FastAPI/i.test(arch.text) && /Flask/i.test(arch.text), arch.text.slice(0, 280));
  assert(!gap.test(arch.text), arch.text.slice(0, 160));

  const redis = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', redis, { awarenessProject: 'reporadar' });
  const oneSided = await composeTurn("What's their Redis setup?", redis, { awarenessProject: 'reporadar' });
  assert(oneSided.reasoning.lens === 'subject', oneSided.reasoning.lens);
  assert(/Redis when configured\/available/i.test(oneSided.text), oneSided.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Redis/i.test(oneSided.text), oneSided.text);
  assert(!/QueryForgeAI does not use Redis/i.test(oneSided.text), oneSided.text);

  const gemini = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', gemini, { awarenessProject: 'reporadar' });
  const both = await composeTurn('Are they using Gemini?', gemini, { awarenessProject: 'reporadar' });
  assert(both.reasoning.lens === 'model', both.reasoning.lens);
  assert(/Gemini/i.test(both.text) && /does not use Gemini/i.test(both.text), both.text.slice(0, 400));
  assert(!/don't have documented evidence of how either project uses Gemini/i.test(both.text), both.text.slice(0, 200));

  const mentioned = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', mentioned, { awarenessProject: 'reporadar' });
  const aside = await composeTurn('I read about Kubernetes yesterday.', mentioned, { awarenessProject: 'reporadar' });
  assert(aside.reasoning.task === 'tech_mention', aside.reasoning.task);
  assert(/does not choose a project or start a comparison/i.test(aside.text), aside.text.slice(0, 200));
  assert(!/shipped project history|either project uses Kubernetes/i.test(aside.text), aside.text.slice(0, 200));
  assert((mentioned.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(mentioned.lastProject == null, mentioned.lastProject);

  const overview = await composeTurn('Tell me about QueryForgeAI.', createPipelineMemory());
  assert(overview.reasoning.task === 'project_overview', overview.reasoning.task);
  assert(!/either project uses/i.test(overview.text), overview.text.slice(0, 160));

  const history = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', history, { awarenessProject: 'reporadar' });
  const knows = await composeTurn('Does he know Kubernetes?', history, { awarenessProject: 'reporadar' });
  assert(knows.reasoning.task === 'portfolio_history', knows.reasoning.task);
  assert(/not part of the portfolio stack/i.test(knows.text), knows.text.slice(0, 240));
  assert(/do not document a Kubernetes implementation/i.test(knows.text), knows.text.slice(0, 280));
  assert(!/shipped project history|either project uses Kubernetes/i.test(knows.text), knows.text.slice(0, 240));
  assert((history.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const cold = await composeTurn('Are they using Kubernetes?', createPipelineMemory());
  assert(cold.reasoning.task == null, cold.reasoning.task);
  assert(/not part of the portfolio stack/i.test(cold.text), cold.text.slice(0, 240));
  assert(/do not document a Kubernetes implementation/i.test(cold.text), cold.text.slice(0, 280));
  assert(!/shipped project history/i.test(cold.text), cold.text.slice(0, 240));
  assert(cold.memory.lastProject == null, cold.memory.lastProject);

  const switched = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', switched, { awarenessProject: 'reporadar' });
  await composeTurn("What's their Kubernetes setup?", switched, { awarenessProject: 'reporadar' });
  const move = await composeTurn("Let's switch to RepoRadar.", switched, { awarenessProject: 'queryforge' });
  assert(move.memory.lastProject === 'reporadar', move.memory.lastProject);
  assert(!Array.isArray(move.memory.lastCommitment?.projectIds) || move.memory.lastCommitment.projectIds.length < 2);

  const pending = createPipelineMemory();
  const card = await composeTurn('What about the architecture?', pending, { awarenessProject: 'reporadar' });
  assert(card.reasoning.task === 'context_clarify', card.reasoning.task);
  assert(card.memory.lastProject == null, card.memory.lastProject);
  assert(card.memory.lastCommitment?.pendingProject === true);
});

test('a technology-only comparison stays on the open projects', async () => {
  const gap = /don't have documented evidence of how either project uses Kubernetes/i;
  const phrases = [
    'What about Kubernetes for both?',
    'Kubernetes on each project?',
    'Kubernetes comparison?',
    'Their Kubernetes implementations?',
  ];
  for (const phrase of phrases) {
    const memory = createPipelineMemory();
    await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
    const asked = await composeTurn(phrase, memory, { awarenessProject: 'reporadar' });
    assert(asked.reasoning.task === 'cross_project_compare', `${phrase} ${asked.reasoning.task}`);
    assert(asked.reasoning.lens === 'subject', `${phrase} ${asked.reasoning.lens}`);
    assert(String(asked.reasoning.subject || '').toLowerCase() === 'kubernetes', `${phrase} ${asked.reasoning.subject}`);
    assert((asked.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro', phrase);
    assert(asked.memory.lastProject == null, phrase);
    assert(gap.test(asked.text), `${phrase} ${asked.text.slice(0, 180)}`);
    assert(!/neither project uses Kubernetes|SQL\/Mongo query generator|not part of Sudhanshu's shipped project history/i.test(asked.text), phrase);
  }

  const memory = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  await composeTurn('What about Kubernetes for both?', memory, { awarenessProject: 'reporadar' });
  const more = await composeTurn('Tell me more.', memory, { awarenessProject: 'reporadar' });
  assert(/still don't have documented evidence of how either project uses Kubernetes/i.test(more.text), more.text);
  assert((more.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const architecture = await composeTurn('What about the architecture?', memory, { awarenessProject: 'reporadar' });
  assert(architecture.reasoning.lens === 'architecture', architecture.reasoning.lens);
  assert(/FastAPI/i.test(architecture.text) && /Flask/i.test(architecture.text), architecture.text.slice(0, 240));
  assert((architecture.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const database = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', database, { awarenessProject: 'reporadar' });
  await composeTurn('Kubernetes comparison?', database, { awarenessProject: 'reporadar' });
  const stored = await composeTurn('What about the database?', database, { awarenessProject: 'reporadar' });
  assert(stored.reasoning.lens === 'storage', stored.reasoning.lens);
  assert(/no live database/i.test(stored.text) && /SQLAlchemy/i.test(stored.text), stored.text.slice(0, 240));
  assert((stored.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  for (const phrase of ['Kubernetes comparison?', 'What about Kubernetes for both?']) {
    const cold = await composeTurn(phrase, createPipelineMemory());
    const ids = cold.memory.lastCommitment?.projectIds || [];
    assert(ids.length !== 2, `${phrase} inferred ${ids}`);
    assert(cold.reasoning.lens !== 'subject', `${phrase} ${cold.reasoning.lens}`);
    assert(cold.memory.lastProject == null, phrase);
  }

  const during = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', during, { awarenessProject: 'reporadar' });
  const aside = await composeTurn('I read about Kubernetes yesterday.', during, { awarenessProject: 'reporadar' });
  assert(aside.reasoning.task === 'tech_mention', aside.reasoning.task);
  assert(/does not choose a project or start a comparison/i.test(aside.text), aside.text);
  assert(/keep both projects/i.test(aside.text), aside.text);
  assert(!/shipped project history/i.test(aside.text), aside.text.slice(0, 200));
  assert((during.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(during.lastProject == null, during.lastProject);

  const alone = await composeTurn('I read about Kubernetes yesterday.', createPipelineMemory());
  assert(alone.reasoning.task === 'tech_mention', alone.reasoning.task);
  assert(/does not choose a project or start a comparison/i.test(alone.text), alone.text);
  assert(!/shipped project history|keep both projects/i.test(alone.text), alone.text.slice(0, 200));
  assert(alone.memory.lastProject == null, alone.memory.lastProject);
  assert(!Array.isArray(alone.memory.lastCommitment?.projectIds) || alone.memory.lastCommitment.projectIds.length < 2);

  const history = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', history, { awarenessProject: 'reporadar' });
  const knows = await composeTurn('Does he know Kubernetes?', history, { awarenessProject: 'reporadar' });
  assert(knows.reasoning.task === 'portfolio_history', knows.reasoning.task);
  assert(/not part of the portfolio stack/i.test(knows.text), knows.text.slice(0, 240));
  assert(/do not document a Kubernetes implementation/i.test(knows.text), knows.text.slice(0, 280));
  assert(!/shipped project history/i.test(knows.text), knows.text.slice(0, 240));
  assert((history.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const project = await composeTurn('Does QueryForgeAI use Kubernetes?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(project.reasoning.task === 'undocumented_detail', project.reasoning.task);
  assert(/QueryForgeAI/i.test(project.text), project.text.slice(0, 160));
  assert(!/either project uses Kubernetes/i.test(project.text), project.text.slice(0, 160));
  assert(project.memory.lastProject === 'queryforge', project.memory.lastProject);

  const redis = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', redis, { awarenessProject: 'reporadar' });
  const oneSided = await composeTurn('What about Redis for both?', redis, { awarenessProject: 'reporadar' });
  assert(oneSided.reasoning.lens === 'subject', oneSided.reasoning.lens);
  assert(/Redis when configured\/available/i.test(oneSided.text), oneSided.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Redis/i.test(oneSided.text), oneSided.text);
  assert(!/QueryForgeAI does not use Redis/i.test(oneSided.text), oneSided.text);
  assert((oneSided.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const gemini = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', gemini, { awarenessProject: 'reporadar' });
  const both = await composeTurn('What about Gemini for both?', gemini, { awarenessProject: 'reporadar' });
  assert(both.reasoning.lens === 'model', both.reasoning.lens);
  assert(/Gemini/i.test(both.text) && /does not use Gemini/i.test(both.text), both.text.slice(0, 320));
  assert((both.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
});

test('portfolio-history questions stay inside the project records', async () => {
  const kubernetes = await composeTurn('Does he know Kubernetes?', createPipelineMemory());
  assert(kubernetes.reasoning.task === 'portfolio_history', kubernetes.reasoning.task);
  assert(kubernetes.reasoning.lens == null, kubernetes.reasoning.lens);
  assert(/Kubernetes is not part of the portfolio stack/i.test(kubernetes.text), kubernetes.text);
  assert(/do not document a Kubernetes implementation/i.test(kubernetes.text), kubernetes.text);
  assert(/absence as proof it was never used/i.test(kubernetes.text), kubernetes.text);
  assert(/don't have a record of personal proficiency/i.test(kubernetes.text), kubernetes.text);
  assert(!/shipped project history|Placement Pro\+|QueryForgeAI|RepoRadar/i.test(kubernetes.text), kubernetes.text);
  assert(kubernetes.memory.lastProject == null, kubernetes.memory.lastProject);
  assert(!Array.isArray(kubernetes.memory.lastCommitment?.projectIds) || kubernetes.memory.lastCommitment.projectIds.length < 2);

  const redis = await composeTurn('Does he know Redis?', createPipelineMemory());
  assert(redis.reasoning.task === 'portfolio_history', redis.reasoning.task);
  assert(/Redis is not part of the portfolio stack/i.test(redis.text), redis.text);
  assert(/Placement Pro\+/i.test(redis.text), redis.text);
  assert(/Redis when configured\/available/i.test(redis.text), redis.text);
  assert(/not proven as the production cache/i.test(redis.text), redis.text);
  assert(/don't have a record of personal proficiency/i.test(redis.text), redis.text);
  assert(!/shipped project history|production uses Redis|QueryForgeAI/i.test(redis.text), redis.text);
  assert(redis.memory.lastProject == null, redis.memory.lastProject);

  const used = await composeTurn('Has he used Redis?', createPipelineMemory());
  assert(used.reasoning.task === 'portfolio_history', used.reasoning.task);
  assert(/Redis when configured\/available/i.test(used.text), used.text);
  assert(/not proven as the production cache/i.test(used.text), used.text);
  assert(/don't have a record of personal proficiency/i.test(used.text), used.text);
  assert(!/shipped project history|he has used Redis|production uses Redis/i.test(used.text), used.text);
  assert(used.memory.lastProject == null, used.memory.lastProject);

  const queryforge = await composeTurn('Does QueryForgeAI use Redis?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(queryforge.reasoning.task === 'undocumented_detail', queryforge.reasoning.task);
  assert(/QueryForgeAI/i.test(queryforge.text), queryforge.text.slice(0, 220));
  assert(!/when configured\/available|not proven as the production cache|shipped project history/i.test(queryforge.text), queryforge.text);
  assert(queryforge.memory.lastProject === 'queryforge', queryforge.memory.lastProject);
  assert(!Array.isArray(queryforge.memory.lastCommitment?.projectIds) || queryforge.memory.lastCommitment.projectIds.length < 2);

  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared);
  const both = await composeTurn('How do QueryForgeAI and Placement Pro+ use Redis?', compared);
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(both.reasoning.lens === 'subject', both.reasoning.lens);
  assert(/Redis when configured\/available/i.test(both.text), both.text);
  assert(/not proven as the production cache/i.test(both.text), both.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Redis/i.test(both.text), both.text);
  assert(!/shipped project history|QueryForgeAI does not use Redis/i.test(both.text), both.text);
  assert((both.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(both.memory.lastProject == null, both.memory.lastProject);

  const aside = await composeTurn('I read about Redis yesterday.', createPipelineMemory());
  assert(aside.reasoning.task === 'tech_mention', aside.reasoning.task);
  assert(/does not choose a project or start a comparison/i.test(aside.text), aside.text);
  assert(!/shipped project history|when configured\/available|personal proficiency/i.test(aside.text), aside.text);
  assert(aside.memory.lastProject == null, aside.memory.lastProject);

  const after = createPipelineMemory();
  await composeTurn('Does he know Redis?', after);
  const more = await composeTurn('Tell me more.', after);
  assert(more.reasoning.task === 'portfolio_history', more.reasoning.task);
  assert(/still don't have a record of personal proficiency/i.test(more.text), more.text);
  assert(/Redis when configured\/available/i.test(more.text), more.text);
  assert(/not proven as the production cache/i.test(more.text), more.text);
  assert(!/shipped project history/i.test(more.text), more.text);
  assert(more.memory.lastProject == null, more.memory.lastProject);
  const overview = await composeTurn('Tell me about QueryForgeAI.', after);
  assert(overview.reasoning.task === 'project_overview', overview.reasoning.task);
  assert(/QueryForgeAI/i.test(overview.text), overview.text.slice(0, 180));
  assert(!/when configured\/available|personal proficiency/i.test(overview.text), overview.text.slice(0, 240));
  assert(overview.memory.lastProject === 'queryforge', overview.memory.lastProject);

  const named = await composeTurn('Does Placement Pro+ use Redis?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(named.reasoning.task === 'placementpro_detail', named.reasoning.task);
  assert(named.reasoning.focus === 'pp-caching', named.reasoning.focus);
  assert(/Redis when configured\/available/i.test(named.text), named.text);
  assert(/not proven as the production cache/i.test(named.text), named.text);
  assert(!/shipped project history|personal proficiency|QueryForgeAI/i.test(named.text), named.text);
  assert(named.memory.lastProject === 'placementpro', named.memory.lastProject);
  assert(named.memory.lastCommitment?.task === 'placementpro_detail', named.memory.lastCommitment?.task);

  const django = await composeTurn('Does he know Django?', createPipelineMemory());
  assert(django.reasoning.task === 'portfolio_history', django.reasoning.task);
  assert(/Django is not part of the portfolio stack/i.test(django.text), django.text);
  assert(/do not document a Django implementation/i.test(django.text), django.text);
  assert(/absence as proof it was never used/i.test(django.text), django.text);
  assert(/don't have a record of personal proficiency/i.test(django.text), django.text);
  assert(!/shipped project history|Placement Pro\+|QueryForgeAI|RepoRadar/i.test(django.text), django.text);
  assert(django.memory.lastProject == null, django.memory.lastProject);
});

test('stack membership, proficiency, and caching stay separate', async () => {
  const docker = await composeTurn('Does he know Docker?', createPipelineMemory());
  assert(docker.reasoning.task === 'portfolio_history', docker.reasoning.task);
  assert(/Docker is listed in the portfolio stack/i.test(docker.text), docker.text);
  assert(/don't have a record of personal proficiency with Docker/i.test(docker.text), docker.text);
  assert(!/part of how I ship|part of Sudhanshu's shipped stack/i.test(docker.text), docker.text);
  assert(docker.memory.lastProject == null, docker.memory.lastProject);

  const proficient = await composeTurn('Is he proficient in Docker?', createPipelineMemory());
  assert(proficient.reasoning.task === 'portfolio_history', proficient.reasoning.task);
  assert(/listed in the portfolio stack/i.test(proficient.text), proficient.text);
  assert(/don't have a record of personal proficiency/i.test(proficient.text), proficient.text);
  assert(!/part of Sudhanshu's shipped stack/i.test(proficient.text), proficient.text);
  assert(proficient.memory.lastProject == null, proficient.memory.lastProject);

  const membership = createPipelineMemory();
  const listed = await composeTurn('Is Docker in his stack?', membership);
  assert(listed.reasoning.task === 'stack_membership', listed.reasoning.task);
  assert(/Yes\. Docker is listed in the portfolio stack/i.test(listed.text), listed.text);
  assert(/do not establish personal proficiency/i.test(listed.text), listed.text);
  assert(listed.memory.lastProject == null, listed.memory.lastProject);
  const listedAgain = await composeTurn('Tell me more.', membership);
  assert(listedAgain.reasoning.task === 'stack_membership', listedAgain.reasoning.task);
  assert(/still the stack record/i.test(listedAgain.text), listedAgain.text);
  assert(/Docker is listed in the portfolio stack/i.test(listedAgain.text), listedAgain.text);
  assert(listedAgain.memory.lastProject == null, listedAgain.memory.lastProject);

  const inventory = createPipelineMemory();
  const stack = await composeTurn('What technologies are listed in his stack?', inventory);
  assert(stack.reasoning.task === 'stack_membership', stack.reasoning.task);
  assert(/portfolio stack lists/i.test(stack.text), stack.text);
  assert(/Docker/.test(stack.text) && /Python/.test(stack.text), stack.text);
  assert(!/\bKubernetes\b/.test(stack.text), stack.text);
  assert(/not, by itself, a record of personal proficiency/i.test(stack.text), stack.text);
  const stackAgain = await composeTurn('Tell me more.', inventory);
  assert(stackAgain.reasoning.task === 'stack_membership', stackAgain.reasoning.task);
  assert(/still the portfolio stack/i.test(stackAgain.text), stackAgain.text);
  assert(/Docker/.test(stackAgain.text), stackAgain.text);

  const python = createPipelineMemory();
  const experienced = await composeTurn('How experienced is he with Python?', python);
  assert(experienced.reasoning.task === 'portfolio_history', experienced.reasoning.task);
  assert(/Python is listed in the portfolio stack/i.test(experienced.text), experienced.text);
  assert(/don't have a record of personal proficiency with Python/i.test(experienced.text), experienced.text);
  assert(!/\bexpert\b|\byears\b/i.test(experienced.text), experienced.text);
  assert(experienced.memory.lastProject == null, experienced.memory.lastProject);
  const pythonAgain = await composeTurn('Tell me more.', python);
  assert(pythonAgain.reasoning.task === 'portfolio_history', pythonAgain.reasoning.task);
  assert(/still don't have a record of personal proficiency with Python/i.test(pythonAgain.text), pythonAgain.text);

  const redis = await composeTurn('Does he know Redis?', createPipelineMemory());
  assert(redis.reasoning.task === 'portfolio_history', redis.reasoning.task);
  assert(/Redis when configured\/available/i.test(redis.text), redis.text);
  assert(/not proven as the production cache/i.test(redis.text), redis.text);
  assert(/don't have a record of personal proficiency/i.test(redis.text), redis.text);
  assert(!/shipped project history/i.test(redis.text), redis.text);

  const kubernetes = await composeTurn('Does he know Kubernetes?', createPipelineMemory());
  assert(kubernetes.reasoning.task === 'portfolio_history', kubernetes.reasoning.task);
  assert(/not part of the portfolio stack/i.test(kubernetes.text), kubernetes.text);
  assert(/do not document a Kubernetes implementation/i.test(kubernetes.text), kubernetes.text);
  assert(/absence as proof it was never used/i.test(kubernetes.text), kubernetes.text);

  const placementCache = createPipelineMemory();
  const caching = await composeTurn('How does Placement Pro+ handle caching?', placementCache);
  assert(caching.reasoning.task === 'placementpro_detail', caching.reasoning.task);
  assert(caching.reasoning.focus === 'pp-caching', caching.reasoning.focus);
  assert(/Redis when configured\/available/i.test(caching.text), caching.text);
  assert(/not proven as the production cache/i.test(caching.text), caching.text);
  assert(!/not part of the portfolio stack|personal proficiency/i.test(caching.text), caching.text);
  assert(caching.memory.lastProject === 'placementpro', caching.memory.lastProject);
  const cachingAgain = await composeTurn('Tell me more.', placementCache);
  assert(cachingAgain.reasoning.task === 'placementpro_detail', cachingAgain.reasoning.task);
  assert(cachingAgain.reasoning.focus === 'pp-caching', cachingAgain.reasoning.focus);
  assert(cachingAgain.memory.lastProject === 'placementpro', cachingAgain.memory.lastProject);

  const redisNamed = await composeTurn('Does Placement Pro+ use Redis?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(redisNamed.reasoning.task === 'placementpro_detail', redisNamed.reasoning.task);
  assert(redisNamed.reasoning.focus === 'pp-caching', redisNamed.reasoning.focus);
  assert(/Redis when configured\/available/i.test(redisNamed.text), redisNamed.text);
  assert(redisNamed.memory.lastProject === 'placementpro', redisNamed.memory.lastProject);

  const queryforgeCache = createPipelineMemory();
  const qfCache = await composeTurn('What does QueryForgeAI cache?', queryforgeCache, { awarenessProject: 'placementpro' });
  assert(qfCache.reasoning.task === 'undocumented_detail', qfCache.reasoning.task);
  assert(/QueryForgeAI/i.test(qfCache.text), qfCache.text);
  assert(/not documented/i.test(qfCache.text), qfCache.text);
  assert(!/SQL\/Mongo query generator|when configured\/available/i.test(qfCache.text), qfCache.text);
  assert(qfCache.memory.lastProject === 'queryforge', qfCache.memory.lastProject);
  const qfAgain = await composeTurn('Tell me more.', queryforgeCache);
  assert(qfAgain.reasoning.task === 'undocumented_detail', qfAgain.reasoning.task);
  assert(/QueryForgeAI/i.test(qfAgain.text), qfAgain.text);
  assert(qfAgain.memory.lastProject === 'queryforge', qfAgain.memory.lastProject);

  const compared = createPipelineMemory();
  const both = await composeTurn('Compare the caching approaches of QueryForgeAI and Placement Pro+.', compared);
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(both.reasoning.lens === 'subject', both.reasoning.lens);
  assert(both.reasoning.concept === 'caching', both.reasoning.concept);
  assert(/Redis when configured\/available/i.test(both.text), both.text);
  assert(/not proven as the production cache/i.test(both.text), both.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Caching/i.test(both.text), both.text);
  assert(!/SQL\/Mongo query generator/i.test(both.text), both.text);
  assert((both.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const bothAgain = await composeTurn('Tell me more.', compared);
  assert(bothAgain.reasoning.task === 'cross_project_compare', bothAgain.reasoning.task);
  assert(bothAgain.reasoning.lens === 'subject', bothAgain.reasoning.lens);
  assert(/still don't have documented evidence of how QueryForgeAI uses Caching/i.test(bothAgain.text), bothAgain.text);
  assert((bothAgain.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');

  const tools = createPipelineMemory();
  const survey = await composeTurn('What caching tools are used?', tools);
  assert(survey.reasoning.task === 'concept_record', survey.reasoning.task);
  assert(survey.reasoning.concept === 'caching', survey.reasoning.concept);
  assert(/Redis when configured\/available/i.test(survey.text), survey.text);
  assert(/in-process Map/i.test(survey.text), survey.text);
  assert(/QueryForgeAI does not have a documented caching record/i.test(survey.text), survey.text);
  assert(!/Redis is not part of the portfolio stack/i.test(survey.text), survey.text);
  assert(survey.memory.lastProject == null, survey.memory.lastProject);
  const toolsAgain = await composeTurn('Tell me more.', tools);
  assert(toolsAgain.reasoning.task === 'concept_record', toolsAgain.reasoning.task);
  assert(/still the documented caching record/i.test(toolsAgain.text), toolsAgain.text);
  assert(/in-process Map/i.test(toolsAgain.text), toolsAgain.text);
  assert(toolsAgain.memory.lastProject == null, toolsAgain.memory.lastProject);
});

test('a descriptive alias does not become a named technology', async () => {
  const containers = createPipelineMemory();
  const used = await composeTurn('What container technology is used?', containers, { awarenessProject: 'reporadar' });
  assert(used.reasoning.task === 'concept_alias', used.reasoning.task);
  assert(used.reasoning.alias === 'container', used.reasoning.alias);
  assert(/do not document a containers? implementation/i.test(used.text), used.text);
  assert(/Containerized and observable/i.test(used.text), used.text);
  assert(/diagram labeling/i.test(used.text), used.text);
  assert(/lists Docker, Vercel, Netlify/i.test(used.text), used.text);
  assert(/not treat that wording as a named technology/i.test(used.text), used.text);
  assert(/missing documentation as proof it was never used/i.test(used.text), used.text);
  assert(/personal proficiency with container/i.test(used.text), used.text);
  assert(!/Docker is listed in the portfolio stack|personal proficiency with Docker|is the container technology|part of how I ship|RepoRadar/i.test(used.text), used.text);
  assert(used.memory.lastProject == null, used.memory.lastProject);
  const usedAgain = await composeTurn('Tell me more.', containers, { awarenessProject: 'reporadar' });
  assert(usedAgain.reasoning.task === 'concept_alias', usedAgain.reasoning.task);
  assert(usedAgain.reasoning.alias === 'container', usedAgain.reasoning.alias);
  assert(/still the record for this wording/i.test(usedAgain.text), usedAgain.text);
  assert(/Containerized and observable/i.test(usedAgain.text), usedAgain.text);
  assert(usedAgain.memory.lastProject == null, usedAgain.memory.lastProject);

  const knowsContainers = createPipelineMemory();
  const containersKnown = await composeTurn('Does he know containers?', knowsContainers, { awarenessProject: 'reporadar' });
  assert(containersKnown.reasoning.task === 'concept_alias', containersKnown.reasoning.task);
  assert(containersKnown.reasoning.alias === 'containers', containersKnown.reasoning.alias);
  assert(/personal proficiency with containers/i.test(containersKnown.text), containersKnown.text);
  assert(!/personal proficiency with Docker|Docker is listed in the portfolio stack/i.test(containersKnown.text), containersKnown.text);
  assert(containersKnown.memory.lastProject == null, containersKnown.memory.lastProject);
  const containersAgain = await composeTurn('Tell me more.', knowsContainers, { awarenessProject: 'queryforge' });
  assert(containersAgain.reasoning.task === 'concept_alias', containersAgain.reasoning.task);
  assert(containersAgain.memory.lastProject == null, containersAgain.memory.lastProject);

  const docker = await composeTurn('Is Docker in his stack?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(docker.reasoning.task === 'stack_membership', docker.reasoning.task);
  assert(/Yes\. Docker is listed in the portfolio stack/i.test(docker.text), docker.text);
  assert(/do not establish personal proficiency with Docker/i.test(docker.text), docker.text);
  assert(docker.memory.lastProject == null, docker.memory.lastProject);

  const placementSql = createPipelineMemory();
  const sqlDatabase = await composeTurn('What SQL database does Placement Pro+ use?', placementSql, { awarenessProject: 'queryforge' });
  assert(sqlDatabase.reasoning.task === 'placementpro_detail', sqlDatabase.reasoning.task);
  assert(sqlDatabase.reasoning.focus === 'pp-database', sqlDatabase.reasoning.focus);
  assert(/Default DB is SQLite/i.test(sqlDatabase.text), sqlDatabase.text);
  assert(/PostgreSQL is used when DATABASE_URL is configured/i.test(sqlDatabase.text), sqlDatabase.text);
  assert(/production actually uses Postgres is UNKNOWN/i.test(sqlDatabase.text), sqlDatabase.text);
  assert(!/not documented in the portfolio knowledge|personal proficiency|PostgreSQL is listed in the portfolio stack/i.test(sqlDatabase.text), sqlDatabase.text);
  assert(sqlDatabase.memory.lastProject === 'placementpro', sqlDatabase.memory.lastProject);
  const sqlAgain = await composeTurn('Tell me more.', placementSql, { awarenessProject: 'queryforge' });
  assert(sqlAgain.reasoning.task === 'placementpro_detail', sqlAgain.reasoning.task);
  assert(sqlAgain.reasoning.focus === 'pp-database', sqlAgain.reasoning.focus);
  assert(sqlAgain.memory.lastProject === 'placementpro', sqlAgain.memory.lastProject);

  const placementPostgres = createPipelineMemory();
  const postgres = await composeTurn('Does Placement Pro+ use PostgreSQL?', placementPostgres, { awarenessProject: 'reporadar' });
  assert(postgres.reasoning.task === 'placementpro_detail', postgres.reasoning.task);
  assert(postgres.reasoning.focus === 'pp-database', postgres.reasoning.focus);
  assert(/Default DB is SQLite/i.test(postgres.text), postgres.text);
  assert(/PostgreSQL is used when DATABASE_URL is configured/i.test(postgres.text), postgres.text);
  assert(/production actually uses Postgres is UNKNOWN/i.test(postgres.text), postgres.text);
  assert(!/not documented in the portfolio knowledge|personal proficiency/i.test(postgres.text), postgres.text);
  assert(postgres.memory.lastProject === 'placementpro', postgres.memory.lastProject);
  const postgresAgain = await composeTurn('Tell me more.', placementPostgres, { awarenessProject: 'queryforge' });
  assert(postgresAgain.reasoning.focus === 'pp-database', postgresAgain.reasoning.focus);
  assert(postgresAgain.memory.lastProject === 'placementpro', postgresAgain.memory.lastProject);

  const unscopedSql = await composeTurn('What SQL database is used?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(unscopedSql.reasoning.task === 'context_clarify', unscopedSql.reasoning.task);
  assert(/Which project do you mean/i.test(unscopedSql.text), unscopedSql.text);
  assert(!/PostgreSQL is used when DATABASE_URL|PostgreSQL is listed/i.test(unscopedSql.text), unscopedSql.text);
  assert(unscopedSql.memory.lastProject == null, unscopedSql.memory.lastProject);

  const version = createPipelineMemory();
  const versionControl = await composeTurn('What version control does he use?', version, { awarenessProject: 'reporadar' });
  assert(versionControl.reasoning.task === 'concept_alias', versionControl.reasoning.task);
  assert(versionControl.reasoning.alias === 'version control', versionControl.reasoning.alias);
  assert(/do not document version control as a specific technology/i.test(versionControl.text), versionControl.text);
  assert(/not treat that wording as a named technology/i.test(versionControl.text), versionControl.text);
  assert(/personal proficiency with version control/i.test(versionControl.text), versionControl.text);
  assert(!/\bGit\b|GitHub|RepoRadar|Docker/i.test(versionControl.text), versionControl.text);
  assert(versionControl.memory.lastProject == null, versionControl.memory.lastProject);
  const versionAgain = await composeTurn('Tell me more.', version, { awarenessProject: 'reporadar' });
  assert(versionAgain.reasoning.task === 'concept_alias', versionAgain.reasoning.task);
  assert(/still the record for this wording/i.test(versionAgain.text), versionAgain.text);
  assert(!/\bGit\b|RepoRadar/i.test(versionAgain.text), versionAgain.text);
  assert(versionAgain.memory.lastProject == null, versionAgain.memory.lastProject);

  const gitMemory = createPipelineMemory();
  const git = await composeTurn('Does he know Git?', gitMemory, { awarenessProject: 'reporadar' });
  assert(git.reasoning.task === 'portfolio_history', git.reasoning.task);
  assert(/Git is listed in the portfolio stack/i.test(git.text), git.text);
  assert(/don't have a record of personal proficiency with Git/i.test(git.text), git.text);
  assert(!/part of how I ship|part of Sudhanshu's shipped stack/i.test(git.text), git.text);
  assert(git.memory.lastProject == null, git.memory.lastProject);
  const gitAgain = await composeTurn('Tell me more.', gitMemory, { awarenessProject: 'placementpro' });
  assert(gitAgain.reasoning.task === 'portfolio_history', gitAgain.reasoning.task);
  assert(/still don't have a record of personal proficiency with Git/i.test(gitAgain.text), gitAgain.text);
  assert(gitAgain.memory.lastProject == null, gitAgain.memory.lastProject);

  const queue = await composeTurn('What message queue does he use?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(queue.reasoning.task === 'concept_alias', queue.reasoning.task);
  assert(/do not document message queue as a specific technology/i.test(queue.text), queue.text);
  assert(!/\bKafka\b|RepoRadar/i.test(queue.text), queue.text);
  assert(queue.memory.lastProject == null, queue.memory.lastProject);

  const nosql = await composeTurn('What about nosql?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(nosql.reasoning.task == null, nosql.reasoning.task);
  assert(!/MongoDB/i.test(nosql.text), nosql.text);
  assert(nosql.memory.lastProject == null, nosql.memory.lastProject);

  const compared = createPipelineMemory();
  const both = await composeTurn('How do QueryForgeAI and Placement Pro+ use PostgreSQL?', compared, { awarenessProject: 'reporadar' });
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(both.reasoning.lens === 'subject', both.reasoning.lens);
  assert(/dialect \(postgresql, mysql, sqlite, or mongodb\)/i.test(both.text), both.text);
  assert(/PostgreSQL is used when DATABASE_URL is configured|PostgreSQL when DATABASE_URL is set/i.test(both.text), both.text);
  assert(!/personal proficiency|part of how I ship/i.test(both.text), both.text);
  assert((both.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(both.memory.lastProject == null, both.memory.lastProject);
  const bothAgain = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  assert((bothAgain.memory.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro', (bothAgain.memory.lastCommitment?.projectIds || []).join(','));
  assert(bothAgain.memory.lastProject == null, bothAgain.memory.lastProject);
  assert(/postgresql|PostgreSQL/.test(bothAgain.text), bothAgain.text);
});

test('incidental concepts, abbreviations, and job-description claims stay qualified', async () => {
  const compared = createPipelineMemory();
  await composeTurn('Compare QueryForgeAI and Placement Pro+.', compared);
  const containers = await composeTurn('I read about containers yesterday.', compared, { awarenessProject: 'reporadar' });
  assert(containers.reasoning.task === 'tech_mention', containers.reasoning.task);
  assert(/I noted containers/i.test(containers.text), containers.text);
  assert(/does not choose a project or start a comparison/i.test(containers.text), containers.text);
  assert(/keep both projects/i.test(containers.text), containers.text);
  assert(!/Docker|PostgreSQL|proficiency|no git clone|cloud path/i.test(containers.text), containers.text);
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(compared.lastProject == null, compared.lastProject);
  const containersAgain = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  assert(containersAgain.reasoning.task === 'why_clarify', containersAgain.reasoning.task);
  assert(/keep both projects/i.test(containersAgain.text), containersAgain.text);
  assert(!/Docker|RepoRadar/i.test(containersAgain.text), containersAgain.text);
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(compared.lastProject == null, compared.lastProject);

  const sql = await composeTurn('I was learning SQL.', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(sql.reasoning.task === 'tech_mention', sql.reasoning.task);
  assert(/I noted sql/i.test(sql.text), sql.text);
  assert(!/PostgreSQL|no record of SQL|proficiency|Placement Pro/i.test(sql.text), sql.text);
  assert(sql.memory.lastProject == null, sql.memory.lastProject);

  const version = await composeTurn('I saw a post about version control.', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(version.reasoning.task === 'tech_mention', version.reasoning.task);
  assert(/I noted version control/i.test(version.text), version.text);
  assert(!/\bGit\b|GitHub|RepoRadar|proficiency/i.test(version.text), version.text);
  assert(version.memory.lastProject == null, version.memory.lastProject);

  const kubernetes = await composeTurn("I'm interested in Kubernetes.", createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(kubernetes.reasoning.task === 'tech_mention', kubernetes.reasoning.task);
  assert(/I noted Kubernetes/i.test(kubernetes.text), kubernetes.text);
  assert(!/proficiency|not part of the portfolio stack|QueryForge/i.test(kubernetes.text), kubernetes.text);
  assert(kubernetes.memory.lastProject == null, kubernetes.memory.lastProject);

  const active = createPipelineMemory();
  await composeTurn('Tell me about QueryForgeAI.', active);
  const aside = await composeTurn('I read about containers yesterday.', active, { awarenessProject: 'reporadar' });
  assert(aside.reasoning.task === 'tech_mention', aside.reasoning.task);
  assert(/I noted containers/i.test(aside.text), aside.text);
  assert(!/Docker|RepoRadar/i.test(aside.text), aside.text);
  assert(active.lastProject === 'queryforge', active.lastProject);
  const back = await composeTurn('Tell me more.', active, { awarenessProject: 'reporadar' });
  assert(back.memory.lastProject === 'queryforge', back.memory.lastProject);
  assert(/QueryForge/i.test(back.text), back.text);
  assert(!/RepoRadar|Docker is listed/i.test(back.text), back.text);

  const git = createPipelineMemory();
  const knowsGit = await composeTurn('Does he know Git?', git, { awarenessProject: 'reporadar' });
  assert(knowsGit.reasoning.task === 'portfolio_history', knowsGit.reasoning.task);
  assert(/Git is listed in the portfolio stack/i.test(knowsGit.text), knowsGit.text);
  assert(/don't have a record of personal proficiency with Git/i.test(knowsGit.text), knowsGit.text);
  assert(/stack membership/i.test(knowsGit.text), knowsGit.text);
  assert(!/no git clone|\.git|project records do establish|version control/i.test(knowsGit.text), knowsGit.text);
  assert(knowsGit.memory.lastProject == null, knowsGit.memory.lastProject);
  const gitAgain = await composeTurn('Tell me more.', git, { awarenessProject: 'placementpro' });
  assert(gitAgain.reasoning.task === 'portfolio_history', gitAgain.reasoning.task);
  assert(!/no git clone|\.git/i.test(gitAgain.text), gitAgain.text);
  assert(gitAgain.memory.lastProject == null, gitAgain.memory.lastProject);

  for (const q of ['Does he know js?', 'Does he know JavaScript?']) {
    const row = await composeTurn(q, createPipelineMemory(), { awarenessProject: 'reporadar' });
    assert(row.reasoning.task === 'portfolio_history', `${q} ${row.reasoning.task}`);
    assert(row.reasoning.subject === 'JavaScript', row.reasoning.subject);
    assert(/JavaScript is listed in the portfolio stack/i.test(row.text), row.text);
    assert(/don't have a record of personal proficiency with JavaScript/i.test(row.text), row.text);
    assert(row.memory.lastProject == null, row.memory.lastProject);
  }
  const placementJs = await composeTurn('Does Placement Pro+ use JavaScript?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(placementJs.reasoning.task === 'project_stack_evidence', placementJs.reasoning.task);
  assert(/not listed on Placement Pro\+'s project stack/i.test(placementJs.text), placementJs.text);
  assert(/does not document a JavaScript implementation/i.test(placementJs.text), placementJs.text);
  assert(/absence as proof it does not use JavaScript/i.test(placementJs.text), placementJs.text);
  assert(/not a verified implementation and not a personal-proficiency record/i.test(placementJs.text), placementJs.text);
  assert(!/JavaScript is listed in the portfolio stack/i.test(placementJs.text), placementJs.text);
  assert(placementJs.memory.lastProject === 'placementpro', placementJs.memory.lastProject);
  const jsCompared = createPipelineMemory();
  const jsBoth = await composeTurn('How do QueryForgeAI and Placement Pro+ use JavaScript?', jsCompared, { awarenessProject: 'reporadar' });
  assert(jsBoth.reasoning.task === 'cross_project_compare', jsBoth.reasoning.task);
  assert(/QueryForgeAI lists JavaScript on its project stack/i.test(jsBoth.text), jsBoth.text);
  assert(/listed stack item, not a verified implementation/i.test(jsBoth.text), jsBoth.text);
  assert(/Placement Pro\+ does not list javascript on its project stack/i.test(jsBoth.text), jsBoth.text);
  assert(/don't have documented evidence of how either project uses Javascript/i.test(jsBoth.text), jsBoth.text);
  assert(!/\bproficient\b|JavaScript is listed in the portfolio stack/i.test(jsBoth.text), jsBoth.text);
  assert((jsCompared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(jsCompared.lastProject == null, jsCompared.lastProject);

  const knowsTs = await composeTurn('Does he know ts?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(knowsTs.reasoning.task === 'portfolio_history', knowsTs.reasoning.task);
  assert(/TypeScript is listed in the portfolio stack/i.test(knowsTs.text), knowsTs.text);
  assert(/don't have a record of personal proficiency with TypeScript/i.test(knowsTs.text), knowsTs.text);
  assert(/TypeScript/.test(knowsTs.text) && /Placement Pro\+|RepoRadar/i.test(knowsTs.text), knowsTs.text);
  assert(!/\bexpert\b|\byears\b/i.test(knowsTs.text), knowsTs.text);
  assert(knowsTs.memory.lastProject == null, knowsTs.memory.lastProject);
  const radarTs = await composeTurn('Does RepoRadar use TypeScript?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(radarTs.reasoning.task === 'reporadar_detail', radarTs.reasoning.task);
  assert(radarTs.reasoning.focus === 'rr-architecture', radarTs.reasoning.focus);
  assert(/TypeScript/i.test(radarTs.text), radarTs.text);
  assert(!/personal proficiency/i.test(radarTs.text), radarTs.text);
  assert(radarTs.memory.lastProject === 'reporadar', radarTs.memory.lastProject);

  const psql = createPipelineMemory();
  const knowsPsql = await composeTurn('Does he know psql?', psql, { awarenessProject: 'placementpro' });
  assert(knowsPsql.reasoning.task === 'concept_alias', knowsPsql.reasoning.task);
  assert(knowsPsql.reasoning.alias === 'psql', knowsPsql.reasoning.alias);
  assert(/do not document psql as a specific technology/i.test(knowsPsql.text), knowsPsql.text);
  assert(/not treat that wording as a named technology/i.test(knowsPsql.text), knowsPsql.text);
  assert(!/PostgreSQL is listed|DATABASE_URL|personal proficiency with PostgreSQL/i.test(knowsPsql.text), knowsPsql.text);
  assert(knowsPsql.memory.lastProject == null, knowsPsql.memory.lastProject);
  const psqlAgain = await composeTurn('Tell me more.', psql, { awarenessProject: 'reporadar' });
  assert(psqlAgain.reasoning.task === 'concept_alias', psqlAgain.reasoning.task);
  assert(!/PostgreSQL is listed|RepoRadar/i.test(psqlAgain.text), psqlAgain.text);
  assert(psqlAgain.memory.lastProject == null, psqlAgain.memory.lastProject);
  const placementPsql = await composeTurn('Does Placement Pro+ use psql?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(placementPsql.reasoning.task === 'project_alias_record', placementPsql.reasoning.task);
  assert(/does not document psql/i.test(placementPsql.text), placementPsql.text);
  assert(/will not rename psql to another technology/i.test(placementPsql.text), placementPsql.text);
  assert(!/DATABASE_URL|PostgreSQL/i.test(placementPsql.text), placementPsql.text);
  assert(placementPsql.memory.lastProject === 'placementpro', placementPsql.memory.lastProject);

  const knowsPostgres = await composeTurn('Does he know postgres?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(knowsPostgres.reasoning.task === 'portfolio_history', knowsPostgres.reasoning.task);
  assert(/PostgreSQL is listed in the portfolio stack/i.test(knowsPostgres.text), knowsPostgres.text);
  assert(/don't have a record of personal proficiency with PostgreSQL/i.test(knowsPostgres.text), knowsPostgres.text);
  assert(/DATABASE_URL|dialect \(postgresql/i.test(knowsPostgres.text), knowsPostgres.text);
  assert(!/part of how I ship/i.test(knowsPostgres.text), knowsPostgres.text);
  assert(knowsPostgres.memory.lastProject == null, knowsPostgres.memory.lastProject);
  const placementPostgres = await composeTurn('Does Placement Pro+ use postgres?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(placementPostgres.reasoning.task === 'placementpro_detail', placementPostgres.reasoning.task);
  assert(placementPostgres.reasoning.focus === 'pp-database', placementPostgres.reasoning.focus);
  assert(/production actually uses Postgres is UNKNOWN/i.test(placementPostgres.text), placementPostgres.text);
  assert(placementPostgres.memory.lastProject === 'placementpro', placementPostgres.memory.lastProject);
  const postgresCompared = createPipelineMemory();
  const postgresBoth = await composeTurn('How do QueryForgeAI and Placement Pro+ use postgres?', postgresCompared, { awarenessProject: 'reporadar' });
  assert(postgresBoth.reasoning.task === 'cross_project_compare', postgresBoth.reasoning.task);
  assert(/production actually uses Postgres is UNKNOWN/i.test(postgresBoth.text), postgresBoth.text);
  assert(/don't have documented evidence of how QueryForgeAI uses Postgres/i.test(postgresBoth.text), postgresBoth.text);
  assert(!/personal proficiency|PostgreSQL is listed in the portfolio stack/i.test(postgresBoth.text), postgresBoth.text);
  assert((postgresCompared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(postgresCompared.lastProject == null, postgresCompared.lastProject);

  const knowsK8s = await composeTurn('Does he know k8s?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(knowsK8s.reasoning.task === 'portfolio_history', knowsK8s.reasoning.task);
  assert(/Kubernetes is not part of the portfolio stack/i.test(knowsK8s.text), knowsK8s.text);
  assert(/absence as proof it was never used/i.test(knowsK8s.text), knowsK8s.text);
  assert(/don't have a record of personal proficiency with Kubernetes/i.test(knowsK8s.text), knowsK8s.text);
  assert(knowsK8s.memory.lastProject == null, knowsK8s.memory.lastProject);
  const projectK8s = await composeTurn('Does QueryForgeAI use k8s?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(projectK8s.reasoning.task === 'undocumented_detail', projectK8s.reasoning.task);
  assert(/QueryForgeAI/i.test(projectK8s.text), projectK8s.text);
  assert(!/SQL\/Mongo query generator|proficient in Kubernetes/i.test(projectK8s.text), projectK8s.text);
  assert(projectK8s.memory.lastProject === 'queryforge', projectK8s.memory.lastProject);

  const knowsRest = await composeTurn('Does he know rest?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(knowsRest.reasoning.task === 'portfolio_history', knowsRest.reasoning.task);
  assert(/REST APIs is listed in the portfolio stack/i.test(knowsRest.text), knowsRest.text);
  assert(/don't have a record of personal proficiency with REST APIs/i.test(knowsRest.text), knowsRest.text);
  assert(knowsRest.memory.lastProject == null, knowsRest.memory.lastProject);
  const restApi = createPipelineMemory();
  const placementRest = await composeTurn('What REST API does Placement Pro+ use?', restApi, { awarenessProject: 'queryforge' });
  assert(placementRest.reasoning.task === 'placementpro_detail', placementRest.reasoning.task);
  assert(placementRest.reasoning.focus === 'pp-api', placementRest.reasoning.focus);
  assert(/\/api/i.test(placementRest.text), placementRest.text);
  assert(placementRest.memory.lastProject === 'placementpro', placementRest.memory.lastProject);
  const restAgain = await composeTurn('Tell me more.', restApi, { awarenessProject: 'queryforge' });
  assert(restAgain.memory.lastProject === 'placementpro', restAgain.memory.lastProject);
  assert(!/QueryForge/i.test(restAgain.text), restAgain.text);

  const jd = [
    'Job description. Requirements. Qualifications. We are looking for an engineer.',
    'Responsibilities include containers, SQL, and version control.',
    'Nice to have: Docker, PostgreSQL, and Git.',
    'About the role. Years of experience. Preferred qualifications include Kubernetes and message queue.',
  ].join(' ');
  assert(matchTaxonomyEntities(jd).includes('Docker'), matchTaxonomyEntities(jd).join(','));
  assert(matchTaxonomyEntities(jd).includes('PostgreSQL'), matchTaxonomyEntities(jd).join(','));
  assert(matchTaxonomyEntities(jd).includes('Git'), matchTaxonomyEntities(jd).join(','));
  const analysis = analyzeJobDescription(jd);
  assert(analysis.matchedSkills.includes('Docker') && analysis.matchedSkills.includes('PostgreSQL') && analysis.matchedSkills.includes('Git'), analysis.matchedSkills.join(','));
  assert(analysis.missingSkills.includes('Kubernetes') && analysis.missingSkills.includes('Kafka'), analysis.missingSkills.join(','));
  assert(!analysis.talkingPoints.some((point) => /used directly/i.test(point)), analysis.talkingPoints.join(' | '));
  const jdText = getProvider()._jdMatchResponse(jd).text;
  assert(/not a proficiency score/i.test(jdText), jdText);
  assert(/Broader wording in the posting \(containers\)/i.test(jdText), jdText);
  assert(/Broader wording in the posting \(sql\)/i.test(jdText), jdText);
  assert(/Broader wording in the posting \(version control\)/i.test(jdText), jdText);
  assert(/The posting names Docker/i.test(jdText), jdText);
  assert(/Docker is listed in the portfolio stack/i.test(jdText), jdText);
  assert(/don't have a record of personal proficiency with Docker/i.test(jdText), jdText);
  assert(/The posting says “message queue”/i.test(jdText), jdText);
  assert(/not a finding that the posting named Kafka/i.test(jdText), jdText);
  assert(!/✅ Matched|used directly/i.test(jdText), jdText);
});

test('evaluate answers and project stack lists stay labeled', async () => {
  const rest = await composeTurn('Can he design REST APIs?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(rest.reasoning.task === 'eval_rest_apis', rest.reasoning.task);
  assert(/REST APIs is listed in the portfolio stack/i.test(rest.text), rest.text);
  assert(/not a record of personal proficiency/i.test(rest.text), rest.text);
  assert(/list REST APIs on their project stacks/i.test(rest.text), rest.text);
  assert(/POST \/generate-sql/i.test(rest.text), rest.text);
  assert(/Flask blueprints under \/api/i.test(rest.text), rest.text);
  assert(/GET \/api\/analyze/i.test(rest.text), rest.text);
  assert(/documented API behavior/i.test(rest.text), rest.text);
  assert(!/I can design REST|Confidence is high/i.test(rest.text), rest.text);
  assert(rest.memory.lastProject == null, rest.memory.lastProject);

  const strongest = await composeTurn('Which database are you strongest with?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(strongest.reasoning.task === 'database_strength', strongest.reasoning.task);
  assert(/don't have a record of which database/i.test(strongest.text), strongest.text);
  assert(/don't have a decision record that selects Postgres/i.test(strongest.text), strongest.text);
  assert(/PostgreSQL and MongoDB are listed in the portfolio stack/i.test(strongest.text), strongest.text);
  assert(/SQLite by default and PostgreSQL when DATABASE_URL is set/i.test(strongest.text), strongest.text);
  assert(/production actually uses Postgres is UNKNOWN/i.test(strongest.text), strongest.text);
  assert(/dialect the user selects/i.test(strongest.text), strongest.text);
  assert(!/I'd default to Postgres/i.test(strongest.text), strongest.text);
  assert(strongest.memory.lastProject == null, strongest.memory.lastProject);

  const whyPg = await composeTurn('Why PostgreSQL?', createPipelineMemory());
  assert(whyPg.reasoning.task === 'why_postgres', whyPg.reasoning.task);
  assert(/production actually uses Postgres is UNKNOWN/i.test(whyPg.text), whyPg.text);
  assert(!/I'd default to Postgres/i.test(whyPg.text), whyPg.text);

  const placementDb = await composeTurn('What database does Placement Pro+ use?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(placementDb.reasoning.task === 'placementpro_detail', placementDb.reasoning.task);
  assert(placementDb.reasoning.focus === 'pp-database', placementDb.reasoning.focus);
  assert(/UNKNOWN/i.test(placementDb.text), placementDb.text);

  const listedMemory = createPipelineMemory();
  const listed = await composeTurn("Is JavaScript listed in Placement Pro+'s stack?", listedMemory, { awarenessProject: 'queryforge' });
  assert(listed.reasoning.task === 'project_stack_evidence', listed.reasoning.task);
  assert(/^No\./.test(listed.text), listed.text);
  assert(/not listed on Placement Pro\+'s project stack/i.test(listed.text), listed.text);
  assert(/JavaScript is listed in the portfolio stack/i.test(listed.text), listed.text);
  assert(/not proof it was never used/i.test(listed.text), listed.text);
  assert(/not a verified implementation and not a personal-proficiency record/i.test(listed.text), listed.text);
  assert(listed.memory.lastProject === 'placementpro', listed.memory.lastProject);
  const listedAgain = await composeTurn('Tell me more.', listedMemory, { awarenessProject: 'reporadar' });
  assert(listedAgain.reasoning.task === 'project_stack_evidence', listedAgain.reasoning.task);
  assert(/That is still the record/i.test(listedAgain.text), listedAgain.text);
  assert(/not listed on Placement Pro\+'s project stack/i.test(listedAgain.text), listedAgain.text);
  assert(listedAgain.memory.lastProject === 'placementpro', listedAgain.memory.lastProject);

  const qfJs = await composeTurn('Does QueryForgeAI use JavaScript?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(qfJs.reasoning.task === 'project_stack_evidence', qfJs.reasoning.task);
  assert(/JavaScript is listed on QueryForgeAI's project stack/i.test(qfJs.text), qfJs.text);
  assert(/does not document a JavaScript implementation/i.test(qfJs.text), qfJs.text);
  assert(/not a verified implementation and not a personal-proficiency record/i.test(qfJs.text), qfJs.text);
  assert(!/^Yes\./.test(qfJs.text), qfJs.text);
  assert(qfJs.memory.lastProject === 'queryforge', qfJs.memory.lastProject);

  const proficient = await composeTurn('Is Sudhanshu proficient in JavaScript?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(proficient.reasoning.task === 'portfolio_history', proficient.reasoning.task);
  assert(/JavaScript is listed in the portfolio stack/i.test(proficient.text), proficient.text);
  assert(/QueryForgeAI lists JavaScript on its project stack/i.test(proficient.text), proficient.text);
  assert(/Placement Pro\+ and RepoRadarAI do not/i.test(proficient.text), proficient.text);
  assert(/listed item, not a verified implementation/i.test(proficient.text), proficient.text);
  assert(/don't have a record of personal proficiency with JavaScript/i.test(proficient.text), proficient.text);
  assert(proficient.memory.lastProject == null, proficient.memory.lastProject);

  const compared = createPipelineMemory();
  const both = await composeTurn('How do QueryForgeAI and Placement Pro+ use JavaScript?', compared, { awarenessProject: 'reporadar' });
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(/QueryForgeAI lists JavaScript on its project stack/i.test(both.text), both.text);
  assert(/Placement Pro\+ does not list javascript on its project stack/i.test(both.text), both.text);
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const bothAgain = await composeTurn('Tell me more.', compared, { awarenessProject: 'reporadar' });
  assert(bothAgain.reasoning.task === 'cross_project_compare', bothAgain.reasoning.task);
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(compared.lastProject == null, compared.lastProject);

  const redis = await composeTurn('Does he know Redis?', createPipelineMemory());
  assert(/Redis when configured\/available/i.test(redis.text), redis.text);
  assert(/not proven as the production cache/i.test(redis.text), redis.text);
  const kubernetes = await composeTurn('Does he know Kubernetes?', createPipelineMemory());
  assert(/not part of the portfolio stack/i.test(kubernetes.text), kubernetes.text);
  const containers = await composeTurn('Does he know containers?', createPipelineMemory());
  assert(containers.reasoning.task === 'concept_alias', containers.reasoning.task);
  assert(!/Docker is listed in the portfolio stack/i.test(containers.text), containers.text);
  const jd = [
    'Job description. Requirements. Qualifications. We are looking for an engineer.',
    'Responsibilities include containers, SQL, and version control.',
    'Nice to have: Docker, PostgreSQL, and Git.',
  ].join(' ');
  const jdText = getProvider()._jdMatchResponse(jd).text;
  assert(/not a proficiency score/i.test(jdText), jdText);
  assert(!/✅ Matched|used directly/i.test(jdText), jdText);
});

test('fit claims and related technology names stay qualified', async () => {
  const fit = await composeTurn('Is he stronger in backend or frontend?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(fit.reasoning.task === 'backend_vs_frontend', fit.reasoning.task);
  assert(/do not establish whether Sudhanshu is stronger at backend or frontend/i.test(fit.text), fit.text);
  assert(/role label, not a proficiency measurement/i.test(fit.text), fit.text);
  assert(/Backend stack membership includes/i.test(fit.text), fit.text);
  assert(/Frontend stack membership includes/i.test(fit.text), fit.text);
  assert(!/I'm stronger|center of gravity matches my title/i.test(fit.text), fit.text);
  assert(fit.memory.lastProject == null, fit.memory.lastProject);

  const startup = await composeTurn('Would he fit a startup?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(startup.reasoning.task === 'startup_fit', startup.reasoning.task);
  assert(/do not establish whether Sudhanshu would fit a startup/i.test(startup.text), startup.text);
  assert(/public live URL/i.test(startup.text), startup.text);
  assert(!/I'd fit a startup/i.test(startup.text), startup.text);
  assert(startup.memory.lastProject == null, startup.memory.lastProject);

  const role = await composeTurn('Which role suits him best?', createPipelineMemory());
  assert(role.reasoning.task === 'best_role', role.reasoning.task);
  assert(/do not name a best role/i.test(role.text), role.text);
  assert(/do not establish personal strength at API design/i.test(role.text), role.text);
  assert(!/Best fit for me/i.test(role.text), role.text);

  const decision = await composeTurn("What's the strongest engineering decision?", createPipelineMemory());
  assert(decision.reasoning.task === 'strongest_decision', decision.reasoning.task);
  assert(/do not rank one engineering decision as the strongest/i.test(decision.text), decision.text);
  assert(/reasoning layer/i.test(decision.text), decision.text);
  assert(!/strongest engineering decision I made/i.test(decision.text), decision.text);

  const flask = await composeTurn('Why Flask?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(flask.reasoning.task === 'why_flask', flask.reasoning.task);
  assert(/do not establish a personal preference for Flask/i.test(flask.text), flask.text);
  assert(!/I chose Flask|I went with Flask|because I wanted/i.test(flask.text), flask.text);
  assert(flask.memory.lastProject == null, flask.memory.lastProject);

  const scriptMemory = createPipelineMemory();
  const script = await composeTurn('Does he know ecmascript?', scriptMemory, { awarenessProject: 'placementpro' });
  assert(script.reasoning.task === 'concept_alias', script.reasoning.task);
  assert(/do not document ecmascript as a specific technology/i.test(script.text), script.text);
  assert(/not treat that wording as a named technology/i.test(script.text), script.text);
  assert(!/JavaScript is listed|Google Cloud/i.test(script.text), script.text);
  assert(script.memory.lastProject == null, script.memory.lastProject);
  const scriptAgain = await composeTurn('Tell me more.', scriptMemory, { awarenessProject: 'queryforge' });
  assert(scriptAgain.reasoning.task === 'concept_alias', scriptAgain.reasoning.task);
  assert(scriptAgain.memory.lastProject == null, scriptAgain.memory.lastProject);

  const listed = await composeTurn('Is ecmascript listed in his stack?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(listed.reasoning.task === 'concept_alias', listed.reasoning.task);
  assert(/not a name on the portfolio stack/i.test(listed.text), listed.text);
  assert(!/JavaScript is listed/i.test(listed.text), listed.text);
  assert(listed.memory.lastProject == null, listed.memory.lastProject);

  const gcp = await composeTurn('Does he know gcp?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(gcp.reasoning.task === 'concept_alias', gcp.reasoning.task);
  assert(/do not document gcp as a specific technology/i.test(gcp.text), gcp.text);
  assert(!/Google Cloud is not part of the portfolio stack|Google Cloud is listed/i.test(gcp.text), gcp.text);
  assert(gcp.memory.lastProject == null, gcp.memory.lastProject);

  const cloud = await composeTurn('Does he know Google Cloud?', createPipelineMemory());
  assert(cloud.reasoning.task === 'portfolio_history', cloud.reasoning.task);
  assert(/Google Cloud is not part of the portfolio stack/i.test(cloud.text), cloud.text);

  const placement = createPipelineMemory();
  const used = await composeTurn('Does Placement Pro+ use ecmascript?', placement, { awarenessProject: 'queryforge' });
  assert(used.reasoning.task === 'project_alias_record', used.reasoning.task);
  assert(/Placement Pro\+ does not document ecmascript/i.test(used.text), used.text);
  assert(/will not rename ecmascript to another technology/i.test(used.text), used.text);
  assert(!/JavaScript is listed|uses JavaScript/i.test(used.text), used.text);
  assert(placement.lastProject === 'placementpro', placement.lastProject);
  const usedAgain = await composeTurn('Tell me more.', placement, { awarenessProject: 'reporadar' });
  assert(usedAgain.reasoning.task === 'project_alias_record', usedAgain.reasoning.task);
  assert(/That is still the record/i.test(usedAgain.text), usedAgain.text);
  assert(placement.lastProject === 'placementpro', placement.lastProject);

  const compared = createPipelineMemory();
  const both = await composeTurn('How do QueryForgeAI and Placement Pro+ use ecmascript?', compared, { awarenessProject: 'reporadar' });
  assert(both.reasoning.task === 'cross_project_compare', both.reasoning.task);
  assert(/will not rename Ecmascript to JavaScript/i.test(both.text), both.text);
  assert(/don't have documented evidence of how either project uses Ecmascript/i.test(both.text), both.text);
  assert(!/JavaScript is listed|uses JavaScript/i.test(both.text), both.text);
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  const bothAgain = await composeTurn('Tell me more.', compared, { awarenessProject: 'placementpro' });
  assert((compared.lastCommitment?.projectIds || []).join(',') === 'queryforge,placementpro');
  assert(compared.lastProject == null, compared.lastProject);

  const qfGcp = await composeTurn('Does QueryForgeAI use gcp?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(qfGcp.reasoning.task === 'project_alias_record', qfGcp.reasoning.task);
  assert(/QueryForgeAI does not document gcp/i.test(qfGcp.text), qfGcp.text);
  assert(!/Google Cloud/i.test(qfGcp.text), qfGcp.text);
  assert(qfGcp.memory.lastProject === 'queryforge', qfGcp.memory.lastProject);
});

test('ranking, hiring, specialty, and authorship claims stay at the record', async () => {
  const hirePhrases = ['Why should I hire him?', 'Why hire Sudhanshu?', 'Why should we hire him?'];
  for (const phrase of hirePhrases) {
    const hire = await composeTurn(phrase, createPipelineMemory(), { awarenessProject: 'queryforge' });
    assert(hire.reasoning.task === 'why_hire', `${phrase} -> ${hire.reasoning.task}`);
    assert(/do not establish a personal hiring recommendation/i.test(hire.text), hire.text);
    assert(/public live URL/i.test(hire.text), hire.text);
    assert(!/Hire me because|Best proof|backend-first/i.test(hire.text), hire.text);
    assert(hire.memory.lastProject == null, `${phrase} adopted ${hire.memory.lastProject}`);
  }

  const aiPhrases = ['Which project shows the most AI engineering?', 'What is the best AI project?'];
  for (const phrase of aiPhrases) {
    const ai = await composeTurn(phrase, createPipelineMemory(), { awarenessProject: 'placementpro' });
    assert(ai.reasoning.task === 'demo_ai', `${phrase} -> ${ai.reasoning.task}`);
    assert(/do not rank the projects by AI engineering/i.test(ai.text), ai.text);
    assert(/schema-aware SQL generation/i.test(ai.text), ai.text);
    assert(/GitHub-metadata health heuristics/i.test(ai.text), ai.text);
    assert(!/I'd highlight|wins when/i.test(ai.text), ai.text);
    assert(ai.memory.lastProject == null, `${phrase} adopted ${ai.memory.lastProject}`);
  }

  const specialty = await composeTurn('What does Sudhanshu specialize in?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(specialty.reasoning.task === 'engineer_type', specialty.reasoning.task);
  assert(/Python Backend Engineer · AI Developer · Full-Stack Engineer/i.test(specialty.text), specialty.text);
  assert(/role label, not a proficiency measurement/i.test(specialty.text), specialty.text);
  assert(/FastAPI on QueryForgeAI/i.test(specialty.text), specialty.text);
  assert(!/specializes as a backend-leaning|backend-leaning full-stack/i.test(specialty.text), specialty.text);
  assert(specialty.memory.lastProject == null, specialty.memory.lastProject);

  const designed = await composeTurn('Did you design the five-layer architecture?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(designed.reasoning.task === 'arch_why', designed.reasoning.task);
  assert(/do not establish that Sudhanshu personally designed/i.test(designed.text), designed.text);
  assert(/Frontend/i.test(designed.text) && /five-layer/i.test(designed.text), designed.text);
  assert(!/I designed|laid out the system|I wanted to solve/i.test(designed.text), designed.text);
  assert(designed.memory.lastProject == null, designed.memory.lastProject);

  const memory = createPipelineMemory();
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const comparedIds = [...(compared.memory.lastCommitment?.projectIds || [])].sort();
  assert(comparedIds.includes('queryforge') && comparedIds.includes('placementpro'), comparedIds.join(','));

  const keep = await composeTurn('Which project should I remove if I could only keep two?', memory, { awarenessProject: 'reporadar' });
  assert(keep.reasoning.task === 'keep_two', keep.reasoning.task);
  assert(/do not establish which two projects to keep/i.test(keep.text), keep.text);
  assert(/QueryForgeAI/i.test(keep.text) && /Placement Pro\+/i.test(keep.text) && /RepoRadarAI/i.test(keep.text), keep.text);
  assert(!/I'd keep|I'd drop|strongest/i.test(keep.text), keep.text);
  assert([...(keep.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), keep.memory.lastCommitment?.projectIds);
  assert(keep.memory.lastProject == null, keep.memory.lastProject);

  const more = await composeTurn('Tell me more', memory, { awarenessProject: 'queryforge' });
  assert(more.reasoning.task === 'keep_two', more.reasoning.task);
  assert(/That is still the record/i.test(more.text), more.text);
  assert(/do not establish which two projects to keep/i.test(more.text), more.text);
  assert([...(more.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), more.memory.lastCommitment?.projectIds);
  assert(more.memory.lastProject == null, more.memory.lastProject);

  const whyKeep = await composeTurn('Why?', memory, { awarenessProject: 'placementpro' });
  assert(whyKeep.reasoning.task === 'keep_two', whyKeep.reasoning.task);
  assert(!/I'd keep|strongest/i.test(whyKeep.text), whyKeep.text);
  assert([...(whyKeep.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), whyKeep.memory.lastCommitment?.projectIds);

  const best = createPipelineMemory();
  best.lastProject = 'placementpro';
  const engineering = await composeTurn('Which project demonstrates the best software engineering?', best, { awarenessProject: 'reporadar' });
  assert(engineering.reasoning.task === 'best_engineering', engineering.reasoning.task);
  assert(/do not establish which project shows the best or strongest/i.test(engineering.text), engineering.text);
  assert(!/I'd choose|deepest systems story/i.test(engineering.text), engineering.text);
  assert(engineering.memory.lastProject === 'placementpro', engineering.memory.lastProject);
  const bestFollow = await composeTurn('Tell me more', best, { awarenessProject: 'queryforge' });
  assert(bestFollow.reasoning.task === 'best_engineering', bestFollow.reasoning.task);
  assert(bestFollow.memory.lastProject === 'placementpro', bestFollow.memory.lastProject);

  const named = await composeTurn('Why is QueryForgeAI the best project?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(named.reasoning.task === 'justify_best_project', named.reasoning.task);
  assert(/do not establish which project shows the best or strongest/i.test(named.text), named.text);
  assert(/QueryForgeAI documents FastAPI/i.test(named.text), named.text);
  assert(!/I'd choose|strongest software engineering in one place/i.test(named.text), named.text);

  const role = await composeTurn('What kind of engineer is he?', createPipelineMemory());
  assert(/Python Backend Engineer · AI Developer · Full-Stack Engineer/i.test(role.text), role.text);
  const stack = await composeTurn('Is FastAPI listed in the portfolio stack?', createPipelineMemory());
  assert(stack.reasoning.task === 'stack_membership', stack.reasoning.task);
  assert(/FastAPI/i.test(stack.text), stack.text);
  const built = await composeTurn('What backend does QueryForgeAI use?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(/FastAPI/i.test(built.text), built.text);
  assert(built.memory.lastProject === 'queryforge', built.memory.lastProject);
});

test('personal plans, picks, and the inferred specialty stay off the record', async () => {
  const specialty = getIdentityClaimById('arch:backend-leaning-fullstack');
  if (specialty) {
    assert(specialty.confidence === 'inferred', specialty.confidence);
    assert(/Backend-leaning full-stack: Python\/AI core/i.test(specialty.statement), specialty.statement);
  }
  const inferredSentence = 'Backend-leaning full-stack:';

  const trade = await composeTurn('If I rebuilt the architecture tomorrow, what would change?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(trade.reasoning.task === 'arch_tradeoffs', trade.reasoning.task);
  assert(/do not establish which trade-offs/i.test(trade.text), trade.text);
  assert(/Frontend/i.test(trade.text) && /FastAPI/i.test(trade.text), trade.text);
  assert(!/If I rebuilt|I'd probably/i.test(trade.text), trade.text);
  assert(!trade.text.includes(inferredSentence), trade.text);
  assert(trade.memory.lastProject == null, trade.memory.lastProject);

  const scale = await composeTurn('How would you scale the architecture?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(scale.reasoning.task === 'arch_scale', scale.reasoning.task);
  assert(/do not establish a personal scaling plan/i.test(scale.text), scale.text);
  assert(/Render/i.test(scale.text) && /Vercel/i.test(scale.text), scale.text);
  assert(!/I'd scale/i.test(scale.text), scale.text);
  assert(scale.memory.lastProject == null, scale.memory.lastProject);

  const philosophy = await composeTurn('What is your design philosophy?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(philosophy.reasoning.task === 'design_philosophy', philosophy.reasoning.task);
  assert(/do not establish a personal design philosophy/i.test(philosophy.text), philosophy.text);
  assert(/layered topology/i.test(philosophy.text), philosophy.text);
  assert(!/My design philosophy/i.test(philosophy.text), philosophy.text);
  assert(!philosophy.text.includes(inferredSentence), philosophy.text);

  const memory = createPipelineMemory();
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const comparedIds = [...(compared.memory.lastCommitment?.projectIds || [])].sort();
  const faang = await composeTurn('Which project would impress a FAANG interviewer?', memory, { awarenessProject: 'reporadar' });
  assert(faang.reasoning.task === 'faang_interview', faang.reasoning.task);
  assert(/do not establish which project would impress a FAANG interviewer/i.test(faang.text), faang.text);
  assert(/QueryForgeAI/i.test(faang.text) && /RepoRadarAI/i.test(faang.text), faang.text);
  assert(!/I'd put|I'd open|I'd lead/i.test(faang.text), faang.text);
  assert([...(faang.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), faang.memory.lastCommitment?.projectIds);
  assert(faang.memory.lastProject == null, faang.memory.lastProject);
  const whyFaang = await composeTurn('Why?', memory, { awarenessProject: 'queryforge' });
  assert(whyFaang.reasoning.task === 'faang_interview', whyFaang.reasoning.task);
  assert(/That is still the record/i.test(whyFaang.text), whyFaang.text);
  assert(!/I'd put|previous answer selected|that choice sits right inside/i.test(whyFaang.text), whyFaang.text);
  assert([...(whyFaang.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), whyFaang.memory.lastCommitment?.projectIds);

  const best = await composeTurn('Which project is your best work?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(best.reasoning.task === 'best_work', best.reasoning.task);
  assert(/do not establish which project is the best or strongest work/i.test(best.text), best.text);
  assert(!/I'd lead|strongest "here's the work"/i.test(best.text), best.text);
  assert(best.memory.lastProject == null, best.memory.lastProject);

  const hard = await composeTurn('What was the most difficult project?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(hard.reasoning.task === 'most_difficult', hard.reasoning.task);
  assert(/do not establish which project is the most difficult/i.test(hard.text), hard.text);
  assert(/schema-aware SQL generation/i.test(hard.text), hard.text);
  assert(!/hardest problem domain|\bwins\b/i.test(hard.text), hard.text);

  const about = await composeTurn('Tell me about RepoRadarAI.', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(/do not establish personal authorship/i.test(about.text), about.text);
  assert(/RepoRadarAI/i.test(about.text), about.text);
  assert(!/I built it/i.test(about.text), about.text);
  assert(about.memory.lastProject === 'reporadar', about.memory.lastProject);

  const learn = await composeTurn('What should I learn next if I want to build systems like this?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(learn.reasoning.task === 'learn_next', learn.reasoning.task);
  assert(/do not establish that backend ownership comes first/i.test(learn.text), learn.text);
  assert(/FastAPI/i.test(learn.text) && /Flask/i.test(learn.text), learn.text);
  assert(!/backend ownership first/i.test(learn.text), learn.text);
  assert(!learn.text.includes(inferredSentence), learn.text);
  assert(learn.memory.lastProject == null, learn.memory.lastProject);
});

test('weakness, strength, role, and opinion templates stay off the record', async () => {
  const api = await import('../src/assistant/reasoning.js');
  assert(api.opRecommend === undefined && api.opRank === undefined, 'ranking operators are exported');
  assert(api.rankByObjective === undefined && api.topByObjective === undefined, 'ranking helpers are exported');

  const memory = createPipelineMemory();
  const compared = await composeTurn('Compare QueryForgeAI and Placement Pro+.', memory, { awarenessProject: 'reporadar' });
  const comparedIds = [...(compared.memory.lastCommitment?.projectIds || [])].sort();
  const weak = await composeTurn("What's his weakest area?", memory, { awarenessProject: 'reporadar' });
  assert(weak.reasoning.task === 'weakest_area', weak.reasoning.task);
  assert(/do not establish a personal weakest area/i.test(weak.text), weak.text);
  assert(!/softest public signal|wouldn't pretend|I would improve/i.test(weak.text), weak.text);
  assert([...(weak.memory.lastCommitment?.projectIds || [])].sort().join() === comparedIds.join(), weak.memory.lastCommitment?.projectIds);
  assert(weak.memory.lastProject == null, weak.memory.lastProject);
  const whyWeak = await composeTurn('Why?', memory, { awarenessProject: 'queryforge' });
  assert(whyWeak.reasoning.task === 'weakest_area', whyWeak.reasoning.task);
  assert(/That is still the record/i.test(whyWeak.text), whyWeak.text);
  assert(!/softest public signal|wouldn't pretend/i.test(whyWeak.text), whyWeak.text);

  const caps = await composeTurn('What can you do?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(caps.reasoning.task === 'capabilities', caps.reasoning.task);
  assert(/do not establish a ranking of which project demonstrates a skill/i.test(caps.text), caps.text);
  assert(!/judge which work best demonstrates a skill/i.test(caps.text), caps.text);
  assert(caps.memory.lastProject == null, caps.memory.lastProject);

  const strengths = await composeTurn('What are his strengths?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(strengths.reasoning.task === 'strengths', strengths.reasoning.task);
  assert(/do not establish personal strengths/i.test(strengths.text), strengths.text);
  assert(/Python/i.test(strengths.text) && /live URL/i.test(strengths.text), strengths.text);
  assert(!/Strengths I can actually defend/i.test(strengths.text), strengths.text);
  assert(strengths.memory.lastProject == null, strengths.memory.lastProject);

  const role = await composeTurn('Are you Sudhanshu, SRIIVERSEAI, or something else?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(role.reasoning.task === 'role_triad', role.reasoning.task);
  assert(/not a record of personal authorship/i.test(role.text), role.text);
  assert(/Digital Brain/i.test(role.text), role.text);
  assert(!/engineer who builds/i.test(role.text), role.text);
  assert(role.memory.lastProject == null, role.memory.lastProject);

  const flaskMemory = createPipelineMemory();
  const flask = await composeTurn('Compare Flask and FastAPI', flaskMemory, { awarenessProject: 'queryforge' });
  assert(/do not establish a personal preference between Flask and FastAPI/i.test(flask.text), flask.text);
  assert(/FastAPI/i.test(flask.text) && /Flask/i.test(flask.text), flask.text);
  assert(!/Here's how I'd contrast|I'd contrast|FastAPI is the default|when I want/i.test(flask.text), flask.text);
  assert(flask.memory.lastProject == null, flask.memory.lastProject);
  const whyFlask = await composeTurn('Why?', flaskMemory, { awarenessProject: 'placementpro' });
  assert(!/Here's how I'd contrast|I'd contrast|I'd concede|FastAPI is the default/i.test(whyFlask.text), whyFlask.text);

  const concede = await composeTurn('Was Flask a bad choice?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(concede.reasoning.task === 'challenge_response', concede.reasoning.task);
  assert(/do not establish a personal default for FastAPI/i.test(concede.text), concede.text);
  assert(/QueryForgeAI documents FastAPI/i.test(concede.text) && /Placement Pro\+ documents Flask/i.test(concede.text), concede.text);
  assert(!/I'd concede|I still defend/i.test(concede.text), concede.text);
  assert(concede.memory.lastProject == null, concede.memory.lastProject);

  const review = await composeTurn('How do you handle code review feedback?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(review.reasoning.task === 'self_behavioral', review.reasoning.task);
  assert(/do not establish a code-review practice/i.test(review.text), review.text);
  assert(!/I'd review/i.test(review.text), review.text);

  const incident = await composeTurn('What failed in production?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(incident.reasoning.task === 'ops_story', incident.reasoning.task);
  assert(/do not establish a production incident/i.test(incident.text), incident.text);
  assert(!/I'd expect/i.test(incident.text), incident.text);

  const opinion = await composeTurn('What do you think of microservices?', createPipelineMemory(), { awarenessProject: 'queryforge' });
  assert(opinion.reasoning.task === 'opinion_take', opinion.reasoning.task);
  assert(/do not establish a personal view of microservices/i.test(opinion.text), opinion.text);
  assert(!/I'd split|Overrated/i.test(opinion.text), opinion.text);

  const modes = await composeTurn('What are the failure modes?', createPipelineMemory(), { awarenessProject: 'reporadar' });
  assert(modes.reasoning.task === 'probe_failure_modes', modes.reasoning.task);
  assert(/do not establish personal failure-mode worries/i.test(modes.text), modes.text);
  assert(!/I'd worry|I'd expect/i.test(modes.text), modes.text);
  assert(/does not connect to a live database/i.test(modes.text), modes.text);
});

test('a short follow-up does not resolve a pending project or invent one', async () => {
  const pendingChoice = createPipelineMemory();
  await composeTurn('What backend does it use?', pendingChoice);
  const why = await composeTurn('Why?', pendingChoice, { awarenessProject: 'reporadar' });
  assert(why.memory.lastCommitment?.task === 'context_clarify', why.memory.lastCommitment?.task);
  assert(why.memory.lastCommitment?.aspect === 'backend', why.memory.lastCommitment?.aspect);
  assert(why.memory.lastProject == null, why.memory.lastProject);
  assert(!/FastAPI|Flask 3\.1|GET \/api\/analyze/i.test(why.text), why.text.slice(0, 180));
  const chosen = await composeTurn('Placement Pro+', pendingChoice, { awarenessProject: 'queryforge' });
  assert(/Flask 3\.1/i.test(chosen.text), chosen.text.slice(0, 160));

  const none = await composeTurn('How?', createPipelineMemory(), { awarenessProject: 'placementpro' });
  assert(none.reasoning.task == null, none.reasoning.task);
  assert(none.memory.lastProject == null, none.memory.lastProject);
  assert(/don't have that in Sudhanshu's portfolio/i.test(none.text), none.text);
});

await Promise.all(pending);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
