/**
 * One-shot generator for knowledge domain packages.
 * Run: node src/assistant/knowledge/_generate_domains.mjs
 * Safe to re-run; overwrites domain scaffolding files.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));

const DOMAINS = [
  {
    id: 'identity',
    title: 'Identity',
    description: 'Who Sudhanshu is — title, positioning, strengths, and self-model facts suitable for introductions.',
    sample: {
      id: 'identity.core.v1',
      version: '1.0.0',
      category: 'identity',
      tags: ['intro', 'profile', 'positioning'],
      metadata: { author: 'sriiverse', confidence: 'documented', source: 'portfolio-profile' },
      content: {
        name: 'Sudhanshu Sinha',
        title: 'Python Backend Engineer · AI Developer · Full-Stack Engineer',
        tagline: 'Building Intelligent Software That Solves Real Problems.',
        summary: 'Backend-leaning engineer who ships production AI systems end to end.',
        strengths: ['Python services', 'REST APIs', 'Applied AI grounded in real data'],
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['name', 'title', 'summary'],
        properties: {
          name: { type: 'string', minLength: 1 },
          title: { type: 'string', minLength: 1 },
          tagline: { type: 'string' },
          summary: { type: 'string', minLength: 1 },
          strengths: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    id: 'resume',
    title: 'Resume',
    description: 'Chronology, roles, education signals, and resume-shaped talking points — not a PDF binary.',
    sample: {
      id: 'resume.journey.v1',
      version: '1.0.0',
      category: 'resume',
      tags: ['journey', 'timeline', 'background'],
      metadata: { author: 'sriiverse', confidence: 'documented', source: 'portfolio-journey' },
      content: {
        entries: [
          { label: 'Origin', detail: 'First commit — curiosity about how software works under the interface.' },
          { label: 'Language', detail: 'Adopted Python as the primary language.' },
          { label: 'Ship', detail: 'Three live AI products in production.' },
        ],
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['entries'],
        properties: {
          entries: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['label', 'detail'],
              properties: {
                label: { type: 'string' },
                detail: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  {
    id: 'projects',
    title: 'Projects',
    description: 'Shipped project facts: problem, solution, stack, decisions, live URLs — one document per project or facet.',
    sample: {
      id: 'projects.queryforge.overview.v1',
      version: '1.0.0',
      category: 'projects',
      tags: ['queryforge', 'sql', 'ai', 'flask'],
      metadata: { author: 'sriiverse', confidence: 'documented', projectId: 'queryforge' },
      content: {
        projectId: 'queryforge',
        name: 'QueryForgeAI',
        tagline: 'Optimize database queries at the speed of thought.',
        problem: 'Writing efficient SQL is hard without tooling that explains plans.',
        solution: 'Natural language to SQL with schema-aware reasoning and explanations.',
        stack: ['Python', 'Flask', 'PostgreSQL', 'React'],
        live: 'https://example.com/queryforge',
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['projectId', 'name'],
        properties: {
          projectId: { type: 'string', minLength: 1 },
          name: { type: 'string', minLength: 1 },
          tagline: { type: 'string' },
          problem: { type: 'string' },
          solution: { type: 'string' },
          stack: { type: 'array', items: { type: 'string' } },
          live: { type: 'string' },
          repo: { type: 'string' },
          decisions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    id: 'engineering',
    title: 'Engineering',
    description: 'Architecture topology, stack rationale, trade-offs, and system-design notes shared across projects.',
    sample: {
      id: 'engineering.five-layer.v1',
      version: '1.0.0',
      category: 'engineering',
      tags: ['architecture', 'five-layer', 'trade-offs'],
      metadata: { author: 'sriiverse', confidence: 'documented' },
      content: {
        topic: 'five-layer-architecture',
        summary: 'Frontend → Backend → AI reasoning → Data → Deploy, with AI grounded in real inputs.',
        layers: ['Frontend', 'Backend', 'AI', 'Data', 'Deploy'],
        tradeoffs: ['More moving parts than a monolith', 'Clear ownership of correctness vs generation'],
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['topic', 'summary'],
        properties: {
          topic: { type: 'string' },
          summary: { type: 'string' },
          layers: { type: 'array', items: { type: 'string' } },
          tradeoffs: { type: 'array', items: { type: 'string' } },
          decisions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    id: 'behavioral',
    title: 'Behavioral',
    description: 'Soft-skill and leadership narratives grounded in shipped work (disagreement, review, ownership).',
    sample: {
      id: 'behavioral.disagreement.v1',
      version: '1.0.0',
      category: 'behavioral',
      tags: ['soft-skills', 'disagreement', 'ownership'],
      metadata: { author: 'sriiverse', confidence: 'inferred' },
      content: {
        situation: 'Stack or product-direction disagreement',
        approach: 'Separate taste from constraints — latency, correctness, and ship window.',
        evidence: 'Flask vs FastAPI chosen by I/O shape; grounded AI over flashy generation.',
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['situation', 'approach'],
        properties: {
          situation: { type: 'string' },
          approach: { type: 'string' },
          evidence: { type: 'string' },
          outcome: { type: 'string' },
        },
      },
    },
  },
  {
    id: 'failures',
    title: 'Failures',
    description: 'Honest failure modes, regrets, and production risk classes — never invented outages.',
    sample: {
      id: 'failures.ai-layer.v1',
      version: '1.0.0',
      category: 'failures',
      tags: ['ai', 'queryforge', 'risk'],
      metadata: { author: 'sriiverse', confidence: 'inferred' },
      content: {
        area: 'AI layer',
        modes: ['Schema drift breaking NL→SQL', 'Overconfident rewrites', 'Cold-start LLM latency'],
        mitigation: 'Treat the model as a reasoning layer over real schema; surface explanations.',
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['area', 'modes'],
        properties: {
          area: { type: 'string' },
          modes: { type: 'array', minItems: 1, items: { type: 'string' } },
          mitigation: { type: 'string' },
          regret: { type: 'string' },
        },
      },
    },
  },
  {
    id: 'opinions',
    title: 'Opinions',
    description: 'Scoped engineering takes (microservices, TypeScript, retrieval patterns) tied to experience level.',
    sample: {
      id: 'opinions.microservices.v1',
      version: '1.0.0',
      category: 'opinions',
      tags: ['microservices', 'architecture', 'opinion'],
      metadata: { author: 'sriiverse', confidence: 'inferred' },
      content: {
        topic: 'microservices',
        stance: 'Useful when deploy/scale ownership diverges; overrated as default fashion.',
        experienceScope: 'Modular monolith across three shipped AI products; no microservice mesh shipped.',
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['topic', 'stance'],
        properties: {
          topic: { type: 'string' },
          stance: { type: 'string' },
          experienceScope: { type: 'string' },
          alternatives: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  {
    id: 'conversations',
    title: 'Conversations',
    description: 'Reusable conversational snippets, intros, and answer seeds — not live session transcripts.',
    sample: {
      id: 'conversations.self-intro.v1',
      version: '1.0.0',
      category: 'conversations',
      tags: ['intro', 'opening'],
      metadata: { author: 'sriiverse', confidence: 'documented' },
      content: {
        intent: 'self_intro',
        beats: [
          'Name and title',
          'Three live AI products',
          'Backend + applied AI center of gravity',
          'Offer demo or architecture deep-dive',
        ],
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['intent', 'beats'],
        properties: {
          intent: { type: 'string' },
          beats: { type: 'array', minItems: 1, items: { type: 'string' } },
          sampleUtterance: { type: 'string' },
        },
      },
    },
  },
  {
    id: 'evaluation',
    title: 'Evaluation',
    description: 'Gold prompts, expected behaviors, and regression fixtures for quality audits.',
    sample: {
      id: 'evaluation.prompt.which-project-first.v1',
      version: '1.0.0',
      category: 'evaluation',
      tags: ['regression', 'recommend', 'conversation-first'],
      metadata: { author: 'sriiverse', suite: 'conversation-quality' },
      content: {
        prompt: 'Which project should I look at first and why?',
        expect: {
          mustNotContain: ['### 🎯', '**Problem:**'],
          mustMatch: ['RepoRadar|QueryForge|Placement'],
          style: 'spoken-recommend',
        },
      },
    },
    extraProps: {
      content: {
        type: 'object',
        required: ['prompt', 'expect'],
        properties: {
          prompt: { type: 'string', minLength: 1 },
          expect: {
            type: 'object',
            properties: {
              mustContain: { type: 'array', items: { type: 'string' } },
              mustNotContain: { type: 'array', items: { type: 'string' } },
              mustMatch: { type: 'array', items: { type: 'string' } },
              style: { type: 'string' },
            },
          },
        },
      },
    },
  },
];

const BASE_REQUIRED = ['id', 'version', 'tags', 'category', 'metadata', 'content'];
const BASE_PROPERTIES = {
  id: { type: 'string', minLength: 1, pattern: '^[a-z0-9][a-z0-9._-]*$' },
  version: { type: 'string', minLength: 1 },
  tags: { type: 'array', items: { type: 'string' }, minItems: 0 },
  category: { type: 'string', minLength: 1 },
  metadata: {
    type: 'object',
    properties: {
      author: { type: 'string' },
      confidence: { type: 'string', enum: ['documented', 'inferred', 'draft'] },
      source: { type: 'string' },
      createdAt: { type: 'string' },
      updatedAt: { type: 'string' },
    },
  },
  embedding: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['none', 'pending', 'ready', 'stale'] },
      model: { type: ['string', 'null'] },
      dims: { type: ['number', 'null'] },
      vector: { type: ['array', 'null'], items: { type: 'number' } },
      updatedAt: { type: ['string', 'null'] },
    },
  },
};

function buildSchema(domain) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: `sriiverse.knowledge.${domain.id}.schema.json`,
    title: `${domain.title}KnowledgeDocument`,
    type: 'object',
    required: BASE_REQUIRED,
    additionalProperties: true,
    properties: {
      ...BASE_PROPERTIES,
      category: { type: 'string', const: domain.id },
      ...domain.extraProps,
    },
  };
}

function readme(domain) {
  return `# ${domain.title} knowledge

${domain.description}

## Layout

| File | Role |
|---|---|
| \`${domain.id}.schema.json\` | JSON Schema for documents in this category |
| \`sample.json\` | Canonical sample document(s) |
| \`loader.js\` | Registers a lazy source with the knowledge registry |
| \`validator.js\` | Domain validation helpers |

## Document envelope

Every document includes \`id\`, \`version\`, \`tags\`, \`category\`, \`metadata\`, and \`content\`.  
Optional \`embedding\` is reserved for future vector indexing.

## Category

\`${domain.id}\`

## Extending

1. Add documents to \`sample.json\` (array) or introduce additional JSON files and teach \`loader.js\` to import them.
2. Keep \`category: "${domain.id}"\`.
3. Bump \`version\` when meaning changes.
4. Do not import assistant runtime modules from here — keep this pack independent.
`;
}

function loaderJs(domain) {
  return `/**
 * ${domain.id}/loader.js — Lazy knowledge source for category "${domain.id}".
 */
import sample from './sample.json' with { type: 'json' };
import schema from './${domain.id}.schema.json' with { type: 'json' };
import { validateDocuments } from './validator.js';

export const SOURCE_ID = '${domain.id}.sample';
export const CATEGORY = '${domain.id}';
export const VERSION = '1.0.0';

function documents() {
  return Array.isArray(sample) ? sample : [sample];
}

/**
 * @param {typeof import('../knowledgeRegistry.js').registerSource} registerSource
 */
export function register(registerSource) {
  registerSource({
    id: SOURCE_ID,
    category: CATEGORY,
    version: VERSION,
    tags: ['sample', '${domain.id}'],
    description: '${domain.title} sample pack',
    schemaPath: './${domain.id}.schema.json',
    meta: { schema },
    embedding: { enabled: true, dims: null, model: null },
    vector: { enabled: false, indexId: null },
    load: () => {
      const docs = documents();
      validateDocuments(docs);
      return docs;
    },
  });
}

export async function load() {
  const docs = documents();
  validateDocuments(docs);
  return docs;
}

export default { register, load, SOURCE_ID, CATEGORY, VERSION };
`;
}

function validatorJs(domain) {
  return `/**
 * ${domain.id}/validator.js — Domain validator for category "${domain.id}".
 */
import schema from './${domain.id}.schema.json' with { type: 'json' };
import {
  validateAgainstSchema,
  validateDocumentEnvelope,
  assertValid,
} from '../knowledgeValidator.js';

export function validateDocument(doc) {
  const envelope = validateDocumentEnvelope(doc);
  if (!envelope.ok) return envelope;
  if (doc.category !== '${domain.id}') {
    return {
      ok: false,
      errors: [{ path: '$.category', message: 'expected category "${domain.id}"' }],
    };
  }
  return validateAgainstSchema(doc, schema);
}

export function validateDocuments(docs) {
  const list = Array.isArray(docs) ? docs : [docs];
  for (const doc of list) {
    const result = validateDocument(doc);
    if (!result.ok) {
      const detail = result.errors.map((e) => \`\${e.path}: \${e.message}\`).join('; ');
      throw new Error(\`[${domain.id}/validator] \${doc?.id || '?'} — \${detail}\`);
    }
  }
  return list;
}

export function assertDocument(doc) {
  assertValid(doc, schema, '${domain.id} document');
  return doc;
}

export { schema };
export default { validateDocument, validateDocuments, assertDocument, schema };
`;
}

// --- schemas/ shared package ---
mkdirSync(join(root, 'schemas'), { recursive: true });

const documentSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'sriiverse.knowledge.document.schema.json',
  title: 'KnowledgeDocument',
  description: 'Universal envelope for every SRIIVERSE knowledge document.',
  type: 'object',
  required: BASE_REQUIRED,
  additionalProperties: true,
  properties: {
    ...BASE_PROPERTIES,
    content: { type: 'object' },
  },
};

writeFileSync(join(root, 'schemas', 'document.schema.json'), JSON.stringify(documentSchema, null, 2));
writeFileSync(
  join(root, 'schemas', 'embedding.schema.json'),
  JSON.stringify({
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'sriiverse.knowledge.embedding.schema.json',
    title: 'KnowledgeEmbeddingHook',
    type: 'object',
    properties: BASE_PROPERTIES.embedding.properties,
  }, null, 2),
);
writeFileSync(
  join(root, 'schemas', 'sample.json'),
  JSON.stringify({
    id: 'schemas.envelope.example.v1',
    version: '1.0.0',
    category: 'schemas',
    tags: ['example'],
    metadata: { author: 'sriiverse', confidence: 'draft' },
    content: { note: 'Example envelope only — not a domain fact.' },
    embedding: { status: 'none', model: null, dims: null, vector: null, updatedAt: null },
  }, null, 2),
);

writeFileSync(
  join(root, 'schemas', 'README.md'),
  `# Shared knowledge schemas

Base JSON Schemas shared by all domain packs.

| File | Role |
|---|---|
| \`document.schema.json\` | Universal document envelope |
| \`embedding.schema.json\` | Future embedding hook shape |
| \`sample.json\` | Envelope example |
| \`loader.js\` | Registers schema pack (optional tooling source) |
| \`validator.js\` | Re-exports envelope validation helpers |

Domain packs extend this envelope with a typed \`content\` object.
`,
);

writeFileSync(
  join(root, 'schemas', 'loader.js'),
  `/**
 * schemas/loader.js — Optional registry entry for shared schema samples.
 */
import sample from './sample.json' with { type: 'json' };
import documentSchema from './document.schema.json' with { type: 'json' };
import { validateDocumentEnvelope, assertValid } from '../knowledgeValidator.js';

export const SOURCE_ID = 'schemas.sample';
export const CATEGORY = 'schemas';
export const VERSION = '1.0.0';

export function register(registerSource) {
  registerSource({
    id: SOURCE_ID,
    category: CATEGORY,
    version: VERSION,
    tags: ['schemas', 'envelope'],
    description: 'Shared schema envelope sample',
    schemaPath: './document.schema.json',
    meta: { schema: documentSchema },
    embedding: { enabled: false, dims: null, model: null },
    vector: { enabled: false, indexId: null },
    load: () => {
      const docs = [sample];
      for (const doc of docs) {
        const r = validateDocumentEnvelope(doc);
        if (!r.ok) throw new Error(r.errors.map((e) => e.message).join('; '));
        assertValid(doc, documentSchema, 'schemas sample');
      }
      return docs;
    },
  });
}

export default { register, SOURCE_ID, CATEGORY, VERSION };
`,
);

writeFileSync(
  join(root, 'schemas', 'validator.js'),
  `/**
 * schemas/validator.js — Shared envelope validators.
 */
export {
  validateAgainstSchema,
  validateDocumentEnvelope,
  assertValid,
} from '../knowledgeValidator.js';

export { default } from '../knowledgeValidator.js';
`,
);

// --- domains ---
for (const domain of DOMAINS) {
  const dir = join(root, domain.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'README.md'), readme(domain));
  writeFileSync(join(dir, `${domain.id}.schema.json`), JSON.stringify(buildSchema(domain), null, 2));
  writeFileSync(join(dir, 'sample.json'), JSON.stringify(domain.sample, null, 2));
  writeFileSync(join(dir, 'loader.js'), loaderJs(domain));
  writeFileSync(join(dir, 'validator.js'), validatorJs(domain));
}

writeFileSync(
  join(root, 'README.md'),
  `# SRIIVERSE AI — Modular Knowledge Layer

Infrastructure only. **Not wired** into \`assistant.js\` / \`providers.js\` / the existing \`knowledge.js\` retriever.

## Goals

- Independent knowledge packs per domain
- Load, search, version, and extend each pack without coupling
- Lazy loading today; embeddings + vector search hooks for tomorrow
- Pure JavaScript, zero external dependencies

## Layout

\`\`\`
knowledge/
  knowledgeLoader.js      Lazy load + keyword search (+ vector stub)
  knowledgeRegistry.js    Source catalog
  knowledgeValidator.js   Pure-JS JSON Schema subset validator
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
\`\`\`

Each domain folder contains:

| Artifact | Purpose |
|---|---|
| \`README.md\` | Domain purpose and extension notes |
| \`*.schema.json\` | JSON Schema for documents |
| \`sample.json\` | Sample data |
| \`loader.js\` | Registers a lazy source |
| \`validator.js\` | Domain validation |

## Document envelope

\`\`\`json
{
  "id": "projects.queryforge.overview.v1",
  "version": "1.0.0",
  "tags": ["queryforge", "sql"],
  "category": "projects",
  "metadata": { "author": "sriiverse", "confidence": "documented" },
  "content": { },
  "embedding": {
    "status": "none",
    "model": null,
    "dims": null,
    "vector": null,
    "updatedAt": null
  }
}
\`\`\`

## Usage (standalone)

\`\`\`js
import {
  bootstrapKnowledgeSources,
  loadCategory,
  searchKnowledge,
} from './knowledgeLoader.js';

await bootstrapKnowledgeSources();
const projects = await loadCategory('projects');
const hits = await searchKnowledge('QueryForge Flask', { categories: ['projects', 'engineering'] });
\`\`\`

## Future embeddings / vector search

- Every loaded document gets an \`embedding\` hook (\`status: none|pending|ready|stale\`).
- Registry sources declare \`embedding\` and \`vector\` capability flags.
- \`vectorSearchKnowledge(queryVector)\` is a reserved stub returning \`[]\` until an index is attached.

## Independence rule

Domain packs must not import the live assistant orchestrator, providers, or UI.  
The existing \`src/assistant/knowledge.js\` retriever remains untouched until a deliberate integration pass.
`,
);

console.log('Generated', DOMAINS.length, 'domains + schemas pack at', root);
