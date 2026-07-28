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
  { id: 'S01', q: 'Which project would impress a FAANG interviewer?', strategy: 'Recommend', task: 'faang_interview', must: [/QueryForge|I'd put/i], kindNot: 'project-card' },
  { id: 'S02', q: 'Which project demonstrates the best software engineering?', strategy: 'Rank', task: 'best_engineering', must: [/QueryForge|I'd choose/i], kindNot: 'project-card' },
  { id: 'S03', q: 'Which project should I remove if I could only keep two?', strategy: 'Rank', task: 'keep_two', must: [/keep|QueryForge|RepoRadar/i], kindNot: 'project-card' },
  { id: 'S04', q: 'Can he design REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/Yes/i, /REST/i], ban: [/Technologies:/i], kindNot: 'project-card' },
  { id: 'S05', q: 'Is he stronger in backend or frontend?', strategy: 'Evaluate', task: 'backend_vs_frontend', must: [/backend/i] },
  { id: 'S06', q: 'Would he fit a startup?', strategy: 'Infer', task: 'startup_fit', must: [/Yes|startup/i] },
  { id: 'S07', q: "What's his weakest area?", strategy: 'Critique', task: 'weakest_area', must: [/Strengths|Limitation|ops|cloud|growth|signal/i], kindNot: 'project-card' },
  { id: 'S08', q: 'Which project shows the most AI engineering?', strategy: 'Rank', task: 'demo_ai', must: [/QueryForge|RepoRadar|AI/i] },
  { id: 'S09', q: 'What makes this portfolio memorable?', strategy: 'Summarize', task: 'portfolio_different', must: [/live|architect/i] },
  { id: 'S10', q: 'Why should I hire Sudhanshu?', strategy: 'Justify', task: 'why_hire', must: [/Hire|ship/i] },
  { id: 'R01', q: 'Which project should I see first?', strategy: 'Recommend', task: 'interview_first', must: [/RepoRadar|open with|I'd open/i] },
  { id: 'R02', q: 'Which project would impress recruiters?', strategy: 'Recommend', task: 'recruiter_impress', must: [/RepoRadar|recruiter/i] },
  { id: 'R03', q: 'Which project should I demo?', strategy: 'Recommend', task: 'interview_first', must: [/RepoRadar|demo|open/i] },
  { id: 'R04', q: 'Which project is your best work?', strategy: 'Recommend', task: 'best_work', must: [/RepoRadar|lead/i] },
  { id: 'R05', q: 'Most difficult project?', strategy: 'Rank', task: 'most_difficult', must: [/QueryForge/i] },
  { id: 'R06', q: 'Top two projects', strategy: 'Rank', task: 'keep_two', must: [/keep|two/i] },
  { id: 'R07', q: 'Which project demonstrates backend engineering the most?', strategy: 'Recommend', task: 'demo_backend', must: [/QueryForge|Placement|backend|RepoRadar/i] },
  { id: 'R08', q: 'Best frontend project?', strategy: 'Recommend', task: 'demo_frontend', must: [/RepoRadar|React|frontend/i] },
  { id: 'R09', q: 'Which project for a Google interview?', strategy: 'Recommend', task: 'faang_interview', must: [/QueryForge|FAANG|interview/i] },
  { id: 'R10', q: 'Impress a big tech interviewer', strategy: 'Recommend', task: 'faang_interview', must: [/QueryForge|I'd put/i] },
  { id: 'E01', q: 'Is he production ready?', strategy: 'Evaluate', task: 'production_ready', must: [/Yes/i] },
  { id: 'E02', q: 'Could you build a scalable backend?', strategy: 'Evaluate', task: 'scalable_backend', must: [/Yes/i] },
  { id: 'E03', q: 'How experienced are you with Docker?', strategy: 'Evaluate', task: 'docker_experience', must: [/Docker/i] },
  { id: 'E04', q: 'Which database are you strongest with?', strategy: 'Evaluate', task: 'database_strength', must: [/Postgres|Mongo|QueryForge/i] },
  { id: 'E05', q: 'Can Sudhanshu design REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/Yes/i] },
  { id: 'E06', q: 'Is he backend or frontend?', strategy: 'Evaluate', task: 'backend_vs_frontend', must: [/backend/i] },
  { id: 'E07', q: 'Can he build REST APIs?', strategy: 'Evaluate', task: 'eval_rest_apis', must: [/Yes/i, /Confidence/i] },
  { id: 'C01', q: 'Where could he improve?', strategy: 'Critique', task: 'weakest_area', must: [/Strengths|Limitation|ops|signal|gap/i], kindNot: 'project-card' },
  { id: 'C02', q: 'What should he learn next?', strategy: 'Critique', task: 'learn_next', must: [/won't invent|observability|async|pinning/i] },
  { id: 'C03', q: 'Biggest weakness?', strategy: 'Critique', task: 'weakest_area', must: [/Strengths|Limitation|signal|gap/i] },
  { id: 'I01', q: 'Would he fit a backend team?', strategy: 'Infer', task: 'backend_team_fit', must: [/Yes|backend/i] },
  { id: 'I02', q: 'Is he more product-oriented?', strategy: 'Infer', task: 'product_oriented', must: [/product/i] },
  { id: 'I03', q: 'Which role suits him best?', strategy: 'Infer', task: 'best_role', must: [/Python|backend|AI/i] },
  { id: 'I04', q: 'Would he thrive at an early-stage startup?', strategy: 'Infer', task: 'startup_fit', must: [/Yes|startup/i] },
  { id: 'X01', q: 'Why Flask?', strategy: 'Explain', task: 'why_flask', must: [/Flask/i] },
  { id: 'X02', q: 'Why React?', strategy: 'Explain', task: 'why_react', must: [/React/i] },
  { id: 'X03', q: 'Why PostgreSQL?', strategy: 'Explain', task: 'why_postgres', must: [/Postgres/i] },
  { id: 'X04', q: 'Why was this architecture chosen?', strategy: 'Explain', task: 'arch_why', must: [/five-layer|Frontend/i] },
  { id: 'X05', q: 'What trade-offs were made?', strategy: 'Explain', task: 'arch_tradeoffs', must: [/trade-?off/i] },
  { id: 'J01', q: 'Why is QueryForgeAI the best project?', strategy: 'Justify', task: 'justify_best_project', must: [/QueryForge|I'd choose/i] },
  { id: 'J02', q: "What's the strongest engineering decision?", strategy: 'Justify', task: 'strongest_decision', must: [/reasoning layer/i] },
  { id: 'U01', q: 'Tell me about Sudhanshu', strategy: 'Summarize', task: 'about_sudhanshu', must: [/Sudhanshu|Python/i] },
  { id: 'U02', q: "What's this portfolio about?", strategy: 'Summarize', task: 'about_sudhanshu', must: [/Sudhanshu|live|AI/i] },
  { id: 'U03', q: 'What kind of engineer is he?', strategy: 'Summarize', task: 'engineer_type', must: [/backend|full-stack|AI/i] },
  { id: 'U04', q: 'What are his strengths?', strategy: 'Summarize', task: 'strengths', must: [/Shipping|Backend|Python|strength|live/i] },
  { id: 'U05', q: 'What can you do?', strategy: 'Summarize', task: 'capabilities', must: [/explain|projects/i] },
  { id: 'H01', q: 'Does he know Kubernetes?', strategy: 'Describe', task: null, must: [/Kubernetes|not part/i], noIntel: true },
  { id: 'H02', q: 'Hi', strategy: null, task: null, must: [/SRIIVERSE|Hi|Hey/i], move: 'Greeting' },
  { id: 'H03', q: 'Compare Flask and FastAPI', strategy: 'Compare', task: 'compare_passthrough', must: [/Flask|FastAPI/i], noIntel: true },
  { id: 'H04', q: 'Tell me about QueryForgeAI', strategy: 'Describe', task: null, must: [/QueryForge/i] },
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
