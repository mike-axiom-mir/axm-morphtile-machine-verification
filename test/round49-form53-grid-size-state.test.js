"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "dd5764efdcd75bb826dd908a4d2245ad04d0a57a";
const FORM53 = "2484c05a9782e7eb84730a03e4a57e9f63584b55";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R49_FORM_BASE_ROOT && process.env.R49_FORM53_ROOT && process.env.R49_MORPHTILE_ROOT);

function request(root, requestId, intent) {
  const base = require(path.join(root, "fixtures/request.box.json"));
  return { ...base, request_id: requestId, intent };
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

test("Form 53 exact head owns copied generated size state without taking validation authority", { skip: !enabled }, () => {
  assert.equal(process.env.R49_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R49_FORM53_COMMIT, FORM53);
  assert.equal(process.env.R49_MORPHTILE_COMMIT, MORPHTILE);

  const State = require(path.join(process.env.R49_FORM53_ROOT, "src/grid-size-state"));
  const grid = {
    counts: [3, 4, 1],
    part: { shape: "box", size: [1, 2, 3] },
    size_step: { x: [0.25, 0, -0.1], y: [0, 0.5, 0] }
  };
  const before = JSON.stringify(grid);
  const state = State.sizeStateFromGrid(grid);
  assert.deepEqual(state, { base: [1, 2, 3], deltas: [[0.25, 0, -0.1], [0, 0.5, 0], null] });
  state.base[0] = 99;
  state.deltas[0][0] = 99;
  assert.equal(JSON.stringify(grid), before, "generated state aliases caller-authored grid matter");
  assert.deepEqual(State.generatedSizeFromGrid(grid, [2, 3, 0]), [1.5, 3.5, 2.8]);
  assert.deepEqual(State.sizeExpressionStateFromGrid(grid), [
    ["+", 1, ["*", ["var", "gx"], 0.25]],
    ["+", 2, ["*", ["var", "gy"], 0.5]],
    ["+", 3, ["*", ["var", "gx"], -0.1]]
  ]);
  assert.deepEqual(State.sizeStateFromGrid({ part: { size: [1, 2] }, size_step: { x: [1, 0] } }), {
    base: [1, 1, 1], deltas: [null, null, null]
  }, "private representation helper must remain validation-neutral");
});

test("Form 53 preserves predecessor-visible candidate and HOLD semantics over the important size domain", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R49_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R49_FORM53_ROOT, "src"));
  const validIntent = {
    name: "verification-grid-size",
    grid: {
      counts: [2, 2, 1], step: [2, 0, 0],
      size_step: { x: [0.2, 0, 0], y: [0, 0.3, 0] },
      rot_step: { y: [0, 0.1, 0] },
      part: { shape: "wedge", size: [1, 2, 1], rot: [0, 0.5, 0] }
    }
  };
  const valid = request(process.env.R49_FORM53_ROOT, "r49-form53-valid", validIntent);
  const oldValid = stableRun(Base, valid, "Form predecessor valid");
  const newValid = stableRun(Head, valid, "Form 53 valid");
  assert.equal(newValid.status, "CANDIDATE");
  assert.deepEqual(newValid, oldValid, "private generated-state convergence changed public machine output");

  const cases = [
    ["empty", { counts: [2,1,1], step: [0,0,0], size_step: {}, part: { shape: "box", size: [2,2,2] } }],
    ["unknown-axis", { counts: [2,1,1], step: [0,0,0], size_step: { q: [1,0,0] }, part: { shape: "box", size: [2,2,2] } }],
    ["zero-delta", { counts: [2,1,1], step: [0,0,0], size_step: { x: [0,0,0] }, part: { shape: "box", size: [2,2,2] } }],
    ["inactive-axis", { counts: [2,1,1], step: [0,0,0], size_step: { y: [0.1,0,0] }, part: { shape: "box", size: [2,2,2] } }],
    ["wrong-target", { counts: [2,1,1], step: [1,0,0], size_step: { x: [0.1,0,0] }, instance: { use: "arch.segment" } }],
    ["nonpositive", { counts: [3,1,1], step: [0,0,0], size_step: { x: [-0.6,0,0] }, part: { shape: "box", size: [1,1,1] } }],
    ["overflow", { counts: [3,1,1], step: [0,0,0], size_step: { x: [Number.MAX_VALUE,0,0] }, part: { shape: "box", size: [1,1,1] } }],
    ["collision", { counts: [2,2,1], step: [0,0,0], size_step: { x: [1,0,0], y: [-1,0,0] }, part: { shape: "box", size: [10,1,1] } }]
  ];
  for (const [id, grid] of cases) {
    const input = request(process.env.R49_FORM53_ROOT, `r49-form53-${id}`, { grid });
    const oldOut = stableRun(Base, input, `Form predecessor ${id}`);
    const newOut = stableRun(Head, input, `Form 53 ${id}`);
    assert.deepEqual(newOut, oldOut, `${id}: convergence moved validation/HOLD ownership`);
    assert.equal(newOut.status, "HOLD", `${id}: malformed/domain-invalid case must fail closed`);
  }
});

test("Form 53 remains receiver-equivalent through finite changing MorphTile geometry", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R49_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R49_FORM53_ROOT, "src"));
  const MT = require(path.join(process.env.R49_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = request(process.env.R49_FORM53_ROOT, "r49-form53-receiver", {
    grid: {
      counts: [2,2,1], step: [0,0,0],
      size_step: { x: [0.25,0,0], y: [0,0.15,0] },
      rot_step: { y: [0,0.1,0] },
      part: { shape: "wedge", size: [1,2,1] }
    }
  });
  const oldOut = stableRun(Base, input, "Form predecessor receiver");
  const newOut = stableRun(Head, input, "Form 53 receiver");
  assert.deepEqual(newOut, oldOut);
  const leaf = leafOf(newOut.candidate);
  assert.deepEqual(leaf.size, [
    ["+", 1, ["*", ["var", "gx"], 0.25]],
    ["+", 2, ["*", ["var", "gy"], 0.15]],
    1
  ]);
  const tile = MT.createTile(newOut.candidate);
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const mesh = MT.compileMesh(tile);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));

  const fixed = JSON.parse(JSON.stringify(newOut.candidate));
  leafOf(fixed).size = [1,2,1];
  const fixedMesh = MT.compileMesh(MT.createTile(fixed));
  assert.equal(fixedMesh.hold, null);
  assert.notDeepEqual(mesh.P, fixedMesh.P, "receiver did not consume emitted per-cell size progression");
});
