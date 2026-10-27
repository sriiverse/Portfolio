/**
 * content.js — Single source of truth for SRIIVERSEAI.
 * All copy is grounded in the live product demos and public profiles.
 * Nothing invented: where a value wasn't confirmable, a tasteful placeholder is used.
 */

export const PROFILE = {
  name: 'Sudhanshu Sinha',
  brand: 'SRIIVERSEAI',
  title: 'Python Backend Engineer · AI Developer · Full-Stack Engineer',
  tagline: 'Building Intelligent Software That Solves Real Problems.',
  email: 'sudhanshutheking183@gmail.com',
  github: 'https://github.com/sriiverse/Portfolio',
  githubHandle: 'sriiverse/Portfolio',
  linkedin: 'https://www.linkedin.com/in/sudhanshu-sinha-4619a429a/',
  // NOTE: résumé not provided as a file in this build — button is wired but
  // the asset is a placeholder until the real PDF is dropped into /assets.
  resume: './assets/resume.pdf',
  // PLACEHOLDER — replace with the real deployed domain. Mirrored manually
  // into index.html's canonical/OG/Twitter/JSON-LD tags and robots.txt /
  // sitemap.xml since this is a static, zero-build site (see README.md).
  siteUrl: 'https://sriiverseai.dev',
};

/**
 * Projects — verified against the three live deployments.
 * Tech lists reflect what the apps actually advertise; metrics are placeholders
 * marked clearly so they can be replaced with real numbers.
 */
export const PROJECTS = [
  {
    id: 'queryforge',
    index: '01',
    name: 'QueryForgeAI',
    title: 'AI-Powered SQL Query Optimization & Database Assistant',
    tagline: 'Optimize database queries at the speed of thought.',
    live: 'https://queryforge-sriiverse.netlify.app/',
    repo: null, // not publicly provided
    accent: '#38BDF8',
    accent2: '#6C63FF',
    theme: 'database',
    problem:
      'Writing efficient SQL is hard. Developers hand-write queries, hit slow execution plans, and then reverse-engineer why a query is slow — without tooling that actually explains or optimizes the SQL for them.',
    solution:
      'QueryForgeAI turns natural language plus user-provided schema/DDL text into SQL or Mongo queries, then analyzes pasted SQL/pipelines with Gemini (or demo heuristics) to return explanations, suggestions, and plan-shaped summaries. On the free cloud path it does not connect to a live database or execute real EXPLAIN/EXPLAIN ANALYZE.',
    features: [
      { icon: '💬', title: 'Natural Language → SQL', desc: 'Describe what you want in plain English; get executable SQL.' },
      { icon: '⚡', title: 'SQL Optimization', desc: 'Analyze pasted SQL/pipelines and surface optimization suggestions.' },
      { icon: '🔍', title: 'Query Explanation', desc: 'Return an explanation alongside generated or rewritten queries.' },
      { icon: '🧬', title: 'Schema Context', desc: 'Generator accepts user-provided schema/DDL text as prompt context — not live DB introspection.' },
      { icon: '🗄️', title: 'Multi-dialect Surface', desc: 'UI dialects include PostgreSQL, MySQL, SQLite, and MongoDB.' },
      { icon: '📊', title: 'Plan Visualization', desc: 'Optimizer UI renders plan-shaped results returned by the backend.' },
    ],
    stack: ['Python', 'FastAPI', 'LLMs', 'REST APIs', 'React', 'JavaScript', 'TailwindCSS'],
    decisions: [
      'Cloud backend is FastAPI + Uvicorn on Render; cloud frontend is React on Netlify.',
      'Generator schema context is user-provided schema_def text injected into the LLM prompt — not live database introspection.',
      'Cloud optimizer returns explanation + plan-shaped JSON from Gemini/demo heuristics; it does not execute real EXPLAIN against a user database.',
    ],
    metrics: [
      { k: 'Optimization', v: 'AI / heuristic analysis' },
      { k: 'Interface', v: 'Natural language + SQL' },
      { k: 'Surface', v: 'Modern dashboard' },
    ],
  },
  {
    id: 'placementpro',
    index: '02',
    name: 'Placement Pro+',
    title: 'Career Guidance & Placement Preparation Platform',
    tagline: 'Placement.OS — an operating system for getting placed.',
    live: 'https://placement-pro.netlify.app/login',
    repo: 'https://github.com/sriiverse/Placement-Pro',
    accent: '#7C3AED',
    accent2: '#4F46E5',
    theme: 'career',
    problem:
      'Placement preparation is fragmented. Students do not know which skills they are missing, which roles to target, or what to learn next — and generic advice ignores the skills they actually have.',
    solution:
      'Placement Pro+ is built as a terminal-style "Placement.OS". It maps a structured skill profile onto a knowledge graph (MiniLM embeddings + NetworkX paths), returns missing skills and heuristic readiness, and builds a deterministic 12-week template roadmap in the session.',
    features: [
      { icon: '👤', title: 'Structured Profile', desc: 'Capture skills, CGPA, and target role as structured fields — not a resume-file parser.' },
      { icon: '🎯', title: 'Skill Gap Detection', desc: 'Embed profile skills against graph nodes, then shortest-path the remaining gaps.' },
      { icon: '🗺️', title: 'Career Roadmaps', desc: 'Fill a 12-week template from missing graph nodes and keep it in UI state.' },
      { icon: '📚', title: 'Learning Recommendations', desc: 'Surface what to learn next from the remaining path, in graph order.' },
      { icon: '📈', title: 'Dashboard', desc: 'Show heuristic readiness, placement probability, and company matches for the current session.' },
      { icon: '🧠', title: 'Analytics', desc: 'Heuristic readiness and sigmoid-style placement probability — not an LLM score.' },
    ],
    stack: ['Python', 'Flask', 'React', 'TypeScript', 'REST APIs', 'JWT', 'TailwindCSS', 'Netlify'],
    decisions: [
      'The terminal / "OS" interface frames preparation as a system to operate, not a checklist to dread.',
      'Advice is anchored to the structured profile (skills / CGPA / role), not a parsed resume file.',
      'Roadmaps are deterministic templates from missing graph nodes; they are not persisted and do not adapt from stored gap-closure history.',
    ],
    metrics: [
      { k: 'Input', v: 'Structured profile' },
      { k: 'Output', v: 'Gap + 12-week template' },
      { k: 'Surface', v: 'Terminal-style OS' },
    ],
  },
  {
    id: 'reporadar',
    index: '03',
    name: 'RepoRadarAI',
    title: 'GitHub Repository Health & Activity Intelligence',
    tagline: 'Health, bus factor, and activity signals for any public GitHub repository.',
    live: 'https://repoai.sriiverseai.vercel.app/',
    repo: 'https://github.com/sriiverse/RepoRadar',
    accent: '#6C63FF',
    accent2: '#38BDF8',
    theme: 'network',
    problem:
      'Judging an unfamiliar public GitHub repo from stars and a README is slow. Maintainers and adopters still need a fast read on activity, contributor concentration, and release hygiene — without cloning the tree.',
    solution:
      'RepoRadarAI takes a public GitHub URL, pulls GitHub REST metadata via Octokit, and returns heuristic health, bus factor, activity, maintenance, community, and stability signals plus language stats, PR/issue activity, and a client-side PDF. It does not read target source files or call an LLM.',
    features: [
      { icon: '🛰️', title: 'Repository Analysis', desc: 'GitHub-metadata health and activity analysis of a public repo.' },
      { icon: '💚', title: 'Health Scoring', desc: 'Heuristic 0–100 score from activity, maintenance, community, and stability buckets.' },
      { icon: '🚌', title: 'Bus Factor', desc: 'Contributor-concentration heuristic from listed GitHub contributions.' },
      { icon: '📈', title: 'Activity & Velocity', desc: 'Commit heatmaps, recent cadence, PR and issue activity, releases.' },
      { icon: '📄', title: 'PDF Export', desc: 'Client-side executive PDF of the dashboard metrics and rule-based notes.' },
      { icon: '🧭', title: 'Language Stats', desc: 'GitHub Linguist byte breakdown — not a source-code architecture graph.' },
    ],
    stack: ['Next.js', 'React', 'TypeScript', 'Octokit', 'Zustand', 'REST APIs', 'Vercel'],
    decisions: [
      'Shipped as a Next.js 14 App Router app on Vercel — UI and GET /api/analyze in one Node runtime.',
      'Open-source: the engine lives at github.com/sriiverse/RepoRadar.',
      'Intelligence is GitHub-metadata heuristics (health, bus factor, risk rules) rather than cloning or generating docs from source.',
    ],
    metrics: [
      { k: 'Input', v: 'Public GitHub URL' },
      { k: 'Output', v: 'Health + bus factor' },
      { k: 'Open source', v: 'github.com/sriiverse/RepoRadar' },
    ],
  },
];

/** Tech orbs — grouped + colour-coded. */
export const STACK = [
  { name: 'Python',      group: 'lang',  color: '#6C63FF' },
  { name: 'JavaScript',  group: 'lang',  color: '#6C63FF' },
  { name: 'TypeScript',  group: 'lang',  color: '#6C63FF' },
  { name: 'Flask',       group: 'back',  color: '#7C3AED' },
  { name: 'FastAPI',     group: 'back',  color: '#7C3AED' },
  { name: 'REST APIs',   group: 'back',  color: '#7C3AED' },
  { name: 'Octokit',     group: 'back',  color: '#7C3AED' },
  { name: 'JWT',         group: 'back',  color: '#7C3AED' },
  { name: 'React',       group: 'front', color: '#38BDF8' },
  { name: 'Next.js',     group: 'front', color: '#38BDF8' },
  { name: 'Zustand',     group: 'front', color: '#38BDF8' },
  { name: 'TailwindCSS', group: 'front', color: '#38BDF8' },
  { name: 'PostgreSQL',  group: 'data',  color: '#4F46E5' },
  { name: 'MongoDB',     group: 'data',  color: '#4F46E5' },
  { name: 'Docker',      group: 'data',  color: '#4F46E5' },
  { name: 'Git',         group: 'data',  color: '#4F46E5' },
  { name: 'GitHub',      group: 'data',  color: '#4F46E5' },
  { name: 'LLMs',        group: 'data',  color: '#4F46E5' },
  { name: 'Ollama',      group: 'data',  color: '#4F46E5' },
  { name: 'Vercel',      group: 'data',  color: '#4F46E5' },
  { name: 'Netlify',     group: 'data',  color: '#4F46E5' },
  { name: 'Render',      group: 'data',  color: '#4F46E5' },
];

/** Architecture nodes — the five-layer topology. */
export const ARCHITECTURE = [
  { id: 'frontend', label: 'Frontend', sub: 'React · TypeScript · Tailwind', color: '#38BDF8', desc: 'The surface users touch — reactive, accessible, fast. Talks to the backend exclusively over REST.' },
  { id: 'backend',  label: 'Backend',  sub: 'Python · Flask · FastAPI',      color: '#7C3AED', desc: 'The brainstem: auth, business logic, request orchestration and validation. Owns correctness.' },
  { id: 'ai',       label: 'AI Layer', sub: 'LLMs · Ollama · Retrieval',     color: '#6C63FF', desc: 'The reasoning core — prompt systems, retrieval and model orchestration that produce real product behaviour.' },
  { id: 'database', label: 'Database', sub: 'PostgreSQL · MongoDB',          color: '#4F46E5', desc: 'Source of truth. Relational and document stores modelled for integrity and query performance.' },
  { id: 'deploy',   label: 'Deployment', sub: 'Docker · Vercel · Netlify',   color: '#38BDF8', desc: 'Containerized and observable. From local dev to production with reproducible deploys.' },
];

/** Timeline — programming journey. */
export const JOURNEY = [
  { phase: 'Origin',    title: 'Programming Journey Begins', desc: 'The first commit. Curiosity about how software actually works — under the interface.' },
  { phase: 'Language',  title: 'Python',                     desc: 'Adopted Python as the primary language; learned to think in clean, expressive code.' },
  { phase: 'Craft',     title: 'Backend Development',        desc: 'Built server-side systems — APIs, auth, data modelling and the logic users never see.' },
  { phase: 'Intelligence', title: 'AI Applications',         desc: 'Began shipping applied AI: turning LLMs into product features, not demos.' },
  { phase: 'Ship 01',   title: 'QueryForgeAI',               desc: 'Natural-language SQL + optimization assistant — the first production AI system.' },
  { phase: 'Ship 02',   title: 'Placement Pro+',             desc: 'Placement.OS — structured skill profiles, graph skill-gap, and deterministic 12-week template roadmaps.' },
  { phase: 'Ship 03',   title: 'RepoRadarAI',                desc: 'GitHub repository health/activity intelligence — metadata scores, bus factor, and PDF export.' },
  { phase: 'Now',       title: 'Current',                    desc: 'Engineering SRIIVERSEAI — building intelligent software that solves real problems.' },
];

/**
 * Stats — values marked PLACEHOLDER until real numbers are supplied.
 * Keep the structure; replace values from real GitHub/analytics.
 */
export const STATS = [
  { label: 'Production Projects',   value: 3,   suffix: '', display: '3',   placeholder: false },
  { label: 'Technologies',          value: 19,  suffix: '+', display: '19',  placeholder: false },
  { label: 'Deployments',           value: 3,   suffix: '', display: '3',   placeholder: false },
  { label: 'GitHub Repositories',   value: 10,  suffix: '+', display: '10+', placeholder: true, note: 'replace with real count' },
  { label: 'Hours of Development',  value: 1000, suffix: '+', display: '1000+', placeholder: true, note: 'replace with real number' },
];

/**
 * Knowledge base for the SRIIVERSE AI assistant.
 * Intent matching is keyword-based and runs fully client-side.
 */
export const ASSISTANT_KB = [
  {
    q: ['who is sudhanshu', 'who is he', 'tell me about sudhanshu', 'about sudhanshu', 'introduction', 'who built', 'founder', 'beyond resume', 'kind of engineer'],
    a: 'Sudhanshu Sinha is a software engineer — a Python backend engineer, AI developer and full-stack engineer. He builds intelligent software that solves real problems: AI-powered products, scalable backend systems and modern web applications. Beyond a resume, he thinks in systems — shipping live products where AI reasons over real data.',
  },
  {
    q: ['sriiverseai', 'sriiverse ai', 'what is sriiverse', 'engineering universe', 'typical portfolio'],
    a: 'SRIIVERSEAI is Sudhanshu Sinha\'s engineering universe and portfolio environment — not merely another project or a skill-list entry. It is where his shipped AI products, backend architecture, full-stack systems, experiments, and engineering judgment come together. The Digital Brain is the intelligence layer that helps visitors explore that universe.',
  },
  {
    q: ['digital brain', 'who are you', 'are you sudhanshu', 'your role'],
    a: 'I am the Digital Brain of SRIIVERSEAI. Sudhanshu is the engineer who builds; SRIIVERSEAI is the universe where that work lives; I am the interface that helps you explore both. I am not Sudhanshu the person, and I am not a fourth product card.',
  },
  {
    q: ['queryforge', 'sql', 'database assistant', 'query optim'],
    a: 'QueryForgeAI is an AI-powered SQL/Mongo query generator and optimizer. Generator: user provides dialect + pasted schema_def + natural-language question → POST /generate-sql. Optimizer: pasted SQL/pipeline + dialect → POST /analyze. Cloud path uses Gemini (with optional Groq failover) or demo heuristics — it does not connect to a live user database or run real EXPLAIN. Backend is FastAPI on Render; frontend is React on Netlify. Live: queryforge-sriiverse.netlify.app',
  },
  {
    q: ['placement', 'career', 'resume', 'roadmap', 'placement pro'],
    a: 'Placement Pro+ is a placement preparation platform (Placement.OS). It maps a structured skill profile onto a NetworkX graph using MiniLM embeddings (or exact-match fallback), returns missing skills plus heuristic readiness, and builds a deterministic 12-week template roadmap that stays in React state — not SQL, not an LLM, and not a resume parser. Live: placement-pro.netlify.app',
  },
  {
    q: ['reporadar', 'repo radar', 'github repository', 'repository analysis', 'repo intelligence'],
    a: 'RepoRadarAI is a GitHub health/activity intelligence tool. Point it at a public repo URL; it pulls GitHub REST metadata (not source files) and returns heuristic health, bus factor, heatmaps, PR/issue activity, language stats, and a PDF. Stack: Next.js 14 + React 18 + TypeScript + Octokit. Open source: github.com/sriiverse/RepoRadar. Live: repoai.sriiverseai.vercel.app',
  },
  {
    q: ['technology', 'technologies', 'stack', 'tech', 'tools', 'what does he know', 'skills', 'languages', 'specialize'],
    a: 'Core stack: Python, Flask, FastAPI (backend); React, TypeScript, JavaScript, TailwindCSS (frontend); PostgreSQL, MongoDB (data); Docker, Git, GitHub, JWT, REST APIs; AI tooling with LLMs and Ollama; deployed on Vercel, Netlify and Render. Specialization leans backend + applied AI.',
  },
  {
    q: ['backend', 'server', 'api', 'backend project', 'show backend'],
    a: 'Backend engineering is the core. Sudhanshu builds Python services with Flask and FastAPI — REST APIs, JWT auth, business logic and data modelling. Placement Pro+ is Python/Flask-driven in the portfolio card; QueryForgeAI\'s inspected implementation is FastAPI + Uvicorn; RepoRadarAI\'s inspected implementation is Next.js App Router (GET /api/analyze) plus a React/TypeScript UI — not FastAPI.',
  },
  {
    q: ['architecture', 'system design', 'how does it work', 'explain the architecture', 'how is it built', 'five-layer'],
    a: 'The portfolio has a five-layer teaching diagram: Frontend → Backend → AI Layer → Database → Deployment. That diagram is not the inspected architecture of every project. QueryForgeAI is FastAPI plus Gemini on a cloud path with no live database; Placement Pro+ is Flask plus MiniLM and NetworkX; RepoRadarAI is Next.js over GitHub REST metadata and heuristics, not a Python or LLM backend.',
  },
  {
    q: ['hire', 'hiring', 'why hire', 'recruit', 'employ', 'why should'],
    a: 'Hire Sudhanshu because he ships. Three production AI systems are live — not prototypes. He works across the full stack but thinks in systems: backend correctness, applied AI and the architecture that connects them. He turns ambiguous problems into reliable, observable software.',
  },
  {
    q: ['contact', 'email', 'reach', 'get in touch', 'how to contact'],
    a: 'You can reach Sudhanshu at hello@sriiverseai.dev, on GitHub at github.com/sriiverse/Portfolio, or on LinkedIn at /in/sudhanshu-sinha. The contact section at the bottom of this page has every link.',
  },
  {
    q: ['ai', 'artificial intelligence', 'llm', 'machine learning', 'how does ai'],
    a: 'AI is applied, not theoretical. QueryForgeAI uses Gemini/Groq (or demo heuristics) over user-provided schema text. Placement Pro+ uses MiniLM embeddings plus a skill graph and templates — not a chat LLM and not a resume parser. RepoRadarAI currently uses deterministic GitHub-metadata heuristics (health, bus factor, risk rules) — not a generative model over repository source. Ollama is used for local model work elsewhere in the practice. Intelligence is supposed to operate over real product inputs — not invent them.',
  },
  {
    q: ['project', 'projects', 'work', 'portfolio', 'what has he built'],
    a: 'Three production systems: 1) QueryForgeAI — SQL/Mongo generator and optimizer (Gemini/Groq or demo heuristics). 2) Placement Pro+ — Placement.OS with graph skill-gap and 12-week template roadmaps. 3) RepoRadarAI — GitHub metadata health/activity intelligence (Octokit + heuristics). All are live; scroll to the Work section for deep dives.',
  },
];

export const ASSISTANT_CHIPS = [
  'Who is Sudhanshu?',
  'Explain QueryForgeAI',
  'Explain RepoRadarAI',
  'What technologies does he know?',
  'Explain the architecture',
  'Why hire him?',
  'Paste a job description to match',
  'Practice a Python interview',
];

/**
 * Skills taxonomy — canonical skill name + phrasing aliases a job description
 * might use. Used only by assistant/jdmatch.js to detect which skills a JD
 * asks for, before cross-referencing against STACK/PROJECTS to decide what's
 * matched vs. missing. Deliberately includes common JD asks Sudhanshu's
 * stack does NOT cover (AWS, Kubernetes, ...) so "missing skills" has real
 * signal — this list is a taxonomy of *requestable* skills, not a claim
 * about what he knows (that claim lives only in STACK/PROJECTS).
 */
export const SKILLS_TAXONOMY = [
  { canonical: 'Python', aliases: ['python', 'py'] },
  { canonical: 'JavaScript', aliases: ['javascript', 'js', 'ecmascript'] },
  { canonical: 'TypeScript', aliases: ['typescript', 'ts'] },
  { canonical: 'Flask', aliases: ['flask'] },
  { canonical: 'FastAPI', aliases: ['fastapi', 'fast api'] },
  { canonical: 'REST APIs', aliases: ['rest api', 'rest apis', 'restful', 'rest', 'api design'] },
  { canonical: 'JWT', aliases: ['jwt', 'json web token'] },
  { canonical: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  { canonical: 'Next.js', aliases: ['next.js', 'nextjs', 'next js'] },
  { canonical: 'TailwindCSS', aliases: ['tailwind', 'tailwindcss'] },
  { canonical: 'PostgreSQL', aliases: ['postgresql', 'postgres', 'psql', 'sql'] },
  { canonical: 'MongoDB', aliases: ['mongodb', 'mongo', 'nosql'] },
  { canonical: 'Docker', aliases: ['docker', 'containerization', 'containers'] },
  { canonical: 'Git', aliases: ['git', 'version control'] },
  { canonical: 'GitHub', aliases: ['github'] },
  { canonical: 'LLMs', aliases: ['llm', 'llms', 'large language model', 'large language models', 'generative ai'] },
  { canonical: 'Ollama', aliases: ['ollama', 'local llm'] },
  { canonical: 'Vercel', aliases: ['vercel'] },
  { canonical: 'Netlify', aliases: ['netlify'] },
  { canonical: 'Render', aliases: ['render.com'] },
  // Common JD asks not currently in the stack — surfaced as "missing", never fabricated as "matched".
  { canonical: 'AWS', aliases: ['aws', 'amazon web services'] },
  { canonical: 'Azure', aliases: ['azure'] },
  { canonical: 'Google Cloud', aliases: ['gcp', 'google cloud'] },
  { canonical: 'Kubernetes', aliases: ['kubernetes', 'k8s'] },
  { canonical: 'CI/CD', aliases: ['ci/cd', 'continuous integration', 'continuous deployment'] },
  { canonical: 'GraphQL', aliases: ['graphql'] },
  { canonical: 'Redis', aliases: ['redis', 'caching'] },
  { canonical: 'Node.js', aliases: ['node.js', 'nodejs', 'node'] },
  { canonical: 'Django', aliases: ['django'] },
  { canonical: 'Vue', aliases: ['vue', 'vue.js', 'vuejs'] },
  { canonical: 'Microservices', aliases: ['microservice', 'microservices'] },
  { canonical: 'System Design', aliases: ['system design', 'scalable systems', 'distributed systems'] },
  { canonical: 'Unit Testing', aliases: ['unit test', 'unit testing', 'pytest', 'jest', 'tdd'] },
  { canonical: 'Kafka', aliases: ['kafka', 'message queue', 'event streaming'] },
];

/**
 * Interview question bank for assistant/interview.js — one question at a
 * time, per topic. `keywords` are used for lightweight, offline keyword-
 * coverage feedback (never a fabricated "correct/incorrect" verdict).
 * Generic engineering-fundamentals content — no claims about Sudhanshu.
 */
export const INTERVIEW_QUESTIONS = {
  python: [
    { q: "What's the difference between a list and a tuple in Python?", keywords: ['mutable', 'immutable', 'list', 'tuple'] },
    { q: 'What is a Python decorator, and why would you use one?', keywords: ['decorator', 'wrap', 'function', 'higher-order'] },
    { q: "Explain the difference between `is` and `==` in Python.", keywords: ['identity', 'equality', 'reference', 'value'] },
    { q: 'What is a generator, and how does it differ from a regular function?', keywords: ['generator', 'yield', 'lazy', 'iterator'] },
    { q: "How does Python's GIL affect multi-threaded programs?", keywords: ['gil', 'interpreter lock', 'thread', 'concurrency', 'multiprocessing'] },
  ],
  sql: [
    { q: 'What is the difference between INNER JOIN and LEFT JOIN?', keywords: ['inner join', 'left join', 'match', 'null'] },
    { q: "What is a database index, and what's the trade-off of adding one?", keywords: ['index', 'lookup', 'write', 'insert', 'speed'] },
    { q: 'Explain the difference between WHERE and HAVING.', keywords: ['where', 'having', 'group by', 'aggregate'] },
    { q: 'What is normalization, and why would you normalize a schema?', keywords: ['normalization', 'redundancy', 'integrity', 'schema'] },
    { q: 'How would you find and fix a slow query?', keywords: ['execution plan', 'explain', 'index', 'optimize'] },
  ],
  react: [
    { q: "What's the difference between state and props?", keywords: ['state', 'props', 'immutable', 'parent', 'child'] },
    { q: 'What are React hooks, and why were they introduced?', keywords: ['hooks', 'usestate', 'useeffect', 'class component', 'function component'] },
    { q: 'What is the virtual DOM, and why does it matter for performance?', keywords: ['virtual dom', 'diffing', 'reconciliation', 'render'] },
    { q: "When would you use useEffect, and what's a common pitfall with it?", keywords: ['useeffect', 'dependency array', 'side effect', 'cleanup'] },
    { q: 'How do you lift state up in a component tree?', keywords: ['lift state', 'parent', 'callback', 'shared state'] },
  ],
  backend: [
    { q: 'What is the difference between REST and RPC-style APIs?', keywords: ['rest', 'resource', 'rpc', 'http verbs', 'stateless'] },
    { q: 'How would you design authentication for a REST API?', keywords: ['jwt', 'token', 'session', 'auth', 'stateless'] },
    { q: 'What is the difference between synchronous and asynchronous request handling?', keywords: ['async', 'sync', 'blocking', 'non-blocking', 'concurrency'] },
    { q: 'How do you version an API without breaking existing clients?', keywords: ['versioning', 'backward compatible', 'deprecation'] },
    { q: 'What is idempotency, and why does it matter for endpoints like PUT/DELETE?', keywords: ['idempotent', 'put', 'delete', 'retry', 'safe'] },
  ],
  'ai-ml': [
    { q: "What's the difference between fine-tuning and prompt engineering?", keywords: ['fine-tuning', 'prompt engineering', 'weights', 'training'] },
    { q: 'What is retrieval-augmented generation (RAG), and why is it useful?', keywords: ['rag', 'retrieval', 'embedding', 'context', 'hallucination'] },
    { q: "What's the difference between a vector database and a relational database?", keywords: ['vector', 'embedding', 'similarity', 'relational'] },
    { q: 'How would you reduce hallucination in an LLM-powered feature?', keywords: ['hallucination', 'grounding', 'retrieval', 'citations', 'context'] },
    { q: "What's the difference between temperature and top-p in LLM sampling?", keywords: ['temperature', 'top-p', 'sampling', 'randomness'] },
  ],
};
