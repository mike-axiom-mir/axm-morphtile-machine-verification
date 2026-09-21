"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR26 = "820434a03ba0a5733a68caa585f90a1385c74d77";
const SURFACE_PR25 = "d0e1c316f18ca24f681ceb1c6cde7cd6c9a2078b";
const INTERFACE_PR21 = "0d3778f73432eb045d90021b02b6ffef0e1fe970";
const ASSEMBLY_PR27 = "937b32697ab97a8be8b7fe28185db8bb92ace111";

function request(id, intent, goal = "independent Verification Machine round 14 replay") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstHold(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0];
  if (value && value.hold && typeof value.hold === "object") return value.hold;
  return value || null;
}

function leafOf(candidate) {
  let node = candidate.facets.mesh.data.parts[0];
  while (node && Number.isInteger(node.repeat) && Array.isArray(node.body)) node = node.body[0];
  return node;
}

function commitOperations(MT, ws, output, label) {
  const candidate = MT.cloneBody(ws, "verification", label);
  const operations = output.candidate.operations || [output.candidate.operation];
  for (const operation of operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

const hasForm = !!process.env.R14_FORM_ROOT && !!process.env.R14_CORE_PATH;
test("Form PR #26: vector definition-scale progression survives a three-axis receiver proof and rejects a zero-scale corner before emission", { skip: !hasForm }, () => {
  assert.equal(process.env.R14_FORM_COMMIT, FORM_PR26);
  assert.equal(process.env.R14_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R14_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R14_CORE_PATH));

  const authored = request("r14-form-vector-grid-scale", {
    grid: {
      counts: [2, 2, 2],
      step: [0, 0, 0],
      scale_step: {
        x: [0.2, 0, 0],
        y: [0, -0.1, 0],
        z: [0, 0, 0.15]
      },
      rot_step: { z: [0, 0.05, 0] },
      instance: { use: "panel", pos: [2, -1, 3], rot: [0.1, 0.2, 0.3] }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "three-axis vector scale progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller-owned authored matter");

  const leaf = leafOf(first.candidate);
  assert.deepEqual(leaf.pos, [2, -1, 3], "validation-only movement must not escape into zero-translation authored output");
  assert.deepEqual(leaf.scale, [
    ["+", 1, ["*", ["var", "gx"], 0.2]],
    ["+", 1, ["*", ["var", "gy"], -0.1]],
    ["+", 1, ["*", ["var", "gz"], 0.15]]
  ]);

  const world = MT.createWorld("Verification round 14 Form scale proof");
  world.defs = {
    panel: {
      id: "panel",
      name: "Panel",
      body: { facets: { mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 2, 1] } } } }
    }
  };
  const tile = MT.createTile(first.candidate);
  world.tiles[tile.id] = tile;
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MT.compileMesh(tile, world);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 8);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixedCandidate = clone(first.candidate);
  leafOf(fixedCandidate).scale = [1, 1, 1];
  const fixedTile = MT.createTile(fixedCandidate);
  world.tiles[fixedTile.id] = fixedTile;
  const fixed = MT.compileMesh(fixedTile, world);
  assert.equal(fixed.hold, null, JSON.stringify(fixed));
  assert.notDeepEqual(compiled.P, fixed.P, "real MorphTile must consume all three emitted vector-scale axes");

  const zeroCorner = Form.run(request("r14-form-vector-grid-scale-zero-corner", {
    grid: {
      counts: [2, 1, 1],
      step: [0, 0, 0],
      scale_step: { x: [-1, 0, 0] },
      instance: { use: "panel" }
    }
  }));
  assert.equal(zeroCorner.status, "HOLD");
  assert.equal(firstHold(zeroCorner).code, "HOLD_FORM_GRID_INVALID");
  assert.equal(zeroCorner.candidate, null, "non-positive generated vector scale must be rejected before candidate emission");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-definition-scale-round14/v0.1",
    target_commit: FORM_PR26,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "vector-unit-default-preserved",
      "three-axis-scale-expression-identity",
      "deterministic-source-preserving-replay",
      "eight-cell-finite-real-receiver-expansion",
      "receiver-consumes-vector-scale-progression",
      "zero-scale-vector-corner-rejected-before-emission"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function captureSurfaceBoundary(Surface, value) {
  let error = null;
  assert.throws(() => Surface.run(value), (caught) => {
    error = caught;
    assert.equal(caught && caught.code, "HOLD_SURFACE_REQUEST_NONPORTABLE_VALUE");
    return true;
  });
  return error;
}

const hasSurface = !!process.env.R14_SURFACE_ROOT;
test("Surface PR #25: exact request grammar is deterministic across key order, preserves known-field presence, and still accepts a null-prototype v0.1 envelope", { skip: !hasSurface }, () => {
  assert.equal(process.env.R14_SURFACE_COMMIT, SURFACE_PR25);
  const Surface = require(path.join(process.env.R14_SURFACE_ROOT, "src"));
  const fixture = require(path.join(process.env.R14_SURFACE_ROOT, "fixtures", "request.facing-up.json"));

  const hiddenKnown = clone(fixture);
  const originalGoal = hiddenKnown.goal;
  Object.defineProperty(hiddenKnown, "goal", {
    value: originalGoal,
    enumerable: false,
    configurable: true,
    writable: true
  });
  const hiddenError = captureSurfaceBoundary(Surface, hiddenKnown);
  assert.match(hiddenError.message, /request\.goal is non-enumerable/);
  const hiddenDescriptor = Object.getOwnPropertyDescriptor(hiddenKnown, "goal");
  assert.equal(hiddenDescriptor.value, originalGoal);
  assert.equal(hiddenDescriptor.enumerable, false, "Surface must not rewrite caller-owned descriptor presence");

  const one = clone(fixture);
  one.zeta_extension = "z";
  one.alpha_extension = "a";
  const two = clone(fixture);
  two.alpha_extension = "a";
  two.zeta_extension = "z";
  const errorOne = captureSurfaceBoundary(Surface, one);
  const errorTwo = captureSurfaceBoundary(Surface, two);
  assert.equal(errorOne.message, errorTwo.message, "unsupported-own-key selection must not depend on insertion order");
  assert.match(errorOne.message, /request\.alpha_extension is not part of the v0\.1 request-envelope grammar/);

  const nullProto = Object.assign(Object.create(null), clone(fixture));
  const before = JSON.stringify(nullProto);
  const first = Surface.run(nullProto);
  const second = Surface.run(nullProto);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "valid null-prototype request envelopes must replay deterministically");
  assert.equal(JSON.stringify(nullProto), before, "Surface must not mutate a valid caller-owned null-prototype envelope");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-request-own-keys-round14/v0.1",
    target_commit: SURFACE_PR25,
    status: "PASS",
    checked: [
      "known-hidden-field-does-not-collapse-to-omission",
      "unsupported-own-key-selection-is-lexically-deterministic",
      "caller-descriptors-preserved",
      "null-prototype-exact-envelope-remains-valid",
      "deterministic-source-preserving-control"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

const hasInterface = !!process.env.R14_INTERFACE_ROOT && !!process.env.R14_CORE_PATH;
test("Interface PR #21: strict above-threshold semantics are receiver-real at equality and signed-zero threshold transport fails closed", { skip: !hasInterface }, () => {
  assert.equal(process.env.R14_INTERFACE_COMMIT, INTERFACE_PR21);
  assert.equal(process.env.R14_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R14_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R14_CORE_PATH));

  const authored = request("r14-interface-strict-above", {
    tile_path: "mt_tower",
    title: "Strict threshold proof",
    elements: [{
      kind: "when",
      binding: "beacon",
      comparison: "above",
      threshold: 0,
      children: [
        { kind: "text", text: "Beacon strictly above zero" },
        { kind: "action", binding: "toggle", label: "Toggle" }
      ]
    }],
    bindings: { readouts: ["beacon"], actions: ["toggle"] }
  });
  const beforeRequest = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "threshold authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeRequest, "Interface must not mutate caller-owned threshold intent");
  assert.deepEqual(first.candidate.operation.view.body[0].when, [">", ["var", "beacon"], 0]);
  assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"]);
  assert.deepEqual(first.dependencies[0].requires.action_input_signal_socket_ids, ["toggle"]);

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeWorld = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "verification:round14-interface-threshold");
  const committedHash = MT.structHash(ws.live);
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
  const equalHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.doesNotMatch(equalHtml, /Beacon strictly above zero/, "strict > must remain hidden when canonical state equals the threshold");
  assert.equal(MT.structHash(ws.live), committedHash, "threshold rendering must be read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
  const aboveHtml = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(aboveHtml, /Beacon strictly above zero/);
  assert.match(aboveHtml, /data-signal="mt_tower:toggle"/);
  assert.equal(MT.structHash(ws.live), committedHash, "visible threshold rendering must remain read-only");

  MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeWorld, "rollback must restore exact pre-commit structural identity");

  const signedZero = request("r14-interface-threshold-negative-zero", {
    tile_path: "mt_tower",
    elements: [{
      kind: "when",
      binding: "beacon",
      comparison: "above",
      threshold: -0,
      children: [{ kind: "text", text: "never transported as rewritten zero" }]
    }],
    bindings: { readouts: ["beacon"] }
  });
  const signedZeroOut = Interface.run(signedZero);
  assert.equal(signedZeroOut.status, "HOLD");
  assert.equal(firstHold(signedZeroOut).code, "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE");
  assert.equal(signedZeroOut.candidate, null);
  assert.equal(Object.is(signedZero.intent.elements[0].threshold, -0), true, "caller-owned signed zero must remain unchanged");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-threshold-round14/v0.1",
    target_commit: INTERFACE_PR21,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "strict-above-operator-identity",
      "equality-boundary-hidden",
      "canonical-state-transition-controls-visibility",
      "target-proof-retained",
      "render-read-only",
      "exact-rollback",
      "signed-zero-threshold-rejected-before-transport"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

const hasAssembly = !!process.env.R14_ASSEMBLY_ROOT;
test("Assembly PR #27: exact request grammar remains deterministic and nested intent reflection cannot outrun Proxy/own-key safety", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R14_ASSEMBLY_COMMIT, ASSEMBLY_PR27);
  const Assembly = require(path.join(process.env.R14_ASSEMBLY_ROOT, "src"));
  const base = require(path.join(process.env.R14_ASSEMBLY_ROOT, "fixtures", "request.assembly.json"));

  const one = clone(base);
  one.request_id = "r14-assembly-unknown-order";
  one.zeta_extension = "z";
  one.alpha_extension = "a";
  const two = clone(base);
  two.request_id = "r14-assembly-unknown-order";
  two.alpha_extension = "a";
  two.zeta_extension = "z";
  const outOne = Assembly.run(one);
  const outTwo = Assembly.run(two);
  assert.equal(outOne.status, "HOLD");
  assert.deepEqual(outOne, outTwo, "unsupported request-key HOLD selection must be deterministic across insertion order");
  assert.deepEqual(firstHold(outOne), {
    code: "HOLD_REQUEST_FIELD_UNSUPPORTED",
    path: "request.alpha_extension",
    detail: "Assembly v0.1 request grammar does not define this authored field."
  });

  const symbolIntent = clone(base);
  symbolIntent.request_id = "r14-assembly-symbol-intent";
  const symbol = Symbol("future-intent-authority");
  symbolIntent.intent[symbol] = "nearest";
  const symbolOut = Assembly.run(symbolIntent);
  assert.equal(symbolOut.status, "HOLD");
  assert.deepEqual(firstHold(symbolOut), {
    code: "HOLD_REQUEST_INTENT_FIELD_UNSUPPORTED",
    path: "request.intent",
    detail: "Assembly v0.1 request.intent grammar does not define symbol-keyed authored fields."
  });
  assert.equal(symbolIntent.intent[symbol], "nearest", "Assembly must not rewrite caller-owned symbol data");

  const revokedIntent = clone(base);
  revokedIntent.request_id = "r14-assembly-revoked-intent";
  const pair = Proxy.revocable(clone(base.intent), {});
  revokedIntent.intent = pair.proxy;
  pair.revoke();
  let revokedOut;
  assert.doesNotThrow(() => { revokedOut = Assembly.run(revokedIntent); }, "Proxy rejection must precede exact-own-key reflection on nested request.intent");
  assert.equal(revokedOut.status, "HOLD");
  assert.equal(firstHold(revokedOut).code, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  assert.equal(firstHold(revokedOut).path, "request.intent");

  const control = clone(base);
  control.request_id = "r14-assembly-exact-control";
  control.intent.id = "proof_tile";
  control.intent.tile_path = "proof_tile";
  control.dependencies = [];
  control.world_requirements = null;
  const before = JSON.stringify(control);
  const first = Assembly.run(control);
  const second = Assembly.run(control);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "exact v0.1 request control must replay deterministically");
  assert.equal(JSON.stringify(control), before, "Assembly must not mutate exact caller-owned request data");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-request-own-keys-round14/v0.1",
    target_commit: ASSEMBLY_PR27,
    status: "PASS",
    checked: [
      "unsupported-request-key-selection-is-lexically-deterministic",
      "nested-intent-symbol-key-held",
      "nested-revoked-proxy-rejected-before-reflection",
      "exact-v01-control-remains-candidate",
      "deterministic-source-preserving-control"
    ],
    visual_quality: "NOT_APPLICABLE",
    placement: "ASSEMBLY_MACHINE"
  }));
});
