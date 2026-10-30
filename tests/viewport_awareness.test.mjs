/**
 * Viewport awareness: the page-project observer must recompute currentProject
 * from every observed card, and question routing must keep that id behind
 * explicit names, an established project, a comparison, and a pending choice.
 *
 * Run: node tests/viewport_awareness.test.mjs
 */
import { buildQuestionFrame, enrichBoundContext } from '../src/assistant/conversation.js';
import { classifyReasoningStrategy, synthesizeReasoning } from '../src/assistant/reasoning.js';

const observers = [];
const pageCards = [
  { dataset: { projectId: 'queryforge' } },
  { dataset: { projectId: 'placementpro' } },
  { dataset: { projectId: 'reporadar' } },
];
const chatCard = { dataset: { projectId: 'reporadar' }, chat: true };

globalThis.document = {
  readyState: 'complete',
  addEventListener() {},
  getElementById() { return null; },
  querySelectorAll(selector) {
    if (selector === '#projectMount [data-project-id]') return pageCards;
    return [];
  },
};

globalThis.IntersectionObserver = class {
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.observed = [];
    observers.push(this);
  }
  observe(el) { this.observed.push(el); }
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
};

// The awareness singleton schedules its project observer and engagement
// timers on import. Hold those timers so this file does not wait on them.
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};

globalThis.window = globalThis.window || { SRIIVERSE_AI_CONFIG: { provider: 'local' } };
globalThis.sessionStorage = globalThis.sessionStorage || {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

const { default: awareness } = await import('../src/assistant/awareness.js');
awareness._attachProjectObserver();

const projectObserver = observers.find((observer) => observer.options?.threshold === 0.4);

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

function card(id) {
  return pageCards.find((el) => el.dataset.projectId === id);
}

function emit(ratios, { intersectingAt = null } = {}) {
  const entries = Object.entries(ratios).map(([id, ratio]) => ({
    target: card(id),
    intersectionRatio: ratio,
    // A card can still intersect the root after falling below the 0.4
    // threshold. Qualifying has to require the ratio, not only this flag.
    isIntersecting: intersectingAt ? intersectingAt(id, ratio) : ratio > 0,
  }));
  projectObserver.callback(entries);
}

function blankMemory() {
  return { lastProject: null, lastCommitment: null, turns: [] };
}

function answer(query, memory, awarenessProject = awareness.currentProject) {
  const bound = enrichBoundContext(query, {
    lastProject: memory.lastProject,
    projectIds: Array.isArray(memory.lastCommitment?.projectIds) ? memory.lastCommitment.projectIds : [],
    awarenessProject,
    pendingClarification: memory.lastCommitment?.task === 'context_clarify'
      && memory.lastCommitment?.pendingProject === true,
  });
  const questionFrame = buildQuestionFrame(bound.query, {
    focusProject: bound.focusProject,
    memory,
    awareness,
  });
  const reasoning = classifyReasoningStrategy(bound.query, { questionFrame, memory });
  const text = synthesizeReasoning(reasoning, bound.query, { questionFrame, memory }) || '';
  return { bound, questionFrame, reasoning, text };
}

test('the project observer watches page cards at the 0.4 threshold', () => {
  assert(projectObserver, 'project observer was not created');
  assert(projectObserver.options.threshold === 0.4, `threshold ${projectObserver.options.threshold}`);
  assert(projectObserver.observed.length === 3, `observed ${projectObserver.observed.length}`);
  assert(projectObserver.observed.includes(card('queryforge')), 'missed QueryForgeAI');
  assert(projectObserver.observed.includes(card('placementpro')), 'missed Placement Pro+');
  assert(projectObserver.observed.includes(card('reporadar')), 'missed RepoRadar');
  assert(!projectObserver.observed.includes(chatCard), 'chat card was observed');
  assert(awareness.currentProject == null, awareness.currentProject);
});

test('a page project crossing 0.4 sets currentProject', () => {
  emit({ queryforge: 0.4, placementpro: 0, reporadar: 0 });
  assert(awareness.currentProject === 'queryforge', awareness.currentProject);
});

test('dropping below 0.4 clears currentProject when nothing else qualifies', () => {
  emit({ queryforge: 0.39 }, { intersectingAt: () => true });
  assert(awareness.currentProject == null, awareness.currentProject);
});

test('a card that stays qualifying replaces one that leaves without its own callback', () => {
  emit({ queryforge: 0.8, placementpro: 0.62 });
  assert(awareness.currentProject === 'queryforge', awareness.currentProject);
  // Placement Pro+ is already above 0.4 and is absent from this callback.
  emit({ queryforge: 0.1 }, { intersectingAt: () => true });
  assert(awareness.currentProject === 'placementpro', awareness.currentProject);
});

test('several qualifying cards select the highest intersection ratio', () => {
  emit({ queryforge: 0.45, placementpro: 0.5, reporadar: 0.91 });
  assert(awareness.currentProject === 'reporadar', awareness.currentProject);
});

test('equal ratios keep the earlier card in #projectMount', () => {
  emit({ queryforge: 0.6, placementpro: 0.6, reporadar: 0.2 });
  assert(awareness.currentProject === 'queryforge', awareness.currentProject);
  emit({ queryforge: 0, placementpro: 0.55, reporadar: 0.55 });
  assert(awareness.currentProject === 'placementpro', awareness.currentProject);
});

test('a chat card cannot override a visible page project', () => {
  emit({ queryforge: 0.5, placementpro: 0, reporadar: 0 });
  projectObserver.callback([
    { target: card('queryforge'), intersectionRatio: 0.5, isIntersecting: true },
    { target: chatCard, intersectionRatio: 0.99, isIntersecting: true },
  ]);
  assert(awareness.currentProject === 'queryforge', awareness.currentProject);
});

test('a chat card alone cannot establish currentProject', () => {
  emit({ queryforge: 0, placementpro: 0, reporadar: 0 });
  projectObserver.callback([
    { target: chatCard, intersectionRatio: 1, isIntersecting: true },
  ]);
  assert(awareness.currentProject == null, awareness.currentProject);
});

test('no viewport project asks which backend', () => {
  emit({ queryforge: 0, placementpro: 0, reporadar: 0 });
  const turn = answer('What backend does it use?', blankMemory());
  assert(awareness.currentProject == null, awareness.currentProject);
  assert(turn.bound.enriched === false, turn.bound.query);
  assert(turn.reasoning.task === 'context_clarify', turn.reasoning.task);
  assert(/which project/i.test(turn.text), turn.text);
});

test('a qualifying RepoRadar card can resolve an unscoped backend question', () => {
  emit({ queryforge: 0, placementpro: 0.1, reporadar: 0.72 });
  const turn = answer('What backend does it use?', blankMemory());
  assert(awareness.currentProject === 'reporadar', awareness.currentProject);
  assert(turn.bound.focusProject === 'reporadar', turn.bound.focusProject);
  assert(turn.reasoning.task === 'reporadar_detail', turn.reasoning.task);
  assert(/\/api\/analyze/i.test(turn.text), turn.text);
});

test('leaving the qualifying set asks for clarification again', () => {
  emit({ reporadar: 0.2 }, { intersectingAt: () => true });
  const turn = answer('What backend does it use?', blankMemory());
  assert(awareness.currentProject == null, awareness.currentProject);
  assert(turn.reasoning.task === 'context_clarify', turn.reasoning.task);
  assert(/which project/i.test(turn.text), turn.text);
});

test('a pending clarification stays unresolved while the viewport changes', () => {
  const memory = {
    lastProject: null,
    lastCommitment: { task: 'context_clarify', pendingProject: true, aspect: 'backend', projectId: null },
    turns: [],
  };
  emit({ reporadar: 0.88 });
  const first = answer('What backend does it use?', memory);
  assert(awareness.currentProject === 'reporadar', awareness.currentProject);
  assert(first.bound.enriched === false, first.bound.query);
  assert(first.reasoning.task === 'context_clarify', first.reasoning.task);
  emit({ reporadar: 0, placementpro: 0.81 });
  const second = answer('What about its database?', memory);
  assert(awareness.currentProject === 'placementpro', awareness.currentProject);
  assert(second.bound.enriched === false, second.bound.query);
  assert(second.reasoning.task === 'context_clarify', second.reasoning.task);
  assert(/which project/i.test(second.text), second.text);
});

test('an explicit Placement Pro+ question overrides a RepoRadar viewport', () => {
  emit({ reporadar: 0.9, placementpro: 0, queryforge: 0 });
  const turn = answer('What backend does Placement Pro+ use?', blankMemory());
  assert(awareness.currentProject === 'reporadar', awareness.currentProject);
  assert(turn.bound.focusProject === 'placementpro', turn.bound.focusProject);
  assert(turn.reasoning.task === 'placementpro_detail', turn.reasoning.task);
  assert(/Flask 3\.1/i.test(turn.text), turn.text);
  assert(!/\/api\/analyze/i.test(turn.text), turn.text);
});

test('an established QueryForgeAI conversation ignores a visible RepoRadar card', () => {
  emit({ reporadar: 0.86, queryforge: 0, placementpro: 0 });
  const memory = {
    lastProject: 'queryforge',
    lastCommitment: { task: 'queryforge_detail', projectId: 'queryforge', name: 'QueryForgeAI' },
    turns: [],
  };
  const turn = answer('What backend does it use?', memory);
  assert(turn.bound.focusProject === 'queryforge', turn.bound.focusProject);
  assert(turn.reasoning.task === 'queryforge_detail', turn.reasoning.task);
  assert(/FastAPI/i.test(turn.text) && /Uvicorn/i.test(turn.text), turn.text);
  assert(!/\/api\/analyze/i.test(turn.text), turn.text);
});

test('Explain the architecture does not take a viewport project while clarification is pending', () => {
  emit({ reporadar: 0.93 });
  const memory = {
    lastProject: null,
    lastCommitment: { task: 'context_clarify', pendingProject: true, aspect: 'backend', projectId: null },
    turns: [],
  };
  const frame = buildQuestionFrame('Explain the architecture', { memory, awareness });
  assert(awareness.currentProject === 'reporadar', awareness.currentProject);
  assert(frame.projectId == null, frame.projectId);
  assert(frame.scope !== 'project', frame.scope);
});

test('a comparison follow-up keeps both projects while a card is visible', () => {
  emit({ reporadar: 0.84, queryforge: 0, placementpro: 0 });
  const memory = {
    lastProject: null,
    lastCommitment: {
      task: 'cross_project_compare',
      projectId: null,
      projectIds: ['queryforge', 'placementpro'],
    },
    turns: [],
  };
  const turn = answer('What about its database?', memory);
  assert(turn.reasoning.task === 'cross_project_compare', turn.reasoning.task);
  assert(turn.reasoning.projectIds?.includes('queryforge'), turn.reasoning.projectIds);
  assert(turn.reasoning.projectIds?.includes('placementpro'), turn.reasoning.projectIds);
  assert(/QueryForgeAI/i.test(turn.text) && /Placement Pro/i.test(turn.text), turn.text);
  assert(turn.bound.focusProject == null, turn.bound.focusProject);
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) process.exit(1);
