"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "f2f549266e3a5c15eb87fd967261eb874a990d27";
const FORM52 = "3a4b11e69e23fd3d131ecb9648f93e3ecaa84033";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R48_FORM_BASE_ROOT && process.env.R48_FORM52_ROOT && process.env.R48_MORPHTILE_ROOT);

function req(id, grid) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify Form 52 grid scale expression-state convergence",
    intent: { grid },
    provenance: { caller: "verification-round48" }
  };
}

function stableRun(machine, input, label) {
  const before = JSON.stringify(input);
  const first = machine.run(input);
  const replay = machine.run(input);
  assert.deepEqual(replay, first, `${label}: deterministic replay drifted`);
  assert.equal(JSON.stringify(input), before, `${label}: caller input mutated`);
  return first;
}

function leafOf(candidate) {
  let node = candidate.facets.mesh.data.parts[0];
  while (node && Number.isInteger(node.repeat) && Array.isArray(node.body)) node = node.body[0];
  return node;
}

test("Form 52 exact head owns copied scalar/vector expression state without taking validation authority", { skip: !enabled }, () => {
  assert.equal(process.env.R48_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R48_FORM52_COMMIT, FORM52);
  assert.equal(process.env.R48_MORPHTILE_COMMIT, MORPHTILE);

  const State = require(path.join(process.env.R48_FORM52_ROOT, "src/grid-scale-state"));
  const scalar = { counts: [3, 1, 4], instance: { use: "panel", scale: 2 }, scale_step: { z: 0.5, x: 1 } };
  const scalarBefore = JSON.stringify(scalar);
  assert.deepEqual(State.scaleStateFromGrid(scalar), { kind: "scalar", base: 2, deltas: [1, null, 0.5] });
  assert.deepEqual(State.generatedScaleFromGrid(scalar, [2, 0, 3]), [5.5]);
  assert.deepEqual(State.scaleExpressionStateFromGrid(scalar), ["+", ["+", 2, ["*", ["var", "gx"], 1]], ["*", ["var", "gz"], 0.5]]);
  assert.equal(JSON.stringify(scalar), scalarBefore);

  const vector = { counts: [3, 4, 1], instance: { use: "panel", scale: [1, 2, 3] }, scale_step: { y: [0, 1, 0], x: [1, 0, -0.5] } };
  const vectorBefore = JSON.stringify(vector);
  const state = State.scaleStateFromGrid(vector);
  assert.deepEqual(state, { kind: "vector", base: [1, 2, 3], deltas: [[1, 0, -0.5], [0, 1, 0], null] });
  state.base[0] = 99;
  state.deltas[0][0] = 99;
  assert.equal(JSON.stringify(vector), vectorBefore, "returned expression state aliases authored grid matter");
  assert.deepEqual(State.generatedScaleFromGrid(vector, [2, 3, 0]), [3, 5, 2]);
  assert.deepEqual(State.scaleExpressionStateFromGrid(vector), [
    ["+", 1, ["*", ["var", "gx"], 1]],
    ["+", 2, ["*", ["var", "gy"], 1]],
    ["+", 3, ["*", ["var", "gx"], -0.5]]
  ]);
  assert.doesNotThrow(() => State.scaleStateFromGrid({ instance: { use: "panel" }, scale_step: { x: "bad" } }), "private representation helper must remain validation-neutral");
});

test("Form 52 preserves predecessor-visible valid candidate and malformed HOLD semantics", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R48_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R48_FORM52_ROOT, "src"));
  const valid = req("r48-form52-valid", {
    counts: [2, 2, 1], step: [0, 0, 0],
    scale_step: { x: [0.2, 0, 0], y: [0, 0.15, -0.1] },
    rot_step: { y: [0, 0.1, 0] },
    instance: { use: "panel", scale: [0.5, 1, 1.2], rot: [0, 0.2, 0] }
  });
  const base = stableRun(Base, valid, "Form predecessor valid scale grid");
  const head = stableRun(Head, valid, "Form 52 valid scale grid");
  assert.equal(base.status, "CANDIDATE");
  assert.equal(head.status, "CANDIDATE");
  assert.deepEqual(head.candidate, base.candidate, "private convergence changed public candidate matter");
  assert.deepEqual(head.dependencies, base.dependencies, "private convergence changed dependencies");

  for (const [id, scale_step] of [
    ["mixed-kinds", { x: 0.1, y: [0.1, 0, 0] }],
    ["zero", { x: 0 }],
    ["malformed", { x: "bad" }]
  ]) {
    const input = req(`r48-form52-${id}`, { counts: [2, 2, 1], step: [0, 0, 0], scale_step, instance: { use: "panel" } });
    const oldOut = stableRun(Base, input, `Form predecessor ${id}`);
    const newOut = stableRun(Head, input, `Form 52 ${id}`);
    assert.deepEqual(newOut, oldOut, `${id}: convergence moved validation/HOLD ownership`);
    assert.equal(newOut.status, "HOLD");
  }
});

test("Form 52 remains receiver-equivalent through finite changing MorphTile geometry", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R48_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R48_FORM52_ROOT, "src"));
  const MT = require(path.join(process.env.R48_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = req("r48-form52-receiver", {
    counts: [2, 2, 1], step: [0, 0, 0], scale_step: { x: 0.2, y: 0.35 },
    rot_step: { y: [0, 0.1, 0] }, instance: { use: "panel", scale: 0.6 }
  });
  const base = stableRun(Base, input, "Form predecessor receiver");
  const head = stableRun(Head, input, "Form 52 receiver");
  assert.deepEqual(head.candidate, base.candidate);
  assert.deepEqual(leafOf(head.candidate).scale, ["+", ["+", 0.6, ["*", ["var", "gx"], 0.2]], ["*", ["var", "gy"], 0.35]]);

  function compile(out, name) {
    const world = MT.createWorld(name);
    world.defs = { panel: { id: "panel", name: "Panel", body: { facets: { mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 2, 1] } } } } } };
    const tile = MT.createTile(out.candidate);
    world.tiles[tile.id] = tile;
    const validity = MT.validateTile(tile);
    assert.equal(validity.ok, true, validity.errors.join(", "));
    return MT.compileMesh(tile, world);
  }
  const oldMesh = compile(base, "r48-form-base");
  const newMesh = compile(head, "r48-form-head");
  assert.equal(newMesh.hold, null, JSON.stringify(newMesh));
  assert.equal(newMesh.recipe_parts, 4);
  assert.equal(newMesh.P.every(Number.isFinite), true);
  assert.deepEqual(newMesh.P, oldMesh.P, "receiver geometry changed across private scale-expression convergence");
});
