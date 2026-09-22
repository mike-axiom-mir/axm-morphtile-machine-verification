"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const FORM_BASE = "b2c2202e746baf4d9dc23ec5e328ac9c63f2b695";
const FORM48 = "0c8385b4d6519662b85e961479597ba4bf99c49d";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R42_FORM_BASE_ROOT && !!process.env.R42_FORM48_ROOT && !!process.env.R42_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(requestId, repeat) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify repeat position generated-state convergence",
    provenance: { verifier: "round42" },
    intent: { repeat }
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

test("Form #48 exact head centralizes repeat position state without moving semantic authority", { skip: !enabled }, () => {
  assert.equal(process.env.R42_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R42_FORM48_COMMIT, FORM48);
  assert.equal(process.env.R42_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R42_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R42_FORM48_ROOT, "src"));
  const helper = require(path.join(process.env.R42_FORM48_ROOT, "src", "repeat-position-state.js"));
  const MT = require(path.join(process.env.R42_MORPHTILE_ROOT, "core", "morphtile.js"));

  const authored = {
    count: 4,
    step: [0.5, 0, -1],
    part: { shape: "box", pos: [10, -2, 3], size: [1, 2, 1] }
  };
  const authoredBefore = JSON.stringify(authored);
  assert.deepEqual(helper.positionStateFromRepeat(authored), {
    base: [10, -2, 3],
    delta: [0.5, 0, -1]
  });
  assert.deepEqual(helper.generatedPositionFromRepeat(authored, 3), [11.5, -2, 0]);
  assert.deepEqual(helper.positionExpressionState(authored.part, authored.step), [
    ["+", 10, ["*", ["var", "i"], 0.5]],
    -2,
    ["+", 3, ["*", ["var", "i"], -1]]
  ]);
  const state = helper.positionStateFromRepeat(authored);
  state.base[0] = 999;
  state.delta[0] = 999;
  assert.equal(JSON.stringify(authored), authoredBefore, "helper leaked caller-owned position vectors");
  assert.deepEqual(helper.positionStateFromRepeat(authored), {
    base: [10, -2, 3],
    delta: [0.5, 0, -1]
  });

  assert.deepEqual(helper.positionState(undefined, undefined), {
    base: [0, 0, 0], delta: [0, 0, 0]
  });
  assert.deepEqual(helper.positionStateFromRepeat({ step: [1, 2], part: { pos: [1, Infinity, 3] } }), {
    base: [0, 0, 0], delta: [0, 0, 0]
  }, "helper must remain validation-neutral rather than becoming a hidden validator");

  const valid = request("r42-position-valid", authored);
  const out = equivalentRun(Base, Head, valid, "primitive position progression");
  assert.equal(out.status, "CANDIDATE");
  assert.deepEqual(out.candidate.facets.mesh.data.parts[0].body[0].pos, [
    ["+", 10, ["*", ["var", "i"], 0.5]],
    -2,
    ["+", 3, ["*", ["var", "i"], -1]]
  ]);

  // A zero authored translation can be privately moved for admissibility when another
  // bounded progression distinguishes placements. The returned candidate must restore
  // the exact authored position rather than leak private validation movement.
  const restored = equivalentRun(Base, Head, request("r42-private-restoration", {
    count: 3,
    step: [0, 0, 0],
    rot_step: [0, 0.25, 0],
    part: { shape: "box", pos: [7, 8, 9], rot: [0, 0, 0] }
  }), "private validation movement restoration");
  assert.equal(restored.status, "CANDIDATE");
  assert.deepEqual(restored.candidate.facets.mesh.data.parts[0].body[0].pos, [7, 8, 9],
    "private validation movement escaped into candidate matter");

  for (const [id, repeat] of [
    ["malformed-step", { count: 3, step: [1, 2], part: { shape: "box" } }],
    ["malformed-base", { count: 3, step: [1, 0, 0], part: { shape: "box", pos: [1, Infinity, 3] } }],
    ["zero-only", { count: 3, step: [0, 0, 0], part: { shape: "box" } }],
    ["overflow", { count: 2, step: [Number.MAX_VALUE, 0, 0], part: { shape: "box", pos: [Number.MAX_VALUE, 0, 0] } }]
  ]) {
    const held = equivalentRun(Base, Head, request(`r42-${id}`, repeat), id);
    assert.equal(held.status, "HOLD", `${id}: semantic owner must still fail closed`);
  }

  const collision = equivalentRun(Base, Head, request("r42-position-collision", {
    count: 2,
    step: [Number.EPSILON / 4, 0, 0],
    part: { shape: "box", pos: [1, 0, 0] }
  }), "floating-point complete-state collision");
  assert.equal(collision.status, "HOLD");
  assert.equal(collision.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  assert.match(collision.holds[0].detail, /duplicate authored state/);

  const tile = MT.createTile(out.candidate);
  assert.equal(MT.validateTile(tile).ok, true);
  const moved = MT.compileMesh(tile);
  const movedReplay = MT.compileMesh(tile);
  assert.deepEqual(movedReplay, moved, "receiver replay drifted");
  assert.equal(moved.hold, null);
  assert.equal(moved.recipe_parts, 4);
  assert.ok(moved.P.every(Number.isFinite));

  const fixedOut = Head.run(request("r42-position-fixed", {
    count: 4,
    step: [0, 1, 0],
    part: { shape: "box", pos: [10, -2, 3], size: [1, 2, 1] }
  }));
  assert.equal(fixedOut.status, "CANDIDATE");
  const fixed = MT.compileMesh(MT.createTile(fixedOut.candidate));
  assert.equal(fixed.hold, null);
  assert.notDeepEqual(moved.P, fixed.P, "authored position progression must remain receiver-visible geometry");
});
