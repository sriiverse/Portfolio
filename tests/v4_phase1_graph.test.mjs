/**
 * V4 Phase 1 — Engineering Knowledge Graph tests
 * Run: node tests/v4_phase1_graph.test.mjs
 *
 * Does not touch reasoning, providers, UI, or conversation behavior.
 */
import {
  PROFILE,
  PROJECTS,
  STACK,
  ARCHITECTURE,
  JOURNEY,
} from '../src/content.js';
import {
  buildEngineeringGraph,
  getEngineeringGraph,
  resetEngineeringGraph,
  validateEngineeringGraph,
  getNodesByType,
  getEdges,
  getNeighbors,
  getProjectTechnologies,
  getTechnologyProjects,
  getProjectFeatures,
  getProjectDecisions,
  getArchitecturePath,
  graphStats,
  nodeId,
} from '../src/assistant/graph.js';

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
const graph = buildEngineeringGraph({
  PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY,
});

test('builds a non-empty graph', () => {
  assert(graph.nodes.size > 0, 'no nodes');
  assert(graph.edges.length > 0, 'no edges');
});

test('validateEngineeringGraph passes with zero errors', () => {
  const v = validateEngineeringGraph(graph, { PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY });
  assert(v.ok, `validation errors: ${v.errors.join('; ')}`);
});

test('one Project node per PROJECTS entry', () => {
  assert(getNodesByType(graph, 'Project').length === PROJECTS.length, 'project count mismatch');
});

test('one Technology node per STACK entry', () => {
  assert(getNodesByType(graph, 'Technology').length === STACK.length, 'tech count mismatch');
});

test('one ArchLayer node per ARCHITECTURE entry', () => {
  assert(getNodesByType(graph, 'ArchLayer').length === ARCHITECTURE.length, 'layer count mismatch');
});

test('feature nodes equal sum of project features', () => {
  const expected = PROJECTS.reduce((n, p) => n + (p.features?.length || 0), 0);
  assert(getNodesByType(graph, 'Feature').length === expected, 'feature count mismatch');
});

test('decision nodes equal sum of project decisions', () => {
  const expected = PROJECTS.reduce((n, p) => n + (p.decisions?.length || 0), 0);
  assert(getNodesByType(graph, 'Decision').length === expected, 'decision count mismatch');
});

test('used_in edges cover every project.stack entry', () => {
  let expected = 0;
  for (const p of PROJECTS) expected += (p.stack || []).length;
  assert(getEdges(graph, { type: 'used_in' }).length === expected, 'used_in count mismatch');
});

test('no hardcoded mapping — QueryForge stack derived from content', () => {
  const techs = getProjectTechnologies(graph, 'queryforge').map((n) => n.label).sort();
  const expected = [...PROJECTS.find((p) => p.id === 'queryforge').stack].sort();
  assert(JSON.stringify(techs) === JSON.stringify(expected), `got ${techs} expected ${expected}`);
});

test('getTechnologyProjects returns projects listing Python', () => {
  const projects = getTechnologyProjects(graph, 'Python');
  assert(projects.length === PROJECTS.filter((p) => p.stack.includes('Python')).length, 'python project count');
});

test('getProjectFeatures / getProjectDecisions match content lengths', () => {
  for (const p of PROJECTS) {
    assert(getProjectFeatures(graph, p.id).length === p.features.length, `features ${p.id}`);
    assert(getProjectDecisions(graph, p.id).length === p.decisions.length, `decisions ${p.id}`);
  }
});

test('architecture path follows next_layer order', () => {
  const path = getArchitecturePath(graph).map((n) => n.props.layerId);
  assert(path.length === ARCHITECTURE.length, 'path length');
  assert(path[0] === 'frontend' && path[path.length - 1] === 'deploy', `path=${path}`);
});

test('frontend talks_to backend and via REST APIs', () => {
  const talks = getEdges(graph, { type: 'talks_to' });
  assert(talks.length >= 1, 'missing talks_to');
  assert(talks.some((e) => e.from === nodeId('layer', 'frontend') && e.to === nodeId('layer', 'backend')), 'frontend→backend');
  const via = getEdges(graph, { type: 'via' });
  assert(via.some((e) => e.to === nodeId('tech', 'REST APIs')), 'via REST APIs');
});

test('neighbors depth-1 from a project includes features', () => {
  const pid = nodeId('project', 'reporadar');
  const neigh = getNeighbors(graph, pid, { direction: 'out', edgeTypes: ['has_feature'] });
  assert(neigh.length === PROJECTS.find((p) => p.id === 'reporadar').features.length, 'neighbor features');
});

test('journey_ships links only when title matches a project name', () => {
  const links = getEdges(graph, { type: 'journey_ships' });
  assert(links.length === 3, `expected 3 ship journey links, got ${links.length}`);
});

test('profile ships all projects', () => {
  const ships = getEdges(graph, { from: nodeId('profile', 'sudhanshu'), type: 'ships' });
  assert(ships.length === PROJECTS.length, 'ships count');
});

test('singleton getEngineeringGraph matches rebuild stats', () => {
  resetEngineeringGraph();
  const a = getEngineeringGraph({ forceRebuild: true });
  const b = getEngineeringGraph();
  assert(a === b, 'singleton identity');
  assert(graphStats(a).nodeCount === graphStats(graph).nodeCount, 'stats parity');
});

test('edge endpoints always resolve', () => {
  for (const e of graph.edges) {
    assert(graph.nodes.has(e.from) && graph.nodes.has(e.to), `dangling ${e.id}`);
  }
});

// --- Summary / validation output ---
const validation = validateEngineeringGraph(graph, { PROFILE, PROJECTS, STACK, ARCHITECTURE, JOURNEY });
const stats = graphStats(graph);

console.log('\n--- Graph stats ---');
console.log(JSON.stringify(stats, null, 2));
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
