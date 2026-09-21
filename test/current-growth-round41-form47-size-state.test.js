"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "e551c53f642ceaa77c89dcd5b907c95fd59463dc";
const FORM47 = "fbc3d990f4c5ec1698b69d41801f567bd3efaa27";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R41_FORM_BASE_ROOT && !!process.env.R41_FORM47_ROOT && !!process.env.R41_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(requestId, intent) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify repeat size generated-state convergence",
    provenance: { verifier: "round41" },
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

test("Form #47 exact head centralizes repeat size state without moving validation authority or receiver behavior", { skip: !enabled }, () => {
  assert.equal(process.env.R41_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R41_FORM47_COMMIT, FORM47);
  assert.equal(process.env.R41_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R41_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R41_FORM47_ROOT, "src"));
  const helper = require(path.join(process.env.R41_FORM47_ROOT, "src", "repeat-size-state.js"));
  const MT = require(path.join(process.env.R41_MORPHTILE_ROOT, "core", "morphtile.js"));

  const authored = {
    count: 4,
    step: [0, 1.2, 0],
    size_step: [0.25, -0.1, 0.5],
    part: { shape: "box", size: [1, 2, 3], pos: [0.5, 0, 0] }
  };
  const authoredBefore = JSON.stringify(authored);
  assert.deepEqual(helper.sizeStateFromRepeat(authored), {
    base: [1, 2, 3],
    delta: [0.25, -0.1, 0.5]
  });
  assert.deepEqual(helper.generatedSizeFromRepeat(authored, 2), [1.5, 1.8, 4]);
  const state = helper.sizeStateFromRepeat(authored);
  state.base[0] = 999;
  state.delta[0] = 999;
  assert.equal(JSON.stringify(authored), authoredBefore, "helper leaked caller-owned vectors");
  assert.deepEqual(helper.sizeStateFromRepeat(authored), {
    base: [1, 2, 3],
    delta: [0.25, -0.1, 0.5]
  });

  const implicit = { count: 3, step: [1, 0, 0], part: { shape: "plane" } };
  assert.deepEqual(helper.sizeStateFromRepeat(implicit), { base: [1, 1, 1], delta: [0, 0, 0] });
  assert.deepEqual(helper.generatedSizeFromRepeat(implicit, 9), [1, 1, 1]);

  const malformedHelper = {
    count: 3,
    step: [1, 0, 0],
    size_step: [0.5, 0],
    part: { shape: "box", size: [1, 2] }
  };
  assert.deepEqual(helper.sizeStateFromRepeat(malformedHelper), { base: [1, 1, 1], delta: [0, 0, 0] }, "helper must remain validation-neutral");

  const valid = request("r41-valid", { repeat: authored });
  const out = equivalentRun(Base, Head, valid, "primitive size progression");
  assert.equal(out.status, "CANDIDATE");
  assert.deepEqual(out.candidate.facets.mesh.data.parts[0].body[0].size, [
    ["+", 1, ["*", ["var", "i"], 0.25]],
    ["+", 2, ["*", ["var", "i"], -0.1]],
    ["+", 3, ["*", ["var", "i"], 0.5]]
  ]);

  const combined = request("r41-combined", {
    repeat: {
      count: 3,
      step: [0.5, 0, 0],
      size_step: [0.2, 0, 0],
      rot_step: [0, 0.3, 0],
      part: { shape: "box", size: [1, 1, 1], rot: [0, 0.1, 0] }
    }
  });
  const combinedOut = equivalentRun(Base, Head, combined, "size plus integrated rotation progression");
  assert.equal(combinedOut.status, "CANDIDATE");
  const combinedTarget = combinedOut.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(combinedTarget.size[0], ["+", 1, ["*", ["var", "i"], 0.2]]);
  assert.deepEqual(combinedTarget.rot[1], ["+", 0.1, ["*", ["var", "i"], 0.3]]);

  for (const [id, repeat] of [
    ["malformed-step", { count: 3, step: [1,0,0], size_step: [0.2,0], part: { shape: "box" } }],
    ["malformed-base", { count: 3, step: [1,0,0], size_step: [0.2,0,0], part: { shape: "box", size: [1,1] } }],
    ["noop", { count: 3, step: [1,0,0], size_step: [0,0,0], part: { shape: "box" } }],
    ["nonpositive", { count: 3, step: [1,0,0], size_step: [-0.6,0,0], part: { shape: "box", size: [1,1,1] } }],
    ["overflow", { count: 2, step: [1,0,0], size_step: [Number.MAX_VALUE,0,0], part: { shape: "box", size: [Number.MAX_VALUE,1,1] } }]
  ]) {
    const held = equivalentRun(Base, Head, request(`r41-${id}`, { repeat }), id);
    assert.equal(held.status, "HOLD", id);
    assert.equal(held.holds[0].code, "HOLD_FORM_REPEAT_INVALID", id);
  }

  const collision = equivalentRun(Base, Head, request("r41-size-collision", {
    repeat: {
      count: 2,
      step: [0, 0, 0],
      size_step: [Number.EPSILON / 4, 0, 0],
      part: { shape: "box", size: [1, 1, 1] }
    }
  }), "floating-point complete-state collision");
  assert.equal(collision.status, "HOLD");
  assert.equal(collision.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  assert.match(collision.holds[0].detail, /duplicate authored state/);

  const tile = MT.createTile(out.candidate);
  assert.equal(MT.validateTile(tile).ok, true);
  const growing = MT.compileMesh(tile);
  const replay = MT.compileMesh(tile);
  assert.deepEqual(replay, growing, "runtime replay drifted");
  assert.equal(growing.hold, null);
  assert.equal(growing.recipe_parts, 4);
  assert.ok(growing.P.every(Number.isFinite));

  const fixedOut = Head.run(request("r41-fixed", {
    repeat: {
      count: 4,
      step: [0, 1.2, 0],
      part: { shape: "box", size: [1, 2, 3], pos: [0.5, 0, 0] }
    }
  }));
  assert.equal(fixedOut.status, "CANDIDATE");
  const fixed = MT.compileMesh(MT.createTile(fixedOut.candidate));
  assert.equal(fixed.hold, null);
  assert.notDeepEqual(growing.P, fixed.P, "size progression must remain receiver-visible geometry");
});
