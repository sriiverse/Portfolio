/**
 * knowledgeGraph.js — Document knowledge graph for SRIIVERSE AI.
 *
 * Every knowledge document may declare `relationships: [{ to, type, weight, label }]`.
 * This module builds a directed property graph and exposes traversal helpers
 * that become the backbone of semantic retrieval.
 *
 * Pure JavaScript. No external libraries.
 *
 * Example backbone chain (sample data):
 *   QueryForge
 *     → Engineering Principle 12
 *       → Failure Story 3
 *         → Opinion 5
 *           → Conversation R-021
 *             → Behavior Pattern 2
 */

/**
 * @typedef {object} GraphNode
 * @property {string} id
 * @property {string} category
 * @property {string} label
 * @property {string[]} tags
 * @property {object} doc
 */

/**
 * @typedef {object} GraphEdge
 * @property {string} id
 * @property {string} from
 * @property {string} to
 * @property {string} type
 * @property {number} weight
 * @property {string} [label]
 */

/**
 * @typedef {object} KnowledgeGraph
 * @property {Map<string, GraphNode>} nodes
 * @property {GraphEdge[]} edges
 * @property {Map<string, GraphEdge[]>} out
 * @property {Map<string, GraphEdge[]>} in
 * @property {string} generatedAt
 * @property {number} version
 */

/** @type {KnowledgeGraph|null} */
let _graph = null;
let _buildPromise = null;

/**
 * Build a knowledge graph from an array of knowledge documents.
 * Pure / sync — preferred entry when corpus is already loaded.
 *
 * @param {object[]} documents
 * @returns {KnowledgeGraph}
 */
export function buildKnowledgeGraph(documents) {
  /** @type {Map<string, GraphNode>} */
  const nodes = new Map();
  /** @type {GraphEdge[]} */
  const edges = [];
  /** @type {Map<string, GraphEdge[]>} */
  const out = new Map();
  /** @type {Map<string, GraphEdge[]>} */
  const inMap = new Map();

  const docs = Array.isArray(documents) ? documents : [];

  for (const doc of docs) {
    if (!doc?.id) continue;
    nodes.set(doc.id, {
      id: doc.id,
      category: String(doc.category || 'unknown'),
      label: String(doc.metadata?.graphLabel || doc.content?.name || doc.id),
      tags: Array.isArray(doc.tags) ? doc.tags.map(String) : [],
      doc,
    });
    out.set(doc.id, []);
    inMap.set(doc.id, []);
  }

  let edgeSeq = 0;
  const dangling = [];

  for (const doc of docs) {
    if (!doc?.id) continue;
    for (const rel of readDocumentRelationships(doc)) {
      if (!rel.to) continue;
      if (!nodes.has(rel.to)) {
        dangling.push({
          id: `dangling:${doc.id}:${rel.to}:${edgeSeq++}`,
          from: doc.id,
          to: rel.to,
          type: rel.type || 'related',
          weight: Number(rel.weight) || 1,
          label: rel.label,
          dangling: true,
        });
        continue;
      }

      const edge = {
        id: `e:${doc.id}:${rel.to}:${rel.type || 'related'}:${edgeSeq++}`,
        from: doc.id,
        to: rel.to,
        type: rel.type || 'related',
        weight: Number.isFinite(Number(rel.weight)) ? Number(rel.weight) : 1,
        label: rel.label,
      };
      edges.push(edge);
      out.get(doc.id).push(edge);
      inMap.get(rel.to).push(edge);
    }
  }

  const graph = {
    nodes,
    edges,
    danglingEdges: dangling,
    out,
    in: inMap,
    generatedAt: new Date().toISOString(),
    version: 1,
  };

  _graph = graph;
  return graph;
}

/**
 * Lazy-build graph from the modular knowledge layer.
 * @param {{ force?: boolean, categories?: string[] }} [opts]
 * @returns {Promise<KnowledgeGraph>}
 */
export async function ensureKnowledgeGraph(opts = {}) {
  if (_graph && !opts.force) return _graph;
  if (_buildPromise && !opts.force) return _buildPromise;

  _buildPromise = (async () => {
    const { loadAll, loadCategory, bootstrapKnowledgeSources } = await import('./knowledgeLoader.js');
    await bootstrapKnowledgeSources();
    let docs;
    if (opts.categories?.length) {
      const batches = await Promise.all(opts.categories.map((c) => loadCategory(c)));
      docs = batches.flat();
    } else {
      docs = await loadAll();
    }
    return buildKnowledgeGraph(docs);
  })();

  try {
    return await _buildPromise;
  } finally {
    _buildPromise = null;
  }
}

/** @returns {KnowledgeGraph|null} */
export function getGraph() {
  return _graph;
}

export function resetKnowledgeGraph() {
  _graph = null;
  _buildPromise = null;
}

/**
 * Outgoing related documents (as declared on the source doc).
 *
 * @param {string} id
 * @param {{ graph?: KnowledgeGraph, type?: string|string[], limit?: number }} [opts]
 * @returns {Array<{ id: string, node: GraphNode, edge: GraphEdge, direction: 'out' }>}
 */
export function getRelated(id, opts = {}) {
  const graph = requireGraph(opts.graph);
  const nodeId = resolveId(graph, id);
  if (!nodeId) return [];

  let edges = graph.out.get(nodeId) || [];
  if (opts.type) {
    const types = new Set(Array.isArray(opts.type) ? opts.type : [opts.type]);
    edges = edges.filter((e) => types.has(e.type));
  }

  const hits = edges.map((edge) => ({
    id: edge.to,
    node: graph.nodes.get(edge.to),
    edge,
    direction: /** @type {'out'} */ ('out'),
  })).filter((h) => h.node);

  hits.sort((a, b) => (b.edge.weight || 0) - (a.edge.weight || 0));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

/**
 * Undirected neighbors (incoming + outgoing).
 *
 * @param {string} id
 * @param {{ graph?: KnowledgeGraph, type?: string|string[], limit?: number }} [opts]
 * @returns {Array<{ id: string, node: GraphNode, edge: GraphEdge, direction: 'in'|'out' }>}
 */
export function getNeighbors(id, opts = {}) {
  const graph = requireGraph(opts.graph);
  const nodeId = resolveId(graph, id);
  if (!nodeId) return [];

  const typeFilter = opts.type
    ? new Set(Array.isArray(opts.type) ? opts.type : [opts.type])
    : null;

  /** @type {Map<string, { id: string, node: GraphNode, edge: GraphEdge, direction: 'in'|'out' }>} */
  const best = new Map();

  const consider = (edge, direction, otherId) => {
    if (typeFilter && !typeFilter.has(edge.type)) return;
    const node = graph.nodes.get(otherId);
    if (!node) return;
    const prev = best.get(otherId);
    if (!prev || (edge.weight || 0) > (prev.edge.weight || 0)) {
      best.set(otherId, { id: otherId, node, edge, direction });
    }
  };

  for (const edge of graph.out.get(nodeId) || []) consider(edge, 'out', edge.to);
  for (const edge of graph.in.get(nodeId) || []) consider(edge, 'in', edge.from);

  const hits = [...best.values()].sort((a, b) => (b.edge.weight || 0) - (a.edge.weight || 0));
  return opts.limit ? hits.slice(0, opts.limit) : hits;
}

/**
 * Expand a multi-hop context subgraph around a document.
 * Primary retrieval-backbone helper.
 *
 * @param {string} id
 * @param {{
 *   graph?: KnowledgeGraph,
 *   maxDepth?: number,
 *   limit?: number,
 *   directed?: boolean,
 *   types?: string[]
 * }} [opts]
 */
export function expandContext(id, opts = {}) {
  const graph = requireGraph(opts.graph);
  const root = resolveId(graph, id);
  if (!root) {
    return {
      root: String(id || ''),
      depth: 0,
      nodes: [],
      edges: [],
      documents: [],
      order: [],
      hops: {},
    };
  }

  const maxDepth = Math.max(0, Math.min(6, opts.maxDepth ?? 2));
  const limit = Math.max(1, opts.limit ?? 24);
  const directed = opts.directed === true;
  const typeSet = opts.types ? new Set(opts.types) : null;

  /** @type {Map<string, number>} */
  const hops = new Map([[root, 0]]);
  /** @type {GraphEdge[]} */
  const keptEdges = [];
  /** @type {string[]} */
  const order = [root];

  let frontier = [root];
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const next = [];
    for (const current of frontier) {
      const candidates = directed
        ? (graph.out.get(current) || []).map((e) => ({ edge: e, other: e.to }))
        : [
          ...(graph.out.get(current) || []).map((e) => ({ edge: e, other: e.to })),
          ...(graph.in.get(current) || []).map((e) => ({ edge: e, other: e.from })),
        ];

      for (const { edge, other } of candidates) {
        if (typeSet && !typeSet.has(edge.type)) continue;
        if (!graph.nodes.has(other)) continue;

        if (!hops.has(other)) {
          if (order.length >= limit) continue;
          hops.set(other, depth + 1);
          order.push(other);
          next.push(other);
          keptEdges.push(edge);
        } else if (!keptEdges.some((e) => e.id === edge.id)) {
          keptEdges.push(edge);
        }
      }
    }
    frontier = next;
    if (!frontier.length || order.length >= limit) break;
  }

  const inSet = new Set(order);
  for (const edge of graph.edges) {
    if (inSet.has(edge.from) && inSet.has(edge.to) && !keptEdges.some((e) => e.id === edge.id)) {
      keptEdges.push(edge);
    }
  }

  const nodes = order.map((nid) => graph.nodes.get(nid)).filter(Boolean);
  return {
    root,
    depth: maxDepth,
    nodes,
    edges: keptEdges,
    documents: nodes.map((n) => n.doc),
    order,
    hops: Object.fromEntries(hops),
  };
}

/**
 * BFS shortest path between two document ids (undirected by default).
 *
 * @param {string} a
 * @param {string} b
 * @param {{ graph?: KnowledgeGraph, directed?: boolean, types?: string[] }} [opts]
 * @returns {{ path: string[], nodes: GraphNode[], edges: GraphEdge[], length: number }|null}
 */
export function findShortestPath(a, b, opts = {}) {
  const graph = requireGraph(opts.graph);
  const start = resolveId(graph, a);
  const goal = resolveId(graph, b);
  if (!start || !goal) return null;
  if (start === goal) {
    const node = graph.nodes.get(start);
    return {
      path: [start],
      nodes: node ? [node] : [],
      edges: [],
      length: 0,
    };
  }

  const directed = opts.directed === true;
  const typeSet = opts.types ? new Set(opts.types) : null;

  /** @type {Map<string, { prev: string|null, via: GraphEdge|null }>} */
  const came = new Map([[start, { prev: null, via: null }]]);
  const queue = [start];

  while (queue.length) {
    const current = queue.shift();
    const candidates = directed
      ? (graph.out.get(current) || []).map((e) => ({ edge: e, other: e.to }))
      : [
        ...(graph.out.get(current) || []).map((e) => ({ edge: e, other: e.to })),
        ...(graph.in.get(current) || []).map((e) => ({ edge: e, other: e.from })),
      ];

    for (const { edge, other } of candidates) {
      if (typeSet && !typeSet.has(edge.type)) continue;
      if (!graph.nodes.has(other) || came.has(other)) continue;
      came.set(other, { prev: current, via: edge });
      if (other === goal) {
        return reconstructPath(graph, came, start, goal);
      }
      queue.push(other);
    }
  }

  return null;
}

/**
 * @param {KnowledgeGraph} [graph]
 */
export function graphStats(graph = _graph) {
  if (!graph) return { ready: false };
  const byCategory = {};
  for (const n of graph.nodes.values()) {
    byCategory[n.category] = (byCategory[n.category] || 0) + 1;
  }
  const byEdgeType = {};
  for (const e of graph.edges) {
    byEdgeType[e.type] = (byEdgeType[e.type] || 0) + 1;
  }
  return {
    ready: true,
    nodeCount: graph.nodes.size,
    edgeCount: graph.edges.length,
    danglingCount: graph.danglingEdges?.length || 0,
    byCategory,
    byEdgeType,
    generatedAt: graph.generatedAt,
  };
}

/**
 * Resolve human labels / aliases to document ids when possible.
 * @param {KnowledgeGraph} graph
 * @param {string} idOrLabel
 */
export function resolveId(graph, idOrLabel) {
  if (!idOrLabel) return null;
  const raw = String(idOrLabel);
  if (graph.nodes.has(raw)) return raw;

  const lower = raw.toLowerCase();
  for (const n of graph.nodes.values()) {
    if (n.label.toLowerCase() === lower) return n.id;
    if (n.id.toLowerCase() === lower) return n.id;
  }
  for (const n of graph.nodes.values()) {
    if (n.label.toLowerCase().includes(lower) || lower.includes(n.label.toLowerCase())) {
      return n.id;
    }
  }
  return null;
}

/**
 * Read relationship declarations from a document envelope.
 * @param {object} doc
 */
export function readDocumentRelationships(doc) {
  const edges = [];
  const add = (to, type, weight, label) => {
    if (!to) return;
    edges.push({
      to: String(to),
      type: type || 'related',
      weight: weight ?? 1,
      label,
    });
  };

  if (Array.isArray(doc.relationships)) {
    for (const r of doc.relationships) {
      if (typeof r === 'string') add(r, 'related');
      else if (r && typeof r === 'object') {
        add(r.to || r.id || r.target, r.type, r.weight, r.label);
      }
    }
  }

  for (const field of ['related', 'links']) {
    const list = doc[field];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string') add(item, field);
      else if (item && typeof item === 'object') {
        add(item.to || item.id || item.target, item.type || field, item.weight, item.label);
      }
    }
  }

  for (const list of [doc.metadata?.relatedIds, doc.content?.relatedIds]) {
    if (!Array.isArray(list)) continue;
    for (const id of list) add(id, 'relatedIds');
  }

  return edges;
}

function reconstructPath(graph, came, start, goal) {
  const path = [];
  const edges = [];
  let cur = goal;
  while (cur) {
    path.push(cur);
    const step = came.get(cur);
    if (step?.via) edges.push(step.via);
    cur = step?.prev ?? null;
    if (cur === start) {
      path.push(start);
      break;
    }
  }
  path.reverse();
  edges.reverse();
  return {
    path,
    nodes: path.map((id) => graph.nodes.get(id)).filter(Boolean),
    edges,
    length: edges.length,
  };
}

function requireGraph(graph) {
  const g = graph || _graph;
  if (!g) {
    throw new Error('[knowledgeGraph] graph not built — call buildKnowledgeGraph() or ensureKnowledgeGraph() first');
  }
  return g;
}

export default {
  buildKnowledgeGraph,
  ensureKnowledgeGraph,
  getGraph,
  resetKnowledgeGraph,
  getRelated,
  getNeighbors,
  expandContext,
  findShortestPath,
  graphStats,
  resolveId,
  readDocumentRelationships,
};
