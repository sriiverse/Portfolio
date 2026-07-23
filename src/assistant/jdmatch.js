/**
 * jdmatch.js — Job Description Matching engine for SRIIVERSE AI (Sprint 3).
 *
 * Pure, offline, provider-agnostic and UI-agnostic: this module only
 * analyzes text and returns structured data. It never calls a provider,
 * never touches the DOM, and never renders anything — assistant.js and
 * providers.js are responsible for turning its output into a response.
 *
 * Algorithm (deliberately simple, explainable, and grounded — no network,
 * no invented facts):
 *   1. Detect which SKILLS_TAXONOMY skills the pasted JD text asks for
 *      (matchTaxonomyEntities() — see assistant/entities.js).
 *   2. Cross-reference each against STACK to split matched vs. missing.
 *   3. Score = matched / (matched + missing).
 *   4. Rank PROJECTS by stack-overlap with the matched skills.
 *   5. Pull talking points only from project data that already exists
 *      (PROJECTS[].decisions) — never a sentence invented for this feature.
 *
 * Reasoning-engine migration note (docs/REASONING_ENGINE_SPEC.md Section
 * 8.1): matchTaxonomyEntities() used to be defined in this file; it is now
 * defined in assistant/entities.js (the canonical Entity Resolution owner)
 * and imported here. Signature and behavior are unchanged — this file's own
 * public API (looksLikeJobDescription, analyzeJobDescription) did not change.
 */
import { getAllProjects, getStack } from './knowledge.js';
import { matchTaxonomyEntities } from './entities.js';

// Bounds how much of a pathologically long paste is actually scanned, so a
// single message can never cause a noticeable stall (Sprint 3 plan — Risks).
const MAX_SCAN_LENGTH = 8000;

// Phrases that shape like a real job posting rather than an ordinary question.
const JD_SHAPE_PHRASES = [
  'responsibilities', 'requirements', 'qualifications', 'years of experience',
  'who you are', "what you'll do", 'we are looking for', 'employment type',
  'job description', 'about the role', 'nice to have', 'preferred qualifications',
  'job title', 'about the job', 'about the team',
];

// Explicit opt-in trigger — guarantees deterministic activation regardless
// of the heuristic below (e.g. a chip or a deliberate prefix).
const EXPLICIT_TRIGGER = /^(match|analy[sz]e)\s+(this|the following)?\s*job description/i;

function normalize(text) {
  return String(text || '').slice(0, MAX_SCAN_LENGTH).toLowerCase();
}

/**
 * Heuristic used by assistant.js's classifyIntent to decide whether a
 * message is a pasted job description rather than a normal question.
 * Requires EITHER an explicit trigger phrase, OR (length + keyword density),
 * to keep false positives low on both sides (missed JDs vs. misfired ones).
 */
export function looksLikeJobDescription(text) {
  const raw = String(text || '');
  if (EXPLICIT_TRIGGER.test(raw.trim())) return true;
  if (raw.length < 400) return false;

  const normalized = normalize(raw);
  let shapeHits = 0;
  for (const phrase of JD_SHAPE_PHRASES) {
    if (normalized.includes(phrase)) shapeHits++;
    if (shapeHits >= 2) return true;
  }
  return false;
}

/** Rank projects by how many of the matched skills their stack covers. */
function rankRelevantProjects(matchedSkills) {
  if (!matchedSkills.length) return [];
  const matchedSet = new Set(matchedSkills);
  return getAllProjects()
    .map((p) => ({ project: p, overlap: p.stack.filter((s) => matchedSet.has(s)).length }))
    .filter((r) => r.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 2)
    .map((r) => r.project);
}

/** Talking points sourced only from existing PROJECTS[].decisions — never invented. */
function buildTalkingPoints(matchedSkills, relevantProjects) {
  const points = [];
  const topSkills = matchedSkills.slice(0, 3);
  for (const skill of topSkills) {
    const project = relevantProjects.find((p) => p.stack.includes(skill)) || relevantProjects[0];
    if (!project) continue;
    const decision = project.decisions.find((d) => d.toLowerCase().includes(skill.toLowerCase()));
    points.push(decision ? `**${skill}** — ${decision}` : `**${skill}** — used directly in ${project.name} (${project.tagline}).`);
  }
  return points;
}

/**
 * Analyze a pasted job description against the portfolio's known skills
 * and projects. Returns structured data only — no text formatting, no
 * rendering, no provider calls.
 */
export function analyzeJobDescription(jdText) {
  const normalized = normalize(jdText);
  const requested = matchTaxonomyEntities(normalized, { normalized: true });

  if (!requested.length) {
    return {
      score: null,
      matchedSkills: [],
      missingSkills: [],
      relevantProjects: [],
      talkingPoints: [],
      noSkillsDetected: true,
    };
  }

  const knownNames = new Set(getStack().map((s) => s.name));
  const matchedSkills = requested.filter((skill) => knownNames.has(skill));
  const missingSkills = requested.filter((skill) => !knownNames.has(skill));
  const score = Math.round((matchedSkills.length / requested.length) * 100);
  const relevantProjects = rankRelevantProjects(matchedSkills);
  const talkingPoints = buildTalkingPoints(matchedSkills, relevantProjects);

  return { score, matchedSkills, missingSkills, relevantProjects, talkingPoints, noSkillsDetected: false };
}
