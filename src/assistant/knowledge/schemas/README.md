# Shared knowledge schemas

Base JSON Schemas shared by all domain packs.

| File | Role |
|---|---|
| `document.schema.json` | Universal document envelope |
| `embedding.schema.json` | Future embedding hook shape |
| `sample.json` | Envelope example |
| `loader.js` | Registers schema pack (optional tooling source) |
| `validator.js` | Re-exports envelope validation helpers |

Domain packs extend this envelope with a typed `content` object.
