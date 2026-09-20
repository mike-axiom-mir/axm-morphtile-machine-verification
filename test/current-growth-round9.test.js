"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const INTERFACE_PR16 = "6dcd2e3aff705d63a56c7cdf879d856805b84fbf";
const FORM_PR21 = "2331597ac296c0a9495b5bb8fd5e9816a807256a";
const SURFACE_PR19 = "ec64af3f3ea6e7b8f713c481e365ade9facb4540";
const ASSEMBLY_PR23 = "740a0cc1446ebd5fd87f71f3fb72be60df3d8ab9";
const ROUND8_FORM = "33625a6e98cdeb985635e0cdcfd5c754ad8505fe";
const ROUND8_SURFACE = "536a745ddea4d996d0daf193649db939fe3ade83";
const ROUND8_CAPABILITY = "edc07af182ee26ca1ceb64b5d5205591ec6aca9d";
const ROUND8_INTERFACE = "3f29f98b4125fe3376f02aabc509dc3da610deae";

function request(id, intent, goal = "independent Verification Machine round 9 replay") {
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

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
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

const hasInterface = !!process.env.R9_INTERFACE_ROOT && !!process.env.R9_CORE_PATH;
test("Interface PR #16: local self-composition terminates visibly inert, stays read-only, and rolls back exactly", { skip: !hasInterface }, () => {
  assert.equal(process.env.R9_INTERFACE_COMMIT, INTERFACE_PR16);
  assert.equal(process.env.R9_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R9_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R9_CORE_PATH));

  const authored = request("r9-interface-self-reference", {
    tile_path: "mt_tower",
    title: "Self reference proof",
    elements: [{ kind: "tile", tile_id: "mt_tower" }]
  });
  const beforeAuthored = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.deepEqual(first, second, "local tile composition must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeAuthored, "Interface must not mutate caller intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first.candidate.operation.view.body, [{ tile: "mt_tower" }]);
  assert.equal(JSON.stringify(first.candidate).includes("state_value"), false, "tile reference must not copy target state");

  const ws = MT.createWorkspace(MT.seedWorld());
  const structuralBefore = MT.structHash(ws.live);
  const committed = commitView(MT, ws, first, "round9-interface-self-reference");
  const committedHash = MT.structHash(ws.live);
  let html = "";
  assert.doesNotThrow(() => {
    html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  }, "self-composition must terminate rather than recurse without bound");
  assert.match(html, /class="v-missing"/);
  assert.match(html, /this view leans on itself/);
  assert.equal(MT.structHash(ws.live), committedHash, "self-reference rendering must remain structurally read-only");

  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), structuralBefore);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-local-tile-recursion-round9/v0.1",
    target_commit: INTERFACE_PR16,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-local-tile-authoring",
      "no-copied-target-state",
      "self-reference-terminates-as-visible-inert-v-missing",
      "render-readonly",
      "exact-rollback"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function compileFormCandidate(MT, candidate) {
  const world = MT.createWorld("Round 9 Form receiver");
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

const hasForm = !!process.env.R9_FORM_ROOT && !!process.env.R9_CORE_PATH;
test("Form PR #21: declining definition scale stays exact at runtime and derived overflow fails before emission", { skip: !hasForm }, () => {
  assert.equal(process.env.R9_FORM_COMMIT, FORM_PR21);
  assert.equal(process.env.R9_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R9_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R9_CORE_PATH));

  const authored = request("r9-form-declining-scale", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      scale_step: -0.4,
      rot_step: [0, 0.15, 0],
      instance: { use: "panel", scale: 2, rot: [0, 0.1, 0] }
    }
  });
  const beforeAuthored = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.deepEqual(first, second, "definition scale progression must replay deterministically");
  assert.equal(JSON.stringify(authored), beforeAuthored, "Form must not mutate caller request");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  const target = first.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(target.scale, ["+", 2, ["*", ["var", "i"], -0.4]]);
  assert.deepEqual(target.rot[1], ["+", 0.1, ["*", ["var", "i"], 0.15]]);

  const mesh = compileFormCandidate(MT, first.candidate);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.length > 0);
  assert.ok(mesh.P.every(Number.isFinite));

  const fixed = Form.run(request("r9-form-fixed-control", {
    repeat: {
      count: 3,
      step: [2, 0, 0],
      instance: { use: "panel", scale: 2, rot: [0, 0.1, 0] }
    }
  }));
  assert.equal(fixed.status, "CANDIDATE", JSON.stringify(fixed.holds));
  const fixedMesh = compileFormCandidate(MT, fixed.candidate);
  assert.equal(fixedMesh.hold, null, JSON.stringify(fixedMesh));
  assert.notDeepEqual(mesh.P, fixedMesh.P, "authored scale/rotation progression must have real receiver geometry effect");

  const halfMax = Number.MAX_VALUE / 2;
  const overflow = Form.run(request("r9-form-derived-scale-overflow", {
    repeat: {
      count: 3,
      step: [1, 0, 0],
      scale_step: halfMax,
      instance: { use: "panel", scale: halfMax }
    }
  }));
  assert.equal(overflow.status, "HOLD");
  assert.equal(firstHoldCode(overflow), "HOLD_FORM_REPEAT_INVALID");
  assert.match(overflow.holds[0].detail, /non-finite generated value at index 2/i);
  assert.equal(overflow.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-definition-scale-round9/v0.1",
    target_commit: FORM_PR21,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "deterministic-source-preserving-declining-scale",
      "scale-and-rotation-expression-composition",
      "real-core-finite-three-part-geometry-effect",
      "derived-index-two-overflow-fails-closed-before-emission"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE"
  }));
});

const hasSurface = !!process.env.R9_SURFACE_ROOT;
test("Surface PR #19: authored presence cannot collapse into defaults while hidden toJSON stays inert metadata", { skip: !hasSurface }, () => {
  assert.equal(process.env.R9_SURFACE_COMMIT, SURFACE_PR19);
  const Surface = require(path.join(process.env.R9_SURFACE_ROOT, "src"));

  const topIntent = {};
  Object.defineProperty(topIntent, "pattern", { value: undefined, enumerable: true, configurable: true, writable: true });
  const topDescriptor = Object.getOwnPropertyDescriptor(topIntent, "pattern");
  const top = Surface.run(request("r9-surface-top-undefined", topIntent));
  assert.equal(top.status, "HOLD");
  assert.equal(firstHoldCode(top), "HOLD_SURFACE_INTENT_NONPORTABLE_VALUE");
  assert.equal(top.candidate, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(topIntent, "pattern"), topDescriptor, "top-level authored presence must not be mutated");

  const nestedPattern = { kind: "checker" };
  Object.defineProperty(nestedPattern, "scale", { value: undefined, enumerable: true, configurable: true, writable: true });
  const nestedDescriptor = Object.getOwnPropertyDescriptor(nestedPattern, "scale");
  const nested = Surface.run(request("r9-surface-nested-undefined", { pattern: nestedPattern }));
  assert.equal(nested.status, "HOLD");
  assert.equal(firstHoldCode(nested), "HOLD_SURFACE_PATTERN_NONPORTABLE_VALUE");
  assert.equal(nested.candidate, null);
  assert.deepEqual(Object.getOwnPropertyDescriptor(nestedPattern, "scale"), nestedDescriptor);

  const omittedRequest = request("r9-surface-genuine-absence", { pattern: { kind: "checker" } });
  const omittedA = Surface.run(omittedRequest);
  const omittedB = Surface.run(omittedRequest);
  assert.deepEqual(omittedA, omittedB, "genuinely omitted optional scale must default deterministically");
  assert.equal(omittedA.status, "CANDIDATE", JSON.stringify(omittedA.holds));
  assert.equal(omittedA.candidate.value.data.pattern, "checker");
  assert.equal(omittedA.candidate.value.data.scale, 0.5);

  const hiddenSemantic = { kind: "checker" };
  Object.defineProperty(hiddenSemantic, "scale", { value: 0.25, enumerable: false, configurable: true, writable: true });
  const hiddenDescriptor = Object.getOwnPropertyDescriptor(hiddenSemantic, "scale");
  const hidden = Surface.run(request("r9-surface-hidden-semantic", { pattern: hiddenSemantic }));
  assert.equal(hidden.status, "HOLD");
  assert.equal(firstHoldCode(hidden), "HOLD_SURFACE_PATTERN_NONPORTABLE_VALUE");
  assert.deepEqual(Object.getOwnPropertyDescriptor(hiddenSemantic, "scale"), hiddenDescriptor);

  let toJSONCalls = 0;
  const invalidWithMetadata = { kind: "not-a-surface-pattern" };
  const toJSON = function toJSON() { toJSONCalls += 1; return { kind: "checker" }; };
  Object.defineProperty(invalidWithMetadata, "toJSON", { value: toJSON, enumerable: false, configurable: true, writable: true });
  const metadataResult = Surface.run(request("r9-surface-hidden-tojson", { pattern: invalidWithMetadata }));
  assert.equal(metadataResult.status, "HOLD");
  assert.equal(firstHoldCode(metadataResult), "HOLD_SURFACE_PATTERN_KIND_UNKNOWN", "semantic invalidity must retain priority over excluded hidden metadata");
  assert.equal(toJSONCalls, 0, "hidden toJSON metadata must never execute");
  assert.equal(Object.getOwnPropertyDescriptor(invalidWithMetadata, "toJSON").value, toJSON);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-authored-presence-round9/v0.1",
    target_commit: SURFACE_PR19,
    status: "PASS",
    checked: [
      "top-level-explicit-undefined-holds-as-authored-presence",
      "nested-explicit-undefined-holds-before-pattern-default",
      "genuine-absence-defaults-deterministically",
      "hidden-semantic-data-does-not-collapse-to-absence",
      "hidden-tojson-remains-inert-and-semantic-error-keeps-priority"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

function uiEligibility(id) {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      id,
      name: "Verification round 8 portable panel",
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-explicit-ui-eligibility" }
  };
}

const hasAssembly = !!process.env.R9_ASSEMBLY_ROOT && !!process.env.R9_CORE_PATH &&
  !!process.env.R9_R8_FORM_ROOT && !!process.env.R9_R8_SURFACE_ROOT &&
  !!process.env.R9_R8_CAPABILITY_ROOT && !!process.env.R9_R8_INTERFACE_ROOT;

test("Assembly PR #23: exact merged round-8 semantics survive portable kit, version identity agrees, and stale-hash tamper is rejected", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R9_ASSEMBLY_COMMIT, ASSEMBLY_PR23);
  assert.equal(process.env.R9_CORE_COMMIT, CORE);
  assert.equal(process.env.R9_R8_FORM_COMMIT, ROUND8_FORM);
  assert.equal(process.env.R9_R8_SURFACE_COMMIT, ROUND8_SURFACE);
  assert.equal(process.env.R9_R8_CAPABILITY_COMMIT, ROUND8_CAPABILITY);
  assert.equal(process.env.R9_R8_INTERFACE_COMMIT, ROUND8_INTERFACE);

  const Assembly = require(path.join(process.env.R9_ASSEMBLY_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R9_ASSEMBLY_ROOT, "src", "kit"));
  const manifest = require(path.join(process.env.R9_ASSEMBLY_ROOT, "machine.json"));
  const pkg = require(path.join(process.env.R9_ASSEMBLY_ROOT, "package.json"));
  const Form = require(path.join(process.env.R9_R8_FORM_ROOT, "src"));
  const Surface = require(path.join(process.env.R9_R8_SURFACE_ROOT, "src"));
  const Capability = require(path.join(process.env.R9_R8_CAPABILITY_ROOT, "src"));
  const Interface = require(path.join(process.env.R9_R8_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R9_CORE_PATH));

  assert.equal(Assembly.MACHINE.version, "0.6.4");
  assert.equal(Assembly.MACHINE.version, manifest.version, "runtime and manifest Assembly version must agree");
  assert.equal(Assembly.MACHINE.version, pkg.version, "runtime and package Assembly version must agree");

  const id = "mt_verification_round8_portable";
  const form = Form.run(request("r9-assembly-form", {
    repeat: {
      count: 3,
      step: [0, 1.4, 0],
      size_step: [-0.2, 0.15, 0],
      part: { shape: "box", size: [1.5, 0.5, 0.5] }
    }
  }));
  const surface = Surface.run(request("r9-assembly-surface", {
    base_color: [0.25, 0.4, 0.55],
    pattern: { kind: "checker", scale: 1.75 }
  }));
  const capability = Capability.run(request("r9-assembly-capability", { kind: "counter", initial: 2 }));
  const interfaceOut = Interface.run(request("r9-assembly-interface", {
    tile_path: id,
    title: "Verification portable panel",
    elements: [{
      kind: "repeat",
      binding: "count",
      step: 1,
      max: 4,
      children: [{ kind: "text", text: "Verification marker" }]
    }],
    bindings: { readouts: ["count"] }
  }));
  for (const [name, output] of Object.entries({ form, surface, capability, interface: interfaceOut })) {
    assert.equal(output.status, "CANDIDATE", `${name}: ${JSON.stringify(output.holds)}`);
  }

  const assembled = Assembly.run({
    envelope_version: "0.1",
    request_id: "r9-assembly-complete",
    goal: "independently verify exact merged round-8 portable receiver composition",
    intent: { id, name: "Verification round 8 portable panel" },
    inputs: [uiEligibility(id), form, surface, capability, interfaceOut],
    provenance: { caller: "axm.morphtile.machine.verification" }
  });
  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds));
  assert.deepEqual(assembled.candidate.facets.mesh.data.parts, form.candidate.facets.mesh.data.parts);
  assert.deepEqual(assembled.candidate.view, interfaceOut.candidate.operation.view);
  assert.equal(assembled.candidate.facets.material.data.pattern, "checker");
  assert.equal(assembled.candidate.facets.material.data.scale, 1.75);
  assert.equal(assembled.candidate.facets.logic.data.vars.count, 2);
  assert.equal(assembled.dependencies.length, 1);
  assert.equal(assembled.dependencies[0].kind, "morphtile.interface-target-proof/v0.1");
  assert.deepEqual(assembled.dependencies[0].requires.readout_logic_vars, ["count"]);

  const portable = materializeKit(assembled, MT, { name: "Verification round 8 complete portable kit" });
  assert.equal(portable.status, "CANDIDATE", JSON.stringify(portable.holds));
  assert.equal(portable.dependency_resolution.length, 1);
  assert.equal(portable.dependency_resolution[0].status, "SATISFIED");
  assert.equal(portable.dependency_resolution[0].proof_scope, "staged_morphtile_world");

  const receiver = MT.createWorld("Round 9 Assembly receiver");
  const imported = MT.importKit(receiver, clone(portable.kit));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  assert.equal(imported.evidence, "verified_payload_sha256");
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
  const received = MT.resolveTile(receiver, id);
  assert.ok(received);
  const mesh = MT.compileMesh(received, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.every(Number.isFinite));
  const beforeRender = MT.structHash(receiver);
  const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
  assert.equal((html.match(/Verification marker/g) || []).length, 2);
  assert.equal(MT.structHash(receiver), beforeRender, "imported state-bound rendering must remain read-only");

  const tampered = clone(portable.kit);
  tampered.tile.view.body[0].body[0].text = "tampered-after-hash";
  const rejectedReceiver = MT.createWorld("Round 9 rejected Assembly receiver");
  const beforeReject = MT.structHash(rejectedReceiver);
  const rejected = MT.importKit(rejectedReceiver, tampered);
  assert.equal(rejected.status, "HOLD_HASH_MISMATCH", JSON.stringify(rejected));
  assert.equal(MT.structHash(rejectedReceiver), beforeReject, "stale-hash rejection must not mutate receiver state");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-round8-portability-round9/v0.1",
    target_commit: ASSEMBLY_PR23,
    receiver_commit: CORE,
    producer_commits: {
      form: ROUND8_FORM,
      surface: ROUND8_SURFACE,
      capability: ROUND8_CAPABILITY,
      interface: ROUND8_INTERFACE
    },
    status: "PASS",
    checked: [
      "runtime-manifest-package-version-identity",
      "exact-merged-producer-semantics-preserved-through-assembly",
      "target-proof-dependency-discharged-only-in-staged-world",
      "fresh-kit-import-and-finite-runtime-geometry",
      "canonical-state-repeat-render-readonly",
      "stale-hash-view-tamper-rejected-without-receiver-mutation"
    ],
    visual_quality: "NOT_TESTED",
    placement: "ASSEMBLY_MACHINE_PLUS_CORE_KIT_RUNTIME_BOUNDARY"
  }));
});
