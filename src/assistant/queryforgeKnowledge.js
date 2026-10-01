/**
 * queryforgeKnowledge.js — CODE-PROVEN QueryForgeAI engineering facets.
 *
 * Source: inspected AI-SQL-Optimizer implementation + live Netlify/Render
 * deployment contract (Phase 2A audit). Confidence is "documented" only for
 * facts verified in that audit. Design-intent items stay "unknown".
 *
 * Do not invent why-technology choices. Do not promote portfolio marketing
 * claims that contradict the inspected implementation.
 */

export const QUERYFORGE_PROJECT_ID = 'queryforge';
export const QUERYFORGE_NAME = 'QueryForgeAI';

/**
 * @typedef {object} QueryForgeFacet
 * @property {string} id
 * @property {string} facet
 * @property {string} depth  overview | mechanics | architecture | judgment | unknown
 * @property {string} title
 * @property {string} text   Spoken FACT answer for the Digital Brain
 * @property {string[]} cues Regex-source strings (case-insensitive) for matching
 * @property {'documented'|'unknown'} confidence
 * @property {string} source
 */

/** @type {QueryForgeFacet[]} */
export const QUERYFORGE_FACETS = [
  {
    id: 'qf-purpose',
    facet: 'purpose',
    depth: 'overview',
    title: 'QueryForgeAI — Purpose',
    confidence: 'documented',
    source: 'code-audit:AI-SQL-Optimizer+live',
    cues: [
      'what is queryforge',
      'purpose',
      'what does queryforge do',
      'sql generator',
      'sql optimizer',
    ],
    text: [
      'QueryForgeAI is a SQL/Mongo query generator and optimizer product.',
      'Verified modes: Generator (natural language + user-provided schema → query) and Optimizer (paste SQL/pipeline → analysis + suggestions).',
      'Live frontend: queryforge-sriiverse.netlify.app. Production API host: sql-optimizer-backend.onrender.com.',
    ].join(' '),
  },
  {
    id: 'qf-user-flow',
    facet: 'user_flow',
    depth: 'mechanics',
    title: 'QueryForgeAI — User flow',
    confidence: 'documented',
    source: 'code-audit:frontend',
    cues: [
      'user flow',
      'user provide',
      'user provides',
      'user input',
      'what does a user',
      'before generating',
      'before the ai can generate',
      'actual user inputs',
    ],
    text: [
      'Before generating SQL, the user provides three things in the Generator UI: (1) dialect (postgresql, mysql, sqlite, or mongodb), (2) schema_def — pasted DDL/schema text, not a live DB connection, and (3) a natural-language question.',
      'On the Optimizer path, the user provides dialect plus the SQL or Mongo pipeline text to analyze, then runs Analyze.',
    ].join(' '),
  },
  {
    id: 'qf-dataflow-overview',
    facet: 'data_flow',
    depth: 'mechanics',
    title: 'QueryForgeAI — Data flow (generator + optimizer)',
    confidence: 'documented',
    source: 'code-audit:frontend+backend',
    cues: [
      'actual data flow',
      'data flow of',
      'request flow of',
      'how does queryforge actually work',
      'how does it actually work',
      'how does queryforge.{0,40}actually generate',
      'walk (me )?through.{0,40}(flow|generat)',
    ],
    text: [
      'Verified QueryForgeAI data flows have two cloud paths.',
      'Generator: user dialect + pasted schema_def + natural-language question → POST /generate-sql { schema_def, question, dialect } → Gemini/Groq/demo with schema string in prompt → parsed query + explanation. No live DB schema introspection.',
      'Optimizer: user SQL/pipeline + dialect → POST /analyze { query, dialect } → Gemini/Groq/demo returns synthetic plan JSON + suggestions (or heuristic demo). No live DB connection and no real EXPLAIN/EXPLAIN ANALYZE on the cloud path.',
    ].join(' '),
  },
  {
    id: 'qf-dataflow-generator',
    facet: 'data_flow.generator',
    depth: 'mechanics',
    title: 'QueryForgeAI — Generator data flow',
    confidence: 'documented',
    source: 'code-audit:frontend+backend',
    cues: [
      'generate-sql',
      'generator',
      'schema_def',
      'schema come from',
      'where does the.*schema',
      'natural-language',
      'natural language',
      'generate sql',
      'actually generate',
      'final sql',
      'complete flow',
      'from user input',
      'user input to',
      'what queryforge.*receives',
      'request body',
      'payload',
    ],
    text: [
      'Generator data flow (verified): browser collects dialect + schema_def + question → POST /generate-sql to sql-optimizer-backend.onrender.com with body { schema_def, question, dialect }.',
      'The backend injects the user-provided schema_def string into the LLM prompt context (when an LLM key is configured). It does not introspect or connect to a live database to obtain schema on this path.',
      'Primary model when configured: Google Gemini gemini-flash-latest. On Gemini HTTP 429, Groq llama-3.3-70b-versatile may be used when configured. Without an LLM key, demo/heuristic generation is used.',
      'The model response is parsed into a query string plus explanation and returned to the UI. MongoDB has a static post-parse validator that may add warnings; SQL has no equivalent AST/runtime validator in the inspected code.',
    ].join(' '),
  },
  {
    id: 'qf-dataflow-optimizer',
    facet: 'data_flow.optimizer',
    depth: 'mechanics',
    title: 'QueryForgeAI — Optimizer data flow',
    confidence: 'documented',
    source: 'code-audit:frontend+backend',
    cues: [
      'optimizer',
      '/analyze',
      'execution plan',
      'explain analyze',
      'explain\\s+analyze',
      'does the optimizer',
      'actually execute explain',
    ],
    text: [
      'Optimizer data flow (verified): browser sends POST /analyze with body { query, dialect } to sql-optimizer-backend.onrender.com.',
      'The cloud path does not connect to the user\'s database and does not execute real EXPLAIN or EXPLAIN ANALYZE against a database.',
      'When Gemini is configured, the model is asked to return JSON with a synthetic execution-plan summary, suggestions, an optimized query, and an explanation.',
      'Without an LLM key, demo/heuristic analysis is used. Results are stored in in-process history.',
    ].join(' '),
  },
  {
    id: 'qf-architecture',
    facet: 'architecture',
    depth: 'architecture',
    title: 'QueryForgeAI — Architecture',
    confidence: 'documented',
    source: 'code-audit:AI-SQL-Optimizer',
    cues: [
      'queryforge.{0,40}architecture',
      'architecture of queryforge',
      'fastapi.{0,20}uvicorn',
      'built with flask',
      'is queryforge.{0,20}flask',
      'queryforge.{0,30}flask',
      'queryforge.{0,30}fastapi',
      'queryforge.{0,20}(tech )?stack',
      'how is queryforge structured',
      'uvicorn',
    ],
    text: [
      'Verified implementation architecture: React + Vite/React Router frontend on Netlify; FastAPI + Uvicorn backend on Render (service sql-optimizer-backend).',
      'It is not Flask in the inspected implementation — portfolio wording that says Flask for QueryForgeAI is outdated relative to the code.',
      'Primary AI: Google Gemini. Optional failover: Groq. Optional local CLI agent over WebSocket.',
      'No database drivers or migrations appear in the inspected backend requirements for the free cloud path.',
    ].join(' '),
  },
  {
    id: 'qf-ai-model',
    facet: 'ai_model',
    depth: 'architecture',
    title: 'QueryForgeAI — AI / model behavior',
    confidence: 'documented',
    source: 'code-audit:backend',
    cues: [
      'what model',
      'which model',
      'gemini',
      'groq',
      'llm',
      'llama',
      'model does queryforge',
      'gemini-flash',
    ],
    text: [
      'Primary model when configured: Google Gemini, model id gemini-flash-latest.',
      'On Gemini HTTP 429, the backend may fall back to Groq llama-3.3-70b-versatile if GROQ_API_KEY is configured.',
      'If no LLM key is present, the backend uses demo/heuristic generation and analysis instead of calling a model.',
      'For generation, the user-provided schema_def string is included as prompt context.',
    ].join(' '),
  },
  {
    id: 'qf-api',
    facet: 'api_surface',
    depth: 'architecture',
    title: 'QueryForgeAI — API surface',
    confidence: 'documented',
    source: 'code-audit:backend/main.py',
    cues: [
      'api surface',
      'endpoints?',
      'which endpoint',
      '/health',
      '/generate-sql',
      '/analyze',
      'websocket',
      '/history',
    ],
    text: [
      'Verified API surface: GET / ; GET /health ; GET /ping ; POST /analyze ; POST /generate-sql ; WebSocket /ws/agent/{client_id} ; POST /agent/execute ; POST /agent/execution-result ; GET /history.',
      'Public analyze/generate endpoints have no user authentication in the inspected code.',
    ].join(' '),
  },
  {
    id: 'qf-failure',
    facet: 'failure_modes',
    depth: 'judgment',
    title: 'QueryForgeAI — Failure handling',
    confidence: 'documented',
    source: 'code-audit:backend+frontend',
    cues: [
      'failure',
      'fails',
      'error',
      'when gemini fails',
      'gemini fail',
      'rate limit',
      '429',
      'what happens when',
      '500',
      'parse',
    ],
    text: [
      'Verified failure handling: Gemini 429 can trigger Groq fallback when configured.',
      'Failed response parsing returns an ERROR query/result with an explanation string.',
      'Uncaught endpoint exceptions return HTTP 500.',
      'Frontend fetch failures currently have limited rich error UI (console error + loading cleared).',
      'Missing LLM keys fall through to demo/heuristic mode.',
    ].join(' '),
  },
  {
    id: 'qf-limitations',
    facet: 'limitations',
    depth: 'judgment',
    title: 'QueryForgeAI — Limitations',
    confidence: 'documented',
    source: 'code-audit',
    cues: [
      'limitation',
      'limitations',
      'connect to my database',
      'connect to (a |the |my )?database',
      'live database',
      'inspect a live',
      'does queryforge connect',
    ],
    text: [
      'Verified limitations of the free cloud path: no live database connection; no real EXPLAIN / EXPLAIN ANALYZE against a database; SQL validation is limited compared with MongoDB\'s static checks; history is in-memory; public analyze/generate APIs have no user auth.',
      'The PRO/CLI path markets local true EXPLAIN, but the inspected CLI simulates execution rather than running a real DB EXPLAIN layer.',
    ].join(' '),
  },
  {
    id: 'qf-validation',
    facet: 'validation',
    depth: 'mechanics',
    title: 'QueryForgeAI — Validation',
    confidence: 'documented',
    source: 'code-audit:generator.py',
    cues: [
      'validation',
      'validator',
      'validate',
      'bad sql',
      'syntax',
    ],
    text: [
      'MongoDB generation runs a static post-parse validator that can append warnings into the explanation.',
      'SQL dialects do not have an equivalent SQL AST/runtime validator in the inspected code.',
      'Prompt rules constrain generation, but prompt constraints are not runtime validation.',
    ].join(' '),
  },
  {
    id: 'qf-deployment',
    facet: 'deployment',
    depth: 'architecture',
    title: 'QueryForgeAI — Deployment',
    confidence: 'documented',
    source: 'code-audit:render.yaml+netlify',
    cues: [
      'deploy',
      'deployment',
      'netlify',
      'render',
      'hosted',
      'production host',
    ],
    text: [
      'Frontend is deployed on Netlify (queryforge-sriiverse.netlify.app).',
      'Backend is deployed on Render as sql-optimizer-backend, started with uvicorn.',
      'Local development uses backend port 8000; the frontend can poll /health there.',
    ].join(' '),
  },
  {
    id: 'qf-pro-agent',
    facet: 'pro_agent',
    depth: 'judgment',
    title: 'QueryForgeAI — PRO / CLI agent status',
    confidence: 'documented',
    source: 'code-audit:cli',
    cues: [
      'pro agent',
      'cli agent',
      'local agent',
      'websocket agent',
      'true explain',
      'localhost:5432',
    ],
    text: [
      'A Node CLI agent can connect over WebSocket (/ws/agent/{client_id}) and receive execute commands.',
      'In the inspected implementation, CLI execution is simulated (timed heuristic), not a completed real-database execution/EXPLAIN layer.',
      'Treat PRO “true local EXPLAIN” marketing as partial/simulated until a real DB driver path is verified.',
    ].join(' '),
  },
  {
    id: 'qf-unknowns',
    facet: 'explicit_unknowns',
    depth: 'unknown',
    title: 'QueryForgeAI — Explicit unknowns',
    confidence: 'unknown',
    source: 'code-audit:gaps',
    cues: [
      'why (was |is |did ).{0,40}(fastapi|flask|gemini|groq|netlify|render).{0,20}chosen',
      'why fastapi',
      'why gemini',
      'why netlify',
      'why render',
      'design intent',
      'why that architecture',
      'why (was|is) this architecture',
      'hardest engineering',
      'what would you improve',
      'lessons learned',
    ],
    text: [
      'Design-intent details for QueryForgeAI are not established as CODE-PROVEN FACT: why FastAPI was chosen, why Gemini was chosen, why Netlify/Render were chosen, hardest engineering problems, and intended future improvements.',
      'I will not invent those motives from the implementation.',
    ].join(' '),
  },
];

/**
 * True when the query is about QueryForge specifically, or uses QF-unique
 * engineering tokens that do not need the project name.
 */
export function hasQueryForgeSignal(query) {
  const t = String(query || '');
  if (isQueryForgeQuery(t)) return true;
  if (/schema_def|generate-sql|sql-optimizer-backend|gemini-flash-latest/i.test(t)) return true;
  if (/\/analyze\b/i.test(t) && /queryforge|optimizer|generate-sql|sql/i.test(t) && !/reporadar/i.test(t)) return true;
  if (/when gemini fails|gemini fail|gemini .{0,20}429|gemini .{0,24}(fallback|groq)/i.test(t)) return true;
  if (/\bgemini\b/i.test(t) && /\b(fail|fails|failed|429|fallback|groq)\b/i.test(t)) return true;
  if (/explain analyze/i.test(t) && /\b(optimizer|queryforge|sql)\b/i.test(t)) return true;
  return false;
}

/**
 * Match a QueryForge facet for a visitor query.
 * Prefers more cue hits, then deeper facets.
 * Returns null for generic portfolio questions (Why Flask?, Why React?) that
 * must not be captured by QueryForge architecture cues.
 * @returns {QueryForgeFacet|null}
 */
export function matchQueryForgeFacet(query) {
  const t = String(query || '').toLowerCase();
  if (!t.trim()) return null;
  if (/placement.?pro|placementpro|minilm|all-minilm/i.test(t) && !/queryforge|schema_def|generate-sql/i.test(t)) {
    return null;
  }
  if (/reporadar|repo.?radar/i.test(t) && !isQueryForgeQuery(t)) {
    return null;
  }

  const scoped = hasQueryForgeSignal(t);
  const designIntent = /why .{0,48}(fastapi|flask|gemini|groq|netlify|render).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(fastapi|flask|gemini|netlify|render)\b|why fastapi|why gemini|why netlify|why render|design intent|hardest engineering|lessons learned/i.test(t);

  // Design-intent → unknowns only when QueryForge-scoped (else generic why_* tasks).
  if (designIntent && scoped) {
    const unk = QUERYFORGE_FACETS.find((f) => f.id === 'qf-unknowns');
    if (unk) return unk;
  }

  // Prefer generator data-flow when the ask is explicitly about NL → SQL generation.
  if (scoped && /generat\w*.{0,40}sql|sql.{0,40}from.{0,40}(natural|question)|natural-?language question/i.test(t)
    && /flow|walk|how does|under the hood|from user input|final sql/i.test(t)) {
    const gen = QUERYFORGE_FACETS.find((f) => f.id === 'qf-dataflow-generator');
    if (gen) return gen;
  }

  const depthRank = { unknown: 0, overview: 1, judgment: 2, architecture: 3, mechanics: 4 };
  let best = null;
  let bestScore = 0;

  for (const facet of QUERYFORGE_FACETS) {
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
  // Unscoped queries may only hit failure/AI/limitation facets with strong cues.
  if (!scoped) {
    const standaloneOk = ['failure_modes', 'ai_model', 'limitations', 'validation', 'data_flow.optimizer'].includes(best.facet)
      && bestScore >= 20;
    if (!standaloneOk) return null;
  }
  return best;
}

export function isQueryForgeQuery(query) {
  return /queryforge|sql.?optimizer|generate sql|text-to-query|schema_def/i.test(String(query || ''));
}

/** Docs ready for knowledge.js indexing. */
export function getQueryForgeFacetDocs() {
  return QUERYFORGE_FACETS.map((f) => ({
    id: f.id,
    kind: 'project-detail',
    projectId: QUERYFORGE_PROJECT_ID,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tagsText: `${QUERYFORGE_NAME} queryforge ${f.facet} ${f.depth} ${f.cues.join(' ')} ${f.title}`,
    source: f.source,
    link: 'https://queryforge-sriiverse.netlify.app/',
  }));
}
