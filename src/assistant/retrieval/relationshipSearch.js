/**
 * relationshipSearch.js — Graph-style expansion SearchChannel.
 *
 * Expands seed hits into related documents via:
 *   1. Explicit edges on the document (relationships / related / links)
 *   2. Shared tags
 *   3. Shared metadata keys (e.g. projectId) — generic, not project-catalog logic
 *   4. Id-family prefixes (a.b.c → a.b.*)
 *
 * Does not hardcode project winners. Relationship edges are data-driven.
 */

import {
  filterCorpus,
  normalizeHit,
  normalizeTag,
} from './interfaces.js';

/** @type {import('./interfaces.js').SearchChannel} */
export const relationshipSearchChannel = {
  id: 'relationship',
  search: relationshipSearch,
};

/**
 * Expand from seed documents already found by keyword/tag (or ids).
 *
 * @param {import('./interfaces.js').RetrievalQuery} query
 * @param {object[]} corpus
 * @param {{
 *   seeds?: object[],
 *   seedHits?: import('./interfaces.js').SearchHit[],
 *   maxHops?: number,
 *   limit?: number,
 *   minSharedTags?: number
 * }} [opts]
 * @returns {import('./interfaces.js').SearchHit[]}
 */
export function relationshipSearch(query, corpus, opts = {}) {
  const docs = filterCorpus(corpus, query);
  const byId = indexById(docs);
  const seeds = resolveSeeds(opts, byId);
  if (!seeds.length) return [];

  const maxHops = Math.max(1, Math.min(3, opts.maxHops ?? 1));
  const limit = opts.limit ?? query.limit ?? 10;
  const minSharedTags = opts.minSharedTags ?? 1;
  const graph = opts.graph || null;

  /** @type {Map<string, { score: number, reasons: string[], meta: object, doc: object }>} */
  const expanded = new Map();
  const seedIds = new Set(seeds.map((d) => d.id).filter(Boolean));
  /** @type {Array<{ from: string, to: string, type: string, weight: number }>} */
  const edges = [];

  let frontier = seeds.map((d) => ({ doc: d, hop: 0, pathScore: 1 }));

  while (frontier.length) {
    const next = [];
    for (const { doc: seed, hop, pathScore } of frontier) {
      if (hop >= maxHops) continue;
      const neighbors = findNeighbors(seed, docs, byId, {
        minSharedTags,
        graph,
      });

      for (const n of neighbors) {
        if (!n.doc?.id || seedIds.has(n.doc.id)) continue;
        // Allow expanding into previously expanded nodes across hops,
        // but skip re-adding exact seed roots.
        edges.push({
          from: seed.id,
          to: n.doc.id,
          type: n.type,
          weight: n.weight,
        });

        const score = round2(pathScore * n.weight * decay(hop));
        const prev = expanded.get(n.doc.id);
        if (!prev || score > prev.score) {
          expanded.set(n.doc.id, {
            doc: n.doc,
            score,
            reasons: [`rel:${n.type}:from:${seed.id}`],
            meta: { hop: hop + 1, via: seed.id, edgeType: n.type },
          });
        }

        if (hop + 1 < maxHops) {
          next.push({ doc: n.doc, hop: hop + 1, pathScore: score });
        }
      }
    }
    frontier = next;
  }

  const hits = [...expanded.values()]
    .map((e) => normalizeHit({
      doc: e.doc,
      score: e.score,
      channel: 'relationship',
      reasons: e.reasons,
      meta: { ...e.meta, edgeCount: edges.filter((x) => x.to === e.doc.id).length },
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  for (const hit of hits) {
    hit.meta = {
      ...hit.meta,
      expansionEdges: edges.filter((e) => e.to === hit.doc.id).slice(0, 6),
    };
  }

  if (opts && typeof opts === 'object' && opts._trace) {
    opts._trace.seedIds = [...seedIds];
    opts._trace.addedIds = hits.map((h) => h.doc.id);
    opts._trace.edges = edges;
  }

  return hits;
}

/**
 * Pure helper: list related docs for one seed (one hop).
 * @param {object} seed
 * @param {object[]} corpus
 * @param {Map<string, object>} [byId]
 */
export function findNeighbors(seed, corpus, byId = indexById(corpus), opts = {}) {
  const minSharedTags = opts.minSharedTags ?? 1;
  /** @type {Array<{ doc: object, type: string, weight: number }>} */
  const out = [];
  const seen = new Set();

  const push = (doc, type, weight) => {
    if (!doc?.id || doc.id === seed.id || seen.has(doc.id)) return;
    seen.add(doc.id);
    out.push({ doc, type, weight });
  };

  // 0) Knowledge-graph neighbors (preferred backbone when graph is present)
  if (opts.graph) {
    try {
      // Lazy import avoided — callers pass getNeighbors results or graph + helper
      const neighborsFn = opts.getNeighbors;
      if (typeof neighborsFn === 'function') {
        for (const n of neighborsFn(seed.id, { graph: opts.graph })) {
          if (n?.node?.doc) push(n.node.doc, `graph:${n.edge?.type || 'related'}`, n.edge?.weight ?? 1.3);
        }
      } else {
        const adjOut = opts.graph.out?.get(seed.id) || [];
        const adjIn = opts.graph.in?.get(seed.id) || [];
        for (const edge of [...adjOut, ...adjIn]) {
          const otherId = edge.from === seed.id ? edge.to : edge.from;
          const target = byId.get(otherId) || opts.graph.nodes?.get(otherId)?.doc;
          if (target) push(target, `graph:${edge.type || 'related'}`, edge.weight ?? 1.3);
        }
      }
    } catch {
      // fall through to heuristics
    }
  }

  // 1) Explicit relationship fields on the document
  for (const edge of readExplicitEdges(seed)) {
    const target = byId.get(edge.to);
    if (target) push(target, edge.type || 'explicit', edge.weight ?? 1.4);
  }

  // 2) Shared tags
  const seedTags = new Set((seed.tags || []).map(normalizeTag).filter(Boolean));
  if (seedTags.size) {
    for (const doc of corpus) {
      if (!doc?.id || doc.id === seed.id) continue;
      const shared = (doc.tags || []).map(normalizeTag).filter((t) => seedTags.has(t));
      if (shared.length >= minSharedTags) {
        const weight = Math.min(1.6, 0.7 + shared.length * 0.35);
        push(doc, 'shared_tags', weight);
      }
    }
  }

  // 3) Shared soft keys in metadata/content (generic)
  //    Also match soft-key values against other docs' tags (still data-driven).
  const softKeys = ['projectId', 'area', 'topic', 'entityId', 'cluster'];
  for (const key of softKeys) {
    const val = seed.metadata?.[key] ?? seed.content?.[key];
    if (val == null || val === '') continue;
    const needle = String(val).toLowerCase();
    for (const doc of corpus) {
      if (!doc?.id || doc.id === seed.id) continue;
      const other = doc.metadata?.[key] ?? doc.content?.[key];
      if (other != null && String(other).toLowerCase() === needle) {
        push(doc, `shared_${key}`, 1.25);
        continue;
      }
      const otherTags = (doc.tags || []).map(normalizeTag);
      if (otherTags.includes(needle)) {
        push(doc, `softkey_tag:${key}`, 1.1);
      }
    }
  }

  // Inverse: seed tags that match other docs' soft keys
  if (seedTags.size) {
    for (const doc of corpus) {
      if (!doc?.id || doc.id === seed.id) continue;
      for (const key of softKeys) {
        const other = doc.metadata?.[key] ?? doc.content?.[key];
        if (other != null && seedTags.has(String(other).toLowerCase())) {
          push(doc, `tag_softkey:${key}`, 1.1);
        }
      }
    }
  }

  // 4) Id family: category.slug.* siblings
  const family = idFamilyPrefix(seed.id);
  if (family) {
    for (const doc of corpus) {
      if (!doc?.id || doc.id === seed.id) continue;
      if (String(doc.id).startsWith(family)) {
        push(doc, 'id_family', 0.9);
      }
    }
  }

  return out;
}

/**
 * Read explicit edges from common optional shapes (no schema hard requirement).
 * Supports:
 *   doc.relationships: [{ to|id|target, type?, weight? }]
 *   doc.related: string[] | { id }[]
 *   doc.links: same
 *   doc.metadata.relatedIds: string[]
 *   doc.content.relatedIds: string[]
 */
export function readExplicitEdges(doc) {
  const edges = [];
  const add = (to, type, weight) => {
    if (!to) return;
    edges.push({ to: String(to), type: type || 'related', weight: weight ?? 1.4 });
  };

  if (Array.isArray(doc.relationships)) {
    for (const r of doc.relationships) {
      if (typeof r === 'string') add(r, 'related');
      else if (r && typeof r === 'object') add(r.to || r.id || r.target, r.type, r.weight);
    }
  }

  for (const field of ['related', 'links']) {
    const list = doc[field];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (typeof item === 'string') add(item, field);
      else if (item && typeof item === 'object') add(item.to || item.id || item.target, item.type || field, item.weight);
    }
  }

  for (const list of [doc.metadata?.relatedIds, doc.content?.relatedIds]) {
    if (!Array.isArray(list)) continue;
    for (const id of list) add(id, 'relatedIds');
  }

  return edges;
}

function resolveSeeds(opts, byId) {
  if (Array.isArray(opts.seeds) && opts.seeds.length) return opts.seeds.filter((d) => d?.id);
  if (Array.isArray(opts.seedHits) && opts.seedHits.length) {
    return opts.seedHits.map((h) => h.doc).filter((d) => d?.id);
  }
  if (Array.isArray(opts.seedIds)) {
    return opts.seedIds.map((id) => byId.get(id)).filter(Boolean);
  }
  return [];
}

function indexById(docs) {
  const map = new Map();
  for (const d of docs || []) {
    if (d?.id) map.set(d.id, d);
  }
  return map;
}

function idFamilyPrefix(id) {
  const parts = String(id || '').split('.');
  if (parts.length < 3) return null;
  // keep category.slug.  (drop leaf + version-ish tail)
  return `${parts[0]}.${parts[1]}.`;
}

function decay(hop) {
  return hop === 0 ? 1 : hop === 1 ? 0.75 : 0.5;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default relationshipSearchChannel;
