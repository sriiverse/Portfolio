# SRIIVERSE AI — Modular Knowledge Layer

Infrastructure only. **Not wired** into `assistant.js` / `providers.js` / the existing `knowledge.js` retriever.

## Goals

- Independent knowledge packs per domain
- Load, search, version, and extend each pack without coupling
- Lazy loading today; embeddings + vector search hooks for tomorrow
- Pure JavaScript, zero external dependencies

## Layout

```
knowledge/
  knowledgeLoader.js      Lazy load + keyword search (+ vector stub)
  knowledgeRegistry.js    Source catalog
  knowledgeValidator.js   Pure-JS JSON Schema subset validator
  knowledgeGraph.js       Document relationship graph (retrieval backbone)
  schemas/                Shared envelope + embedding schemas
  identity/
  resume/
  projects/
  engineering/
  behavioral/
  failures/
  opinions/
  conversations/
  evaluation/
```

Each domain folder contains:

| Artifact | Purpose |
|---|---|
| `README.md` | Domain purpose and extension notes |
| `*.schema.json` | JSON Schema for documents |
| `sample.json` | Sample data |
| `loader.js` | Registers a lazy source |
| `validator.js` | Domain validation |

## Document envelope

```json
{
  "id": "projects.queryforge.overview.v1",
  "version": "1.0.0",
  "tags": ["queryforge", "sql"],
  "category": "projects",
  "metadata": { "author": "sriiverse", "confidence": "documented", "graphLabel": "QueryForge" },
  "content": { },
  "relationships": [
    { "to": "engineering.five-layer.v1", "type": "applies_principle", "weight": 1.4 }
  ],
  "embedding": {
    "status": "none",
    "model": null,
    "dims": null,
    "vector": null,
    "updatedAt": null
  }
}
```

## Knowledge graph

Every document should declare `relationships` to related docs. Build and traverse with:

```js
import {
  ensureKnowledgeGraph,
  getRelated,
  getNeighbors,
  expandContext,
  findShortestPath,
} from './knowledgeGraph.js';

await ensureKnowledgeGraph();
getRelated('projects.queryforge.overview.v1');
expandContext('QueryForge', { maxDepth: 3 });
findShortestPath('QueryForge', 'Behavior Pattern 2');
```

Sample backbone chain:

```
QueryForge → Engineering Principle 12 → Failure Story 3
  → Opinion 5 → Conversation R-021 → Behavior Pattern 2
```

The retrieval layer uses this graph during relationship expansion.

## Usage (standalone)

```js
import {
  bootstrapKnowledgeSources,
  loadCategory,
  searchKnowledge,
} from './knowledgeLoader.js';

await bootstrapKnowledgeSources();
const projects = await loadCategory('projects');
const hits = await searchKnowledge('QueryForge Flask', { categories: ['projects', 'engineering'] });
```

## Future embeddings / vector search

- Every loaded document gets an `embedding` hook (`status: none|pending|ready|stale`).
- Registry sources declare `embedding` and `vector` capability flags.
- `vectorSearchKnowledge(queryVector)` is a reserved stub returning `[]` until an index is attached.

## Independence rule

Domain packs must not import the live assistant orchestrator, providers, or UI.  
The existing `src/assistant/knowledge.js` retriever remains untouched until a deliberate integration pass.
