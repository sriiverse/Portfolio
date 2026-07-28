/**
 * identity.js — V4 Phase 3 Engineering Identity Layer
 *
 * Derives Sudhanshu's engineering identity from:
 *   1. Engineering Knowledge Graph (Phase 1)
 *   2. Decision Records (Phase 2)
 *
 * Identity is a *view* over evidence — not a second CMS and not invented
 * personality. Claims are tagged documented | inferred | unknown.
 *
 * Does not modify reasoning / providers / UI.
 */

import {
  getEngineeringGraph,
  getNodesByType,
  getEdges,
  getProjectTechnologies,
  getArchitecturePath,
  graphStats,
  nodeId,
} from './graph.js';
import {
  getDecisionRecords,
  getDecisionsForTechnology,
} from './decisions.js';

/* ============================================================
   BUILD
   ============================================================ */

/**
 * @param {object} [graph]
 * @param {object[]} [records]
 * @returns {EngineeringIdentity}
 */
export function buildEngineeringIdentity(
  graph = getEngineeringGraph(),
  records = getDecisionRecords(graph),
) {
  const profile = getNodesByType(graph, 'Profile')[0] || null;
  const projects = getNodesByType(graph, 'Project')
    .slice()
    .sort((a, b) => String(a.props.index).localeCompare(String(b.props.index)));
  const techFreq = technologyFrequency(graph, projects);
  const layers = getArchitecturePath(graph);
  const journey = getNodesByType(graph, 'JourneyPhase')
    .slice()
    .sort((a, b) => a.props.index - b.props.index);

  const claims = {
    philosophy: derivePhilosophy(records, graph),
    designPrinciples: deriveDesignPrinciples(graph, layers),
    architecturalPrefs: deriveArchitecturalPrefs(graph, projects, techFreq, records),
    technologyPrefs: deriveTechnologyPrefs(graph, techFreq, records),
    communicationStyle: deriveCommunicationStyle(records),
    problemSolving: deriveProblemSolving(projects),
    commonPatterns: deriveCommonPatterns(graph, projects, techFreq, records),
    strengths: deriveStrengths(profile, projects, techFreq, graph),
    learningTrajectory: deriveLearningTrajectory(journey, projects),
    growthAreas: deriveGrowthAreas(graph, techFreq),
    decisionStyle: deriveDecisionStyle(records),
  };

  return {
    version: 'v4-phase3',
    subject: profile ? {
      name: profile.props.name,
      title: profile.props.title,
      brand: profile.props.brand,
      tagline: profile.props.tagline,
      graphNodeId: profile.id,
    } : null,
    claims,
    meta: {
      projectCount: projects.length,
      decisionRecordCount: records.length,
      graph: graphStats(graph),
      derivedFrom: ['graph', 'decision-records'],
    },
  };
}

function claim(id, facet, statement, confidence, evidence, extras = {}) {
  return {
    id,
    facet,
    statement,
    confidence, // 'documented' | 'inferred'
    evidence,
    ...extras,
  };
}

function ref(kind, id, extra = {}) {
  return { kind, id, ...extra };
}

/* ---------- facet derivations ---------- */

function technologyFrequency(graph, projects) {
  const counts = new Map();
  for (const p of projects) {
    for (const t of getProjectTechnologies(graph, p.props.projectId)) {
      const n = t.label;
      if (!counts.has(n)) counts.set(n, { tech: n, count: 0, projects: [] });
      const row = counts.get(n);
      row.count += 1;
      row.projects.push(p.props.projectId);
    }
  }
  return counts;
}

function derivePhilosophy(records, graph) {
  const out = [];
  const texts = records.map((r) => r.rawText).join('\n');

  // Motif: AI as reasoning layer over real data (appears in decisions + arch desc)
  const reasoningHits = records.filter((r) => /reasoning layer|not a blind|real schema|real resume|real data/i.test(r.rawText));
  const aiLayer = getNodesByType(graph, 'ArchLayer').find((l) => l.props.layerId === 'ai');
  if (reasoningHits.length >= 1 || (aiLayer && /reasoning/i.test(aiLayer.props.desc || ''))) {
    const evidence = [
      ...reasoningHits.map((r) => ref('decision-record', r.id)),
      ...(aiLayer ? [ref('arch-layer', aiLayer.id)] : []),
    ];
    out.push(claim(
      'philosophy:ai-reasoning-layer',
      'philosophy',
      'AI should act as a reasoning layer over real inputs (schema, resume, repository) — not a blind text generator.',
      reasoningHits.length >= 2 || (reasoningHits.length >= 1 && aiLayer) ? 'documented' : 'inferred',
      evidence,
    ));
  }

  // Motif: explainability over black-box rewrites
  const explainHits = records.filter((r) => /explanation|not a black-box|learn from/i.test(r.rawText));
  if (explainHits.length) {
    out.push(claim(
      'philosophy:explainability',
      'philosophy',
      'Prefer explanations developers can learn from over opaque black-box rewrites.',
      explainHits.length >= 1 ? 'documented' : 'inferred',
      explainHits.map((r) => ref('decision-record', r.id)),
    ));
  }

  // Motif: specificity over generic advice (Placement decisions)
  const specificHits = records.filter((r) => /specific instead of generic|anchored to the real/i.test(r.rawText));
  if (specificHits.length) {
    out.push(claim(
      'philosophy:grounded-specificity',
      'philosophy',
      'Advice and intelligence should be anchored to real user artifacts, not generic templates.',
      'documented',
      specificHits.map((r) => ref('decision-record', r.id)),
    ));
  }

  // Ship real systems — from profile tagline + live projects (graph props)
  const liveProjects = getNodesByType(graph, 'Project').filter((p) => p.props.live);
  if (liveProjects.length >= 2) {
    out.push(claim(
      'philosophy:ship-production',
      'philosophy',
      'Ship working production systems — live products, not slideware demos.',
      'documented',
      liveProjects.map((p) => ref('project-node', p.id, { live: p.props.live })),
    ));
  }

  void texts;
  return out;
}

function deriveDesignPrinciples(graph, layers) {
  const out = [];
  if (layers.length >= 5) {
    out.push(claim(
      'design:five-layer-topology',
      'designPrinciples',
      `Systems follow a clear layered topology: ${layers.map((l) => l.label).join(' → ')}.`,
      'documented',
      layers.map((l) => ref('arch-layer', l.id)),
    ));
  }

  const talks = getEdges(graph, { type: 'talks_to' });
  const via = getEdges(graph, { type: 'via' });
  if (talks.length && via.some((e) => e.to === nodeId('tech', 'REST APIs'))) {
    out.push(claim(
      'design:rest-boundaries',
      'designPrinciples',
      'Frontend talks to backend exclusively over REST — clear service boundaries.',
      'documented',
      [
        ...talks.map((e) => ref('edge', e.id, { type: e.type })),
        ...via.filter((e) => e.to === nodeId('tech', 'REST APIs')).map((e) => ref('edge', e.id, { type: e.type })),
      ],
    ));
  }

  const backend = layers.find((l) => l.props.layerId === 'backend');
  if (backend && /owns correctness/i.test(backend.props.desc || '')) {
    out.push(claim(
      'design:backend-owns-correctness',
      'designPrinciples',
      'The backend owns correctness: auth, business logic, orchestration, and validation.',
      'documented',
      [ref('arch-layer', backend.id)],
    ));
  }

  return out;
}

function deriveArchitecturalPrefs(graph, projects, techFreq, records) {
  const out = [];
  const n = projects.length || 1;

  const python = techFreq.get('Python');
  const flask = techFreq.get('Flask');
  const fastapi = techFreq.get('FastAPI');
  const llms = techFreq.get('LLMs');
  const react = techFreq.get('React');

  if (python && python.count === n) {
    out.push(claim(
      'arch:python-backend-spine',
      'architecturalPrefs',
      'Prefer Python services as the backend spine across shipped products.',
      'documented',
      [
        ref('technology-node', nodeId('tech', 'Python')),
        ...python.projects.map((id) => ref('project-node', nodeId('project', id))),
      ],
    ));
  }

  if (llms && llms.count === n) {
    out.push(claim(
      'arch:applied-ai-in-product',
      'architecturalPrefs',
      'Treat applied AI (LLMs) as a first-class product layer, present in every shipped system.',
      'documented',
      [
        ref('technology-node', nodeId('tech', 'LLMs')),
        ...llms.projects.map((id) => ref('project-node', nodeId('project', id))),
      ],
    ));
  }

  // Flask vs FastAPI preference is contextual — documented via decision records + usage split
  if (flask && fastapi) {
    out.push(claim(
      'arch:flask-vs-fastapi-contextual',
      'architecturalPrefs',
      'Choose Flask when orchestration needs a small explicit surface; choose FastAPI for API-first / I/O-heavy services — both appear in shipped work.',
      'documented',
      [
        ...getDecisionsForTechnology('Flask', graph).map((r) => ref('decision-record', r.id)),
        ...getDecisionsForTechnology('FastAPI', graph).map((r) => ref('decision-record', r.id)),
        ref('technology-node', nodeId('tech', 'Flask')),
        ref('technology-node', nodeId('tech', 'FastAPI')),
      ],
    ));
  } else if (flask && !fastapi) {
    out.push(claim(
      'arch:flask-primary',
      'architecturalPrefs',
      'Flask is the primary backend framework across current shipped projects.',
      'documented',
      [ref('technology-node', nodeId('tech', 'Flask')), ...flask.projects.map((id) => ref('project-node', nodeId('project', id)))],
    ));
  }

  // Frontend secondary but real
  if (react && react.count >= 1 && python && python.count === n) {
    out.push(claim(
      'arch:backend-leaning-fullstack',
      'architecturalPrefs',
      'Backend-leaning full-stack: Python/AI core with React (or JS) surfaces where the product needs a serious UI.',
      'inferred',
      [
        ref('technology-node', nodeId('tech', 'Python')),
        ref('technology-node', nodeId('tech', 'React')),
        ...react.projects.map((id) => ref('project-node', nodeId('project', id))),
      ],
    ));
  }

  // Layered intelligence (RepoRadar decision)
  const layered = records.filter((r) => /layered|summary, then architecture/i.test(r.rawText));
  if (layered.length) {
    out.push(claim(
      'arch:progressive-disclosure',
      'architecturalPrefs',
      'Prefer layered intelligence — users descend from summary to deep explanation at their own pace.',
      'documented',
      layered.map((r) => ref('decision-record', r.id)),
    ));
  }

  return out;
}

function deriveTechnologyPrefs(graph, techFreq, records) {
  const out = [];
  const projects = getNodesByType(graph, 'Project');
  const n = projects.length || 1;

  const universal = [...techFreq.values()].filter((row) => row.count === n);
  for (const row of universal) {
    out.push(claim(
      `techpref:universal:${row.tech}`,
      'technologyPrefs',
      `\`${row.tech}\` appears in all ${n} shipped projects — a core stack constant.`,
      'documented',
      [
        ref('technology-node', nodeId('tech', row.tech)),
        ...row.projects.map((id) => ref('project-node', nodeId('project', id))),
      ],
    ));
  }

  // React preference when React is used and Vue is not in graph STACK
  if (techFreq.has('React') && !graph.nodes.has(nodeId('tech', 'Vue'))) {
    const reactRecords = records.filter((r) => r.chosen === 'React' || (r.relatedTechs || []).includes('React'));
    out.push(claim(
      'techpref:react-over-absent-vue',
      'technologyPrefs',
      'React is the shipped frontend framework; Vue is not part of the portfolio STACK.',
      'documented',
      [
        ref('technology-node', nodeId('tech', 'React')),
        ...reactRecords.map((r) => ref('decision-record', r.id)),
      ],
    ));
  }

  return out;
}

function deriveCommunicationStyle(records) {
  const out = [];
  const teach = records.filter((r) => /learn from|explanation|explain/i.test(r.rawText));
  if (teach.length) {
    out.push(claim(
      'comms:teach-through-explanation',
      'communicationStyle',
      'Explain engineering choices so others can learn — surface reasoning, not just outcomes.',
      'inferred',
      teach.map((r) => ref('decision-record', r.id)),
    ));
  }

  const systems = records.filter((r) => /orchestr|split|layer|system|interface frames/i.test(r.rawText));
  if (systems.length >= 2) {
    out.push(claim(
      'comms:systems-framing',
      'communicationStyle',
      'Frame products as systems with clear ownership boundaries (orchestration, layers, interfaces).',
      'inferred',
      systems.map((r) => ref('decision-record', r.id)),
    ));
  }

  return out;
}

function deriveProblemSolving(projects) {
  const out = [];
  const themes = [];

  for (const p of projects) {
    const blob = `${p.props.problem || ''} ${p.props.solution || ''}`.toLowerCase();
    if (/sql|query|schema|database/.test(blob)) themes.push({ theme: 'data-correctness', project: p });
    if (/resume|career|placement|roadmap/.test(blob)) themes.push({ theme: 'workflow-intelligence', project: p });
    if (/repository|github|codebase|documentation/.test(blob)) themes.push({ theme: 'codebase-understanding', project: p });
    if (/ai|llm|natural language/.test(blob)) themes.push({ theme: 'applied-ai', project: p });
  }

  const byTheme = new Map();
  for (const t of themes) {
    if (!byTheme.has(t.theme)) byTheme.set(t.theme, []);
    byTheme.get(t.theme).push(t.project);
  }

  const statements = {
    'data-correctness': 'Drawn to problems where AI must stay correct against real data models (SQL, schemas, plans).',
    'workflow-intelligence': 'Builds intelligence into end-to-end human workflows (resume → gaps → roadmap).',
    'codebase-understanding': 'Attacks onboarding/comprehension problems with layered repository intelligence.',
    'applied-ai': 'Turns LLMs into product behavior grounded in real inputs — not standalone demos.',
  };

  for (const [theme, projs] of byTheme) {
    out.push(claim(
      `problems:${theme}`,
      'problemSolving',
      statements[theme] || `Recurring problem theme: ${theme}.`,
      projs.length >= 1 ? 'inferred' : 'inferred',
      projs.map((p) => ref('project-node', p.id)),
      { theme },
    ));
  }

  return out;
}

function deriveCommonPatterns(graph, projects, techFreq, records) {
  const out = [];
  const n = projects.length || 1;

  for (const row of techFreq.values()) {
    if (row.count === n) {
      out.push(claim(
        `pattern:stack:${row.tech}`,
        'commonPatterns',
        `Shared stack pattern: \`${row.tech}\` on every shipped project.`,
        'documented',
        [
          ref('technology-node', nodeId('tech', row.tech)),
          ...row.projects.map((id) => ref('project-node', nodeId('project', id))),
        ],
      ));
    }
  }

  const live = projects.filter((p) => p.props.live);
  if (live.length === projects.length && projects.length >= 2) {
    out.push(claim(
      'pattern:all-live',
      'commonPatterns',
      'Every portfolio project ships with a public live URL.',
      'documented',
      live.map((p) => ref('project-node', p.id, { live: p.props.live })),
    ));
  }

  const withDecisions = projects.filter((p) => getEdges(graph, {
    from: p.id,
    type: 'has_decision',
  }).length > 0);
  if (withDecisions.length === projects.length) {
    out.push(claim(
      'pattern:documented-decisions',
      'commonPatterns',
      'Each shipped project records explicit engineering decisions.',
      'documented',
      withDecisions.map((p) => ref('project-node', p.id)),
    ));
  }

  // Open-source when repo present
  const withRepo = projects.filter((p) => p.props.repo);
  if (withRepo.length) {
    out.push(claim(
      'pattern:selective-opensource',
      'commonPatterns',
      'At least one shipped system is open-sourced for inspectable engineering depth.',
      'documented',
      withRepo.map((p) => ref('project-node', p.id, { repo: p.props.repo })),
    ));
  }

  void records;
  return out;
}

function deriveStrengths(profile, projects, techFreq, graph) {
  const out = [];
  if (profile?.props?.title) {
    out.push(claim(
      'strength:profile-title',
      'strengths',
      `Documented role focus: ${profile.props.title}.`,
      'documented',
      [ref('profile-node', profile.id)],
    ));
  }

  const live = projects.filter((p) => p.props.live);
  if (live.length >= 2) {
    out.push(claim(
      'strength:ships-live-ai-systems',
      'strengths',
      `Ships multiple live production systems (${live.length} public deployments in the graph).`,
      'documented',
      live.map((p) => ref('project-node', p.id)),
    ));
  }

  if (techFreq.get('Python')?.count >= 2 && techFreq.get('LLMs')?.count >= 2) {
    out.push(claim(
      'strength:backend-plus-applied-ai',
      'strengths',
      'Combines Python backend engineering with applied LLM product features across projects.',
      'documented',
      [
        ref('technology-node', nodeId('tech', 'Python')),
        ref('technology-node', nodeId('tech', 'LLMs')),
      ],
    ));
  }

  const layers = getArchitecturePath(graph);
  if (layers.length >= 5) {
    out.push(claim(
      'strength:architectural-consistency',
      'strengths',
      'Maintains a consistent five-layer architecture story across the portfolio.',
      'documented',
      layers.map((l) => ref('arch-layer', l.id)),
    ));
  }

  return out;
}

function deriveLearningTrajectory(journey, projects) {
  const out = [];
  if (!journey.length) return out;

  out.push(claim(
    'trajectory:journey-arc',
    'learningTrajectory',
    `Documented trajectory: ${journey.map((j) => j.props.phase).join(' → ')}.`,
    'documented',
    journey.map((j) => ref('journey-node', j.id, { title: j.props.title })),
  ));

  // Ship order from journey_ships + project index
  const shipTitles = journey
    .filter((j) => /^Ship/i.test(j.props.phase) || projects.some((p) => p.label === j.props.title))
    .map((j) => j.props.title);
  if (shipTitles.length >= 2) {
    out.push(claim(
      'trajectory:ship-sequence',
      'learningTrajectory',
      `Shipped sequence reflected in the journey: ${shipTitles.join(' → ')}.`,
      'documented',
      journey.filter((j) => shipTitles.includes(j.props.title)).map((j) => ref('journey-node', j.id)),
    ));
  }

  // Evolution signal: Flask earlier, FastAPI later (from project indexes + stack)
  const ordered = projects.slice().sort((a, b) => String(a.props.index).localeCompare(String(b.props.index)));
  const firstFlask = ordered.find((p) => (p.props.stack || []).includes('Flask'));
  const laterFast = ordered.find((p) => (p.props.stack || []).includes('FastAPI')
    && String(p.props.index) > String(firstFlask?.props.index || ''));
  if (firstFlask && laterFast) {
    out.push(claim(
      'trajectory:api-framework-evolution',
      'learningTrajectory',
      `Backend framework evolution across ships: Flask on earlier work (${firstFlask.label}), FastAPI on later work (${laterFast.label}).`,
      'inferred',
      [
        ref('project-node', firstFlask.id),
        ref('project-node', laterFast.id),
      ],
    ));
  }

  return out;
}

function deriveGrowthAreas(graph, techFreq) {
  const out = [];
  // Portfolio STACK techs with zero used_in edges → thin per-project public signal
  const techs = getNodesByType(graph, 'Technology');
  const thin = [];
  for (const t of techs) {
    const used = getEdges(graph, { from: t.id, type: 'used_in' });
    if (!used.length && t.props.source === 'STACK') {
      thin.push(t);
    }
  }

  if (thin.length) {
    out.push(claim(
      'growth:thin-per-project-stack-pins',
      'growthAreas',
      `Some portfolio STACK technologies are not pinned on individual project stack cards (${thin.map((t) => t.label).join(', ')}). That is a documentation/signal gap — not proof of unfamiliarity.`,
      'inferred',
      thin.map((t) => ref('technology-node', t.id)),
    ));
  }

  // Databases specifically called out often
  const dbThin = thin.filter((t) => /postgres|mongo/i.test(t.label));
  if (dbThin.length) {
    out.push(claim(
      'growth:database-vendor-pinning',
      'growthAreas',
      'Per-project database vendor pinning is thinner than the portfolio-level data layer story — a useful clarity improvement.',
      'inferred',
      dbThin.map((t) => ref('technology-node', t.id)),
    ));
  }

  // No Kubernetes etc. in STACK — do not invent; only note absences from graph Technology set
  const knownAbsent = ['Kubernetes', 'AWS', 'GraphQL', 'Django'];
  const absent = knownAbsent.filter((name) => !graph.nodes.has(nodeId('tech', name)));
  if (absent.length) {
    out.push(claim(
      'growth:not-in-portfolio-stack',
      'growthAreas',
      `Not present in the portfolio STACK/graph (therefore not claimed): ${absent.join(', ')}.`,
      'documented',
      absent.map((name) => ref('absent-tech', name)),
    ));
  }

  void techFreq;
  return out;
}

function deriveDecisionStyle(records) {
  const out = [];
  if (!records.length) return out;

  const withTech = records.filter((r) => r.chosen);
  const approach = records.filter((r) => !r.chosen);
  out.push(claim(
    'decisions:mix-tech-and-approach',
    'decisionStyle',
    `Documents both technology choices (${withTech.length}) and approach-level decisions (${approach.length}).`,
    'documented',
    records.map((r) => ref('decision-record', r.id)),
  ));

  const withTradeoffs = records.filter((r) => r.tradeoffs?.length);
  if (withTradeoffs.length) {
    out.push(claim(
      'decisions:tradeoff-aware',
      'decisionStyle',
      'When a chosen tech has an authored comparison pair, trade-offs are attached explicitly (not left implicit).',
      'inferred',
      withTradeoffs.map((r) => ref('decision-record', r.id)),
    ));
  }

  const evalKnown = records.filter((r) => r.currentEvaluation?.confidence === 'inferred');
  if (evalKnown.length) {
    out.push(claim(
      'decisions:revisits-via-later-ships',
      'decisionStyle',
      'Later projects provide graph signal for whether earlier technology choices still appear — evaluations stay labeled as inferences.',
      'inferred',
      evalKnown.map((r) => ref('decision-record', r.id)),
    ));
  }

  return out;
}

/* ============================================================
   QUERY / CACHE
   ============================================================ */

let _cache = null;
let _cacheKey = null;

export function getEngineeringIdentity(graph = getEngineeringGraph(), records = getDecisionRecords(graph), {
  forceRebuild = false,
} = {}) {
  const key = `${graph.nodes.size}:${records.length}`;
  if (!forceRebuild && _cache && _cacheKey === key) return _cache;
  _cache = buildEngineeringIdentity(graph, records);
  _cacheKey = key;
  return _cache;
}

export function resetEngineeringIdentityCache() {
  _cache = null;
  _cacheKey = null;
}

/** Flat list of all claims. */
export function listIdentityClaims(identity = getEngineeringIdentity()) {
  const out = [];
  for (const [facet, list] of Object.entries(identity.claims || {})) {
    for (const c of list) out.push({ ...c, facet: c.facet || facet });
  }
  return out;
}

export function getIdentityClaimsByFacet(facet, identity = getEngineeringIdentity()) {
  return identity.claims?.[facet] || [];
}

export function getIdentityClaimById(id, identity = getEngineeringIdentity()) {
  return listIdentityClaims(identity).find((c) => c.id === id) || null;
}

/* ============================================================
   VALIDATION
   ============================================================ */

export function validateEngineeringIdentity(identity, graph = getEngineeringGraph(), records = getDecisionRecords(graph)) {
  const errors = [];
  const warnings = [];

  if (!identity?.claims) {
    return { ok: false, errors: ['Identity missing claims'], warnings, stats: null };
  }

  const requiredFacets = [
    'philosophy', 'designPrinciples', 'architecturalPrefs', 'technologyPrefs',
    'communicationStyle', 'problemSolving', 'commonPatterns', 'strengths',
    'learningTrajectory', 'growthAreas', 'decisionStyle',
  ];

  for (const facet of requiredFacets) {
    if (!Array.isArray(identity.claims[facet])) {
      errors.push(`Missing facet array: ${facet}`);
    }
  }

  const all = listIdentityClaims(identity);
  const seen = new Set();
  for (const c of all) {
    if (seen.has(c.id)) errors.push(`Duplicate claim id ${c.id}`);
    seen.add(c.id);
    if (!c.statement) errors.push(`Claim ${c.id} missing statement`);
    if (!['documented', 'inferred'].includes(c.confidence)) {
      errors.push(`Claim ${c.id} bad confidence ${c.confidence}`);
    }
    if (!Array.isArray(c.evidence) || !c.evidence.length) {
      errors.push(`Claim ${c.id} missing evidence`);
    }

    // Evidence must resolve when pointing at graph nodes / decision records
    for (const e of c.evidence) {
      if (e.kind === 'decision-record' && !records.some((r) => r.id === e.id)) {
        errors.push(`Claim ${c.id} evidence decision-record ${e.id} missing`);
      }
      if (['project-node', 'technology-node', 'arch-layer', 'profile-node', 'journey-node'].includes(e.kind)) {
        if (e.id && !graph.nodes.has(e.id) && e.kind !== 'absent-tech') {
          // absent-tech is intentional
          if (e.kind !== 'absent-tech') errors.push(`Claim ${c.id} evidence ${e.kind} ${e.id} not in graph`);
        }
      }
      if (e.kind === 'edge' && e.id && !graph.edges.some((edge) => edge.id === e.id)) {
        errors.push(`Claim ${c.id} evidence edge ${e.id} missing`);
      }
    }

    // Ban personality fluff words without engineering grounding
    if (/\b(passionate|humble|genius|rockstar|ninja)\b/i.test(c.statement)) {
      errors.push(`Claim ${c.id} uses banned personality fluff`);
    }
  }

  if (all.length < 8) warnings.push(`Only ${all.length} claims — identity may be thin`);

  const byFacet = {};
  for (const facet of requiredFacets) byFacet[facet] = (identity.claims[facet] || []).length;

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      claimCount: all.length,
      documented: all.filter((c) => c.confidence === 'documented').length,
      inferred: all.filter((c) => c.confidence === 'inferred').length,
      byFacet,
    },
  };
}
