/**
 * reporadarKnowledge.js — CODE-PROVEN RepoRadarAI engineering facets.
 *
 * Source: Phase 2C audit of https://github.com/sriiverse/RepoRadar HEAD c22530bf
 * plus live host repoai.sriiverseai.vercel.app. Confidence is "documented"
 * only for facts verified there. Design-intent items stay "unknown".
 *
 * RepoRadar is a GitHub metadata health/activity tool. It is not FastAPI,
 * not Python, not an LLM product, and it does not read target source files.
 */

export const REPORADAR_PROJECT_ID = 'reporadar';
export const REPORADAR_NAME = 'RepoRadarAI';

/**
 * @typedef {object} RepoRadarFacet
 * @property {string} id
 * @property {string} facet
 * @property {string} depth  overview | mechanics | architecture | judgment | unknown
 * @property {string} title
 * @property {string} text
 * @property {string[]} cues
 * @property {'documented'|'unknown'} confidence
 * @property {string} source
 */

/** @type {RepoRadarFacet[]} */
export const REPORADAR_FACETS = [
  {
    id: 'rr-purpose',
    facet: 'purpose',
    depth: 'overview',
    title: 'RepoRadarAI — Purpose',
    confidence: 'documented',
    source: 'code-audit:sriiverse/RepoRadar@c22530bf',
    cues: [
      'what is reporadar',
      'purpose',
      'what does reporadar',
      'github repository intelligence',
      'health.?activity',
    ],
    text: [
      'RepoRadarAI is a GitHub repository health and activity intelligence tool.',
      'The inspected implementation analyzes GitHub metadata (commits, contributors, PRs, issues, releases, Linguist language bytes), not the target repository\'s source files.',
      'It computes heuristic health, activity, maintenance, community, and stability scores, bus factor, collapse/risk heuristics, language distribution, and a client-side PDF export.',
      'It is not a code X-ray and it does not understand the internal architecture of the target repository.',
      'Live UI: repoai.sriiverseai.vercel.app. Source: github.com/sriiverse/RepoRadar.',
    ].join(' '),
  },
  {
    id: 'rr-user-flow',
    facet: 'user_flow',
    depth: 'mechanics',
    title: 'RepoRadarAI — User flow',
    confidence: 'documented',
    source: 'code-audit:LandingPage+page.tsx+repoStore',
    cues: [
      'user flow',
      'how does reporadar work',
      'how does it work',
      'how does reporadar analyze a repository',
      'what exactly does reporadar analyze',
      'scan repository',
      'what does a user',
    ],
    text: [
      'Verified user flow: the visitor pastes a public GitHub owner/repo or github.com/owner/repo URL on the landing page and submits Scan.',
      'The UI fetches GET /api/analyze?url=… while playing a timed visual sequence, then writes the JSON into Zustand and shows the dashboard (health, bus factor, heatmap, PRs/issues, languages, releases, rule-based verdict, PDF).',
      'There is no login, no analysis history, and no conversational Q&A about the target repository\'s source.',
      'The landing "LIVE DEMO" facebook/react panel is a simulated preview, not a live analyze call.',
    ].join(' '),
  },
  {
    id: 'rr-ingestion',
    facet: 'repository_ingestion',
    depth: 'mechanics',
    title: 'RepoRadarAI — Repository ingestion',
    confidence: 'documented',
    source: 'code-audit:urlParser.ts+analyze/route.ts',
    cues: [
      'ingest',
      'clone',
      'does reporadar clone',
      'zip',
      'file tree',
      'source.?code',
      'source files',
      'does it analyze the source',
      'readme fetch',
      'ast',
      'owner/repo',
      'parseGitHubUrl',
    ],
    text: [
      'Ingestion is URL parsing, not cloning. The user supplies owner/repo or github.com/owner/repo (optional https, www, .git, extra path). parseGitHubUrl extracts owner and repo, then GET /api/analyze?url=… calls Octokit GitHub REST.',
      'There is no git clone, no ZIP download, no file-tree walk, no source-file ingestion, no README fetch, and no AST analysis.',
      'Analysis is metadata-based. Private repositories typically surface as repository-not-found (HTTP 404, "Make sure it\'s public"). There is no user-facing private-repository login flow.',
    ].join(' '),
  },
  {
    id: 'rr-github',
    facet: 'github_integration',
    depth: 'mechanics',
    title: 'RepoRadarAI — GitHub integration',
    confidence: 'documented',
    source: 'code-audit:lib/github.ts',
    cues: [
      'github integration',
      'what does reporadar (actually )?fetch',
      'what does it fetch',
      'octokit',
      'repos\\.get',
      'listCommits',
      'github rest',
      'github api',
    ],
    text: [
      'GitHub access is @octokit/rest with optional process.env.GITHUB_TOKEN.',
      'Verified calls: repos.get; repos.listCommits (since last 365 days, per_page 100, max 10 pages, up to 1000 commits); repos.listContributors (max 30); pulls.list (open per_page 1, closed per_page 30); issues.listForRepo (30 open + 30 closed); repos.listReleases (max 10); repos.listLanguages (GitHub Linguist bytes); rateLimit.get.',
      'There are no tree, file, or blob APIs. This is not full-repository analysis.',
      'Many individual GitHub fetch errors are swallowed into empty arrays or zeros. Open PR totals may be wrong because the code reads an x-total header GitHub often does not send.',
    ].join(' '),
  },
  {
    id: 'rr-scoring',
    facet: 'scoring',
    depth: 'mechanics',
    title: 'RepoRadarAI — Health scoring',
    confidence: 'documented',
    source: 'code-audit:lib/metrics.ts',
    cues: [
      'health score',
      'how does reporadar calculate',
      'calculate health',
      'how is that calculated',
      'scoring formula',
      'activity score',
      'maintenance score',
      'community score',
      'stability score',
    ],
    text: [
      'Health is a heuristic 0–100 total from four 0–25 buckets — not an ML prediction.',
      'Activity: last four week commit totals, min(25, round(recentCommits/50 * 25)), saturating at 50 commits in those four weeks.',
      'Maintenance: merge-time and issue-timing heuristics — min(25, round(max(0, 15 − avgMergeDays) + max(0, 10 − avgIssueDays))).',
      'Community: min(15, round(contributors.length/2)) plus min(10, round(log10(stars+1)*3)), with contributors capped at the 30 fetched.',
      'Stability: min(15, releases.length) plus bus-factor points (LOW 10, MEDIUM 7, HIGH 3, else 0).',
      'Labels: ≥80 EXCELLENT, ≥60 GOOD, ≥40 FAIR, ≥20 POOR, else CRITICAL.',
    ].join(' '),
  },
  {
    id: 'rr-bus-factor',
    facet: 'bus_factor',
    depth: 'mechanics',
    title: 'RepoRadarAI — Bus factor',
    confidence: 'documented',
    source: 'code-audit:lib/busFactor.ts',
    cues: [
      'bus factor',
      'how does bus factor',
      'contributor concentration',
      'collapse probability',
    ],
    text: [
      'Bus factor is a heuristic on listed GitHub contributor counts (max 30), not a learned model.',
      'It is the minimum number of contributors whose cumulative listed contributions exceed 50% of that list.',
      'Risk mapping: ≥5 LOW, ≥3 MEDIUM, ≥2 HIGH, otherwise CRITICAL. Empty contributors yield bus factor 0 and CRITICAL.',
      'A separate UI collapse-probability heuristic mixes bus factor and top-contributor percentage; it is not a calibrated survival model.',
    ].join(' '),
  },
  {
    id: 'rr-recommendations',
    facet: 'recommendations',
    depth: 'judgment',
    title: 'RepoRadarAI — Verdicts and recommendations',
    confidence: 'documented',
    source: 'code-audit:VerdictPanel.tsx+ExportCard.tsx+AiVerdict.tsx',
    cues: [
      'recommendation',
      'verdict',
      'suitability',
      'ai verdict',
      '96%',
      'readme 9\\.4',
    ],
    text: [
      'Dashboard verdicts, suitability ratings, recommended actions, and PDF summaries are rule-based heuristics in VerdictPanel and ExportCard — not validated accuracy, not ML confidence, and not statistically calibrated probabilities.',
      'UI "confidence" numbers (for example PDF min(99, 88 + bonuses)) are extra heuristics, not model confidence.',
      'The landing-page AI Adoption Verdict (CONFIDENCE INDEX 96%, README 9.4/10, RECOMMENDED) is canned demo copy and is not tied to scan results.',
    ].join(' '),
  },
  {
    id: 'rr-ai-model',
    facet: 'ai_model',
    depth: 'architecture',
    title: 'RepoRadarAI — AI / model behavior',
    confidence: 'documented',
    source: 'code-audit:package.json+VerdictPanel+AiVerdict',
    cues: [
      'what model',
      'which model',
      'does reporadar use an llm',
      'does reporadar use.{0,20}(gemini|groq|openai|ollama)',
      'embedding',
      'vector (db|database)',
      'rag',
      'does reporadar use ai',
      'use (an? )?ai',
      'llm',
    ],
    text: [
      'The current implementation does not use a generative AI model.',
      'There is no Gemini, Groq, OpenAI, Ollama, embeddings pipeline, vector database, RAG, or prompt pipeline in the inspected RepoRadar source.',
      'The dashboard "AI Verdict" is a rule engine. The landing-page AI verdict animation uses canned constants and is not fed by /api/analyze.',
    ].join(' '),
  },
  {
    id: 'rr-architecture',
    facet: 'architecture',
    depth: 'architecture',
    title: 'RepoRadarAI — Architecture',
    confidence: 'documented',
    source: 'code-audit:package.json+app/api/analyze/route.ts',
    cues: [
      'reporadar.{0,40}architecture',
      'architecture of reporadar',
      'how is reporadar.{0,20}structured',
      'how (was|is) reporadar.{0,30}built',
      'reporadar.{0,20}(tech )?stack',
      'next\\.js',
      'does reporadar use fastapi',
      'fastapi.{0,20}reporadar',
      'python backend',
    ],
    text: [
      'Verified implementation architecture (not the generic SRIIVERSEAI five-layer diagram, and not a Python/FastAPI split):',
      'Frontend: Next.js 14 App Router, React 18, TypeScript, Tailwind, Framer Motion, React Three Fiber, Recharts, Zustand.',
      'Backend: the same Next.js app — Node runtime route GET /api/analyze.',
      'Services: lib/github.ts, lib/metrics.ts, lib/busFactor.ts, lib/urlParser.ts, lib/cache.ts.',
      'No separate Python backend, Flask, FastAPI, workers, queues, or database.',
      'This stack describes RepoRadar itself. It does not analyze the target repository\'s internal architecture.',
    ].join(' '),
  },
  {
    id: 'rr-data-flow',
    facet: 'data_flow',
    depth: 'mechanics',
    title: 'RepoRadarAI — Data flow',
    confidence: 'documented',
    source: 'code-audit:route.ts+repoStore.ts',
    cues: [
      'data flow',
      'what data does reporadar',
      'request flow',
      'under the hood',
      'how is repository data stored',
      'analysis history',
    ],
    text: [
      'Input: a GitHub repository URL string. Fetched: GitHub metadata via Octokit, not file contents.',
      'Derived: health, bus factor, repo age, release cadence, language percentages, activity weeks, PR/issue metrics, risk heuristics, verdict/recommendations, and client PDF data.',
      'Persistence: no durable database and no analysis history. Cache is an in-memory Map (1-hour TTL). The browser keeps the last result in Zustand until refresh.',
    ].join(' '),
  },
  {
    id: 'rr-api',
    facet: 'api_surface',
    depth: 'architecture',
    title: 'RepoRadarAI — API surface',
    confidence: 'documented',
    source: 'code-audit:app/api/analyze/route.ts',
    cues: [
      'api surface',
      '/api/analyze',
      'which endpoint',
      'analyze endpoint',
    ],
    text: [
      'Verified product API: GET /api/analyze?url=… on the Next.js Node runtime.',
      'Same-origin from the UI. No other inspected REST surface, no auth, no workers.',
    ].join(' '),
  },
  {
    id: 'rr-caching',
    facet: 'caching',
    depth: 'mechanics',
    title: 'RepoRadarAI — Caching',
    confidence: 'documented',
    source: 'code-audit:lib/cache.ts',
    cues: [
      'cache',
      'caching',
      'in-memory map',
      'ttl',
      'vercel kv',
    ],
    text: [
      'Caching is an in-process Map keyed as repo:owner:repo with a 1-hour TTL (3600 seconds).',
      'A code comment says it may be upgraded to Vercel KV; that upgrade is not implemented in the inspected tree.',
      'On serverless hosts this cache is per instance, not a shared database.',
    ].join(' '),
  },
  {
    id: 'rr-security',
    facet: 'security',
    depth: 'judgment',
    title: 'RepoRadarAI — Security',
    confidence: 'documented',
    source: 'code-audit:route.ts+github.ts+urlParser.ts',
    cues: [
      'security',
      'authentication',
      'private repositor',
      'ssrf',
      'github token',
      'GITHUB_TOKEN',
      'security evaluated',
    ],
    text: [
      'There is no application authentication or authorization. Optional GitHub access uses GITHUB_TOKEN from the server environment; the token is not sent to the browser (rate-limit remaining/limit/reset are returned).',
      'The parser accepts GitHub owner/repo shapes and then Octokit talks to GitHub\'s API — it does not fetch arbitrary user URLs as HTTP origins.',
      'Private or missing repos typically return 404 with a public-repo message. No target repository files are downloaded.',
      'The "Security Evaluated" landing badge is marketing. RepoRadar is not a security scanner.',
    ].join(' '),
  },
  {
    id: 'rr-privacy',
    facet: 'privacy',
    depth: 'judgment',
    title: 'RepoRadarAI — Privacy',
    confidence: 'documented',
    source: 'code-audit:cache.ts+repoStore.ts+github.ts',
    cues: [
      'privacy',
      'what data is stored',
      'user data',
      'sent to (ai|llm|openai|gemini)',
    ],
    text: [
      'Target repository content is not stored because it is never fetched. Analysis JSON lives in an in-memory Map and in the visitor\'s Zustand state — no user accounts, no history table.',
      'Nothing is sent to Gemini, Groq, OpenAI, or Ollama; those providers are not in this product.',
      'Whether a production GITHUB_TOKEN is configured is UNKNOWN.',
    ].join(' '),
  },
  {
    id: 'rr-failure',
    facet: 'failure_modes',
    depth: 'judgment',
    title: 'RepoRadarAI — Failure handling',
    confidence: 'documented',
    source: 'code-audit:analyze/route.ts+LandingPage+live',
    cues: [
      'failure',
      'what happens when',
      'rate limit',
      '404',
      '429',
      '500',
      'invalid github',
      'facebook/react',
    ],
    text: [
      'Verified API handling: missing url → 400; invalid GitHub URL → 400; not found/private → 404; GitHub 403 or rate-limit message → 429; other server errors → 500.',
      'Partial GitHub failures often become empty arrays or zeros and still return a score. Commits cap at 1000/365 days; contributors at 30; PRs/issues/releases are capped. Cache expiry refetches GitHub. Landing fetch failure shows a UI error. Unsupported language is not a dedicated rejection.',
      'During the Phase 2C audit, live GET /api/analyze?url=facebook/react returned HTTP 500. The production cause of that 500 is UNKNOWN — do not infer rate limit vs runtime error.',
    ].join(' '),
  },
  {
    id: 'rr-limitations',
    facet: 'limitations',
    depth: 'judgment',
    title: 'RepoRadarAI — Limitations',
    confidence: 'documented',
    source: 'code-audit',
    cues: [
      'limitation',
      'does it analyze architecture',
      'architecture of the target',
      'internal architecture',
      'dependency graph',
      'code x-ray',
      'generative documentation',
    ],
    text: [
      'Verified limitations: no clone or source ingest; no AST; no embeddings/RAG/LLM; no target-repo architecture graph; no generative documentation; no conversational explanations of code; no user history; contributor/commit/PR/issue/release caps; heuristic scores without published accuracy.',
      'Landing canned metrics (96% confidence, README 9.4/10) must not be treated as scan output.',
    ].join(' '),
  },
  {
    id: 'rr-deployment',
    facet: 'deployment',
    depth: 'architecture',
    title: 'RepoRadarAI — Deployment',
    confidence: 'documented',
    source: 'code-audit:live+package.json',
    cues: [
      'deploy',
      'deployment',
      'vercel',
      'hosted',
      'repoai.sriiverseai',
    ],
    text: [
      'CODE-PROVEN: the Next.js app exists; GET /api/analyze exists; the live host repoai.sriiverseai.vercel.app serves this UI.',
      'Same-origin API: https://repoai.sriiverseai.vercel.app/api/analyze. The hostname is consistent with a Vercel deployment of this Next.js app.',
      'UNKNOWN: production GITHUB_TOKEN, exact Vercel project/env, CI/CD, and the cause of the audited live 500. GitHub homepage repo-radar-three.vercel.app returned 404 at audit time.',
    ].join(' '),
  },
  {
    id: 'rr-unknowns',
    facet: 'explicit_unknowns',
    depth: 'unknown',
    title: 'RepoRadarAI — Explicit unknowns',
    confidence: 'unknown',
    source: 'code-audit:gaps',
    cues: [
      'why .{0,40}(next\\.?js|octokit|vercel|scoring|fastapi).{0,20}chosen',
      'why next\\.?js',
      'why vercel',
      'why octokit',
      'why these scoring',
      'why (did you|was) .{0,20}(choose|chosen)',
      'hardest (engineering )?problem',
      'hardest part',
      'what was the hardest',
      'trade-?off',
      'lessons learned',
      'what would you improve',
      'design intent',
    ],
    text: [
      'These RepoRadarAI details are not CODE-PROVEN FACT: why Next.js, Octokit, Vercel, or these scoring formulas were chosen; hardest engineering problem; trade-offs; lessons learned; intended improvements; production scale; score accuracy; user count.',
      'The inspected implementation is Next.js 14 + Octokit GitHub REST + heuristics — not FastAPI/Python and not an LLM. I will not invent motives or claim FastAPI exists here.',
    ].join(' '),
  },
];

export function isRepoRadarQuery(query) {
  return /reporadar|repo.?radar/i.test(String(query || ''));
}

export function hasRepoRadarSignal(query) {
  const t = String(query || '');
  if (isRepoRadarQuery(t)) return true;
  if (/\/api\/analyze/i.test(t)) return true;
  if (/\boctokit\b/i.test(t)) return true;
  if (/\bbus factor\b/i.test(t)) return true;
  if (/health score/i.test(t)) return true;
  if (/why .{0,32}next\.?js|why next\.?js/i.test(t)) return true;
  if (/why octokit/i.test(t)) return true;
  if (/github integration/i.test(t)) return true;
  if (/private repositor/i.test(t)) return true;
  if (/how is repository data stored/i.test(t)) return true;
  return false;
}

function isDesignIntentQuery(t) {
  return /why .{0,48}(next\.?js|octokit|vercel|scoring|fastapi|python).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(next\.?js|octokit|vercel|fastapi)\b|why next\.?js|why vercel|why octokit|why these scoring|design intent|hardest (engineering )?problem|hardest part|what was the hardest|lessons learned|what did you learn|what would you improve|trade-?off|intended improvements/i.test(t);
}

/**
 * Match a RepoRadar facet. Design-intent → unknowns when scoped.
 * @returns {RepoRadarFacet|null}
 */
export function matchRepoRadarFacet(query) {
  const t = String(query || '').toLowerCase();
  if (!t.trim()) return null;
  if (/queryforge|schema_def|generate-sql/i.test(t) && !isRepoRadarQuery(t)) return null;
  if (/placement.?pro|placementpro|minilm/i.test(t) && !isRepoRadarQuery(t)) return null;

  const scoped = hasRepoRadarSignal(t);

  if (isDesignIntentQuery(t) && scoped) {
    const unk = REPORADAR_FACETS.find((f) => f.id === 'rr-unknowns');
    if (unk) return unk;
  }

  if (scoped && /\b(llm|gemini|groq|openai|ollama|what model|which model|embedding|rag|vector database|use (an? )?ai)\b/i.test(t)
    && !/health score|bus factor|formula|fastapi/i.test(t)) {
    const ai = REPORADAR_FACETS.find((f) => f.id === 'rr-ai-model');
    if (ai) return ai;
  }

  if (scoped && /clone|zip|source code|source files|file tree|\bast\b|readme fetch/i.test(t)) {
    const ing = REPORADAR_FACETS.find((f) => f.id === 'rr-ingestion');
    if (ing) return ing;
  }

  if (scoped && /analy[sz]e.{0,40}architecture|architecture of the target|internal architecture|code x-ray|dependency graph/i.test(t)) {
    const lim = REPORADAR_FACETS.find((f) => f.id === 'rr-limitations');
    if (lim) return lim;
  }

  if (scoped && /analy[sz]e a repository/i.test(t)) {
    const ing = REPORADAR_FACETS.find((f) => f.id === 'rr-ingestion');
    if (ing) return ing;
  }

  if (scoped && /fastapi|python backend|five-layer/i.test(t) && !isDesignIntentQuery(t)) {
    const arch = REPORADAR_FACETS.find((f) => f.id === 'rr-architecture');
    if (arch) return arch;
  }

  if (scoped && /bus factor/i.test(t)) {
    const bus = REPORADAR_FACETS.find((f) => f.id === 'rr-bus-factor');
    if (bus) return bus;
  }

  if (scoped && /health score|how is that calculated|scoring formula/i.test(t)) {
    const sc = REPORADAR_FACETS.find((f) => f.id === 'rr-scoring');
    if (sc) return sc;
  }

  if (scoped && /what (does|did).{0,20}fetch|octokit|github (rest|api|integration)/i.test(t)) {
    const gh = REPORADAR_FACETS.find((f) => f.id === 'rr-github');
    if (gh) return gh;
  }

  const depthRank = { unknown: 0, overview: 1, judgment: 2, architecture: 3, mechanics: 4 };
  let best = null;
  let bestScore = 0;

  for (const facet of REPORADAR_FACETS) {
    if (facet.confidence === 'unknown' && !scoped) continue;
    let hits = 0;
    for (const cue of facet.cues) {
      try {
        if (new RegExp(cue, 'i').test(t)) hits += 1;
      } catch {
        if (t.includes(String(cue).toLowerCase())) hits += 1;
      }
    }
    if (!hits) continue;
    const score = hits * 10 + (depthRank[facet.depth] || 0);
    if (score > bestScore) {
      bestScore = score;
      best = facet;
    }
  }

  if (!best) return null;
  if (!scoped) {
    const standaloneOk = ['failure_modes', 'ai_model', 'limitations', 'scoring', 'bus_factor', 'github_integration', 'repository_ingestion'].includes(best.facet)
      && bestScore >= 20;
    if (!standaloneOk) return null;
  }
  return best;
}

export function getRepoRadarFacetDocs() {
  return REPORADAR_FACETS.map((f) => ({
    id: f.id,
    kind: 'project-detail',
    projectId: REPORADAR_PROJECT_ID,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tagsText: `${REPORADAR_NAME} reporadar repo radar ${f.facet} ${f.depth} ${f.cues.join(' ')} ${f.title}`,
    source: f.source,
    link: 'https://repoai.sriiverseai.vercel.app/',
  }));
}
