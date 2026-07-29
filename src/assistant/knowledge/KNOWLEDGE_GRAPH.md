# Knowledge Graph

Pure-JS directed property graph over modular knowledge documents.

## Backbone chain (sample)

```
QueryForge
  → Engineering Principle 12
    → Failure Story 3
      → Opinion 5
        → Conversation R-021
          → Behavior Pattern 2
```

Document ids:

| Label | Id |
|-------|-----|
| QueryForge | `projects.queryforge.overview.v1` |
| Engineering Principle 12 | `engineering.five-layer.v1` |
| Failure Story 3 | `failures.ai-layer.v1` |
| Opinion 5 | `opinions.microservices.v1` |
| Conversation R-021 | `conversations.self-intro.v1` |
| Behavior Pattern 2 | `behavioral.disagreement.v1` |

## API

```js
import {
  buildKnowledgeGraph,
  ensureKnowledgeGraph,
  getRelated,
  getNeighbors,
  expandContext,
  findShortestPath,
  graphStats,
} from './knowledgeGraph.js';

await ensureKnowledgeGraph();

getRelated(id)          // outgoing declared edges
getNeighbors(id)        // undirected adjacency
expandContext(id, { maxDepth: 3 })
findShortestPath(a, b)  // BFS; accepts ids or graphLabels
```

## Edge shape on documents

```json
"relationships": [
  { "to": "engineering.five-layer.v1", "type": "applies_principle", "weight": 1.4, "label": "…" }
]
```

No external libraries. Becomes the relationship-expansion backbone for `src/assistant/retrieval/`.
