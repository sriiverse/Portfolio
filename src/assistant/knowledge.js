/**
 * knowledge.js — Structured knowledge provider for SRIIVERSE AI.
 *
 * Turns content.js (the single source of truth) into a retrievable, citation-rich
 * knowledge index. Provides a RAG-ready `retrieve(query)` interface used by both
 * the local composer and (future) LLM providers.
 *
 * NO external calls. NO fabrication. Every returned source points back to content.js.
 */
import { PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY, ASSISTANT_KB, SKILLS_TAXONOMY } from '../content.js';
import { getQueryForgeFacetDocs } from './queryforgeKnowledge.js';
import { getPlacementProFacetDocs } from './placementproKnowledge.js';
import { getRepoRadarFacetDocs } from './reporadarKnowledge.js';

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

// Profile — spoken identity facts WITHOUT contact dump (contact lives in its own doc)
addDoc({
  id: 'profile',
  kind: 'profile',
  title: 'Sudhanshu Sinha — Profile',
  text: `${PROFILE.name} is a ${PROFILE.title}. ${PROFILE.tagline} He builds AI-powered products, scalable backend systems and modern web applications. Center of gravity: Python backend correctness and applied AI grounded in real data — not slideware demos.`,
  tags: stemSet(`${PROFILE.name} sudhanshu sinha about who founder engineer profile background intro introduction beyond resume person engineer specialize`),
  source: 'Profile',
  link: '#about',
});

// SRIIVERSEAI — engineering universe / portfolio environment (not a STACK skill)
addDoc({
  id: 'brand-sriiverseai',
  kind: 'brand',
  title: 'SRIIVERSEAI — Engineering Universe',
  text: `SRIIVERSEAI is Sudhanshu Sinha's engineering universe and portfolio environment — not merely another project card or a line item in a skill set. It is the place where his shipped AI products, backend architecture, full-stack systems, experiments, technical knowledge, and engineering judgment come together. Visitors explore that universe through this site and its Digital Brain.`,
  tags: stemSet('sriiverseai sriiverse ai brand universe portfolio environment practice digital brain different typical portfolio'),
  source: 'SRIIVERSEAI',
  link: '#about',
});

// Contact — only retrieved when the visitor asks how to reach him
addDoc({
  id: 'contact',
  kind: 'contact',
  title: 'Contact',
  text: `Reach Sudhanshu at ${PROFILE.email}, GitHub ${PROFILE.githubHandle}, or LinkedIn.`,
  tags: stemSet('contact email reach github linkedin hire get in touch'),
  source: 'Contact',
  link: '#contact',
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
  text: `Portfolio teaching diagram: ${ARCHITECTURE.map((n) => n.label).join(' → ')}. This is not the inspected architecture of every shipped project. QueryForgeAI's inspected backend is FastAPI, Placement Pro+ is Flask, and RepoRadarAI is a Next.js app — not a shared Python/LLM/database stack.`,
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
  text: `The records do not establish a personal hiring recommendation. QueryForgeAI, Placement Pro+, and RepoRadarAI each have a public live URL. That is a deployment fact. The documented role title is ${PROFILE.title}. That is a role label, not a hiring recommendation.`,
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

// QueryForgeAI CODE-PROVEN engineering facets (Phase 2A)
getQueryForgeFacetDocs().forEach((f) => {
  addDoc({
    id: f.id,
    kind: f.kind,
    projectId: f.projectId,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tags: stemSet(f.tagsText),
    source: f.source,
    link: f.link,
  });
});

// Placement Pro+ CODE-PROVEN engineering facets (Phase 2B)
getPlacementProFacetDocs().forEach((f) => {
  addDoc({
    id: f.id,
    kind: f.kind,
    projectId: f.projectId,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tags: stemSet(f.tagsText),
    source: f.source,
    link: f.link,
  });
});

// RepoRadarAI CODE-PROVEN engineering facets (Phase 2C)
getRepoRadarFacetDocs().forEach((f) => {
  addDoc({
    id: f.id,
    kind: f.kind,
    projectId: f.projectId,
    facet: f.facet,
    depth: f.depth,
    confidence: f.confidence,
    title: f.title,
    text: f.text,
    tags: stemSet(f.tagsText),
    source: f.source,
    link: f.link,
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
  const kindWeight = {
    profile: 1.1,
    brand: 1.25,
    project: 1.0,
    'project-arch': 0.95,
    'project-detail': 1.35,
    recommend: 1.0,
    stack: 0.9,
    'arch-overview': 0.9,
    arch: 0.8,
    contact: 0.6,
    qa: 0.7,
  };
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
  ProjectExplanation: ['project-detail', 'project', 'project-arch', 'project-stack'],
  ArchitectureExplanation: ['project-detail', 'project-arch', 'arch', 'arch-overview'],
  TechnologyExplanation: ['project-detail', 'stack', 'project-stack'],
  SkillVerification: ['stack', 'project-stack', 'project', 'project-detail'],
  Recruiter: ['recommend'],
  Recommendation: ['recommend', 'project'],
  Experience: ['resume', 'project', 'profile'],
  Identity: ['brand', 'profile'],
  EvidenceRequest: ['project-detail', 'project', 'project-arch', 'project-stack'],
  Career: ['journey', 'qa'],
  Behavioral: ['qa', 'recommend'],
  Limitation: ['project-detail', 'qa'],
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
export function retrieveScoped(query, { limit = 4, entities = [], questionType = null } = {}) {
  const queryTokens = tokenize(query);
  const queryStems = new Set(queryTokens.map(stem));
  if (!queryTokens.length) return [];

  const qLower = String(query || '').toLowerCase();
  const wantsContact = /\b(contact|email|reach|linkedin|github handle|get in touch)\b/i.test(qLower);
  const brandFocus = entities.some((e) => e.type === 'brand')
    || /\bsriiverse\s*ai\b|\bsriiverseai\b/i.test(qLower);

  const namedProjects = new Set();
  if (/queryforge/i.test(qLower)) namedProjects.add('queryforge');
  if (/placement\s*pro|placementpro/i.test(qLower)) namedProjects.add('placementpro');
  if (/reporadar|repo\s*radar/i.test(qLower)) namedProjects.add('reporadar');
  for (const entity of entities) {
    if (entity?.type === 'project' && entity.canonical) {
      namedProjects.add(String(entity.canonical).toLowerCase());
    }
  }

  let scored = docs.map((doc) => {
    let score = scoreDoc(doc, queryTokens, queryStems);
    if (brandFocus && doc.kind === 'brand') score += 4;
    if (!wantsContact && doc.kind === 'contact') score = 0;
    if (namedProjects.size && doc.projectId) {
      // A named project outranks another project's section that only shares
      // a generic word such as "architecture".
      score += namedProjects.has(doc.projectId) ? 8 : -12;
    }
    return { doc, score };
  });

  // Never inject contact blobs unless explicitly asked
  if (!wantsContact) {
    scored = scored.filter((r) => r.doc.kind !== 'contact');
  }

  const preferredKinds = QUESTION_TYPE_KIND_AFFINITY[questionType]
    || (brandFocus ? ['brand', 'profile'] : null);
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
 * Documented, non-overview sentences that name a technology.
 * A taxonomy gap only means the name is absent from STACK. It does not
 * decide whether a project record mentions the technology, whether a
 * deployment uses it, or whether personal proficiency is established.
 */
/**
 * A sentence names a technology as something the record documents.
 * A dotted suffix such as ".git", or a sentence that says the technology
 * is not used, is not that evidence.
 */
function isPositiveTechnologyMention(sentence, token) {
  const escaped = String(token || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  const present = new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, 'i');
  if (!present.test(sentence)) return false;
  const dotted = new RegExp(`\\.${escaped}(?=$|[^a-z0-9])`, 'i');
  const standalone = new RegExp(`(?:^|[^a-z0-9.])${escaped}(?=$|[^a-z0-9])`, 'i');
  if (dotted.test(sentence) && !standalone.test(sentence)) return false;
  const negated = new RegExp(`\\b(?:no|not|without)\\s+${escaped}\\b|\\b(?:does not|do not|doesn't|doesnt)\\s+use\\s+${escaped}\\b`, 'i');
  return !negated.test(sentence);
}

function documentedTechnologyMentions(label) {
  const token = String(label || '').trim();
  if (!token) return [];
  const groups = [
    ['queryforge', getQueryForgeFacetDocs()],
    ['placementpro', getPlacementProFacetDocs()],
    ['reporadar', getRepoRadarFacetDocs()],
  ];
  const found = [];
  for (const [id, docs] of groups) {
    const sentences = [];
    for (const doc of docs) {
      if (doc?.confidence !== 'documented') continue;
      if (doc.depth === 'overview' || doc.depth === 'unknown') continue;
      const parts = String(doc.text || '').split(/(?<=[.!?])\s+/);
      for (const part of parts) {
        const sentence = part.trim();
        if (!sentence || !isPositiveTechnologyMention(sentence, token) || sentences.includes(sentence)) continue;
        sentences.push(sentence);
        if (sentences.length >= 3) break;
      }
      if (sentences.length >= 3) break;
    }
    if (sentences.length) {
      found.push({ id, name: getProject(id)?.name || id, sentences });
    }
  }
  return found;
}

/**
 * A taxonomy alias that names a documented project behavior, such as
 * "caching", rather than the technology's own name.
 */
function compactAlias(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isNameFormAlias(canonical, alias) {
  const technology = compactAlias(canonical);
  const form = compactAlias(alias);
  if (!technology || !form) return false;
  if (technology === form) return true;
  if (form.length <= 2 && !/\s/.test(String(alias || ''))) return true;
  if (form.length >= 2 && (technology.startsWith(form) || form.startsWith(technology))) return true;
  if (form.length <= 2 && technology.endsWith(form)) return true;
  const numeronym = form.match(/^([a-z])(\d+)([a-z])$/);
  if (numeronym
    && technology.startsWith(numeronym[1])
    && technology.endsWith(numeronym[3])
    && technology.slice(1, -1).length === Number(numeronym[2])) {
    return true;
  }
  let shared = 0;
  while (shared < technology.length && shared < form.length && technology[shared] === form[shared]) shared += 1;
  if (!/\s/.test(String(alias || '')) && shared >= 4 && shared >= Math.min(form.length, technology.length) * 0.5) {
    return true;
  }
  if (/\s/.test(String(alias || ''))) {
    const initials = String(alias).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map((word) => word[0]).join('');
    if (initials && (technology === initials || technology === `${initials}s` || initials === technology.replace(/s$/, ''))) {
      return true;
    }
  }
  return false;
}

export function isDocumentedConceptAlias(alias) {
  const token = String(alias || '').toLowerCase().trim();
  if (!token) return false;
  const docs = [
    ...getQueryForgeFacetDocs(),
    ...getPlacementProFacetDocs(),
    ...getRepoRadarFacetDocs(),
  ];
  const namesAFacet = docs.some((doc) => String(doc.facet || '').toLowerCase() === token);
  if (!namesAFacet) return false;
  return SKILLS_TAXONOMY.some((entry) => entry.aliases.some((candidate) => (
    String(candidate || '').toLowerCase() === token
    && !isNameFormAlias(entry.canonical, candidate)
  )));
}

/**
 * Portfolio-history wording. Stack membership, project implementation, and
 * personal proficiency stay separate claims.
 */
export function portfolioTechnologyNote(canonical, { elaborate = false } = {}) {
  const label = String(canonical || '').trim();
  if (!label) return '';
  const mentions = documentedTechnologyMentions(label);
  const listed = STACK.some((item) => String(item?.name || '').toLowerCase() === label.toLowerCase());
  const proficiency = elaborate
    ? `I still don't have a record of personal proficiency with ${label}.`
    : `I don't have a record of personal proficiency with ${label}.`;
  if (listed) {
    const project = mentions.length
      ? ` The project records do establish this: ${mentions.map((mention) => `**${mention.name}.** ${mention.sentences.join(' ')}`).join(' ')} That is implementation evidence from the project record. It does not establish personal proficiency.`
      : ` ${projectStackMembershipSentence(label)} That listing is stack membership. It is not a documented personal-proficiency record.`;
    return `${label} is listed in the portfolio stack. ${proficiency}${project}`;
  }
  if (!mentions.length) {
    return `${label} is not part of the portfolio stack, and the project records do not document a ${label} implementation. I will not treat that absence as proof it was never used. ${proficiency}`;
  }
  const quoted = mentions.map((mention) => `**${mention.name}.** ${mention.sentences.join(' ')}`).join(' ');
  return `${label} is not part of the portfolio stack. The project records do establish this: ${quoted} That is configuration-dependent or implementation evidence from the project record. It does not confirm a production deployment, and it is not a record of personal proficiency. ${proficiency}`;
}

/**
 * A broad concept such as "containers" or "version control". The taxonomy
 * alias is not evidence that the canonical technology is the one in use.
 */
function diagramLabelForConcept(label) {
  const phrase = String(label || '').toLowerCase().trim();
  if (!phrase) return '';
  const stem = !phrase.includes(' ') && phrase.endsWith('s') && phrase.length > 4
    ? phrase.slice(0, -1)
    : phrase;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = phrase.includes(' ')
    ? new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    : new RegExp(`\\b${escaped}`, 'i');
  const node = ARCHITECTURE.find((item) => re.test(`${item.label || ''} ${item.sub || ''} ${item.desc || ''}`));
  if (!node) return '';
  const sentence = String(node.desc || '').split(/(?<=[.!?])\s+/).find((part) => re.test(part)) || String(node.desc || '');
  const names = String(node.sub || '').split('·').map((part) => part.trim()).filter(Boolean);
  const listed = names.length ? ` It lists ${names.join(', ')} in that layer.` : '';
  return `The portfolio ${String(node.label || 'architecture').toLowerCase()} diagram says "${sentence.trim()}".${listed} That is diagram labeling, not a documented project implementation, and not personal proficiency.`;
}

function projectStackMembershipSentence(label) {
  const needle = String(label || '').toLowerCase();
  const listed = [];
  const absent = [];
  for (const project of PROJECTS) {
    const hit = (project.stack || []).some((name) => String(name).toLowerCase() === needle);
    (hit ? listed : absent).push(project.name);
  }
  const absence = 'Absence from a project stack list is not proof it was never used.';
  if (!listed.length) return `No project stack list includes ${label}. ${absence}`;
  const listedVerb = listed.length > 1 ? 'list' : 'lists';
  const absentVerb = absent.length > 1 ? 'do' : 'does';
  const absentSentence = absent.length
    ? ` ${absent.join(' and ')} ${absentVerb} not. ${absence}`
    : '';
  return `${listed.join(' and ')} ${listedVerb} ${label} on ${listed.length > 1 ? 'their project stacks' : 'its project stack'}.${absentSentence} A project stack entry is a listed item, not a verified implementation.`;
}

export function isPortfolioOrProjectStackName(label) {
  const needle = String(label || '').toLowerCase();
  if (!needle) return false;
  if (STACK.some((item) => String(item?.name || '').toLowerCase() === needle)) return true;
  return PROJECTS.some((project) => (project.stack || []).some((name) => String(name).toLowerCase() === needle));
}

export function projectStackEvidenceLine(projectId, label) {
  const project = getProject(projectId);
  const name = project?.name || projectId;
  const hit = (project?.stack || []).find((item) => String(item).toLowerCase() === String(label || '').toLowerCase());
  if (hit) {
    return `${name} lists ${hit} on its project stack. That is a listed stack item, not a verified implementation and not personal proficiency.`;
  }
  return `${name} does not list ${label} on its project stack. That absence is not proof it was never used.`;
}

export function speakProjectStackEvidence(classification = {}) {
  const project = getProject(classification.projectId);
  const name = project?.name || 'That project';
  const tech = String(classification.technology || '').trim();
  const listed = (project?.stack || []).some((item) => String(item).toLowerCase() === tech.toLowerCase());
  const still = classification.elaborate ? 'That is still the record. ' : '';
  const limit = 'That is not a verified implementation and not a personal-proficiency record.';
  if (classification.asksList) {
    if (listed) return `${still}Yes. ${tech} is listed on ${name}'s project stack. ${limit}`;
    return `${still}No. ${tech} is not listed on ${name}'s project stack. ${tech} is listed in the portfolio stack. Absence from this project's list is not proof it was never used. ${limit}`;
  }
  if (listed) {
    return `${still}${tech} is listed on ${name}'s project stack. The project knowledge record does not document a ${tech} implementation. I will not treat that gap as proof ${name} does not use ${tech}. ${limit}`;
  }
  return `${still}${tech} is not listed on ${name}'s project stack, and the project knowledge record does not document a ${tech} implementation. I will not treat that absence as proof it does not use ${tech}. ${limit}`;
}

export function speakProjectAliasRecord(classification = {}) {
  const project = getProject(classification.projectId);
  const name = project?.name || 'That project';
  const alias = String(classification.alias || 'that wording').trim();
  const still = classification.elaborate ? 'That is still the record. ' : '';
  const list = classification.asksList
    ? `${alias} is not a name on ${name}'s project stack. `
    : '';
  return `${still}${list}${name} does not document ${alias} in its project knowledge record. I will not rename ${alias} to another technology. I will not treat that absence as proof ${name} does not use ${alias}. That is not a verified implementation and not a personal-proficiency record.`;
}

export function speakConceptAlias({ alias, elaborate = false, asksList = false } = {}) {
  const label = String(alias || '').trim();
  if (!label) return '';
  const still = elaborate ? 'That is still the record for this wording. ' : '';
  const proficiency = elaborate
    ? `I still don't have a record of personal proficiency with ${label}.`
    : `I don't have a record of personal proficiency with ${label}.`;
  const limit = 'I will not treat that wording as a named technology, and I will not treat missing documentation as proof it was never used.';
  if (asksList) {
    return `${still}No. ${label} is not a name on the portfolio stack. The records do not document ${label} as a specific technology. I will not rename that wording to another technology. ${limit} ${proficiency}`;
  }
  const diagram = diagramLabelForConcept(label);
  if (diagram) {
    return `${still}The project records do not document a ${label} implementation. ${diagram} ${limit} ${proficiency}`;
  }
  return `${still}The records do not document ${label} as a specific technology. ${limit} ${proficiency}`;
}

/**
 * The portfolio STACK list. Membership is not a proficiency claim.
 */
export function speakStackInventory({ elaborate = false } = {}) {
  const names = STACK.map((item) => item.name).filter(Boolean);
  const still = elaborate ? 'That is still the portfolio stack. ' : '';
  return `${still}The portfolio stack lists ${names.join(', ')}. A name on that list is stack membership. It is not, by itself, a record of personal proficiency.`;
}

export function speakStackMembership(label, { elaborate = false } = {}) {
  const name = String(label || '').trim();
  const listed = STACK.some((item) => String(item?.name || '').toLowerCase() === name.toLowerCase());
  const still = elaborate ? 'That is still the stack record. ' : '';
  if (listed) {
    return `${still}Yes. ${name} is listed in the portfolio stack. That is stack membership. The available records do not establish personal proficiency with ${name}.`;
  }
  return `${still}No. ${name} is not listed in the portfolio stack. That is a stack-membership finding. It does not prove ${name} was never used, and it does not establish personal proficiency.`;
}

/**
 * Pre-composed statement for a non-owned entity —
 * docs/REASONING_ENGINE_SPEC.md Section 3.4's `EvidenceSet.gapNotes`.
 * `'gap'` is a taxonomy name absent from STACK. Project records can still
 * mention it, so the note must not treat that absence as shipped-history
 * proof. `'unknown'` has no taxonomy record either.
 */
function gapNoteFor(entity) {
  // Brand / universe is never a "missing skill"
  if (entity.type === 'brand' || /sriiverse/i.test(String(entity.canonical || ''))) {
    return null;
  }
  if (entity.ownership === 'gap') {
    return portfolioTechnologyNote(entity.canonical);
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
    .map(gapNoteFor)
    .filter(Boolean);

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
