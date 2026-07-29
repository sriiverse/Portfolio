# Memory Engine

In-memory conversation memory for SRIIVERSE AI. **No persistence. No LLM.**

Separate from `src/assistant/memory.js` (which uses sessionStorage). This module is session-scoped RAM only.

## Remembers

| Field | Meaning |
|-------|---------|
| `topic` | Current conversation topic |
| `projectsDiscussed` | Project ids mentioned |
| `previousQuestions` | Prior user questions |
| `conversationDepth` | How deep the thread has gone |
| `userInterests` | Inferred interest tags |
| `conversationStage` | `opening` → `exploring` → `deepening` / `comparing` → `closing` |

## API

```js
import {
  createMemoryEngine,
  remember,
  recall,
  forget,
  summarize,
} from './memoryEngine.js';

// Isolated session (preferred for tests)
const mem = createMemoryEngine();

mem.remember({
  question: 'Walk me through QueryForge architecture',
  role: 'user',
  text: 'Walk me through QueryForge architecture',
  intent: 'walkthrough',
});

mem.recall('topic');                 // e.g. "architecture" or "project:queryforge"
mem.recall('projects');              // ['queryforge']
mem.recall(['depth', 'stage', 'interests']);
mem.recall();                        // full snapshot

mem.summarize();                     // text blurb
mem.summarize({ format: 'object' });

mem.forget('questions');             // clear one field
mem.forget('queryforge');            // drop one project
mem.forget();                        // reset all
```

Module-level helpers (`remember` / `recall` / `forget` / `summarize`) use a shared default in-memory session.

## `remember()` input

```js
remember({
  topic,              // explicit topic
  project / projects, // string | string[]
  question,           // stored in previousQuestions
  interest / interests,
  stage,              // opening | exploring | deepening | comparing | closing
  depthDelta,         // default +1 on user turns
  role, text,         // optional turn log
  intent,
  slot / slots,       // free-form key/values
  meta,
})

remember('free text user message') // auto-extracts topic/projects/interests
```

## Design notes

- Pure JS, zero dependencies
- Not wired into the live assistant unless you call it
- Safe to reset between regression fixtures via `forget()` / `createMemoryEngine()`
