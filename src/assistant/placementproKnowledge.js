import { cueMatches } from './queryforgeKnowledge.js';

/**
 * placementproKnowledge.js — CODE-PROVEN Placement Pro+ engineering facets.
 *
 * Source: Phase 2B audit + D:\Placement-Pro implementation. Confidence is
 * "documented" only for facts verified there. Design-intent items stay "unknown".
 *
 * Placement Pro+ is not a generative LLM product. Do not invent why-technology
 * choices. Do not describe it as the generic SRIIVERSEAI five-layer architecture.
 */

export const PLACEMENTPRO_PROJECT_ID = 'placementpro';
export const PLACEMENTPRO_NAME = 'Placement Pro+';

/**
 * @typedef {object} PlacementProFacet
 * @property {string} id
 * @property {string} facet
 * @property {string} depth  overview | mechanics | architecture | judgment | unknown
 * @property {string} title
 * @property {string} text
 * @property {string[]} cues
 * @property {'documented'|'unknown'} confidence
 * @property {string} source
 */

/** @type {PlacementProFacet[]} */
export const PLACEMENTPRO_FACETS = [
  {
    id: 'pp-purpose',
    facet: 'purpose',
    depth: 'overview',
    title: 'Placement Pro+ — Purpose',
    confidence: 'documented',
    source: 'code-audit:Placement-Pro+live',
    cues: [
      // Anchored so "What is Placement Pro's <specific property>?" cannot
      // inherit the product overview.
      '^what is placement pro\\+?\\s*[?.!]*$',
      'purpose',
      'what does placement pro',
      'placement\\.os',
      'career guidance platform',
    ],
    text: [
      'Placement Pro+ is a placement-preparation product branded as Placement.OS.',
      'Verified behavior: a student registers/logs in, saves a structured profile (skills, CGPA, target role), then uses a dashboard for skill-gap analysis, a deterministic 12-week roadmap, heuristic placement probability, and in-memory company matching.',
      'Live frontend: placement-pro.netlify.app. Intelligence is embeddings + a skill graph + heuristics/templates — not a chat LLM that generates the roadmap.',
    ].join(' '),
  },
  {
    id: 'pp-user-flow',
    facet: 'user_flow',
    depth: 'mechanics',
    title: 'Placement Pro+ — User flow',
    confidence: 'documented',
    source: 'code-audit:frontend',
    cues: [
      'user flow',
      'what does a user',
      'before using',
      'login then',
      'profile form',
      'protected route',
    ],
    text: [
      'Verified user flow: register or login → JWT tokens stored in sessionStorage → protected React routes.',
      'The student fills a structured ProfileForm (skills, CGPA, target role, and related fields) — not a resume-file upload/parser.',
      'The dashboard then calls backend APIs for prediction, skill-gap, roadmap, and company matches, keeping the generated roadmap in React state.',
    ].join(' '),
  },
  {
    id: 'pp-dataflow-profile',
    facet: 'data_flow.profile',
    depth: 'mechanics',
    title: 'Placement Pro+ — Profile data flow',
    confidence: 'documented',
    source: 'code-audit:frontend+backend',
    cues: [
      'profile data flow',
      'save profile',
      'what data does placement',
      'user profile skills',
      'structured profile',
    ],
    text: [
      'Profile data flow (verified): the frontend posts a structured profile to the Flask API. SQLAlchemy persists auth_users and users (profile fields such as skills, CGPA, target role).',
      'There is no resume parser in the inspected implementation. Skill-gap intelligence reads the stored skill list, not a PDF/DOCX resume.',
      'Subsequent dashboard calls pass a user_id in the JSON body; that id is not checked against the JWT subject (see authentication limitations).',
    ].join(' '),
  },
  {
    id: 'pp-dataflow-dashboard',
    facet: 'data_flow.dashboard',
    depth: 'mechanics',
    title: 'Placement Pro+ — Dashboard data flow',
    confidence: 'documented',
    source: 'code-audit:frontend+routes',
    cues: [
      'dashboard data flow',
      'how does placement pro actually work',
      'how does it actually work',
      'walk (me )?through.{0,40}(flow|pipeline|under)',
      'under the hood',
      'request flow',
    ],
    text: [
      'Dashboard data flow (verified): after profile save, the UI calls Flask routes under /api (prediction, skill-gap, roadmap, companies) with Axios + a bearer interceptor.',
      'Skill-gap: profile skills → MiniLM embeddings vs graph node names (cosine ~0.60) or exact-string fallback → mapped nodes → NetworkX shortest path from "Programming Logic" toward the target role → drop already-mapped nodes → missing skills + heuristic readiness.',
      'Roadmap: missing nodes → deterministic week templates padded to 12 weeks, returned in the HTTP response and kept in React state — not written to SQL.',
      'This is not the generic SRIIVERSEAI five-layer architecture and is not a generative LLM pipeline.',
    ].join(' '),
  },
  {
    id: 'pp-architecture',
    facet: 'architecture',
    depth: 'architecture',
    title: 'Placement Pro+ — Architecture',
    confidence: 'documented',
    source: 'code-audit:Placement-Pro',
    cues: [
      'placement.{0,40}architecture',
      'architecture of placement',
      'how is placement.{0,20}structured',
      'how (was|is) placement.{0,30}built',
      'placement.{0,20}(tech )?stack',
      'react 19',
      'vite 8',
      'application factory',
    ],
    text: [
      'Verified implementation architecture (not the generic five-layer portfolio diagram):',
      'Frontend: React 19, TypeScript, Vite 8, React Router 7, Tailwind 3, Axios, Framer Motion, Recharts.',
      'Backend: Flask 3.1 application factory, Gunicorn, blueprints at /api and /api/auth.',
      'Persistence: SQLAlchemy; SQLite by default, PostgreSQL when DATABASE_URL is set.',
      'Cache: Redis when configured/available, otherwise cachetools TTLCache.',
      'Intelligence: NetworkX DiGraph + SentenceTransformers all-MiniLM-L6-v2 + cosine similarity + deterministic heuristics/templates.',
    ].join(' '),
  },
  {
    id: 'pp-ai-model',
    facet: 'ai_model',
    depth: 'architecture',
    title: 'Placement Pro+ — Intelligence / model behavior',
    confidence: 'documented',
    source: 'code-audit:vector_service+ai_engine',
    cues: [
      'what model',
      'which model',
      'minilm',
      'all-minilm',
      'sentence.?transform',
      'does it use an llm',
      'does placement.{0,20}use.{0,20}(an? )?(llm|gemini|groq|openai)',
      'embedding',
      'cosine',
      'generative',
      'chat model',
    ],
    text: [
      'Placement Pro+ does not use Gemini, Groq, or OpenAI to generate roadmaps or skill-gap text.',
      'all-MiniLM-L6-v2 (SentenceTransformers) performs semantic skill mapping: profile skill strings are embedded and compared to graph node names with cosine similarity (threshold approximately 0.60).',
      'MiniLM is not a chat model and not a generative LLM.',
      'If vector initialization fails, mapping falls back to exact string matching.',
      'Readiness is heuristic. Placement probability is heuristic/sigmoid-based. The roadmap is deterministic templates from missing graph nodes — not an LLM.',
    ].join(' '),
  },
  {
    id: 'pp-skill-gap',
    facet: 'skill_gap',
    depth: 'mechanics',
    title: 'Placement Pro+ — Skill-gap pipeline',
    confidence: 'documented',
    source: 'code-audit:ai_engine+graph_service+vector_service',
    cues: [
      'skill.?gap',
      'skill gap analysis',
      'how does skill-gap',
      'walk (me )?through.{0,40}skill',
      'missing skills',
      'mapped graph nodes',
      'semantic skill',
    ],
    text: [
      'Verified skill-gap pipeline: user profile skills → semantic embedding against graph node names → cosine similarity (~0.60) or exact-match fallback → mapped graph nodes → nx.shortest_path on a hardcoded networkx.DiGraph from "Programming Logic" toward the target role → remove already-mapped nodes → derive missing skills → heuristic readiness → skill-gap response.',
      'Unknown target role defaults to Backend Engineer.',
      'This is not "AI analyzes your resume." There is no resume parser in the implementation.',
    ].join(' '),
  },
  {
    id: 'pp-roadmap',
    facet: 'roadmap_generation',
    depth: 'mechanics',
    title: 'Placement Pro+ — Roadmap generation',
    confidence: 'documented',
    source: 'code-audit:ai_engine+frontend',
    cues: [
      'generate.{0,20}roadmap',
      'roadmap.{0,20}generat',
      'how is.{0,20}(the )?roadmap',
      'how is that generated',
      '12 week',
      'project phase & placement prep',
      'is the roadmap stored',
      'roadmap stored',
    ],
    text: [
      'The roadmap is generated from missing graph nodes using deterministic templates, then padded to 12 weeks.',
      'Later weeks may use the template "Project Phase & Placement Prep".',
      'The backend returns the roadmap to the frontend; it is not persisted in SQL. The frontend keeps it in React state.',
      'There is no LLM roadmap generation, no persistent roadmap history, no stored progress tracking, and no adaptive learning history in the inspected code.',
    ].join(' '),
  },
  {
    id: 'pp-prereq',
    facet: 'prerequisite_logic',
    depth: 'mechanics',
    title: 'Placement Pro+ — Prerequisite / graph path logic',
    confidence: 'documented',
    source: 'code-audit:graph_service',
    cues: [
      'prerequisite',
      'knowledge graph',
      'networkx',
      'shortest_path',
      'programming logic',
      'does placement.{0,20}use.{0,20}(a )?knowledge graph',
      'hardcoded.{0,12}graph',
    ],
    text: [
      'The skill graph is a hardcoded networkx.DiGraph in process memory — not a separate graph database.',
      'Path generation uses nx.shortest_path. The starting root is "Programming Logic". Already-mapped nodes are removed from the remaining path.',
      'If the path is empty, the implementation falls back to the hardcoded skills "System Design" and "Cloud Architecture".',
    ].join(' '),
  },
  {
    id: 'pp-company',
    facet: 'company_matching',
    depth: 'mechanics',
    title: 'Placement Pro+ — Company matching',
    confidence: 'documented',
    source: 'code-audit:company_service',
    cues: [
      'company matching',
      'company catalog',
      'job.?board',
      'cgpa gate',
      'skill overlap',
      'how does company matching',
    ],
    text: [
      'Company matching uses an in-memory catalog of 10 companies — not a live job-board API.',
      'A CGPA gate applies, plus a minimum skill-overlap threshold. The endpoint returns the top 6 matches.',
      'The catalog is Python memory, not SQL.',
    ].join(' '),
  },
  {
    id: 'pp-api',
    facet: 'api_surface',
    depth: 'architecture',
    title: 'Placement Pro+ — API surface',
    confidence: 'documented',
    source: 'code-audit:routes+auth',
    cues: [
      'api surface',
      'which endpoint',
      '/api/auth',
      '/api/',
      'skill.?gap endpoint',
      'roadmap endpoint',
    ],
    text: [
      'Verified HTTP surface is Flask blueprints under /api (dashboard intelligence: prediction, skill-gap, roadmap, companies) and /api/auth (register, login, me, refresh).',
      'The frontend uses Axios against VITE_API_URL when set; otherwise a documented fallback host. Exact production VITE_API_URL is not CODE-PROVEN here.',
    ].join(' '),
  },
  {
    id: 'pp-database',
    facet: 'database',
    depth: 'architecture',
    title: 'Placement Pro+ — Persistence',
    confidence: 'documented',
    source: 'code-audit:models',
    cues: [
      'what database',
      'what data does placement',
      'sqlite',
      'postgres',
      'sqlalchemy',
      'auth_users',
      'persisted',
      'how is the roadmap stored',
    ],
    text: [
      'SQLAlchemy persists auth_users and users. Default DB is SQLite; PostgreSQL is used when DATABASE_URL is configured. Whether production actually uses Postgres is UNKNOWN.',
      'Not persisted in SQL: roadmap, progress history, skill history, company catalog, and the skill graph.',
      'Company catalog is in-process Python. The graph is NetworkX in process. Roadmaps are generated and returned, then held in React state.',
    ].join(' '),
  },
  {
    id: 'pp-auth',
    facet: 'authentication',
    depth: 'mechanics',
    title: 'Placement Pro+ — Authentication',
    confidence: 'documented',
    source: 'code-audit:auth+AuthContext',
    cues: [
      'how does authentication',
      'how does auth',
      'how does login',
      'how are users authenticated',
      'how are users logged in',
      'jwt',
      'bcrypt',
      'refresh token',
      'sessionstorage',
      'bearer interceptor',
      '/api/auth/me',
      'register',
      'login',
    ],
    text: [
      'Verified auth: register and login; bcrypt password hashing; JWT access token and JWT refresh token; GET /api/auth/me; protected frontend routes; tokens in sessionStorage; Axios bearer interceptor.',
      'There is no automatic refresh-on-401: a 401 logs the frontend session out rather than silently rotating tokens.',
      'Security caveat (CODE-PROVEN): user_id supplied in request bodies is not checked against JWT identity, so an authenticated caller may query another profile id.',
    ].join(' '),
  },
  {
    id: 'pp-caching',
    facet: 'caching',
    depth: 'architecture',
    title: 'Placement Pro+ — Caching',
    confidence: 'documented',
    source: 'code-audit:cache.py',
    cues: [
      'caching',
      'redis',
      'ttlcache',
      'cachetools',
      'ttl',
    ],
    text: [
      'Cache backend is Redis when configured/available; otherwise cachetools TTLCache. Redis is not proven as the production cache.',
      'Documented TTLs: prediction 600s, companies 900s, skill_gap 600s, roadmap 1200s.',
    ].join(' '),
  },
  {
    id: 'pp-validation',
    facet: 'validation',
    depth: 'mechanics',
    title: 'Placement Pro+ — Validation',
    confidence: 'documented',
    source: 'code-audit:schemas+routes',
    cues: [
      'validation',
      '422',
      'marshmallow',
      'invalid profile',
    ],
    text: [
      'Request/schema validation failures return HTTP 422.',
      'Auth conflict/bad input uses 409/400 as implemented. Missing user records return 404.',
    ].join(' '),
  },
  {
    id: 'pp-failure',
    facet: 'failure_modes',
    depth: 'judgment',
    title: 'Placement Pro+ — Failure handling',
    confidence: 'documented',
    source: 'code-audit:backend+frontend',
    cues: [
      'what happens when minilm fails',
      'minilm fail',
      'vector initialization',
      'when redis fails',
      'rate limit',
      '429',
      '401',
      '500',
      'cors',
      'empty graph path',
      'what happens when',
    ],
    text: [
      'Verified failure handling: validation → 422; missing user → 404; authentication failures → 401/409/400; rate limit → 429; DB failure → 500.',
      'Vector initialization failure → exact string matching fallback. Redis failure → cachetools TTLCache fallback.',
      'Frontend network/CORS errors → toast. Frontend 401 → logout. Frontend 429/5xx → toast.',
      'Empty graph path → hardcoded fallback skills "System Design" and "Cloud Architecture".',
    ].join(' '),
  },
  {
    id: 'pp-limitations',
    facet: 'limitations',
    depth: 'judgment',
    title: 'Placement Pro+ — Limitations',
    confidence: 'documented',
    source: 'code-audit',
    cues: [
      'limitation',
      'resume parser',
      'parse(s|d|ing)? (the |a |my )?resume',
      'analyz(e|es|ing) (the |a |my )?resume',
      'progress tracking',
      'live job',
      'ai-generated roadmap',
      'does placement.{0,20}parse',
    ],
    text: [
      'Verified limitations: no resume parser; no generative LLM roadmap; no live job-board integration; roadmap/progress/skill history are not SQL-persisted; company catalog is 10 in-memory rows; graph is a hardcoded DiGraph.',
      'Authenticated user_id in bodies is not bound to JWT identity.',
      'Production use of Postgres, Redis, Sentry, and whether MiniLM actually loads on the public host are UNKNOWN.',
    ].join(' '),
  },
  {
    id: 'pp-deployment',
    facet: 'deployment',
    depth: 'architecture',
    title: 'Placement Pro+ — Deployment',
    confidence: 'documented',
    source: 'code-audit:netlify.toml+render.yaml',
    cues: [
      'deploy',
      'deployment',
      'netlify',
      'huggingface',
      'render.yaml',
      'gunicorn',
      'vite_api_url',
      'hosted',
    ],
    text: [
      'Frontend is deployed on Netlify (placement-pro.netlify.app). Backend packaging includes Gunicorn; render.yaml describes a Render service; frontend env can point at a Hugging Face Spaces API fallback.',
      'Exact production VITE_API_URL (HF vs Render vs other) is UNKNOWN. Why Netlify / HF / Render were chosen is UNKNOWN.',
    ].join(' '),
  },
  {
    id: 'pp-unknowns',
    facet: 'explicit_unknowns',
    depth: 'unknown',
    title: 'Placement Pro+ — Explicit unknowns',
    confidence: 'unknown',
    source: 'code-audit:gaps',
    cues: [
      'why .{0,40}(flask|minilm|networkx|netlify|render|huggingface|redis|sqlite).{0,20}chosen',
      'why flask',
      'why minilm',
      'why networkx',
      'why (netlify|render|huggingface)',
      'hardest (engineering )?problem',
      'hardest part',
      'what was the hardest',
      'trade-?off',
      'lessons learned',
      'what would you improve',
      'intended improvements',
      'production qps',
      'placement prediction accuracy',
      'hiring outcomes',
    ],
    text: [
      'These Placement Pro+ details are not CODE-PROVEN FACT: why Flask, MiniLM, or NetworkX were chosen; why Netlify/HF/Render were chosen; hardest engineering problem; trade-offs; lessons learned; intended improvements; production QPS; actual placement-prediction accuracy; actual hiring outcomes; whether production uses Postgres, Redis, or Sentry; whether MiniLM is loaded on the public deployment; and the exact production VITE_API_URL.',
      'I will not invent those motives or metrics from the implementation.',
    ].join(' '),
  },
];

export function isPlacementProQuery(query) {
  return /placement.?pro|placementpro|placement\.os/i.test(String(query || ''));
}

export function isStandalonePlacementAuthQuery(query) {
  const t = String(query || '').trim();
  if (!t) return false;
  if (/queryforge|reporadar|schema_def|generate-sql/i.test(t)) return false;
  return /how does (authentication|auth|login) work\??$/i.test(t)
    || /how are users (authenticated|logged in)\??$/i.test(t);
}

export function hasPlacementProSignal(query) {
  const t = String(query || '');
  if (isPlacementProQuery(t)) return true;
  if (isStandalonePlacementAuthQuery(t)) return true;
  if (/all-minilm|minilm-l6|sentence.?transformers/i.test(t)) return true;
  if (/programming logic/i.test(t) && /graph|shortest|skill/i.test(t)) return true;
  if (/\/api\/auth\/me|skill_gap|generate.?roadmap/i.test(t)) return true;
  if (/ttlcache/i.test(t) && /roadmap|skill.?gap/i.test(t)) return true;
  return false;
}

function isDesignIntentQuery(t) {
  return /why .{0,48}(flask|minilm|networkx|netlify|render|huggingface|redis|sqlite|postgres).{0,32}(chosen|choose|chose|picked|prefer)|why (was|is|did).{0,24}(flask|minilm|networkx|netlify|render)\b|why flask|why minilm|why networkx|why netlify|why render|design intent|hardest (engineering )?problem|hardest part|what was the hardest|lessons learned|what would you improve|trade-?off|intended improvements/i.test(t);
}

/**
 * Match a Placement Pro+ facet. Design-intent → unknowns when scoped.
 * @returns {PlacementProFacet|null}
 */
export function matchPlacementProFacet(query) {
  const t = String(query || '').toLowerCase();
  if (!t.trim()) return null;
  if (/queryforge|schema_def|generate-sql/i.test(t) && !isPlacementProQuery(t)) return null;
  if (/reporadar|repo.?radar/i.test(t) && !isPlacementProQuery(t)) return null;

  const scoped = hasPlacementProSignal(t);

  if (isStandalonePlacementAuthQuery(t)) {
    const auth = PLACEMENTPRO_FACETS.find((f) => f.id === 'pp-auth');
    if (auth) return auth;
  }

  if (isDesignIntentQuery(t) && scoped) {
    const unk = PLACEMENTPRO_FACETS.find((f) => f.id === 'pp-unknowns');
    if (unk) return unk;
  }

  if (scoped && /resume/i.test(t) && /pars|analy/i.test(t)) {
    const lim = PLACEMENTPRO_FACETS.find((f) => f.id === 'pp-limitations');
    if (lim) return lim;
  }

  if (scoped && /roadmap/i.test(t) && /generat|stored|persist|12 week|template/i.test(t)) {
    const rm = PLACEMENTPRO_FACETS.find((f) => f.id === 'pp-roadmap');
    if (rm) return rm;
  }

  if (scoped && /\b(llm|gemini|groq|openai|minilm|what model|which model|embedding)\b/i.test(t)
    && !/skill.?gap flow|walk .{0,20}skill/i.test(t)) {
    const ai = PLACEMENTPRO_FACETS.find((f) => f.id === 'pp-ai-model');
    if (ai) return ai;
  }

  const depthRank = { unknown: 0, overview: 1, judgment: 2, architecture: 3, mechanics: 4 };
  let best = null;
  let bestScore = 0;
  // "Placement Pro's Kubernetes…" is a specific property, not the overview.
  const specificProperty = /\bplacement\s*pro\+?['’]s\s+(?!purpose\b)\S+/i.test(t);

  for (const facet of PLACEMENTPRO_FACETS) {
    if (facet.confidence === 'unknown' && !scoped) continue;
    if (facet.depth === 'overview' && specificProperty) continue;
    let hits = 0;
    for (const cue of facet.cues) {
      if (cueMatches(cue, t)) hits += 1;
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
    const standaloneOk = ['failure_modes', 'ai_model', 'limitations', 'skill_gap', 'roadmap_generation', 'authentication', 'prerequisite_logic'].includes(best.facet)
      && bestScore >= 20;
    if (!standaloneOk) return null;
  }
  return best;
}

export function getPlacementProFacetDocs() {
  return PLACEMENTPRO_FACETS.map((f) => ({
    id: f.id,
    kind: 'project-detail',
    projectId: PLACEMENTPRO_PROJECT_ID,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tagsText: `${PLACEMENTPRO_NAME} placementpro placement pro ${f.facet} ${f.depth} ${f.cues.join(' ')} ${f.title}`,
    source: f.source,
    link: 'https://placement-pro.netlify.app/login',
  }));
}
