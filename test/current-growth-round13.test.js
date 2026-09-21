"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR25 = "3b6d448e76b521a81aac3599a77a69e4e8fbcb64";
const SURFACE_PR24 = "e37fc547f8ccdbfdf8ac49c9ca48458469fad453";
const INTERFACE_PR20 = "b6f5e6652f3694aab3d954d0a98291130f90370e";
const ASSEMBLY_PR26 = "23911cc53ece55f86d68bc481b688ca506c43278";

function request(id, intent, goal = "independent Verification Machine round 13 replay") {
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

function firstHoldCode(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0].code || null;
  if (value && value.hold && typeof value.hold === "object") return value.hold.code || null;
  return value && value.code || null;
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

const hasAssembly = !!process.env.R13_ASSEMBLY_ROOT;
test("Assembly PR #26: semantic-container hardening rejects hostile/wrong shapes without redefining established null omission", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R13_ASSEMBLY_COMMIT, ASSEMBLY_PR26);
  const Assembly = require(path.join(process.env.R13_ASSEMBLY_ROOT, "src"));
  const base = require(path.join(process.env.R13_ASSEMBLY_ROOT, "fixtures", "request.assembly.json"));

  const control = clone(base);
  control.request_id = "r13-assembly-null-omission-control";
  control.dependencies = null;
  control.world_requirements = null;
  control.inputs[0].dependencies = null;
  control.inputs[0].warnings = null;
  const before = JSON.stringify(control);
  const first = Assembly.run(control);
  const second = Assembly.run(control);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "explicit-null omission control must replay deterministically");
  assert.equal(JSON.stringify(control), before, "Assembly must not mutate the caller-owned control");

  const emptyHint = clone(base);
  emptyHint.request_id = "r13-assembly-empty-form-hint";
  emptyHint.inputs[0].candidate.form_hints = ["game_asset", ""];
  const emptyHintOut = Assembly.run(emptyHint);
  assert.equal(emptyHintOut.status, "HOLD");
  assert.equal(firstHoldCode(emptyHintOut), "HOLD_FORM_HINTS_SHAPE_INVALID");
  assert.equal(emptyHintOut.candidate, null);

  const wrongDefinitions = clone(base);
  wrongDefinitions.request_id = "r13-assembly-definition-container";
  wrongDefinitions.world_requirements = { definitions: "not-a-named-definition-map" };
  const wrongDefinitionsOut = Assembly.run(wrongDefinitions);
  assert.equal(wrongDefinitionsOut.status, "HOLD");
  assert.equal(firstHoldCode(wrongDefinitionsOut), "HOLD_WORLD_REQUIREMENTS_SHAPE_INVALID");
  assert.equal(wrongDefinitionsOut.candidate, null);

  const revokedInputs = clone(base);
  revokedInputs.request_id = "r13-assembly-revoked-inputs";
  const revocable = Proxy.revocable(clone(base.inputs), {});
  revokedInputs.inputs = revocable.proxy;
  revocable.revoke();
  let revokedOut;
  assert.doesNotThrow(() => { revokedOut = Assembly.run(revokedInputs); }, "Proxy detection must precede semantic shape reflection");
  assert.equal(revokedOut.status, "HOLD");
  assert.equal(firstHoldCode(revokedOut), "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  assert.equal(revokedOut.candidate, null);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-semantic-shapes-round13/v0.1",
    target_commit: ASSEMBLY_PR26,
    status: "PASS",
    checked: [
      "explicit-null-omission-remains-candidate",
      "empty-form-hint-rejected",
      "definition-map-container-identity-enforced",
      "revoked-inputs-proxy-rejected-before-shape-reflection",
      "deterministic-source-preserving-control"
    ],
    visual_quality: "NOT_APPLICABLE",
    placement: "ASSEMBLY_MACHINE"
  }));
});

const hasForm = !!process.env.R13_FORM_ROOT && !!process.env.R13_CORE_PATH;
test("Form PR #25: three-axis size progression is receiver-real and complete-domain collision proof catches a non-adjacent collision", { skip: !hasForm }, () => {
  assert.equal(process.env.R13_FORM_COMMIT, FORM_PR25);
  assert.equal(process.env.R13_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R13_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R13_CORE_PATH));

  const authored = request("r13-form-grid-size-xyz", {
    name: "three-axis changing cell size",
    grid: {
      counts: [2, 2, 2],
      step: [0, 0, 0],
      size_step: {
        x: [0.2, 0, 0],
        y: [0, 0.15, 0],
        z: [0, 0, 0.1]
      },
      rot_step: { z: [0, 0.07, 0] },
      part: {
        shape: "wedge",
        size: [1, 2, 1],
        pos: [3, -1, 2],
        rot: [0.1, 0.2, 0.3]
      }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.deepEqual(first, second, "three-axis size progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller-owned authored matter");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));

  const gx = first.candidate.facets.mesh.data.parts[0];
  const gy = gx.body[0];
  const gz = gy.body[0];
  const leaf = gz.body[0];
  assert.deepEqual([gx.as, gy.as, gz.as], ["gx", "gy", "gz"]);
  assert.deepEqual(leaf.pos, [3, -1, 2], "validation-only movement must not leak into zero-translation authored output");
  const sizeGrammar = JSON.stringify(leaf.size);
  assert.match(sizeGrammar, /"gx"/);
  assert.match(sizeGrammar, /"gy"/);
  assert.match(sizeGrammar, /"gz"/);

  const tile = MT.createTile(first.candidate);
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MT.compileMesh(tile);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 8);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixedCandidate = clone(first.candidate);
  fixedCandidate.facets.mesh.data.parts[0].body[0].body[0].body[0].size = [1, 2, 1];
  const fixed = MT.compileMesh(MT.createTile(fixedCandidate));
  assert.equal(fixed.hold, null, JSON.stringify(fixed));
  assert.notDeepEqual(compiled.P, fixed.P, "real MorphTile must consume the three-axis size expressions");

  const nonAdjacentCollision = Form.run(request("r13-form-grid-size-nonadjacent-collision", {
    grid: {
      counts: [2, 3, 1],
      step: [0, 0, 0],
      size_step: {
        x: [1, 0, 0],
        y: [0.5, 0, 0]
      },
      part: { shape: "box", size: [10, 1, 1], pos: [0, 0, 0] }
    }
  }));
  assert.equal(nonAdjacentCollision.status, "HOLD");
  assert.equal(firstHoldCode(nonAdjacentCollision), "HOLD_FORM_GRID_INVALID");
  assert.equal(nonAdjacentCollision.candidate, null, "a non-adjacent Cartesian collision must be rejected before emission");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-size-round13/v0.1",
    target_commit: FORM_PR25,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "three-axis-size-expression-identity",
      "deterministic-source-preserving-replay",
      "eight-cell-finite-real-receiver-expansion",
      "receiver-consumes-size-progression",
      "non-adjacent-cartesian-collision-rejected-before-emission"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function expectSurfaceRequestBoundary(fn, pattern) {
  assert.throws(fn, (error) => {
    assert.equal(error && error.code, "HOLD_SURFACE_REQUEST_NONPORTABLE_VALUE");
    assert.match(String(error && error.message), pattern);
    return true;
  });
}

const hasSurface = !!process.env.R13_SURFACE_ROOT;
test("Surface PR #24: revoked envelope values and sparse capability lists fail before host semantics can execute or rewrite them", { skip: !hasSurface }, () => {
  assert.equal(process.env.R13_SURFACE_COMMIT, SURFACE_PR24);
  const Surface = require(path.join(process.env.R13_SURFACE_ROOT, "src"));
  const fixture = require(path.join(process.env.R13_SURFACE_ROOT, "fixtures", "request.facing-up.json"));

  const rootPair = Proxy.revocable(clone(fixture), {});
  rootPair.revoke();
  expectSurfaceRequestBoundary(() => Surface.run(rootPair.proxy), /request uses a Proxy/);

  const capabilityRequest = clone(fixture);
  capabilityRequest.request_id = "r13-surface-revoked-capabilities";
  capabilityRequest.intent = { external_dependency: "bridge:cloth" };
  const capabilityPair = Proxy.revocable(["bridge:cloth"], {});
  capabilityRequest.available_capabilities = capabilityPair.proxy;
  capabilityPair.revoke();
  expectSurfaceRequestBoundary(() => Surface.run(capabilityRequest), /available_capabilities uses a Proxy/);

  const provenanceRequest = clone(fixture);
  provenanceRequest.request_id = "r13-surface-revoked-provenance";
  const provenancePair = Proxy.revocable({ caller: "unreachable" }, {});
  provenanceRequest.provenance = provenancePair.proxy;
  provenancePair.revoke();
  expectSurfaceRequestBoundary(() => Surface.run(provenanceRequest), /provenance uses a Proxy/);

  const sparse = clone(fixture);
  sparse.request_id = "r13-surface-sparse-capabilities";
  sparse.intent = { external_dependency: "bridge:cloth" };
  sparse.available_capabilities = new Array(2);
  sparse.available_capabilities[0] = "bridge:cloth";
  expectSurfaceRequestBoundary(() => Surface.run(sparse), /available_capabilities\[1\] is a sparse capability-list slot/);

  const control = clone(fixture);
  control.request_id = "r13-surface-capability-control";
  control.intent = { external_dependency: "bridge:cloth" };
  control.available_capabilities = ["bridge:cloth"];
  const before = JSON.stringify(control);
  const first = Surface.run(control);
  const second = Surface.run(control);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(control), before);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-request-envelope-round13/v0.1",
    target_commit: SURFACE_PR24,
    status: "PASS",
    checked: [
      "revoked-root-request-fails-before-reflection",
      "revoked-capability-list-fails-before-list-grammar",
      "revoked-provenance-fails-before-transport",
      "sparse-capability-list-fails-before-json-rewrite",
      "ordinary-capability-list-still-deterministic-candidate"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

const hasInterface = !!process.env.R13_INTERFACE_ROOT && !!process.env.R13_CORE_PATH;
test("Interface PR #20: docking semantics are mode-owned and omitted dock remains a real core-owned default through render and rollback", { skip: !hasInterface }, () => {
  assert.equal(process.env.R13_INTERFACE_COMMIT, INTERFACE_PR20);
  assert.equal(process.env.R13_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R13_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R13_CORE_PATH));

  const nonDockedModes = ["screen", "floating", "fullscreen", "embedded", "world", "tile"];
  for (const mode of nonDockedModes) {
    const authored = request("r13-interface-inert-dock-" + mode, {
      tile_path: "mt_tower",
      title: "Mode-owned docking",
      text: "dock must belong to docked mode",
      placement: { mode, dock: "left", user_adjustable: false }
    });
    const before = JSON.stringify(authored);
    const out = Interface.run(authored);
    assert.equal(out.status, "HOLD", mode);
    assert.equal(firstHoldCode(out), "HOLD_INVALID_PRESENTATION_PLACEMENT", mode);
    assert.equal(out.candidate, null, mode);
    assert.equal(JSON.stringify(authored), before, mode + " rejection must preserve caller-owned intent");
  }

  const omitted = request("r13-interface-native-dock-default", {
    tile_path: "mt_tower",
    title: "Native dock default",
    text: "core decides the omitted edge",
    placement: { mode: "docked", user_adjustable: false }
  });
  const first = Interface.run(omitted);
  const second = Interface.run(omitted);
  assert.deepEqual(first, second);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  const presentation = first.candidate.operations.find((operation) => operation.op === "presentation.set").presentation;
  assert.equal(Object.prototype.hasOwnProperty.call(presentation, "dock"), false, "Interface must preserve the core default by omission");

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "round13-interface-dock-default");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, { mode: "docked", user_adjustable: false });
  const beforeRender = MT.hashOf(ws.live);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(html, /docked right/, "real MorphTile must supply its native right-edge meaning when dock is omitted");
  assert.equal(html.includes("mt-dock-right"), false, "the native default must not be rewritten into explicit canonical dock matter");
  assert.equal(MT.hashOf(ws.live), beforeRender, "rendering the native dock default must be read-only");
  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash);

  const explicit = Interface.run(request("r13-interface-explicit-bottom-dock", {
    tile_path: "mt_tower",
    title: "Explicit bottom dock",
    text: "authored edge stays authored",
    placement: { mode: "docked", dock: "bottom", user_adjustable: false }
  }));
  assert.equal(explicit.status, "CANDIDATE", JSON.stringify(explicit.holds));
  const wsExplicit = MT.createWorkspace(MT.seedWorld());
  commitOperations(MT, wsExplicit, explicit, "round13-interface-explicit-dock");
  const explicitHtml = MT.vnodeToHTML(MT.compilePanel(wsExplicit.live).root);
  assert.match(explicitHtml, /mt-dock-bottom/);
  assert.match(explicitHtml, /docked bottom/);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-docking-round13/v0.1",
    target_commit: INTERFACE_PR20,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "dock-rejected-across-all-nondocked-modes",
      "omitted-dock-remains-omitted-in-canonical-matter",
      "real-core-native-right-default-rendered",
      "native-default-render-readonly-and-rollback-exact",
      "explicit-bottom-dock-survives-to-real-core"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});
