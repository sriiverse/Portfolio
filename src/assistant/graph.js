/**
 * graph.js — V4 Phase 1 Engineering Knowledge Graph
 *
 * Derives a directed property graph entirely from content.js
 * (PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY). No duplicated
 * portfolio facts, no hardcoded project↔tech maps, no reasoning /
 * providers / UI coupling.
 *
 * Phase 1 scope: structural nodes + relationships only.
 * Decision Records and Engineering Identity are later phases.
 */

import {
  PROFILE,
  PROJECTS,
  STACK,
  ARCHITECTURE,
  JOURNEY,
} from '../content.js';

/* ============================================================
   ID HELPERS
   ============================================================ */

export function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nodeId(type, key) {
  return `${type}:${slugify(key)}`;
}

/* ============================================================
   EDGE / NODE TYPES (Phase 1)
   ============================================================ */

export const NODE_TYPES = Object.freeze([
  'Profile',
  'Project',
  'Technology',
  'ArchLayer',
  'Feature',
  'Decision',
  'JourneyPhase',
]);

export const EDGE_TYPES = Object.freeze([
  'ships',           // Profile → Project
  'used_in',         // Technology → Project
  'has_feature',     // Project → Feature
  'has_decision',    // Project → Decision
  'next_layer',      // ArchLayer → ArchLayer (topology order)
  'talks_to',        // ArchLayer → ArchLayer (documented communication)
  'via',             // talks_to edge companion: ArchLayer → Technology (protocol)
  'appears_in_layer',// Technology → ArchLayer (from layer.sub listings)
  'journey_step',    // JourneyPhase → JourneyPhase
  'journey_ships',   // JourneyPhase → Project (when title matches a project)
]);

/* ============================================================
   BUILD
   ============================================================ */

/**
 * Build the engineering knowledge graph from portfolio source objects.
 * Pass custom sources only in tests; production uses content.js exports.
 */
export function buildEngineeringGraph(sources = {}) {
  const profile = sources.PROFILE ?? PROFILE;
  const projects = sources.PROJECTS ?? PROJECTS;
  const stack = sources.STACK ?? STACK;
  const architecture = sources.ARCHITECTURE ?? ARCHITECTURE;
  const journey = sources.JOURNEY ?? JOURNEY;

  const nodes = new Map();
  const edges = [];
  const edgeKeys = new Set();

  const addNode = (node) => {
    if (!node?.id) throw new Error('graph.js: node missing id');
    if (nodes.has(node.id)) {
      // Merge shallow props; never invent — later write wins only for new keys.
      const prev = nodes.get(node.id);
      nodes.set(node.id, { ...prev, ...node, props: { ...prev.props, ...node.props } });
      return nodes.get(node.id);
    }
    nodes.set(node.id, node);
    return node;
  };

  const addEdge = (type, from, to, props = {}) => {
    if (!type || !from || !to) return null;
    const key = `${type}|${from}|${to}`;
    if (edgeKeys.has(key)) return null;
    edgeKeys.add(key);
    const edge = { id: key, type, from, to, props };
    edges.push(edge);
    return edge;
  };

  // --- Profile ---
  const profileNodeId = nodeId('profile', 'sudhanshu');
  addNode({
    id: profileNodeId,
    type: 'Profile',
    label: profile.name,
    props: {
      name: profile.name,
      brand: profile.brand,
      title: profile.title,
      tagline: profile.tagline,
      github: profile.github,
      linkedin: profile.linkedin,
      siteUrl: profile.siteUrl,
    },
  });

  // --- Technologies (portfolio STACK — single registry) ---
  const techByName = new Map();
  for (const t of stack) {
    const id = nodeId('tech', t.name);
    techByName.set(t.name, id);
    addNode({
      id,
      type: 'Technology',
      label: t.name,
      props: {
        name: t.name,
        group: t.group,
        color: t.color,
        source: 'STACK',
      },
    });
  }

  const resolveTechId = (name) => {
    if (techByName.has(name)) return techByName.get(name);
    // Project stack entries must already exist in STACK in a healthy content.js;
    // if a stray name appears, create a Technology node marked as stack-orphan
    // so validation can flag it — still derived, not hardcoded.
    const id = nodeId('tech', name);
    addNode({
      id,
      type: 'Technology',
      label: name,
      props: { name, group: null, color: null, source: 'project-stack-orphan' },
    });
    techByName.set(name, id);
    return id;
  };

  // --- Architecture layers ---
  const layerIds = [];
  for (const layer of architecture) {
    const id = nodeId('layer', layer.id);
    layerIds.push(id);
    addNode({
      id,
      type: 'ArchLayer',
      label: layer.label,
      props: {
        layerId: layer.id,
        sub: layer.sub,
        desc: layer.desc,
        color: layer.color,
      },
    });

    // Technologies named in layer.sub (e.g. "React · TypeScript · Tailwind")
    for (const techName of extractTechNamesFromSub(layer.sub, techByName)) {
      addEdge('appears_in_layer', techByName.get(techName), id, {
        source: 'ARCHITECTURE.sub',
        layerId: layer.id,
      });
    }
  }

  // Topology order: frontend → backend → ai → database → deploy
  for (let i = 0; i < layerIds.length - 1; i += 1) {
    addEdge('next_layer', layerIds[i], layerIds[i + 1], { source: 'ARCHITECTURE.order' });
  }

  // Documented communication: Frontend talks to Backend over REST
  // (ARCHITECTURE frontend.desc: "Talks to the backend exclusively over REST.")
  const frontendId = nodeId('layer', 'frontend');
  const backendId = nodeId('layer', 'backend');
  if (nodes.has(frontendId) && nodes.has(backendId)) {
    addEdge('talks_to', frontendId, backendId, {
      source: 'ARCHITECTURE.frontend.desc',
      note: 'Talks to the backend exclusively over REST.',
    });
    if (techByName.has('REST APIs')) {
      addEdge('via', frontendId, techByName.get('REST APIs'), {
        source: 'ARCHITECTURE.frontend.desc',
        role: 'protocol',
      });
      addEdge('via', backendId, techByName.get('REST APIs'), {
        source: 'ARCHITECTURE.frontend.desc',
        role: 'protocol',
      });
    }
  }

  // --- Projects, features, decisions, used_in ---
  const projectByName = new Map();
  for (const p of projects) {
    const pid = nodeId('project', p.id);
    projectByName.set(p.name, pid);
    projectByName.set(p.name.toLowerCase(), pid);

    addNode({
      id: pid,
      type: 'Project',
      label: p.name,
      props: {
        projectId: p.id,
        index: p.index,
        name: p.name,
        title: p.title,
        tagline: p.tagline,
        live: p.live,
        repo: p.repo,
        theme: p.theme,
        problem: p.problem,
        solution: p.solution,
        stack: [...(p.stack || [])],
      },
    });

    addEdge('ships', profileNodeId, pid, { source: 'PROJECTS' });

    for (const techName of p.stack || []) {
      const tid = resolveTechId(techName);
      addEdge('used_in', tid, pid, { source: 'PROJECTS.stack' });
    }

    (p.features || []).forEach((f, i) => {
      const fid = nodeId('feature', `${p.id}-${i}-${f.title}`);
      addNode({
        id: fid,
        type: 'Feature',
        label: f.title,
        props: {
          projectId: p.id,
          index: i,
          title: f.title,
          desc: f.desc,
          icon: f.icon,
        },
      });
      addEdge('has_feature', pid, fid, { source: 'PROJECTS.features', index: i });
    });

    (p.decisions || []).forEach((text, i) => {
      const did = nodeId('decision', `${p.id}-${i}`);
      addNode({
        id: did,
        type: 'Decision',
        label: `Decision ${i + 1} · ${p.name}`,
        props: {
          projectId: p.id,
          index: i,
          text: String(text),
          // Full DecisionRecord enrichment is Phase 2+
          recordStatus: 'raw',
        },
      });
      addEdge('has_decision', pid, did, { source: 'PROJECTS.decisions', index: i });
    });
  }

  // --- Journey ---
  const journeyIds = [];
  journey.forEach((step, i) => {
    const jid = nodeId('journey', `${i}-${step.phase}`);
    journeyIds.push(jid);
    addNode({
      id: jid,
      type: 'JourneyPhase',
      label: step.title,
      props: {
        index: i,
        phase: step.phase,
        title: step.title,
        desc: step.desc,
      },
    });

    // Link to project when journey title matches a project name (derived, not hardcoded ids)
    const matchPid = matchProjectByTitle(step.title, projects);
    if (matchPid) {
      addEdge('journey_ships', jid, nodeId('project', matchPid), {
        source: 'JOURNEY.title→PROJECTS.name',
      });
    }
  });
  for (let i = 0; i < journeyIds.length - 1; i += 1) {
    addEdge('journey_step', journeyIds[i], journeyIds[i + 1], { source: 'JOURNEY.order' });
  }

  return {
    version: 'v4-phase1',
    generatedAt: null, // filled by getEngineeringGraph for runtime builds
    nodes,
    edges,
    indexes: {
      byType: indexByType(nodes),
      techByName,
      projectByName,
    },
  };
}

/** Parse ARCHITECTURE.sub listings against known STACK names (longest match first). */
function extractTechNamesFromSub(sub, techByName) {
  const names = [...techByName.keys()].sort((a, b) => b.length - a.length);
  const found = [];
  let rest = String(sub || '');
  // Normalize separators
  rest = rest.replace(/·/g, ' ').replace(/\s+/g, ' ');
  for (const name of names) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    // Tailwind in sub is often "Tailwind" while STACK is "TailwindCSS"
    if (re.test(rest) || (name === 'TailwindCSS' && /\btailwind\b/i.test(rest))) {
      found.push(name);
    }
  }
  return found;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchProjectByTitle(title, projects) {
  const t = String(title || '').trim().toLowerCase();
  if (!t) return null;
  const hit = projects.find((p) => p.name.toLowerCase() === t || t.includes(p.name.toLowerCase()));
  return hit ? hit.id : null;
}

function indexByType(nodes) {
  const map = {};
  for (const type of NODE_TYPES) map[type] = [];
  for (const n of nodes.values()) {
    if (!map[n.type]) map[n.type] = [];
    map[n.type].push(n.id);
  }
  return map;
}

/* ============================================================
   SINGLETON ACCESS
   ============================================================ */

let _graph = null;

/** Returns the memoized graph derived from live content.js. */
export function getEngineeringGraph({ forceRebuild = false } = {}) {
  if (!_graph || forceRebuild) {
    _graph = buildEngineeringGraph();
    _graph.generatedAt = new Date().toISOString();
  }
  return _graph;
}

/** Test helper — clears memoization. */
export function resetEngineeringGraph() {
  _graph = null;
}

/* ============================================================
   QUERY UTILITIES
   ============================================================ */

export function getNode(graph, id) {
  return graph.nodes.get(id) || null;
}

export function getNodesByType(graph, type) {
  const ids = graph.indexes.byType[type] || [];
  return ids.map((id) => graph.nodes.get(id)).filter(Boolean);
}

export function getEdges(graph, { from, to, type } = {}) {
  return graph.edges.filter((e) => {
    if (from && e.from !== from) return false;
    if (to && e.to !== to) return false;
    if (type && e.type !== type) return false;
    return true;
  });
}

/**
 * Neighborhood walk.
 * @param {'out'|'in'|'both'} direction
 * @param {string[]} [edgeTypes]
 * @param {number} [depth=1]
 */
export function getNeighbors(graph, nodeIdValue, {
  direction = 'out',
  edgeTypes = null,
  depth = 1,
} = {}) {
  if (!graph.nodes.has(nodeIdValue)) return [];
  const allowed = edgeTypes ? new Set(edgeTypes) : null;
  const visited = new Set([nodeIdValue]);
  let frontier = [nodeIdValue];
  const results = [];

  for (let d = 0; d < depth; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const e of graph.edges) {
        if (allowed && !allowed.has(e.type)) continue;
        let other = null;
        if ((direction === 'out' || direction === 'both') && e.from === id) other = e.to;
        if ((direction === 'in' || direction === 'both') && e.to === id) other = e.from;
        if (!other || visited.has(other)) continue;
        visited.add(other);
        next.push(other);
        results.push({
          node: graph.nodes.get(other),
          edge: e,
          depth: d + 1,
        });
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return results;
}

/** Technologies used in a project (via used_in edges). */
export function getProjectTechnologies(graph, projectKey) {
  const pid = resolveProjectId(graph, projectKey);
  if (!pid) return [];
  return getEdges(graph, { to: pid, type: 'used_in' })
    .map((e) => graph.nodes.get(e.from))
    .filter(Boolean);
}

/** Projects that use a technology. */
export function getTechnologyProjects(graph, techName) {
  const tid = graph.indexes.techByName.get(techName) || nodeId('tech', techName);
  return getEdges(graph, { from: tid, type: 'used_in' })
    .map((e) => graph.nodes.get(e.to))
    .filter(Boolean);
}

export function getProjectFeatures(graph, projectKey) {
  const pid = resolveProjectId(graph, projectKey);
  if (!pid) return [];
  return getEdges(graph, { from: pid, type: 'has_feature' })
    .map((e) => graph.nodes.get(e.to))
    .filter(Boolean);
}

export function getProjectDecisions(graph, projectKey) {
  const pid = resolveProjectId(graph, projectKey);
  if (!pid) return [];
  return getEdges(graph, { from: pid, type: 'has_decision' })
    .map((e) => graph.nodes.get(e.to))
    .filter(Boolean);
}

export function getArchitecturePath(graph) {
  const layers = getNodesByType(graph, 'ArchLayer');
  // Prefer topology order via next_layer chain from frontend
  const start = layers.find((l) => l.props.layerId === 'frontend') || layers[0];
  if (!start) return [];
  const path = [start];
  let current = start.id;
  const guard = new Set([current]);
  while (true) {
    const nextEdge = getEdges(graph, { from: current, type: 'next_layer' })[0];
    if (!nextEdge || guard.has(nextEdge.to)) break;
    guard.add(nextEdge.to);
    const node = graph.nodes.get(nextEdge.to);
    if (!node) break;
    path.push(node);
    current = nextEdge.to;
  }
  return path;
}

function resolveProjectId(graph, projectKey) {
  if (!projectKey) return null;
  if (graph.nodes.has(projectKey)) return projectKey;
  const asId = nodeId('project', projectKey);
  if (graph.nodes.has(asId)) return asId;
  return graph.indexes.projectByName.get(projectKey)
    || graph.indexes.projectByName.get(String(projectKey).toLowerCase())
    || null;
}

export function graphStats(graph) {
  const byType = {};
  for (const type of NODE_TYPES) byType[type] = (graph.indexes.byType[type] || []).length;
  const edgesByType = {};
  for (const e of graph.edges) edgesByType[e.type] = (edgesByType[e.type] || 0) + 1;
  return {
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    nodesByType: byType,
    edgesByType,
  };
}

/* ============================================================
   VALIDATION
   ============================================================ */

/**
 * Validate graph integrity against the source content used to build it.
 * Returns { ok, errors, warnings, stats }.
 */
export function validateEngineeringGraph(graph, sources = {}) {
  const projects = sources.PROJECTS ?? PROJECTS;
  const stack = sources.STACK ?? STACK;
  const architecture = sources.ARCHITECTURE ?? ARCHITECTURE;
  const journey = sources.JOURNEY ?? JOURNEY;

  const errors = [];
  const warnings = [];

  if (!graph || !(graph.nodes instanceof Map) || !Array.isArray(graph.edges)) {
    return { ok: false, errors: ['Graph missing nodes Map or edges array'], warnings, stats: null };
  }

  // Node id uniqueness already enforced by Map; check types
  for (const n of graph.nodes.values()) {
    if (!NODE_TYPES.includes(n.type)) errors.push(`Unknown node type: ${n.type} (${n.id})`);
    if (!n.label) warnings.push(`Node ${n.id} missing label`);
  }

  // Edge endpoint existence + type
  for (const e of graph.edges) {
    if (!EDGE_TYPES.includes(e.type)) errors.push(`Unknown edge type: ${e.type}`);
    if (!graph.nodes.has(e.from)) errors.push(`Edge ${e.id} from missing node ${e.from}`);
    if (!graph.nodes.has(e.to)) errors.push(`Edge ${e.id} to missing node ${e.to}`);
  }

  // Content coverage: projects
  for (const p of projects) {
    const pid = nodeId('project', p.id);
    if (!graph.nodes.has(pid)) errors.push(`Missing Project node for ${p.id}`);
    else {
      for (const tech of p.stack || []) {
        const tid = nodeId('tech', tech);
        const has = graph.edges.some((e) => e.type === 'used_in' && e.from === tid && e.to === pid);
        if (!has) errors.push(`Missing used_in edge: ${tech} → ${p.id}`);
      }
      if ((p.features || []).length !== getEdges(graph, { from: pid, type: 'has_feature' }).length) {
        errors.push(`Feature edge count mismatch for ${p.id}`);
      }
      if ((p.decisions || []).length !== getEdges(graph, { from: pid, type: 'has_decision' }).length) {
        errors.push(`Decision edge count mismatch for ${p.id}`);
      }
    }
  }

  // Content coverage: stack
  for (const t of stack) {
    const tid = nodeId('tech', t.name);
    if (!graph.nodes.has(tid)) errors.push(`Missing Technology node for STACK entry ${t.name}`);
  }

  // Orphan project-stack techs
  for (const n of getNodesByType(graph, 'Technology')) {
    if (n.props.source === 'project-stack-orphan') {
      warnings.push(`Technology ${n.label} appears in a project stack but not in STACK`);
    }
  }

  // Architecture layers + next_layer chain length
  for (const layer of architecture) {
    const lid = nodeId('layer', layer.id);
    if (!graph.nodes.has(lid)) errors.push(`Missing ArchLayer node for ${layer.id}`);
  }
  const nextCount = getEdges(graph, { type: 'next_layer' }).length;
  if (architecture.length > 1 && nextCount !== architecture.length - 1) {
    errors.push(`Expected ${architecture.length - 1} next_layer edges, found ${nextCount}`);
  }

  // Journey step chain
  const journeySteps = getEdges(graph, { type: 'journey_step' }).length;
  if (journey.length > 1 && journeySteps !== journey.length - 1) {
    errors.push(`Expected ${journey.length - 1} journey_step edges, found ${journeySteps}`);
  }

  // Profile ships all projects
  const profileId = nodeId('profile', 'sudhanshu');
  const ships = getEdges(graph, { from: profileId, type: 'ships' });
  if (ships.length !== projects.length) {
    errors.push(`Profile ships ${ships.length} projects; expected ${projects.length}`);
  }

  const stats = graphStats(graph);
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}
