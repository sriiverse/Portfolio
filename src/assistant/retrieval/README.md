# Semantic Retrieval Layer

Multi-channel retrieval that prepares a **context package** for a downstream assistant. **No LLM. No embeddings yet.**

Not wired into `assistant.js` / `providers.js`.

## Pipeline

```
Question
  → Intent Detection
  → Keyword Search  (+ Tag Search)  [+ Vector stub]
  → Relationship Expansion
  → Ranking
  → Context Package
  → Assistant   ← consumer only (not invoked here)
```

## Modules

| File | Role |
|------|------|
| `interfaces.js` | Shared `RetrievalQuery` / `SearchHit` / `SearchChannel` contracts |
| `keywordSearch.js` | Lexical SearchChannel |
| `tagSearch.js` | Tag-only SearchChannel |
| `relationshipSearch.js` | Expand seeds via explicit edges, shared tags, soft keys, id family |
| `ranking.js` | Multi-channel fusion (+ future embeddingScores) |
| `vectorSearch.js` | **Stub** — same API, returns `[]` until an index is attached |
| `pipeline.js` | Orchestrator → context package |
| `corpus.js` | Default corpus loader (knowledge layer) |

## SearchChannel contract

Every channel implements:

```js
{
  id: 'keyword' | 'tag' | 'relationship' | 'vector',
  search(query: RetrievalQuery, corpus: object[], opts?): SearchHit[] | Promise<SearchHit[]>
}
```

`SearchHit` shape (stable):

```js
{ doc, score, channel, sourceId, reasons, meta }
```

Adding vector / BM25 / hybrid later means implementing this interface — callers keep using `retrieve()`.

## Usage

```js
import { retrieve } from './pipeline.js';

const pack = await retrieve('Walk me through the architecture in detail');
// pack.intent
// pack.retrievedKnowledge   // ranked hits
// pack.context.documents
// pack.context.citations
// pack.context.expansion    // relationship trace
// pack.confidence
```

Inject corpus, intent, or future vector scores without changing the API:

```js
await retrieve(question, {
  detectIntent: (q) => ({ id: 'architecture', confidence: 0.9 }),
  loadCorpus: async () => myDocs,
  embeddingScores: { 'engineering.five-layer.v1': 0.88 }, // optional hybrid
  enableVector: true,
  limit: 6,
});
```

## Future vector search

1. Fill `doc.embedding.vector` via an indexer (knowledge layer hook already exists).
2. Pass `queryVector` + `indexSearch` into `retrieve()` / `vectorSearch()`, **or**
3. Replace `vectorSearch` body while keeping the SearchChannel signature.

`ranking.js` already accepts `embeddingScores` and a reserved `vector` channel weight.

## Relationship edges

Preferred (optional on documents):

```json
{
  "relationships": [
    { "to": "engineering.five-layer.v1", "type": "implements", "weight": 1.4 }
  ]
}
```

Also accepted: `related`, `links`, `metadata.relatedIds`, `content.relatedIds`.  
Without explicit edges, expansion uses shared tags, shared soft keys (`projectId`, `topic`, …), and id-family prefixes.

## Constraints

- Pure JS, zero deps
- No hardcoded project winners
- No embedding computation in this layer
- Assistant is a consumer of the context package, not part of this module
