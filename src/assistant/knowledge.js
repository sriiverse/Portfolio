/**
 * knowledge.js — Structured knowledge provider for SRIIVERSE AI.
 *
 * Turns content.js (the single source of truth) into a retrievable, citation-rich
 * knowledge index. Provides a RAG-ready `retrieve(query)` interface used by both
 * the local composer and (future) LLM providers.
 *
 * NO external calls. NO fabrication. Every returned source points back to content.js.
 */
import { PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY, ASSISTANT_KB } from '../content.js';

/* ============================================================
   TEXT UTILITIES
   ============================================================ */
const STOP = new Set([
  'the','a','an','and','or','but','is','are','was','were','be','been','being',
  'to','of','in','on','for','with','about','as','by','at','from','it','its',
  'this','that','these','those','i','you','he','she','they','we','me','my','your',
  'his','their','our','do','does','did','can','could','would','should','will',
  'what','which','who','whom','how','why','when','where','tell','show','explain',
  'me','please','help','know','like','want','need','have','has','had','there','here',
]);

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s+.#-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(s) {
  return normalize(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
}

// Lightweight stemmer — trims common suffixes so "engineering"/"engineer"/"engineers" match.
function stem(t) {
  if (t.length <= 4) return t;
  return t
    .replace(/(ization|izations)$/g, 'ize')
    .replace(/(inement|ining)$/g, 'ine')
    .replace(/(ologies|ology)$/g, 'olog')
    .replace(/(iness|inesses|yness)$/g, 'y')
    .replace(/(ingly|edly)$/g, '')
    .replace(/(ements|ement|ements|ements)$/g, 'e')
    .replace(/(ers|er|ed|ing|es|s)$/g, (m, _, off, str) => {
      // don't over-trim short stems
      const stemLen = str.length - m.length;
      return stemLen >= 3 ? '' : m;
    });
}

function stemSet(text) {
  return new Set(tokenize(text).map(stem));
}

/* ============================================================
   BUILD KNOWLEDGE INDEX
   Each doc: { id, title, text, tags:Set, source, kind, link }
   ============================================================ */
const docs = [];

function addDoc(doc) { docs.push(doc); }

// Profile
addDoc({
  id: 'profile',
  kind: 'profile',
  title: 'Sudhanshu Sinha — Profile',
  text: `${PROFILE.name} is a ${PROFILE.title}. ${PROFILE.brand} is his engineering practice. ${PROFILE.tagline} He builds AI-powered products, scalable backend systems and modern web applications. Reach him at ${PROFILE.email}, GitHub ${PROFILE.githubHandle}, or LinkedIn.`,
  tags: stemSet(`${PROFILE.name} sudhanshu sinha sriiverse about who founder engineer profile background intro introduction`),
  source: 'Profile',
  link: '#about',
});

// Projects — one rich doc per project + sub-docs for deep questions
PROJECTS.forEach((p, i) => {
  const ordinal = ['first', 'second', 'third', 'fourth', 'fifth'][i] || `${i + 1}th`;
  const numWord = ['one', 'two', 'three', 'four', 'five'][i] || String(i + 1);
  const baseText = `${p.name} is ${ordinal} (${numWord}). ${p.title}. ${p.tagline} Problem: ${p.problem} Solution: ${p.solution}`;
  const featsText = p.features.map((f) => `${f.title}: ${f.desc}`).join('. ');
  const stackText = p.stack.join(', ');

  // Main project doc
  addDoc({
    id: `project-${p.id}`,
    kind: 'project',
    projectId: p.id,
    title: p.name,
    text: `${baseText}. Key features: ${featsText}. Tech stack: ${stackText}.`,
    tags: stemSet(`${p.name} ${p.title} ${p.tagline} ${ordinal} ${numWord} ${numWord} project ${p.id} ${stackText}`),
    source: p.name,
    link: '#projects',
  });

  // Architecture-specific doc (enables "architecture of X")
  addDoc({
    id: `project-arch-${p.id}`,
    kind: 'project-arch',
    projectId: p.id,
    title: `${p.name} — Architecture & Decisions`,
    text: `Engineering decisions for ${p.name}: ${p.decisions.join(' ')}`,
    tags: stemSet(`${p.name} architecture decisions engineering design how built ${p.id}`),
    source: p.name,
    link: '#projects',
  });

  // Stack-specific doc
  addDoc({
    id: `project-stack-${p.id}`,
    kind: 'project-stack',
    projectId: p.id,
    title: `${p.name} — Technology Stack`,
    text: `${p.name} is built with: ${stackText}.`,
    tags: stemSet(`${p.name} technologies stack tools built made ${p.id} ${stackText}`),
    source: p.name,
    link: '#projects',
  });
});

// Stack overview
addDoc({
  id: 'stack',
  kind: 'stack',
  title: 'Technology Stack',
  text: `Technologies: ${STACK.map((s) => s.name).join(', ')}. Grouped as languages (Python, JavaScript, TypeScript), backend (Flask, FastAPI, REST APIs, JWT), frontend (React, TailwindCSS), data & infra (PostgreSQL, MongoDB, Docker, Git, GitHub, LLMs, Ollama, Vercel, Netlify, Render).`,
  tags: stemSet(`technologies tech stack tools skills languages frameworks what know ${STACK.map((s) => s.name).join(' ')}`),
  source: 'Technology Stack',
  link: '#stack',
});

// Architecture layers
ARCHITECTURE.forEach((node) => {
  addDoc({
    id: `arch-${node.id}`,
    kind: 'arch',
    archId: node.id,
    title: `${node.label} Layer`,
    text: `${node.label}: ${node.desc} (${node.sub})`,
    tags: stemSet(`architecture system design ${node.label} ${node.id} ${node.sub} layer how works`),
    source: 'System Architecture',
    link: '#architecture',
  });
});
addDoc({
  id: 'arch-overview',
  kind: 'arch-overview',
  title: 'System Architecture — Overview',
  text: `The five-layer topology: ${ARCHITECTURE.map((n) => n.label).join(' → ')}. Every project follows this: Frontend (React/TypeScript) → Backend (Python/Flask/FastAPI) → AI Layer (LLMs/Ollama) → Database (PostgreSQL/MongoDB) → Deployment (Docker/Vercel/Netlify). The AI is a reasoning layer over real data, never a blind generator.`,
  tags: stemSet(`architecture system design topology layers how built request travels flow pipeline ${ARCHITECTURE.map((n) => n.label).join(' ')}`),
  source: 'System Architecture',
  link: '#architecture',
});

// Journey
JOURNEY.forEach((j, i) => {
  addDoc({
    id: `journey-${i}`,
    kind: 'journey',
    title: `${j.phase}: ${j.title}`,
    text: `${j.phase} — ${j.title}: ${j.desc}`,
    tags: stemSet(`journey timeline path career history ${j.phase} ${j.title}`),
    source: 'Journey',
    link: '#journey',
  });
});

// Hiring / recommendation (synthesized from real shipped work — no invented metrics)
addDoc({
  id: 'why-hire',
  kind: 'recommend',
  title: 'Why hire Sudhanshu',
  text: `Hire Sudhanshu because he ships. Three production AI systems are live — QueryForgeAI, Placement Pro+, RepoRadarAI — not prototypes. He works across the full stack but thinks in systems: backend correctness, applied AI and the architecture that connects them. He turns ambiguous problems into reliable, observable software. For recruiters: he's a backend-first engineer who can also own AI features and ship full product.`,
  tags: stemSet(`why hire recruit recruiter should employ recommend hiring fit value strength`),
  source: 'Profile',
  link: '#about',
});

// Resume Intelligence (Sprint 3) — synthesized entirely from PROFILE/JOURNEY/
// PROJECTS/STACK (read live below, never duplicated) so the assistant can
// answer resume/experience questions without the PDF download working, and
// can never drift out of sync with the data those fields already contain.
addDoc({
  id: 'resume',
  kind: 'resume',
  title: `${PROFILE.name} — Resume Summary`,
  text: `${PROFILE.name}, ${PROFILE.title}. ${JOURNEY.map((j) => `${j.phase}: ${j.title} — ${j.desc}`).join(' ')} Shipped: ${PROJECTS.map((p) => `${p.name} (${p.tagline})`).join('; ')}. Stack: ${STACK.map((s) => s.name).join(', ')}.`,
  tags: stemSet(`resume cv experience background summary summarize walk through career history journey`),
  source: 'Resume',
  link: '#journey',
});

// Migration: keep existing ASSISTANT_KB entries as supplementary docs (backward compatible)
ASSISTANT_KB.forEach((entry, i) => {
  addDoc({
    id: `kb-${i}`,
    kind: 'qa',
    title: entry.q[0],
    text: entry.a,
    tags: stemSet(entry.q.join(' ') + ' ' + entry.a),
    source: 'Knowledge Base',
    link: null,
  });
});

/* ============================================================
   SCORING
   ============================================================ */
function scoreDoc(doc, queryTokens, queryStems) {
  let score = 0;
  const text = normalize(doc.text);
  const title = normalize(doc.title);
  const tagStems = doc.tags; // already a Set of stems

  // Tag/stem overlap (strongest signal)
  let tagHits = 0;
  for (const qs of queryStems) if (tagStems.has(qs)) tagHits++;
  score += tagHits * 3.0;

  // Title hits
  for (const qt of queryTokens) if (title.includes(qt)) score += 2.0;

  // Body token frequency
  for (const qt of queryTokens) {
    if (qt.length < 3) continue;
    const re = new RegExp(qt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = text.match(re);
    if (matches) score += Math.min(matches.length, 4) * 0.6;
  }

  // Exact phrase boost (multi-token query appearing contiguously)
  if (queryTokens.length > 1) {
    const phrase = queryTokens.join(' ');
    if (text.includes(phrase)) score += 3.0;
  }

  // Kind weighting — prefer structured project/profile docs over legacy KB
  const kindWeight = { profile: 1.1, project: 1.0, 'project-arch': 0.95, recommend: 1.0, stack: 0.9, 'arch-overview': 0.9, arch: 0.8, qa: 0.7 };
  score *= (kindWeight[doc.kind] || 0.8);

  return score;
}

/* ============================================================
   QUESTION-TYPE → DOC.KIND AFFINITY (Stage 5 — Evidence Selection)
   docs/REASONING_ENGINE_SPEC.md Stage 5's exact fix for Cluster E
   ("document-kind routing collisions, e.g. a stack question outscoring a
   project's own architecture doc"). A small static lookup, not a function
   with independent logic, per the module contract (Section 4.4): it BIASES
   which candidate wins `retrieveScoped()`'s "top" slot, it never excludes
   a kind absolutely — see `retrieveScoped()`'s fallback-to-full-pool
   behavior below, which is the load-bearing part of Stage 5's own
   failure-mode mitigation table (Section 1, Stage 5), not an afterthought.
   `questionType` values with no entry here (Greeting, Identity, Opinion,
   Comparison, Experience, ArchitectureExplanation-with-projectId, ...) are
   unaffected — those moves are already short-circuited by
   `conversation.js`'s QuestionFrame BEFORE this retrieval path ever runs
   (see providers.js's `strategy.move` branches), so they never needed an
   affinity entry to begin with.
   ============================================================ */
const QUESTION_TYPE_KIND_AFFINITY = {
  ProjectExplanation: ['project', 'project-arch', 'project-stack'],
  ArchitectureExplanation: ['project-arch', 'arch', 'arch-overview'],
  TechnologyExplanation: ['stack', 'project-stack'],
  SkillVerification: ['stack', 'project-stack', 'project'],
  Recruiter: ['recommend'],
  Recommendation: ['recommend', 'project'],
  Experience: ['resume', 'project'],
  EvidenceRequest: ['project', 'project-arch', 'project-stack'],
  Career: ['journey', 'qa'],
  Behavioral: ['qa', 'recommend'],
  Limitation: ['qa'],
  Capability: ['qa'],
  Conversation: ['qa'],
};

/* ============================================================
   PUBLIC API
   ============================================================ */

/**
 * Retrieve ranked knowledge for a query.
 * @returns {Array<{doc, score}>} top matches, score > threshold
 */
export function retrieve(query, limit = 4) {
  const queryTokens = tokenize(query);
  const queryStems = new Set(queryTokens.map(stem));
  if (!queryTokens.length) return [];

  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens, queryStems) }))
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

/**
 * Stage 5 ("Evidence Selection") retrieval — docs/REASONING_ENGINE_SPEC.md
 * Section 4.4. Identical element shape and identical scoring function to
 * `retrieve()` (unchanged, still the sole scorer); the only difference is
 * candidate-pool ordering: when `questionType` has an affinity entry above,
 * documents of a preferred `kind` are tried FIRST, and only that
 * preferred-subset result is returned, provided at least one of them clears
 * the existing `score > 0.5` floor — the exact same cutoff `retrieve()` has
 * always used, so this narrows WHICH docs compete, never HOW they're scored.
 *
 * `entities` is accepted for interface completeness (docs/REASONING_ENGINE_
 * SPEC.md Section 4.4's documented signature) but is not yet used to bias
 * scoring — deliberately, the same "accepted, not yet consumed" pattern
 * `entities.js`'s own `resolveEntities({ hint })` already uses. Nothing in
 * Stage 5's spec text requires entity-aware document scoring specifically;
 * gap/unknown entities are surfaced instead via `buildEvidenceSet()`'s
 * `gapNotes`, independent of any doc match.
 *
 * Falls back to the exact same unscoped, full-pool result `retrieve()`
 * would produce whenever: `questionType` has no affinity entry, OR the
 * preferred subset is empty, OR every preferred-subset candidate scores at
 * or below the floor — this fallback is a hard requirement per Stage 5's
 * own failure-mode table, not an optimization.
 */
export function retrieveScoped(query, { limit = 4, entities = [], questionType = null } = {}) { // eslint-disable-line no-unused-vars
  const queryTokens = tokenize(query);
  const queryStems = new Set(queryTokens.map(stem));
  if (!queryTokens.length) return [];

  const scored = docs.map((doc) => ({ doc, score: scoreDoc(doc, queryTokens, queryStems) }));

  const preferredKinds = QUESTION_TYPE_KIND_AFFINITY[questionType];
  if (preferredKinds) {
    const preferred = scored
      .filter((r) => preferredKinds.includes(r.doc.kind) && r.score > 0.5)
      .sort((a, b) => b.score - a.score);
    if (preferred.length) return preferred.slice(0, limit);
  }

  return scored
    .filter((r) => r.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/**
 * Pre-composed, evidence-free statement of absence for a non-owned entity —
 * docs/REASONING_ENGINE_SPEC.md Section 3.4's `EvidenceSet.gapNotes`. Two
 * templates: `'gap'` (a real, named technology Sudhanshu's own taxonomy
 * tracks, just not one that's shipped in `STACK`) reads more specifically
 * than `'unknown'` (a plausible-looking capitalized word `entities.js`'s
 * heuristic caught, with zero taxonomy record either way — nothing to even
 * confirm it's a real technology, let alone an unused one).
 */
function gapNoteFor(entity) {
  if (entity.ownership === 'gap') {
    return `${entity.canonical} is not part of Sudhanshu's shipped project history.`;
  }
  return `There's no record of ${entity.canonical} in Sudhanshu's documented skill set.`;
}

/**
 * Build one `EvidenceSet` (docs/REASONING_ENGINE_SPEC.md Section 3.4) for
 * `query` — Stage 5's sole output, and the ONLY new piece of state this
 * phase introduces. Deliberately stops here: does not decide confidence
 * (Stage 6), does not decide which blocks to render (Stage 7), does not
 * render markdown (Stage 8) — all three are explicitly out of scope for
 * this phase (see the Phase 3 implementation note at the top of this file
 * history). `entities` may be `[]` (no named technology/project in the
 * query) — `gapNotes` is simply omitted-equivalent (`[]`) in that case, not
 * an error.
 */
export function buildEvidenceSet(query, questionFrame, entities = []) {
  const questionType = questionFrame?.questionType || null;
  const supportingDocs = retrieveScoped(query, { limit: 4, entities, questionType });

  const primaryFacts = supportingDocs.slice(0, 2).map((h) => ({
    text: h.doc.text,
    docId: h.doc.id,
    link: h.doc.link || null,
  }));

  const gapNotes = entities
    .filter((e) => e.ownership === 'gap' || e.ownership === 'unknown')
    .map(gapNoteFor);

  const scoreGap = supportingDocs.length >= 2 ? (supportingDocs[0].score - supportingDocs[1].score) : null;

  return {
    primaryFacts,
    supportingDocs,
    gapNotes,
    scoreGap,
    queryTokens: tokenize(query),
  };
}

/** Get a single doc by id. */
export function getDoc(id) {
  return docs.find((d) => d.id === id) || null;
}

/** Get a full project record by id (for rich cards). */
export function getProject(id) {
  return PROJECTS.find((p) => p.id === id) || null;
}

export function getAllProjects() { return PROJECTS; }
export function getStack() { return STACK; }
export function getArchitecture() { return ARCHITECTURE; }
export function getProfile() { return PROFILE; }

/** Resolve a project by name OR ordinal ("second", "2nd", "2"). */
export function resolveProject(ref) {
  if (!ref) return null;
  const r = normalize(ref);
  // by id/name
  let p = PROJECTS.find((x) => x.id === r || normalize(x.name) === r || normalize(x.name).includes(r));
  if (p) return p;
  // by ordinal
  const ordMap = { first: 0, one: 0, '1st': 0, '1': 0, second: 1, two: 1, '2nd': 1, '2': 1, third: 2, three: 2, '3rd': 2, '3': 2 };
  const idx = ordMap[r];
  if (idx != null && PROJECTS[idx]) return PROJECTS[idx];
  return null;
}

export const _docCount = docs.length;
