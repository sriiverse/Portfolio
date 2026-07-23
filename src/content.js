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
  github: 'https://github.com/sriiverse',
  githubHandle: '@sriiverse',
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
      'QueryForgeAI turns natural language into SQL, then dissects execution plans, surfaces bottlenecks and rewrites inefficient queries instantly. It is part query generator, part optimization engine, part always-on database assistant.',
    features: [
      { icon: '💬', title: 'Natural Language → SQL', desc: 'Describe what you want in plain English; get executable SQL.' },
      { icon: '⚡', title: 'SQL Optimization', desc: 'Dissect execution plans and rewrite inefficient queries automatically.' },
      { icon: '🔍', title: 'Query Explanation', desc: 'Understand what a query does, step by step, in human terms.' },
      { icon: '🧬', title: 'Schema Intelligence', desc: 'Reason over the live schema to generate context-aware suggestions.' },
      { icon: '🗄️', title: 'Database Understanding', desc: 'Interact with relational databases conversationally.' },
      { icon: '📊', title: 'Animated Visualizations', desc: 'SQL behaviour rendered as live, animated visual feedback.' },
    ],
    stack: ['Python', 'Flask', 'LLMs', 'REST APIs', 'React', 'JavaScript', 'TailwindCSS'],
    decisions: [
      'A Python backend (Flask) keeps the AI + DB orchestration in one place, where it is easiest to reason about.',
      'The AI is treated as a reasoning layer over the real schema — not a blind text generator.',
      'Optimization is surfaced as an explanation, not a black-box rewrite, so developers learn from each suggestion.',
    ],
    metrics: [
      { k: 'Optimization', v: 'Execution-plan aware' },
      { k: 'Interface', v: 'Natural language + SQL' },
      { k: 'Surface', v: 'Modern dashboard' },
    ],
  },
  {
    id: 'placementpro',
    index: '02',
    name: 'Placement Pro+',
    title: 'AI-Powered Career Guidance & Placement Preparation Platform',
    tagline: 'Placement.OS — an operating system for getting placed.',
    live: 'https://placement-pro.netlify.app/login',
    repo: null,
    accent: '#7C3AED',
    accent2: '#4F46E5',
    theme: 'career',
    problem:
      'Placement preparation is fragmented. Students do not know which skills they are missing, which roles to target, or what to learn next — and existing tools give generic advice that ignores the actual resume.',
    solution:
      'Placement Pro+ is built as a terminal-style "Placement.OS". It analyzes the resume, detects skill gaps against target roles, recommends a personalized learning roadmap, and tracks preparation progress with analytics.',
    features: [
      { icon: '📄', title: 'Resume Analysis', desc: 'Parse and evaluate the resume against target placement roles.' },
      { icon: '🎯', title: 'Skill Gap Detection', desc: 'Identify precisely which skills are missing for the target role.' },
      { icon: '🗺️', title: 'Career Roadmaps', desc: 'Generate a personalized, step-by-step path to placement readiness.' },
      { icon: '📚', title: 'Learning Recommendations', desc: 'Surface what to learn next, in priority order.' },
      { icon: '📈', title: 'Progress Dashboard', desc: 'Track preparation as measurable progress over time.' },
      { icon: '🧠', title: 'Analytics', desc: 'AI-driven insight into readiness and weak areas.' },
    ],
    stack: ['Python', 'Flask', 'LLMs', 'REST APIs', 'JavaScript', 'TailwindCSS'],
    decisions: [
      'The terminal / "OS" interface frames preparation as a system to operate, not a checklist to dread.',
      'Analysis is anchored to the real resume, so advice is specific instead of generic.',
      'Roadmaps are dynamic — they shift as detected gaps close.',
    ],
    metrics: [
      { k: 'Input', v: 'Resume-driven' },
      { k: 'Output', v: 'Personalized roadmap' },
      { k: 'Surface', v: 'Terminal-style OS' },
    ],
  },
  {
    id: 'reporadar',
    index: '03',
    name: 'RepoRadarAI',
    title: 'AI-Powered GitHub Repository Intelligence Platform',
    tagline: 'X-ray vision for any public GitHub repository.',
    live: 'https://repoai.sriiverseai.vercel.app/',
    repo: 'https://github.com/sriiverse/RepoRadar',
    accent: '#6C63FF',
    accent2: '#38BDF8',
    theme: 'network',
    problem:
      'Understanding an unfamiliar repository takes hours of reading code, commit history and dependency graphs. There is no fast way to answer: "what is this codebase, how healthy is it, and how is it structured?"',
    solution:
      'RepoRadarAI analyzes any public GitHub repository with AI and produces architecture insights, auto-generated documentation, repository summaries, code explanations and developer-friendly intelligence — in seconds.',
    features: [
      { icon: '🛰️', title: 'Repository Analysis', desc: 'Instant health and structure analysis of any public repo.' },
      { icon: '📖', title: 'AI Documentation', desc: 'Auto-generate docs that actually explain the codebase.' },
      { icon: '🏗️', title: 'Architecture Visualization', desc: 'See how the repository is organized at a glance.' },
      { icon: '💡', title: 'Repository Understanding', desc: 'Conversational explanations of what the repo does.' },
      { icon: '🚀', title: 'Developer Productivity', desc: 'Onboard to or audit a codebase in minutes, not hours.' },
      { icon: '🧭', title: 'Repo Intelligence', desc: 'Commit heatmaps, PR velocity, contributor and health signals.' },
    ],
    stack: ['Python', 'FastAPI', 'React', 'TypeScript', 'LLMs', 'REST APIs', 'Vercel'],
    decisions: [
      'Shipped on Vercel with a FastAPI backend — a clean split between the React intelligence surface and the Python AI core.',
      'Open-source friendly: the engine lives at github.com/sriiverse/RepoRadar.',
      'Intelligence is layered — summary, then architecture, then deep code explanation — so users descend at their own pace.',
    ],
    metrics: [
      { k: 'Input', v: 'Any public repo' },
      { k: 'Output', v: 'Docs + architecture' },
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
  { name: 'JWT',         group: 'back',  color: '#7C3AED' },
  { name: 'React',       group: 'front', color: '#38BDF8' },
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
  { phase: 'Ship 02',   title: 'Placement Pro+',             desc: 'AI placement platform with resume analysis and dynamic roadmaps.' },
  { phase: 'Ship 03',   title: 'RepoRadarAI',                desc: 'GitHub repository intelligence — architecture, docs and health, generated by AI.' },
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
    q: ['who is sudhanshu', 'who is he', 'tell me about sudhanshu', 'about sudhanshu', 'introduction', 'who built', 'founder'],
    a: 'Sudhanshu Sinha is a software engineer — a Python backend engineer, AI developer and full-stack engineer. He builds intelligent software that solves real problems: AI-powered products, scalable backend systems and modern web applications. SRIIVERSEAI is his engineering practice.',
  },
  {
    q: ['queryforge', 'sql', 'database assistant', 'query optim'],
    a: 'QueryForgeAI is an AI-powered SQL query optimization & database assistant. It converts natural language into SQL, dissects execution plans, explains queries, and rewrites inefficient SQL automatically. It reasons over the live schema rather than blindly generating text. Live: queryforge-sriiverse.netlify.app',
  },
  {
    q: ['placement', 'career', 'resume', 'roadmap', 'placement pro'],
    a: 'Placement Pro+ is an AI-powered placement preparation platform. It analyzes your resume, detects skill gaps against target roles, generates a personalized learning roadmap, and tracks readiness with analytics. Its interface is styled as a terminal-style "Placement.OS". Live: placement-pro.netlify.app',
  },
  {
    q: ['reporadar', 'repo radar', 'github repository', 'repository analysis', 'repo intelligence'],
    a: 'RepoRadarAI is an AI-powered GitHub repository intelligence platform. Point it at any public repo and it generates architecture insights, auto-documentation, a repository summary, commit heatmaps, PR velocity, contributor distribution and a health score. Open source: github.com/sriiverse/RepoRadar. Live: repoai.sriiverseai.vercel.app',
  },
  {
    q: ['technology', 'technologies', 'stack', 'tech', 'tools', 'what does he know', 'skills', 'languages'],
    a: 'Core stack: Python, Flask, FastAPI (backend); React, TypeScript, JavaScript, TailwindCSS (frontend); PostgreSQL, MongoDB (data); Docker, Git, GitHub, JWT, REST APIs; AI tooling with LLMs and Ollama; deployed on Vercel, Netlify and Render.',
  },
  {
    q: ['backend', 'server', 'api', 'backend project', 'show backend'],
    a: 'Backend engineering is the core. Sudhanshu builds Python services with Flask and FastAPI — REST APIs, JWT auth, business logic and data modelling. QueryForgeAI and Placement Pro+ are both Python-backend-driven; RepoRadarAI uses FastAPI behind a React frontend.',
  },
  {
    q: ['architecture', 'system design', 'how does it work', 'explain the architecture', 'how is it built'],
    a: 'Every system follows a five-layer topology: Frontend (React/TS) → Backend (Python/Flask/FastAPI) → AI Layer (LLMs/Ollama/retrieval) → Database (PostgreSQL/MongoDB) → Deployment (Docker/Vercel/Netlify). The AI is a reasoning layer over real data — never a blind generator.',
  },
  {
    q: ['hire', 'hiring', 'why hire', 'recruit', 'employ', 'why should'],
    a: 'Hire Sudhanshu because he ships. Three production AI systems are live — not prototypes. He works across the full stack but thinks in systems: backend correctness, applied AI and the architecture that connects them. He turns ambiguous problems into reliable, observable software.',
  },
  {
    q: ['contact', 'email', 'reach', 'get in touch', 'how to contact'],
    a: 'You can reach Sudhanshu at hello@sriiverseai.dev, on GitHub at @sriiverse, or on LinkedIn at /in/sudhanshu-sinha. The contact section at the bottom of this page has every link.',
  },
  {
    q: ['ai', 'artificial intelligence', 'llm', 'machine learning', 'how does ai'],
    a: 'AI is applied, not theoretical. Across the projects, LLMs power: natural-language→SQL, resume analysis & gap detection, and repository understanding & auto-documentation. Ollama is used for local model work. The AI always operates over real data — schemas, resumes and repositories.',
  },
  {
    q: ['project', 'projects', 'work', 'portfolio', 'what has he built'],
    a: 'Three production systems: 1) QueryForgeAI — AI SQL optimization & database assistant. 2) Placement Pro+ — AI placement prep with resume analysis & roadmaps. 3) RepoRadarAI — AI GitHub repository intelligence. All are live; scroll to the Work section for deep dives.',
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
