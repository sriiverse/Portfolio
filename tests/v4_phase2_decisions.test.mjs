/**
 * V4 Phase 2 — Decision Records tests
 * Run: node tests/v4_phase2_decisions.test.mjs
 *
 * Graph is the source of truth. Does not modify reasoning/providers.
 */
import {
  getEngineeringGraph,
  resetEngineeringGraph,
  getNodesByType,
  validateEngineeringGraph,
} from '../src/assistant/graph.js';
import {
  buildDecisionRecords,
  getDecisionRecords,
  resetDecisionRecordsCache,
  getDecisionsForProject,
  getDecisionsForTechnology,
  getDecisionRecordById,
  validateDecisionRecords,
} from '../src/assistant/decisions.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: String(err.message || err) });
    console.log(`FAIL  ${name}`);
    console.log(`      ${err.message || err}`);
  }
}

resetEngineeringGraph();
resetDecisionRecordsCache();
const graph = getEngineeringGraph({ forceRebuild: true });
const records = buildDecisionRecords(graph);

test('phase1 graph still validates', () => {
  const v = validateEngineeringGraph(graph);
  assert(v.ok, v.errors.join('; '));
});

test('one DecisionRecord per Decision graph node', () => {
  const nodes = getNodesByType(graph, 'Decision');
  assert(records.length === nodes.length, `records=${records.length} nodes=${nodes.length}`);
});

test('validateDecisionRecords passes', () => {
  const v = validateDecisionRecords(records, graph);
  assert(v.ok, v.errors.join('; '));
});

test('every record cites graph decision + project nodes', () => {
  for (const r of records) {
    assert(graph.nodes.has(r.graphNodeId), `missing decision node ${r.graphNodeId}`);
    assert(r.evidenceRefs.some((e) => e.kind === 'decision-node'), 'missing decision evidence');
    assert(r.evidenceRefs.some((e) => e.kind === 'project-node'), 'missing project evidence');
    assert(r.reasons.length === 1 && r.reasons[0] === r.rawText, 'reasons must be raw decision text');
  }
});

test('getDecisionsForProject(queryforge) returns 3 records', () => {
  const list = getDecisionsForProject('queryforge', graph);
  assert(list.length === 3, `got ${list.length}`);
});

test('Flask decisions resolve chosen=Flask from graph project stack', () => {
  const flask = getDecisionsForTechnology('Flask', graph);
  assert(flask.length >= 1, 'expected Flask-linked decisions');
  assert(flask.every((r) => r.chosen === 'Flask' || r.relatedTechs.includes('Flask')), 'flask linkage');
});

test('alternatives never claim rejection', () => {
  for (const r of records) {
    for (const alt of r.alternatives || []) {
      assert(!/reject/i.test(alt.status), `bad status ${alt.status}`);
    }
  }
});

test('FastAPI on RepoRadar gets tradeoffs vs Flask from TECH_TAKES', () => {
  const list = getDecisionsForProject('reporadar', graph);
  const withFastApi = list.find((r) => r.chosen === 'FastAPI' || r.relatedTechs.includes('FastAPI') || /FastAPI/i.test(r.rawText));
  assert(withFastApi, 'expected a RepoRadar decision mentioning FastAPI');
  assert(withFastApi.tradeoffs.length > 0, 'expected TECH_TAKES tradeoffs');
  assert(withFastApi.alternatives.some((a) => a.tech === 'Flask'), 'expected Flask alternative');
});

test('wouldChooseAgain is unknown or inferred — never fabricated yes', () => {
  for (const r of records) {
    const w = r.currentEvaluation.wouldChooseAgain;
    assert(['yes', 'lean-yes', 'depends', 'unknown'].includes(w), `bad value ${w}`);
    if (w === 'yes') assert(r.currentEvaluation.confidence === 'documented', 'bare yes requires documented');
  }
});

test('getDecisionRecordById round-trips', () => {
  const first = records[0];
  const got = getDecisionRecordById(first.id, graph);
  assert(got && got.id === first.id, 'round-trip failed');
});

test('cache returns same array until reset', () => {
  resetDecisionRecordsCache();
  const a = getDecisionRecords(graph);
  const b = getDecisionRecords(graph);
  assert(a === b, 'expected memoized array');
});

test('approach-only decisions have chosen=null', () => {
  const approach = records.filter((r) => !r.chosen);
  assert(approach.length >= 1, 'expected at least one approach-level decision');
  assert(approach.every((r) => r.chosenKind === 'approach'), 'chosenKind');
});

const validation = validateDecisionRecords(records, graph);
console.log('\n--- Decision Record stats ---');
console.log(JSON.stringify(validation.stats, null, 2));
console.log('\n--- Sample record ---');
console.log(JSON.stringify(records.find((r) => r.chosen === 'Flask') || records[0], null, 2).slice(0, 1200));
console.log('\n--- Validation ---');
console.log(JSON.stringify({
  ok: validation.ok,
  errorCount: validation.errors.length,
  warningCount: validation.warnings.length,
  errors: validation.errors,
  warnings: validation.warnings,
}, null, 2));

const passed = results.filter((r) => r.ok).length;
console.log(`\nRESULT ${passed}/${results.length}`);
process.exit(passed === results.length && validation.ok ? 0 : 1);
