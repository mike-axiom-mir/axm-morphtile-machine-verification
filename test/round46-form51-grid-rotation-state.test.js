"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "8b4a18d9d35aad91575b02831a8448104993f4f9";
const FORM51 = "12c5bd26ab7f51bf63b8da06d20cd5bb61877942";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R46_FORM_BASE_ROOT && process.env.R46_FORM51_ROOT && process.env.R46_MORPHTILE_ROOT);

function req(id, grid) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify Form 51 grid rotation state convergence",
    intent: { grid },
    provenance: { caller: "verification-round46" }
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
  while (node && Array.isArray(node.body) && node.body.length === 1) node = node.body[0];
  return node;
}

test("Form 51 exact head centralizes copied rotation state without taking validation authority", { skip: !enabled }, () => {
  assert.equal(process.env.R46_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R46_FORM51_COMMIT, FORM51);
  assert.equal(process.env.R46_MORPHTILE_COMMIT, MORPHTILE);

  const State = require(path.join(process.env.R46_FORM51_ROOT, "src/grid-rotation-state"));
  const grid = {
    counts: [3, 2, 1],
    step: [2, 3, 0],
    part: { shape: "box", pos: [1, 2, 3], rot: [10, -20, 30], size: [1, 1, 1] },
    rot_step: {
      x: [5, 0, -2],
      y: [0, 15, 0]
    }
  };
  const before = JSON.stringify(grid);
  const state = State.rotationStateFromGrid(grid);
  assert.deepEqual(state, {
    base: [10, -20, 30],
    deltas: [[5, 0, -2], [0, 15, 0], null]
  });
  assert.notStrictEqual(state.base, grid.part.rot);
  assert.notStrictEqual(state.deltas[0], grid.rot_step.x);
  assert.notStrictEqual(state.deltas[1], grid.rot_step.y);
  assert.deepEqual(State.generatedRotationFromGrid(grid, [2, 1, 0]), [20, -5, 26]);
  assert.deepEqual(State.rotationExpressionStateFromGrid(grid), [
    ["+", 10, ["*", ["var", "gx"], 5]],
    ["+", -20, ["*", ["var", "gy"], 15]],
    ["+", 30, ["*", ["var", "gx"], -2]]
  ]);
  state.base[0] = -999;
  state.deltas[0][0] = -999;
  assert.equal(JSON.stringify(grid), before, "returned state aliases authored grid matter");

  assert.deepEqual(State.rotationStateFromGrid({ instance: { use: "panel" } }), {
    base: [0, 0, 0],
    deltas: [null, null, null]
  });
  assert.deepEqual(State.rotationStateFromGrid({
    part: { shape: "box", rot: [1, Number.POSITIVE_INFINITY, 3] },
    rot_step: { x: [1, 2] }
  }), {
    base: [0, 0, 0],
    deltas: [null, null, null]
  }, "representation helper should remain validation-neutral for malformed raw state");
});

test("Form 51 preserves predecessor-visible candidate and HOLD semantics", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R46_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R46_FORM51_ROOT, "src"));

  const grid = {
    counts: [3, 2, 1],
    step: [1.25, 2, 0],
    part: {
      shape: "wedge",
      pos: [4, -2, 7],
      size: [1, 2, 0.5],
      rot: [10, -20, 30]
    },
    rot_step: {
      x: [0, 15, 0],
      y: [5, 0, -2]
    },
    size_step: {
      x: [0.1, 0, 0],
      y: [0, 0.2, 0]
    }
  };

  const baseOut = stableRun(Base, req("r46-form51-valid", grid), "Form base valid grid");
  const headOut = stableRun(Head, req("r46-form51-valid", grid), "Form 51 valid grid");
  assert.equal(baseOut.status, "CANDIDATE");
  assert.equal(headOut.status, "CANDIDATE");
  assert.deepEqual(headOut.candidate, baseOut.candidate, "Form-private convergence changed public candidate matter");
  assert.deepEqual(headOut.dependencies, baseOut.dependencies, "Form-private convergence changed dependencies");

  const malformed = req("r46-form51-malformed", {
    counts: [2, 1, 1],
    step: [1, 0, 0],
    part: { shape: "box", rot: [0, 0, 0] },
    rot_step: { x: [1, 2] }
  });
  const baseMalformed = stableRun(Base, malformed, "Form base malformed rotation");
  const headMalformed = stableRun(Head, malformed, "Form 51 malformed rotation");
  assert.deepEqual(headMalformed, baseMalformed, "rotation-state convergence moved malformed-input HOLD ownership");
  assert.equal(headMalformed.status, "HOLD");
  assert.equal(headMalformed.holds[0].code, "HOLD_FORM_GRID_INVALID");

  const noEffect = req("r46-form51-noeffect", {
    counts: [1, 1, 1],
    step: [0, 0, 0],
    part: { shape: "box", rot: [0, 0, 0] },
    rot_step: { x: [0, 10, 0] }
  });
  assert.deepEqual(
    stableRun(Head, noEffect, "Form 51 no-effect axis"),
    stableRun(Base, noEffect, "Form base no-effect axis"),
    "active-axis count HOLD semantics changed"
  );
});

test("Form 51 remains schema-valid and receiver-equivalent through real finite MorphTile geometry", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R46_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R46_FORM51_ROOT, "src"));
  const MT = require(path.join(process.env.R46_MORPHTILE_ROOT, "core/morphtile.js"));

  const input = req("r46-form51-receiver", {
    counts: [2, 2, 1],
    step: [1.5, 2, 0],
    part: {
      shape: "box",
      pos: [1, 2, 3],
      size: [1, 1.5, 0.5],
      rot: [5, 10, 15]
    },
    rot_step: {
      x: [0, 20, 0],
      y: [10, 0, -5]
    },
    size_step: {
      y: [0, 0.25, 0]
    }
  });

  const baseOut = stableRun(Base, input, "Form base receiver");
  const headOut = stableRun(Head, input, "Form 51 receiver");
  assert.equal(baseOut.status, "CANDIDATE");
  assert.equal(headOut.status, "CANDIDATE");
  assert.deepEqual(leafOf(headOut.candidate).rot, leafOf(baseOut.candidate).rot);

  const baseTile = MT.createTile(baseOut.candidate);
  const headTile = MT.createTile(headOut.candidate);
  const baseValidity = MT.validateTile(baseTile);
  const headValidity = MT.validateTile(headTile);
  assert.equal(baseValidity.ok, true, baseValidity.errors.join(", "));
  assert.equal(headValidity.ok, true, headValidity.errors.join(", "));

  const baseMesh = MT.compileMesh(baseTile, MT.createWorld("r46-form-base"));
  const headMesh = MT.compileMesh(headTile, MT.createWorld("r46-form-head"));
  assert.equal(baseMesh.hold, null, JSON.stringify(baseMesh));
  assert.equal(headMesh.hold, null, JSON.stringify(headMesh));
  assert.equal(headMesh.recipe_parts, 4);
  assert.equal(headMesh.recipe_parts, baseMesh.recipe_parts);
  assert.deepEqual(headMesh.P, baseMesh.P, "receiver geometry changed across Form-private rotation-state convergence");
  assert.equal(headMesh.P.every(Number.isFinite), true, "receiver geometry contains non-finite coordinates");
});
