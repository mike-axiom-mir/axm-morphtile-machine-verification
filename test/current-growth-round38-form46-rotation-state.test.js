"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "cfd9c39130d639e5eae634ecfb8a7c6bbdf8b7c3";
const FORM46 = "0e5a8e1fa0e61aa4d4747378e589a11be8939cf4";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R38_FORM_BASE_ROOT && !!process.env.R38_FORM46_ROOT && !!process.env.R38_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify repeat rotation state convergence",
    provenance: { verifier: "round38" },
    intent
  };
}

function equivalentRun(Base, Head, input, label) {
  const expected = Base.run(clone(input));
  const owned = clone(input);
  const before = JSON.stringify(owned);
  const first = Head.run(owned);
  const replay = Head.run(owned);
  assert.deepEqual(first, expected, `${label}: public result drifted from integrated predecessor`);
  assert.deepEqual(replay, first, `${label}: replay changed`);
  assert.equal(JSON.stringify(owned), before, `${label}: caller input mutated`);
  return first;
}

test("Form #46 exact head centralizes rotation state without public drift and survives real runtime execution", { skip: !enabled }, () => {
  assert.equal(process.env.R38_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R38_FORM46_COMMIT, FORM46);
  assert.equal(process.env.R38_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R38_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R38_FORM46_ROOT, "src"));
  const helper = require(path.join(process.env.R38_FORM46_ROOT, "src", "repeat-rotation-state.js"));
  const MT = require(path.join(process.env.R38_MORPHTILE_ROOT, "core", "morphtile.js"));

  const authored = {
    count: 4,
    step: [0.2, 0.4, 0],
    rot_step: [-0.25, 0.5, 0.125],
    part: { shape: "box", size: [1, 0.2, 0.4], pos: [1, 0, 0], rot: [1, -2, 0.5] }
  };
  const authoredBefore = JSON.stringify(authored);
  assert.deepEqual(helper.rotationStateFromRepeat(authored), {
    base: [1, -2, 0.5],
    delta: [-0.25, 0.5, 0.125]
  });
  assert.deepEqual(helper.generatedRotationFromRepeat(authored, 3), [0.25, -0.5, 0.875]);
  const state = helper.rotationStateFromRepeat(authored);
  state.base[0] = 999;
  state.delta[0] = 999;
  assert.equal(JSON.stringify(authored), authoredBefore, "helper leaked caller-owned vectors");
  assert.deepEqual(helper.rotationStateFromRepeat(authored).base, [1, -2, 0.5]);

  const instance = { count: 3, step: [0, 1, 0], instance: { use: "panel" } };
  assert.deepEqual(helper.rotationStateFromRepeat(instance), { base: [0, 0, 0], delta: [0, 0, 0] });
  assert.deepEqual(helper.generatedRotationFromRepeat(instance, 9), [0, 0, 0]);

  const malformed = {
    count: 3,
    step: [0, 1, 0],
    rot_step: [0.5, 0],
    part: { shape: "box", rot: [1, 2] }
  };
  assert.deepEqual(helper.rotationStateFromRepeat(malformed), { base: [0, 0, 0], delta: [0, 0, 0] }, "helper must stay validation-neutral");

  const valid = request("r38-valid", { name: "turning stair", repeat: authored });
  const out = equivalentRun(Base, Head, valid, "primitive rotation progression");
  assert.equal(out.status, "CANDIDATE");
  assert.deepEqual(out.candidate.facets.mesh.data.parts[0].body[0].rot, [
    ["+", 1, ["*", ["var", "i"], -0.25]],
    ["+", -2, ["*", ["var", "i"], 0.5]],
    ["+", 0.5, ["*", ["var", "i"], 0.125]]
  ]);

  const combined = request("r38-combined", {
    repeat: {
      count: 3,
      step: [0, 1, 0],
      rot_step: [0, 0.2, 0],
      with_step: { width: 0.5 },
      instance: { use: "panel", with: { width: 1 }, rot: [0, 0.1, 0] }
    }
  });
  const combinedOut = equivalentRun(Base, Head, combined, "rotation plus integrated setting progression");
  assert.equal(combinedOut.status, "CANDIDATE");
  const combinedTarget = combinedOut.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(combinedTarget.rot, [0, ["+", 0.1, ["*", ["var", "i"], 0.2]], 0]);
  assert.deepEqual(combinedTarget.with, { width: ["+", 1, ["*", ["var", "i"], 0.5]] });

  for (const [id, repeat] of [
    ["malformed-step", { count: 3, step: [0,1,0], rot_step: [0,1], part: { shape: "box" } }],
    ["noop", { count: 3, step: [0,1,0], rot_step: [0,0,0], part: { shape: "box" } }],
    ["overflow", { count: 2, step: [0,1,0], rot_step: [Number.MAX_VALUE,0,0], part: { shape: "box", rot: [Number.MAX_VALUE,0,0] } }]
  ]) {
    const held = equivalentRun(Base, Head, request(`r38-${id}`, { repeat }), id);
    assert.equal(held.status, "HOLD");
    assert.equal(held.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  }

  const unknown = equivalentRun(Base, Head, request("r38-unknown", {
    repeat: { count: 3, step: [0,1,0], rot_step: [0,0.25,0], invented: true, part: { shape: "box" } }
  }), "unknown field");
  assert.equal(unknown.status, "HOLD");
  assert.equal(unknown.holds[0].code, "HOLD_FORM_PARAMETER_UNKNOWN");

  const tile = MT.createTile(out.candidate);
  assert.equal(MT.validateTile(tile).ok, true);
  const first = MT.compileMesh(tile);
  const replay = MT.compileMesh(tile);
  assert.deepEqual(replay, first, "runtime replay drifted");
  assert.equal(first.hold, null);
  assert.equal(first.recipe_parts, 4);
  assert.ok(first.P.every(Number.isFinite));

  const straightOut = Head.run(request("r38-straight", {
    repeat: { count: 4, step: [0.2, 0.4, 0], part: { shape: "box", size: [1, 0.2, 0.4], pos: [1, 0, 0], rot: [1, -2, 0.5] } }
  }));
  assert.equal(straightOut.status, "CANDIDATE");
  const straight = MT.compileMesh(MT.createTile(straightOut.candidate));
  assert.equal(straight.hold, null);
  assert.notDeepEqual(first.P, straight.P, "generated rotation progression must affect receiver geometry");
});
