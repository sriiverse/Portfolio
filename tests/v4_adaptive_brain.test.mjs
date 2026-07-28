/**
 * V4 Digital Engineering Brain + Adaptive Communication tests
 * Run: node tests/v4_adaptive_brain.test.mjs
 */
import {
  resolveAudienceMode,
  adaptDraft,
  fillWelcome,
  getWelcomeTemplates,
  buildProjectAudienceCallout,
  pickContextualInvite,
  formatSpokenComparison,
  inferSessionTopic,
} from '../src/assistant/adaptive.js';
import { DIGITAL_BRAIN, WELCOME_VARIANTS, SELF_MODEL, TECH_TAKES } from '../src/assistant/persona.js';
import { buildQuestionFrame } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';

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

test('persona exports Digital Engineering Brain identity', () => {
  assert(/digital engineering brain/i.test(DIGITAL_BRAIN.nature), 'nature');
  assert(SELF_MODEL.nature === DIGITAL_BRAIN.nature, 'SELF_MODEL aligned');
  assert(WELCOME_VARIANTS.length >= 2, 'welcome variants');
  assert(/digital engineering brain/i.test(fillWelcome(WELCOME_VARIANTS[0], 'Sudhanshu Sinha')), 'welcome fill');
});

test('resolveAudienceMode: explicit + profile + default', () => {
  assert(resolveAudienceMode({ query: "I'm a recruiter hiring for backend" }) === 'recruiter', 'recruiter');
  assert(resolveAudienceMode({ query: 'explain this simply, I am a beginner' }) === 'student', 'student');
  assert(resolveAudienceMode({ query: 'my startup needs someone who ships' }) === 'founder', 'founder');
  assert(resolveAudienceMode({ query: "I'm a senior engineer — deep dive the trade-offs" }) === 'engineer', 'engineer');
  assert(resolveAudienceMode({ visitorProfile: { type: 'founder' } }) === 'founder', 'profile');
  assert(resolveAudienceMode({ questionFrame: { questionType: 'Recruiter', rawQuery: 'why hire' } }) === 'recruiter', 'qtype');
  assert(resolveAudienceMode({ query: 'Tell me about QueryForgeAI' }) === 'default', 'default');
});

test('adaptDraft attaches audience mode metadata without lens labels', () => {
  const out = adaptDraft({
    text: 'Yes — I can design REST APIs. Confidence is high because REST appears across systems.\n\nWant a project walkthrough next?',
    kind: 'text',
    payload: { _conversationalMove: 'Answer' },
  }, { visitorProfile: { type: 'engineer' }, query: 'Can he design REST APIs?' });
  assert(out.payload._audienceMode === 'engineer', 'mode');
  assert(out.payload._digitalBrain === DIGITAL_BRAIN.title, 'brain meta');
  assert(!/Engineering lens|Hiring lens|Founder lens|Learning lens/i.test(out.text), 'no lens labels');
  assert(/\?\s*$/.test(out.text.trim()), 'ends with invite');
});

test('pickContextualInvite is topic-aware for Flask', () => {
  const invite = pickContextualInvite({
    payload: { _portfolioIntelligence: 'why_flask' },
    query: 'Why Flask?',
  }, 'Answer');
  assert(/FastAPI|architecture/i.test(invite), `invite=${invite}`);
});

test('formatSpokenComparison leads with speech not a table', () => {
  const entry = TECH_TAKES.find((t) => t.techs.includes('Flask') && t.techs.includes('FastAPI'));
  assert(entry, 'flask/fastapi take');
  const spoken = formatSpokenComparison(entry, { includeTable: true });
  const firstLine = spoken.trim().split('\n')[0];
  assert(!firstLine.startsWith('|'), `opened with: ${firstLine}`);
  assert(/Flask|FastAPI/i.test(spoken), 'names present');
  assert(/Dimension/i.test(spoken), 'table still available later');
});

test('inferSessionTopic reads prior turns in-session', () => {
  const topic = inferSessionTopic({
    memory: {
      recentTurns: () => [
        { role: 'user', text: 'Tell me about QueryForgeAI' },
        { role: 'assistant', text: 'QueryForgeAI optimizes SQL…' },
      ],
      turns: [],
    },
    query: 'Why Flask?',
  });
  assert(topic?.id === 'queryforge', `topic=${topic?.id}`);
});

test('project callouts differ by mode', () => {
  const proj = { name: 'RepoRadarAI', live: 'https://x', decisions: ['FastAPI for async I/O'] };
  assert(/Hire/i.test(buildProjectAudienceCallout(proj, 'recruiter', 'full-stack ownership')), 'recruiter');
  assert(/Trade-offs|Probe|constraints/i.test(buildProjectAudienceCallout(proj, 'engineer')), 'engineer');
  assert(/ownership/i.test(buildProjectAudienceCallout(proj, 'founder')), 'founder');
  assert(/Learn|Study/i.test(buildProjectAudienceCallout(proj, 'student')), 'student');
  assert(buildProjectAudienceCallout(proj, 'default') === '', 'default empty');
});

{
  const name = 'greeting uses professional Digital Engineering Brain welcome';
  try {
    const q = 'Hi';
    const questionFrame = buildQuestionFrame(q, {});
    const resolved = resolveEntities(q, {});
    const evidence = buildEvidenceSet(q, questionFrame, resolved.entities);
    const confidence = assessConfidence(evidence, resolved.entities);
    const plan = buildResponsePlan(questionFrame, resolved, evidence, confidence);
    const provider = getProvider();
    const result = await provider.generate(q, {
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
    assert(/SRIIVERSE AI/i.test(result.text), 'brand');
    assert(/digital engineering brain/i.test(result.text), 'brain welcome');
    assert(!/^Hey!/i.test(result.text.trim()), 'no casual hey');
    assert(result.payload?._conversationalMove === 'Greeting', 'move');
    assert(getWelcomeTemplates().length >= 2, 'templates');
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message || err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message || err}`);
  }
}

const pass = results.filter((r) => r.ok).length;
console.log(`\nRESULT ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
