"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "cd72aba99ef8372290b36c17109aae14c308fecf";
const FORM50 = "d4276ee57ec4e991c2ab916d78343882d9ae53a9";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = Boolean(process.env.R45_FORM_BASE_ROOT && process.env.R45_FORM50_ROOT && process.env.R45_MORPHTILE_ROOT);

function req(id, grid) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify Form 50 grid owner position convergence",
    intent: { grid },
    provenance: { caller: "verification-round45" }
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

function loadVocabularyWithProbe(root) {
  const helperPath = require.resolve(path.join(root, "src/grid-position-state"));
  const vocabularyPath = require.resolve(path.join(root, "src/form-vocabulary"));
  const helper = require(helperPath);
  const calls = { state: 0, expression: 0 };
  require.cache[helperPath].exports = {
    ...helper,
    positionState(...args) {
      calls.state += 1;
      return helper.positionState(...args);
    },
    positionExpressionState(...args) {
      calls.expression += 1;
      return helper.positionExpressionState(...args);
    }
  };
  delete require.cache[vocabularyPath];
  return {
    vocabulary: require(vocabularyPath),
    calls,
    restore() {
      delete require.cache[vocabularyPath];
      require.cache[helperPath].exports = helper;
    }
  };
}

test("Form 50 exact head makes the semantic grid owner consume shared position state", { skip: !enabled }, () => {
  assert.equal(process.env.R45_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R45_FORM50_COMMIT, FORM50);
  assert.equal(process.env.R45_MORPHTILE_COMMIT, MORPHTILE);

  const State = require(path.join(process.env.R45_FORM50_ROOT, "src/grid-position-state"));
  const target = { shape: "box", pos: [10, -2, 3] };
  const step = [0.5, 99, -1];
  const counts = [2, 1, 3];
  const state = State.positionState(target, step, counts);
  assert.deepEqual(state, {
    base: [10, -2, 3],
    step: [0.5, 99, -1],
    deltas: [[0.5, 0, 0], null, [0, 0, -1]]
  });
  assert.notStrictEqual(state.base, target.pos, "shared base aliases authored target state");
  assert.notStrictEqual(state.step, step, "shared step aliases authored step state");
  state.base[0] = -999;
  state.step[0] = -999;
  assert.deepEqual(target.pos, [10, -2, 3]);
  assert.deepEqual(step, [0.5, 99, -1]);

  const probe = loadVocabularyWithProbe(process.env.R45_FORM50_ROOT);
  try {
    const out = probe.vocabulary.normalizeGrid({ counts, step, part: target });
    assert.equal(out.ok, true);
    assert.equal(probe.calls.state, 1, "grid owner did not consume shared position state for finite-domain proof");
    assert.equal(probe.calls.expression, 1, "grid owner did not consume shared position expression state for emission");
    const leaf = (() => {
      let node = out.data;
      while (node && Array.isArray(node.body) && node.body.length === 1) node = node.body[0];
      return node;
    })();
    assert.deepEqual(leaf.pos, [
      ["+", 10, ["*", ["var", "gx"], 0.5]],
      -2,
      ["+", 3, ["*", ["var", "gz"], -1]]
    ]);
  } finally {
    probe.restore();
  }
});

test("Form 50 preserves predecessor-visible output and finite-domain HOLD ownership", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R45_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R45_FORM50_ROOT, "src"));

  const grid = {
    counts: [3, 1, 2],
    step: [0.75, 41, -1.25],
    part: { shape: "wedge", pos: [4, -2, 7], size: [1, 2, 0.5], rot: [0, 0, 0] },
    rot_step: { x: [0, 15, 0] },
    size_step: { z: [0, 0, 0.1] }
  };
  const baseOut = stableRun(Base, req("r45-grid-predecessor", grid), "base grid");
  const headOut = stableRun(Head, req("r45-grid-head", grid), "head grid");
  assert.equal(baseOut.status, "CANDIDATE");
  assert.equal(headOut.status, "CANDIDATE");
  assert.deepEqual(headOut.candidate, baseOut.candidate, "grid owner convergence changed public candidate matter");
  assert.deepEqual(headOut.dependencies, baseOut.dependencies, "grid owner convergence changed dependencies");

  const overflow = req("r45-grid-overflow", {
    counts: [2, 1, 1],
    step: [Number.MAX_VALUE, 0, 0],
    part: { shape: "box", pos: [Number.MAX_VALUE, 0, 0] }
  });
  const baseHold = stableRun(Base, overflow, "base overflow");
  const headHold = stableRun(Head, overflow, "head overflow");
  assert.deepEqual(headHold, baseHold, "finite-domain HOLD semantics moved during owner convergence");
  assert.equal(headHold.status, "HOLD");
  assert.equal(headHold.holds[0].code, "HOLD_FORM_GRID_INVALID");
});

test("Form 50 remains schema-valid and receiver-equivalent through real MorphTile geometry", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R45_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R45_FORM50_ROOT, "src"));
  const MT = require(path.join(process.env.R45_MORPHTILE_ROOT, "core/morphtile.js"));
  const input = req("r45-grid-receiver", {
    counts: [2, 1, 3],
    step: [0.5, 77, -1],
    part: { shape: "box", pos: [10, -2, 3], size: [1, 2, 0.5] }
  });
  const baseOut = stableRun(Base, input, "base receiver");
  const headOut = stableRun(Head, input, "head receiver");
  assert.equal(baseOut.status, "CANDIDATE");
  assert.equal(headOut.status, "CANDIDATE");
  assert.deepEqual(leafOf(headOut.candidate).pos, leafOf(baseOut.candidate).pos);

  const baseTile = MT.createTile(baseOut.candidate);
  const headTile = MT.createTile(headOut.candidate);
  const baseValidity = MT.validateTile(baseTile);
  const headValidity = MT.validateTile(headTile);
  assert.equal(baseValidity.ok, true, baseValidity.errors.join(", "));
  assert.equal(headValidity.ok, true, headValidity.errors.join(", "));

  const baseMesh = MT.compileMesh(baseTile, MT.createWorld("r45-base"));
  const headMesh = MT.compileMesh(headTile, MT.createWorld("r45-head"));
  assert.equal(baseMesh.hold, null, JSON.stringify(baseMesh));
  assert.equal(headMesh.hold, null, JSON.stringify(headMesh));
  assert.equal(headMesh.recipe_parts, 6);
  assert.equal(headMesh.recipe_parts, baseMesh.recipe_parts);
  assert.deepEqual(headMesh.P, baseMesh.P, "receiver geometry changed across Form-private owner convergence");
  assert.equal(headMesh.P.every(Number.isFinite), true, "receiver geometry contains non-finite coordinates");
});
