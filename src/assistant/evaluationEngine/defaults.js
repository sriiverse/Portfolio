/**
 * defaults.js — Shared lexical fixtures for rule-based scoring.
 * No project ranking / “winner” logic — only known labels + anti-patterns.
 */

/** Brochure / card patterns that break spoken conversation-first answers. */
export const BROCHURE_PATTERNS = [
  { id: 'emoji-heading', re: /^#{1,3}\s*.*[🎯🚀💡🔧✨]/m, tip: 'Drop brochure emoji headings; speak the answer.' },
  { id: 'problem-bold', re: /\*\*Problem:\*\*/i, tip: 'Avoid **Problem:** card sections in spoken answers.' },
  { id: 'solution-bold', re: /\*\*Solution:\*\*/i, tip: 'Avoid **Solution:** card sections unless documentation mode.' },
  { id: 'tech-stack-h', re: /^#{1,3}\s*Tech stack/im, tip: 'Avoid Tech stack dump headings in conversational replies.' },
  { id: 'features-h', re: /^#{1,3}\s*Features/im, tip: 'Avoid Features dump headings in conversational replies.' },
];

/** Impl / RAG leaks that break natural portfolio voice. */
export const IMPL_LEAK_PATTERNS = [
  { id: 'rag', re: /\bRAG\b/, tip: 'Don’t mention RAG; stay in portfolio voice.' },
  { id: 'embeddings', re: /\bembeddings?\b/i, tip: 'Don’t mention embeddings in user-facing answers.' },
  { id: 'knowledge-base', re: /\bknowledge base\b/i, tip: 'Say “portfolio” instead of “knowledge base”.' },
  { id: 'based-on-documented', re: /Based on what is documented/i, tip: 'Remove “Based on what is documented” leads.' },
  { id: 'from-portfolio-colon', re: /From his portfolio:/i, tip: 'Remove “From his portfolio:” meta leads.' },
];

/** Unevidenced personality fluff. */
export const FLUFF_PATTERNS = [
  /\b(passionate|humble genius|rockstar|ninja|10x|world-?class)\b/i,
];

/** Hedge / humility markers. */
export const HUMILITY_MARKERS = [
  /\b(I (don'?t|do not) (have|know)|not (documented|in (the|his) portfolio)|won'?t invent|will not invent|gap|honest(ly)?|within (the )?scope|from what'?s (shipped|evidenced)|inferred|I'?m not sure|to (be|my) knowledge)\b/i,
  /\b(fair|reasonable) (push|point|challenge)\b/i,
];

/** Overconfident absolutes without hedge. */
export const ABSOLUTE_PATTERNS = [
  /\b(always|never|definitely|absolutely|guaranteed|undeniably|best (in|of) (the )?world)\b/i,
  /^(Yes —|No —|Definitely|Absolutely)/m,
];

/** Storytelling / narrative beats. */
export const STORY_MARKERS = [
  /\b(when|then|after|before|started|shipped|hit|ran into|ended up|first|later|because)\b/i,
  /\b(the (interesting|hard|messy) part|here'?s where|what (changed|broke|worked))\b/i,
];

/** Engineering reasoning markers. */
export const REASONING_MARKERS = [
  /\b(because|therefore|so that|in order to|constraint|latency|correctness|throughput|scale|architect|layer|deliberate|systems? thinking)\b/i,
  /\b(why (we|I|he|the)|decision|rationale|grounds?)\b/i,
];

/** Trade-off markers. */
export const TRADEOFF_MARKERS = [
  /\b(trade-?off|versus|vs\.?|in exchange|cost of|at the expense|instead of|rather than|alternative)\b/i,
  /\b(pros? and cons?|upside|downside|compromise)\b/i,
];

/** Spoken / first-person voice (SRIIVERSE assistant). */
export const VOICE_FIRST_PERSON = [
  /\bI\b/,
  /\bI'?m\b/,
  /\bI'?ve\b/,
  /\bmy\b/i,
];

/** Third-person portfolio voice (acceptable when speaking about Sudhanshu). */
export const VOICE_THIRD_PERSON = [
  /\b(he|his|Sudhanshu)\b/i,
];

/** Default absent techs — portfolio does not claim these (multi-char only). */
export const DEFAULT_ABSENT_TECH = [
  'Kubernetes', 'Django', 'Redis', 'Next.js', 'Vite', 'GraphQL', 'Kafka',
  'Terraform', 'Spring Boot', 'Angular', 'Rust', 'Ruby on Rails',
];

/** Default known project name needles (labels, not ranking). */
export const DEFAULT_KNOWN_PROJECTS = [
  { id: 'queryforge', names: ['QueryForgeAI', 'QueryForge', 'queryforge'] },
  { id: 'reporadar', names: ['RepoRadarAI', 'RepoRadar', 'reporadar'] },
  { id: 'placementpro', names: ['Placement Pro+', 'Placement Pro', 'PlacementPro'] },
];

/** Default known tech labels. */
export const DEFAULT_KNOWN_TECH = [
  'Python', 'Flask', 'FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'MongoDB',
  'Docker', 'SQL', 'REST',
];

export default {
  BROCHURE_PATTERNS,
  IMPL_LEAK_PATTERNS,
  FLUFF_PATTERNS,
  HUMILITY_MARKERS,
  ABSOLUTE_PATTERNS,
  STORY_MARKERS,
  REASONING_MARKERS,
  TRADEOFF_MARKERS,
  VOICE_FIRST_PERSON,
  VOICE_THIRD_PERSON,
  DEFAULT_ABSENT_TECH,
  DEFAULT_KNOWN_PROJECTS,
  DEFAULT_KNOWN_TECH,
};
