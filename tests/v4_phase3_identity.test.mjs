/**
 * V4 Phase 3 — Engineering Identity tests
 * Run: node tests/v4_phase3_identity.test.mjs
 */
import {
  getEngineeringGraph,
  resetEngineeringGraph,
  validateEngineeringGraph,
} from '../src/assistant/graph.js';
import {
  getDecisionRecords,
  resetDecisionRecordsCache,
  validateDecisionRecords,
} from '../src/assistant/decisions.js';
import {
  buildEngineeringIdentity,
  getEngineeringIdentity,
  resetEngineeringIdentityCache,
  listIdentityClaims,
  getIdentityClaimsByFacet,
  validateEngineeringIdentity,
} from '../src/assistant/identity.js';

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
resetEngineeringIdentityCache();

const graph = getEngineeringGraph({ forceRebuild: true });
const records = getDecisionRecords(graph, { forceRebuild: true });
const identity = buildEngineeringIdentity(graph, records);

test('phase1 graph validates', () => {
  assert(validateEngineeringGraph(graph).ok, 'graph invalid');
});

test('phase2 decisions validate', () => {
  assert(validateDecisionRecords(records, graph).ok, 'decisions invalid');
});

test('identity validates', () => {
  const v = validateEngineeringIdentity(identity, graph, records);
  assert(v.ok, v.errors.join('; '));
});

test('all required facets present', () => {
  const facets = [
    'philosophy', 'designPrinciples', 'architecturalPrefs', 'technologyPrefs',
    'communicationStyle', 'problemSolving', 'commonPatterns', 'strengths',
    'learningTrajectory', 'growthAreas', 'decisionStyle',
  ];
  for (const f of facets) {
    assert(Array.isArray(identity.claims[f]), `missing ${f}`);
    assert(identity.claims[f].length >= 1, `empty facet ${f}`);
  }
});

test('every claim has evidence', () => {
  for (const c of listIdentityClaims(identity)) {
    assert(c.evidence?.length, `no evidence ${c.id}`);
    assert(['documented', 'inferred'].includes(c.confidence), `bad confidence ${c.id}`);
  }
});

test('no personality fluff', () => {
  for (const c of listIdentityClaims(identity)) {
    assert(!/\b(passionate|humble|genius|rockstar|ninja)\b/i.test(c.statement), c.id);
  }
});

test('subject matches profile from graph', () => {
  assert(identity.subject?.name, 'missing subject');
  assert(/Python Backend Engineer/i.test(identity.subject.title), 'title');
});

test('philosophy includes AI reasoning layer motif when evidenced', () => {
  const ph = getIdentityClaimsByFacet('philosophy', identity);
  assert(ph.some((c) => /reasoning layer/i.test(c.statement)), 'missing reasoning-layer claim');
});

test('commonPatterns includes universal stack techs', () => {
  const patterns = getIdentityClaimsByFacet('commonPatterns', identity);
  assert(patterns.some((c) => /Python/i.test(c.statement)), 'python pattern');
  assert(patterns.some((c) => /LLMs/i.test(c.statement)), 'llms pattern');
});

test('growthAreas does not invent employers or seniority', () => {
  const growth = getIdentityClaimsByFacet('growthAreas', identity);
  for (const c of growth) {
    assert(!/\b(Google|Meta|staff engineer|10 years)\b/i.test(c.statement), c.statement);
  }
});

test('learningTrajectory references journey nodes', () => {
  const traj = getIdentityClaimsByFacet('learningTrajectory', identity);
  assert(traj.some((c) => c.evidence.some((e) => e.kind === 'journey-node')), 'journey evidence');
});

test('getEngineeringIdentity cache works', () => {
  resetEngineeringIdentityCache();
  const a = getEngineeringIdentity(graph, records);
  const b = getEngineeringIdentity(graph, records);
  assert(a === b, 'cache identity');
});

const validation = validateEngineeringIdentity(identity, graph, records);
console.log('\n--- Identity stats ---');
console.log(JSON.stringify(validation.stats, null, 2));
console.log('\n--- Sample claims ---');
for (const facet of ['philosophy', 'strengths', 'growthAreas']) {
  const c = identity.claims[facet][0];
  console.log(`[${facet}] (${c.confidence}) ${c.statement}`);
}
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
