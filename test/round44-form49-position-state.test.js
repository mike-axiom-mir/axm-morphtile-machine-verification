"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "416326bcafec510dc16cd3712677461d45ca8b6c";
const FORM49 = "a2dc5158c015c8c75f679ea0261965f1e39c2537";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = !!process.env.R44_FORM_BASE_ROOT && !!process.env.R44_FORM49_ROOT && !!process.env.R44_MORPHTILE_ROOT;

function req(id, grid) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify Form 49 grid position convergence",
    intent: { grid },
    provenance: { caller: "verification-round44" }
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

test("Form 49 exact head centralizes copied active-axis position state without changing public output", { skip: !enabled }, () => {
  assert.equal(process.env.R44_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R44_FORM49_COMMIT, FORM49);
  assert.equal(process.env.R44_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R44_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R44_FORM49_ROOT, "src"));
  const State = require(path.join(process.env.R44_FORM49_ROOT, "src/grid-position-state"));

  const grid = {
    counts: [3, 1, 2],
    step: [2, 99, -1],
    part: { shape: "box", pos: [10, -2, 3] }
  };
  const state = State.positionStateFromGrid(grid);
  assert.deepEqual(state, {
    base: [10, -2, 3],
    step: [2, 99, -1],
    deltas: [[2, 0, 0], null, [0, 0, -1]]
  });
  assert.notStrictEqual(state.base, grid.part.pos, "base position aliases caller state");
  assert.notStrictEqual(state.step, grid.step, "step aliases caller state");
  state.base[0] = -999;
  state.step[0] = -999;
  assert.deepEqual(grid.part.pos, [10, -2, 3]);
  assert.deepEqual(grid.step, [2, 99, -1]);
  assert.deepEqual(State.generatedPositionFromGrid(grid, [2, 0, 1]), [14, -2, 2]);
  assert.deepEqual(State.positionExpressionStateFromGrid(grid), [
    ["+", 10, ["*", ["var", "gx"], 2]],
    -2,
    ["+", 3, ["*", ["var", "gz"], -1]]
  ]);

  const input = req("r44-grid-base", grid);
  const baseOut = stableRun(Base, input, "base grid");
  const headOut = stableRun(Head, input, "head grid");
  assert.deepEqual(headOut, baseOut, "public base-grid output changed across private representation convergence");
});

test("Form 49 preserves progression-bearing output and finite-domain HOLD ownership", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R44_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R44_FORM49_ROOT, "src"));

  const progression = req("r44-grid-rotation", {
    counts: [2, 1, 2],
    step: [1.5, 0, -2],
    part: { shape: "wedge", pos: [4, 5, 6], rot: [0, 0, 0] },
    rot_step: { x: [0, 15, 0] }
  });
  assert.deepEqual(stableRun(Head, progression, "head progression"), stableRun(Base, progression, "base progression"),
    "progression-bearing public output drifted");

  const overflow = req("r44-grid-overflow", {
    counts: [2, 1, 1],
    step: [Number.MAX_VALUE, 0, 0],
    part: { shape: "box", pos: [Number.MAX_VALUE, 0, 0] }
  });
  const baseHold = stableRun(Base, overflow, "base overflow");
  const headHold = stableRun(Head, overflow, "head overflow");
  assert.deepEqual(headHold, baseHold, "finite-domain HOLD semantics moved during representation convergence");
  assert.equal(headHold.status, "HOLD");
  assert.equal(headHold.holds[0].code, "HOLD_FORM_GRID_INVALID");
});

test("Form 49 receiver-visible geometry remains finite and predecessor-equivalent", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R44_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R44_FORM49_ROOT, "src"));
  const MT = require(path.join(process.env.R44_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = req("r44-grid-receiver", {
    counts: [2, 1, 3],
    step: [0.5, 77, -1],
    part: { shape: "box", pos: [10, -2, 3], size: [1, 2, 0.5] }
  });
  const baseOut = Base.run(input);
  const headOut = Head.run(input);
  assert.equal(baseOut.status, "CANDIDATE");
  assert.equal(headOut.status, "CANDIDATE");
  assert.deepEqual(leafOf(headOut.candidate).pos, leafOf(baseOut.candidate).pos);

  const baseMesh = MT.compileMesh(baseOut.candidate, MT.createWorld("r44-base"));
  const headMesh = MT.compileMesh(headOut.candidate, MT.createWorld("r44-head"));
  assert.equal(baseMesh.hold, null, JSON.stringify(baseMesh));
  assert.equal(headMesh.hold, null, JSON.stringify(headMesh));
  assert.equal(headMesh.recipe_parts, baseMesh.recipe_parts);
  assert.deepEqual(headMesh.P, baseMesh.P, "receiver geometry changed across Form-private convergence");
  assert.equal(headMesh.P.every(Number.isFinite), true, "receiver geometry contains non-finite coordinates");
});
