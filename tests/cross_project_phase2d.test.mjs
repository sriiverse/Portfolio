/**
 * Phase 2D — Cross-Project Intelligence Evaluation.
 *
 * Exercises the live compose path:
 *   question frame → entities → evidence → plan → provider draft
 *   → adaptive → reflection
 * Context enrichment uses enrichBoundContext(), the same helper as resolveContext().
 *
 * Run (Node 22+ so extensionless ESM in src/ loads):
 *   node tests/cross_project_phase2d.test.mjs
 */
import { buildQuestionFrame, enrichBoundContext } from '../src/assistant/conversation.js';
import { resolveEntities, assessConfidence } from '../src/assistant/entities.js';
import { buildEvidenceSet } from '../src/assistant/knowledge.js';
import { buildResponsePlan } from '../src/assistant/planning.js';
import { getProvider } from '../src/assistant/providers.js';
import { adaptDraft } from '../src/assistant/adaptive.js';
import { finalizeWithReflection } from '../src/assistant/reflection.js';
import {
  classifyReasoningStrategy,
} from '../src/assistant/reasoning.js';
import { matchQueryForgeFacet } from '../src/assistant/queryforgeKnowledge.js';
import { matchPlacementProFacet } from '../src/assistant/placementproKnowledge.js';
import { matchRepoRadarFacet } from '../src/assistant/reporadarKnowledge.js';

globalThis.window = globalThis.window || { SRIIVERSE_AI_CONFIG: { provider: 'local' } };
globalThis.sessionStorage = globalThis.sessionStorage || {
  _d: {},
  getItem(k) { return this._d[k] ?? null; },
  setItem(k, v) { this._d[k] = String(v); },
  removeItem(k) { delete this._d[k]; },
};

function createMemory() {
  return {
    turnCount: 0,
    turns: [],
    lastProject: null,
    activeMode: null,
    lastCommitment: null,
    hasUsedPhrase: () => false,
    markPhraseUsed: () => {},
    bindConversationState({ projectId, mode, commitment, clearProject } = {}) {
      if (clearProject || (Array.isArray(commitment?.projectIds) && commitment.projectIds.length >= 2)) {
        this.lastProject = null;
      } else if (projectId) {
        this.lastProject = projectId;
      }
      if (mode) this.activeMode = mode;
      if (commitment) this.lastCommitment = commitment;
    },
  };
}

/** Same enrichment resolveContext() uses. */
function enrichQuery(query, memory) {
  const multi = Array.isArray(memory?.lastCommitment?.projectIds)
    ? memory.lastCommitment.projectIds.filter(Boolean)
    : [];
  const pendingClarification = memory?.lastCommitment?.task === 'context_clarify'
    && memory?.lastCommitment?.pendingProject === true;
  return enrichBoundContext(query, {
    lastProject: memory?.lastProject || null,
    projectIds: multi,
    pendingClarification,
  });
}

async function ask(raw, memory) {
  const { query, focusProject, enriched } = enrichQuery(raw, memory);
  const questionFrame = buildQuestionFrame(query, { memory });
  const entities = resolveEntities(query);
  const evidence = buildEvidenceSet(query, questionFrame, entities.entities || []);
  const confidence = assessConfidence(evidence, entities.entities || []);
  const plan = buildResponsePlan(questionFrame, entities, evidence, confidence);
  const ctx = {
    questionFrame,
    entities,
    evidence,
    confidence,
    plan,
    memory,
    visitorProfile: { type: 'unknown' },
    query,
    focusProject,
  };
  const classified = classifyReasoningStrategy(query, ctx);
  const provider = getProvider();
  const draft = await provider._draftAnswer(query, ctx);
  const adapted = adaptDraft(draft, { ...ctx, query });
  const result = finalizeWithReflection(adapted, { ...ctx, query });
  memory.turnCount += 1;
  memory.turns.push({ q: raw, a: result.text });

  const qf = matchQueryForgeFacet(query);
  const pp = matchPlacementProFacet(query);
  const rr = matchRepoRadarFacet(query);

  return {
    raw,
    query,
    enriched,
    focusProject,
    questionType: questionFrame.questionType,
    conversationMode: questionFrame.conversationMode,
    subject: questionFrame.subject,
    move: questionFrame.move,
    entities: (entities.entities || []).map((e) => `${e.type}:${e.canonical}`),
    primary: entities.primaryEntity ? `${entities.primaryEntity.type}:${entities.primaryEntity.canonical}` : null,
    multiEntity: !!entities.multiEntity,
    evidenceIds: (evidence.supportingDocs || []).map((h) => h.doc.id),
    planTypes: (plan.blocks || []).map((b) => b.type),
    classifiedTask: classified?.task || null,
    classifiedStrategy: classified?.strategy || null,
    classifiedFocus: classified?.focus || null,
    facetCandidates: [qf?.id, pp?.id, rr?.id].filter(Boolean),
    responseKind: result.kind,
    intelligence: result.payload?._portfolioIntelligence || null,
    reasoning: result.payload?._reasoningStrategy || null,
    conversationalMove: result.payload?._conversationalMove || null,
    reflection: result.payload?._reflection?.overall || null,
    boundProject: memory.lastProject,
    boundTask: memory.activeMode,
    text: String(result.text || ''),
  };
}

function pass(note = 'semantic criteria met') {
  return { status: 'pass', category: null, layer: null, note };
}
function fail(category, layer, note) {
  return { status: 'fail', category, layer, note };
}
function weak(category, layer, note) {
  return { status: 'weak', category, layer, note };
}

function mentions(text, re) { return re.test(text); }
function namesAllThree(text) {
  return /queryforge/i.test(text) && /placement/i.test(text) && /reporadar/i.test(text);
}

/** Asserts a shared five-layer runtime, ignoring explicit denials. */
function assertsSharedFiveLayer(text) {
  return text.split(/(?<=[.!?\n])\s+/).some((s) => {
    const lower = s.toLowerCase();
    const five = lower.includes('five-layer');
    const shared = lower.includes('shar') || lower.includes('same spine') || lower.includes('all three') || lower.includes('across');
    const denied = /not the generic|does not|doesn't|do not|isn't|is not|no longer|outdated|not one shared|not a shared|do not share|is not true/.test(lower);
    return five && shared && !denied;
  });
}

/**
 * Empty DirectAnswers are a routing hole: planning.js withholds evidence
 * unless a reasoning task speaks, and compare_passthrough / null never speak.
 */
function refineVerdict(row) {
  if (!String(row.text || '').trim()) {
    const ev = row.evidenceIds.join(', ') || 'none';
    return {
      ...row,
      status: 'fail',
      category: 'routing failure',
      layer: 'routing',
      note: `Empty answer. task=${row.classifiedTask || 'null'} did not synthesize, so the empty DirectAnswer withheld retrieved evidence (${ev}).`,
    };
  }
  if (row.status !== 'fail' && assertsSharedFiveLayer(row.text)) {
    return {
      ...row,
      status: 'fail',
      category: 'unsupported synthesis',
      layer: 'synthesis',
      note: 'Spoken answer asserts a shared five-layer architecture across the projects.',
    };
  }
  return row;
}

function acceptsAllPython(text) {
  if (/is not true|not true|do not all|not all three|no separate python|not a python/i.test(text)) return false;
  return /all three[^.]{0,80}python backend|since all three use python|each (uses|has) a python backend|python backend on all three/i.test(text);
}

function acceptsRepoRadarLlm(text) {
  return /reporadar[^.]{0,80}(uses|used) (an? |a )?(generative )?(llm|gemini|language model)/i.test(text)
    && !/does not use|doesn't use|no generative|not an llm|not a generative/i.test(text);
}

function queryNames(text, id) {
  return new RegExp(id, 'i').test(String(text || ''));
}

function inventedImprovement(text) {
  return /i would (add|build|improve|change|rewrite|prioriti[sz]e)|next i would|the priority is|should be rebuilt|i recommend adding/i.test(text)
    && !/will not invent|not documented|not a chosen roadmap/i.test(text);
}

function acceptsRepoRadarSourceIngest(text) {
  return /reporadar[^.]{0,100}(clone|source code|source files|ast)[^.]{0,40}(analy|send|model)/i.test(text)
    && !/no git clone|does not clone|doesn't clone|not the target repository's source|no source-file/i.test(text);
}

const CASES = [];

function add(entry) { CASES.push(entry); }

add({
  id: 'A1',
  category: 'identity',
  q: 'What is SRIIVERSEAI?',
  judge(o) {
    const t = o.text;
    const universe = /engineering universe|portfolio environment|not (just |merely |one more )?(another )?project|not a skill/i.test(t);
    const brainCollapse = /^(it is|sriiverseai is) the digital brain\b/i.test(t) && !/inside|layer|interface/i.test(t);
    if (universe && /sudhanshu/i.test(t) && !brainCollapse) return pass('universe, not a fourth project');
    if (o.classifiedTask !== 'brand_explain' && o.intelligence !== 'brand_explain') {
      return fail('routing failure', 'routing', `expected brand_explain, got task=${o.classifiedTask}`);
    }
    return fail('entity confusion', 'synthesis', 'did not keep SRIIVERSEAI as the engineering universe distinct from a project or the Digital Brain');
  },
});

add({
  id: 'A2',
  category: 'identity',
  q: 'Is Digital Brain one of Sudhanshu\'s projects?',
  judge(o) {
    const t = o.text;
    const denies = /\b(no|not)\b[^.]{0,80}(project|fourth product|product card)/i.test(t)
      || /not a fourth product|not one of (his |the )?(three )?projects|intelligence (layer|interface)/i.test(t);
    const affirms = /\byes\b[^.]{0,40}(project|one of)/i.test(t) && !/not a project/i.test(t);
    if (denies && !affirms && /digital brain|intelligence/i.test(t)) return pass('Digital Brain denied as a project');
    if (affirms) return fail('entity confusion', 'synthesis', 'treated Digital Brain as one of the shipped projects');
    if (!o.intelligence && !o.classifiedTask) {
      return fail('routing failure', 'routing', 'no identity/triad task selected for the Digital Brain question');
    }
    return fail('entity confusion', 'reasoning', 'did not clearly deny that Digital Brain is a shipped project');
  },
});

add({
  id: 'A3',
  category: 'identity',
  q: 'How does Digital Brain relate to SRIIVERSEAI?',
  judge(o) {
    const t = o.text;
    const relates = /digital brain/i.test(t) && /sriiverse/i.test(t)
      && /inside|layer|interface|explore/i.test(t);
    const affirmsFourth = /\b(is|as) a fourth (product|project)\b/i.test(t);
    if (relates && !affirmsFourth) return pass('brain is the intelligence layer inside the universe');
    if (o.classifiedTask !== 'brand_explain' && o.classifiedTask !== 'role_triad' && o.classifiedTask !== 'identity') {
      return fail('routing failure', 'routing', `task=${o.classifiedTask} did not enter the identity triad`);
    }
    return fail('entity confusion', 'synthesis', 'did not state Digital Brain as the intelligence layer of SRIIVERSEAI');
  },
});

add({
  id: 'A4',
  category: 'identity',
  q: 'What is Digital Brain?',
  judge(o) {
    const t = o.text;
    const builder = /sudhanshu/i.test(t) && /engineer|builds|builder/i.test(t);
    const separated = /digital brain/i.test(t) || /sriiverse/i.test(t);
    if (!builder) {
      return fail('entity confusion', o.classifiedTask ? 'synthesis' : 'routing', 'did not identify Sudhanshu as the builder');
    }
    if (assertsSharedFiveLayer(t)) {
      return weak('unsupported synthesis', 'synthesis', 'identity separation is present, but the answer still asserts a shared five-layer architecture across the projects');
    }
    if (builder && separated) return pass('Sudhanshu kept distinct as the builder');
    return weak('entity confusion', 'synthesis', 'names Sudhanshu as engineer but does not place him against SRIIVERSEAI and the Digital Brain');
  },
});

add({
  id: 'B1',
  category: 'differentiation',
  q: 'How are QueryForgeAI, Placement Pro+, and RepoRadarAI fundamentally different?',
  judge(o) {
    const t = o.text;
    if (!namesAllThree(t)) {
      return fail('project confusion', o.classifiedTask === 'compare_passthrough' ? 'routing' : 'retrieval', 'answer does not distinguish all three projects');
    }
    const sql = /sql|natural language/i.test(t);
    const skills = /skill|roadmap|placement/i.test(t);
    const meta = /github|metadata|health/i.test(t);
    if (sql && skills && meta && !assertsSharedFiveLayer(t) && !acceptsRepoRadarLlm(t)) {
      return pass('three different jobs named without a shared-runtime claim');
    }
    if (assertsSharedFiveLayer(t) || /both share the same five-layer|AI layer reasons over/i.test(t)) {
      return fail('unsupported synthesis', 'synthesis', 'collapsed the three into one shared five-layer AI architecture');
    }
    if (o.classifiedTask === 'compare_passthrough' || !o.intelligence) {
      return fail('routing failure', 'routing', 'comparison fell through retrieval/brochure instead of composing project facets');
    }
    return fail('project confusion', 'reasoning', 'did not separate SQL generation, skill-gap, and GitHub metadata');
  },
});

add({
  id: 'B2',
  category: 'differentiation',
  q: 'What does each project actually analyze?',
  judge(o) {
    const t = o.text;
    const qf = /queryforge/i.test(t) && /schema_def|natural language|generating sql|sql\/mongo/i.test(t);
    const pp = /placement/i.test(t) && /skill/i.test(t);
    const rr = /reporadar/i.test(t) && /metadata|github|no git clone|not cloning|source files/i.test(t);
    const badResume = /analyzes your resume|resume parser/i.test(t)
      && !/no resume parser|not a resume|not ["“']?ai analyzes your resume/i.test(t);
    const badSource = /reporadar[^.]{0,80}(source code|internal architecture of the target)/i.test(t)
      && !/does not|doesn't|not a code|not cloning|no git clone/i.test(t);
    if (qf && pp && rr && !badResume && !badSource) return pass('each analysis target is distinct');
    if (!namesAllThree(t) && (o.classifiedTask === 'compare_passthrough' || !o.intelligence)) {
      return fail('routing failure', 'routing', 'no cross-project analysis task; retrieval did not cover all three targets');
    }
    return fail('project confusion', 'retrieval', `analyze-targets incomplete qf=${qf} pp=${pp} rr=${rr}`);
  },
});

add({
  id: 'B3',
  category: 'differentiation',
  q: 'Which project works with SQL?',
  judge(o) {
    const t = o.text;
    const qf = /queryforge/i.test(t) && /sql/i.test(t);
    const onlyOthers = !/queryforge/i.test(t) && /placement|reporadar/i.test(t);
    if (qf && !/reporadar[^.]{0,40}sql generation/i.test(t)) return pass('QueryForgeAI identified as the SQL system');
    if (onlyOthers) return fail('project confusion', 'routing', 'SQL question was not routed to QueryForgeAI');
    return fail('project confusion', 'reasoning', 'did not identify QueryForgeAI as the SQL system');
  },
});

add({
  id: 'B4',
  category: 'differentiation',
  q: 'Which project works with GitHub repository metadata?',
  judge(o) {
    const t = o.text;
    if (/reporadar/i.test(t) && /metadata|github/i.test(t) && !acceptsRepoRadarSourceIngest(t)) {
      return pass('RepoRadarAI identified as metadata intelligence');
    }
    if (/queryforge|placement/i.test(t) && !/reporadar/i.test(t)) {
      return fail('project confusion', 'routing', 'GitHub metadata question missed RepoRadarAI');
    }
    return fail('project confusion', 'reasoning', 'did not ground RepoRadarAI in GitHub metadata rather than source ingestion');
  },
});

add({
  id: 'B5',
  category: 'differentiation',
  q: 'Which project performs skill-gap matching?',
  judge(o) {
    const t = o.text;
    if (/placement/i.test(t) && /skill/i.test(t) && !/queryforge[^.]{0,40}skill-gap|reporadar[^.]{0,40}skill-gap/i.test(t)) {
      return pass('Placement Pro+ owns skill-gap matching');
    }
    return fail('project confusion', o.intelligence?.includes('placement') ? 'reasoning' : 'routing', 'skill-gap was not attributed to Placement Pro+');
  },
});

add({
  id: 'C1',
  category: 'technical',
  q: 'Which of the three uses machine learning, and what exactly is the model doing?',
  judge(o) {
    const t = o.text;
    const minilm = /minilm|sentence-?transform/i.test(t) && /placement|skill/i.test(t);
    const minilmJob = /embed|cosine|skill/i.test(t);
    const gemini = /gemini/i.test(t) && /queryforge/i.test(t);
    const rrDenied = /reporadar/i.test(t) && /not|no |does not|doesn't|heuristic/i.test(t);
    const rrMl = /reporadar[^.]{0,60}(machine learning|ml model|neural)/i.test(t) && !/does not|no ml|not an ml|not a learned/i.test(t);
    if (rrMl) return fail('project confusion', 'reasoning', 'attributed a learned model to RepoRadarAI');
    if (minilm && minilmJob && (gemini || rrDenied)) return pass('MiniLM skill mapping distinguished; RepoRadar not treated as the same ML');
    if (minilm && minilmJob && !/reporadar/i.test(t)) {
      return weak('reasoning failure', 'routing', 'Placement MiniLM is correct, but the answer never places QueryForgeAI or RepoRadarAI');
    }
    if (o.classifiedTask === 'compare_passthrough' || o.classifiedTask === 'demo_ai' || !o.intelligence) {
      return fail('routing failure', 'routing', `cross-project ML question landed on task=${o.classifiedTask}`);
    }
    return fail('reasoning failure', 'reasoning', 'did not say what the model actually does');
  },
});

add({
  id: 'C2',
  category: 'technical',
  q: 'Which project uses a generative LLM?',
  judge(o) {
    const t = o.text;
    const qf = /queryforge/i.test(t) && /gemini|groq|generative/i.test(t);
    const ppGen = /placement[^.]{0,80}(generative|gemini|groq)/i.test(t) && !/does not|doesn't|not a generative|not an llm/i.test(t);
    const rrGen = acceptsRepoRadarLlm(t);
    if (qf && !ppGen && !rrGen) return pass('only QueryForgeAI is the generative-LLM project');
    if (ppGen) return fail('false-premise acceptance', 'reasoning', 'treated Placement Pro+ as a generative LLM');
    if (rrGen) return fail('false-premise acceptance', 'reasoning', 'treated RepoRadarAI as a generative LLM');
    if (!qf) return fail('routing failure', 'routing', `did not select QueryForgeAI as the generative LLM (task=${o.classifiedTask})`);
    return fail('project confusion', 'reasoning', 'generative LLM attribution is mixed');
  },
});

add({
  id: 'C3',
  category: 'technical',
  q: 'Which projects are deterministic or heuristic?',
  judge(o) {
    const t = o.text;
    const pp = /placement/i.test(t) && /deterministic|heuristic|template/i.test(t);
    const rr = /reporadar/i.test(t) && /heuristic/i.test(t);
    const qfCaveat = !/queryforge[^.]{0,80}(fully deterministic|no (llm|model))/i.test(t);
    if (pp && rr && qfCaveat && !acceptsRepoRadarLlm(t)) return pass('Placement and RepoRadar heuristics distinguished from QueryForge generation');
    if (o.classifiedTask === 'compare_passthrough' || !o.intelligence) {
      return fail('routing failure', 'routing', 'heuristic question did not compose the project facets');
    }
    return fail('reasoning failure', 'reasoning', `heuristic split incomplete pp=${pp} rr=${rr}`);
  },
});

add({
  id: 'C4',
  category: 'technical',
  q: 'Compare the backend architectures of all three.',
  judge(o) {
    const t = o.text;
    const qf = /fastapi|uvicorn/i.test(t);
    const pp = /flask/i.test(t);
    const rr = /next\.?js/i.test(t) && /reporadar/i.test(t);
    const rrPython = /reporadar[^.]{0,80}(fastapi|flask)/i.test(t) && !/not |no separate|isn't|is not/i.test(t);
    if (qf && pp && rr && !rrPython && !assertsSharedFiveLayer(t)) {
      return pass('FastAPI, Flask, and Next.js kept distinct');
    }
    if (assertsSharedFiveLayer(t) || o.classifiedTask === 'arch_why') {
      return fail('generic architecture contamination', o.classifiedTask === 'arch_why' ? 'routing' : 'synthesis', 'answered with the portfolio five-layer spine instead of the three inspected backends');
    }
    if (rrPython) return fail('false-premise acceptance', 'synthesis', 'assigned a Python backend to RepoRadarAI');
    if (o.classifiedTask === 'compare_passthrough' || !o.intelligence) {
      return fail('routing failure', 'routing', 'backend comparison did not select the three architecture facets');
    }
    return fail('evidence-selection failure', 'retrieval', `backend facts incomplete fastapi=${qf} flask=${pp} next=${rr}`);
  },
});

add({
  id: 'C5',
  category: 'technical',
  q: 'Compare how the three projects obtain their input data.',
  judge(o) {
    const t = o.text;
    const qf = /schema|natural language|schema_def/i.test(t);
    const pp = /skill|profile/i.test(t);
    const rr = /github|url|octokit|metadata/i.test(t);
    const liveDb = /queryforge[^.]{0,80}(connects to|inspects) (a |the )?(live )?database/i.test(t) && !/does not|no live/i.test(t);
    const clone = /clone/i.test(t) && !/no git clone|does not clone|not cloning/i.test(t);
    if (qf && pp && rr && namesAllThree(t) && !liveDb && !clone) return pass('three input paths distinguished');
    if (liveDb || clone) return fail('false-premise acceptance', 'synthesis', 'invented live-DB or clone ingestion');
    if (o.classifiedTask === 'compare_passthrough' || !o.intelligence) {
      return fail('routing failure', 'routing', 'input-data comparison was not composed from the three facets');
    }
    return fail('evidence-selection failure', 'retrieval', `inputs incomplete qf=${qf} pp=${pp} rr=${rr}`);
  },
});

add({
  id: 'C6',
  category: 'technical',
  q: 'Compare persistence/storage across the three systems.',
  judge(o) {
    const t = o.text;
    const qf = /queryforge/i.test(t) && /in-memory|no database|no live/i.test(t);
    const pp = /placement/i.test(t) && /sqlite|postgres|sqlalchemy/i.test(t);
    const rr = /reporadar/i.test(t) && /no durable|in-memory|zustand|no database/i.test(t);
    const shared = /shared database|same postgres for all|all three use postgres/i.test(t)
      && !/not a shared database|no shared database/i.test(t);
    if (qf && pp && rr && !shared) return pass('persistence boundaries differ');
    if (shared) return fail('unsupported synthesis', 'synthesis', 'invented a shared database');
    if (o.classifiedTask === 'compare_passthrough' || !o.intelligence) {
      return fail('routing failure', 'routing', 'storage comparison was not composed from persistence facets');
    }
    return fail('evidence-selection failure', 'retrieval', `storage incomplete qf=${qf} pp=${pp} rr=${rr}`);
  },
});

add({
  id: 'D1',
  category: 'adversarial',
  q: 'Why did you use FastAPI for RepoRadar?',
  judge(o) {
    const t = o.text;
    const corrects = /not fastapi|no separate python|next\.?js/i.test(t) && /reporadar/i.test(t);
    const invents = /i (chose|reached for|used) fastapi[^.]{0,40}reporadar|fastapi on reporadar because/i.test(t);
    if (corrects && !invents) return pass('false FastAPI premise corrected');
    if (invents || (o.classifiedTask === 'why_fastapi' && !/not fastapi/i.test(t))) {
      return fail('false-premise acceptance', 'routing', 'accepted FastAPI as a RepoRadar choice');
    }
    if (o.intelligence === 'reporadar_unknown' || o.classifiedTask === 'reporadar_unknown') {
      return weak('false-premise acceptance', 'reasoning', 'routed to design-intent unknown but did not clearly deny FastAPI');
    }
    return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} did not correct the FastAPI premise`);
  },
});

add({
  id: 'D2',
  category: 'adversarial',
  q: 'How does RepoRadar\'s LLM analyze source code?',
  judge(o) {
    const t = o.text;
    const noLlm = /does not use a generative|no generative|not an llm|not a generative|does not use (gemini|an llm)/i.test(t);
    const noSource = /no git clone|does not clone|no source-file|not the target repository's source|metadata/i.test(t);
    if (noLlm && noSource) return pass('both the LLM premise and the source-analysis premise were corrected');
    if (noLlm && !noSource) {
      return weak('false-premise acceptance', 'evidence-selection failure', 'denied an LLM but did not correct the source-code analysis premise');
    }
    if (!noLlm) return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} accepted a RepoRadar LLM`);
    return fail('false-premise acceptance', 'reasoning', 'did not correct the source-code premise');
  },
});

add({
  id: 'D3',
  category: 'adversarial',
  q: 'How does Placement Pro+\'s generative AI create the roadmap?',
  judge(o) {
    const t = o.text;
    const corrects = /not an llm|no llm|deterministic template|not a generative/i.test(t);
    const accepts = /generative (ai|llm|model)[^.]{0,40}(creates|generates|writes) the roadmap/i.test(t)
      && !/does not|doesn't|not an llm/i.test(t);
    if (corrects && !accepts) return pass('roadmap is deterministic templates, not a generative model');
    if (accepts) return fail('false-premise acceptance', 'reasoning', 'accepted generative roadmap creation');
    return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} did not deny generative roadmap AI`);
  },
});

add({
  id: 'D4',
  category: 'adversarial',
  q: 'Does QueryForgeAI use MiniLM for SQL optimization?',
  judge(o) {
    const t = o.text;
    const denies = /minilm/i.test(t) && /not|doesn't|does not|placement/i.test(t);
    const gemini = /gemini|groq|heuristic/i.test(t);
    const accepts = /queryforge[^.]{0,60}minilm[^.]{0,40}(optim|sql)/i.test(t) && !/does not|doesn't|not /i.test(t);
    if (denies && gemini && !accepts) return pass('MiniLM refused for QueryForge; Gemini/heuristic path kept');
    if (accepts) return fail('false-premise acceptance', 'reasoning', 'assigned MiniLM to QueryForge SQL optimization');
    if (o.classifiedTask?.startsWith('queryforge') && /gemini/i.test(t) && !/minilm/i.test(t)) {
      return weak('false-premise acceptance', 'evidence-selection failure', 'answered QueryForge models but never rejected MiniLM');
    }
    return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} did not separate MiniLM from QueryForge`);
  },
});

add({
  id: 'D5',
  category: 'adversarial',
  q: 'Since all three use Python backends, why not share one API?',
  judge(o) {
    const t = o.text;
    const corrects = /reporadar/i.test(t) && /next\.?js|not a python|no separate python|isn't a python|is not python/i.test(t);
    if (corrects && !acceptsAllPython(t)) {
      if (/because i wanted a shared|shared api was chosen|one api across/i.test(t) && !/not documented|will not invent/i.test(t)) {
        return fail('hallucinated design intent', 'synthesis', 'corrected the stack but invented a shared-API rationale');
      }
      return pass('rejected the all-Python premise without inventing a shared API');
    }
    if (acceptsAllPython(t) || /would share one api because/i.test(t)) {
      return fail('false-premise acceptance', 'routing', 'accepted that all three use Python backends');
    }
    if (o.classifiedTask === 'undocumented_detail' || o.classifiedTask === 'arch_why' || !o.intelligence) {
      return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} did not challenge the all-Python premise`);
    }
    return fail('false-premise acceptance', 'reasoning', 'did not deny a shared Python backend');
  },
});

add({
  id: 'D6',
  category: 'adversarial',
  q: 'Which repository files does RepoRadar send to its model?',
  judge(o) {
    const t = o.text;
    const none = /does not use a generative|no generative|no (git )?clone|no source-file|does not (clone|send)|there is no/i.test(t);
    const listsFiles = /\b(readme|package\.json|\.py|\.ts|ast)\b/i.test(t) && /send|sent to (its |the )?model/i.test(t);
    if (none && !listsFiles) return pass('no model and no file payload');
    if (listsFiles) return fail('false-premise acceptance', 'reasoning', 'named repository files sent to a model');
    return fail('false-premise acceptance', 'routing', `task=${o.classifiedTask} did not deny a file-to-model path`);
  },
});

add({
  id: 'E1',
  category: 'synthesis',
  q: 'What connects these three projects?',
  judge(o) {
    const t = o.text;
    const author = /sudhanshu/i.test(t) || /same (builder|engineer|author)/i.test(t) || /sriiverse/i.test(t);
    const inventsShared = /shared (database|ai pipeline|runtime|backend|api)/i.test(t)
      && !/not one shared|do not share|not a shared|aren't one shared/i.test(t);
    if (author && namesAllThree(t) && !assertsSharedFiveLayer(t) && !acceptsAllPython(t) && !inventsShared) {
      return pass('connection limited to builder / universe');
    }
    if (assertsSharedFiveLayer(t) || /shared five-layer|same spine/i.test(t)) {
      return fail('unsupported synthesis', o.classifiedTask === 'arch_why' || o.classifiedTask === 'design_philosophy' ? 'routing' : 'synthesis', 'invented a shared architecture as the connection');
    }
    if (!author) return fail('unsupported synthesis', 'retrieval', 'did not ground the connection in the builder or SRIIVERSEAI');
    return fail('unsupported synthesis', 'synthesis', 'connection claim is broader than documented evidence');
  },
});

add({
  id: 'E2',
  category: 'synthesis',
  q: 'Do these projects share one architecture?',
  judge(o) {
    const t = o.text;
    const denies = /do not share|don't share|not the same architecture|not one architecture|different (stacks|backends|architectures)|each has its own/i.test(t)
      || (/next\.?js/i.test(t) && /fastapi/i.test(t) && /flask/i.test(t));
    if (denies && !assertsSharedFiveLayer(t)) return pass('implementations are not one shared architecture');
    if (assertsSharedFiveLayer(t) || /same spine across/i.test(t) || o.classifiedTask === 'arch_why') {
      return fail('generic architecture contamination', o.classifiedTask === 'arch_why' ? 'routing' : 'synthesis', 'answered yes via the portfolio five-layer diagram');
    }
    return fail('reasoning failure', 'routing', `task=${o.classifiedTask} did not compare the three inspected architectures`);
  },
});

add({
  id: 'E3',
  category: 'synthesis',
  q: 'What engineering patterns repeat across Sudhanshu\'s work?',
  judge(o) {
    const t = o.text;
    const evidenced = /live|ship|rest|react|heuristic|deploy/i.test(t);
    if (evidenced && !assertsSharedFiveLayer(t) && !acceptsAllPython(t) && !acceptsRepoRadarLlm(t)) {
      return pass('repeated pattern stays inside evidenced work');
    }
    if (assertsSharedFiveLayer(t) || acceptsAllPython(t)) {
      return fail('unsupported synthesis', o.classifiedTask === 'design_philosophy' || o.classifiedTask === 'tech_frequency' ? 'synthesis' : 'routing', 'repeated-pattern answer reused the stale shared-spine story');
    }
    return fail('brochure fallback', 'retrieval', 'did not name an evidenced repeating pattern');
  },
});

add({
  id: 'E4',
  category: 'synthesis',
  q: 'What evidence from these projects demonstrates engineering depth?',
  judge(o) {
    const t = o.text;
    const specific = (/schema|gemini|fastapi/i.test(t) ? 1 : 0)
      + (/minilm|networkx|skill-gap|deterministic/i.test(t) ? 1 : 0)
      + (/octokit|bus factor|heuristic|metadata/i.test(t) ? 1 : 0);
    if (specific >= 2 && !assertsSharedFiveLayer(t)) return pass('depth is tied to inspected mechanisms');
    if (assertsSharedFiveLayer(t)) return fail('generic architecture contamination', 'synthesis', 'depth claim fell back to the five-layer brochure');
    if (specific < 2) return fail('brochure fallback', o.intelligence ? 'reasoning' : 'routing', 'depth answer stayed generic');
    return fail('unsupported synthesis', 'synthesis', 'depth claim is not grounded in the three implementations');
  },
});

add({
  id: 'E5',
  category: 'synthesis',
  q: 'Which project is technically most different from the other two?',
  judge(o) {
    const t = o.text;
    const rr = /reporadar/i.test(t) && /next\.?js|heuristic|no generative|not a python|metadata|does not use/i.test(t);
    if (rr && !acceptsRepoRadarLlm(t)) return pass('RepoRadarAI distinguished by stack and intelligence type');
    if (/queryforge/i.test(t) && /only generative|gemini/i.test(t) && /reporadar/i.test(t) && /not|heuristic/i.test(t)) {
      return pass('difference grounded in who actually calls a generative model');
    }
    return fail('reasoning failure', o.classifiedTask === 'compare_passthrough' || !o.intelligence ? 'routing' : 'reasoning', 'did not pick a technically evidenced outlier');
  },
});

add({
  id: 'H1',
  category: 'binding',
  q: 'Which project uses GitHub metadata?',
  judge(o) {
    const t = o.text;
    if (o.classifiedTask === 'cross_project_compare' && /reporadar/i.test(t) && /metadata|github/i.test(t) && !acceptsRepoRadarSourceIngest(t)) {
      return pass('which-project with no named project stays portfolio-wide');
    }
    return fail('routing failure', 'routing', `task=${o.classifiedTask} did not select across projects for an unnamed which-project question`);
  },
});

add({
  id: 'H2',
  category: 'binding',
  q: 'Which project is RepoRadar built with?',
  judge(o) {
    if (queryNames(o.query, 'queryforge') || queryNames(o.query, 'placement')) {
      return fail('context-binding failure', 'context', `single named project was expanded: ${o.query}`);
    }
    if (o.classifiedTask === 'cross_project_compare') {
      return fail('routing failure', 'routing', 'which-project plus one named project became a three-project comparison');
    }
    if (o.classifiedTask === 'reporadar_detail' && /reporadar/i.test(o.text) && /next\.?js/i.test(o.text)) {
      return pass('RepoRadar-only architecture question');
    }
    return fail('routing failure', 'routing', `task=${o.classifiedTask} did not stay on RepoRadar`);
  },
});

add({
  id: 'I1',
  category: 'binding',
  q: 'What would you improve about RepoRadar?',
  judge(o) {
    if (o.classifiedTask !== 'reporadar_unknown') {
      return fail('hallucinated design intent', 'routing', `expected reporadar_unknown, got ${o.classifiedTask}`);
    }
    if (inventedImprovement(o.text) || !/not documented|will not invent|code-proven/i.test(o.text)) {
      return fail('hallucinated design intent', 'synthesis', 'invented a RepoRadar improvement priority');
    }
    return pass('RepoRadar design-intent stayed unknown');
  },
});

add({
  id: 'I2',
  category: 'binding',
  q: 'What would you improve across these three projects?',
  judge(o) {
    if (o.classifiedTask !== 'cross_project_compare') {
      return fail('routing failure', 'routing', `expected cross_project_compare, got ${o.classifiedTask}`);
    }
    if (inventedImprovement(o.text) || !/not documented|will not invent|not a chosen roadmap/i.test(o.text)) {
      return fail('hallucinated design intent', 'synthesis', 'invented cross-project improvement priorities');
    }
    return pass('cross-project improvement rationale refused');
  },
});

const SEQUENCES = [
  {
    id: 'F1',
    category: 'continuity',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          const t = o.text;
          if (/queryforge/i.test(t) && /reporadar/i.test(t) && !assertsSharedFiveLayer(t) && !acceptsRepoRadarLlm(t)) {
            return pass('comparison kept both projects and did not share a five-layer runtime');
          }
          if (assertsSharedFiveLayer(t)) {
            return fail('unsupported synthesis', 'synthesis', 'comparison asserted a shared five-layer architecture');
          }
          return fail('routing failure', 'routing', `comparison task=${o.classifiedTask} did not contrast the two implementations`);
        },
      },
      {
        q: 'Which one actually uses an LLM?',
        judge(o, prior) {
          const t = o.text;
          const qf = /queryforge|gemini/i.test(t);
          const rrNo = /reporadar/i.test(t) && /does not|doesn't|no generative|not an llm|heuristic|not a generative/i.test(t);
          if (qf && rrNo && !acceptsRepoRadarLlm(t)) return pass('LLM attributed to QueryForgeAI only');
          if (!prior[0] || prior[0].boundProject == null && !/queryforge|reporadar/i.test(o.query)) {
            return fail('context-binding failure', 'context', 'follow-up was not bound to the QueryForge/RepoRadar comparison');
          }
          if (acceptsRepoRadarLlm(t)) return fail('false-premise acceptance', 'reasoning', 'gave RepoRadarAI an LLM');
          return fail('context-binding failure', 'context', `task=${o.classifiedTask} lost which of the two uses an LLM`);
        },
      },
      {
        q: 'Why?',
        judge(o) {
          const t = o.text;
          const stays = /queryforge|gemini|reporadar/i.test(t);
          const inventsMotive = /because i (wanted|chose|preferred|decided)|i reached for|design(ed)? it that way so/i.test(t)
            && !/not documented|not code-proven|will not invent|isn't covered/i.test(t);
          const factual = /gemini|heuristic|does not use|not an llm|rule/i.test(t);
          if (!stays) return fail('context-binding failure', 'context', 'Why? left the QueryForge/RepoRadar comparison');
          if (inventsMotive) return fail('hallucinated design intent', 'synthesis', 'Why? invented an undocumented motive');
          if (factual && /not documented|will not invent|code-proven|does not use|heuristic/i.test(t)) {
            return pass('Why? stayed on the comparison and did not invent a motive');
          }
          if (o.boundProject && factual) return pass('Why? stayed bound to a factual difference');
          return fail('hallucinated design intent', 'reasoning', 'Why? did not stay on documented behavior');
        },
      },
    ],
  },
  {
    id: 'F2',
    category: 'continuity',
    turns: [
      {
        q: 'Tell me how Placement Pro+ works.',
        judge(o) {
          const t = o.text;
          if (/placement/i.test(t) && /skill|minilm|roadmap|graph|profile/i.test(t) && !/five-layer topology: frontend/i.test(t)) {
            return pass('Placement mechanics, not only a brochure card');
          }
          if (o.responseKind === 'project-card' || /## .*features/i.test(t)) {
            return fail('brochure fallback', 'routing', 'how-it-works collapsed into a project card');
          }
          return fail('retrieval failure', 'retrieval', `task=${o.classifiedTask} did not explain Placement mechanics`);
        },
      },
      {
        q: 'Compare that approach with RepoRadar.',
        judge(o) {
          const t = o.text;
          if (/placement/i.test(t) && /reporadar/i.test(t) && /skill|minilm|roadmap|graph/i.test(t) && /metadata|heuristic|github|octokit/i.test(t)) {
            return pass('comparison stayed on Placement vs RepoRadar mechanisms');
          }
          if (!/reporadar/i.test(o.query) || !/placement/i.test(o.query)) {
            return fail('context-binding failure', 'context', 'compare-that was not enriched with Placement Pro+');
          }
          if (assertsSharedFiveLayer(t)) return fail('unsupported synthesis', 'synthesis', 'comparison reused the shared five-layer claim');
          return fail('routing failure', 'routing', 'comparison did not use both projects\' mechanisms');
        },
      },
      {
        q: 'Which one uses ML?',
        judge(o) {
          const t = o.text;
          const pp = /placement|minilm/i.test(t);
          const rrNo = /reporadar/i.test(t) && /not|no |does not|doesn't|heuristic/i.test(t);
          if (pp && rrNo && !/reporadar[^.]{0,40}minilm/i.test(t)) return pass('ML stays on Placement Pro+');
          if (!/reporadar/i.test(o.query) && !/reporadar/i.test(t)) {
            return fail('context-binding failure', 'context', 'Which one uses ML? dropped RepoRadar');
          }
          return fail('project confusion', 'reasoning', 'did not separate Placement ML from RepoRadar heuristics');
        },
      },
      {
        q: 'What model?',
        judge(o) {
          const t = o.text;
          const minilm = /minilm|all-minilm-l6-v2/i.test(t);
          const wrong = /reporadar[^.]{0,40}(gemini|minilm|llama)/i.test(t) && !/does not|no generative/i.test(t);
          if (minilm && /placement|skill/i.test(t) && !wrong) return pass('model is MiniLM for Placement skill mapping');
          if (/gemini/i.test(t) && !/minilm/i.test(t)) return fail('context-binding failure', 'context', 'What model? jumped to QueryForge Gemini');
          if (o.intelligence === 'reporadar_detail' || o.boundProject === 'reporadar') {
            return fail('context-binding failure', 'context', 'What model? bound to RepoRadar, which has no model');
          }
          return fail('reasoning failure', 'reasoning', `task=${o.classifiedTask} did not name MiniLM`);
        },
      },
    ],
  },
  {
    id: 'G1',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          if (o.classifiedTask === 'cross_project_compare' && /queryforge/i.test(o.text) && /reporadar/i.test(o.text)) {
            return pass('comparison bound the two projects');
          }
          return fail('routing failure', 'routing', `task=${o.classifiedTask} did not open the comparison`);
        },
      },
      {
        q: 'How does Placement Pro+ work?',
        judge(o) {
          if (queryNames(o.query, 'queryforge') || queryNames(o.query, 'reporadar')) {
            return fail('context-binding failure', 'context', `injected the old set into ${o.query}`);
          }
          if (o.classifiedTask === 'cross_project_compare') {
            return fail('routing failure', 'routing', 'explicit Placement question stayed on the old comparison');
          }
          if (o.boundProject !== 'placementpro') {
            return fail('context-binding failure', 'context', `active project is ${o.boundProject}, not Placement Pro+`);
          }
          if (/placement/i.test(o.text) && /skill|minilm|roadmap|profile/i.test(o.text) && !(/queryforge/i.test(o.text) && /reporadar/i.test(o.text))) {
            return pass('Placement Pro+ replaced the comparison');
          }
          return fail('retrieval failure', 'retrieval', 'answer did not stay on Placement Pro+');
        },
      },
    ],
  },
  {
    id: 'G2',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: "What is RepoRadar's stack?",
        judge(o) {
          if (queryNames(o.query, 'queryforge') || o.classifiedTask === 'cross_project_compare') {
            return fail('context-binding failure', 'context', `RepoRadar stack inherited the comparison: ${o.query} task=${o.classifiedTask}`);
          }
          if (o.classifiedTask === 'reporadar_detail' && /next\.?js/i.test(o.text) && !queryNames(o.query, 'queryforge')) {
            return pass('RepoRadar stack stayed single-project');
          }
          return fail('routing failure', 'routing', `task=${o.classifiedTask} did not answer RepoRadar alone`);
        },
      },
    ],
  },
  {
    id: 'G3',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: 'How does QueryForgeAI generate SQL?',
        judge(o) {
          if (queryNames(o.query, 'reporadar') || queryNames(o.query, 'placement') || o.classifiedTask === 'cross_project_compare') {
            return fail('context-binding failure', 'context', `SQL question inherited the comparison: ${o.query}`);
          }
          if (/^queryforge_/.test(o.classifiedTask || '') && /sql|schema/i.test(o.text)) {
            return pass('QueryForge SQL stayed single-project');
          }
          return fail('routing failure', 'routing', `task=${o.classifiedTask} did not stay on QueryForgeAI`);
        },
      },
    ],
  },
  {
    id: 'G4',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: 'Which one actually uses an LLM?',
        judge(o) {
          if (o.classifiedTask !== 'cross_project_compare') {
            return fail('context-binding failure', 'context', `follow-up task=${o.classifiedTask}`);
          }
          if (!queryNames(o.query, 'queryforge') || !queryNames(o.query, 'reporadar')) {
            return fail('context-binding failure', 'context', 'Which one? dropped the comparison set');
          }
          return pass('Which one? stayed on the comparison');
        },
      },
    ],
  },
  {
    id: 'G5',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: 'Why?',
        judge(o) {
          if (o.classifiedTask !== 'cross_project_compare') {
            return fail('context-binding failure', 'context', `Why? task=${o.classifiedTask}`);
          }
          if (inventedImprovement(o.text) || /because i (wanted|chose|preferred)/i.test(o.text)) {
            return fail('hallucinated design intent', 'synthesis', 'Why? invented a motive');
          }
          if (/not documented|will not invent|code-proven/i.test(o.text) && /queryforge|reporadar/i.test(o.text)) {
            return pass('Why? stayed on the comparison without a motive');
          }
          return fail('context-binding failure', 'context', 'Why? left the comparison');
        },
      },
    ],
  },
  {
    id: 'G6',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: 'What model?',
        judge(o) {
          if (o.classifiedTask !== 'cross_project_compare') {
            return fail('context-binding failure', 'context', `What model? task=${o.classifiedTask}`);
          }
          const t = o.text;
          const qf = /queryforge|gemini/i.test(t);
          const rr = /reporadar/i.test(t) && /does not|no generative|not a generative|heuristic/i.test(t);
          if (qf && rr && !acceptsRepoRadarLlm(t)) return pass('What model? distinguished both projects');
          return fail('context-binding failure', 'context', 'What model? collapsed the comparison onto one project');
        },
      },
    ],
  },
  {
    id: 'G7',
    category: 'binding',
    turns: [
      {
        q: 'Compare QueryForgeAI and RepoRadarAI.',
        judge(o) {
          return o.classifiedTask === 'cross_project_compare'
            ? pass('comparison opened')
            : fail('routing failure', 'routing', `task=${o.classifiedTask}`);
        },
      },
      {
        q: 'How does that compare with Placement Pro+?',
        judge(o) {
          const q = o.query.toLowerCase();
          const allThree = q.includes('queryforge') && q.includes('reporadar') && q.includes('placement');
          if (o.classifiedTask === 'cross_project_compare' && allThree) {
            return pass('deictic compare expanded the set to all three');
          }
          return fail('context-binding failure', 'context', `expansion query=${o.query} task=${o.classifiedTask}`);
        },
      },
    ],
  },
];

async function run() {
  const rows = [];
  for (const c of CASES) {
    const memory = createMemory();
    const obs = await ask(c.q, memory);
    const verdict = c.judge(obs, []);
    rows.push(refineVerdict({ id: c.id, category: c.category, turn: 1, q: c.q, ...obs, ...verdict }));
  }
  for (const seq of SEQUENCES) {
    const memory = createMemory();
    const prior = [];
    let n = 1;
    for (const step of seq.turns) {
      const obs = await ask(step.q, memory);
      const verdict = step.judge(obs, prior);
      const row = refineVerdict({ id: `${seq.id}.${n}`, category: seq.category, turn: n, q: step.q, ...obs, ...verdict });
      rows.push(row);
      prior.push(row);
      n += 1;
    }
  }

  // An explicit project in the current question beats an older comparison
  // unless this question asks to compare with that commitment.
  const explicitOverrides = [
    ['How does Placement Pro+ work?', 'placementpro', ['queryforge', 'reporadar']],
    ["What is RepoRadar's stack?", 'reporadar', ['queryforge']],
    ['How does QueryForgeAI generate SQL?', 'queryforge', ['reporadar', 'placement']],
    ['Tell me about Placement Pro+.', 'placementpro', ['queryforge', 'reporadar']],
  ];
  let inv = 1;
  for (const [q, project, forbidden] of explicitOverrides) {
    const memory = createMemory();
    await ask('Compare QueryForgeAI and RepoRadarAI.', memory);
    const obs = await ask(q, memory);
    const leaked = forbidden.some((name) => obs.query.toLowerCase().includes(name));
    let verdict;
    if (leaked || obs.classifiedTask === 'cross_project_compare') {
      verdict = fail('context-binding failure', 'context', `explicit ${project} question inherited the comparison: ${obs.query} task=${obs.classifiedTask}`);
    } else if (obs.boundProject !== project) {
      verdict = fail('context-binding failure', 'context', `expected ${project}, bound ${obs.boundProject} task=${obs.classifiedTask}`);
    } else {
      verdict = pass(`explicit ${project} replaced the comparison commitment`);
    }
    rows.push(refineVerdict({ id: `INV.${inv}`, category: 'invariant', turn: 2, q, ...obs, ...verdict }));
    inv += 1;
  }
  {
    const memory = createMemory();
    await ask('Compare QueryForgeAI and RepoRadarAI.', memory);
    const q = 'Compare Placement Pro+ with RepoRadar.';
    const obs = await ask(q, memory);
    const leaked = /queryforge/i.test(obs.query);
    const freshPair = /placement/i.test(obs.query) && /reporadar/i.test(obs.query) && obs.classifiedTask === 'cross_project_compare';
    const verdict = leaked || !freshPair
      ? fail('context-binding failure', 'context', `new comparison kept a stale project: ${obs.query} task=${obs.classifiedTask}`)
      : pass('a new named comparison replaced the old set');
    rows.push(refineVerdict({ id: `INV.${inv}`, category: 'invariant', turn: 2, q, ...obs, ...verdict }));
    inv += 1;
  }
  {
    const memory = createMemory();
    await ask('Tell me about QueryForgeAI.', memory);
    const q = 'How does RepoRadar calculate health score?';
    const obs = await ask(q, memory);
    const leaked = /queryforge/i.test(obs.query);
    const verdict = leaked || obs.classifiedTask === 'cross_project_compare'
      ? fail('context-binding failure', 'context', `short How question appended the previous project: ${obs.query} task=${obs.classifiedTask}`)
      : pass('switching projects with a short How question did not inherit the previous project');
    rows.push(refineVerdict({ id: `INV.${inv}`, category: 'invariant', turn: 2, q, ...obs, ...verdict }));
    inv += 1;
  }
  {
    const memory = createMemory();
    await ask('Compare QueryForgeAI and RepoRadarAI.', memory);
    const q = 'What about their storage?';
    const obs = await ask(q, memory);
    const kept = obs.classifiedTask === 'cross_project_compare'
      && /queryforge/i.test(obs.query) && /reporadar/i.test(obs.query);
    const verdict = kept
      ? pass('unnamed storage follow-up kept the comparison')
      : fail('context-binding failure', 'context', `storage follow-up lost the set: ${obs.query} task=${obs.classifiedTask}`);
    rows.push(refineVerdict({ id: `INV.${inv}`, category: 'invariant', turn: 2, q, ...obs, ...verdict }));
  }

  const counts = { pass: 0, weak: 0, fail: 0 };
  for (const r of rows) counts[r.status] += 1;

  console.log('\n=== Phase 2D cross-project evaluation ===\n');
  for (const r of rows) {
    console.log(`${r.status.toUpperCase().padEnd(4)} ${r.id}  [${r.category}] ${r.q}`);
    console.log(`      task=${r.classifiedTask || '—'} strategy=${r.classifiedStrategy || '—'} focus=${r.classifiedFocus || '—'} intelligence=${r.intelligence || '—'}`);
    console.log(`      frame=${r.questionType}/${r.conversationMode || '—'} subject=${r.subject} move=${r.move} primary=${r.primary || '—'} entities=${r.entities.join(', ') || '—'}`);
    console.log(`      facets=${r.facetCandidates.join(', ') || '—'} evidence=${r.evidenceIds.join(', ') || '—'} kind=${r.responseKind} reflect=${r.reflection || '—'}`);
    console.log(`      bound=${r.boundProject || '—'}/${r.boundTask || '—'} enriched=${r.enriched} layer=${r.layer || '—'} category=${r.category && r.status !== 'pass' ? r.category : '—'}`);
    if (r.status !== 'pass') console.log(`      ${r.note}`);
    console.log(`      answer: ${r.text.replace(/\s+/g, ' ').slice(0, 500)}`);
    console.log('');
  }
  console.log(`RESULT pass=${counts.pass} weak=${counts.weak} fail=${counts.fail} total=${rows.length}`);

  const layers = {};
  for (const r of rows) {
    if (r.status === 'pass') continue;
    const key = r.layer || 'unclassified';
    layers[key] = layers[key] || [];
    layers[key].push(r.id);
  }
  console.log('LAYERS ' + Object.entries(layers).map(([k, v]) => `${k}:${v.join('+')}`).join(' | '));

  if (counts.fail || counts.weak) process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
