'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const EXPECTED_INTERFACE_BASE = 'cec03d917227881100d4ce576ed49174e51d8210';
const EXPECTED_INTERFACE54 = 'fe83ee7c434f08ab32e1500ba93b880b5dbd2f2c';
const EXPECTED_ASSEMBLY_CURRENT = '6f16e1019af8d081e390a3a74d836a10a93d8d5d';
const EXPECTED_CORE = '685df074701feeae3e9d789e532d0a3658030bf4';

const interfaceBaseRoot = process.env.R66_INTERFACE_BASE_ROOT;
const interface54Root = process.env.R66_INTERFACE54_ROOT;
const assemblyCurrentRoot = process.env.R66_ASSEMBLY_CURRENT_ROOT;
const coreRoot = process.env.R66_MORPHTILE_ROOT;

function request(id, goal, intent) {
  return {
    envelope_version: '0.1',
    request_id: id,
    goal,
    intent,
    provenance: { caller: 'verification-round66-interface54' }
  };
}

function uiEligibility() {
  return {
    candidate: {
      schema: 'morphtile.tile-spec/v0.4',
      form_hints: ['ui_panel'],
      facets: {}
    },
    provenance: { caller: 'verification-round66-ui-eligibility' }
  };
}

function assembleWith(assemble, interfaceOut) {
  return assemble({
    envelope_version: '0.1',
    request_id: 'verification-round66-current-assembly',
    goal: 'Retain one canonical-state title expression and its target-owned read proof',
    intent: { id: 'mt_inner', tile_path: 'mt_shell/mt_inner', name: 'Canonical title receiver proof' },
    inputs: [uiEligibility(), interfaceOut],
    provenance: { caller: 'verification-round66-interface54' }
  });
}

function collect(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return found;
}

function renderedTitle(MT, ws) {
  const compiled = MT.compilePanel(ws.live);
  const panels = collect(compiled.root, (node) => node.tile === 'mt_tower' && String(node.cls || '').includes('is-view'));
  assert.equal(panels.length, 1, 'one authored tower view must render');
  const headings = collect(panels[0], (node) => node.tag === 'h3');
  assert.equal(headings.length, 1, 'authored view must render one heading');
  return headings[0].text;
}

test('exact identity inputs are the intended Interface 54, current Assembly and current Core', () => {
  assert.equal(process.env.R66_INTERFACE_BASE_COMMIT, EXPECTED_INTERFACE_BASE);
  assert.equal(process.env.R66_INTERFACE54_COMMIT, EXPECTED_INTERFACE54);
  assert.equal(process.env.R66_ASSEMBLY_CURRENT_COMMIT, EXPECTED_ASSEMBLY_CURRENT);
  assert.equal(process.env.R66_MORPHTILE_COMMIT, EXPECTED_CORE);
});

test('Interface 54 adds only bounded canonical-title authoring and fails closed around authority edges', () => {
  const { run: baseRun } = require(path.resolve(interfaceBaseRoot, 'src'));
  const { run: candidateRun } = require(path.resolve(interface54Root, 'src'));

  const intent = {
    tile_path: 'mt_tower',
    title_binding: 'beacon',
    elements: [{ kind: 'text', text: 'Tower status' }],
    bindings: { readouts: ['beacon'] }
  };
  const before = baseRun(request('before-title-binding', 'Probe predecessor title authority', intent));
  assert.equal(before.status, 'HOLD', 'integrated predecessor must not already expose title_binding');

  const out = candidateRun(request('canonical-title', 'Author one bounded canonical-state title', intent));
  assert.equal(out.status, 'CANDIDATE', JSON.stringify(out.holds));
  assert.deepEqual(out.candidate.operation.view.title, ['var', 'beacon']);
  assert.deepEqual(out.dependencies.map((dependency) => dependency.requires.readout_logic_vars), [['beacon']]);
  assert.equal(JSON.stringify(out.candidate).includes('canonical_state'), false, 'Interface must not snapshot canonical state');

  const ambiguous = candidateRun(request('ambiguous-title', 'Reject two title authorities', {
    tile_path: 'mt_tower',
    title: 'Static',
    title_binding: 'beacon',
    bindings: { readouts: ['beacon'] }
  }));
  assert.equal(ambiguous.status, 'HOLD');
  assert.equal(ambiguous.holds[0].code, 'HOLD_INTERFACE_CONTENT_AMBIGUOUS');

  const undeclared = candidateRun(request('undeclared-title', 'Reject undeclared title read authority', {
    tile_path: 'mt_tower',
    title_binding: 'beacon',
    bindings: { readouts: [] }
  }));
  assert.equal(undeclared.status, 'HOLD');
  assert.equal(undeclared.holds[0].code, 'HOLD_INVALID_INTERFACE_BINDING');

  const arbitrary = candidateRun(request('arbitrary-title', 'Reject arbitrary expression authoring', {
    tile_path: 'mt_tower',
    title: ['+', 'Tower ', ['var', 'beacon']]
  }));
  assert.equal(arbitrary.status, 'HOLD');
  assert.equal(arbitrary.holds[0].code, 'HOLD_INTERFACE_TEXT_INVALID');
});

test('live current Assembly preserves Interface 54 title expression and exact read proof', () => {
  const { run: authorInterface } = require(path.resolve(interface54Root, 'src'));
  const { run: assemble } = require(path.resolve(assemblyCurrentRoot, 'src'));
  const interfaceOut = authorInterface(request('nested-title', 'Author a nested canonical title for current receiver proof', {
    tile_path: 'mt_shell/mt_inner',
    title_binding: 'count',
    elements: [{ kind: 'text', text: 'Receiver title proof' }],
    bindings: { readouts: ['count'] }
  }));
  assert.equal(interfaceOut.status, 'CANDIDATE', JSON.stringify(interfaceOut.holds));
  assert.deepEqual(interfaceOut.candidate.operation.view.title, ['var', 'count']);
  assert.deepEqual(interfaceOut.dependencies[0].requires.readout_logic_vars, ['count']);

  const combined = assembleWith(assemble, interfaceOut);
  assert.equal(combined.status, 'CANDIDATE', JSON.stringify(combined.holds));
  assert.deepEqual(combined.candidate.view.title, ['var', 'count']);
  assert.deepEqual(combined.dependencies, interfaceOut.dependencies);
  assert.equal(combined.closure_hash.scope, 'candidate+dependencies+world_requirements');
});

test('pinned MorphTile resolves the title from live canonical state without rewriting authored matter', () => {
  const { run: authorInterface } = require(path.resolve(interface54Root, 'src'));
  const MT = require(path.resolve(coreRoot, 'core/morphtile.js'));
  const ws = MT.createWorkspace(MT.seedWorld());
  assert.equal(MT.readVars(ws.live, 'mt_tower', 0).beacon, 0);

  const out = authorInterface(request('runtime-title', 'Prove title remains a read-only view of canonical state', {
    tile_path: 'mt_tower',
    title_binding: 'beacon',
    elements: [{ kind: 'text', text: 'Canonical tower title' }],
    bindings: { readouts: ['beacon'] }
  }));
  assert.equal(out.status, 'CANDIDATE', JSON.stringify(out.holds));

  const candidate = MT.cloneBody(ws, 'ai', 'ai:verification-round66');
  const edited = MT.editCandidate(ws, candidate, out.candidate.operation);
  assert.ok(edited.ok, edited.error);
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, 'READY', JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id);
  assert.ok(committed.ok, JSON.stringify(committed));

  const authoredView = JSON.stringify(ws.live.tiles.mt_tower.view);
  const committedHash = MT.structHash(ws.live);
  assert.equal(renderedTitle(MT, ws), '0');
  assert.equal(MT.structHash(ws.live), committedHash, 'rendering must remain structurally read-only');

  MT.act(ws, { do: 'signal', tile: 'mt_tower', name: 'toggle' });
  assert.equal(MT.readVars(ws.live, 'mt_tower', 0).beacon, 1);
  assert.equal(renderedTitle(MT, ws), '1');
  assert.equal(JSON.stringify(ws.live.tiles.mt_tower.view), authoredView, 'canonical state changes must not rewrite Interface-authored view matter');
});
