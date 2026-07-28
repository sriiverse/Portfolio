/**
 * decisions.js — V4 Phase 2 Decision Records
 *
 * Builds first-class DecisionRecord objects from the Engineering Knowledge
 * Graph (Phase 1). The graph is the source of truth for projects, techs,
 * layers, and raw decision nodes. This module does not duplicate content.js
 * and does not modify reasoning / providers / UI.
 *
 * TECH_TAKES (persona.js) is used only to attach authored trade-off dimensions
 * and named alternatives when those technologies already exist as graph
 * Technology nodes — never to invent project-specific rejections.
 */

import {
  getEngineeringGraph,
  getNodesByType,
  getEdges,
  getProjectTechnologies,
  getArchitecturePath,
  nodeId,
} from './graph.js';
import { TECH_TAKES } from './persona.js';

/* ============================================================
   BUILD
   ============================================================ */

/**
 * Build DecisionRecords for every Decision node in the graph.
 * @param {object} [graph] — defaults to getEngineeringGraph()
 * @returns {DecisionRecord[]}
 */
export function buildDecisionRecords(graph = getEngineeringGraph()) {
  const decisionNodes = getNodesByType(graph, 'Decision');
  const records = decisionNodes
    .map((node) => buildOneRecord(graph, node))
    .filter(Boolean);

  // Stable order: project index then decision index
  records.sort((a, b) => {
    if (a.projectId !== b.projectId) return String(a.projectId).localeCompare(String(b.projectId));
    return a.index - b.index;
  });

  return records;
}

function buildOneRecord(graph, decisionNode) {
  const projectId = decisionNode.props.projectId;
  const projectNode = graph.nodes.get(nodeId('project', projectId));
  if (!projectNode) return null;

  const text = String(decisionNode.props.text || '');
  const projectTechs = getProjectTechnologies(graph, projectId);
  const techNames = projectTechs.map((t) => t.label);

  const mentioned = findMentionedTechs(text, techNames);
  const chosen = mentioned[0] || null;
  const relatedTechs = mentioned.slice(1);

  const context = inferContext(graph, text, chosen, mentioned);
  const problemSolved = inferProblemSolved(projectNode, text);
  const reasons = [text]; // documented decision prose — never invented

  const { tradeoffs, alternatives } = resolveTradeoffsAndAlternatives(graph, projectId, chosen);

  const currentEvaluation = evaluateWouldChooseAgain(graph, projectNode, chosen, mentioned);

  return {
    id: `${projectId}:${decisionNode.props.index}`,
    graphNodeId: decisionNode.id,
    projectId,
    projectName: projectNode.label,
    index: decisionNode.props.index,
    context,
    chosen,
    relatedTechs,
    chosenKind: chosen ? 'technology' : 'approach',
    problemSolved,
    reasons,
    tradeoffs,
    alternatives,
    currentEvaluation,
    evidenceRefs: buildEvidenceRefs(graph, decisionNode, projectNode, mentioned),
    confidence: {
      chosen: chosen ? 'documented' : 'unknown',
      context: context.source,
      problemSolved: problemSolved.source,
      tradeoffs: tradeoffs.length ? 'documented' : 'unknown',
      alternatives: alternatives.length ? 'documented' : 'unknown',
      currentEvaluation: currentEvaluation.confidence,
    },
    rawText: text,
  };
}

/** Longest-first mention scan against technologies used_in this project (graph). */
function findMentionedTechs(text, techNames) {
  const sorted = [...techNames].sort((a, b) => b.length - a.length);
  const found = [];
  const lower = text.toLowerCase();
  for (const name of sorted) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    const alt = name === 'TailwindCSS' ? /\btailwind(\s*css)?\b/i : null;
    if (re.test(text) || (alt && alt.test(text))) {
      if (!found.includes(name)) found.push(name);
    } else if (name === 'LLMs' && /\b(llm|llms)\b/i.test(lower) && /reasoning layer|schema|model/i.test(lower)) {
      if (!found.includes(name)) found.push(name);
    }
  }
  // Prefer concrete frameworks/platforms over languages when both appear.
  found.sort((a, b) => techSpecificity(a) - techSpecificity(b) || b.length - a.length);
  return found;
}

function techSpecificity(name) {
  if (/^(Flask|FastAPI|React|PostgreSQL|MongoDB|Docker|Vercel|Netlify|Render|JWT|Ollama)$/i.test(name)) return 0;
  if (/^(REST APIs|TailwindCSS|LLMs)$/i.test(name)) return 1;
  if (/^(Python|JavaScript|TypeScript)$/i.test(name)) return 3;
  return 2;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Context from ArchLayer labels when decision text or chosen tech aligns
 * with layer.sub / appears_in_layer edges — still graph-derived.
 */
function inferContext(graph, text, chosen, mentioned) {
  const layers = getArchitecturePath(graph);
  const lower = text.toLowerCase();

  // Keyword → layerId hints (matched only to layers that exist in graph)
  const hints = [
    { re: /\b(frontend|react|ui|dashboard|interface|terminal|surface)\b/i, layerId: 'frontend' },
    { re: /\b(backend|flask|fastapi|api|orchestr|auth|server)\b/i, layerId: 'backend' },
    { re: /\b(llm|ai layer|reasoning layer|prompt|ollama)\b/i, layerId: 'ai' },
    { re: /\b(database|schema|sql|postgres|mongo|db)\b/i, layerId: 'database' },
    { re: /\b(deploy|vercel|netlify|docker|production)\b/i, layerId: 'deploy' },
  ];

  for (const h of hints) {
    if (h.re.test(lower)) {
      const layer = layers.find((l) => l.props.layerId === h.layerId);
      if (layer) {
        return {
          label: layer.label,
          layerId: layer.props.layerId,
          source: 'documented',
          note: `Aligned to ${layer.label} from decision wording + architecture graph`,
        };
      }
    }
  }

  // Fall back: chosen tech's appears_in_layer edge
  if (chosen) {
    const tid = nodeId('tech', chosen);
    const layerEdges = getEdges(graph, { from: tid, type: 'appears_in_layer' });
    if (layerEdges[0]) {
      const layer = graph.nodes.get(layerEdges[0].to);
      if (layer) {
        return {
          label: layer.label,
          layerId: layer.props.layerId,
          source: 'inferred',
          note: `${chosen} appears_in_layer ${layer.label}`,
        };
      }
    }
  }

  if (mentioned.length) {
    return {
      label: 'Project engineering decision',
      layerId: null,
      source: 'inferred',
      note: 'No single architecture layer matched; kept project-scoped',
    };
  }

  return {
    label: 'Engineering approach',
    layerId: null,
    source: 'inferred',
    note: 'Decision text does not name a stack technology on this project',
  };
}

function inferProblemSolved(projectNode, decisionText) {
  // Prefer project problem statement from graph node props (from content via graph).
  const problem = projectNode.props.problem;
  if (problem) {
    return {
      text: problem,
      source: 'documented',
      scope: 'project',
    };
  }
  return {
    text: decisionText,
    source: 'documented',
    scope: 'decision-only',
  };
}

/**
 * Trade-offs / alternatives from TECH_TAKES when chosen tech is in a pair.
 * Chosen must exist in the graph. Counterpart may be absent from STACK
 * (status: not-in-portfolio-stack) — never framed as "rejected".
 */
function resolveTradeoffsAndAlternatives(graph, projectId, chosen) {
  const tradeoffs = [];
  const alternatives = [];
  if (!chosen) return { tradeoffs, alternatives };

  const take = TECH_TAKES.find((tt) => tt.techs.includes(chosen));
  if (!take) return { tradeoffs, alternatives };
  if (!graph.nodes.has(nodeId('tech', chosen))) return { tradeoffs, alternatives };

  const chosenIndex = take.techs.indexOf(chosen);
  const otherTechs = take.techs.filter((t) => t !== chosen);

  if (take.techs.length === 2) {
    for (const dim of take.dimensions || []) {
      if (dim.a == null || dim.b == null) continue;
      tradeoffs.push({
        dimension: dim.name,
        chosenView: chosenIndex === 0 ? dim.a : dim.b,
        alternativeView: chosenIndex === 0 ? dim.b : dim.a,
        alternativeTech: otherTechs[0] || null,
        source: 'TECH_TAKES',
      });
    }
  }

  const usedHere = new Set(getProjectTechnologies(graph, projectId).map((t) => t.label));
  for (const alt of otherTechs) {
    const inGraph = graph.nodes.has(nodeId('tech', alt));
    let status;
    let note;
    if (usedHere.has(alt)) {
      status = 'used-here';
      note = 'Also present in this project stack';
    } else if (inGraph) {
      status = 'not-used-on-this-project';
      note = 'Present in portfolio STACK / graph but not in this project stack — not documented as rejected';
    } else {
      status = 'not-in-portfolio-stack';
      note = 'Named in authored TECH_TAKES comparison only — not in portfolio STACK; not documented as evaluated or rejected';
    }
    alternatives.push({ tech: alt, status, note, source: 'graph+TECH_TAKES' });
  }

  return { tradeoffs, alternatives };
}

/**
 * wouldChooseAgain — default unknown.
 * Inferred only when a later project (higher index) still uses / drops the chosen tech.
 */
function evaluateWouldChooseAgain(graph, projectNode, chosen) {
  if (!chosen) {
    return {
      wouldChooseAgain: 'unknown',
      rationale: 'Approach-level decision without a named stack technology — no later-tech comparison possible.',
      confidence: 'unknown',
    };
  }

  const projects = getNodesByType(graph, 'Project')
    .slice()
    .sort((a, b) => String(a.props.index).localeCompare(String(b.props.index)));

  const currentIndex = projectNode.props.index;
  const later = projects.filter((p) => String(p.props.index) > String(currentIndex));

  if (!later.length) {
    return {
      wouldChooseAgain: 'unknown',
      rationale: 'No later shipped project in the graph to compare against.',
      confidence: 'unknown',
    };
  }

  const laterUsage = later.map((p) => {
    const techs = getProjectTechnologies(graph, p.props.projectId).map((t) => t.label);
    return { projectId: p.props.projectId, name: p.label, usesChosen: techs.includes(chosen) };
  });

  const stillUsed = laterUsage.filter((x) => x.usesChosen);
  const dropped = laterUsage.filter((x) => !x.usesChosen);

  if (stillUsed.length && !dropped.length) {
    return {
      wouldChooseAgain: 'lean-yes',
      rationale: `${chosen} still appears on later project(s): ${stillUsed.map((x) => x.name).join(', ')}.`,
      confidence: 'inferred',
      laterUsage,
    };
  }

  if (dropped.length && !stillUsed.length) {
    return {
      wouldChooseAgain: 'depends',
      rationale: `${chosen} does not appear on later project(s): ${dropped.map((x) => x.name).join(', ')}. That does not prove rejection — stack cards differ by product needs.`,
      confidence: 'inferred',
      laterUsage,
    };
  }

  if (stillUsed.length && dropped.length) {
    return {
      wouldChooseAgain: 'depends',
      rationale: `${chosen} is reused on ${stillUsed.map((x) => x.name).join(', ')} but absent from ${dropped.map((x) => x.name).join(', ')}.`,
      confidence: 'inferred',
      laterUsage,
    };
  }

  return {
    wouldChooseAgain: 'unknown',
    rationale: 'Insufficient graph signal for a later-project comparison.',
    confidence: 'unknown',
    laterUsage,
  };
}

function buildEvidenceRefs(graph, decisionNode, projectNode, mentionedTechs) {
  const refs = [
    { kind: 'decision-node', id: decisionNode.id },
    { kind: 'project-node', id: projectNode.id },
  ];
  for (const tech of mentionedTechs) {
    const tid = nodeId('tech', tech);
    if (graph.nodes.has(tid)) refs.push({ kind: 'technology-node', id: tid });
    const used = getEdges(graph, { from: tid, to: projectNode.id, type: 'used_in' });
    for (const e of used) refs.push({ kind: 'edge', id: e.id, type: e.type });
  }
  const hasDecision = getEdges(graph, {
    from: projectNode.id,
    to: decisionNode.id,
    type: 'has_decision',
  });
  for (const e of hasDecision) refs.push({ kind: 'edge', id: e.id, type: e.type });
  return refs;
}

/* ============================================================
   QUERY
   ============================================================ */

let _cache = null;
let _cacheGraphRef = null;

export function getDecisionRecords(graph = getEngineeringGraph(), { forceRebuild = false } = {}) {
  if (!forceRebuild && _cache && _cacheGraphRef === graph) return _cache;
  _cache = buildDecisionRecords(graph);
  _cacheGraphRef = graph;
  return _cache;
}

export function resetDecisionRecordsCache() {
  _cache = null;
  _cacheGraphRef = null;
}

export function getDecisionRecordById(id, graph = getEngineeringGraph()) {
  return getDecisionRecords(graph).find((r) => r.id === id) || null;
}

export function getDecisionsForProject(projectKey, graph = getEngineeringGraph()) {
  const records = getDecisionRecords(graph);
  const key = String(projectKey || '');
  return records.filter((r) => r.projectId === key || r.projectName === key
    || r.projectId === key.replace(/^project:/, ''));
}

export function getDecisionsForTechnology(techName, graph = getEngineeringGraph()) {
  const name = String(techName || '');
  return getDecisionRecords(graph).filter(
    (r) => r.chosen === name || (r.relatedTechs || []).includes(name),
  );
}

export function getDecisionsByContext(layerIdOrLabel, graph = getEngineeringGraph()) {
  const key = String(layerIdOrLabel || '').toLowerCase();
  return getDecisionRecords(graph).filter((r) => {
    const ctx = r.context || {};
    return String(ctx.layerId || '').toLowerCase() === key
      || String(ctx.label || '').toLowerCase() === key;
  });
}

/* ============================================================
   VALIDATION
   ============================================================ */

/**
 * Validate DecisionRecords against the graph.
 * Every record must cite an existing Decision node and Project node.
 */
export function validateDecisionRecords(records, graph = getEngineeringGraph()) {
  const errors = [];
  const warnings = [];
  const decisionNodes = getNodesByType(graph, 'Decision');

  if (records.length !== decisionNodes.length) {
    errors.push(`Record count ${records.length} !== Decision nodes ${decisionNodes.length}`);
  }

  const seen = new Set();
  for (const r of records) {
    if (seen.has(r.id)) errors.push(`Duplicate record id ${r.id}`);
    seen.add(r.id);

    if (!r.graphNodeId || !graph.nodes.has(r.graphNodeId)) {
      errors.push(`Record ${r.id} missing graph Decision node`);
    }
    const pid = nodeId('project', r.projectId);
    if (!graph.nodes.has(pid)) errors.push(`Record ${r.id} project ${r.projectId} not in graph`);

    if (!Array.isArray(r.reasons) || !r.reasons.length) {
      errors.push(`Record ${r.id} has no reasons`);
    }
    if (!Array.isArray(r.evidenceRefs) || !r.evidenceRefs.length) {
      errors.push(`Record ${r.id} has no evidenceRefs`);
    }

    // Chosen tech must be used_in project when present
    if (r.chosen) {
      const tid = nodeId('tech', r.chosen);
      if (!graph.nodes.has(tid)) {
        errors.push(`Record ${r.id} chosen tech ${r.chosen} not in graph`);
      } else {
        const used = getEdges(graph, { from: tid, to: pid, type: 'used_in' });
        if (!used.length) {
          errors.push(`Record ${r.id} chosen ${r.chosen} lacks used_in edge to project`);
        }
      }
    }

    // Never claim alternatives were rejected
    for (const alt of r.alternatives || []) {
      if (/reject/i.test(alt.status || '')) {
        errors.push(`Record ${r.id} alternative status must not claim rejection`);
      }
    }

    if (r.chosenKind === 'approach' && r.chosen) {
      warnings.push(`Record ${r.id} approach kind unexpectedly has chosen=${r.chosen}`);
    }
    if (!r.chosen && r.confidence?.chosen === 'documented') {
      warnings.push(`Record ${r.id} undocumented chosen marked documented`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      recordCount: records.length,
      withChosenTech: records.filter((r) => r.chosen).length,
      approachOnly: records.filter((r) => !r.chosen).length,
      withTradeoffs: records.filter((r) => r.tradeoffs?.length).length,
      withAlternatives: records.filter((r) => r.alternatives?.length).length,
    },
  };
}
