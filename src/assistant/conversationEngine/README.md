# Conversation Engine

Context-preparation pipeline for the assistant. **Does not call an LLM.**

It detects conversational signals, plans knowledge retrieval, ranks documents, and returns a context package a later answer layer can consume.

## Output shape

```js
{
  intent,                 // { id, label, confidence, scores, signals }
  persona,                // { id, label, confidence, scores, signals }
  emotion,                // { id, label, confidence, scores, signals }
  retrievedKnowledge,     // ranked compact hits (+ full document)
  conversationStrategy,   // mode, answerShape, tone, followUpStyle, …
  confidence,             // blended package confidence 0–1
  meta                    // retrievalPlan, preparedAt, engine id
}
```

## Modules

| File | Role |
|------|------|
| `intentDetector.js` | Rule-based intent (no project IDs) |
| `personaDetector.js` | Recruiter / engineer / founder / student / curious |
| `emotionDetector.js` | Skeptical / frustrated / enthusiastic / curious / formal / neutral |
| `retrievalPlanner.js` | Intent → knowledge **categories** + query tokens |
| `knowledgeRanker.js` | Lexical / tag / category ranking (+ embedding hook) |
| `strategyBuilder.js` | Spoken vs docs mode, tone, answer shape |
| `conversationEngine.js` | Orchestrator (`prepareContext`) |

## Usage

```js
import { prepareContext } from './conversationEngine.js';

const pack = await prepareContext('Walk me through your strongest architecture work');
// pack.intent.id === 'walkthrough' | 'architecture' …
// pack.retrievedKnowledge → ranked docs from knowledge/
```

Optional prior persona and injectable knowledge adapter:

```js
await prepareContext(message, {
  priorPersona: 'recruiter',
  limit: 5,
  knowledge: {
    bootstrap: async () => {},
    loadCategory: async (category) => docs,
    search: async (query, opts) => hits,
  },
});
```

## Constraints

- No LLM / no answer generation
- No hardcoded project winners — only category + token retrieval
- Not wired into `assistant.js` / providers until an integration step
- Depends on `../knowledge/knowledgeLoader.js` by default (swappable)

## Pipeline

```
message
  → detectIntent / detectPersona / detectEmotion
  → buildRetrievalPlan (categories, tokens, boostTags)
  → loadCategory + searchKnowledge
  → rankKnowledgeDocuments
  → buildConversationStrategy
  → { intent, persona, emotion, retrievedKnowledge, conversationStrategy, confidence }
```
