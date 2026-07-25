/**
 * reasoning.js — Version 3 Sprint 2 Portfolio Reasoning Engine
 *
 * Composition-adjacent cognitive layer. Classifies *how* to think about a
 * turn (Describe / Explain / Compare / Recommend / Evaluate / Rank /
 * Critique / Infer / Summarize / Justify) and derives portfolio-entity
 * attributes from live PROJECTS / STACK / ARCHITECTURE — never from
 * invented facts.
 *
 * Does not replace Version 2 understanding, entities, evidence, confidence,
 * or planning. Those stages stay frozen; this module feeds Response
 * Composition so answers are conclusions supported by evidence, not
 * retrieved paragraphs treated as conclusions.
 */

import { getAllProjects, getStack, getArchitecture, getProfile } from './knowledge.js';
import { ASSISTANT_CAPABILITIES, TECH_TAKES } from './persona.js';

export const REASONING_STRATEGIES = [
  'Describe',
  'Explain',
  'Compare',
  'Recommend',
  'Evaluate',
  'Rank',
  'Critique',
  'Infer',
  'Summarize',
  'Justify',
];

/** Strategies that must speak Decision → Reasoning → Evidence, not dump docs. */
export const DECISION_FIRST_STRATEGIES = new Set([
  'Recommend', 'Evaluate', 'Rank', 'Critique', 'Infer', 'Justify',
]);

/**
 * Attribute model per project — derived only from shipped project fields
 * and portfolio-level stack/architecture. Scores are relative rankings aids,
 * not claimed metrics shown to visitors as “scores.”
 */
export function buildProjectProfiles() {
  const projects = getAllProjects();
  return projects.map((p) => {
    const stack = p.stack || [];
    const has = (re) => stack.some((s) => re.test(s));
    const decisions = p.decisions || [];
    const features = p.features || [];

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
        complexity,
        backendDepth,
        frontendDepth,
        aiUsage,
        databases,
        deployment,
        architecture,
        scalability,
        innovation,
        recruiterImpact,
        productionReadiness,
        softwareEngineering,
      },
    };
  });
}

function scoreClamp(n) {
  return Math.max(0, Math.min(10, Math.round(n)));
}

export function rankByAttribute(profiles, attr) {
  return [...profiles].sort((a, b) => (b.attrs[attr] || 0) - (a.attrs[attr] || 0) || a.name.localeCompare(b.name));
}

export function topByAttribute(profiles, attr) {
  return rankByAttribute(profiles, attr)[0] || null;
}

/**
 * Classify the cognitive task for this turn.
 * Returns { strategy, task, focus? } — task is a stable synthesis key.
 */
export function classifyReasoningStrategy(query, ctx = {}) {
  const t = String(query || '').toLowerCase().trim();
  const qType = ctx?.questionFrame?.questionType;

  if (!t) return { strategy: 'Describe', task: null };

  // --- Identity / assistant (Summarize / Describe self) ---
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

  // --- Critique (weaknesses / limitations) — before recommend/rank ---
  if (/weakest|weak area|biggest weakness|limitation|where could (he|sudhanshu) improve|what.*(lack|missing (?!skill))|areas? (to|for) improve/i.test(t)
    || (/improve/i.test(t) && /where|what|area/i.test(t))) {
    return { strategy: 'Critique', task: 'weakest_area' };
  }
  if (/learn next|should (he|sudhanshu) learn|gaps to (close|fill)/i.test(t)) {
    return { strategy: 'Critique', task: 'learn_next' };
  }

  // --- Justify (before broad "best project" recommend) ---
  if (/why (is|was) (queryforge|reporadar|placement).*(best|strongest)|why .* best project/i.test(t)) {
    return { strategy: 'Justify', task: 'justify_best_project' };
  }
  if (/strongest engineering decision|best engineering decision/i.test(t)) {
    return { strategy: 'Justify', task: 'strongest_decision' };
  }
  if (/why (should i )?hire|why hire/i.test(t)) {
    return { strategy: 'Justify', task: 'why_hire' };
  }

  // --- Recommend / Rank (project selection for an objective) ---
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

  // --- Evaluate competency ---
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
  if (/\b(do|does|did) (he|you|sudhanshu) (know|use|have)\b/i.test(t) && qType === 'SkillVerification') {
    // Leave ordinary skill checks to the plan unless covered above.
  }

  // --- Infer fit ---
  if (/fit (a |an )?(startup|early.?stage)|startup (fit|engineer)|early.?stage|would he (fit|thrive) (at |in )?(a )?(startup|early)/i.test(t)) {
    return { strategy: 'Infer', task: 'startup_fit' };
  }
  if (/fit (a |an )?backend|backend team|would he (fit|belong).*(backend|platform)/i.test(t)) {
    return { strategy: 'Infer', task: 'backend_team_fit' };
  }
  if (/product-?oriented|more product|product engineer|product.?minded/i.test(t)) {
    return { strategy: 'Infer', task: 'product_oriented' };
  }

  // --- Explain (why tech / architecture) ---
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

  // --- Summarize ---
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

  // --- Compare ---
  if (qType === 'Comparison' || /\bcompare\b|\bvs\.?\b|\bversus\b|\bdifference between\b/i.test(t)) {
    return { strategy: 'Compare', task: 'compare_passthrough' };
  }

  // --- Recruiter catch-all ---
  if (qType === 'Recruiter' && /hire|fit|strength|recommend|suit|ready|engineer/i.test(t)) {
    if (/hire/.test(t)) return { strategy: 'Justify', task: 'why_hire' };
    if (/role|fit|suit/.test(t)) return { strategy: 'Infer', task: 'best_role' };
    if (/strength/.test(t)) return { strategy: 'Summarize', task: 'strengths' };
    return { strategy: 'Justify', task: 'why_hire' };
  }

  // Describe: named project walkthroughs — leave to plan/cards
  if (/tell me about|what is|explain (queryforge|placement|reporadar)/i.test(t)) {
    return { strategy: 'Describe', task: null };
  }

  return { strategy: 'Describe', task: null };
}

/** Tasks that may override a false Decline / gap collision. */
export function mayOverrideDecline(task) {
  if (!task || task === 'compare_passthrough') return false;
  return true; // all classified reasoning tasks are evaluative/synthetic
}

/**
 * Decision-first speech: Conclusion → Reasoning → Evidence.
 */
export function formatDecisionFirst({ conclusion, reasoning, evidence }) {
  const parts = [conclusion, reasoning, evidence].filter((p) => p && String(p).trim());
  return parts.join('\n\n');
}

/**
 * Synthesize an answer for a classified reasoning task using portfolio
 * entity attributes. Returns markdown string or null.
 */
export function synthesizeReasoning(classification, query, ctx = {}) {
  const task = classification?.task;
  if (!task || task === 'compare_passthrough') return null;

  const profiles = buildProjectProfiles();
  const stack = getStack();
  const arch = getArchitecture();
  const profile = getProfile();
  const byId = (id) => profiles.find((p) => p.id === id);
  const qf = byId('queryforge');
  const pp = byId('placementpro');
  const rr = byId('reporadar');
  const nm = (p) => (p ? `**${p.name}**` : 'a shipped project');
  const strategy = classification.strategy;

  const decision = (conclusion, reasoning, evidence) => {
    if (DECISION_FIRST_STRATEGIES.has(strategy)) {
      return formatDecisionFirst({ conclusion, reasoning, evidence });
    }
    return [conclusion, reasoning, evidence].filter(Boolean).join('\n\n');
  };

  switch (task) {
    case 'capabilities':
      return [
        `I can explain Sudhanshu's projects, compare technologies, discuss architecture and trade-offs, answer recruiter questions, judge which work best demonstrates a skill, match a job description against his stack, and run lightweight interview practice.`,
        `Capabilities in practice: ${ASSISTANT_CAPABILITIES.map((c) => c.label).join(', ')}.`,
        `If something isn't in his portfolio, I'll say so instead of guessing.`,
      ].join('\n\n');

    case 'identity':
      return [
        `I'm SRIIVERSE AI — a private guide to ${profile.name}'s portfolio.`,
        synthesizeReasoning({ strategy: 'Summarize', task: 'capabilities' }, query, ctx),
      ].join('\n\n');

    case 'assistant_mechanism':
      return "I run entirely in this page — I reason from Sudhanshu's portfolio content that's already here, and I don't call an external API. I stay inside what's actually in the portfolio, and I'll tell you plainly when something isn't covered.";

    case 'faang_interview': {
      // Prefer schema/correctness depth for FAANG-style technical loops.
      const pick = qf || topByAttribute(profiles, 'softwareEngineering');
      return decision(
        `I'd put ${nm(pick)} in front of a FAANG-style interviewer.`,
        `That kind of interview rewards depth of systems thinking, correctness under constraints, and clear trade-offs — not just a pretty demo. ${nm(qf)} combines backend architecture, schema-aware SQL/AI reasoning, and production deployment; it's the strongest "software engineering" story in the set.`,
        `${nm(rr)} is the better live walkthrough if they want open-source code on the table (${rr?.project?.repo}). ${nm(pp)} is secondary unless the role is product/platform for career tooling.`,
      );
    }

    case 'recruiter_impress': {
      const pick = topByAttribute(profiles, 'recruiterImpact') || rr;
      return decision(
        `For a recruiter, lead with ${nm(pick)}.`,
        `Recruiters respond to a live URL, a modern stack story, and something they can click in under a minute. ${nm(rr)} ships publicly, is open-sourced, and splits FastAPI + React/TypeScript cleanly.`,
        `Keep ${nm(qf)} ready if they ask about data/AI rigor, and ${nm(pp)} if the role leans product.`,
      );
    }

    case 'keep_two': {
      // Keep deepest engineering + strongest inspectable full-stack signal.
      const keep = [qf, rr].filter(Boolean);
      const drop = pp;
      return decision(
        `If he could only keep two, I'd keep ${nm(keep[0])} and ${nm(keep[1])}.`,
        `Together they cover the deepest engineering signal (schema-aware systems + correctness) and the strongest full-stack/open-source signal (inspectable live product). That pair maximizes what a technical hiring loop can probe.`,
        `I'd drop ${nm(drop)} last — it's a real shipped product with strong product UX, but relative to the other two it adds less unique engineering depth for a constrained portfolio.`,
      );
    }

    case 'best_engineering': {
      const pick = qf || topByAttribute(profiles, 'softwareEngineering');
      return decision(
        `I'd choose ${nm(pick)}.`,
        `It demonstrates the strongest software engineering because it combines backend architecture, SQL optimization, AI reasoning grounded in a real schema, production deployment, and thoughtful system design — not just feature count.`,
        `Among the portfolio projects, it best showcases end-to-end engineering. ${nm(rr)} is close on architecture/split-stack; ${nm(pp)} leads on product workflow design.`,
      );
    }

    case 'best_work': {
      const pick = topByAttribute(profiles, 'recruiterImpact') || rr;
      return decision(
        `I'd lead with ${nm(pick)}.`,
        `It's the clearest full-system story: live product, modern split stack, and inspectable code where available.`,
        `${nm(qf)} is the deepest domain play; ${nm(pp)} shows product thinking — but ${pick?.name} is the strongest "here's the work" signal.`,
      );
    }

    case 'most_difficult': {
      const domainHard = rankByAttribute(profiles, 'databases')[0] || qf;
      const chosen = domainHard;
      return decision(
        `Technically, ${nm(chosen)} is the hardest problem domain.`,
        `Natural language → SQL, execution-plan awareness, and schema-grounded explanations require correctness against a real database model — a stricter bar than summarization-style intelligence.`,
        `${nm(rr)} is operationally complex (foreign-repo ingest + layered intelligence); ${nm(pp)} is orchestration-heavy. If "difficult" means correctness under schema constraints, QueryForge wins.`,
      );
    }

    case 'interview_first': {
      const pick = topByAttribute(profiles, 'recruiterImpact') || rr;
      return decision(
        `I'd open with ${nm(pick)}.`,
        `You can demo it live, walk the API/UI split, and go as deep as the interviewer wants${pick?.project?.repo ? ` — including the public repo` : ''}.`,
        `Then use ${nm(qf)} for data/AI correctness or ${nm(pp)} for product/platform roles.`,
      );
    }

    case 'demo_backend': {
      const ranked = rankByAttribute(profiles, 'backendDepth');
      return decision(
        `Backend engineering shows up most clearly in ${nm(ranked[0])} and ${nm(ranked[1])}.`,
        `Both center on Python services that own orchestration, APIs, and AI workflow control — the backend is the product brainstem, not a thin BFF.`,
        `${nm(rr)} also has a serious FastAPI core, but its story shares the spotlight with a TypeScript React surface.`,
      );
    }

    case 'demo_ai': {
      const ranked = rankByAttribute(profiles, 'aiUsage');
      return decision(
        `For AI engineering depth, I'd highlight ${nm(ranked[0])} first.`,
        `All three use LLMs, but they demonstrate different muscles: schema-aware correctness (${nm(qf)}), layered repo intelligence (${nm(rr)}), and resume-grounded planning (${nm(pp)}).`,
        `${nm(qf)} wins when "AI engineering" means grounding and correctness; ${nm(rr)} wins when it means productized, demoable intelligence layers.`,
      );
    }

    case 'demo_frontend': {
      const ranked = rankByAttribute(profiles, 'frontendDepth');
      return decision(
        `Frontend craft shows strongest in ${nm(ranked[0])}${ranked[1] ? ` and ${nm(ranked[1])}` : ''}.`,
        `React/TypeScript on RepoRadar and React on QueryForge are the clearest component-framework showcases.`,
        `${nm(pp)} ships a distinctive terminal-style surface — strong product UX, less of a classic React showcase.`,
      );
    }

    case 'eval_rest_apis': {
      const withRest = profiles.filter((p) => (p.project.stack || []).some((s) => /rest/i.test(s)));
      return decision(
        `Yes — he can design REST APIs.`,
        `Confidence is high because REST APIs appear across the shipped systems, not as a single bullet on a resume. The backend layer owns request orchestration and validation in the five-layer architecture; frontends talk to backends exclusively over REST.`,
        `Evidence: ${withRest.map((p) => nm(p)).join(', ') || 'all three projects'} list REST APIs in their stacks, with Flask/FastAPI services as the API owners.`,
      );
    }

    case 'backend_vs_frontend': {
      const back = stack.filter((s) => s.group === 'back').map((s) => s.name);
      const front = stack.filter((s) => s.group === 'front').map((s) => s.name);
      return decision(
        `He's stronger on the backend side.`,
        `All three production systems are built around Python services and APIs, with AI orchestration living in that backend layer. Frontend is real and shipped, but the center of gravity matches his title: ${profile.title}.`,
        `Backend signals: ${back.map((n) => `\`${n}\``).join(', ')}. Frontend signals: ${front.map((n) => `\`${n}\``).join(', ')} on QueryForge and RepoRadar. I'd call him a backend-leaning full-stack engineer — not frontend-only.`,
      );
    }

    case 'docker_experience': {
      const hasDocker = stack.some((s) => /docker/i.test(s.name));
      const deploy = arch.find((n) => n.id === 'deploy');
      if (!hasDocker) {
        return decision(
          `I won't invent Docker seniority that isn't evidenced.`,
          `What I can say is the deployment layer in his architecture includes container-friendly production hosting.`,
          deploy?.sub || 'Docker · Vercel · Netlify appear at the portfolio architecture level.',
        );
      }
      return decision(
        `Yes — Docker is part of how he ships.`,
        `It's listed in the stack and sits in the deployment layer alongside Vercel, Netlify, and Render. I won't claim years of ops tenure that aren't stated.`,
        deploy?.desc || 'Containerized, reproducible deploys are part of the architecture model.',
      );
    }

    case 'database_strength': {
      const take = TECH_TAKES.find((x) => x.category === 'database');
      const data = stack.filter((s) => /postgres|mongo/i.test(s.name)).map((s) => `\`${s.name}\``);
      const pick = topByAttribute(profiles, 'databases') || qf;
      return decision(
        `At the portfolio level he lists both ${data.join(' and ') || '`PostgreSQL` and `MongoDB`'} — with the strongest database-thinking signal in ${nm(pick)}.`,
        take?.preference || 'Postgres is the default when relational integrity matters; Mongo when document flexibility wins.',
        take?.groundingNote
          || `${nm(qf)} demonstrates SQL generation, plan awareness, and schema-grounded assistance even though per-project stack cards don't always pin a single DB vendor.`,
      );
    }

    case 'scalable_backend':
      return decision(
        `Yes — within the scope of what he's actually shipped.`,
        `The shared pattern is a Python API layer, REST boundaries, an AI reasoning layer over real inputs, and deployable frontends — a solid foundation for scaling a service.`,
        `I won't invent multi-region ops or Kafka-scale claims. What the portfolio shows: backends as correctness owners in a five-layer topology, with live deployments on Netlify/Vercel/Render.`,
      );

    case 'production_ready':
      return decision(
        `Yes — for the kind of work this portfolio shows.`,
        `Three systems are live with public URLs. That's a stronger production signal than private prototypes.`,
        `Readiness here means: design a service, integrate AI carefully, deploy. It does not automatically mean staff-architect tenure for a Fortune-500 mesh — that would be inventing seniority.`,
      );

    case 'weakest_area':
      return decision(
        `Relative to what's evidenced, the softest public signal is deep ops / cloud-native breadth — not core product engineering.`,
        `Strengths first: he ships three live AI systems, owns Python backends with REST APIs, and keeps AI grounded in real inputs across a consistent five-layer architecture.`,
        `Limitations I can defend from the portfolio (not invented personality flaws): Kubernetes/AWS-style infra isn't claimed; per-project database vendors aren't always pinned in public stack cards; observability/ops storytelling is thinner than the product/AI story. Ask about a specific gap if you're hiring for it — I'll say honestly whether it appears here.`,
      );

    case 'learn_next':
      return decision(
        `The highest-leverage next signals (inferred from what's present vs absent — not a plan he wrote) are sharper data-store pinning, more async/API-first depth beyond RepoRadar, and clearer observability/ops storytelling.`,
        `That would make the already-strong backend + AI story even easier to hire against.`,
        `I won't invent a curriculum. Name a stack gap (Kubernetes, Kafka, etc.) and I'll tell you whether it appears here.`,
      );

    case 'startup_fit':
      return decision(
        `Yes — he'd fit a startup that needs someone to ship backend + applied AI end to end.`,
        `Startups reward ownership and speed-to-live. Three production AI products, a consistent architecture, and full-stack finish are exactly that pattern.`,
        `Less ideal as the *only* hire for pure mobile, deep ML research, or infra-only SRE — those aren't what this portfolio demonstrates.`,
      );

    case 'backend_team_fit':
      return decision(
        `Yes — a backend / platform team is a natural fit.`,
        `The portfolio's center of gravity is Python services, REST APIs, and AI orchestration with the backend as correctness owner.`,
        `Evidence: Flask/FastAPI across shipped systems; title ${profile.title}; frontend present but secondary.`,
      );

    case 'product_oriented':
      return decision(
        `He's product-capable, with engineering as the primary identity.`,
        `${nm(pp)} especially shows product workflow thinking (resume → gaps → roadmap as a "Placement.OS"). Overall though, the portfolio reads engineer-who-ships-products more than product-manager-who-codes.`,
        `Hire him for building the system; expect product judgment as a bonus, not the main signal.`,
      );

    case 'why_hire':
      return decision(
        `Hire him because he ships real systems — three live AI products, not slideware.`,
        `He thinks in backend correctness and applied AI: Python services, REST APIs, and an architecture where the model reasons over real data instead of hallucinating product behavior.`,
        `Best proof: open ${nm(rr)} for the modern full-stack demo, then ${nm(qf)} if you care about data/AI rigor.`,
      );

    case 'justify_best_project':
      return synthesizeReasoning({ strategy: 'Rank', task: 'best_engineering' }, query, ctx);

    case 'why_flask': {
      const take = TECH_TAKES.find((x) => x.category === 'backend-framework');
      return decision(
        `Flask is the right call on ${nm(qf)} and ${nm(pp)} — smaller surface, explicit request-lifecycle control for backend + AI orchestration.`,
        take?.preference || `FastAPI is the better default for async/API-first work (as on ${nm(rr)}).`,
        `Evidence: Flask on QueryForge and Placement Pro+; FastAPI on RepoRadar.`,
      );
    }

    case 'why_fastapi': {
      const take = TECH_TAKES.find((x) => x.category === 'backend-framework');
      return decision(
        `${nm(rr)} ships FastAPI for an API-first intelligence service with I/O-heavy GitHub ingestion.`,
        take?.preference || 'For new async/API-first services, FastAPI is the default.',
        `Evidence: FastAPI + React/TypeScript split on RepoRadar.`,
      );
    }

    case 'why_react': {
      const take = TECH_TAKES.find((x) => x.category === 'frontend-framework');
      return decision(
        `React is what the shipped UIs actually use — especially ${nm(qf)} and ${nm(rr)}.`,
        take?.preference || "Ecosystem depth and what's already in production beat speculative alternatives.",
        `Vue isn't part of this stack today.`,
      );
    }

    case 'why_postgres': {
      const take = TECH_TAKES.find((x) => x.category === 'database');
      return decision(
        `Postgres is the default when relational integrity and schema-aware work matter — which is exactly ${nm(qf)}'s world.`,
        take?.preference || 'Mongo earns a place when document flexibility wins.',
        take?.groundingNote || 'Both appear at portfolio architecture level; per-project pins are thinner in public stack cards.',
      );
    }

    case 'arch_why': {
      const layers = arch.map((n) => `**${n.label}** (${n.sub})`).join(' → ');
      return [
        `The architecture is a deliberate five-layer split: ${layers}.`,
        `Why: each layer has one job. Frontend talks over REST; backend owns auth, validation, and orchestration; AI reasons over real data; the database is source of truth; deployment stays reproducible.`,
        `Same topology across ${nm(qf)}, ${nm(pp)}, and ${nm(rr)}.`,
      ].join('\n\n');
    }

    case 'arch_tradeoffs':
      return [
        `The main trade-off of the five-layer model is operational overhead: more moving parts than a monolith, in exchange for clear ownership — especially keeping AI from becoming a blind generator.`,
        `If rebuilt tomorrow, the pressure points already implied by the portfolio are deeper observability, tighter per-project data-store pinning, and more async/API-first patterns where I/O dominates (the direction ${nm(rr)} already took).`,
        `I won't invent a rewrite plan he hasn't written down.`,
      ].join('\n\n');

    case 'arch_scale':
      return [
        `They scale along the seams the architecture already defines: horizontalize Python API workers, keep AI as a reasoning service over real inputs, keep the frontend a thin REST client.`,
        `Live deployments show production hosting, not laptop demos. Exact QPS/SLA numbers aren't published — I won't invent them.`,
      ].join('\n\n');

    case 'about_sudhanshu':
      return [
        `${profile.name} is a ${profile.title}. ${profile.tagline}`,
        `He ships intelligent systems end to end: ${profiles.map((p) => nm(p)).join(', ')} — all live, sharing a five-layer architecture where AI reasons over real data.`,
        `Center of gravity: Python backend + applied AI, with enough frontend to finish the product.`,
      ].join('\n\n');

    case 'portfolio_different':
      return decision(
        `What makes this portfolio memorable is that it ships three live AI systems under one architectural philosophy — not a list of screenshots.`,
        `Frontend → backend → AI → data → deploy, with AI treated as a reasoning layer over real inputs.`,
        `You can click demos. That's the difference.`,
      );

    case 'strongest_decision':
      return decision(
        `The strongest engineering decision is treating AI as a reasoning layer over real data — not a blind text generator.`,
        `That choice shows up in QueryForge's schema-aware SQL work, Placement Pro+'s resume-anchored advice, and RepoRadar's layered repo intelligence.`,
        `It keeps products useful and keeps the architecture honest.`,
      );

    case 'tech_frequency': {
      const counts = {};
      for (const p of getAllProjects()) {
        for (const s of p.stack || []) counts[s] = (counts[s] || 0) + 1;
      }
      const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const top = ranked.filter(([, c]) => c >= 2).map(([s, c]) => `\`${s}\` (${c}/3)`);
      const allThree = ranked.filter(([, c]) => c === 3).map(([s]) => `\`${s}\``);
      return [
        `Most repeated across shipped projects: ${top.join(', ')}.`,
        allThree.length ? `In all three: ${allThree.join(', ')}.` : '',
        `Portfolio-wide he also lists PostgreSQL, MongoDB, Docker, Vercel, Netlify, Render.`,
      ].filter(Boolean).join('\n\n');
    }

    case 'design_philosophy':
      return [
        `Common design philosophy: **clear layer ownership, AI grounded in real inputs, ship the whole product.**`,
        `Frontend is a REST client. Backend owns correctness. AI decides against real schema/resume/repo context. Data stays source of truth. Deploy is reproducible.`,
        `Same spine across ${profiles.map((p) => nm(p)).join(', ')}.`,
      ].join('\n\n');

    case 'engineer_type':
      return decision(
        `He's a backend-leaning full-stack engineer with applied AI as a product skill — matching ${profile.title}.`,
        `Not a research scientist, not a pure frontend specialist.`,
        `Someone who builds Python services, wires AI into real workflows, and ships the UI when the product needs it.`,
      );

    case 'best_role':
      return decision(
        `Best fit: Python backend / AI platform / full-stack product engineer roles where shipping matters.`,
        `Especially strong for API design, LLM orchestration grounded in real data, and honest architecture.`,
        `Less ideal as a first hire for pure mobile, deep ML research, or infra-only SRE.`,
      );

    case 'strengths':
      return [
        `Strengths that are actually evidenced:`,
        `- **Shipping** — three production AI systems online`,
        `- **Backend systems** — Flask/FastAPI, REST, orchestration`,
        `- **Applied AI** — LLMs as a reasoning layer over real inputs`,
        `- **Full-stack finish** — React/TypeScript where the product needs it`,
        `- **Architectural consistency** — same five-layer philosophy across projects`,
      ].join('\n\n');

    default:
      return null;
  }
}
