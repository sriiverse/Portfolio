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

export function classifyReasoningStrategy(query, ctx = {}) {
  const t = String(query || '').toLowerCase().trim();
  const qType = ctx?.questionFrame?.questionType;

  if (!t) return { strategy: 'Describe', task: null };

  if (/what can you do|what do you (do|offer|help with)|your capabilities|how can you help/i.test(t)) {
    return { strategy: 'Summarize', task: 'capabilities' };
  }
  if (/who are you|what are you|are you (an? )?(ai|assistant|bot|chatgpt)/i.test(t)
    || (qType === 'Identity' && !/remember|memory|external|api|llm|how.*(work|built)|what can you do|what do you do|who is sudhanshu|tell me about sudhanshu/i.test(t))) {
    return { strategy: 'Summarize', task: 'identity' };
  }
  if (/how (do|does) (you|the assistant|this) work|are you (calling|using).*(api|llm)|external api|retrieval|embedding|knowledge base/i.test(t)) {
    return { strategy: 'Explain', task: 'assistant_mechanism' };
  }

  if (/weakest|weak area|biggest weakness|limitation|where could (he|sudhanshu) improve|what.*(lack|missing (?!skill))|areas? (to|for) improve/i.test(t)
    || (/improve/i.test(t) && /where|what|area/i.test(t))) {
    return { strategy: 'Critique', task: 'weakest_area' };
  }
  if (/learn next|should (he|sudhanshu) learn|gaps to (close|fill)/i.test(t)) {
    return { strategy: 'Critique', task: 'learn_next' };
  }

  if (/why (is|was) (queryforge|reporadar|placement).*(best|strongest)|why .* best project/i.test(t)) {
    return { strategy: 'Justify', task: 'justify_best_project' };
  }
  if (/strongest engineering decision|best engineering decision/i.test(t)) {
    return { strategy: 'Justify', task: 'strongest_decision' };
  }
  if (/why (should i )?hire|why hire/i.test(t)) {
    return { strategy: 'Justify', task: 'why_hire' };
  }

  if (/faang|big tech|tier-?1|google|meta|amazon|apple|netflix|impress.*(interviewer|hiring|faang)/i.test(t)) {
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
  if (/show first|see first|interview first|open with|lead with|demo first|should i (see|demo|open)/i.test(t)) {
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

  if (/why flask|flask instead of fastapi|prefer flask|chose flask/i.test(t)) {
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
  if (/trade-?offs?|what would you (improve|change|rebuild)|if you rebuilt/i.test(t)) {
    return { strategy: 'Explain', task: 'arch_tradeoffs' };
  }
  if (/how (do|does|would) (these |the )?projects? scale|do they scale|scalability/i.test(t)) {
    return { strategy: 'Explain', task: 'arch_scale' };
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

  if (/tell me about|what is|explain (queryforge|placement|reporadar)/i.test(t)) {
    return { strategy: 'Describe', task: null };
  }

  return { strategy: 'Describe', task: null };
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

/** Infer fit from identity + patterns. */
function opInfer(ctx, { task }) {
  const prefs = getIdentityClaimsByFacet('architecturalPrefs', ctx.identity);
  const patterns = getIdentityClaimsByFacet('commonPatterns', ctx.identity);
  const subject = ctx.identity.subject;
  const live = patterns.find((c) => /live URL/i.test(c.statement));
  const backend = prefs.find((c) => /python|backend/i.test(c.statement));
  const ai = prefs.find((c) => /applied AI|LLMs/i.test(c.statement));
  const pp = ctx.byId('placementpro');

  if (task === 'startup_fit') {
    return speak(
      ctx.strategy,
      `Yes — I'd fit a startup that needs someone to ship backend + applied AI end to end.`,
      `Startups reward ownership and speed-to-live. ${live?.statement || 'I ship multiple production AI products with live URLs.'}`,
      `I wouldn't pitch myself as the *only* hire for pure mobile, deep ML research, or infra-only SRE — that isn't what this portfolio shows.`,
    );
  }
  if (task === 'backend_team_fit') {
    return speak(
      ctx.strategy,
      `Yes — a backend / platform team is a natural fit for me.`,
      `My center of gravity is Python services, REST APIs, and AI orchestration with the backend owning correctness.`,
      `Frontend is real and shipped, but secondary to ${subject?.title || 'the backend-leaning title'}.`,
    );
  }
  if (task === 'product_oriented') {
    return speak(
      ctx.strategy,
      `I'm product-capable, with engineering as the primary identity.`,
      `${nm(pp)} especially shows product workflow thinking (resume → gaps → roadmap). Overall I read as an engineer who ships products — not a PM who codes.`,
      `Hire me to build the system; treat product judgment as a bonus, not the main signal.`,
    );
  }
  if (task === 'best_role') {
    return speak(
      ctx.strategy,
      `Best fit for me: Python backend / AI platform / full-stack product engineer roles where shipping matters.`,
      `I'm especially strong on API design, LLM orchestration grounded in real data, and honest architecture.`,
      `Less ideal as a first hire for pure mobile, deep ML research, or infra-only SRE.`,
    );
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
    const decs = getDecisionsForTechnology(tech, ctx.graph);
    const projectsUsing = ctx.profiles.filter((p) => (p.project.stack || []).includes(tech));
    const pref = getIdentityClaimsByFacet('architecturalPrefs', ctx.identity)
      .find((c) => new RegExp(tech, 'i').test(c.statement))
      || getIdentityClaimsByFacet('technologyPrefs', ctx.identity)
        .find((c) => new RegExp(tech, 'i').test(c.statement));
    const sample = decs[0];
    const trade = sample?.tradeoffs?.[0];

    if (task === 'why_postgres') {
      const dataTechs = getNodesByType(ctx.graph, 'Technology')
        .filter((t) => /postgres|mongo/i.test(t.label))
        .map((t) => `\`${t.label}\``);
      const pick = topByAttribute(ctx.profiles, 'databases') || qf;
      return speak(
        ctx.strategy,
        `I'd default to Postgres when relational integrity and schema-aware work matter — which is exactly ${nm(pick)}'s world.`,
        `The interesting problem there is correctness against a real data model, not just storing documents.`,
        `At the portfolio level I list ${dataTechs.join(' and ') || 'PostgreSQL and MongoDB'} as the data layer — I won't invent a single pinned vendor per project card when the cards are thinner.`,
      );
    }

    // Storytelling openings — lived-in tech choices, no internal decision IDs
    let conclusion;
    if (task === 'why_flask') {
      conclusion = `I chose Flask on ${projectsUsing.map(nm).join(' and ') || 'the Flask-based ships'} because I wanted a smaller surface and explicit control over the request lifecycle while wiring backend + AI together.`;
    } else if (task === 'why_fastapi') {
      conclusion = `I reached for FastAPI on ${nm(rr)} because the service is API-first with I/O-heavy GitHub ingestion — async mattered more than a minimal sync surface.`;
    } else {
      conclusion = `I built the UIs in React — especially on ${projectsUsing.map(nm).join(' and ') || 'the React ships'} — because that's the ecosystem I actually shipped in.`;
    }

    const reasoning = pref?.statement
      || (trade
        ? `The interesting trade-off was ${trade.dimension.toLowerCase()}: ${trade.chosenView}`
        : (sample?.rawText || `I considered the alternatives, but ${tech} is what ended up on the shipped stack cards.`));

    const altTechs = (sample?.alternatives || [])
      .map((a) => a.tech)
      .filter(Boolean);
    const evidence = [
      projectsUsing.length ? `You'll see \`${tech}\` on ${projectsUsing.map(nm).join(' and ')}.` : '',
      altTechs.length
        ? `I can see why someone would choose ${altTechs.join(' or ')} instead — I just didn't on these ships.`
        : '',
    ].filter(Boolean).join(' ');

    return speak(ctx.strategy, conclusion, reasoning, evidence || `It's evidenced on the shipped stack — not a slide-deck preference.`);
  }

  if (task === 'arch_why') {
    const path = layers.map((l) => `**${l.label}** (${l.props.sub})`).join(' → ');
    const principles = getIdentityClaimsByFacet('designPrinciples', ctx.identity);
    return [
      `I designed the architecture as a deliberate five-layer split: ${path}.`,
      principles[0]?.statement
        || 'The problem I wanted to solve was clear ownership — frontend over REST, backend for correctness, AI reasoning over real data.',
      `Same spine across ${ctx.profiles.map(nm).join(', ')}.`,
    ].join('\n\n');
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

  if (task === 'identity') {
    return [
      `I'm SRIIVERSE AI — the digital engineering brain of ${subject?.name || 'Sudhanshu Sinha'}.`,
      opSummarize(ctx, { task: 'capabilities' }),
    ].join('\n\n');
  }

  if (task === 'about_sudhanshu') {
    return [
      `I'm ${subject?.name || 'Sudhanshu Sinha'} — a ${subject?.title || 'software engineer'}. ${subject?.tagline || ''}`.trim(),
      `I ship intelligent systems end to end: ${ctx.profiles.map(nm).join(', ')} — all live, sharing a five-layer architecture where AI reasons over real data.`,
      prefs.find((c) => /backend-leaning|Python/i.test(c.statement))?.statement
        || 'Center of gravity: Python backend + applied AI, with enough frontend to finish the product.',
    ].join('\n\n');
  }

  if (task === 'portfolio_different') {
    const ship = philosophy.find((c) => /Ship working production|slideware/i.test(c.statement));
    const ai = philosophy.find((c) => /reasoning layer/i.test(c.statement));
    return speak(
      ctx.strategy,
      `What makes this portfolio memorable is that I ship three live AI systems under one architectural philosophy — not a list of screenshots.`,
      `${ai?.statement || ''} ${ship?.statement || ''}`.trim(),
      `You can click demos. That's the difference.`,
    );
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
      `Same spine across ${ctx.profiles.map(nm).join(', ')}.`,
    ].filter(Boolean).join('\n\n');
  }

  if (task === 'engineer_type') {
    const lean = prefs.find((c) => /backend-leaning|full-stack/i.test(c.statement));
    return speak(
      ctx.strategy,
      `I'm a backend-leaning full-stack engineer with applied AI as a product skill — matching ${subject?.title || 'my documented title'}.`,
      lean?.statement || "I'm not a research scientist, and I'm not a pure frontend specialist.",
      `I build Python services, wire AI into real workflows, and ship the UI when the product needs it.`,
    );
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
    return opRank(ctx, {
      weights: TASK_OBJECTIVES.best_engineering,
      conclusionLead: (pick) => `I'd choose ${nm(pick)}.`,
      whyLead: (pick) => `It shows the strongest software engineering in one place — backend architecture, SQL optimization, AI grounded in a real schema, and production deployment.`,
      evidenceLead: (pick, rest) => `${rest.map(nm).join(' and ')} remain strong on split-stack and product workflow — but ${pick?.name} is the deepest systems story.`,
    });
  }

  if (task === 'strongest_decision') {
    const phil = getIdentityClaimsByFacet('philosophy', ctx.identity)
      .find((c) => /reasoning layer/i.test(c.statement));
    return speak(
      ctx.strategy,
      `The strongest engineering decision I made is treating AI as a reasoning layer over real data — not a blind text generator.`,
      phil?.statement
        || 'That shows up in schema-aware SQL work, resume-anchored advice, and layered repo intelligence.',
      `It keeps products useful and keeps the architecture honest.`,
    );
  }

  if (task === 'why_hire') {
    const rr = ctx.byId('reporadar');
    const qf = ctx.byId('queryforge');
    return speak(
      ctx.strategy,
      `Hire me because I ship real systems — three live AI products, not slideware.`,
      `I think in backend correctness and applied AI: Python services, REST APIs, and an architecture where the model reasons over real data instead of inventing product behavior.`,
      `Best proof: open ${nm(rr)} for the modern full-stack demo, then ${nm(qf)} if you care about data/AI rigor.`,
    );
  }

  return null;
}

/* ============================================================
   SYNTHESIZE — operator dispatcher (no project-id case tables)
   ============================================================ */

export function synthesizeReasoning(classification, query, ctx = {}) {
  const task = classification?.task;
  if (!task || task === 'compare_passthrough') return null;

  const graph = getEngineeringGraph();
  const records = getDecisionRecords(graph);
  const identity = getEngineeringIdentity(graph, records);
  const profiles = buildProjectProfiles(graph);
  const byId = (id) => profiles.find((p) => p.id === id);
  const strategy = classification.strategy || 'Answer';

  const opCtx = {
    graph, records, identity, profiles, byId, strategy, query, ctx,
  };

  // --- Summarize / identity ---
  if (['capabilities', 'identity', 'about_sudhanshu', 'portfolio_different', 'tech_frequency', 'design_philosophy', 'engineer_type', 'strengths'].includes(task)) {
    return opSummarize(opCtx, { task });
  }

  // --- Critique ---
  if (task === 'weakest_area' || task === 'learn_next') {
    return opCritique(opCtx, { mode: task });
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
  if (['why_hire', 'strongest_decision', 'justify_best_project'].includes(task)) {
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
    return opRank(opCtx, {
      weights: TASK_OBJECTIVES.keep_two,
      keep: 2,
      conclusionLead: (top) => `If I could only keep two, I'd keep ${nm(top[0])} and ${nm(top[1])}.`,
      whyLead: () => `Together they cover the deepest engineering signal and the strongest full-stack/open-source signal — the pair a technical hiring loop can actually probe.`,
      evidenceLead: (top, drop) => `I'd drop ${nm(drop[0])} last — it's a real shipped product, but it adds less unique engineering depth in a constrained portfolio.`,
    });
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
    const weights = TASK_OBJECTIVES[task];
    const ranked = rankByObjective(profiles, weights);
    if (task === 'demo_backend') {
      return speak(strategy,
        `Backend engineering shows up most clearly in ${nm(ranked[0])} and ${nm(ranked[1])}.`,
        `Both center on Python services that own orchestration, APIs, and AI workflow control — the backend is the product brainstem, not a thin BFF.`,
        `${nm(byId('reporadar'))} also has a serious FastAPI core, but its story shares the spotlight with a TypeScript React surface.`,
      );
    }
    if (task === 'demo_ai') {
      const qf = byId('queryforge');
      const rr = byId('reporadar');
      const pp = byId('placementpro');
      return speak(strategy,
        `For AI engineering depth, I'd highlight ${nm(ranked[0])} first.`,
        `All three use LLMs, but they demonstrate different muscles: schema-aware correctness (${nm(qf)}), layered repo intelligence (${nm(rr)}), and resume-grounded planning (${nm(pp)}).`,
        `${nm(qf)} wins when "AI engineering" means grounding and correctness; ${nm(rr)} wins when it means productized, demoable intelligence layers.`,
      );
    }
    return speak(strategy,
      `Frontend craft shows strongest in ${nm(ranked[0])}${ranked[1] ? ` and ${nm(ranked[1])}` : ''}.`,
      `React/TypeScript on RepoRadar and React on QueryForge are the clearest component-framework showcases.`,
      `${nm(byId('placementpro'))} ships a distinctive terminal-style surface — strong product UX, less of a classic React showcase.`,
    );
  }

  // --- Evaluate ---
  if (task === 'eval_rest_apis') {
    const withRest = profiles.filter((p) => (p.project.stack || []).some((s) => /rest/i.test(s)));
    return opEvaluate(opCtx, {
      conclusion: `Yes — I can design REST APIs.`,
      reasoning: `Confidence is high because REST isn't a single resume bullet — it's how my frontends talk to backends across the shipped systems.`,
      evidence: `You'll see REST APIs on ${withRest.map(nm).join(', ') || 'all three projects'}, with Flask/FastAPI services owning the contracts.`,
    });
  }

  if (task === 'backend_vs_frontend') {
    const back = getNodesByType(graph, 'Technology').filter((t) => t.props.group === 'back').map((t) => t.label);
    const front = getNodesByType(graph, 'Technology').filter((t) => t.props.group === 'front').map((t) => t.label);
    return opEvaluate(opCtx, {
      conclusion: `I'm stronger on the backend side.`,
      reasoning: `All three production systems are built around Python services and APIs, with AI orchestration living in that backend layer. Frontend is real and shipped — but the center of gravity matches my title.`,
      evidence: `Backend: ${back.map((n) => `\`${n}\``).join(', ')}. Frontend: ${front.map((n) => `\`${n}\``).join(', ')}. I'd call myself backend-leaning full-stack — not frontend-only.`,
    });
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
    const used = getEdges(graph, { from: docker.id, type: 'used_in' });
    return opEvaluate(opCtx, {
      conclusion: `Yes — Docker is part of how I ship.`,
      reasoning: `It's listed in the portfolio STACK${used.length ? ' and linked into shipped projects' : ' (portfolio-level; thinner per-project pins)'} and sits in the deployment layer alongside Vercel, Netlify, and Render. I won't claim years of ops tenure that aren't stated.`,
      evidence: deploy?.props.desc || 'Containerized, reproducible deploys are part of the architecture model.',
    });
  }

  if (task === 'database_strength') {
    return opExplain(opCtx, { task: 'why_postgres' });
  }

  if (task === 'scalable_backend') {
    return opEvaluate(opCtx, {
      conclusion: `Yes — within the scope of what I've actually shipped.`,
      reasoning: `The shared pattern is a Python API layer, REST boundaries, an AI reasoning layer over real inputs, and deployable frontends — a solid foundation for scaling a service.`,
      evidence: `I won't invent multi-region ops or Kafka-scale claims. Clear layer ownership is the honest scaling story here.`,
    });
  }

  if (task === 'production_ready') {
    const live = getIdentityClaimsByFacet('commonPatterns', identity)
      .find((c) => /live URL/i.test(c.statement));
    return opEvaluate(opCtx, {
      conclusion: `Yes — for the kind of work this portfolio shows.`,
      reasoning: live?.statement || `Three systems are live with public URLs. That's a stronger production signal than private prototypes.`,
      evidence: `Readiness here means: design a service, integrate AI carefully, deploy. It does not automatically mean staff-architect tenure for a Fortune-500 mesh — that would be inventing seniority.`,
    });
  }

  return null;
}
