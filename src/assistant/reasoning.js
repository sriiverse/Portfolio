/**
 * reasoning.js — V4 Generic Reasoning Operators
 *
 * Replaces Sprint 2 case-table synthesis with operators over:
 *   - Engineering Knowledge Graph (Phase 1)
 *   - Decision Records (Phase 2)
 *   - Engineering Identity (Phase 3)
 *
 * Public API preserved for providers.js:
 *   classifyReasoningStrategy, synthesizeReasoning, mayOverrideDecline,
 *   DECISION_FIRST_STRATEGIES, buildProjectProfiles, rankByAttribute, …
 *
 * Classification still maps questions → cognitive strategy + task key.
 * Synthesis dispatches to generic operators (Recommend / Rank / …) driven by
 * objective vectors — not hardcoded project winners.
 */

import {
  getEngineeringGraph,
  getNodesByType,
  getEdges,
  getArchitecturePath,
  nodeId,
} from './graph.js';
import {
  getDecisionRecords,
  getDecisionsForTechnology,
} from './decisions.js';
import {
  getEngineeringIdentity,
  getIdentityClaimsByFacet,
} from './identity.js';
import { buildQuestionFrame, classifyAnswerAspect, classifyConversationMode, followUpRemainder, isBackendAspectQuery, isBoundFollowUpQuery, isDatabaseAspectQuery, isElaborationRequest, isFrontendAspectQuery, isYesNoTechnologyAsk } from './conversation.js';
import { getProject, isDocumentedConceptAlias, isPortfolioOrProjectStackName, portfolioTechnologyNote, projectStackEvidenceLine, speakConceptAlias, speakProjectAliasRecord, speakProjectStackEvidence, speakStackInventory, speakStackMembership } from './knowledge.js';
import { matchAnswerTechNames, matchDescriptiveAliases } from './entities.js';
import {
  isQueryForgeQuery,
  matchQueryForgeFacet,
  QUERYFORGE_FACETS,
} from './queryforgeKnowledge.js';
import {
  isPlacementProQuery,
  isStandalonePlacementAuthQuery,
  matchPlacementProFacet,
  PLACEMENTPRO_FACETS,
} from './placementproKnowledge.js';
import {
  isRepoRadarQuery,
  matchRepoRadarFacet,
  REPORADAR_FACETS,
} from './reporadarKnowledge.js';

export const REASONING_STRATEGIES = [
  'Describe', 'Explain', 'Compare', 'Recommend', 'Evaluate',
  'Rank', 'Critique', 'Infer', 'Summarize', 'Justify',
];

export const DECISION_FIRST_STRATEGIES = new Set([
  'Recommend', 'Evaluate', 'Rank', 'Critique', 'Infer', 'Justify',
]);

/* ============================================================
   OBJECTIVE VECTORS (generic — no project IDs)
   ============================================================ */

const TASK_OBJECTIVES = {
  faang_interview: { softwareEngineering: 4, databases: 3, complexity: 2, productionReadiness: 1 },
  best_engineering: { softwareEngineering: 5, databases: 2, architecture: 1 },
  keep_two: { softwareEngineering: 3, recruiterImpact: 2, databases: 1 },
  best_work: { recruiterImpact: 4, productionReadiness: 2, innovation: 1 },
  most_difficult: { databases: 4, complexity: 3, aiUsage: 1 },
  interview_first: { recruiterImpact: 4, productionReadiness: 2 },
  recruiter_impress: { recruiterImpact: 5, productionReadiness: 1 },
  demo_backend: { backendDepth: 5, architecture: 1 },
  demo_ai: { aiUsage: 5, innovation: 1 },
  demo_frontend: { frontendDepth: 5, recruiterImpact: 1 },
};

/* ============================================================
   PROJECT PROFILES (from graph + decision records)
   ============================================================ */

export function buildProjectProfiles(graph = getEngineeringGraph()) {
  const projects = getNodesByType(graph, 'Project');
  const records = getDecisionRecords(graph);

  return projects.map((node) => {
    const p = {
      id: node.props.projectId,
      name: node.label,
      title: node.props.title,
      tagline: node.props.tagline,
      live: node.props.live,
      repo: node.props.repo,
      theme: node.props.theme,
      problem: node.props.problem,
      solution: node.props.solution,
      stack: node.props.stack || [],
      decisions: records
        .filter((r) => r.projectId === node.props.projectId)
        .map((r) => r.rawText),
    };
    const features = getEdges(graph, { from: node.id, type: 'has_feature' })
      .map((e) => graph.nodes.get(e.to))
      .filter(Boolean)
      .map((f) => ({ title: f.props.title, desc: f.props.desc }));

    const stack = p.stack;
    const has = (re) => stack.some((s) => re.test(s));
    const decisions = p.decisions;

    const backendDepth = scoreClamp(
      (has(/python|flask|fastapi|rest|jwt/i) ? 3 : 0)
      + (has(/flask|fastapi/i) ? 2 : 0)
      + (decisions.some((d) => /backend|api|orchestr/i.test(d)) ? 1 : 0),
    );
    const frontendDepth = scoreClamp(
      (has(/react/i) ? 3 : 0)
      + (has(/typescript/i) ? 2 : 0)
      + (has(/javascript|tailwind/i) ? 1 : 0),
    );
    const aiUsage = scoreClamp(
      (has(/llm|ollama/i) ? 3 : 0)
      + (features.some((f) => /ai|llm|natural language|intelligence/i.test(`${f.title} ${f.desc}`)) ? 2 : 0)
      + (decisions.some((d) => /reasoning|schema|ai/i.test(d)) ? 1 : 0),
    );
    const databases = scoreClamp(
      (/sql|schema|database|query|execution plan/i.test(`${p.problem || ''} ${p.solution || ''} ${p.title || ''}`) ? 4 : 0)
      + (has(/sql|postgres|mongo/i) ? 2 : 0)
      + (features.some((f) => /sql|schema|database|query/i.test(`${f.title} ${f.desc}`)) ? 2 : 0),
    );
    const deployment = scoreClamp(
      (p.live ? 3 : 0)
      + (has(/vercel|netlify|render|docker/i) ? 2 : 0)
      + (p.repo ? 1 : 0),
    );
    const architecture = scoreClamp(
      decisions.length
      + (has(/fastapi|flask|react/i) ? 1 : 0)
      + (/layer|orchestr|split|topology/i.test(decisions.join(' ')) ? 1 : 0),
    );
    const scalability = scoreClamp(
      (has(/fastapi|rest|api/i) ? 2 : 0)
      + (p.live ? 2 : 0)
      + (has(/docker|vercel/i) ? 1 : 0)
      + (/ingest|any public|execution|orchestr/i.test(`${p.solution || ''} ${p.problem || ''}`) ? 1 : 0),
    );
    const innovation = scoreClamp(
      (has(/llm/i) ? 2 : 0)
      + (features.length >= 5 ? 1 : 0)
      + (/natural language|x-ray|placement\.os|execution-plan/i.test(`${p.tagline} ${p.solution || ''}`) ? 2 : 0),
    );
    const recruiterImpact = scoreClamp(
      (p.live ? 3 : 0)
      + (p.repo ? 3 : 0)
      + (has(/typescript|fastapi|react/i) ? 1 : 0)
      + frontendDepth,
    );
    const productionReadiness = scoreClamp(
      (p.live ? 4 : 0)
      + (p.repo ? 1 : 0)
      + (has(/docker|vercel|netlify|render/i) ? 1 : 0),
    );
    const complexity = scoreClamp(
      Math.round((backendDepth + aiUsage + databases + architecture + scalability) / 2),
    );
    const softwareEngineering = scoreClamp(
      Math.round((backendDepth + architecture + (databases * 2) + complexity + productionReadiness) / 2)
      + (p.theme === 'database' ? 2 : 0)
      + (p.repo ? 2 : 0)
      + (has(/typescript|fastapi/i) ? 1 : 0)
      + (decisions.some((d) => /schema|reasoning layer|execution/i.test(d)) ? 1 : 0),
    );

    return {
      id: p.id,
      name: p.name,
      project: p,
      attrs: {
        complexity, backendDepth, frontendDepth, aiUsage, databases,
        deployment, architecture, scalability, innovation,
        recruiterImpact, productionReadiness, softwareEngineering,
      },
    };
  });
}

function scoreClamp(n) {
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function scoreByObjective(profile, weights = {}) {
  let score = 0;
  for (const [attr, w] of Object.entries(weights)) {
    score += (profile.attrs[attr] || 0) * w;
  }
  return score;
}

export function rankByObjective(profiles, weights) {
  return [...profiles].sort((a, b) => {
    const d = scoreByObjective(b, weights) - scoreByObjective(a, weights);
    return d || a.name.localeCompare(b.name);
  });
}

export function rankByAttribute(profiles, attr) {
  return rankByObjective(profiles, { [attr]: 1 });
}

export function topByAttribute(profiles, attr) {
  return rankByAttribute(profiles, attr)[0] || null;
}

export function topByObjective(profiles, weights) {
  return rankByObjective(profiles, weights)[0] || null;
}

/* ============================================================
   CLASSIFY (unchanged behavioral contract — Sprint 2)
   ============================================================ */

const CROSS_PROJECT_CATALOG = [
  { id: 'queryforge', name: 'QueryForgeAI', facets: QUERYFORGE_FACETS, re: /queryforge/i },
  { id: 'placementpro', name: 'Placement Pro+', facets: PLACEMENTPRO_FACETS, re: /placement\s*pro\+?|placementpro/i },
  { id: 'reporadar', name: 'RepoRadarAI', facets: REPORADAR_FACETS, re: /reporadar|repo\s*radar/i },
];

const CROSS_LENS_FACETS = {
  model: { queryforge: ['qf-ai-model'], placementpro: ['pp-ai-model'], reporadar: ['rr-ai-model'] },
  architecture: { queryforge: ['qf-architecture'], placementpro: ['pp-architecture'], reporadar: ['rr-architecture'] },
  input: { queryforge: ['qf-user-flow', 'qf-dataflow-generator'], placementpro: ['pp-skill-gap'], reporadar: ['rr-ingestion', 'rr-github'] },
  storage: { queryforge: ['qf-limitations', 'qf-architecture'], placementpro: ['pp-database'], reporadar: ['rr-data-flow', 'rr-caching'] },
  sql: { queryforge: ['qf-purpose', 'qf-dataflow-generator'], placementpro: ['pp-database'], reporadar: ['rr-purpose'] },
  github: { queryforge: ['qf-purpose'], placementpro: ['pp-purpose'], reporadar: ['rr-purpose', 'rr-ingestion'] },
  skill: { queryforge: ['qf-purpose'], placementpro: ['pp-skill-gap', 'pp-ai-model'], reporadar: ['rr-purpose'] },
  heuristic: { queryforge: ['qf-ai-model'], placementpro: ['pp-ai-model', 'pp-roadmap'], reporadar: ['rr-scoring', 'rr-ai-model'] },
  differentiate: { queryforge: ['qf-purpose', 'qf-architecture'], placementpro: ['pp-purpose', 'pp-architecture'], reporadar: ['rr-purpose', 'rr-architecture'] },
  api: { queryforge: ['qf-api', 'qf-ai-model'], placementpro: ['pp-api', 'pp-ai-model'], reporadar: ['rr-api', 'rr-ai-model'] },
  stack: { queryforge: ['qf-architecture'], placementpro: ['pp-architecture'], reporadar: ['rr-architecture'] },
  motivation: { queryforge: ['qf-purpose'], placementpro: ['pp-purpose'], reporadar: ['rr-purpose'] },
  depth: { queryforge: ['qf-ai-model', 'qf-dataflow-generator'], placementpro: ['pp-skill-gap', 'pp-roadmap'], reporadar: ['rr-scoring', 'rr-github'] },
  connect: { queryforge: ['qf-purpose'], placementpro: ['pp-purpose'], reporadar: ['rr-purpose', 'rr-architecture'] },
  premise: { queryforge: ['qf-architecture'], placementpro: ['pp-architecture'], reporadar: ['rr-architecture', 'rr-ai-model'] },
  files: { queryforge: ['qf-ai-model'], placementpro: ['pp-ai-model'], reporadar: ['rr-ai-model', 'rr-ingestion'] },
  intent: { queryforge: ['qf-limitations'], placementpro: ['pp-limitations'], reporadar: ['rr-limitations'] },
};

function namedCrossProjectIds(query) {
  const t = String(query || '');
  return CROSS_PROJECT_CATALOG.filter((p) => p.re.test(t)).map((p) => p.id);
}

function entityProjectIds(ctx) {
  const list = ctx?.entities?.entities || [];
  const ids = [];
  for (const e of list) {
    if (e?.type !== 'project') continue;
    const id = String(e.canonical || e.id || '').toLowerCase();
    const hit = CROSS_PROJECT_CATALOG.find((p) => p.id === id || p.re.test(id));
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function boundCrossProjectIds(ctx) {
  const ids = ctx?.memory?.lastCommitment?.projectIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id) => CROSS_PROJECT_CATALOG.some((p) => p.id === id));
}

/**
 * Cross-project scope only. Generic words (model, API, architecture, AI, backend)
 * do not activate this by themselves, and a single named project stays on its facet path.
 */
function resolveCrossProjectQuestion(query, ctx = {}) {
  const t = String(query || '').toLowerCase().trim();
  if (!t) return null;
  const named = namedCrossProjectIds(t);
  const fromEntities = entityProjectIds(ctx);
  const bound = boundCrossProjectIds(ctx);
  const portfolioWide = /\b(all three|these three|these projects|each project|the three projects|the three systems|which of the three|engineering patterns|patterns repeat)\b/i.test(t)
    || (named.length === 0 && /\bwhich projects?\b/i.test(t));
  const comparison = ctx?.questionFrame?.questionType === 'Comparison'
    || /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b|\bdiffer(?:s|ed)?\b|\bdifferent from\b|\barchitecturally\b/i.test(t);
  const followUp = isBoundFollowUpQuery(query)
    || /\b(which one|what model|which of them)\b/i.test(t);

  let ids = [];
  if (named.length >= 2) ids = named;
  else if (comparison && fromEntities.length >= 2) ids = fromEntities;
  else if (portfolioWide) {
    // "Kubernetes on each project?" during a two-project comparison means
    // those two projects. "All three" still means the whole portfolio.
    const topic = explicitComparisonSubject(query);
    if (topic && bound.length >= 2 && !/\b(?:all three|these three|the three)\b/i.test(t)) ids = bound;
    else ids = ['queryforge', 'placementpro', 'reporadar'];
  }
  else if (followUp && bound.length >= 2 && named.length === 0) ids = bound;
  // "Are they using Kubernetes?" refers to the open comparison even though
  // "they" is not one of the short follow-up pronouns.
  else if (explicitComparisonSubject(query) && bound.length >= 2 && named.length === 0) ids = bound;
  else if (named.length === 1 && named[0] === 'queryforge' && /\bminilm\b|all-minilm/i.test(t)) {
    ids = ['queryforge', 'placementpro'];
  } else {
    return null;
  }

  const remembered = ctx?.memory?.lastProject;
  if (remembered && ids.includes(remembered)) {
    ids = [remembered, ...ids.filter((id) => id !== remembered)];
  }

  const aspect = classifyAnswerAspect(t);
  let lens = 'differentiate';
  if (aspect === 'api') lens = 'api';
  else if (aspect === 'stack') lens = 'stack';
  else if (aspect === 'motivation') lens = 'motivation';
  else if (aspect === 'architecture') lens = 'architecture';
  else if (/what would you (improve|change|rebuild)/i.test(t)) lens = 'intent';
  else if (/^why\??$|^(and )?why\b/i.test(t)) lens = 'why';
  else if (/\bminilm\b/.test(t) || /machine learning|\bml\b|generative|\bllm\b|\bmodels?\b|\bgemini\b|\bgroq\b|what model|which model|uses an llm|uses ml/.test(t)) lens = 'model';
  else if (/heuristic|deterministic/.test(t)) lens = 'heuristic';
  else if (/persist|storage|\bdatabases?\b/.test(t)) lens = 'storage';
  else if (/input data|obtain their input|what does each project/.test(t)) lens = 'input';
  else if (/github|metadata/.test(t)) lens = 'github';
  else if (/skill-?gap/.test(t)) lens = 'skill';
  else if (/\bsql\b/.test(t)) lens = 'sql';
  else if (/python backend|share one api|share an api/.test(t)) lens = 'premise';
  else if (/source code|repository files|\bast\b/.test(t)) lens = 'files';
  else if (/engineering depth|demonstrates engineering/.test(t)) lens = 'depth';
  else if (/what connects|connect these/.test(t)) lens = 'connect';
  else if (/pattern/.test(t)) lens = 'differentiate';
  else if (/backend|architect|share one architecture|most different/.test(t)) lens = 'architecture';
  else if (/\b(?:flask|fastapi|uvicorn|react|vite|next\.?js)\b/.test(t)) lens = 'stack';

  const priorLens = ctx?.memory?.lastCommitment?.lens || null;
  // A named technology is not the product overview. Keep the comparison,
  // and let synthesis say whether the records actually cover that subject.
  const subject = lens === 'differentiate' ? explicitComparisonSubject(query) : null;
  const concept = lens === 'differentiate' ? documentedConceptInQuery(query) : null;
  if (concept && ids.length >= 2) {
    return { ids, lens: 'subject', priorLens, subject: concept, concept };
  }
  if (subject && ids.length >= 2) {
    return { ids, lens: 'subject', priorLens, subject };
  }
  return { ids, lens, priorLens };
}

function comparisonSubjectToken(raw) {
  const word = String(raw || '').replace(/^[“"']+|[”"'.?!]+$/g, '');
  if (!word || word.length < 3) return null;
  if (/^(?:the|a|an|their|both|each|this|that|these|those|it|them|they|its|his|her|same|approach|thing|way|project|projects|system|systems|something)$/i.test(word)) return null;
  // These already have a comparison lens. They are not an undocumented subject.
  if (/^(?:architecture|architectures|database|databases|storage|api|apis|model|models|minilm|backend|backends|frontend|frontends|sql|github|heuristic|heuristics|stack)$/i.test(word)) return null;
  return word;
}

function isProjectNameToken(word) {
  const token = String(word || '').replace(/\++$/g, '');
  return /^(?:queryforgeai|queryforge|reporadarai|reporadar|placementpro|placement|pro)$/i.test(token);
}

/**
 * The technology a comparison is asking about.
 * A relation word still works ("use Kubernetes", "Kubernetes setup").
 * So does one technology left after comparison glue ("Kubernetes for both?",
 * "Kubernetes comparison?"). Architecture, database, API, and model stay on
 * their own lenses. A bare "I read about Kubernetes" does not match.
 */
function explicitComparisonSubject(query) {
  const t = String(query || '');
  const head = t.match(/\b([a-z0-9][a-z0-9.+-]{2,})\s+(?:setups?|configurations?|deployments?|integrations?|implementations?)\b/i);
  const fromHead = comparisonSubjectToken(head?.[1]);
  if (fromHead) return fromHead;
  const used = t.match(/\b(?:use|uses|using|support|supports|supporting)\s+(?:the\s+|a\s+|an\s+)?([a-z0-9][a-z0-9.+-]{2,})/i);
  const fromUse = comparisonSubjectToken(used?.[1]);
  if (fromUse) return fromUse;
  if (!/\b(?:both|each|their|comparison|implementations?)\b/i.test(t) && !/\bwhat about\b/i.test(t)) return null;
  const glue = /^(?:what|whats|what's|about|for|on|with|and|of|in|to|from|comparison|compare|implementation|implementations|setup|setups|configuration|configurations|deployment|deployments|integration|integrations|yesterday|read|just|only|does|did|do|is|are|was|how|why|who|can|could|which|tell|me|more|differ|different|difference|between|versus|vs|one|its|the|a|an|both|each|their)$/i;
  const subjects = [];
  for (const token of t.toLowerCase().split(/[^a-z0-9.+-]+/)) {
    if (!token || glue.test(token) || isProjectNameToken(token)) continue;
    const accepted = comparisonSubjectToken(token);
    if (accepted && !subjects.includes(accepted)) subjects.push(accepted);
  }
  return subjects.length === 1 ? subjects[0] : null;
}

/**
 * "I read about Kubernetes yesterday." names a technology and does not ask
 * about a project, a comparison, or the portfolio stack.
 */
const PORTFOLIO_HISTORY_RE = /\b(?:do you know|does he know|have you used|has he used|do you use|does he use|are you familiar with|is he familiar with|do you have experience with|does he have experience with|proficient|proficiency|how experienced|experience with|expertise)\b/i;

/**
 * A portfolio-history or proficiency question names one technology and no project.
 * Stack membership and personal proficiency are answered separately.
 */
function portfolioHistorySubject(query) {
  const text = String(query || '').trim();
  if (!text || !PORTFOLIO_HISTORY_RE.test(text)) return null;
  if (/\bstack\b/i.test(text) && /\b(?:listed|in his|in your|in the|part of)\b/i.test(text)) return null;
  if (namedCrossProjectIds(text).length) return null;
  const hits = matchAnswerTechNames(text);
  if (hits.length !== 1) return null;
  return hits[0];
}

function stackMembershipRequest(query) {
  const text = String(query || '').trim();
  if (!text || namedCrossProjectIds(text).length) return null;
  if (/\bwhat\b/i.test(text) && /\btechnolog/i.test(text) && /\bstack\b/i.test(text)) {
    return { inventory: true };
  }
  if (!/\bstack\b/i.test(text) || !/\b(?:in|listed|part of|include|contain)\b/i.test(text)) return null;
  const hits = matchAnswerTechNames(text);
  if (hits.length !== 1) return null;
  return { subject: hits[0] };
}

/**
 * A broad concept such as "containers" or "version control". The taxonomy
 * alias does not select Docker, PostgreSQL, or Git. A named project, an
 * explicit technology, or a database/backend/frontend question keeps its
 * own route.
 */
function descriptiveConceptRequest(query) {
  const text = String(query || '').trim();
  if (!text || namedCrossProjectIds(text).length) return null;
  if (matchAnswerTechNames(text).length) return null;
  if (isDatabaseAspectQuery(text) || isBackendAspectQuery(text) || isFrontendAspectQuery(text)) return null;
  const described = matchDescriptiveAliases(text);
  if (described.length !== 1) return null;
  if (isDocumentedConceptAlias(described[0].label) || isDocumentedConceptAlias(described[0].alias)) return null;
  const asksList = /\bstack\b/i.test(text) && /\b(?:listed|list|include|includes|in|part of)\b/i.test(text);
  const asking = PORTFOLIO_HISTORY_RE.test(text)
    || asksList
    || (/\b(?:what|which)\b/i.test(text) && /\b(?:use|uses|used|technology|technologies|tool|tools)\b/i.test(text));
  if (!asking) return null;
  return { alias: described[0].label, asksList };
}

/**
 * A documented behavior such as caching. An explicit technology name wins.
 */
function documentedConceptInQuery(query) {
  const text = String(query || '').toLowerCase();
  if (!text || matchAnswerTechNames(text).length) return null;
  const names = [];
  for (const id of ['queryforge', 'placementpro', 'reporadar']) {
    for (const facet of facetsForProject(id)) {
      const name = String(facet.facet || '').toLowerCase();
      if (name && isDocumentedConceptAlias(name) && !names.includes(name)) names.push(name);
    }
  }
  const hits = names.filter((name) => {
    if (!isDocumentedConceptAlias(name)) return false;
    if (new RegExp(`(?:^|[^a-z0-9])${name}(?=$|[^a-z0-9])`, 'i').test(text)) return true;
    const stem = name.replace(/ing$/, '');
    return new RegExp(`(?:^|[^a-z0-9])${stem}(?:e|es|ing)?(?=$|[^a-z0-9])`, 'i').test(text);
  });
  return hits.length === 1 ? hits[0] : null;
}

function conceptFacetSentences(projectId, concept) {
  const sentences = [];
  for (const facet of facetsForProject(projectId)) {
    if (facet.confidence !== 'documented') continue;
    if (facet.depth === 'overview' || facet.depth === 'unknown') continue;
    if (facet.facet !== concept) continue;
    for (const part of String(facet.text || '').split(/(?<=[.!?])\s+/)) {
      const sentence = part.trim();
      if (!sentence || sentences.includes(sentence)) continue;
      sentences.push(sentence);
      if (sentences.length >= 3) return sentences;
    }
  }
  return sentences;
}

function speakConceptRecord(classification) {
  const concept = classification?.concept || 'that behavior';
  const ids = ['queryforge', 'placementpro', 'reporadar'];
  const still = classification?.elaborate ? `This is still the documented ${concept} record. ` : '';
  const blocks = [];
  const missing = [];
  for (const id of ids) {
    const sentences = conceptFacetSentences(id, concept);
    const name = getProject(id)?.name || id;
    if (sentences.length) blocks.push(`**${name}.** ${sentences.join(' ')}`);
    else missing.push(name);
  }
  const lead = `${still}${missing.length
    ? `${missing.join(' and ')} ${missing.length > 1 ? 'do' : 'does'} not have a documented ${concept} record. I will not invent one. `
    : ''}This is project documentation. It is not a record of personal proficiency.`;
  return `${lead} ${blocks.join(' ')}`.trim();
}

function incidentalMentionLabel(query) {
  const named = matchAnswerTechNames(query);
  if (named.length) return named.join(' and ');
  const described = matchDescriptiveAliases(query);
  if (!described.length) return '';
  return described.map((item) => item.label).join(' and ');
}

function isIncidentalTechnologyMention(query) {
  const t = String(query || '').trim();
  if (!t || /[?]/.test(t)) return false;
  if (/\b(?:what|whats|what's|how|why|who|does|did|do|is|are|can|could|which|compare|comparison|both|each|their)\b/i.test(t)) return false;
  if (explicitComparisonSubject(t)) return false;
  if (namedCrossProjectIds(t).length) return false;
  return Boolean(incidentalMentionLabel(query));
}

function speakIncidentalTechnologyMention(query, ctx) {
  const label = incidentalMentionLabel(query) || 'That';
  const keep = boundCrossProjectIds(ctx).length >= 2 ? ' I will keep both projects.' : '';
  return `I noted ${label}. That mention does not choose a project or start a comparison.${keep}`;
}

function subjectEvidenceSentences(projectId, subject) {
  const re = new RegExp(`(?:^|[^a-z0-9])${String(subject).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i');
  const sentences = [];
  for (const facet of facetsForProject(projectId)) {
    if (facet.confidence !== 'documented') continue;
    if (facet.depth === 'overview' || facet.depth === 'unknown') continue;
    for (const sentence of String(facet.text || '').split(/(?<=[.!?])\s+/)) {
      const trimmed = sentence.trim();
      if (trimmed && re.test(trimmed) && !sentences.includes(trimmed)) sentences.push(trimmed);
      if (sentences.length >= 3) return sentences;
    }
  }
  return sentences;
}

function displaySubject(subject) {
  const known = YESNO_TECHS.find((tech) => new RegExp(`^${tech.source}$`, 'i').test(subject));
  if (known) return known.label;
  if (/^[a-z]/.test(subject) && !/[A-Z]/.test(subject)) {
    return subject.charAt(0).toUpperCase() + subject.slice(1);
  }
  return subject;
}

function speakComparisonSubject(classification) {
  const ids = classification?.projectIds || [];
  const subject = displaySubject(classification?.subject || 'that');
  const evidence = Object.fromEntries(ids.map((id) => [id, classification?.concept
    ? conceptFacetSentences(id, classification.concept)
    : subjectEvidenceSentences(id, classification?.subject || '')]));
  const covered = ids.filter((id) => evidence[id].length);
  const missing = ids.filter((id) => !evidence[id].length);
  const still = classification?.elaborate ? 'still ' : '';
  const keep = ids.length === 2 ? 'I will keep both projects.' : 'I will keep these projects.';
  const offer = `${keep} Which documented comparison should I expand: architecture, the database, the API, or what model each one uses?`;
  if (!covered.length) {
    const stackNotes = isPortfolioOrProjectStackName(classification?.subject)
      ? `${ids.map((id) => projectStackEvidenceLine(id, classification.subject)).join(' ')} `
      : '';
    const described = matchDescriptiveAliases(classification?.subject || '');
    const rename = described.length === 1
      && described[0].canonical.toLowerCase() !== String(classification?.subject || '').toLowerCase()
      ? `I will not rename ${subject} to ${described[0].canonical}. `
      : '';
    return `${stackNotes}${rename}I ${still}don't have documented evidence of how either project uses ${subject}. I will not treat that as proof that they do not use it, and I will not invent an implementation. ${offer}`;
  }
  const blocks = covered.map((id) => {
    const name = getProject(id)?.name || id;
    return `**${name}.** ${evidence[id].join(' ')}`;
  });
  if (missing.length) {
    const gaps = missing.map((id) => getProject(id)?.name || id).join(' or ');
    const verb = missing.length > 1 ? 'use' : 'uses';
    const proof = missing.length > 1 ? 'they do' : 'it does';
    return `${blocks.join('\n\n')}\n\nI ${still}don't have documented evidence of how ${gaps} ${verb} ${subject}. I will not treat that absence as proof that ${proof} not use ${subject}. ${offer}`;
  }
  const lead = classification?.elaborate
    ? `That ${subject} comparison is still the documented record. I will not invent a further difference.`
    : '';
  return [lead, ...blocks].filter(Boolean).join('\n\n');
}

const ASPECT_FOCUS = {
  queryforge: { stack: 'qf-architecture', architecture: 'qf-architecture', motivation: 'qf-purpose', api: 'qf-api', flow: 'qf-dataflow-overview', yesno: 'qf-architecture', switch: 'qf-purpose', database: 'qf-limitations' },
  placementpro: { stack: 'pp-architecture', architecture: 'pp-architecture', motivation: 'pp-purpose', api: 'pp-api', flow: 'pp-dataflow-dashboard', yesno: 'pp-architecture', switch: 'pp-purpose', database: 'pp-database' },
  reporadar: { stack: 'rr-architecture', architecture: 'rr-architecture', motivation: 'rr-purpose', api: 'rr-api', flow: 'rr-user-flow', yesno: 'rr-architecture', switch: 'rr-purpose', database: 'rr-data-flow' },
};

const DETAIL_TASK = {
  queryforge: 'queryforge_detail',
  placementpro: 'placementpro_detail',
  reporadar: 'reporadar_detail',
};

function pendingProjectCommitment(ctx) {
  const commitment = ctx?.memory?.lastCommitment;
  if (commitment?.task !== 'context_clarify' || commitment.pendingProject !== true) return null;
  return commitment;
}

/** A turn that only names a project, with no new question of its own. */
function bareProjectChoice(query) {
  const ids = namedCrossProjectIds(query);
  if (ids.length !== 1) return null;
  const normalized = String(query || '').toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ');
  // "want" and "discuss" count only inside an actual move to a project.
  // "I prefer QueryForgeAI" and "I want QueryForgeAI" stay mentions.
  const moving = /\b(?:switch|discuss)\b/.test(normalized);
  const glue = moving
    ? 'i|mean|the|please|one|project|its|it|a|an|let|lets|switch|to|want|wanna|now|discuss'
    : 'i|mean|the|please|one|project|its|it|a|an|let|lets|switch|to';
  const stripped = normalized
    .replace(/queryforgeai|queryforge|reporadarai|repo\s*radar|reporadar|placement\s*pro|placementpro/g, ' ')
    .replace(new RegExp(`\\b(?:${glue})\\b`, 'g'), ' ')
    .replace(/[^a-z0-9]+/g, '');
  return stripped ? null : ids[0];
}

/**
 * A sentence names one project but does not choose it and does not ask
 * anything about it. "I saw QueryForgeAI mentioned online" is a mention.
 * "Tell me about QueryForgeAI" and "Let's switch to RepoRadar" are not.
 */
export function isIncidentalProjectMention(query) {
  if (namedCrossProjectIds(query).length !== 1) return false;
  if (bareProjectChoice(query)) return false;
  if (classifyAnswerAspect(query)) return false;
  if (isGenuineProjectOverviewQuery(query)) return false;
  if (isYesNoTechnologyAsk(query)) return false;
  if (isEngineeringDetailQuery(query)) return false;
  const t = String(query || '');
  if (/\b(what|how|why|which|when|where|who|does|do|did|can|could|would|explain|describe|compare|versus|difference)\b/i.test(t)) return false;
  if (matchAnswerTechNames(query).length === 1
    && /\bstack\b/i.test(t)
    && /\b(?:listed|list|include|includes|including)\b/i.test(t)) return false;
  if (/\b(walk (?:me )?through|deep dive|show me|open (?:the )?project)\b/i.test(t)) return false;
  if (/\bvs\.?\b/i.test(t)) return false;
  if (/\btell me about\b/i.test(t)) return false;
  return true;
}

/** A pointer the current turn cannot resolve to a named project. */
function isUnresolvedProjectPointer(query) {
  const t = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return /^(that one|this one|the first one|the second one|the third one|the other one|the other project|the other|both|both of them|what about the other one)$/.test(t);
}

function routePendingProjectChoice(query, ctx) {
  const pending = pendingProjectCommitment(ctx);
  const id = bareProjectChoice(query);
  if (!pending || !id || !pending.aspect) return null;
  const focusKey = pending.aspect === 'database'
    ? 'database'
    : pending.aspect === 'architecture'
      ? 'architecture'
      : 'stack';
  const focus = ASPECT_FOCUS[id]?.[focusKey];
  const task = DETAIL_TASK[id];
  if (!focus || !task) return null;
  const aspect = pending.aspect === 'database'
    || pending.aspect === 'backend'
    || pending.aspect === 'frontend'
    || pending.aspect === 'architecture'
    ? pending.aspect
    : 'stack';
  return { strategy: 'Summarize', task, focus, aspect };
}

/**
 * "Explain the architecture" with no project in the text.
 * Portfolio-wide wording stays on the teaching diagram. Otherwise the
 * active comparison or established project answers, the visible card is
 * only a fallback, and no context means ask which project.
 */
function isBareArchitectureExplanation(query) {
  const t = String(query || '').toLowerCase().trim();
  return /\b(explain|describe|what is|what's|show|what about)\b.{0,48}\barchitect/.test(t)
    || /\barchitect\w*\s+of\b/.test(t)
    || /\bhow does (?:its |the |this )?architect\w* work\b/.test(t);
}

function isPortfolioWideArchitecture(query) {
  return /\b(overall|whole|entire|five[- ]?layer|portfolio|in general|generally)\b/i
    .test(String(query || ''));
}

function singleBoundProject(ctx) {
  const id = ctx?.memory?.lastCommitment?.projectId || ctx?.memory?.lastProject || null;
  return id && ASPECT_FOCUS[id] ? id : null;
}

function routeUnscopedArchitectureAsk(query, ctx) {
  const t = String(query || '').toLowerCase().trim();
  if (!isBareArchitectureExplanation(t) || namedCrossProjectIds(t).length > 0) return null;

  if (isPortfolioWideArchitecture(t)) {
    return { strategy: 'Explain', task: 'arch_why' };
  }
  if (pendingProjectCommitment(ctx)) {
    return { strategy: 'Summarize', task: 'context_clarify', aspect: 'architecture' };
  }
  const compared = boundCrossProjectIds(ctx);
  if (compared.length >= 2) {
    return {
      strategy: 'Compare',
      task: 'cross_project_compare',
      projectIds: compared,
      lens: 'architecture',
      priorLens: ctx?.memory?.lastCommitment?.lens || null,
    };
  }
  const established = singleBoundProject(ctx);
  const framed = ctx?.questionFrame?.projectId;
  // "Explain the architecture" can use the visible card when nothing else
  // is bound. "What about the architecture?" does not: the card is not a
  // selection, so an unresolved project stays a clarification.
  const deictic = /\bwhat about\b|\bhow does (?:its |the |this )\b/i.test(t);
  const id = established || (!deictic && framed && ASPECT_FOCUS[framed] ? framed : null);
  if (id) {
    return {
      strategy: 'Summarize',
      task: DETAIL_TASK[id],
      focus: ASPECT_FOCUS[id].architecture,
      aspect: 'architecture',
    };
  }
  return { strategy: 'Summarize', task: 'context_clarify', aspect: 'architecture' };
}

/**
 * Single-project stack, motivation, architecture, and API questions.
 * Runs before generic facet paste and before the portfolio five-layer fallback.
 * Returns null when no single project is named, or the aspect is not one of those four.
 */
function aspectForBoundFocus(query, focus) {
  // A deictic "Is it built with Flask?" has no project name, so the shared
  // classifier leaves it unresolved. The bound project is already known here.
  if (isYesNoTechnologyAsk(query)) return 'yesno';
  const aspect = classifyAnswerAspect(query);
  if (aspect) return aspect;
  if (/architecture$/.test(String(focus || '')) && /\b(built|architect|designed|structured|stack)\b/i.test(String(query || ''))) {
    return 'architecture';
  }
  return null;
}

function routeNamedProjectAspect(query) {
  const aspect = classifyAnswerAspect(query);
  if (!aspect || !ASPECT_FOCUS.queryforge[aspect]) return null;
  const ids = namedCrossProjectIds(query);
  if (ids.length !== 1) return null;
  const id = ids[0];
  const focus = ASPECT_FOCUS[id]?.[aspect];
  const task = DETAIL_TASK[id];
  if (!focus || !task) return null;
  return { strategy: 'Summarize', task, focus, aspect };
}

function facetSentences(text) {
  const stripped = String(text || '')
    .replace(/^Verified implementation architecture(?:\s*\([^)]*\))?:\s*/i, '')
    .replace(/^Verified (?:API surface|HTTP surface|product API):\s*/i, '');
  return stripped
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const STACK_SENTENCE = /frontend|backend|react|fastapi|flask|next\.?js|gemini|groq|vite|uvicorn|octokit|websocket|database|sqlite|postgres|minilm|networkx|sqlalchemy/i;

function shapeArchitectureAspect(facet, aspect, query) {
  const sentences = facetSentences(facet?.text);
  if (!sentences.length) return null;
  if (aspect === 'architecture') {
    const kept = sentences.filter((s) => asksPortfolioDiscrepancy(query) || !isPortfolioDiscrepancySentence(s));
    return (kept.length ? kept : sentences).join('\n\n');
  }
  if (aspect === 'stack') {
    if (isBackendAspectQuery(query)) {
      const backend = backendClauseFromSentences(sentences);
      if (backend) return backend;
    }
    if (isFrontendAspectQuery(query)) {
      const frontend = frontendClauseFromSentences(sentences);
      if (frontend) return frontend;
    }
    const stackSentences = sentences.filter((s) => STACK_SENTENCE.test(s));
    const kept = stackSentences.filter((s) => !isUnaskedStackCaveat(s, query));
    return (kept.length ? kept : stackSentences).join(' ');
  }
  return null;
}

function backendClauseFromSentences(sentences) {
  for (const sentence of sentences) {
    if (isPortfolioDiscrepancySentence(sentence)) continue;
    const parts = String(sentence).split(/;/).map((part) => part.trim()).filter(Boolean);
    const hit = parts.find((part) => /\bbackend\b|\bfastapi\b|\buvicorn\b|\bflask\b|no separate python/i.test(part));
    if (hit) return cleanClause(hit);
  }
  return '';
}

function frontendClauseFromSentences(sentences) {
  for (const sentence of sentences) {
    if (isPortfolioDiscrepancySentence(sentence)) continue;
    const parts = String(sentence).split(/;/).map((part) => part.trim()).filter(Boolean);
    const hit = parts.find((part) => /\bfrontend\b/i.test(part) && !/\bfastapi\b|\buvicorn\b/i.test(part));
    if (hit) return cleanClause(hit);
  }
  return '';
}

function isPortfolioDiscrepancySentence(sentence) {
  return /portfolio wording|outdated relative to the code/i.test(sentence);
}

function isUnaskedStackCaveat(sentence, query) {
  const q = String(query || '');
  if (isPortfolioDiscrepancySentence(sentence) && !asksPortfolioDiscrepancy(q)) {
    return true;
  }
  if (/no database drivers|migrations appear in the inspected/i.test(sentence) && !/database|driver|migration|limitation|live db|explain/i.test(q)) {
    return true;
  }
  if (/websocket/i.test(sentence) && !/websocket|cli|local agent|pro agent/i.test(q)) {
    return true;
  }
  return false;
}

function speakProjectMotivation(projectId) {
  const proj = getProject(projectId);
  if (!proj?.problem) return null;
  const benefit = String(proj.solution || '').split(/(?<=\.)\s+/)[0].trim();
  return [
    `${proj.name} was built around a documented problem: ${proj.problem}`,
    benefit ? `What it is meant to do: ${benefit}` : '',
    'Why a specific framework or provider was chosen is not documented.',
  ].filter(Boolean).join(' ');
}

function speakApiContrast(ids) {
  const blocks = [];
  for (const id of ids) {
    const project = CROSS_PROJECT_CATALOG.find((p) => p.id === id);
    if (!project) continue;
    const api = project.facets.find((f) => f.id === ASPECT_FOCUS[id].api);
    const modelId = { queryforge: 'qf-ai-model', placementpro: 'pp-ai-model', reporadar: 'rr-ai-model' }[id];
    const model = project.facets.find((f) => f.id === modelId);
    const modelSentences = facetSentences(model?.text).slice(0, id === 'queryforge' ? 3 : 2);
    const routeSentences = facetSentences(api?.text).slice(0, 2);
    const parts = [`**${project.name}.**`];
    if (modelSentences.length) parts.push(`External or library intelligence: ${modelSentences.join(' ')}`);
    if (routeSentences.length) parts.push(`Internal application routes: ${routeSentences.join(' ')}`);
    if (id === 'reporadar') {
      const github = project.facets.find((f) => f.id === 'rr-github');
      const third = facetSentences(github?.text)[0];
      if (third) parts.push(`Third-party integration: ${third}`);
    }
    blocks.push(parts.join(' '));
  }
  if (!blocks.length) return null;
  return [
    'External provider APIs, internal application routes, and third-party integrations are different things.',
    ...blocks,
  ].join('\n\n');
}

function speakStackContrast(ids, query) {
  const blocks = ids.map((id) => {
    const project = CROSS_PROJECT_CATALOG.find((p) => p.id === id);
    const facet = project?.facets.find((f) => f.id === ASPECT_FOCUS[id].stack);
    let shaped = shapeArchitectureAspect(facet, 'stack', query);
    if (id === 'queryforge') shaped = supplementQueryForge('stack', shaped, query);
    return shaped ? `**${project.name}.** ${shaped}` : '';
  }).filter(Boolean);
  return blocks.join('\n\n');
}

function projectIdFromDetailTask(task) {
  if (String(task).startsWith('queryforge')) return 'queryforge';
  if (String(task).startsWith('placementpro')) return 'placementpro';
  if (String(task).startsWith('reporadar')) return 'reporadar';
  return null;
}

const YESNO_TECHS = [
  { source: 'fastapi', label: 'FastAPI' },
  { source: 'flask', label: 'Flask' },
  { source: 'uvicorn', label: 'Uvicorn' },
  { source: 'next\\.?js', label: 'Next.js' },
  { source: 'gemini', label: 'Gemini' },
  { source: 'groq', label: 'Groq' },
  { source: 'react', label: 'React' },
  { source: 'vite', label: 'Vite' },
];

function askedTechnology(query) {
  const t = String(query || '');
  const hits = YESNO_TECHS.filter((tech) => new RegExp(`\\b${tech.source}\\b`, 'i').test(t));
  if (!hits.length) return null;
  const aimed = t.match(/\b(?:built with|use|uses|using)\s+([a-z0-9.+-]+)/i);
  if (aimed) {
    const aimedHit = hits.find((tech) => new RegExp(`^${tech.source}$`, 'i').test(aimed[1]));
    if (aimedHit) return aimedHit;
  }
  return hits[0];
}

function technologyClause(sentence, preferred) {
  const parts = String(sentence || '').split(/;/).map((part) => part.trim()).filter(Boolean);
  const hit = parts.find((part) => preferred.test(part));
  return (hit || sentence || '').replace(/\.$/, '');
}

function isTechDenial(sentence, tech) {
  if (!new RegExp(`\\b${tech.source}\\b`, 'i').test(sentence)) return false;
  return /\b(not|no|without|isn't|is not|outdated)\b/i.test(sentence);
}

function asksPortfolioDiscrepancy(query) {
  return /portfolio|wording|says flask|said flask|documentation|outdated|why.{0,40}flask/i.test(String(query || ''));
}

function omitUnaskedPortfolioDiscrepancy(text, query) {
  if (asksPortfolioDiscrepancy(query)) return text;
  return String(text || '')
    .replace(/\s*It is not Flask in the inspected implementation — portfolio wording that says Flask for QueryForgeAI is outdated relative to the code\./gi, '')
    .trim();
}

function cleanClause(text) {
  return String(text || '')
    .replace(/^Verified implementation architecture(?:\s*\([^)]*\))?:\s*/i, '')
    .replace(/\.$/, '')
    .trim();
}

/**
 * Pull the frontend and backend clauses out of architecture sentences.
 * A clause that only exists to deny the asked technology is skipped.
 */
function collectStackBits(sentences, tech) {
  const deniedRe = new RegExp(`\\b${tech.source}\\b`, 'i');
  const bits = [];
  const push = (bit) => {
    const cleaned = cleanClause(bit);
    if (!cleaned || bits.includes(cleaned)) return;
    if (deniedRe.test(cleaned) && /\b(not|no|without)\b/i.test(cleaned)) return;
    if (!/\b(fastapi|uvicorn|flask|next\.?js|react|vite|frontend|backend)\b/i.test(cleaned)) return;
    bits.push(cleaned);
  };
  for (const sentence of sentences) {
    for (const part of String(sentence).split(/;/)) {
      const labeled = part.split(/(?=(?:Frontend|Backend):)/i);
      for (const bit of labeled) push(bit);
    }
  }
  const frontend = bits.find((bit) => /frontend/i.test(bit) && !/fastapi|uvicorn/i.test(bit)) || '';
  const backend = bits.find((bit) => (/fastapi|uvicorn|\bflask\b|^backend:/i.test(bit) && !deniedRe.test(bit))) || '';
  return { frontend, backend };
}

/**
 * Direct yes/no for a named technology. Uses the architecture facet's own
 * sentences, and stops after the clause that answers the question.
 */
function speakYesNoTechnology(projectId, query, facet) {
  const tech = askedTechnology(query);
  const name = getProject(projectId)?.name || 'This project';
  const sentences = facetSentences(facet?.text);
  if (!tech) {
    return `The inspected records for ${name} do not establish a yes or no for that technology.`;
  }
  const re = new RegExp(`\\b${tech.source}\\b`, 'i');
  const hits = sentences.filter((sentence) => re.test(sentence));
  const denied = hits.some((sentence) => isTechDenial(sentence, tech));
  const supported = hits.some((sentence) => !isTechDenial(sentence, tech));
  if (denied && !supported) {
    const { frontend, backend } = collectStackBits(sentences, tech);
    const primary = backend || frontend;
    let answer = primary
      ? `No. ${name} uses ${primary}, not ${tech.label}.`
      : `No. ${name} does not use ${tech.label}.`;
    if (frontend && backend && frontend !== backend) answer += ` ${frontend}.`;
    if (asksPortfolioDiscrepancy(query)) {
      const line = sentences.find((sentence) => /outdated|portfolio wording/i.test(sentence));
      if (line) answer += ` ${line}`;
    }
    return answer.replace(/\s+/g, ' ').trim();
  }
  if (supported) {
    const affirm = hits.find((sentence) => !isTechDenial(sentence, tech));
    return `Yes. ${name} uses ${cleanClause(technologyClause(affirm, re))}.`;
  }
  return `The inspected records for ${name} do not establish whether it uses ${tech.label}.`;
}

function speakProjectSwitch(projectId, facet) {
  const sentences = facetSentences(facet?.text).slice(0, 2);
  if (!sentences.length) return null;
  return sentences.join(' ');
}

function coreStackSentence(id) {
  const project = CROSS_PROJECT_CATALOG.find((p) => p.id === id);
  const facet = project?.facets.find((f) => f.id === ASPECT_FOCUS[id]?.architecture);
  const sentences = facetSentences(facet?.text);
  const raw = sentences.find((sentence) => /\bbackend\b|fastapi|flask|next\.?js|no separate python/i.test(sentence)) || '';
  const clause = raw.split(/;/).map((part) => part.trim()).find((part) => /backend|fastapi|flask|next\.?js/i.test(part));
  return clause || raw;
}

function speakProductDifference(ids) {
  const blocks = [];
  for (const id of ids) {
    const project = CROSS_PROJECT_CATALOG.find((p) => p.id === id);
    if (!project) continue;
    const purpose = project.facets.find((f) => f.id === ASPECT_FOCUS[id]?.switch);
    const summary = facetSentences(purpose?.text).slice(0, 2).join(' ');
    const tech = coreStackSentence(id);
    const technical = tech ? `Core technical distinction: ${tech}` : '';
    if (summary) blocks.push([`**${project.name}.** ${summary}`, technical].filter(Boolean).join(' '));
  }
  if (!blocks.length) return null;
  return blocks.join('\n\n');
}

function isConversationInterruption(query) {
  const t = String(query || '').trim();
  if (/^(?:hi|hey|hello|thanks|thank you|good morning|good evening)\b/i.test(t)) return true;
  if (/\b(?:who are you|what are you)\b/i.test(t)) return true;
  if (isIncidentalTechnologyMention(query)) return true;
  return isIncidentalProjectMention(query);
}

/** A short "How?" continues the previous subject. It does not name a new one. */
function isSubjectHowFollowUp(query) {
  const core = followUpRemainder(query).replace(/[^a-z0-9]+/g, ' ').trim();
  return /^(?:and )?how$/.test(core)
    || /^how does (?:it|that|this) work$/.test(core)
    || /^can you explain how$/.test(core);
}

function priorSubstantiveVisitorQuery(memory, _currentQuery) {
  const users = (memory?.turns || [])
    .filter((turn) => turn.role === 'user')
    .map((turn) => String(turn.text || ''));
  for (const text of users.slice(0, -1).reverse()) {
    if (!text.trim()) continue;
    if (isElaborationRequest(text)) continue;
    if (isSubjectHowFollowUp(text)) continue;
    if (isConversationInterruption(text)) continue;
    return text;
  }
  return null;
}

function elaborationSubject(query, aspect, focus) {
  const t = String(query || '');
  if (isDatabaseAspectQuery(t) || aspect === 'database') return 'database';
  if (isFrontendAspectQuery(t) || aspect === 'frontend') return 'frontend';
  if (isBackendAspectQuery(t)) return 'backend';
  if (/score|health score|calculated/i.test(t) || /scoring/.test(String(focus || ''))) return 'scoring';
  if (aspect === 'architecture' || /\barchitect/i.test(t)) return 'architecture';
  if (aspect === 'flow' || /\bhow\b/i.test(t)) return 'flow';
  return 'facet';
}

function sentenceMatchesSubject(sentence, subject) {
  if (subject === 'frontend') return /\bfrontend\b/i.test(sentence) && !/\b(?:fastapi|uvicorn|flask)\b/i.test(sentence);
  if (subject === 'backend') return /\b(?:backend|fastapi|uvicorn|flask|gunicorn)\b/i.test(sentence);
  if (subject === 'database') return /\b(?:database|sqlite|postgres|sqlalchemy|persist|explain)\b/i.test(sentence);
  if (subject === 'scoring') return /\b(?:score|health|bucket|bus factor|heuristic)\b/i.test(sentence);
  return true;
}

function alreadyCovered(sentence, spoken) {
  const left = String(sentence || '').toLowerCase();
  const right = String(spoken || '').toLowerCase().replace(/^[^:]{0,48}:\s*/, '');
  if (!left || !right) return false;
  if (right.length > 20 && left.includes(right.slice(0, 40))) return true;
  return left.split(/;/).some((part) => {
    const piece = part.trim();
    return piece.length > 12 && right.includes(piece.slice(0, 32));
  });
}

function elaborationLimit(projectId) {
  const name = getProject(projectId)?.name || 'this project';
  return `That is the full documented record for ${name}. I don't have a further breakdown that isn't already in that answer, and I will not invent one.`;
}

function facetsForProject(projectId) {
  if (projectId === 'queryforge') return QUERYFORGE_FACETS;
  if (projectId === 'placementpro') return PLACEMENTPRO_FACETS;
  if (projectId === 'reporadar') return REPORADAR_FACETS;
  return [];
}

function facetForNamedTechnology(projectId, technology) {
  const escaped = String(technology || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return null;
  const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
  let database = null;
  let first = null;
  for (const facet of facetsForProject(projectId)) {
    if (facet.confidence !== 'documented') continue;
    if (facet.depth === 'overview' || facet.depth === 'unknown') continue;
    if (!re.test(String(facet.text || ''))) continue;
    if (!first) first = facet;
    if (facet.facet === 'database') database = facet;
  }
  return database || first;
}

function matchFacetForProject(projectId) {
  if (projectId === 'queryforge') return matchQueryForgeFacet;
  if (projectId === 'placementpro') return matchPlacementProFacet;
  if (projectId === 'reporadar') return matchRepoRadarFacet;
  return null;
}

/**
 * A menu label has to be a cue the existing matcher sends back to this facet,
 * and it has to name the facet. A long incidental cue is not a facet name.
 */
function roundTripFacetLabel(facet, projectName, match) {
  const titleWords = String(facet.title || '').toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
  const cues = (facet.cues || []).filter((cue) => (
    typeof cue === 'string'
    && cue.length >= 4
    && cue.length <= 32
    && !/[\\^$.*+?()[\]{}|]/.test(cue)
    && !/^(?:why|what|how|when|which|does|is|do)\b/i.test(cue)
  ));
  const ranked = cues.map((cue) => {
    const words = cue.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const overlap = words.filter((word) => titleWords.includes(word)).length;
    const dangling = /(?:\s(?:of|to|for|the|a))$/i.test(cue) ? 1 : 0;
    return { cue, overlap, words: words.length, dangling };
  }).filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.dangling - b.dangling || a.words - b.words || a.cue.length - b.cue.length);
  for (const item of ranked) {
    const hit = match(`What about ${item.cue}? ${projectName}`);
    if (hit?.id === facet.id) return item.cue;
  }
  return null;
}

/**
 * Documented neighbors of the facet just spoken.
 * Same family, then facets that already share a comparison lens with it,
 * then the project's architecture, API, database, and flow facets,
 * then the rest of the knowledge-module order.
 */
function relatedFacetOrder(projectId, currentId) {
  const facets = facetsForProject(projectId);
  const current = facets.find((facet) => facet.id === currentId);
  const family = String(current?.facet || '').split('.')[0];
  const ordered = [];
  const push = (id) => {
    if (!id || id === currentId || ordered.includes(id)) return;
    const facet = facets.find((item) => item.id === id);
    if (!facet || facet.confidence !== 'documented' || facet.depth === 'overview') return;
    ordered.push(id);
  };
  if (family) {
    for (const facet of facets) {
      if (String(facet.facet).split('.')[0] === family) push(facet.id);
    }
  }
  if (currentId) {
    for (const lens of Object.keys(CROSS_LENS_FACETS)) {
      const ids = CROSS_LENS_FACETS[lens][projectId] || [];
      if (!ids.includes(currentId)) continue;
      for (const id of ids) push(id);
    }
  }
  const aspects = ASPECT_FOCUS[projectId] || {};
  for (const key of ['architecture', 'api', 'database', 'flow']) push(aspects[key]);
  for (const facet of facets) push(facet.id);
  return ordered.map((id) => facets.find((facet) => facet.id === id));
}

function labelRoutesToFacet(projectId, facetId, label) {
  const name = getProject(projectId)?.name || '';
  const query = `What about ${label}? ${name}`;
  const task = DETAIL_TASK[projectId];
  const memory = {
    turns: [],
    lastProject: projectId,
    lastCommitment: { projectId, name, task },
    activeMode: task,
    profile: { type: 'unknown' },
  };
  const questionFrame = buildQuestionFrame(query, { memory, focusProject: projectId });
  const result = classifyReasoningStrategy(query, { questionFrame, memory });
  return result?.task === task && result?.focus === facetId;
}

function asksOwnApiSurface(query) {
  const t = String(query || '').toLowerCase();
  if (/\b(external|third[- ]party|providers?)\b/.test(t)) return false;
  if (/\b(authenticat|\bjwt\b|api\s+errors?|errors?\s+can\s+occur|failure handling)\b/.test(t)) return false;
  return /\b(api surface|endpoints?|routes?|backend interface|apis?)\b/.test(t)
    || /\bclients?\s+communicate\s+with\s+the\s+backend\b/.test(t);
}

function routeAuthenticationAsk(query, ctx) {
  if (!/\b(authenticat\w*|\bjwt\b)\b/i.test(query)) return null;
  const named = namedCrossProjectIds(query);
  if (named.length > 1) return null;
  if (pendingProjectCommitment(ctx) && named.length === 0) return null;
  const id = named[0] || singleBoundProject(ctx);
  if (id === 'queryforge') return { strategy: 'Summarize', task: 'undocumented_detail' };
  const focus = { placementpro: 'pp-auth', reporadar: 'rr-security' }[id];
  if (!focus || !DETAIL_TASK[id]) return null;
  return { strategy: 'Summarize', task: DETAIL_TASK[id], focus };
}

function routeApiFailureAsk(query, ctx) {
  if (!/\b(api\s+errors?|errors?\s+can\s+occur)\b/i.test(query)) return null;
  const named = namedCrossProjectIds(query);
  if (named.length > 1) return null;
  if (pendingProjectCommitment(ctx) && named.length === 0) return null;
  const id = named[0] || singleBoundProject(ctx);
  const focus = { queryforge: 'qf-failure', placementpro: 'pp-failure', reporadar: 'rr-failure' }[id];
  if (!focus || !DETAIL_TASK[id]) return null;
  return { strategy: 'Summarize', task: DETAIL_TASK[id], focus };
}

function routeTitledFacet(query, ctx) {
  const named = namedCrossProjectIds(query);
  if (named.length > 1) return null;
  if (pendingProjectCommitment(ctx) && named.length === 0) return null;
  const id = named[0] || singleBoundProject(ctx);
  if (!id || !DETAIL_TASK[id]) return null;
  const titled = documentedFacetTitle(query, id);
  if (!titled) return null;
  return { strategy: 'Summarize', task: DETAIL_TASK[id], focus: titled.id };
}

function routeExplicitFacet(query, ctx) {
  const titled = routeTitledFacet(query, ctx);
  if (titled) return titled;
  const named = namedCrossProjectIds(query);
  if (named.length > 1) return null;
  if (pendingProjectCommitment(ctx) && named.length === 0) return null;
  const id = named[0] || singleBoundProject(ctx);
  if (!id || !DETAIL_TASK[id]) return null;
  if (named.length === 0) {
    const aspect = classifyAnswerAspect(query);
    if (aspect && ASPECT_FOCUS[id][aspect]) {
      return { strategy: 'Summarize', task: DETAIL_TASK[id], focus: ASPECT_FOCUS[id][aspect], aspect };
    }
  }
  return null;
}

function facetTitleLabel(facet) {
  const title = String(facet.title || '').trim();
  const parts = title.split(/\s[—–]\s/);
  return (parts.length > 1 ? parts[parts.length - 1] : title).trim();
}

/**
 * A documented facet whose title the visitor actually used.
 * Overview titles are not a substitute for a specific question.
 */
function documentedFacetTitle(query, projectId) {
  const t = String(query || '').toLowerCase();
  if (/\banaly[sz]e\b.{0,40}\barchitect|\btarget(?:'s| repo)? architecture\b/.test(t)) return null;
  let best = null;
  let bestLen = 0;
  for (const facet of facetsForProject(projectId)) {
    if (facet.confidence !== 'documented' || facet.depth === 'overview') continue;
    const title = facetTitleLabel(facet).toLowerCase();
    if (title.length < 4 || title.length <= bestLen) continue;
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i').test(t)) continue;
    best = facet;
    bestLen = title.length;
  }
  return best;
}

function previousSameProjectFocus(memory, projectId, currentId) {
  const substantive = [];
  for (const turn of memory?.turns || []) {
    if (turn.role !== 'user') continue;
    const text = String(turn.text || '');
    if (!text.trim() || isElaborationRequest(text) || isSubjectHowFollowUp(text) || isConversationInterruption(text)) continue;
    substantive.push(text);
  }
  const previous = substantive.length >= 2 ? substantive[substantive.length - 2] : null;
  if (!previous) return null;
  const named = namedCrossProjectIds(previous);
  if (named.length > 1) return null;
  const bound = named[0] || projectId;
  if (bound !== projectId) return null;
  const stub = {
    turns: [],
    lastProject: bound,
    lastCommitment: { projectId: bound, name: getProject(bound)?.name || '', task: DETAIL_TASK[bound] },
    profile: memory?.profile || { type: 'unknown' },
  };
  const result = classifyReasoningStrategy(previous, {
    questionFrame: buildQuestionFrame(previous, { memory: stub, focusProject: bound }),
    memory: stub,
    resolvingPrior: true,
  });
  const focus = result?.focus || null;
  if (!focus || focus === currentId) return null;
  if (projectIdFromDetailTask(result?.task) !== projectId) return null;
  return focus;
}

function documentedFacetOffers(projectId, currentId, memory) {
  const labels = [];
  const name = getProject(projectId)?.name || '';
  const match = matchFacetForProject(projectId);
  const previousFocus = previousSameProjectFocus(memory, projectId, currentId);
  const accept = (facet, label) => {
    if (!facet || facet.id === currentId || facet.id === previousFocus) return false;
    if (!label || labels.some((item) => item.toLowerCase() === label.toLowerCase())) return false;
    if (!labelRoutesToFacet(projectId, facet.id, label)) return false;
    labels.push(label);
    return true;
  };
  for (const facet of relatedFacetOrder(projectId, currentId)) {
    if (!accept(facet, facetTitleLabel(facet))) accept(facet, roundTripFacetLabel(facet, name, match));
    if (labels.length === 3) break;
  }
  return labels;
}

function formatFacetOffer(labels) {
  if (!labels.length) return '';
  if (labels.length === 1) return ` You can ask about ${labels[0]}.`;
  const head = labels.slice(0, -1).join(', ');
  return ` You can ask about ${head}, or ${labels[labels.length - 1]}.`;
}

function projectIdMentioned(text) {
  const t = String(text || '');
  if (/queryforge/i.test(t)) return 'queryforge';
  if (/placement/i.test(t)) return 'placementpro';
  if (/reporadar|repo\s*radar/i.test(t)) return 'reporadar';
  return null;
}

function substantiveQueryThrough(turns, endIndex) {
  const users = [];
  for (let i = 0; i <= endIndex; i += 1) {
    if (turns[i]?.role === 'user') users.push(String(turns[i].text || ''));
  }
  for (const text of users.reverse()) {
    if (!text.trim()) continue;
    if (isElaborationRequest(text)) continue;
    if (isSubjectHowFollowUp(text)) continue;
    if (isConversationInterruption(text)) continue;
    return text;
  }
  return null;
}

/**
 * A menu suppresses only another completion of the same facet on the same
 * project. The subject is the visitor question that produced that menu.
 */
function facetMenuAlreadySpoken(memory, projectId, focus) {
  const turns = memory?.turns || [];
  if (!projectId) return false;
  for (let i = 0; i < turns.length; i += 1) {
    const turn = turns[i];
    if (turn.role !== 'assistant' || !/you can ask about/i.test(turn.text || '')) continue;
    const menuProject = projectIdMentioned(turn.text);
    if (menuProject && menuProject !== projectId) continue;
    let userIndex = -1;
    for (let j = i - 1; j >= 0; j -= 1) {
      if (turns[j].role === 'user') {
        userIndex = j;
        break;
      }
    }
    if (userIndex < 0) continue;
    const anchor = substantiveQueryThrough(turns, userIndex);
    if (!anchor) continue;
    const bound = menuProject || projectId;
    const stub = {
      turns: turns.slice(0, userIndex + 1),
      lastProject: bound,
      lastCommitment: {
        projectId: bound,
        name: getProject(bound)?.name || '',
        task: DETAIL_TASK[bound],
      },
      profile: memory.profile || { type: 'unknown' },
    };
    const result = classifyReasoningStrategy(anchor, {
      questionFrame: buildQuestionFrame(anchor, { memory: stub, focusProject: bound }),
      memory: stub,
      resolvingPrior: true,
    });
    const resultProject = projectIdFromDetailTask(result?.task) || menuProject;
    let resultFocus = result?.focus || null;
    if (!resultFocus && (result?.task === 'project_overview' || result?.facetMenu)) {
      resultFocus = ASPECT_FOCUS[bound]?.switch || null;
    }
    if (resultProject === projectId && (resultFocus || null) === (focus || null)) return true;
  }
  return false;
}

function assistantAlreadySaid(sentence, memory) {
  const corpus = (memory?.turns || [])
    .filter((turn) => turn.role === 'assistant')
    .map((turn) => turn.text || '')
    .join('\n');
  return alreadyCovered(sentence, corpus);
}

function completedFacetReply(projectId, currentId, memory) {
  const limit = elaborationLimit(projectId);
  if (facetMenuAlreadySpoken(memory, projectId, currentId)) return limit;
  return `${limit}${formatFacetOffer(documentedFacetOffers(projectId, currentId, memory))}`;
}

function elaborationMemory(ctx) {
  return ctx?.memory || ctx?.ctx?.memory || null;
}

function speakStoredElaboration(task, ctx) {
  const projectId = projectIdFromDetailTask(task);
  const limit = elaborationLimit(projectId);
  if (!projectId) return limit;
  const memory = elaborationMemory(ctx);
  const focus = ctx.classification?.focus || null;
  if (ctx.classification?.facetMenu) {
    if (facetMenuAlreadySpoken(memory, projectId, focus)) return limit;
    const offer = formatFacetOffer(documentedFacetOffers(projectId, focus, memory));
    if (!offer) return limit;
    const name = getProject(projectId)?.name || 'this project';
    return `That overview of ${name} is only the short version.${offer}`;
  }
  if (/_unknown$/.test(task)) {
    return completedFacetReply(projectId, focus, memory);
  }
  const priorQuery = ctx.classification?.priorQuery || '';
  const aspect = ctx.classification?.aspect;
  const facets = facetsForProject(projectId);
  const facet = facets.find((item) => item.id === focus);
  if (!facet?.text) return completedFacetReply(projectId, focus, memory);
  const spoken = speakFacetForAspect(task, facet, { aspect }, priorQuery) || '';
  const subject = elaborationSubject(priorQuery, aspect, focus);
  const name = getProject(projectId)?.name || 'This project';
  const extras = facetSentences(facet.text).filter((sentence) => (
    !alreadyCovered(sentence, spoken)
    && !assistantAlreadySaid(sentence, memory)
    && sentenceMatchesSubject(sentence, subject)
  ));
  if (!extras.length) return completedFacetReply(projectId, focus, memory);
  return `${name}: ${extras.join(' ')}`;
}

function speakFacetForAspect(task, facet, classification, query) {
  const aspect = classification?.aspect || null;
  const projectId = projectIdFromDetailTask(task);
  if (!aspect) return facet?.text || null;
  if (aspect === 'yesno' && projectId) {
    return speakYesNoTechnology(projectId, query, facet);
  }
  if (aspect === 'switch' && projectId) {
    const spoken = speakProjectSwitch(projectId, facet);
    if (spoken) return spoken;
  }
  if (aspect === 'motivation' && projectId) {
    const spoken = speakProjectMotivation(projectId);
    if (spoken) return spoken;
  }
  if (aspect === 'api' && projectId) {
    // Questions about this project's own endpoints use that facet.
    // External-provider questions keep the provider-and-route contrast.
    if (asksOwnApiSurface(query) && facet?.text) return facet.text;
    const spoken = speakApiContrast([projectId]);
    if (spoken) return spoken;
  }
  if (aspect === 'flow' && facet?.text) {
    const name = projectId ? getProject(projectId)?.name : '';
    if (name && !new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(facet.text)) {
      return `${name}. ${facet.text}`;
    }
    return facet.text;
  }
  if (aspect === 'backend' && facet) {
    const clause = backendClauseFromSentences(facetSentences(facet.text));
    if (clause) {
      const name = projectId ? getProject(projectId)?.name : '';
      if (name && !new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(clause)) {
        return `${name}: ${clause}`;
      }
      return clause;
    }
  }
  if (aspect === 'frontend' && facet) {
    const clause = frontendClauseFromSentences(facetSentences(facet.text));
    if (clause) {
      const name = projectId ? getProject(projectId)?.name : '';
      if (name && !new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(clause)) {
        return `${name}: ${clause}`;
      }
      return clause;
    }
  }
  if ((aspect === 'stack' || aspect === 'architecture') && facet) {
    let shaped = shapeArchitectureAspect(facet, aspect, query);
    if (projectId === 'queryforge') shaped = supplementQueryForge(aspect, shaped, query);
    const name = projectId ? getProject(projectId)?.name : '';
    if (shaped && name && !new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(shaped)) {
      shaped = `${name}: ${shaped}`;
    }
    if (shaped) return shaped;
  }
  return facet?.text || null;
}

/** Facts that live on a sibling QueryForge facet, not in the architecture paragraph. */
function supplementQueryForge(aspect, shaped, query) {
  if (!shaped || (aspect !== 'stack' && aspect !== 'architecture')) return shaped;
  // Heuristic fallback and simulated CLI execution answer limitation questions.
  // Stack and architecture summaries do not import them on their own.
  const wantsSiblingCaveat = /heuristic|simulat|websocket|cli agent|pro agent|no (?:llm |provider |api )?key|fallback|limitation/i.test(String(query || ''));
  if (!wantsSiblingCaveat) return shaped;
  const extra = [];
  if (!/heuristic/i.test(shaped)) {
    const model = QUERYFORGE_FACETS.find((f) => f.id === 'qf-ai-model');
    const line = facetSentences(model?.text).find((s) => /heuristic/i.test(s));
    if (line) extra.push(line);
  }
  if (!/simulat/i.test(shaped)) {
    const agent = QUERYFORGE_FACETS.find((f) => f.id === 'qf-pro-agent');
    const line = facetSentences(agent?.text).find((s) => /simulat/i.test(s));
    if (line) extra.push(line);
  }
  return extra.length ? `${shaped} ${extra.join(' ')}` : shaped;
}

function isConciseArchitectureContrast(query) {
  const t = String(query || '');
  if (/\bcompare the architecture of\b/i.test(t)) return false;
  return /\barchitect/i.test(t) && /\b(compare|differ(?:s|ed)?|different from|architecturally)\b/i.test(t);
}

function facetParagraphs(ids, lens, query) {
  const map = CROSS_LENS_FACETS[lens] || CROSS_LENS_FACETS.differentiate;
  const blocks = [];
  for (const id of ids) {
    const project = CROSS_PROJECT_CATALOG.find((p) => p.id === id);
    if (!project) continue;
    const texts = (map[id] || [])
      .map((fid) => project.facets.find((f) => f.id === fid)?.text)
      .filter(Boolean)
      .map((text) => omitUnaskedPortfolioDiscrepancy(text, query))
      .filter(Boolean);
    if (texts.length) blocks.push(`**${project.name}.** ${texts.join(' ')}`);
  }
  return blocks;
}

function speakCrossProject(query, classification) {
  const ids = classification?.projectIds || [];
  const lens = classification?.lens || 'differentiate';
  if (lens === 'subject') return speakComparisonSubject(classification);
  if (lens === 'api') {
    const spoken = speakApiContrast(ids);
    if (spoken) return spoken;
  }
  if (lens === 'differentiate' && /\bdifference between\b/i.test(String(query || '')) && !/\barchitect/i.test(String(query || ''))) {
    const spoken = speakProductDifference(ids);
    if (spoken) return spoken;
  }
  if (isConciseArchitectureContrast(query)) {
    const spoken = speakProductDifference(ids);
    if (spoken) return spoken;
  }
  if (lens === 'motivation') {
    const blocks = ids.map((id) => speakProjectMotivation(id)).filter(Boolean);
    if (blocks.length) return blocks.join('\n\n');
  }
  if (lens === 'stack') {
    const spoken = speakStackContrast(ids, query);
    if (spoken) return spoken;
  }
  if (lens === 'intent') {
    const limits = facetParagraphs(ids, 'intent', query);
    const lead = 'Improvement priorities are not documented as CODE-PROVEN design intent, so I will not invent what to build next. Documented limitations are not a chosen roadmap.';
    return [lead, ...limits].join('\n\n');
  }
  const prior = classification?.priorLens;
  const evidenceLens = lens === 'why' ? (prior && prior !== 'why' ? prior : 'model') : lens;
  const blocks = facetParagraphs(ids, evidenceLens, query);
  const lead = [];
  const t = String(query || '');
  if (lens === 'premise' || /python backend|share one api|share an api/i.test(t)) {
    lead.push('The premise that all three use Python backends is not true, so there is no shared Python API to justify.');
  }
  if (lens === 'why') {
    lead.push('That contrast is documented behavior. Why the choice was made is not CODE-PROVEN, and I will not invent a motive.');
  }
  if (lens === 'connect') {
    lead.push('What connects them is Sudhanshu shipping them inside SRIIVERSEAI. They are not one shared runtime, backend, database, API, or AI pipeline.');
  }
  if (lens === 'architecture' && /share one architecture|share an architecture|one architecture/i.test(t)) {
    lead.push('No. The inspected architectures are different stacks, not one shared five-layer runtime.');
  }
  if (/\bminilm\b/i.test(t) && /queryforge/i.test(t)) {
    lead.push('QueryForgeAI does not use MiniLM for SQL. MiniLM belongs to Placement Pro+ skill mapping.');
  }
  if (lens === 'model' && ids.includes('reporadar') && ids.includes('queryforge')) {
    lead.push('QueryForgeAI is the generative-LLM system. RepoRadarAI does not use a generative model.');
  }
  if (!blocks.length) {
    return 'I can contrast only the documented project facets, and I do not have a facet for that cross-project question yet.';
  }
  return [...lead, ...blocks].join('\n\n');
}

export function classifyReasoningStrategy(query, ctx = {}) {
  const t = String(query || '').toLowerCase().trim();
  const qType = ctx?.questionFrame?.questionType;
  const mode = ctx?.questionFrame?.conversationMode || classifyConversationMode(query);

  if (!t) return { strategy: 'Describe', task: null };

  // A statement that only mentions a technology is not a comparison and
  // not a portfolio-history question.
  if (isIncidentalTechnologyMention(query)) {
    return { strategy: 'Describe', task: 'tech_mention' };
  }

  const stackRequest = stackMembershipRequest(query);
  if (stackRequest) {
    return { strategy: 'Describe', task: 'stack_membership', ...stackRequest };
  }

  // Portfolio history is not a project implementation question. The subject
  // rides on this classification so a later elaboration can restate it
  // from the visitor's question, without a new memory field.
  const historySubject = portfolioHistorySubject(query);
  if (historySubject) {
    return { strategy: 'Describe', task: 'portfolio_history', subject: historySubject };
  }

  const conceptAlias = descriptiveConceptRequest(query);
  if (conceptAlias) {
    return { strategy: 'Describe', task: 'concept_alias', alias: conceptAlias.alias, asksList: conceptAlias.asksList === true };
  }

  // --- V4.5 Mod 1: conversational intent gate (wins over entity/FAANG misfires) ---
  if (mode === 'preference_gap') {
    return { strategy: 'Summarize', task: 'preference_gap' };
  }
  if (mode === 'challenge') {
    return { strategy: 'Critique', task: 'challenge_response' };
  }
  if (mode === 'self') {
    return { strategy: 'Critique', task: 'self_behavioral' };
  }
  if (mode === 'ops_story') {
    return { strategy: 'Explain', task: 'ops_story' };
  }
  if (mode === 'opinion') {
    return { strategy: 'Infer', task: 'opinion_take' };
  }
  if (mode === 'brief') {
    return { strategy: 'Summarize', task: 'brief_pitch' };
  }
  if (mode === 'beyond_resume') {
    return { strategy: 'Summarize', task: 'beyond_resume' };
  }
  if (mode === 'brand') {
    if (/digital brain|are you|role|something else|sudhanshu.? or|or sriiverse|relationship between/i.test(t)) {
      return { strategy: 'Summarize', task: 'role_triad' };
    }
    if (/different|typical portfolio/i.test(t)) {
      return { strategy: 'Summarize', task: 'portfolio_different' };
    }
    return { strategy: 'Summarize', task: 'brand_explain' };
  }
  if (mode === 'intro') {
    return { strategy: 'Summarize', task: 'self_intro' };
  }
  const mem = ctx?.memory;
  const boundId = mem?.lastCommitment?.projectId || mem?.lastProject || null;
  const prevTask = mem?.activeMode || mem?.lastCommitment?.task || '';
  const ppBoundEarly = boundId === 'placementpro' || /placement/i.test(String(boundId));
  const ppQueryEarly = isPlacementProQuery(t) || ppBoundEarly;
  const rrBoundEarly = boundId === 'reporadar' || /reporadar/i.test(String(boundId));
  const rrQueryEarly = isRepoRadarQuery(t) || rrBoundEarly;

  if (mode === 'probe') {
    if (/hardest/i.test(t) && ppQueryEarly) {
      return { strategy: 'Summarize', task: 'placementpro_unknown' };
    }
    if (/hardest/i.test(t) && rrQueryEarly) {
      return { strategy: 'Summarize', task: 'reporadar_unknown' };
    }
    if (/scale|qps|rps/i.test(t) && ppQueryEarly) {
      return { strategy: 'Summarize', task: 'placementpro_unknown' };
    }
    if (/failure mode/i.test(t) && ppQueryEarly) {
      return { strategy: 'Summarize', task: 'placementpro_detail', focus: 'pp-failure' };
    }
    if (/failure mode/i.test(t)) return { strategy: 'Explain', task: 'probe_failure_modes' };
    if (/scale|qps|rps/i.test(t)) return { strategy: 'Explain', task: 'probe_scale' };
    if (/complexity/i.test(t)) return { strategy: 'Explain', task: 'probe_complexity' };
    if (/hardest/i.test(t)) return { strategy: 'Explain', task: 'probe_hardest' };
    return { strategy: 'Explain', task: 'probe_failure_modes' };
  }

  // An elaboration refers to the previous answer. The project and subject
  // come from the visitor's earlier question, not from assistant text and
  // not from the visible card. No separate memory field is required.
  if (!ctx.resolvingPrior && isElaborationRequest(query)) {
    const pending = pendingProjectCommitment(ctx);
    if (pending) {
      return { strategy: 'Summarize', task: 'context_clarify', aspect: pending.aspect || null };
    }
    if (boundCrossProjectIds(ctx).length >= 2) {
      // "Tell me more" after an explicit subject stays on that subject.
      // It must not replace a missing record with the product overview.
      const prior = priorSubstantiveVisitorQuery(mem, query);
      const priorRank = prior
        ? classifyReasoningStrategy(prior, {
          ...ctx,
          resolvingPrior: true,
          memory: mem,
          questionFrame: buildQuestionFrame(prior, { memory: mem }),
        })
        : null;
      if (['keep_two', 'best_engineering', 'justify_best_project', 'why_hire', 'demo_ai', 'engineer_type', 'arch_why'].includes(priorRank?.task)) {
        return { ...priorRank, elaborate: true, priorQuery: prior };
      }
      const historySubject = portfolioHistorySubject(prior || '');
      if (historySubject) {
        return { strategy: 'Describe', task: 'portfolio_history', subject: historySubject, elaborate: true };
      }
      const conceptAlias = descriptiveConceptRequest(prior || '');
      if (conceptAlias) {
        return { strategy: 'Describe', task: 'concept_alias', alias: conceptAlias.alias, asksList: conceptAlias.asksList === true, elaborate: true };
      }
      const priorConcept = documentedConceptInQuery(prior || '');
      if (priorConcept) {
        const priorClass = classifyReasoningStrategy(prior, {
          ...ctx,
          resolvingPrior: true,
          memory: mem,
          questionFrame: buildQuestionFrame(prior, { memory: mem }),
        });
        if (priorClass?.projectIds?.length >= 2) return { ...priorClass, elaborate: true };
      }
      const subject = explicitComparisonSubject(prior || '');
      if (subject) {
        const priorClass = classifyReasoningStrategy(prior, {
          ...ctx,
          resolvingPrior: true,
          memory: mem,
          questionFrame: buildQuestionFrame(prior, { memory: mem }),
        });
        if (priorClass?.lens === 'subject' && priorClass.projectIds?.length >= 2) {
          return { ...priorClass, elaborate: true };
        }
      }
      return { strategy: 'Summarize', task: 'why_clarify', comparisonElaboration: true };
    }
    const prior = priorSubstantiveVisitorQuery(mem, query);
    if (!prior) return { strategy: 'Describe', task: null };
    const priorClass = classifyReasoningStrategy(prior, {
      ...ctx,
      resolvingPrior: true,
      memory: mem,
      questionFrame: buildQuestionFrame(prior, { memory: mem, focusProject: boundId }),
    });
    if (priorClass.task === 'portfolio_history' && priorClass.subject) {
      return { ...priorClass, elaborate: true };
    }
    if (priorClass.task === 'concept_alias' && priorClass.alias) {
      return { ...priorClass, elaborate: true };
    }
    if (priorClass.task === 'project_stack_evidence' || priorClass.task === 'project_alias_record') {
      return { ...priorClass, elaborate: true };
    }
    if (priorClass.task === 'stack_membership') {
      return { ...priorClass, elaborate: true };
    }
    if (priorClass.task === 'concept_record' && priorClass.concept) {
      return { ...priorClass, elaborate: true };
    }
    if (!priorClass?.task || priorClass.task === 'context_clarify' || priorClass.task === 'why_clarify') {
      return { strategy: 'Describe', task: null };
    }
    if (priorClass.projectIds?.length >= 2) {
      return { strategy: 'Summarize', task: 'why_clarify', comparisonElaboration: true };
    }
    // The overview is not one facet. Offer documented facets instead of
    // reading that overview again. A project switch already spoke the
    // purpose facet, so it stays on the normal elaboration path.
    if (priorClass.task === 'project_overview') {
      const projectId = boundId && DETAIL_TASK[boundId] ? boundId : null;
      if (!projectId) return { strategy: 'Summarize', task: 'why_clarify' };
      return {
        strategy: 'Summarize',
        task: DETAIL_TASK[projectId],
        focus: ASPECT_FOCUS[projectId].switch,
        elaborate: true,
        facetMenu: true,
        priorQuery: prior,
      };
    }
    return { ...priorClass, elaborate: true, priorQuery: prior };
  }

  // A bare "Why?" after a ranking or authorship answer stays on that answer.
  // It does not adopt a visible card or invent the choice the records omit.
  if (!ctx.resolvingPrior && /^(?:and )?why$/.test(followUpRemainder(query).replace(/[^a-z0-9]+/g, ' ').trim())) {
    const priorWhy = priorSubstantiveVisitorQuery(mem, query);
    if (priorWhy) {
      const priorWhyClass = classifyReasoningStrategy(priorWhy, {
        ...ctx,
        resolvingPrior: true,
        memory: mem,
        questionFrame: buildQuestionFrame(priorWhy, { memory: mem }),
      });
      if (['keep_two', 'best_engineering', 'justify_best_project', 'why_hire', 'demo_ai', 'engineer_type', 'arch_why'].includes(priorWhyClass?.task)) {
        return { ...priorWhyClass, elaborate: true, priorQuery: priorWhy };
      }
    }
  }

  // Comparison context keeps the project set. A later "Which one?" / "Why?" / "What model?"
  // must not collapse onto a single lastProject.
  {
    const crossFollow = resolveCrossProjectQuestion(t, ctx);
    const boundSet = boundCrossProjectIds(ctx);
    if (crossFollow && boundSet.length >= 2 && (isBoundFollowUpQuery(query) || /\b(which one|what model)\b/i.test(t)) && namedCrossProjectIds(t).length < 2) {
      return {
        strategy: 'Compare',
        task: 'cross_project_compare',
        projectIds: crossFollow.ids,
        lens: crossFollow.lens,
        priorLens: crossFollow.priorLens,
        subject: crossFollow.subject || null,
        concept: crossFollow.concept || null,
      };
    }
  }

  // A pending project is still unresolved. A short how, or "what about
  // the architecture", must not be answered from the visible card.
  {
    const pending = pendingProjectCommitment(ctx);
    if (pending && namedCrossProjectIds(t).length === 0 && isSubjectHowFollowUp(query)) {
      return { strategy: 'Summarize', task: 'context_clarify', aspect: pending.aspect || null };
    }
  }

  // --- V4.5 Mod 2: bound follow-ups inherit prior commitment ---
  if (boundId && isBoundFollowUpQuery(query)) {
    const qfBound = boundId === 'queryforge' || /queryforge/i.test(String(boundId));
    const ppBound = boundId === 'placementpro' || /placement/i.test(String(boundId));
    const rrBound = boundId === 'reporadar' || /reporadar/i.test(String(boundId));

    // Enrichment appends the project name, so match the remainder.
    // A bare "Why?" refers to the previous answer. The records do not
    // establish that motive, and the purpose overview is not a reason.
    const core = followUpRemainder(query);
    if (/^(?:and )?why\??$/.test(core) || /^why does (?:it|that|this) work(?: that way)?\??$/.test(core)) {
      if (qfBound) return { strategy: 'Summarize', task: 'queryforge_unknown' };
      if (ppBound) return { strategy: 'Summarize', task: 'placementpro_unknown' };
      if (rrBound) return { strategy: 'Summarize', task: 'reporadar_unknown' };
      return { strategy: 'Summarize', task: 'why_clarify' };
    }
    // "Explain that" asks to continue the previous answer, but not which
    // part. Ask, and leave the bound project in place.
    if (/^(?:explain that|what about that|what does that mean)\??\.?$/.test(core)) {
      return { strategy: 'Summarize', task: 'why_clarify' };
    }
    // "How?" continues the previous subject. The generic flow facet is only
    // the mechanism of a project overview, not of a database or score.
    if (!ctx.resolvingPrior && isSubjectHowFollowUp(query)) {
      const prior = priorSubstantiveVisitorQuery(mem, query);
      if (prior) {
        const priorClass = classifyReasoningStrategy(prior, {
          ...ctx,
          resolvingPrior: true,
          memory: mem,
          questionFrame: buildQuestionFrame(prior, { memory: mem, focusProject: boundId }),
        });
        const priorTask = priorClass?.task || '';
        if (priorClass?.projectIds?.length >= 2) {
          return {
            strategy: 'Compare',
            task: 'cross_project_compare',
            projectIds: priorClass.projectIds,
            lens: priorClass.lens || 'differentiate',
            priorLens: priorClass.lens || null,
            subject: priorClass.subject || null,
            elaborate: priorClass.lens === 'subject',
          };
        }
        if (/_unknown$/.test(priorTask)) {
          return { ...priorClass, elaborate: true, priorQuery: prior };
        }
        if (priorClass?.focus && /_detail$/.test(priorTask) && priorClass.aspect !== 'switch') {
          return { ...priorClass, elaborate: true, priorQuery: prior };
        }
        if (priorTask === 'project_overview' || priorClass?.aspect === 'switch') {
          const flow = ASPECT_FOCUS[boundId]?.flow;
          if (flow) {
            return { strategy: 'Summarize', task: DETAIL_TASK[boundId], focus: flow, aspect: 'flow' };
          }
        }
      }
    }

    // QueryForgeAI: stay on CODE-PROVEN facets — never generic five-layer arch_why
    // (that spine still names Flask and would contradict the inspected FastAPI backend).
    if (qfBound) {
      if (isDatabaseAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'queryforge_detail', focus: 'qf-limitations', aspect: 'database' };
      }
      if (isBackendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'queryforge_detail', focus: 'qf-architecture', aspect: 'stack' };
      }
      if (isFrontendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'queryforge_detail', focus: 'qf-architecture', aspect: 'frontend' };
      }
      if (/hardest/i.test(t)) {
        return { strategy: 'Explain', task: 'probe_hardest' };
      }
      if (/improve|change|rebuild|trade-?off|why that architecture|why this architecture|why .{0,12}architecture|lessons learned|design intent/i.test(t)
        && !/\bhow (does|is|was|did)\b/i.test(t)) {
        return { strategy: 'Summarize', task: 'queryforge_unknown' };
      }
      if (/flask/i.test(t) && !/fastapi|built with|is .{0,20}flask/i.test(t)) {
        // Explicit Flask ask while on QueryForge → architecture facet (FastAPI correction).
        return { strategy: 'Summarize', task: 'queryforge_detail', focus: 'qf-architecture' };
      }

      let focus = 'qf-dataflow-overview';
      if (/optim|explain\s*analyze|\/analyze|execution plan/i.test(t)) {
        focus = 'qf-dataflow-optimizer';
      } else if (/generat|schema_def|\bschema\b|natural.?language|sql from|final sql/i.test(t)) {
        focus = 'qf-dataflow-generator';
      } else if (/architect|built|designed|structured|tech stack|\bstack\b|fastapi|uvicorn|netlify|render|flask/i.test(t)) {
        focus = 'qf-architecture';
      } else if (/how\b|how does|how did|how is|work\??$/i.test(t)) {
        focus = 'qf-dataflow-overview';
      }

      if (/how\b|how does|how did|how is|work\??$|architect|built|designed|structured|generat|optim|schema|fastapi|stack|explain\s*analyze|\/analyze/i.test(t)) {
        return { strategy: 'Summarize', task: 'queryforge_detail', focus, aspect: aspectForBoundFocus(query, focus) };
      }
    }

    if (ppBound) {
      if (isDatabaseAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'placementpro_detail', focus: 'pp-database', aspect: 'database' };
      }
      if (isBackendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'placementpro_detail', focus: 'pp-architecture', aspect: 'stack' };
      }
      if (isFrontendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'placementpro_detail', focus: 'pp-architecture', aspect: 'frontend' };
      }
      if (/hardest/i.test(t)) {
        return { strategy: 'Summarize', task: 'placementpro_unknown' };
      }
      if (/improve|change|rebuild|trade-?off|why that architecture|why this architecture|why .{0,12}architecture|lessons learned|design intent|why (did|do) you choose|why that\??$|why flask|why minilm|why networkx/i.test(t)
        && !/\bhow (does|is|was|did)\b/i.test(t)) {
        return { strategy: 'Summarize', task: 'placementpro_unknown' };
      }

      let focus = 'pp-architecture';
      if (/roadmap|generat/i.test(t)) {
        focus = 'pp-roadmap';
      } else if (/model|minilm|llm|embedding|sentence.?transform/i.test(t)) {
        focus = 'pp-ai-model';
      } else if (/skill.?gap|graph|shortest|missing skill/i.test(t)) {
        focus = 'pp-skill-gap';
      } else if (/auth|jwt|login|register|token/i.test(t)) {
        focus = 'pp-auth';
      } else if (/database|sql|persist|postgres|sqlite/i.test(t)) {
        focus = 'pp-database';
      } else if (/compan|job.?board/i.test(t)) {
        focus = 'pp-company';
      } else if (/cache|redis/i.test(t)) {
        focus = 'pp-caching';
      } else if (/how\b|how does|how did|how is|work\??$/i.test(t)) {
        focus = 'pp-architecture';
      }

      if (/how\b|how does|how did|how is|work\??$|architect|built|designed|structured|generat|model|skill|graph|auth|database|stack|compan|cache|roadmap|minilm|llm/i.test(t)) {
        return { strategy: 'Summarize', task: 'placementpro_detail', focus, aspect: aspectForBoundFocus(query, focus) };
      }
    }

    if (rrBound) {
      if (isDatabaseAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'reporadar_detail', focus: 'rr-data-flow', aspect: 'database' };
      }
      if (isBackendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'reporadar_detail', focus: 'rr-architecture', aspect: 'stack' };
      }
      if (isFrontendAspectQuery(t)) {
        return { strategy: 'Summarize', task: 'reporadar_detail', focus: 'rr-architecture', aspect: 'frontend' };
      }
      if (/hardest/i.test(t)) {
        return { strategy: 'Summarize', task: 'reporadar_unknown' };
      }
      if (/improve|change|rebuild|trade-?off|why that architecture|why this architecture|why .{0,12}architecture|lessons learned|design intent|why (did|do) you choose|why that\??$|why next\.?js|why vercel|why octokit|why these scoring/i.test(t)
        && !/\bhow (does|is|was|did)\b/i.test(t)) {
        return { strategy: 'Summarize', task: 'reporadar_unknown' };
      }

      let focus = 'rr-user-flow';
      if (/score|health|calculated/i.test(t)) {
        focus = 'rr-scoring';
      } else if (/bus factor/i.test(t)) {
        focus = 'rr-bus-factor';
      } else if (/model|llm|gemini|rag|embedding|ai verdict/i.test(t)) {
        focus = 'rr-ai-model';
      } else if (/fetch|github|octokit|\/api\/analyze/i.test(t)) {
        focus = 'rr-github';
      } else if (/clone|ingest|source code|file/i.test(t)) {
        focus = 'rr-ingestion';
      } else if (/cache|stored|persist/i.test(t)) {
        focus = 'rr-caching';
      } else if (/architect|built|designed|structured|tech stack|\bstack\b|next\.?js|fastapi/i.test(t)) {
        focus = 'rr-architecture';
      } else if (/how\b|how does|how did|how is|work\??$/i.test(t)) {
        focus = 'rr-user-flow';
      }

      if (/how\b|how does|how did|how is|work\??$|architect|built|designed|structured|score|health|bus|fetch|github|clone|model|llm|cache|stored|stack|next|octokit|analy/i.test(t)) {
        return { strategy: 'Summarize', task: 'reporadar_detail', focus, aspect: aspectForBoundFocus(query, focus) };
      }
    }

    if (/hardest/i.test(t)) {
      return { strategy: 'Explain', task: 'probe_hardest' };
    }
    if (/flask/i.test(t)) {
      return { strategy: 'Explain', task: 'why_flask' };
    }
    if (/fastapi/i.test(t)) {
      return { strategy: 'Explain', task: 'why_fastapi' };
    }
    if (/improve|change|rebuild|trade-?off/i.test(t)) {
      return { strategy: 'Explain', task: 'arch_tradeoffs' };
    }
    if (/architect|why that architecture|why this architecture|why .{0,12}architecture/i.test(t)) {
      return { strategy: 'Explain', task: 'arch_why' };
    }
    if (/how\b|how does|how did|how is|work\??$/i.test(t)) {
      return { strategy: 'Explain', task: 'arch_why' };
    }
    if (/why that|why this|so why|chose|choose/i.test(t)
      || /interview_first|recruiter_impress|best_work|faang_interview|demo_|keep_two|recommend/i.test(prevTask)) {
      return { strategy: 'Justify', task: 'followup_why_pick' };
    }
    if (/database|postgres|mongo|stack|frontend|backend/i.test(t)) {
      return { strategy: 'Explain', task: 'project_overview' };
    }
  }

  // Word-boundary on "you" — "what are your weaknesses" must not match identity
  if (/what can you do|what do you (do|offer|help with)|your capabilities|how can you help/i.test(t)) {
    return { strategy: 'Summarize', task: 'capabilities' };
  }
  if (/don'?t know|something you don'?t know|what (don'?t|do not) you know|what is something you don'?t/i.test(t)) {
    return { strategy: 'Summarize', task: 'honest_unknown' };
  }
  if (/what kind of engineer|what type of engineer|what engineer is he|what does (he|sudhanshu) (actually )?specialize|specialize in|speciali[sz]ation|backend-leaning/i.test(t)) {
    return { strategy: 'Summarize', task: 'engineer_type' };
  }
  if (/who are you\b|what are you\b|are you (an? )?(ai|assistant|bot|chatgpt)\b/i.test(t)
    || (qType === 'Identity' && !/remember|memory|external|api|llm|how.*(work|built)|what can you do|what do you do|who is sudhanshu|tell me about sudhanshu|sriiverse|beyond|role|don'?t know|kind of engineer|type of engineer|specialize/i.test(t))) {
    return { strategy: 'Summarize', task: 'identity' };
  }
  if (/are you sudhanshu|sudhanshu,? sriiverse|sriiverse.? or something|or something else|what (is|are) your role|role inside/i.test(t)) {
    return { strategy: 'Summarize', task: 'role_triad' };
  }
  if (/what is sriiverse|what is sriiverseai|what do you (actually )?know about sriiverse/i.test(t)
    || (entitiesHasBrand(ctx) && /what is|tell me about|know about|does he know|do you know/i.test(t))) {
    return { strategy: 'Summarize', task: 'brand_explain' };
  }
  if (/beyond (his |the |what'?s .{0,20})?resume|person behind|meeting the person|don'?t want to see .{0,24}resume|how does he approach|what does he care|makes (his )?projects interesting/i.test(t)) {
    return { strategy: 'Summarize', task: 'beyond_resume' };
  }
  if ((/how (do|does) (you|the assistant|this) work|are you (calling|using).*(api|llm)|external api|retrieval|embedding|knowledge base/i.test(t))
    && !isQueryForgeQuery(t) && !isPlacementProQuery(t) && !isRepoRadarQuery(t)) {
    return { strategy: 'Explain', task: 'assistant_mechanism' };
  }

  if (/weakest|weak area|biggest weakness|limitation|where could (he|sudhanshu) improve|what.*(lack|missing (?!skill))|areas? (to|for) improve/i.test(t)
    || (/improve/i.test(t) && /where|what|area/i.test(t))) {
    const crossIntent = resolveCrossProjectQuestion(t, ctx);
    if (!isPlacementProQuery(t) && !isQueryForgeQuery(t) && !isRepoRadarQuery(t) && crossIntent?.lens !== 'intent') {
      return { strategy: 'Critique', task: 'weakest_area' };
    }
  }
  if (/learn next|should (he|sudhanshu) learn|gaps to (close|fill)|should i learn|what should i learn|build systems like this/i.test(t)) {
    return { strategy: 'Critique', task: 'learn_next' };
  }

  if (/why (is|was) (queryforge|reporadar|placement).*(best|strongest)|why .* best project/i.test(t)) {
    return { strategy: 'Justify', task: 'justify_best_project' };
  }
  if (/strongest engineering decision|best engineering decision/i.test(t)) {
    return { strategy: 'Justify', task: 'strongest_decision' };
  }
  if (/why (should (?:i|we|you) )?hire|why hire/i.test(t)) {
    return { strategy: 'Justify', task: 'why_hire' };
  }

  // Interview / impress framing — not employment claims (those are preference_gap above)
  if (/faang|big tech|tier-?1|impress.*(interviewer|hiring|faang)|(google|meta|amazon|apple|netflix).{0,24}interview|interview.{0,24}(google|meta|amazon|apple|netflix|faang)|project for (a )?(google|faang|big tech)/i.test(t)) {
    return { strategy: 'Recommend', task: 'faang_interview', focus: 'softwareEngineering' };
  }
  if (/impress (a )?recruiter|recruiter.*(impress|show|see first)|show (a )?recruiter/i.test(t)) {
    return { strategy: 'Recommend', task: 'recruiter_impress', focus: 'recruiterImpact' };
  }
  if (/keep (only )?two|only (keep )?two|remove.*(if|one)|could only keep|top two projects/i.test(t)) {
    return { strategy: 'Rank', task: 'keep_two', focus: 'softwareEngineering' };
  }
  if (/best software engineering|strongest software engineering|shows? the best (software )?engineering|most engineering(?! decision)/i.test(t)) {
    return { strategy: 'Rank', task: 'best_engineering', focus: 'softwareEngineering' };
  }
  if (/best (work|project)|strongest project|favorite project|most impressive project/i.test(t)) {
    return { strategy: 'Recommend', task: 'best_work', focus: 'recruiterImpact' };
  }
  if (/most (technically )?(difficult|complex|challenging)|hardest project/i.test(t)) {
    return { strategy: 'Rank', task: 'most_difficult', focus: 'complexity' };
  }
  if (/show first|see first|look at first|check out first|start with|interview first|open with|lead with|demo first|should i (see|demo|open|look|check|start)/i.test(t)
    || /which project should i (look at|see|check|start|open|demo)/i.test(t)
    || /which project.*(first|start with)/i.test(t)
    || /project should i (look at|see).*(first|why)/i.test(t)) {
    return { strategy: 'Recommend', task: 'interview_first', focus: 'recruiterImpact' };
  }
  if (/demonstrat\w* backend|best.*(for )?backend|backend engineering (the )?most|most.*backend/i.test(t)) {
    return { strategy: 'Recommend', task: 'demo_backend', focus: 'backendDepth' };
  }
  if (/demonstrat\w* (ai|llm)|best.*(for )?ai|ai engineering|most.*\bai\b|shows? the most ai/i.test(t)) {
    return { strategy: 'Rank', task: 'demo_ai', focus: 'aiUsage' };
  }
  if (/demonstrat\w* frontend|best.*(for )?frontend|most.*frontend/i.test(t)) {
    return { strategy: 'Recommend', task: 'demo_frontend', focus: 'frontendDepth' };
  }

  if (/can (he|sudhanshu|you) design (rest )?apis?|design rest|rest api (design|competenc|skill)|able to (design|build) (rest )?apis?/i.test(t)
    || /can (he|you) (build|write|create) (rest )?apis?/i.test(t)) {
    return { strategy: 'Evaluate', task: 'eval_rest_apis' };
  }
  if (/stronger (in )?(backend|frontend)|backend or frontend|frontend or backend|is he backend|is he frontend/i.test(t)) {
    return { strategy: 'Evaluate', task: 'backend_vs_frontend' };
  }
  if (/how experienced.*(docker)|know docker|docker experience|comfortable with docker|can (he|you) (use )?docker/i.test(t)) {
    return { strategy: 'Evaluate', task: 'docker_experience' };
  }
  if (/which database|strongest.*(database|db|postgres|mongo)|best.*(with )?(postgres|mongodb|database)/i.test(t)) {
    return { strategy: 'Evaluate', task: 'database_strength' };
  }
  if (/scalable backend|build a scalable|could (he|you) (build|scale)|production.?scale/i.test(t)) {
    return { strategy: 'Evaluate', task: 'scalable_backend' };
  }
  if (/ready for production|production.?ready|production work/i.test(t)) {
    return { strategy: 'Evaluate', task: 'production_ready' };
  }

  if (/fit (a |an )?(startup|early.?stage)|startup (fit|engineer)|early.?stage|would he (fit|thrive) (at |in )?(a )?(startup|early)/i.test(t)) {
    return { strategy: 'Infer', task: 'startup_fit' };
  }
  if (/fit (a |an )?backend|backend team|would he (fit|belong).*(backend|platform)/i.test(t)) {
    return { strategy: 'Infer', task: 'backend_team_fit' };
  }
  if (/product-?oriented|more product|product engineer|product.?minded/i.test(t)) {
    return { strategy: 'Infer', task: 'product_oriented' };
  }

  {
    const cross = resolveCrossProjectQuestion(t, ctx);
    if (cross) {
      return {
        strategy: 'Compare',
        task: 'cross_project_compare',
        projectIds: cross.ids,
        lens: cross.lens,
        priorLens: cross.priorLens,
        subject: cross.subject || null,
        concept: cross.concept || null,
      };
    }
  }

  // Aspect (stack, motivation, architecture, API) before facet paste and
  // before the portfolio five-layer fallback. Two named projects already
  // returned above with a dimension-specific lens.
  {
    const aspectRoute = routeNamedProjectAspect(t);
    if (aspectRoute) return aspectRoute;
  }

  {
    const pendingChoice = routePendingProjectChoice(t, ctx);
    if (pendingChoice) return pendingChoice;
  }

  // A move that only names the next project, with no new question.
  // Pending clarification is handled above so it keeps its aspect.
  {
    const choice = bareProjectChoice(t);
    if (choice && !pendingProjectCommitment(ctx)) {
      return {
        strategy: 'Summarize',
        task: DETAIL_TASK[choice],
        focus: ASPECT_FOCUS[choice].switch,
        aspect: 'switch',
      };
    }
  }

  // Naming a project inside a story is not a selection. Keep a pending
  // clarification, and do not replace an established project or comparison.
  if (isIncidentalProjectMention(t)) {
    const pending = pendingProjectCommitment(ctx);
    if (pending) {
      return { strategy: 'Summarize', task: 'context_clarify', aspect: pending.aspect || null };
    }
    return { strategy: 'Describe', task: null };
  }

  // "That one" / "the second one" during a clarification has no project to
  // bind, and the visible card is not that project.
  {
    const pending = pendingProjectCommitment(ctx);
    if (pending && isUnresolvedProjectPointer(t)) {
      return { strategy: 'Summarize', task: 'context_clarify', aspect: pending.aspect || null };
    }
  }

  // "Is JavaScript listed in Placement Pro+'s stack?" is list membership.
  // A stack facet title or cue must not turn that into the architecture writeup.
  {
    const namedTechProjects = namedCrossProjectIds(t);
    const explicitTech = matchAnswerTechNames(query);
    const asksList = /\bstack\b/.test(t) && /\b(?:listed|list|include|includes|including)\b/.test(t);
    if (namedTechProjects.length === 1 && explicitTech.length === 1 && asksList && isPortfolioOrProjectStackName(explicitTech[0])) {
      return {
        strategy: 'Summarize',
        task: 'project_stack_evidence',
        projectId: namedTechProjects[0],
        technology: explicitTech[0],
        asksList: true,
      };
    }
  }

  // Authentication and API errors are not the generic API surface.
  // A full facet title wins over a cue word that happens to sit inside it.
  {
    const authentication = routeAuthenticationAsk(t, ctx);
    if (authentication) return authentication;
    const apiFailure = routeApiFailureAsk(t, ctx);
    if (apiFailure) return apiFailure;
    const titled = routeTitledFacet(t, ctx);
    if (titled) return titled;
  }

  // QueryForge CODE-PROVEN facets / explicit unknowns — before generic why_* only when
  // the query is QueryForge-scoped (or a QF-unique engineering cue).
  {
    const facet = matchQueryForgeFacet(t);
    const designIntent = /why .{0,48}(fastapi|flask|gemini|groq|netlify|render).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(fastapi|flask|gemini|netlify|render)\b|why fastapi|why gemini|why netlify|why render/i.test(t)
      || (isQueryForgeQuery(t) && /why (was|is|did).{0,40} chosen|hardest engineering|lessons learned|what would you improve about queryforge|design intent/i.test(t));

    if (facet?.confidence === 'unknown' || (designIntent && isQueryForgeQuery(t))) {
      return { strategy: 'Summarize', task: 'queryforge_unknown' };
    }
    if (facet && facet.confidence === 'documented') {
      return { strategy: 'Summarize', task: 'queryforge_detail', focus: facet.id };
    }
  }

  {
    const facet = matchPlacementProFacet(t);
    const otherProjectBound = boundId
      && boundId !== 'placementpro'
      && !/placement/i.test(String(boundId))
      && !isPlacementProQuery(t);
    const stealAuth = otherProjectBound && isStandalonePlacementAuthQuery(t);
    const designIntent = /why .{0,48}(flask|minilm|networkx|netlify|render|huggingface).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(flask|minilm|networkx|netlify|render)\b|why flask|why minilm|why networkx/i.test(t)
      || (isPlacementProQuery(t) && /why (was|is|did).{0,40} chosen|hardest|lessons learned|what would you improve|design intent|trade-?off/i.test(t));

    if (!stealAuth && (facet?.confidence === 'unknown' || (designIntent && isPlacementProQuery(t)))) {
      return { strategy: 'Summarize', task: 'placementpro_unknown' };
    }
    if (!stealAuth && facet && facet.confidence === 'documented') {
      return { strategy: 'Summarize', task: 'placementpro_detail', focus: facet.id };
    }
    if (!stealAuth && !facet && isPlacementProQuery(t) && /\bhow\b/i.test(t) && /\bworks?\b/i.test(t)) {
      return { strategy: 'Summarize', task: 'placementpro_detail', focus: 'pp-purpose' };
    }
  }

  {
    const facet = matchRepoRadarFacet(t);
    const otherProjectBound = boundId
      && boundId !== 'reporadar'
      && !/reporadar/i.test(String(boundId))
      && !isRepoRadarQuery(t);
    const designIntent = /why .{0,48}(next\.?js|octokit|vercel|scoring|fastapi).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(next\.?js|octokit|vercel|fastapi)\b|why next\.?js|why vercel|why octokit/i.test(t)
      || (isRepoRadarQuery(t) && /why (was|is|did).{0,40} chosen|hardest|lessons learned|what did you learn|what would you improve|design intent|trade-?off/i.test(t));

    if (!otherProjectBound && (facet?.confidence === 'unknown' || (designIntent && isRepoRadarQuery(t)))) {
      return { strategy: 'Summarize', task: 'reporadar_unknown' };
    }
    if (!otherProjectBound && facet && facet.confidence === 'documented') {
      return { strategy: 'Summarize', task: 'reporadar_detail', focus: facet.id };
    }
    if (!otherProjectBound && !facet && isRepoRadarQuery(t) && /\bbuilt with\b/i.test(t)) {
      return { strategy: 'Summarize', task: 'reporadar_detail', focus: 'rr-architecture' };
    }
  }

  if (/why flask|flask instead of fastapi|prefer flask|chose flask|keep flask|kept flask/i.test(t)) {
    return { strategy: 'Explain', task: 'why_flask' };
  }
  if (/why fastapi|fastapi instead of flask|prefer fastapi|chose fastapi/i.test(t)) {
    return { strategy: 'Explain', task: 'why_fastapi' };
  }
  if (/why react|chose react|prefer react/i.test(t)) {
    return { strategy: 'Explain', task: 'why_react' };
  }
  if (/why (postgres|postgresql)|chose postgres|prefer postgres/i.test(t)) {
    return { strategy: 'Explain', task: 'why_postgres' };
  }
  if (/why (was )?(this |the )?architecture|why.*(chosen|choose|designed)/i.test(t) && /architect|layer|system|design|built/i.test(t)) {
    return { strategy: 'Explain', task: 'arch_why' };
  }
  if (/trade-?offs?|what would you (improve|change|rebuild)|would you (improve|change|rebuild)|if you rebuilt|rebuild .{0,24}differently/i.test(t)) {
    return { strategy: 'Explain', task: 'arch_tradeoffs' };
  }
  if (/how (do|does|would) (these |the )?projects? scale|do they scale|scalability/i.test(t)) {
    return { strategy: 'Explain', task: 'arch_scale' };
  }

  if (isRepoRadarQuery(t) && /\b(files?|source code|source files|\bast\b|clone)\b/i.test(t) && /\b(model|llm)\b/i.test(t)) {
    return { strategy: 'Summarize', task: 'reporadar_detail', focus: 'rr-ai-model', secondary: 'rr-ingestion' };
  }

  // "Is JavaScript listed in Placement Pro+'s stack?" is list membership.
  // A generic stack facet must not answer that as the architecture writeup.
  {
    const namedTechProjects = namedCrossProjectIds(t);
    const explicitTech = matchAnswerTechNames(query);
    const asksList = /\bstack\b/.test(t) && /\b(?:listed|list|include|includes|including)\b/.test(t);
    if (namedTechProjects.length === 1 && explicitTech.length === 1 && asksList && isPortfolioOrProjectStackName(explicitTech[0])) {
      return {
        strategy: 'Summarize',
        task: 'project_stack_evidence',
        projectId: namedTechProjects[0],
        technology: explicitTech[0],
        asksList: true,
      };
    }
  }

  // A named facet title, or a bound database/architecture question that
  // never repeated the project name, is not an unknown.
  {
    const explicitFacet = routeExplicitFacet(t, ctx);
    if (explicitFacet) return explicitFacet;
  }

  // An explicit technology name stays on the project facet that documents it.
  // "Does Placement Pro+ use PostgreSQL?" is that project's database record,
  // not a portfolio-wide proficiency claim and not an empty gap.
  // When no facet documents the name, a project stack list is still answerable
  // as list membership. It is not implementation or proficiency.
  {
    const namedTechProjects = namedCrossProjectIds(t);
    const explicitTech = matchAnswerTechNames(query);
    if (namedTechProjects.length === 1 && explicitTech.length === 1) {
      const facet = facetForNamedTechnology(namedTechProjects[0], explicitTech[0]);
      if (facet && DETAIL_TASK[namedTechProjects[0]]) {
        return { strategy: 'Summarize', task: DETAIL_TASK[namedTechProjects[0]], focus: facet.id };
      }
      const asksList = /\bstack\b/.test(t) && /\b(?:listed|list|include|includes|including)\b/.test(t);
      const asksUse = /\b(?:use|uses|using|built with)\b/.test(t);
      if ((asksList || asksUse) && isPortfolioOrProjectStackName(explicitTech[0])) {
        return {
          strategy: 'Summarize',
          task: 'project_stack_evidence',
          projectId: namedTechProjects[0],
          technology: explicitTech[0],
          asksList,
        };
      }
    }
  }

  // A related wording such as "ecmascript" or "gcp" is not the canonical name.
  // Keep the named project, and do not rename the wording.
  {
    const namedTechProjects = namedCrossProjectIds(t);
    const described = matchAnswerTechNames(query).length ? [] : matchDescriptiveAliases(query);
    if (namedTechProjects.length === 1 && described.length === 1) {
      const asksList = /\bstack\b/.test(t) && /\b(?:listed|list|include|includes|including)\b/.test(t);
      const asksUse = /\b(?:use|uses|using|built with)\b/.test(t);
      if (asksList || asksUse) {
        return {
          strategy: 'Summarize',
          task: 'project_alias_record',
          projectId: namedTechProjects[0],
          alias: described[0].label,
          asksList,
        };
      }
    }
  }

  // Engineering-detail without a facet, or a specific property the records do not cover.
  if (isEngineeringDetailQuery(t) || isSpecificUndocumentedProjectAsk(t) || isUnsupportedTechnologyAsk(t)) {
    return { strategy: 'Summarize', task: 'undocumented_detail' };
  }

  // Spoken project overview — only genuine overview shapes (not "explain exactly…")
  if (isGenuineProjectOverviewQuery(t)) {
    return { strategy: 'Summarize', task: 'project_overview' };
  }

  if ((/how (was|is|did) .{0,40}(built|designed|architect)/i.test(t)
    || (/how (was|is) .+ built/i.test(t) && /queryforge|reporadar|placement/i.test(t))
    || /did (?:you|he|sudhanshu) design|who designed|(?:five-layer|architecture) (?:diagram|authorship)|design(?:ed)? the (?:five-layer|architecture)/i.test(t))
    && namedCrossProjectIds(t).length === 0) {
    return { strategy: 'Explain', task: 'arch_why' };
  }

  if (/tell me about sudhanshu|who is sudhanshu|what'?s this portfolio|about this portfolio|portfolio about|introduce sudhanshu/i.test(t)
    || (qType === 'Identity' && /sudhanshu|him|his background/i.test(t))) {
    return { strategy: 'Summarize', task: 'about_sudhanshu' };
  }
  if (/makes this portfolio different|portfolio different|what'?s different|memorable|what makes .* memorable/i.test(t)) {
    return { strategy: 'Summarize', task: 'portfolio_different' };
  }
  if (/technologies appear most|most (common|used) (tech|technologies)|which tech(nologies)? (appear|show up)/i.test(t)) {
    return { strategy: 'Summarize', task: 'tech_frequency' };
  }
  if (/design philosophy|common (design|architecture) philosophy|philosophy across/i.test(t)) {
    return { strategy: 'Summarize', task: 'design_philosophy' };
  }
  if (/what kind of engineer|what type of engineer|what engineer is he/i.test(t)) {
    return { strategy: 'Summarize', task: 'engineer_type' };
  }
  if (/which role|best (role|fit)|suits him|role (fit|suit)/i.test(t)) {
    return { strategy: 'Infer', task: 'best_role' };
  }
  if (/what (are )?his strengths|his (main )?strengths|strengths\??$/i.test(t)) {
    return { strategy: 'Summarize', task: 'strengths' };
  }

  if (qType === 'Comparison' || /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b/i.test(t)) {
    return { strategy: 'Compare', task: 'compare_passthrough' };
  }

  if (qType === 'Recruiter' && /hire|fit|strength|recommend|suit|ready|engineer/i.test(t)) {
    if (/hire/.test(t)) return { strategy: 'Justify', task: 'why_hire' };
    if (/role|fit|suit/.test(t)) return { strategy: 'Infer', task: 'best_role' };
    if (/strength/.test(t)) return { strategy: 'Summarize', task: 'strengths' };
    return { strategy: 'Justify', task: 'why_hire' };
  }

  if (isGenuineProjectOverviewQuery(t)) {
    return { strategy: 'Summarize', task: 'project_overview' };
  }

  if (/^(?:and )?why\??$/i.test(t)) {
    return { strategy: 'Summarize', task: 'why_clarify' };
  }

  if (/\bwhat about\b/i.test(t)) {
    const switched = namedCrossProjectIds(t);
    if (switched.length === 1) {
      const id = switched[0];
      const explicitFacet = routeExplicitFacet(t, ctx);
      if (explicitFacet) return explicitFacet;
      const core = followUpRemainder(t).replace(/[^a-z0-9]+/g, ' ').trim();
      // "What about Placement Pro+" chooses that project. "What about
      // Kubernetes?" does not become its purpose overview.
      if (/^what about(?: it| that| this| the project)?$/.test(core)) {
        return { strategy: 'Summarize', task: DETAIL_TASK[id], focus: ASPECT_FOCUS[id].switch, aspect: 'switch' };
      }
      return { strategy: 'Summarize', task: 'undocumented_detail' };
    }
  }

  // Only "how does <project> work", not "how does <subsystem> work in <project>".
  const flowIds = namedCrossProjectIds(t);
  const projectSubject = '(?:queryforgeai|queryforge|reporadarai|reporadar|repo\\s*radar|placement\\s*pro\\+?)';
  const wholeProjectFlow = new RegExp(`\\bhow (?:does|do|did) (?:the |an? )?(?:${projectSubject})(?:\\s+actually)?\\s+works?\\b`, 'i').test(t);
  if (flowIds.length === 1 && wholeProjectFlow) {
    const id = flowIds[0];
    return { strategy: 'Summarize', task: DETAIL_TASK[id], focus: ASPECT_FOCUS[id].flow, aspect: 'flow' };
  }

  if (/\bhow (?:does|do) (?:it|this|that) work\b/i.test(t) && flowIds.length === 0) {
    return { strategy: 'Summarize', task: 'why_clarify' };
  }

  // Supported project questions whose plan would otherwise be an empty DirectAnswer.
  // A behavior the named project does not document is not its purpose overview.
  if (flowIds.length === 1 && documentedConceptInQuery(t) && !conceptFacetSentences(flowIds[0], documentedConceptInQuery(t)).length) {
    return { strategy: 'Summarize', task: 'undocumented_detail' };
  }
  if (flowIds.length === 1 && (qType === 'ProjectExplanation' || qType === 'ArchitectureExplanation')) {
    const id = flowIds[0];
    return { strategy: 'Summarize', task: DETAIL_TASK[id], focus: ASPECT_FOCUS[id].switch, aspect: 'switch' };
  }

  // A project-dependent question with no active project cannot be answered.
  if (!boundId && namedCrossProjectIds(t).length === 0 && (isBackendAspectQuery(t) || isDatabaseAspectQuery(t) || isFrontendAspectQuery(t))) {
    const aspect = isDatabaseAspectQuery(t) ? 'database' : isBackendAspectQuery(t) ? 'backend' : 'frontend';
    return { strategy: 'Summarize', task: 'context_clarify', aspect };
  }

  const architectureRoute = routeUnscopedArchitectureAsk(t, ctx);
  if (architectureRoute) return architectureRoute;

  const concept = documentedConceptInQuery(t);
  const asksWhichTools = /\b(?:what|which)\b/i.test(t)
    && /\b(?:tool|tools|strateg|approach|used|use)\b/i.test(t);
  if (concept && namedCrossProjectIds(t).length === 0 && asksWhichTools) {
    return { strategy: 'Describe', task: 'concept_record', concept };
  }

  return { strategy: 'Describe', task: null };
}

/**
 * True when the visitor is asking for implementation / engineering detail
 * rather than a product overview. Used to block overview misfires.
 */
export function isEngineeringDetailQuery(query) {
  const t = String(query || '').toLowerCase();
  if (!t.trim()) return false;
  return (
    /\bschema\b/i.test(t)
    || /\b(user input|user inputs|user provides?|what (does|do) (the )?user (have to |need to )?provide|actual user inputs?)\b/i.test(t)
    || /\breceives?\b/i.test(t)
    || /\b(request body|payload)\b/i.test(t)
    || /\b(api|endpoint)s?\b/i.test(t)
    || /\b(data flow|request flow|request\/data flow)\b/i.test(t)
    || /\bexecution\b/i.test(t)
    || /\bexplain\s+analyze\b/i.test(t)
    || /\bvalidation\b/i.test(t)
    || /\bretry\b/i.test(t)
    || /\b(database connection|connect(?:s|ed|ing)? to (a |the )?(live )?database|inspect(?:s|ed|ing)? (a |the )?(live )?database|database inspection)\b/i.test(t)
    || /\b(llm|model|prompt)\b/i.test(t)
    || /\b(failure|limitation|limitations|edge case)s?\b/i.test(t)
    || /\btrade-?offs?\b/i.test(t)
    || /\bwhy (was|were|is|are|did) .{0,40} chosen\b/i.test(t)
    || /\bhow does .{0,80} actually (work|generate|produce|build|create)\b/i.test(t)
    || /\bhow is .{0,60} generated\b/i.test(t)
    || /\bwhat happens (after|when|under|next)\b/i.test(t)
    || /\bunder the hood\b/i.test(t)
    || /\b(complete|full|end-?to-?end) (data |request )?flow\b/i.test(t)
    || /\bwalk (me )?through .{0,60}(flow|pipeline|from .{0,30}(input|user)|generat)/i.test(t)
    || /\bwhere does (the )?(database )?schema come from\b/i.test(t)
    || /\b(live database|connect to or inspect)\b/i.test(t)
    || /\b(skill.?gap|knowledge graph|minilm|networkx|cosine similarity)\b/i.test(t)
    || /\b(authentication|jwt|company matching|roadmap)\b/i.test(t)
    || /\bdoes (it|placement).{0,24}use (an? )?(llm|knowledge graph)\b/i.test(t)
    || /\b(bus factor|health score|octokit|\/api\/analyze|github rest)\b/i.test(t)
    || /\bclone (the )?(repo|repository)\b/i.test(t)
    || /\b(source code|file ingest|git clone)\b/i.test(t)
    || /\bhow is .{0,60} calculated\b/i.test(t)
    || /\bwhat does .{0,40}fetch\b/i.test(t)
    || (/\bhandle\b/i.test(t) && /queryforge|reporadar|placement/i.test(t))
    || /\brender(?:s|ed|ing)?\s+(?:the|a|an)\b/i.test(t)
  );
}

/**
 * "What is QueryForgeAI's <specific property>?" names one project and a
 * property the facet records did not match. It is not a product overview.
 */
function isSpecificUndocumentedProjectAsk(query) {
  const t = String(query || '').toLowerCase().trim();
  if (!t || namedCrossProjectIds(t).length !== 1) return false;
  if (isGenuineProjectOverviewQuery(t)) return false;
  const project = String.raw`(?:queryforgeai|queryforge|reporadarai|reporadar|repo\s*radar|placement\s*pro\+?)`;
  return new RegExp(String.raw`\b${project}['’]s\s+\S{2,}`, 'i').test(t);
}

/**
 * "Does QueryForgeAI use Kubernetes?" names a technology the records do not
 * cover. Documented yes/no technologies are classified earlier.
 */
function isUnsupportedTechnologyAsk(query) {
  const t = String(query || '').toLowerCase().trim();
  if (!t || namedCrossProjectIds(t).length !== 1) return false;
  if (isYesNoTechnologyAsk(t)) return false;
  return /^(?:is|does|did|was|are|do)\b/.test(t)
    && /\b(?:built with|use|uses|using)\b/.test(t);
}

/**
 * Overview-shaped project questions only — verb closely governing the project name.
 * Instructional "Explain exactly…" / "Describe only…" must not match.
 */
export function isGenuineProjectOverviewQuery(query) {
  const t = String(query || '').toLowerCase().trim();
  if (!t || isEngineeringDetailQuery(t)) return false;
  if (!/queryforge|reporadar|placement/i.test(t)) return false;
  if (/\b(walk (me )?through|deep dive|in detail|documentation|open (the )?project)\b/i.test(t)) {
    return false; // brochure/doc mode — leave to Describe/null → card path
  }
  const project = String.raw`(?:queryforgeai|queryforge|reporadarai|reporadar|placement\s*pro\+?)`;
  if (new RegExp(String.raw`\b(?:tell me about|what is|what's)\s+${project}\s*[?.!]*$`, 'i').test(t)) return true;
  if (new RegExp(String.raw`^(?:explain|describe)\s+${project}\b`, 'i').test(t)) return true;
  if (new RegExp(String.raw`\b(?:explain|describe)\s+${project}\b`, 'i').test(t) && t.length < 72) return true;
  return false;
}

function entitiesHasBrand(ctx) {
  const list = ctx?.entities?.entities || [];
  return list.some((e) => e.type === 'brand' || /sriiverse/i.test(String(e.canonical || '')));
}

export function mayOverrideDecline(task) {
  if (!task || task === 'compare_passthrough') return false;
  return true;
}

export function formatDecisionFirst({ conclusion, reasoning, evidence }) {
  return [conclusion, reasoning, evidence].filter((p) => p && String(p).trim()).join('\n\n');
}

/* ============================================================
   GENERIC OPERATORS
   ============================================================ */

function nm(p) {
  return p ? `**${p.name}**` : 'a shipped project';
}

function stillRecord(ctx) {
  return ctx?.classification?.elaborate ? 'That is still the record. ' : '';
}

function speak(strategy, conclusion, reasoning, evidence) {
  if (DECISION_FIRST_STRATEGIES.has(strategy)) {
    return formatDecisionFirst({ conclusion, reasoning, evidence });
  }
  return [conclusion, reasoning, evidence].filter(Boolean).join('\n\n');
}

/** Recommend: pick top project for an objective vector. */
function opRecommend(ctx, {
  weights,
  conclusionLead,
  whyLead,
  evidenceLead,
  audienceNote,
}) {
  const ranked = rankByObjective(ctx.profiles, weights);
  const pick = ranked[0];
  const rest = ranked.slice(1);
  const conclusion = typeof conclusionLead === 'function'
    ? conclusionLead(pick, ranked)
    : `${conclusionLead} ${nm(pick)}.`;
  const reasoning = typeof whyLead === 'function'
    ? whyLead(pick, ranked, ctx)
    : whyLead;
  const evidence = typeof evidenceLead === 'function'
    ? evidenceLead(pick, rest, ctx)
    : (evidenceLead || audienceNote || describeOthers(rest));
  return speak(ctx.strategy, conclusion, reasoning, evidence);
}

/** Rank: order projects; optionally keep N. */
function opRank(ctx, { weights, keep = 1, conclusionLead, whyLead, evidenceLead }) {
  const ranked = rankByObjective(ctx.profiles, weights);
  if (keep === 1) {
    return opRecommend(ctx, { weights, conclusionLead, whyLead, evidenceLead });
  }
  const top = ranked.slice(0, keep);
  const drop = ranked.slice(keep);
  const conclusion = typeof conclusionLead === 'function'
    ? conclusionLead(top, drop, ranked)
    : `I'd keep ${top.map(nm).join(' and ')}.`;
  const reasoning = typeof whyLead === 'function' ? whyLead(top, drop, ctx) : whyLead;
  const evidence = typeof evidenceLead === 'function' ? evidenceLead(top, drop, ctx) : evidenceLead;
  return speak(ctx.strategy, conclusion, reasoning, evidence);
}

function describeOthers(rest) {
  if (!rest.length) return '';
  return `${rest.map((p) => nm(p)).join(' and ')} are still worth a look depending on the role.`;
}

/** Evaluate competency from graph used_in / identity. */
function opEvaluate(ctx, { conclusion, reasoning, evidence }) {
  return speak(ctx.strategy, conclusion, reasoning, evidence);
}

/** Critique from identity strengths + growthAreas. */
function opCritique(ctx, { mode }) {
  const strengths = getIdentityClaimsByFacet('strengths', ctx.identity);

  if (mode === 'learn_next') {
    const q = String(ctx.query || '').toLowerCase();
    if (/\bi learn|should i learn|build systems like this|like (him|sudhanshu|this)\b/i.test(q)) {
      return speak(
        ctx.strategy,
        `If you want to build systems like these, learn in this order: solid Python services and REST APIs, then a real database (schema + query plans), then how to ground an LLM in actual inputs, then enough frontend to ship the product.`,
        `That path mirrors what's evidenced across QueryForgeAI, Placement Pro+, and RepoRadarAI — backend ownership first, AI as a reasoning layer, full product finish.`,
        `I won't invent a secret curriculum beyond what the portfolio shows. Pick a layer and I can point at the project that teaches it best.`,
      );
    }
    return speak(
      ctx.strategy,
      `If I keep sharpening the public signal, I'd start with clearer data-store pinning, more async/API-first depth, and stronger observability storytelling.`,
      `That doesn't invent a curriculum — it's inferred from what's present vs thin in the portfolio.`,
      `I won't invent a learning plan I never wrote down. Name a stack gap (Kubernetes, Kafka, etc.) and I'll tell you honestly whether it appears here.`,
    );
  }

  // weakest_area — short-first; no identity-export dump
  const strengthHint = strengths[0]?.statement
    ? strengths[0].statement.replace(/^Documented role focus:\s*/i, '')
    : 'shipping live backend + AI systems';
  return speak(
    ctx.strategy,
    `Relative to what's evidenced, the softest public signal is deep ops / cloud-native breadth — not core product engineering.`,
    `The strong signal is still ${strengthHint}. I wouldn't pretend Kubernetes-scale ops is what this portfolio proves.`,
    `Ask about a specific gap if you're hiring for it — I'll say whether it appears here.`,
  );
}

/** V4.5 Mod 1 — conversational-mode answers (challenge / self / opinion / gaps / probes). */
function opConversationMode(ctx, { task }) {
  const q = String(ctx.query || '').toLowerCase();
  const qf = ctx.byId('queryforge');
  const rr = ctx.byId('reporadar');
  const pp = ctx.byId('placementpro');

  if (task === 'preference_gap') {
    if (/relocat/i.test(q)) {
      return speak(ctx.strategy,
        `I don't have a relocation preference recorded in this portfolio.`,
        `What I can speak to is role fit — backend / AI platform / full-stack product engineering where shipping matters.`,
        `If location or remote policy is a hard filter, treat that as outside what this assistant can claim.`);
    }
    if (/salary|compensation|pay/i.test(q)) {
      return speak(ctx.strategy,
        `I don't publish salary expectations here.`,
        `Ask about the work instead — shipped systems, stack depth, or which project best matches the role.`);
    }
    if (/google|meta|amazon|apple|netflix|microsoft/i.test(q)) {
      return speak(ctx.strategy,
        `I haven't worked at that company — nothing in this portfolio claims that employment.`,
        `Closest signal is how I'd defend ${nm(qf)} under a FAANG-style systems loop, if that's what you're probing.`,
        `Want that interview framing, or an honest gap list against a job description?`);
    }
    if (/phd|certification|aws cert/i.test(q)) {
      return speak(ctx.strategy,
        `That isn't recorded in Sudhanshu's portfolio.`,
        `I can talk about shipped projects, architecture, stack, or production demos instead.`);
    }
    return speak(ctx.strategy,
      `That personal detail isn't in the portfolio.`,
      `Ask about projects, architecture, stack, or why hire — those I can answer from evidence.`);
  }

  if (task === 'challenge_response') {
    if (/flask/i.test(q)) {
      return speak(ctx.strategy,
        `I'd concede FastAPI is my default today for new I/O-heavy Python services — QueryForgeAI already shipped that way.`,
        `Flask stayed on ${nm(qf)} and ${nm(pp)} because orchestration clarity and an explicit request lifecycle mattered more than async throughput then.`,
        `Bad choice for a greenfield async ingestion service? Yes. Bad choice for those two ships at the time? I still defend it.`);
    }
    if (/thin wrapper|reporadar/i.test(q)) {
      return speak(ctx.strategy,
        `Fair push. The thin version of RepoRadar would stop at a stars-and-README page.`,
        `What I actually shipped is GitHub REST metadata → heuristic health/bus-factor/risk rules in a Next.js App Router app, plus a public repo you can inspect. It does not clone source or call an LLM.`,
        `If that still reads thin for your bar, say which layer you want torn apart.`);
    }
    if (/over-?engineered|five-?layer|defend/i.test(q)) {
      return speak(ctx.strategy,
        `I'd concede three apps don't need enterprise ceremony — the five-layer split is a teaching spine as much as a runtime necessity.`,
        `What I won't concede: keeping AI as a reasoning layer over real inputs, with backend owning correctness. That separation paid for itself.`,
        `If I collapsed layers tomorrow, I'd merge deploy concerns first — not AI into the UI.`);
    }
    if (/wrapping|just (an? )?llm|aren'?t you just/i.test(q)) {
      return speak(ctx.strategy,
        `If it were only a wrapper, the hard part would be the prompt string.`,
        `The real work is grounding — schema-aware SQL on ${nm(qf)}, profile-anchored graph templates on ${nm(pp)}, GitHub-metadata heuristics on ${nm(rr)}.`,
        `LLM calls are the engine; correctness against real data is the product.`);
    }
    if (/criticiz/i.test(q)) {
      const target = /reporadar/i.test(q) ? rr : /placement/i.test(q) ? pp : qf;
      return speak(ctx.strategy,
        `If I'm criticizing ${nm(target)}, I'd start with eval harnesses and observability — shipped explanation UX before enough offline checks.`,
        `Second: public docs under-pin some stack choices that the code actually uses.`,
        `The strength that survives that critique is live systems with grounded AI, not slideware.`);
    }
    return speak(ctx.strategy,
      `I'll take the challenge on the merits.`,
      `Tell me which project or decision you're attacking and I'll concede what's weak and defend what's still right.`);
  }

  if (task === 'self_behavioral') {
    if (/leadership/i.test(q)) {
      return speak(ctx.strategy,
        `Leadership here looks like owning the full ship — problem, architecture, AI grounding, and a live URL — not managing a team roster.`,
        `${nm(qf)}, ${nm(pp)}, and ${nm(rr)} each required end-to-end decisions without a larger org behind them.`,
        `If you mean people-management leadership, that isn't evidenced in this portfolio.`);
    }
    if (/disagreement/i.test(q)) {
      return speak(ctx.strategy,
        `I handle disagreement by separating taste from constraints — latency, correctness, and what we can ship this week.`,
        `In these projects that meant defending grounded AI over flashy generation, and Flask vs FastAPI based on I/O shape rather than fashion.`,
        `I don't have a corporate conflict story recorded here — only decision trade-offs you can inspect.`);
    }
    if (/code review/i.test(q)) {
      return speak(ctx.strategy,
        `I'd review for contracts and failure modes first — API shape, auth boundaries, and where the model can lie.`,
        `Style nits come last. On ${nm(rr)} that means checking the API/UI split stays honest; on ${nm(qf)}, whether SQL stays schema-grounded.`,
        `No team review transcript lives in this portfolio — that's how I'd show up if you put me on one.`);
    }
    if (/regret/i.test(q)) {
      return speak(ctx.strategy,
        `I regret under-investing in eval harnesses early on ${nm(qf)} — I shipped explanation UX before enough offline checks for bad SQL.`,
        `I'd also pin data stores per project more loudly in public docs.`,
        `Those are documentation and rigor regrets, not "I wish I hadn't shipped."`);
    }
    if (/mistake/i.test(q)) {
      return speak(ctx.strategy,
        `Early mistake: treating portfolio docs as done when stack pinning was still uneven across cards.`,
        `Another: optimizing for demo narrative before hardening observability storytelling.`,
        `Both are fixable process mistakes — the systems still shipped live.`);
    }
    return speak(ctx.strategy,
      `I can talk about ownership and trade-offs from the shipped work.`,
      `Ask about a specific soft-skill angle — disagreement, review, regret — and I'll stay honest about what's evidenced vs inferred.`);
  }

  if (task === 'ops_story') {
    if (/on-?call/i.test(q)) {
      return speak(ctx.strategy,
        `I don't have a rotating on-call history recorded in this portfolio.`,
        `What I do have is production hosting for live products — failures would show up as deploy/runtime issues on Vercel/Render-style surfaces, not a pager rotation story.`,
        `If you're hiring for SRE on-call muscle, say so — I won't invent pages I never carried.`);
    }
    return speak(ctx.strategy,
      `I don't publish a postmortem log here.`,
      `Honest production risk areas: LLM cold starts, schema drift breaking NL→SQL, and GitHub API rate limits on ${nm(rr)}.`,
      `Those are the failure classes I'd expect — not a claim that a specific outage happened.`);
  }

  if (task === 'opinion_take') {
    if (/microservice/i.test(q)) {
      return speak(ctx.strategy,
        `I haven't shipped a microservice mesh.`,
        `For these products, a modular monolith with clear service boundaries was enough. I'd split when deploy or scale ownership actually diverges.`,
        `Microservices as default fashion? Overrated. Microservices as a response to real org/scale seams? Fine.`);
    }
    if (/\brag\b|retrieval/i.test(q)) {
      return speak(ctx.strategy,
        `Retrieval-augmented generation is useful when you need grounded lookup over a corpus — overrated when people bolt it on instead of fixing product context.`,
        `My ships lean on structured grounding (schema, resume, repo) more than a classic vector-retrieval brochure.`,
        `I'd use retrieval over documents when documents are the source of truth; I wouldn't pretend every LLM feature needs it.`);
    }
    if (/typescript|worth it/i.test(q)) {
      return speak(ctx.strategy,
        `TypeScript is worth it on non-trivial UI surfaces — ${nm(rr)} uses it for a reason.`,
        `I wouldn't mandate it on every script. For product React code, the contract clarity pays for itself.`);
    }
    return speak(ctx.strategy,
      `I can give a take, scoped to what I've actually shipped.`,
      `Name the technology or pattern and I'll say whether I've used it — and what I think.`);
  }

  if (task === 'probe_failure_modes') {
    return speak(ctx.strategy,
      `Main AI-layer failure modes I'd worry about: schema drift breaking NL→SQL, overconfident rewrites, and latency under cold LLM starts.`,
      `On ${nm(qf)} the guard is treating the model as a reasoning layer over the real schema — not a blind generator — and surfacing explanations instead of silent rewrites.`,
      `${nm(rr)} adds API/rate-limit and shallow-summary failure modes; ${nm(pp)} fails when embeddings/graph mapping miss the profile skills or the caller hits the user_id/JWT identity gap.`);
  }

  if (task === 'probe_scale') {
    return speak(ctx.strategy,
      `To push toward high QPS I'd scale along existing seams: horizontalize API workers, isolate the AI reasoning path, keep the frontend a thin client.`,
      `Exact 10k QPS numbers aren't published for these ships — I won't invent SLAs.`,
      `Bottlenecks I'd expect first: LLM inference, then DB/explain plans on ${nm(qf)}, then upstream API limits on ${nm(rr)}.`);
  }

  if (task === 'probe_complexity') {
    return speak(ctx.strategy,
      `The SQL generation path isn't a closed-form algorithm with a tidy O-notation I measured end-to-end.`,
      `Cost is dominated by model inference plus schema context size; plan analysis adds DB round-trips, not fancy asymptotic tricks.`,
      `If you want complexity theater, I won't fake it — ask about grounding and failure modes instead.`);
  }

  if (task === 'probe_hardest') {
    const boundId = ctx.ctx?.memory?.lastCommitment?.projectId || ctx.ctx?.memory?.lastProject;
    const focus = (boundId && ctx.byId(boundId)) || qf;
    if (focus?.id === 'reporadar') {
      return speak(ctx.strategy,
        `That “hardest part” for ${nm(focus)} is not documented as CODE-PROVEN FACT.`,
        `I will not invent a FastAPI/LLM architecture story to fill the gap.`,
        `Ask about verified mechanics instead: Octokit GitHub REST caps, health/bus-factor formulas, in-memory cache, or what is not ingested.`,
      );
    }
    if (focus?.id === 'placementpro') {
      return speak(ctx.strategy,
        `That “hardest part” for ${nm(focus)} is not documented as CODE-PROVEN FACT.`,
        `I will not invent a resume-parsing fight or another architecture story to fill the gap.`,
        `Ask about verified mechanics instead: MiniLM mapping, the NetworkX path, template roadmaps, JWT auth, or what is not persisted.`);
    }
    return speak(ctx.strategy,
      `Hardest part on ${nm(focus)} was grounding — making SQL and explanations stay honest against a real schema, not the model call itself.`,
      `Second hardest: knowing when to stop generating and start explaining so developers learn instead of copy-pasting blind rewrites.`,
      `That's the bar that ship had to clear.`);
  }

  return null;
}

/** Infer fit from identity + patterns. */
function opInfer(ctx, { task }) {
  const patterns = getIdentityClaimsByFacet('commonPatterns', ctx.identity);
  const subject = ctx.identity.subject;
  const live = patterns.find((c) => /live URL/i.test(c.statement));
  const pp = ctx.byId('placementpro');

  if (task === 'startup_fit') {
    return [
      'The records do not establish whether Sudhanshu would fit a startup. I will not infer personal fit from the projects.',
      live?.statement
        ? `${live.statement} That is a deployment fact, not a hiring-fit conclusion.`
        : 'The records do not document a startup-fit decision.',
      'The portfolio does not document mobile, deep ML research, or infra-only SRE work. That absence is not a measured fit score.',
    ].join(' ');
  }
  if (task === 'backend_team_fit') {
    const title = subject?.title || 'the documented role title';
    return [
      'The records do not establish whether Sudhanshu would fit a backend team. I will not infer personal fit from the stack.',
      `The documented role title is ${title}. That is a role label, not a team-fit conclusion.`,
      'Backend stack membership includes Flask, FastAPI, and REST APIs. Project records document FastAPI on QueryForgeAI, Flask on Placement Pro+, and a Next.js route on RepoRadarAI. Those are implementation facts. The records do not turn them into a team-fit conclusion.',
    ].join(' ');
  }
  if (task === 'product_oriented') {
    return [
      'The records do not establish whether Sudhanshu is more product-oriented than engineering-oriented. I will not infer that identity from a project workflow.',
      `${nm(pp)} documents a student workflow: a structured profile, skill-gap analysis, and a deterministic roadmap. That is product behavior in the project record, not a personal product-preference or proficiency claim.`,
    ].join(' ');
  }
  if (task === 'best_role') {
    const title = subject?.title || 'the documented role title';
    return [
      'The records do not name a best role, and they do not establish personal strength at API design or LLM orchestration. I will not invent that ranking.',
      `The documented role title is ${title}. That is a role label.`,
      'Project records document HTTP API surfaces and model use: QueryForgeAI uses POST /generate-sql, Placement Pro+ uses Flask blueprints under /api, and RepoRadarAI does not use a generative model. Those are implementation facts, not a strength ranking.',
      'The portfolio does not document pure mobile, deep ML research, or infra-only SRE as a role.',
    ].join(' ');
  }
  return null;
}

/** Explain tech/architecture from decision records + identity + graph. */
function opExplain(ctx, { task }) {
  const layers = getArchitecturePath(ctx.graph);
  const qf = ctx.byId('queryforge');
  const pp = ctx.byId('placementpro');
  const rr = ctx.byId('reporadar');

  if (task === 'assistant_mechanism') {
    return "I run entirely in this page — I reason from Sudhanshu's portfolio content that's already here, and I don't call an external API. I stay inside what's actually in the portfolio, and I'll tell you plainly when something isn't covered.";
  }

  if (task === 'why_flask' || task === 'why_fastapi' || task === 'why_react' || task === 'why_postgres') {
    const tech = {
      why_flask: 'Flask',
      why_fastapi: 'FastAPI',
      why_react: 'React',
      why_postgres: 'PostgreSQL',
    }[task];
    const projectsUsing = ctx.profiles.filter((p) => (p.project.stack || []).includes(tech));

    if (task === 'why_postgres') {
      return [
        'I don\'t have a record of which database Sudhanshu is strongest with, and I don\'t have a decision record that selects Postgres as the default database. I will not invent either claim.',
        'PostgreSQL and MongoDB are listed in the portfolio stack. That is stack membership, not personal proficiency, and not a production deployment.',
        'Placement Pro+ documents SQLite by default and PostgreSQL when DATABASE_URL is set. Whether production actually uses Postgres is UNKNOWN.',
        'QueryForgeAI documents postgresql as a dialect the user selects, not as QueryForgeAI\'s own database.',
      ].join(' ');
    }

    const listed = projectsUsing.map(nm).join(' and ') || 'no project stack';
    const recorded = {
      why_flask: 'Placement Pro+ lists Flask on its project stack, and the knowledge record documents Flask. No decision record states a personal preference for Flask or a motive for choosing it.',
      why_fastapi: 'QueryForgeAI\'s decision record says the cloud backend is FastAPI + Uvicorn on Render. That is a recorded configuration. It does not state a personal preference or a motive.',
      why_react: 'QueryForgeAI\'s decision record says the cloud frontend is React on Netlify. Placement Pro+ and RepoRadarAI list React on their project stacks. Those are list and configuration facts, not a personal preference.',
    }[task];
    return [
      `The records do not establish a personal preference for ${tech}. I will not invent a motive.`,
      `${tech} appears as stack membership on ${listed}. A stack entry is not a preference.`,
      recorded,
    ].join(' ');
  }

  if (task === 'arch_why') {
    const path = layers.map((l) => `**${l.label}** (${l.props.sub})`).join(' → ');
    const topology = getIdentityClaimsByFacet('designPrinciples', ctx.identity)
      .find((c) => /layered topology/i.test(c.statement));
    return [
      `${stillRecord(ctx)}The records do not establish that Sudhanshu personally designed the five-layer diagram. I will not claim authorship. The portfolio teaching diagram is a five-layer summary: ${path}.`,
      topology?.statement
        ? `The diagram description says: ${topology.statement} That sentence describes the diagram. It is not a record of personal authorship. It is not a finding that ${ctx.profiles.map(nm).join(', ')} share one inspected runtime. QueryForgeAI documents a FastAPI backend. Placement Pro+ documents Flask. RepoRadarAI documents a Next.js app.`
        : `It is not a finding that ${ctx.profiles.map(nm).join(', ')} share one inspected runtime. QueryForgeAI documents a FastAPI backend. Placement Pro+ documents Flask. RepoRadarAI documents a Next.js app.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'arch_tradeoffs') {
    return [
      `The interesting trade-off of the five-layer model is operational overhead: more moving parts than a monolith, in exchange for clear ownership — especially keeping AI from becoming a blind generator.`,
      `If I rebuilt this tomorrow, I'd probably push harder on observability, per-project data-store pinning, and async/API-first patterns where I/O dominates (the direction ${nm(rr)} already took).`,
      `I won't invent a rewrite plan I never wrote down.`,
    ].join('\n\n');
  }

  if (task === 'arch_scale') {
    return [
      `I'd scale along the seams the architecture already defines: horizontalize Python API workers, keep AI as a reasoning service over real inputs, keep the frontend a thin REST client.`,
      `Live deployments show production hosting, not laptop demos. Exact QPS/SLA numbers aren't published — I won't invent them.`,
    ].join('\n\n');
  }

  return null;
}

/** Summarize from identity + graph. */
function opSummarize(ctx, { task }) {
  const subject = ctx.identity.subject;
  const strengths = getIdentityClaimsByFacet('strengths', ctx.identity);
  const philosophy = getIdentityClaimsByFacet('philosophy', ctx.identity);
  const patterns = getIdentityClaimsByFacet('commonPatterns', ctx.identity);
  const prefs = getIdentityClaimsByFacet('architecturalPrefs', ctx.identity);

  if (task === 'capabilities') {
    return [
      `I can explain Sudhanshu's projects, compare technologies, discuss architecture and trade-offs, answer recruiter questions, judge which work best demonstrates a skill, and adapt emphasis for recruiter, engineer, founder, or student conversations.`,
      `I work as his digital engineering brain — portfolio knowledge graph, decision records, and engineering identity — ${ctx.profiles.length} shipped projects, ${ctx.records.length} decision records.`,
      `If something isn't in his portfolio, I'll say so instead of guessing.`,
    ].join('\n\n');
  }

  if (task === 'brief_pitch') {
    const q = String(ctx.query || '').toLowerCase();
    if (/talking points|interview/i.test(q)) {
      return [
        `Three interview talking points:`,
        `1. ${nm(ctx.byId('queryforge'))} — schema-grounded SQL/AI, not a blind generator.`,
        `2. ${nm(ctx.byId('reporadar'))} — live full-stack demo with a public repo.`,
        `3. ${nm(ctx.byId('placementpro'))} — skill-gap matching and a deterministic roadmap, on its own stack.`,
      ].join('\n');
    }
    if (/rest|plain english/i.test(q)) {
      return [
        `REST, plainly: the UI asks the backend for data over HTTP endpoints — create, read, update, delete style contracts.`,
        `QueryForgeAI and Placement Pro+ expose Python HTTP services (FastAPI and Flask). RepoRadarAI serves GET /api/analyze from the Next.js app itself — not a Flask or FastAPI backend.`,
      ].join('\n\n');
    }
    // Describe Sudhanshu briefly — answer the ask, no contact/nav dump
    if (/sudhanshu|30.?second|60.?second|elevator|describe/i.test(q)) {
      return [
        `Sudhanshu Sinha's documented role title is ${ctx.identity.subject?.title || 'Python Backend Engineer · AI Developer · Full-Stack Engineer'}. That is a role label, not a specialization finding.`,
        'The records do not establish a backend-leaning specialization from that title.',
        `The shipped projects are ${ctx.profiles.map(nm).join(', ')}. Each has a public live URL. That is a deployment fact.`,
      ].join(' ');
    }
    return [
      `Sudhanshu Sinha — ${ctx.identity.subject?.title || 'Python backend / AI engineer'}.`,
      `He ships live AI products: ${ctx.profiles.map(nm).join(', ')}.`,
      `If you want proof fast, open a demo; if you want depth, ask why an architecture call was made.`,
    ].join('\n\n');
  }

  if (task === 'beyond_resume') {
    const ai = philosophy.find((c) => /reasoning layer/i.test(c.statement));
    const ship = philosophy.find((c) => /Ship working production|slideware/i.test(c.statement));
    return [
      `Beyond a resume line, the documented role title is ${subject?.title || 'Python Backend Engineer · AI Developer · Full-Stack Engineer'}. That is a role label, not a specialization finding.`,
      'The records do not establish a backend-leaning specialization. I will not infer one from the role title or the stack.',
      `${ai?.statement || 'AI shows up as a reasoning layer over real inputs — schemas, resumes, repositories — not as decoration.'}`,
      `${ship?.statement || 'The portfolio bias is toward shipping live products you can click, not slideware.'}`,
      `What makes the work interesting is that each product solves a concrete mess (SQL pain, placement prep chaos, opaque repos) with its own architecture.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'brand_explain') {
    return [
      `SRIIVERSEAI is Sudhanshu's engineering universe — the portfolio environment where his work, AI systems, architecture, and technical thinking live together.`,
      `It is not just another project card, and it is not a skill in a taxonomy. It is the place those shipped systems (${ctx.profiles.map(nm).join(', ')}) and the judgment behind them become explorable.`,
      `I'm the Digital Brain inside that universe: I help you understand the person and the engineering, without inventing what isn't documented.`,
    ].join('\n\n');
  }

  if (task === 'role_triad') {
    return [
      `Sudhanshu is the engineer who builds.`,
      `SRIIVERSEAI is the engineering universe where that work lives — projects, architecture, experiments, and technical judgment together.`,
      `I'm the Digital Brain inside SRIIVERSEAI: the intelligence layer that helps you explore both. I'm not Sudhanshu the person, and I'm not a fourth product competing with QueryForge or RepoRadar.`,
    ].join('\n\n');
  }

  if (task === 'honest_unknown') {
    return [
      `Plenty — and I should say so plainly.`,
      `I don't have formal education details, certifications, salary expectations, employer history outside this portfolio, or private motivations that aren't evidenced in the shipped work.`,
      `I also won't invent personality traits or metrics that aren't documented. If you ask about something outside the portfolio, I'll tell you it's not here rather than guess.`,
    ].join('\n\n');
  }

  if (task === 'undocumented_detail') {
    const q = String((ctx.classification?.elaborate && ctx.classification?.priorQuery) || ctx.query || '').toLowerCase();
    const pick = /reporadar/i.test(q) ? ctx.byId('reporadar')
      : /placement/i.test(q) ? ctx.byId('placementpro')
        : /queryforge/i.test(q) ? ctx.byId('queryforge')
          : null;
    const focus = pick ? nm(pick) : 'that project';
    return [
      `That implementation detail for ${focus} is not documented in the portfolio knowledge yet.`,
      `I can cover what's authored — purpose, features, stack, and the high-level engineering decisions on the record — but I won't invent schema sources, request/data flows, API internals, model/prompt behavior, or live-database connection behavior that isn't written down.`,
    ].join('\n\n');
  }

  if (task === 'queryforge_detail' || task === 'queryforge_unknown') {
    if (ctx.classification?.elaborate) return speakStoredElaboration(task, ctx);
    const focusedId = ctx.classification?.focus;
    const facet = (focusedId && QUERYFORGE_FACETS.find((f) => f.id === focusedId))
      || matchQueryForgeFacet(ctx.query);
    if (task === 'queryforge_unknown' || facet?.confidence === 'unknown') {
      return [
        `That design-intent detail for **QueryForgeAI** is not documented as CODE-PROVEN FACT.`,
        `I will not invent why FastAPI, Gemini, Netlify, or Render were chosen, or undocumented “hardest problem / improve next” stories.`,
        `I can answer verified mechanics instead: user inputs, /generate-sql and /analyze flows, Gemini/Groq behavior, and cloud-path limitations (no live DB, no real EXPLAIN).`,
      ].join('\n\n');
    }
    const shaped = speakFacetForAspect(task, facet, ctx.classification, ctx.query);
    if (shaped) return shaped;
    return [
      `I don't have a verified facet for that QueryForgeAI detail yet.`,
      `Ask about user inputs, generator/optimizer data flow, models, APIs, validation, failures, or cloud-path limitations.`,
    ].join('\n\n');
  }

  if (task === 'placementpro_detail' || task === 'placementpro_unknown') {
    if (ctx.classification?.elaborate) return speakStoredElaboration(task, ctx);
    const focusedId = ctx.classification?.focus;
    const facet = (focusedId && PLACEMENTPRO_FACETS.find((f) => f.id === focusedId))
      || matchPlacementProFacet(ctx.query);
    if (task === 'placementpro_unknown' || facet?.confidence === 'unknown') {
      return [
        `That design-intent detail for **Placement Pro+** is not documented as CODE-PROVEN FACT.`,
        `I will not invent why Flask, MiniLM, or NetworkX were chosen, or undocumented “hardest problem / improve next / lessons learned” stories.`,
        `I can answer verified mechanics instead: structured profile → MiniLM/graph skill-gap, deterministic 12-week templates, JWT auth, SQLite/Postgres persistence boundaries, and in-memory company matching.`,
      ].join('\n\n');
    }
    const shaped = speakFacetForAspect(task, facet, ctx.classification, ctx.query);
    if (shaped) return shaped;
    return [
      `I don't have a verified facet for that Placement Pro+ detail yet.`,
      `Ask about skill-gap, MiniLM, the NetworkX graph, roadmap templates, auth, caching, or what is not persisted.`,
    ].join('\n\n');
  }

  if (task === 'cross_project_compare') {
    return speakCrossProject(ctx.query, ctx.classification);
  }

  if (task === 'reporadar_detail' || task === 'reporadar_unknown') {
    if (ctx.classification?.elaborate) return speakStoredElaboration(task, ctx);
    const q = String(ctx.query || '');
    const secondaryId = ctx.classification?.secondary;
    if (secondaryId || (/\b(llm|model|generative)\b/i.test(q) && /\b(source|clone|\bast\b|files?)\b/i.test(q))) {
      const primary = REPORADAR_FACETS.find((f) => f.id === (ctx.classification?.focus || 'rr-ai-model'));
      const secondary = REPORADAR_FACETS.find((f) => f.id === (secondaryId || 'rr-ingestion'));
      const parts = [primary?.text, secondary?.text].filter(Boolean);
      if (parts.length) return parts.join('\n\n');
    }
    const focusedId = ctx.classification?.focus;
    const facet = (focusedId && REPORADAR_FACETS.find((f) => f.id === focusedId))
      || matchRepoRadarFacet(ctx.query);
    if (task === 'reporadar_unknown' || facet?.confidence === 'unknown') {
      return [
        `That design-intent detail for **RepoRadarAI** is not documented as CODE-PROVEN FACT.`,
        `I will not invent why Next.js, Octokit, Vercel, or these scoring formulas were chosen, or undocumented “hardest problem / improve next” stories.`,
        `The inspected implementation is Next.js 14 + GitHub REST + heuristics — not FastAPI, not an LLM. I can answer verified mechanics instead: URL ingest, Octokit caps, health/bus-factor formulas, cache, and failure modes.`,
      ].join('\n\n');
    }
    const shaped = speakFacetForAspect(task, facet, ctx.classification, ctx.query);
    if (shaped) return shaped;
    return [
      `I don't have a verified facet for that RepoRadarAI detail yet.`,
      `Ask about ingestion, GitHub REST calls, health scoring, bus factor, caching, or what the product does not do (clone, LLM, source architecture).`,
    ].join('\n\n');
  }

  if (task === 'self_intro') {
    const subject = ctx.identity.subject;
    return [
      `I'm ${subject?.name || 'Sudhanshu Sinha'} — a ${subject?.title || 'Python backend engineer and AI developer'}.`,
      `I build and ship production AI systems end to end: ${ctx.profiles.map(nm).join(', ')}.`,
      `Center of gravity is backend correctness and applied AI — models that reason over real data, not demos that invent product behavior.`,
      `If you want proof fast, start with a live project; if you want depth, ask me why I made the architecture and stack calls I did.`,
    ].join('\n\n');
  }

  if (task === 'project_overview') {
    const q = String(ctx.query || '').toLowerCase();
    const pick = /reporadar/i.test(q) ? ctx.byId('reporadar')
      : /placement/i.test(q) ? ctx.byId('placementpro')
        : ctx.byId('queryforge');
    const p = pick || ctx.profiles[0];
    const tagline = p?.tagline || p?.project?.tagline || 'a shipped production system';
    const decision = (p?.decisions || p?.project?.decisions || [])[0]
      || 'AI is treated as a reasoning layer over real inputs, with the backend owning correctness.';
    return [
      `${nm(p)} — ${tagline.replace(/\.$/, '')}.`,
      decision,
      `I built it to solve a concrete problem — not as a slide-deck prototype — and it's live if you want to poke at it.`,
      `Ask if you want architecture, trade-offs, or a full walkthrough.`,
    ].join('\n\n');
  }

  if (task === 'identity') {
    return [
      `I'm the Digital Brain of SRIIVERSEAI — Sudhanshu Sinha's engineering universe.`,
      `I can walk you through his shipped work the way an engineer would: projects as systems, architecture calls, stack trade-offs, and where the portfolio is honest about gaps.`,
      `Ask about a project, how something was built, or who Sudhanshu is beyond a resume line — I'll stay inside what's actually evidenced.`,
    ].join('\n\n');
  }

  if (task === 'portfolio_different') {
    const ship = philosophy.find((c) => /Ship working production|slideware/i.test(c.statement));
    const ai = philosophy.find((c) => /reasoning layer/i.test(c.statement));
    return [
      `A typical portfolio is a gallery of cards. SRIIVERSEAI is closer to an engineering environment — live systems and a Digital Brain that can reason about the work.`,
      `${ai?.statement || 'AI is treated as a reasoning layer over real data.'} ${ship?.statement || 'The bias is toward shipping production software, not screenshots.'}`.trim(),
      `You can click demos, then ask why a decision was made. That's the difference.`,
    ].join('\n\n');
  }

  if (task === 'about_sudhanshu') {
    return [
      `${subject?.name || 'Sudhanshu Sinha'} is a ${subject?.title || 'software engineer'}. ${subject?.tagline || ''}`.trim(),
      `The shipped projects are ${ctx.profiles.map(nm).join(', ')}. Each has a public live URL. That is a deployment fact, not a specialization finding.`,
      'The records do not establish a backend-leaning specialization. I will not infer one from the role title or the stack.',
    ].join('\n\n');
  }

  if (task === 'tech_frequency') {
    const univ = patterns.filter((c) => /core stack constant|Shared stack pattern/i.test(c.statement));
    return [
      `What shows up most across my shipped projects:`,
      univ.map((c) => `- ${c.statement}`).join('\n') || patterns.slice(0, 5).map((c) => `- ${c.statement}`).join('\n'),
      `Portfolio-wide I also list databases and deploy tools at the STACK/architecture layer even when a given project's public stack card is thinner.`,
    ].join('\n\n');
  }

  if (task === 'design_philosophy') {
    const design = getIdentityClaimsByFacet('designPrinciples', ctx.identity);
    return [
      `My design philosophy is simple: **clear layer ownership, AI grounded in real inputs, ship the whole product.**`,
      design[0]?.statement || philosophy[0]?.statement || '',
      `The five-layer diagram is a teaching spine. ${ctx.profiles.map(nm).join(', ')} do not share one inspected runtime.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'engineer_type') {
    return [
      `${stillRecord(ctx)}The records do not establish a specialization beyond the documented role title. I will not infer a backend-leaning specialty from the stack. The documented role title is ${subject?.title || 'Python Backend Engineer · AI Developer · Full-Stack Engineer'}. That is a role label, not a proficiency measurement. Backend stack membership includes Flask, FastAPI, and REST APIs. Frontend stack membership includes React, Next.js, Zustand, and TailwindCSS. Membership is not proficiency. Project records document FastAPI on QueryForgeAI, Flask on Placement Pro+, and a Next.js route on RepoRadarAI.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'strengths') {
    return [
      `Strengths I can actually defend from the portfolio:`,
      ...strengths.slice(0, 4).map((c) => `- ${c.statement}`),
    ].join('\n\n');
  }

  return null;
}

/** Justify hire / decisions from identity + recommend operator. */
function opJustify(ctx, { task }) {
  if (task === 'justify_best_project' || task === 'best_engineering') {
    return [
      `${stillRecord(ctx)}The records do not establish which project shows the best or strongest software engineering. I will not choose one. QueryForgeAI documents FastAPI, schema-aware SQL generation, and a public live URL. Placement Pro+ documents Flask, a structured profile, and a deterministic roadmap. RepoRadarAI documents a Next.js app, GET /api/analyze, and a public repository. Those are implementation and deployment facts, not a ranking.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'strongest_decision') {
    const phil = getIdentityClaimsByFacet('philosophy', ctx.identity)
      .find((c) => /reasoning layer/i.test(c.statement));
    return [
      'The records do not rank one engineering decision as the strongest. I will not invent that ranking.',
      phil?.statement
        ? `The portfolio summary describes this theme: ${phil.statement} That summary is not a decision record that names the theme the strongest decision, and it is not a proficiency claim.`
        : 'No decision record names a strongest decision.',
    ].join(' ');
  }

  if (task === 'why_hire') {
    return [
      `${stillRecord(ctx)}The records do not establish a personal hiring recommendation. I will not treat shipped work as proof of hiring merit. What they document: ${ctx.profiles.map(nm).join(', ')} each have a public live URL. That is a deployment fact. QueryForgeAI documents FastAPI and POST /generate-sql. Placement Pro+ documents Flask and a structured profile. RepoRadarAI documents GET /api/analyze and does not use a generative model.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'followup_why_pick') {
    const boundId = ctx.ctx?.memory?.lastCommitment?.projectId
      || ctx.ctx?.memory?.lastProject
      || null;
    const pick = (boundId && ctx.byId(boundId)) || ctx.byId('reporadar') || ctx.profiles[0];
    const prev = ctx.ctx?.memory?.activeMode || ctx.ctx?.memory?.lastCommitment?.task || '';
    let why;
    if (/faang/i.test(prev)) {
      why = `That pick rewards systems thinking under interview pressure — ${nm(pick)} is where the architecture and trade-offs are easiest to probe.`;
    } else if (/interview_first|recruiter|best_work/i.test(prev)) {
      why = `You can open a live demo${pick?.project?.repo ? ' and the public repo' : ''} in the same breath — API/UI split is easy to walk without a long setup.`;
    } else {
      return [
        `The project records do not establish why that choice was made.`,
        `I will not infer a personal motive that is not written down.`,
      ].join('\n\n');
    }
    return speak(
      ctx.strategy,
      `The previous answer selected ${nm(pick)} by the criterion already stated.`,
      why,
      `I will not add a personal motive that the project records do not establish.`,
    );
  }

  return null;
}

/* ============================================================
   SYNTHESIZE — operator dispatcher (no project-id case tables)
   ============================================================ */

const COMPARISON_EXPANSIONS = [
  { lens: 'architecture', record: 'architecture', option: 'architecture' },
  { lens: 'storage', record: 'database', option: 'the database' },
  { lens: 'api', record: 'API', option: 'the API' },
  { lens: 'model', record: 'model', option: 'what model each one uses' },
];

function joinComparisonOptions(options) {
  if (options.length <= 1) return options[0] || '';
  if (options.length === 2) return `${options[0]} or ${options[1]}`;
  return `${options.slice(0, -1).join(', ')}, or ${options[options.length - 1]}`;
}

function comparisonLensPromptSpoken(memory) {
  return (memory?.turns || []).some((turn) => (
    turn.role === 'assistant' && /which of those should I expand\?/i.test(turn.text || '')
  ));
}

function comparisonRecordSpoken(memory, record) {
  const phrase = `that ${record} comparison is the full documented record`;
  return (memory?.turns || []).some((turn) => (
    turn.role === 'assistant' && String(turn.text || '').toLowerCase().includes(phrase)
  ));
}

/**
 * A repeated elaboration already has the lens question in the transcript.
 * A selected lens is the commitment recorded when the visitor named one.
 * Neither fact needs a new memory field.
 */
function speakComparisonElaboration(ctx) {
  const chosen = COMPARISON_EXPANSIONS.find((item) => item.lens === ctx?.memory?.lastCommitment?.lens);
  const memory = ctx?.memory;
  if (chosen) {
    const rest = COMPARISON_EXPANSIONS.filter((item) => item !== chosen).map((item) => item.option);
    if (comparisonRecordSpoken(memory, chosen.record)) {
      return `I will keep both projects. That choice is still open: ${joinComparisonOptions(rest)}. Which of those should I expand?`;
    }
    return `I will keep both projects. That ${chosen.record} comparison is the full documented record, and I will not invent a further difference. I can still expand ${joinComparisonOptions(rest)}. Which of those should I expand?`;
  }
  if (comparisonLensPromptSpoken(memory)) {
    return 'I will keep both projects. That choice is still open: architecture, the database, the API, or what model each one uses. Which of those should I expand?';
  }
  return 'I will keep both projects. I can expand this comparison on architecture, the database, the API, or what model each one uses. Which of those should I expand?';
}

export function synthesizeReasoning(classification, query, ctx = {}) {
  const task = classification?.task;
  if (!task || task === 'compare_passthrough') return null;
  if (task === 'why_clarify') {
    if (classification?.comparisonElaboration) return speakComparisonElaboration(ctx);
    return [
      'Which decision should I explain?',
      'Name the project, or say whether you mean why it exists, why the architecture is shaped that way, or why a technology was chosen.',
      'I will only use a reason the project records actually establish.',
    ].join(' ');
  }
  if (task === 'context_clarify') {
    return 'Which project do you mean? QueryForgeAI, Placement Pro+, or RepoRadar?';
  }
  if (task === 'tech_mention') return speakIncidentalTechnologyMention(query, ctx);
  if (task === 'portfolio_history') {
    return portfolioTechnologyNote(classification.subject, { elaborate: classification.elaborate === true });
  }
  if (task === 'stack_membership') {
    return classification.inventory
      ? speakStackInventory({ elaborate: classification.elaborate === true })
      : speakStackMembership(classification.subject, { elaborate: classification.elaborate === true });
  }
  if (task === 'concept_record') return speakConceptRecord(classification);
  if (task === 'concept_alias') return speakConceptAlias(classification);
  if (task === 'project_stack_evidence') return speakProjectStackEvidence(classification);
  if (task === 'project_alias_record') return speakProjectAliasRecord(classification);

  const graph = getEngineeringGraph();
  const records = getDecisionRecords(graph);
  const identity = getEngineeringIdentity(graph, records);
  const profiles = buildProjectProfiles(graph);
  const byId = (id) => profiles.find((p) => p.id === id);
  const strategy = classification.strategy || 'Answer';

  const opCtx = {
    graph, records, identity, profiles, byId, strategy, query, ctx,
    classification,
  };

  // --- Summarize / identity ---
  if (['capabilities', 'identity', 'about_sudhanshu', 'portfolio_different', 'tech_frequency', 'design_philosophy', 'engineer_type', 'strengths', 'brief_pitch', 'self_intro', 'project_overview', 'preference_gap', 'beyond_resume', 'brand_explain', 'role_triad', 'honest_unknown', 'undocumented_detail', 'queryforge_detail', 'queryforge_unknown', 'placementpro_detail', 'placementpro_unknown', 'reporadar_detail', 'reporadar_unknown', 'cross_project_compare'].includes(task)) {
    if (task === 'preference_gap') return opConversationMode(opCtx, { task });
    return opSummarize(opCtx, { task });
  }

  // --- Critique ---
  if (task === 'weakest_area' || task === 'learn_next') {
    return opCritique(opCtx, { mode: task });
  }

  // --- V4.5 Mod 1 conversational modes ---
  if (['preference_gap', 'challenge_response', 'self_behavioral', 'ops_story', 'opinion_take',
    'probe_failure_modes', 'probe_scale', 'probe_complexity', 'probe_hardest'].includes(task)) {
    return opConversationMode(opCtx, { task });
  }

  // --- Infer ---
  if (['startup_fit', 'backend_team_fit', 'product_oriented', 'best_role'].includes(task)) {
    return opInfer(opCtx, { task });
  }

  // --- Explain ---
  if (['assistant_mechanism', 'why_flask', 'why_fastapi', 'why_react', 'why_postgres', 'arch_why', 'arch_tradeoffs', 'arch_scale'].includes(task)) {
    return opExplain(opCtx, { task });
  }

  // --- Justify ---
  if (['why_hire', 'strongest_decision', 'justify_best_project', 'followup_why_pick'].includes(task)) {
    return opJustify(opCtx, { task });
  }

  // --- Recommend / Rank via objective vectors ---
  if (task === 'faang_interview') {
    const qf = byId('queryforge');
    const rr = byId('reporadar');
    const pp = byId('placementpro');
    return opRecommend(opCtx, {
      weights: TASK_OBJECTIVES.faang_interview,
      conclusionLead: (pick) => `I'd put ${nm(pick)} in front of a FAANG-style interviewer.`,
      whyLead: (pick) => `That interview rewards systems thinking and trade-offs — not just a pretty demo. ${nm(pick)} is where I pushed backend architecture, schema-aware SQL/AI reasoning, and production deployment hardest.`,
      evidenceLead: () => `${nm(rr)} is the better live walkthrough if they want open-source code on the table. ${nm(pp)} is secondary unless the role is product/platform for career tooling.`,
    });
  }

  if (task === 'recruiter_impress' || task === 'interview_first' || task === 'best_work') {
    const weights = TASK_OBJECTIVES[task] || TASK_OBJECTIVES.recruiter_impress;
    const qf = byId('queryforge');
    const pp = byId('placementpro');
    const leads = {
      recruiter_impress: {
        conclusionLead: (pick) => `For a recruiter, I'd lead with ${nm(pick)}.`,
        whyLead: (pick) => `Recruiters respond to a live URL and a story they can click in under a minute. ${nm(pick)} ships publicly${pick?.project?.repo ? ', is open-sourced,' : ''} and shows a clean full-stack split.`,
        evidenceLead: () => `Keep ${nm(qf)} ready if they ask about data/AI rigor, and ${nm(pp)} if the role leans product.`,
      },
      interview_first: {
        conclusionLead: (pick) => `I'd open with ${nm(pick)}.`,
        whyLead: (pick) => `You can demo it live, walk the API/UI split, and go as deep as you want${pick?.project?.repo ? ' — including the public repo' : ''}.`,
        evidenceLead: () => `Then use ${nm(qf)} for data/AI correctness or ${nm(pp)} for product/platform roles.`,
      },
      best_work: {
        conclusionLead: (pick) => `I'd lead with ${nm(pick)}.`,
        whyLead: () => `It's the clearest full-system story I shipped: live product, modern split stack, and inspectable code where available.`,
        evidenceLead: (pick, rest) => `${rest.map(nm).join(' and ')} remain strong domain/product plays — but ${pick?.name} is the strongest "here's the work" signal.`,
      },
    };
    return opRecommend(opCtx, { weights, ...leads[task] });
  }

  if (task === 'keep_two') {
    return [
      `${stillRecord(opCtx)}The records do not establish which two projects to keep or which one to drop. I will not rank them. QueryForgeAI documents FastAPI and schema-aware SQL generation. Placement Pro+ documents Flask, a structured profile, and a deterministic roadmap. RepoRadarAI documents a Next.js app, GET /api/analyze, and a public repository. Every portfolio project has a public live URL. Those are implementation and deployment facts, not an order.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'best_engineering') {
    return opJustify(opCtx, { task: 'best_engineering' });
  }

  if (task === 'most_difficult') {
    return opRank(opCtx, {
      weights: TASK_OBJECTIVES.most_difficult,
      conclusionLead: (pick) => `Technically, ${nm(pick)} is the hardest problem domain.`,
      whyLead: () => `Natural language → SQL, execution-plan awareness, and schema-grounded explanations require correctness against a real database model — a stricter bar than summarization-style intelligence.`,
      evidenceLead: (pick, rest) => `${rest.map(nm).join(' and ')} remain operationally complex. If "difficult" means correctness under schema constraints, ${pick?.name} wins.`,
    });
  }

  if (task === 'demo_backend' || task === 'demo_ai' || task === 'demo_frontend') {
    if (task === 'demo_backend') {
      return [
        'The records do not rank which project demonstrates the most backend engineering. I will not infer that ranking.',
        'QueryForgeAI documents FastAPI. Placement Pro+ documents Flask. RepoRadarAI documents a Next.js route, GET /api/analyze, rather than a Python backend. Those are implementation facts, not a strength ranking.',
      ].join(' ');
    }
    if (task === 'demo_ai') {
      const qf = byId('queryforge');
      const rr = byId('reporadar');
      const pp = byId('placementpro');
      return [
        `${stillRecord(opCtx)}The records do not rank the projects by AI engineering and do not record a preference for which to highlight first. I will not invent that order. ${nm(qf)} documents schema-aware SQL generation. ${nm(rr)} documents GitHub-metadata health heuristics and does not use a generative model over source. ${nm(pp)} documents MiniLM and a skill graph for skill-gap templates. Those are different implementation records, not a ranking.`,
      ].filter(Boolean).join('\n\n');
    }
    return [
      'The records do not rank frontend craft or name a strongest frontend technology. I will not infer that ranking from the stack.',
      `RepoRadarAI lists Next.js, React, and TypeScript. QueryForgeAI lists React and JavaScript. ${nm(byId('placementpro'))} lists React and TypeScript. Those are stack entries, not a proficiency ranking.`,
    ].join(' ');
  }

  // --- Evaluate ---
  if (task === 'eval_rest_apis') {
    return [
      'REST APIs is listed in the portfolio stack. That is stack membership. It is not a record of personal proficiency, and it is not a production-deployment finding.',
      'QueryForgeAI, Placement Pro+, and RepoRadarAI list REST APIs on their project stacks. A list entry is not, by itself, a verified implementation.',
      'The project records do document HTTP API surfaces: QueryForgeAI uses POST /generate-sql, Placement Pro+ uses Flask blueprints under /api, and RepoRadarAI serves GET /api/analyze. That is documented API behavior. It does not establish personal proficiency at designing REST APIs.',
    ].join(' ');
  }

  if (task === 'backend_vs_frontend') {
    const back = getNodesByType(graph, 'Technology').filter((t) => t.props.group === 'back').map((t) => t.label);
    const front = getNodesByType(graph, 'Technology').filter((t) => t.props.group === 'front').map((t) => t.label);
    const title = identity?.subject?.title || 'the documented role title';
    return [
      'The records do not establish whether Sudhanshu is stronger at backend or frontend, and they do not record a personal preference between them. I will not infer either claim from the stack.',
      `The documented role title is ${title}. That is a role label, not a proficiency measurement.`,
      `Backend stack membership includes ${back.join(', ') || 'the backend group'}. Frontend stack membership includes ${front.join(', ') || 'the frontend group'}. A stack entry is not a strength ranking.`,
      'Project records document these implementations: QueryForgeAI\'s decision record says the cloud backend is FastAPI and the cloud frontend is React. Placement Pro+ lists Flask and React and documents Flask. RepoRadarAI\'s decision record says it ships as a Next.js app with GET /api/analyze. Those are implementation and list facts, not a finding that one side is stronger.',
    ].join(' ');
  }

  if (task === 'docker_experience') {
    const docker = graph.nodes.get(nodeId('tech', 'Docker'));
    const deploy = getArchitecturePath(graph).find((l) => l.props.layerId === 'deploy');
    if (!docker) {
      return opEvaluate(opCtx, {
        conclusion: `I won't invent Docker seniority that isn't evidenced.`,
        reasoning: `What I can say is the deployment layer includes container-friendly production hosting.`,
        evidence: deploy?.props.sub || 'Deploy tooling appears at the portfolio architecture level.',
      });
    }
    return opEvaluate(opCtx, {
      conclusion: portfolioTechnologyNote('Docker'),
      reasoning: '',
      evidence: '',
    });
  }

  if (task === 'database_strength') {
    return opExplain(opCtx, { task: 'why_postgres' });
  }

  if (task === 'scalable_backend') {
    return [
      'The records do not establish that a scalable backend could be built from this portfolio, and they do not record multi-region operations or Kafka. I will not infer that capability.',
      'What they document is the shipped shape: a Python API layer, REST boundaries, and an AI reasoning layer over real inputs, with deployable frontends. That is an architecture description, not a scale rating.',
    ].join(' ');
  }

  if (task === 'production_ready') {
    const live = getIdentityClaimsByFacet('commonPatterns', identity)
      .find((c) => /live URL/i.test(c.statement));
    return [
      'The records do not establish a production-readiness rating. I will not infer one.',
      live?.statement
        ? `${live.statement} That is a deployment fact. It does not establish staff-architect tenure or a Fortune-500 service mesh.`
        : 'The records do not document a production-readiness rating.',
    ].join(' ');
  }

  return null;
}
