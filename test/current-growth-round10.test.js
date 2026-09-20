"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR22 = "cb0bcbb89598cc03c5a5932c5a0bb2d8fd3a2e2b";
const SURFACE_PR20 = "99018ef540857c0bcb5fa0fb4a574159c790aac5";
const INTERFACE_PR17 = "df5b1191aff458e0de33fdfe2c814a68da8d5426";
const ASSEMBLY_PR24 = "e8098842bfa084aec0ed028704f5cb65371965a8";

function request(id, intent, goal = "independent Verification Machine round 10 replay") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal,
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstHoldCode(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0].code || null;
  if (value && value.hold && typeof value.hold === "object") return value.hold.code || null;
  return value && value.code || null;
}

function compileFormCandidate(MT, candidate) {
  const world = MT.createWorld("Round 10 Form receiver");
  world.defs.panel = {
    id: "panel",
    name: "Panel",
    body: {
      facets: {
        mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } },
        material: { type: "primitive", source: null, data: { color: [0.6, 0.6, 0.8] } }
      }
    }
  };
  const tile = MT.createTile(candidate);
  world.tiles[tile.id] = tile;
  return MT.compileMesh(tile, world);
}

const hasForm = !!process.env.R10_FORM_ROOT && !!process.env.R10_CORE_PATH;
test("Form PR #22: vector definition scale progression keeps exact per-axis meaning and fails closed across the generated domain", { skip: !hasForm }, () => {
  assert.equal(process.env.R10_FORM_COMMIT, FORM_PR22);
  assert.equal(process.env.R10_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R10_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R10_CORE_PATH));

  const authored = request("r10-form-vector-scale", {
    repeat: {
      count: 3,
      step: [3, 0, 0],
      scale_step: [0.5, -0.25, 0],
      instance: { use: "panel", scale: [1, 2, 3] }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.deepEqual(first, second, "vector scale progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));

  const body = first.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(body.scale, [
    ["+", 1, ["*", ["var", "i"], 0.5]],
    ["+", 2, ["*", ["var", "i"], -0.25]],
    3
  ]);

  const mesh = compileFormCandidate(MT, first.candidate);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.length > 0);
  assert.ok(mesh.P.every(Number.isFinite));

  const fixed = Form.run(request("r10-form-vector-fixed", {
    repeat: {
      count: 3,
      step: [3, 0, 0],
      instance: { use: "panel", scale: [1, 2, 3] }
    }
  }));
  assert.equal(fixed.status, "CANDIDATE", JSON.stringify(fixed.holds));
  const fixedMesh = compileFormCandidate(MT, fixed.candidate);
  assert.equal(fixedMesh.hold, null, JSON.stringify(fixedMesh));
  assert.notDeepEqual(mesh.P, fixedMesh.P, "per-axis scale progression must change real receiver geometry");

  const scalarBaseVectorStep = Form.run(request("r10-form-vector-step-scalar-base", {
    repeat: { count: 2, step: [1, 0, 0], scale_step: [0.1, 0, 0], instance: { use: "panel", scale: 1 } }
  }));
  assert.equal(scalarBaseVectorStep.status, "HOLD");
  assert.equal(firstHoldCode(scalarBaseVectorStep), "HOLD_FORM_REPEAT_INVALID");
  assert.equal(scalarBaseVectorStep.candidate, null);

  const vectorBaseScalarStep = Form.run(request("r10-form-scalar-step-vector-base", {
    repeat: { count: 2, step: [1, 0, 0], scale_step: 0.1, instance: { use: "panel", scale: [1, 1, 1] } }
  }));
  assert.equal(vectorBaseScalarStep.status, "HOLD");
  assert.equal(firstHoldCode(vectorBaseScalarStep), "HOLD_FORM_REPEAT_INVALID");
  assert.equal(vectorBaseScalarStep.candidate, null);

  const nonPositive = Form.run(request("r10-form-vector-domain-nonpositive", {
    repeat: { count: 3, step: [1, 0, 0], scale_step: [0, -0.6, 0], instance: { use: "panel", scale: [1, 1, 1] } }
  }));
  assert.equal(nonPositive.status, "HOLD");
  assert.equal(firstHoldCode(nonPositive), "HOLD_FORM_REPEAT_INVALID");
  assert.match(nonPositive.holds[0].detail, /axis 1.*index 2/i);
  assert.equal(nonPositive.candidate, null);

  const halfMax = Number.MAX_VALUE / 2;
  const overflow = Form.run(request("r10-form-vector-domain-overflow", {
    repeat: { count: 3, step: [1, 0, 0], scale_step: [halfMax, 0, 0], instance: { use: "panel", scale: [halfMax, 1, 1] } }
  }));
  assert.equal(overflow.status, "HOLD");
  assert.equal(firstHoldCode(overflow), "HOLD_FORM_REPEAT_INVALID");
  assert.match(overflow.holds[0].detail, /axis 0.*non-finite.*index 2/i);
  assert.equal(overflow.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-vector-definition-scale-round10/v0.1",
    target_commit: FORM_PR22,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-vector-scale-authoring",
      "zero-delta-axis-remains-exact-base",
      "real-core-finite-per-axis-geometry-effect",
      "scalar-vector-coercions-fail-closed",
      "complete-domain-nonpositive-and-overflow-rejected-before-emission"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE"
  }));
});

function surfacePaintRequest(id, expression) {
  return request(id, {
    base_color: [0.5, 0.5, 0.5],
    paint: {
      color: [expression, 0.55, 0.2],
      vars: { threshold: 0.6 }
    }
  }, "Preserve raw paint numeric identity across portable Surface transport");
}

const hasSurface = !!process.env.R10_SURFACE_ROOT;
test("Surface PR #20: signed negative zero cannot cross raw-paint portable transport while ordinary zero and non-finite classification stay distinct", { skip: !hasSurface }, () => {
  assert.equal(process.env.R10_SURFACE_COMMIT, SURFACE_PR20);
  const Surface = require(path.join(process.env.R10_SURFACE_ROOT, "src"));

  const expressionRequest = surfacePaintRequest("r10-surface-expression-negative-zero", ["/", 1, -0]);
  assert.equal(Object.is(expressionRequest.intent.paint.color[0][2], -0), true);
  const expressionOut = Surface.run(expressionRequest);
  assert.equal(expressionOut.status, "HOLD");
  assert.equal(firstHoldCode(expressionOut), "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  assert.match(expressionOut.holds[0].detail, /paint\.color\[0\]\[2\].*negative zero/i);
  assert.equal(expressionOut.candidate, null);
  assert.equal(Object.is(expressionRequest.intent.paint.color[0][2], -0), true, "Surface must preserve caller-owned signed zero on rejection");

  const varsRequest = surfacePaintRequest("r10-surface-var-negative-zero", ["var", "bias"]);
  varsRequest.intent.paint.vars.bias = -0;
  const varsOut = Surface.run(varsRequest);
  assert.equal(varsOut.status, "HOLD");
  assert.equal(firstHoldCode(varsOut), "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  assert.match(varsOut.holds[0].detail, /paint\.vars\.bias.*negative zero/i);
  assert.equal(varsOut.candidate, null);
  assert.equal(Object.is(varsRequest.intent.paint.vars.bias, -0), true);

  const positiveZero = surfacePaintRequest("r10-surface-positive-zero-control", ["+", 1, 0]);
  const positiveOutA = Surface.run(positiveZero);
  const positiveOutB = Surface.run(positiveZero);
  assert.deepEqual(positiveOutA, positiveOutB, "ordinary portable raw paint must replay deterministically");
  assert.equal(positiveOutA.status, "CANDIDATE", JSON.stringify(positiveOutA.holds));
  assert.equal(Object.is(positiveZero.intent.paint.color[0][2], -0), false);

  const nonFinite = surfacePaintRequest("r10-surface-nonfinite-control", ["+", 1, Infinity]);
  const nonFiniteOut = Surface.run(nonFinite);
  assert.equal(nonFiniteOut.status, "HOLD");
  assert.equal(firstHoldCode(nonFiniteOut), "HOLD_SURFACE_PAINT_NONFINITE_VALUE");
  assert.equal(nonFiniteOut.candidate, null);
  assert.equal(nonFinite.intent.paint.color[0][2], Infinity);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-signed-zero-round10/v0.1",
    target_commit: SURFACE_PR20,
    status: "PASS",
    checked: [
      "nested-expression-negative-zero-rejected-before-transport",
      "paint-var-negative-zero-rejected-before-transport",
      "caller-sign-identity-preserved-on-rejection",
      "positive-zero-portable-control-remains-candidate",
      "nonfinite-values-retain-distinct-hold-family"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

function interfaceRequest(id, ownerPath, element) {
  return request(id, {
    tile_path: ownerPath,
    title: "Round 10 path owner",
    elements: [element]
  }, "Compose an exact nested tile-owned view inside one MorphTile root");
}

function nestedInterfaceWorld(MT) {
  const world = MT.seedWorld();
  const panel = MT.createTile({ id: "mt_panel", name: "Owner panel", form_hints: ["ui_panel"] });
  const inner = MT.createTile({ id: "mt_inner", name: "Owned nested source", form_hints: ["ui_panel"] });
  inner.view = { title: "Nested source", body: [{ text: "Round 10 owned nested path view" }] };
  inner.provenance.sha256 = MT.contentHash(inner);
  const shell = MT.createTile({ id: "mt_shell", name: "Path shell", form_hints: ["ui_panel"] });
  shell.facets.mesh = { type: "interior", source: null, data: {} };
  shell.interior = { tiles: { mt_panel: panel, mt_inner: inner }, edges: {}, ports: [] };
  shell.provenance.sha256 = MT.contentHash(shell);
  world.tiles.mt_shell = shell;
  const valid = MT.validateWorld(world);
  assert.equal(valid.ok, true, valid.errors.join("; "));
  return world;
}

function commitView(MT, ws, output, label) {
  const candidate = MT.cloneBody(ws, "verification", label);
  const edited = MT.editCandidate(ws, candidate, output.candidate.operation);
  assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

const hasInterface = !!process.env.R10_INTERFACE_ROOT && !!process.env.R10_CORE_PATH;
test("Interface PR #17: exact same-root path composition resolves only its intended tile and does not widen into cross-root authority", { skip: !hasInterface }, () => {
  assert.equal(process.env.R10_INTERFACE_COMMIT, INTERFACE_PR17);
  assert.equal(process.env.R10_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R10_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R10_CORE_PATH));

  const authored = interfaceRequest("r10-interface-same-root", "mt_shell/mt_panel", { kind: "tile", tile_path: "mt_shell/mt_inner" });
  const beforeAuthored = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.deepEqual(first, second, "same-root composition must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeAuthored, "Interface must not mutate caller request");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first.candidate.operation.view.body, [{ tile: "/mt_shell/mt_inner" }]);
  assert.equal(JSON.stringify(first.candidate).includes("state_value"), false);

  const crossRoot = Interface.run(interfaceRequest("r10-interface-cross-root", "mt_shell/mt_panel", { kind: "tile", tile_path: "mt_other/mt_inner" }));
  assert.equal(crossRoot.status, "HOLD");
  assert.equal(firstHoldCode(crossRoot), "HOLD_INTERFACE_TILE_SCOPE");
  assert.equal(crossRoot.candidate, null);

  const dual = Interface.run(interfaceRequest("r10-interface-dual-address", "mt_shell/mt_panel", { kind: "tile", tile_id: "mt_inner", tile_path: "mt_shell/mt_inner" }));
  assert.equal(dual.status, "HOLD");
  assert.equal(firstHoldCode(dual), "HOLD_INTERFACE_ELEMENT_INVALID");

  const authorityExtra = Interface.run(interfaceRequest("r10-interface-authority-extra", "mt_shell/mt_panel", { kind: "tile", tile_path: "mt_shell/mt_inner", state_value: 1 }));
  assert.equal(authorityExtra.status, "HOLD");
  assert.equal(firstHoldCode(authorityExtra), "HOLD_INTERFACE_ELEMENT_FIELD_UNKNOWN");

  const ws = MT.createWorkspace(nestedInterfaceWorld(MT));
  const structuralBefore = MT.structHash(ws.live);
  const committed = commitView(MT, ws, first, "round10-interface-same-root");
  const committedHash = MT.structHash(ws.live);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live, { open: { mt_shell: true } }).root);
  assert.match(html, /class="v-embed"[^>]*data-tile="mt_shell\/mt_inner"/);
  assert.match(html, /Round 10 owned nested path view/);
  assert.equal(MT.structHash(ws.live), committedHash, "rendering exact embedded path must remain read-only");
  assert.deepEqual(MT.resolveTile(ws.live, "mt_shell/mt_inner").view, {
    title: "Nested source",
    body: [{ text: "Round 10 owned nested path view" }]
  }, "embedded tile must remain owner of its own view");

  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), structuralBefore);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-same-root-path-round10/v0.1",
    target_commit: INTERFACE_PR17,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-exact-path-authoring",
      "cross-root-scope-hold",
      "dual-address-and-authority-extra-hold",
      "real-core-exact-nested-resolution",
      "embedded-tile-retains-view-ownership",
      "render-readonly",
      "exact-rollback"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function assemblyRequest(id, inputs) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Preserve authored own-key identity during generic Assembly candidate merge",
    intent: { name: "Round 10 own-key merge" },
    inputs,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function facetInput(name, marker, source) {
  return {
    machine: { id: source, version: "0.0.0" },
    status: "CANDIDATE",
    candidate: {
      schema: "morphtile.facet-candidate/v0.4",
      facet: name,
      value: { type: "opaque-proof", source: null, data: { marker } }
    }
  };
}

const hasAssembly = !!process.env.R10_ASSEMBLY_ROOT;
test("Assembly PR #24: generic merge treats inherited-looking facet names as authored own data while preserving real conflict HOLDs", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R10_ASSEMBLY_COMMIT, ASSEMBLY_PR24);
  const Assembly = require(path.join(process.env.R10_ASSEMBLY_ROOT, "src"));

  const inputs = [
    facetInput("__proto__", 1, "producer-proto"),
    facetInput("constructor", 2, "producer-constructor"),
    facetInput("toString", 3, "producer-tostring")
  ];
  const sourceSnapshot = JSON.stringify(inputs);
  const req = assemblyRequest("r10-assembly-own-key-family", inputs);
  const first = Assembly.run(req);
  const second = Assembly.run(req);
  assert.deepEqual(first, second, "generic own-key merge must replay deterministically");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.equal(JSON.stringify(inputs), sourceSnapshot, "Assembly must not mutate producer inputs");
  assert.equal(Object.getPrototypeOf(first.candidate.facets), Object.prototype, "facet map must retain ordinary object prototype without prototype rewriting");
  assert.equal(Object.prototype.polluted, undefined, "Assembly must not pollute the global host prototype");

  for (const [name, marker] of [["__proto__", 1], ["constructor", 2], ["toString", 3]]) {
    assert.equal(Object.prototype.hasOwnProperty.call(first.candidate.facets, name), true, name + " must remain an authored own key");
    assert.deepEqual(first.candidate.facets[name], { type: "opaque-proof", source: null, data: { marker } });
  }

  const equal = Assembly.run(assemblyRequest("r10-assembly-own-key-equal", [
    facetInput("constructor", 7, "producer-a"),
    facetInput("constructor", 7, "producer-b")
  ]));
  assert.equal(equal.status, "CANDIDATE");
  assert.equal(equal.holds.length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(equal.candidate.facets, "constructor"), true);

  const conflict = Assembly.run(assemblyRequest("r10-assembly-own-key-conflict", [
    facetInput("toString", 7, "producer-a"),
    facetInput("toString", 8, "producer-b")
  ]));
  assert.equal(conflict.status, "HOLD");
  const hold = conflict.holds.find((item) => item.code === "HOLD_ASSEMBLY_CONFLICT");
  assert.ok(hold, JSON.stringify(conflict.holds));
  assert.deepEqual(hold.paths, ["facets.toString"]);
  assert.equal(hold.conflicts.length, 1);
  assert.deepEqual(hold.conflicts[0].sources, ["input[0]", "input[1]"]);
  assert.deepEqual(hold.conflicts[0].variants, [
    { type: "opaque-proof", source: null, data: { marker: 7 } },
    { type: "opaque-proof", source: null, data: { marker: 8 } }
  ]);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-generic-own-key-round10/v0.1",
    target_commit: ASSEMBLY_PR24,
    status: "PASS",
    checked: [
      "prototype-looking-facet-names-remain-own-data",
      "ordinary-object-prototype-retained-without-pollution",
      "deterministic-source-preserving-merge",
      "equal-own-key-values-deduplicate",
      "true-own-key-disagreement-remains-explicit-conflict-hold"
    ],
    placement: "ASSEMBLY_MACHINE"
  }));
});
