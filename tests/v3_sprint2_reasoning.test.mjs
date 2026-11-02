/**
 * Sprint 2 regression suite — must keep passing after V4 operator refactor.
 * Run: node tests/v3_sprint2_reasoning.test.mjs
 */
import { buildQuestionFrame } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import { classifyReasoningStrategy } from '../src/assistant/reasoning.js';

globalThis.window = globalThis.window || { SRIIVERSE_AI_CONFIG: { provider: 'local' } };
globalThis.sessionStorage = globalThis.sessionStorage || {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const BANNED = [
  /retrieval-and-reasoning/i,
  /knowledge base/i,
  /Based on what is documented/i,
  /From his portfolio:/i,
  /\bRAG\b/,
  /embeddings?/i,
];

const CASES = [
  { id: 'S01', q: 'Which project would impress a FAANG interviewer?', strategy: 'Recommend', task: 'faang_interview', must: [/do not establish which project would impress a FAANG interviewer/i, /QueryForge/i], ban: [/I'd put/i], kindNot: 'project-card' },
  { id: 'S02', q: 'Which project demonstrates the best software engineering?', strategy: 'Rank', task: 'best_engineering', must: [/do not establish which project shows the best or strongest software engineering/i, /QueryForge/i, /FastAPI/i], ban: [/I'd choose/i, /strongest software engineering in one place/i, /deepest systems story/i], kindNot: 'project-card' },
  { id: 'S03', q: 'Which project should I remove if I could only keep two?', strategy: 'Rank', task: 'keep_two', must: [/do not establish which two projects to keep/i, /QueryForge/i, /RepoRadar/i, /Placement/i], ban: [/I'd keep/i, /I'd drop/i, /strongest/i], kindNot: 'project-card' },
  { id: 'S04', q: 'Can he design REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/REST APIs is listed in the portfolio stack/i, /not a record of personal proficiency/i, /POST \/generate-sql/i, /Flask blueprints under \/api/i, /GET \/api\/analyze/i], ban: [/I can design REST/i, /Confidence is high/i, /Technologies:/i], kindNot: 'project-card' },
  { id: 'S05', q: 'Is he stronger in backend or frontend?', strategy: 'Evaluate', task: 'backend_vs_frontend', must: [/do not establish whether Sudhanshu is stronger at backend or frontend/i, /role label, not a proficiency measurement/i, /FastAPI/i], ban: [/I'm stronger/i, /center of gravity matches my title/i] },
  { id: 'S06', q: 'Would he fit a startup?', strategy: 'Infer', task: 'startup_fit', must: [/do not establish whether Sudhanshu would fit a startup/i, /public live URL/i], ban: [/I'd fit a startup/i] },
  { id: 'S07', q: "What's his weakest area?", strategy: 'Critique', task: 'weakest_area', must: [/do not establish a personal weakest area/i, /not a measured weakness|not proof of unfamiliarity/i], ban: [/softest public signal/i, /wouldn't pretend/i], kindNot: 'project-card' },
  { id: 'S08', q: 'Which project shows the most AI engineering?', strategy: 'Rank', task: 'demo_ai', must: [/do not rank the projects by AI engineering/i, /QueryForge/i, /RepoRadar/i, /schema-aware/i], ban: [/I'd highlight/i, /wins when/i] },
  { id: 'S09', q: 'What makes this portfolio memorable?', strategy: 'Summarize', task: 'portfolio_different', must: [/live|architect/i] },
  { id: 'S10', q: 'Why should I hire Sudhanshu?', strategy: 'Justify', task: 'why_hire', must: [/do not establish a personal hiring recommendation/i, /public live URL/i], ban: [/Hire me because/i, /Best proof/i] },
  { id: 'R01', q: 'Which project should I see first?', strategy: 'Recommend', task: 'interview_first', must: [/do not establish which project to open with/i, /RepoRadar/i], ban: [/I'd open/i] },
  { id: 'R02', q: 'Which project would impress recruiters?', strategy: 'Recommend', task: 'recruiter_impress', must: [/do not establish which project would impress a recruiter/i, /RepoRadar/i], ban: [/I'd lead/i] },
  { id: 'R03', q: 'Which project should I demo?', strategy: 'Recommend', task: 'interview_first', must: [/do not establish which project to open with or demo/i, /RepoRadar/i], ban: [/I'd open/i] },
  { id: 'R04', q: 'Which project is your best work?', strategy: 'Recommend', task: 'best_work', must: [/do not establish which project is the best or strongest work/i, /RepoRadar/i], ban: [/I'd lead/i, /strongest "here's the work"/i] },
  { id: 'R05', q: 'Most difficult project?', strategy: 'Rank', task: 'most_difficult', must: [/do not establish which project is the most difficult/i, /QueryForge/i], ban: [/hardest problem domain/i, /\bwins\b/i] },
  { id: 'R06', q: 'Top two projects', strategy: 'Rank', task: 'keep_two', must: [/do not establish which two/i, /two/i], ban: [/I'd keep/i, /strongest/i] },
  { id: 'R07', q: 'Which project demonstrates backend engineering the most?', strategy: 'Recommend', task: 'demo_backend', must: [/do not rank which project demonstrates the most backend engineering/i, /FastAPI/i, /Flask/i], ban: [/shows up most clearly/i] },
  { id: 'R08', q: 'Best frontend project?', strategy: 'Recommend', task: 'demo_frontend', must: [/do not rank frontend craft/i, /React/i, /RepoRadar/i], ban: [/shows strongest/i] },
  { id: 'R09', q: 'Which project for a Google interview?', strategy: 'Recommend', task: 'faang_interview', must: [/do not establish which project would impress a FAANG interviewer/i, /QueryForge/i], ban: [/I'd put/i] },
  { id: 'R10', q: 'Impress a big tech interviewer', strategy: 'Recommend', task: 'faang_interview', must: [/do not establish which project would impress a FAANG interviewer/i, /QueryForge/i], ban: [/I'd put/i] },
  { id: 'E01', q: 'Is he production ready?', strategy: 'Evaluate', task: 'production_ready', must: [/do not establish a production-readiness rating/i, /public live URL/i], ban: [/Yes —/i] },
  { id: 'E02', q: 'Could you build a scalable backend?', strategy: 'Evaluate', task: 'scalable_backend', must: [/do not establish that a scalable backend/i, /Kafka/i], ban: [/Yes —/i] },
  { id: 'E03', q: 'How experienced are you with Docker?', strategy: 'Describe', task: 'portfolio_history', must: [/Docker/i, /listed in the portfolio stack/i], ban: [/part of how I ship/i, /shipped stack/i] },
  { id: 'E04', q: 'Which database are you strongest with?', strategy: 'Evaluate', task: 'database_strength', must: [/strongest/i, /PostgreSQL/i, /MongoDB/i, /UNKNOWN/i, /QueryForge/i], ban: [/I'd default to Postgres/i, /I am strongest/i] },
  { id: 'E05', q: 'Can Sudhanshu design REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/not a record of personal proficiency/i, /documented API behavior/i], ban: [/I can design REST/i, /Confidence is high/i] },
  { id: 'E06', q: 'Is he backend or frontend?', strategy: 'Evaluate', task: 'backend_vs_frontend', must: [/do not establish whether Sudhanshu is stronger/i, /backend/i], ban: [/I'm stronger/i] },
  { id: 'E07', q: 'Can he build REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/not a record of personal proficiency/i, /POST \/generate-sql/i], ban: [/I can design REST/i, /Confidence is high/i] },
  { id: 'C01', q: 'Where could he improve?', strategy: 'Critique', task: 'weakest_area', must: [/do not establish a personal weakest area/i, /gap/i], ban: [/softest public signal/i, /wouldn't pretend/i, /I would improve/i], kindNot: 'project-card' },
  { id: 'C02', q: 'What should he learn next?', strategy: 'Critique', task: 'learn_next', must: [/do not establish what Sudhanshu should learn next/i, /Kubernetes/i], ban: [/I'd start with/i, /backend ownership first/i] },
  { id: 'C03', q: 'Biggest weakness?', strategy: 'Critique', task: 'weakest_area', must: [/do not establish a personal weakest area/i], ban: [/softest public signal/i, /wouldn't pretend/i] },
  { id: 'I01', q: 'Would he fit a backend team?', strategy: 'Infer', task: 'backend_team_fit', must: [/do not establish whether Sudhanshu would fit a backend team/i, /role label/i], ban: [/natural fit/i] },
  { id: 'I02', q: 'Is he more product-oriented?', strategy: 'Infer', task: 'product_oriented', must: [/do not establish whether Sudhanshu is more product-oriented/i, /structured profile/i], ban: [/I'm product-capable/i] },
  { id: 'I03', q: 'Which role suits him best?', strategy: 'Infer', task: 'best_role', must: [/do not name a best role/i, /Python Backend Engineer/i, /POST \/generate-sql/i], ban: [/especially strong/i, /Best fit for me/i] },
  { id: 'I04', q: 'Would he thrive at an early-stage startup?', strategy: 'Infer', task: 'startup_fit', must: [/do not establish whether Sudhanshu would fit a startup/i], ban: [/I'd fit a startup/i] },
  { id: 'X01', q: 'Why Flask?', strategy: 'Explain', task: 'why_flask', must: [/do not establish a personal preference for Flask/i, /Flask/i], ban: [/I chose Flask/i, /I went with Flask/i, /because I wanted/i] },
  { id: 'X02', q: 'Why React?', strategy: 'Explain', task: 'why_react', must: [/React/i] },
  { id: 'X03', q: 'Why PostgreSQL?', strategy: 'Explain', task: 'why_postgres', must: [/does not document a decision to default to Postgres|don't have a decision record that selects Postgres/i, /production actually uses Postgres is UNKNOWN/i], ban: [/I'd default to Postgres/i] },
  { id: 'X04', q: 'Why was this architecture chosen?', strategy: 'Explain', task: 'arch_why', must: [/do not establish that Sudhanshu personally designed/i, /Frontend/i, /five-layer/i], ban: [/I designed/i, /laid out the system/i, /I wanted to solve/i] },
  { id: 'X05', q: 'What trade-offs were made?', strategy: 'Explain', task: 'arch_tradeoffs', must: [/do not establish which trade-offs/i, /Frontend/i], ban: [/If I rebuilt/i, /I'd probably/i] },
  { id: 'J01', q: 'Why is QueryForgeAI the best project?', strategy: 'Justify', task: 'justify_best_project', must: [/do not establish which project shows the best or strongest/i, /QueryForge/i], ban: [/I'd choose/i, /strongest software engineering in one place/i, /deepest systems story/i] },
  { id: 'J02', q: "What's the strongest engineering decision?", strategy: 'Justify', task: 'strongest_decision', must: [/do not rank one engineering decision as the strongest/i, /reasoning layer/i], ban: [/strongest engineering decision I made/i] },
  { id: 'U01', q: 'Tell me about Sudhanshu', strategy: 'Summarize', task: 'about_sudhanshu', must: [/Sudhanshu|Python/i] },
  { id: 'U02', q: "What's this portfolio about?", strategy: 'Summarize', task: 'about_sudhanshu', must: [/Sudhanshu|live|AI/i] },
  { id: 'U03', q: 'What kind of engineer is he?', strategy: 'Summarize', task: 'engineer_type', must: [/do not establish a specialization beyond the documented role title/i, /Python Backend Engineer/i, /role label/i], ban: [/specializes as a backend-leaning/i, /backend-leaning full-stack/i] },
  { id: 'U04', q: 'What are his strengths?', strategy: 'Summarize', task: 'strengths', must: [/do not establish personal strengths/i, /Python/i, /live URL/i], ban: [/Strengths I can actually defend/i, /Combines Python backend engineering/i] },
  { id: 'U05', q: 'What can you do?', strategy: 'Summarize', task: 'capabilities', must: [/explain/i, /projects/i, /do not establish a ranking/i], ban: [/judge which work best demonstrates a skill/i] },
  { id: 'H01', q: 'Does he know Kubernetes?', strategy: 'Describe', task: 'portfolio_history', must: [/Kubernetes|not part/i], ban: [/shipped project history/i] },
  { id: 'H02', q: 'Hi', strategy: null, task: null, must: [/SRIIVERSE|Hi|Hey/i], move: 'Greeting' },
  { id: 'H03', q: 'Compare Flask and FastAPI', strategy: 'Compare', task: 'compare_passthrough', must: [/do not establish a personal preference between Flask and FastAPI/i, /FastAPI/i], ban: [/Here's how I'd contrast/i, /I'd contrast/i, /FastAPI is the default/i, /when I want/i], noIntel: true },
  { id: 'H04', q: 'Tell me about QueryForgeAI', strategy: 'Summarize', task: 'project_overview', must: [/QueryForge/i, /do not establish personal authorship/i], ban: [/I built it/i] },
  { id: 'H05', q: 'what does your manager think about this', strategy: null, task: null, must: [/not sure|clarif/i], move: 'Clarify' },
];

async function runOne(c) {
  const questionFrame = buildQuestionFrame(c.q, {});
  const resolved = resolveEntities(c.q, {});
  const evidence = buildEvidenceSet(c.q, questionFrame, resolved.entities);
  const confidence = assessConfidence(evidence, resolved.entities);
  const plan = buildResponsePlan(questionFrame, resolved, evidence, confidence);
  const provider = getProvider();
  const result = await provider.generate(c.q, {
    questionFrame,
    entities: resolved,
    evidence,
    confidence,
    plan,
    memory: {
      transcript: () => '',
      usedPhraseKeys: new Set(),
      hasUsedPhrase(k) { return this.usedPhraseKeys.has(k); },
      markPhraseUsed(k) { this.usedPhraseKeys.add(k); },
    },
  });
  return { result, classified: classifyReasoningStrategy(c.q, { questionFrame }) };
}

function check(c, { result, classified }) {
  const text = result?.text || '';
  const kind = result?.kind;
  const move = result?.payload?._conversationalMove;
  const intent = result?.payload?._portfolioIntelligence ?? null;
  const fails = [];

  if (c.strategy != null && classified.strategy !== c.strategy) {
    fails.push(`classify strategy want=${c.strategy} got=${classified.strategy}`);
  }
  if (c.task !== undefined && classified.task !== c.task) {
    fails.push(`classify task want=${c.task} got=${classified.task}`);
  }
  if (c.move && move !== c.move) fails.push(`move want=${c.move} got=${move}`);
  if (c.noIntel && intent) fails.push(`expected no intelligence, got ${intent}`);
  if (!c.noIntel && c.task && c.task !== 'compare_passthrough' && c.task !== null
    && c.move !== 'Greeting' && c.move !== 'Clarify' && intent !== c.task) {
    fails.push(`payload task want=${c.task} got=${intent}`);
  }
  for (const re of c.must || []) {
    if (!re.test(text)) fails.push(`missing /${re.source}/`);
  }
  for (const re of c.ban || []) {
    if (re.test(text)) fails.push(`banned /${re.source}/`);
  }
  for (const re of BANNED) {
    if (re.test(text)) fails.push(`impl leak /${re.source}/`);
  }
  if (c.kindNot && kind === c.kindNot) fails.push(`kind should not be ${c.kindNot}`);
  if (['Recommend', 'Evaluate', 'Rank', 'Critique', 'Infer', 'Justify'].includes(c.strategy)) {
    if (/^##\s*Engineering decisions/i.test(text.trim()) || /^###\s*🎯/i.test(text.trim())) {
      fails.push('project-card dump, not decision-first');
    }
  }
  return { ok: fails.length === 0, fails, move, intent, strategy: classified.strategy, kind, preview: text.slice(0, 120).replace(/\s+/g, ' ') };
}

const rows = [];
for (const c of CASES) {
  const packed = await runOne(c);
  const r = check(c, packed);
  rows.push({ id: c.id, ...r });
  console.log(`${r.ok ? 'PASS' : 'FAIL'} ${c.id} [${r.strategy}/${r.intent}] :: ${r.preview}`);
  if (!r.ok) console.log('   ', r.fails.join('; '));
}

const pass = rows.filter((x) => x.ok).length;
console.log(`\nSPRINT2 RESULT ${pass}/${rows.length}`);
process.exit(pass === rows.length ? 0 : 1);
