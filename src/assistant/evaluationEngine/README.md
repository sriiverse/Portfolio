# Evaluation Engine

Rule-based scoring for generated assistant answers. **No LLM.** Built for regression testing.

## Output

```js
{
  score,        // 0–10 weighted overall
  breakdown,    // { naturalness: 8.2, technicalAccuracy: 7.5, ... }
  suggestions   // actionable fix hints
}
```

## Metrics

| Id | What it checks |
|----|----------------|
| `naturalness` | Spoken prose vs brochure / impl leaks / fluff |
| `technicalAccuracy` | Absent-tech claims, context grounding |
| `confidence` | Calibrated certainty vs over/under-hedging |
| `humility` | Gap honesty, ego fluff |
| `storytelling` | Narrative beats when the ask needs them |
| `conciseness` | Length vs intent/mode budget |
| `voiceConsistency` | First-person / portfolio voice, no RAG leaks |
| `engineeringReasoning` | Because / constraint / systems language |
| `tradeoffQuality` | Alternatives, costs, vs-pairs |
| `projectConsistency` | Known projects only; stack attribution |

## Usage

```js
import { evaluateAnswer, passesGate, evaluateFixtures } from './evaluationEngine.js';

const report = evaluateAnswer({
  answer: 'Start with QueryForgeAI — it shows schema-aware SQL reasoning…',
  question: 'Which project should I look at first?',
  intent: { id: 'recommend' },
  mode: 'spoken',
});

// { score, breakdown, suggestions }

passesGate(report, { minScore: 6.5, minMetric: 4 });
```

String form:

```js
evaluateAnswer(answerText, { question, intent, mode, persona });
```

## Regression fixtures

```js
evaluateFixtures([
  { id: 'rec-1', answer: '…', question: '…', intent: { id: 'recommend' } },
]);
```

## Design notes

- Pure JS, zero dependencies
- Metrics are modular under `metrics/`
- Optional context: `knownProjects`, `knownTech`, `absentTech`, `retrievedKnowledge`
- Not wired into the live assistant response path unless you call it from tests
