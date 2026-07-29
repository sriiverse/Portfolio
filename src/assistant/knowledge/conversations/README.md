# Conversations knowledge

Reusable conversational snippets, intros, and answer seeds — not live session transcripts.

## Layout

| File | Role |
|---|---|
| `conversations.schema.json` | JSON Schema for documents in this category |
| `sample.json` | Canonical sample document(s) |
| `loader.js` | Registers a lazy source with the knowledge registry |
| `validator.js` | Domain validation helpers |

## Document envelope

Every document includes `id`, `version`, `tags`, `category`, `metadata`, and `content`.  
Optional `embedding` is reserved for future vector indexing.

## Category

`conversations`

## Extending

1. Add documents to `sample.json` (array) or introduce additional JSON files and teach `loader.js` to import them.
2. Keep `category: "conversations"`.
3. Bump `version` when meaning changes.
4. Do not import assistant runtime modules from here — keep this pack independent.
