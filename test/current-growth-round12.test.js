"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_PR24 = "8161cbb30e279ff6bb5522ae6ad6eefd9e98fd56";
const SURFACE_PR23 = "3dfe1ce0fdadbf83fa330a088429ed3806c14583";
const INTERFACE_PR19 = "e28c9a380d6425cb6611d7a74903bf8e89dd0c62";
const ASSEMBLY_MAIN = "675ec2498ff94969ad198843ba65aa145134da6c";

function request(id, intent, goal = "independent Verification Machine round 12 replay") {
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

const hasForm = !!process.env.R12_FORM_ROOT && !!process.env.R12_CORE_PATH;
test("Form PR #24: three-axis zero-translation grid rotation remains compact, finite, deterministic, and receiver-real", { skip: !hasForm }, () => {
  assert.equal(process.env.R12_FORM_COMMIT, FORM_PR24);
  assert.equal(process.env.R12_CORE_COMMIT, CORE);
  const Form = require(path.join(process.env.R12_FORM_ROOT, "src"));
  const MT = require(path.resolve(process.env.R12_CORE_PATH));

  const authored = request("r12-form-grid-xyz", {
    name: "three-axis turning cell",
    grid: {
      counts: [2, 2, 2],
      step: [0, 0, 0],
      rot_step: {
        x: [0.11, 0, 0],
        y: [0, 0.23, 0],
        z: [0, 0, 0.37]
      },
      part: {
        shape: "wedge",
        size: [1, 2, 1],
        pos: [1, 2, 3],
        rot: [0.4, 0.5, 0.6]
      }
    }
  });
  const before = JSON.stringify(authored);
  const first = Form.run(authored);
  const second = Form.run(authored);
  assert.deepEqual(first, second, "three-axis progression must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Form must not mutate caller-owned intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));

  const gx = first.candidate.facets.mesh.data.parts[0];
  const gy = gx.body[0];
  const gz = gy.body[0];
  const leaf = gz.body[0];
  assert.equal(gx.repeat, 2);
  assert.equal(gx.as, "gx");
  assert.equal(gy.repeat, 2);
  assert.equal(gy.as, "gy");
  assert.equal(gz.repeat, 2);
  assert.equal(gz.as, "gz");
  assert.deepEqual(leaf.pos, [1, 2, 3], "zero-translation authoring must not acquire validation-only movement");
  const rotationGrammar = JSON.stringify(leaf.rot);
  assert.match(rotationGrammar, /"gx"/);
  assert.match(rotationGrammar, /"gy"/);
  assert.match(rotationGrammar, /"gz"/);

  const tile = MT.createTile(first.candidate);
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MT.compileMesh(tile);
  assert.equal(compiled.hold, null, JSON.stringify(compiled));
  assert.equal(compiled.recipe_parts, 8);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixedCandidate = JSON.parse(JSON.stringify(first.candidate));
  fixedCandidate.facets.mesh.data.parts[0].body[0].body[0].body[0].rot = [0.4, 0.5, 0.6];
  const fixedCompiled = MT.compileMesh(MT.createTile(fixedCandidate));
  assert.equal(fixedCompiled.hold, null, JSON.stringify(fixedCompiled));
  assert.notDeepEqual(compiled.P, fixedCompiled.P, "real MorphTile must consume the emitted x/y/z rotation progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-xyz-round12/v0.1",
    target_commit: FORM_PR24,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "three-axis-zero-translation-authoring",
      "compact-gx-gy-gz-loop-grammar",
      "deterministic-source-preserving-replay",
      "eight-cell-finite-runtime-expansion",
      "receiver-consumes-progression"
    ],
    visual_quality: "NOT_TESTED",
    placement: "FORM_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function nullPrototypeDiscriminator() {
  const value = Object.create(null);
  Object.defineProperty(value, "marker", {
    value: "structured-discriminator",
    enumerable: true,
    writable: true,
    configurable: true
  });
  return value;
}

const hasSurface = !!process.env.R12_SURFACE_ROOT;
test("Surface PR #23: null-prototype structured discriminators fail with precise Surface identities without host coercion", { skip: !hasSurface }, () => {
  assert.equal(process.env.R12_SURFACE_COMMIT, SURFACE_PR23);
  const Surface = require(path.join(process.env.R12_SURFACE_ROOT, "src"));

  const kindValue = nullPrototypeDiscriminator();
  const kindRequest = request("r12-surface-structured-kind", {
    base_color: [0.2, 0.25, 0.3],
    surface_rule: {
      kind: kindValue,
      direction: "up",
      threshold: 0.6,
      match_color: [0.9, 0.55, 0.2],
      else_color: [0.25, 0.3, 0.4]
    }
  });
  const kindBefore = JSON.stringify(kindRequest);
  const kindOut = Surface.run(kindRequest);
  assert.equal(kindOut.status, "HOLD");
  assert.equal(firstHoldCode(kindOut), "HOLD_SURFACE_RULE_KIND_UNKNOWN");
  assert.equal(kindOut.candidate, null);
  assert.equal(JSON.stringify(kindRequest), kindBefore);
  assert.equal(Object.getPrototypeOf(kindValue), null, "Surface must not rewrite the caller-owned structured discriminator");

  const directionValue = nullPrototypeDiscriminator();
  const directionRequest = request("r12-surface-structured-direction", {
    base_color: [0.2, 0.25, 0.3],
    surface_rule: {
      kind: "facing",
      direction: directionValue,
      threshold: 0.6,
      match_color: [0.9, 0.55, 0.2],
      else_color: [0.25, 0.3, 0.4]
    }
  });
  const directionBefore = JSON.stringify(directionRequest);
  const directionOut = Surface.run(directionRequest);
  assert.equal(directionOut.status, "HOLD");
  assert.equal(firstHoldCode(directionOut), "HOLD_SURFACE_RULE_DIRECTION_UNKNOWN");
  assert.equal(directionOut.candidate, null);
  assert.equal(JSON.stringify(directionRequest), directionBefore);
  assert.equal(Object.getPrototypeOf(directionValue), null);

  const valid = Surface.run(request("r12-surface-valid-facing-control", {
    base_color: [0.2, 0.25, 0.3],
    surface_rule: {
      kind: "facing",
      direction: "up",
      threshold: 0.6,
      match_color: [0.9, 0.55, 0.2],
      else_color: [0.25, 0.3, 0.4]
    }
  }));
  assert.equal(valid.status, "CANDIDATE", JSON.stringify(valid.holds));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/surface-discriminator-round12/v0.1",
    target_commit: SURFACE_PR23,
    status: "PASS",
    checked: [
      "null-prototype-kind-precise-hold",
      "null-prototype-direction-precise-hold",
      "no-host-coercion-required",
      "source-prototype-preserved",
      "ordinary-facing-control-still-candidate"
    ],
    visual_quality: "NOT_TESTED",
    placement: "SURFACE_MACHINE"
  }));
});

const hasInterface = !!process.env.R12_INTERFACE_ROOT && !!process.env.R12_CORE_PATH;
test("Interface PR #19: native style edge values stay portable, read-only, rollback-safe, while signed zero fails before transport", { skip: !hasInterface }, () => {
  assert.equal(process.env.R12_INTERFACE_COMMIT, INTERFACE_PR19);
  assert.equal(process.env.R12_CORE_COMMIT, CORE);
  const Interface = require(path.join(process.env.R12_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R12_CORE_PATH));

  const authored = request("r12-interface-style-edge", {
    tile_path: "mt_tower",
    title: "Style boundary",
    accent: [0, 0.5, 1],
    width: 1,
    elements: [{ kind: "text", text: "Boundary", strong: false }]
  });
  const before = JSON.stringify(authored);
  const first = Interface.run(authored);
  const second = Interface.run(authored);
  assert.deepEqual(first, second, "style authoring must replay deterministically");
  assert.equal(JSON.stringify(authored), before, "Interface must not mutate authored style intent");
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first.candidate.operation.view, {
    title: "Style boundary",
    body: [{ text: "Boundary", strong: false }],
    accent: [0, 0.5, 1],
    width: 1
  });

  const signed = request("r12-interface-style-signed-zero", {
    tile_path: "mt_tower",
    title: "Signed zero must not be transported implicitly",
    accent: [-0, 0.5, 1],
    width: 1,
    elements: [{ kind: "text", text: "No rewrite", strong: false }]
  });
  assert.equal(Object.is(signed.intent.accent[0], -0), true);
  const signedOut = Interface.run(signed);
  assert.equal(signedOut.status, "HOLD");
  assert.equal(firstHoldCode(signedOut), "HOLD_INTERFACE_INTENT_NONPORTABLE_VALUE");
  assert.equal(signedOut.candidate, null);
  assert.equal(Object.is(signed.intent.accent[0], -0), true, "rejection must preserve the caller's signed-zero identity");

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const committed = commitOperations(MT, ws, first, "round12-interface-style");
  assert.deepEqual(ws.live.tiles.mt_tower.view, first.candidate.operation.view);
  const beforeRender = MT.hashOf(ws.live);
  const html = MT.vnodeToHTML(MT.compilePanel(ws.live).root);
  assert.match(html, /--tile:rgb\(0,128,255\)/);
  assert.match(html, /flex-grow:1/);
  assert.match(html, />Boundary<\/p>/);
  assert.equal(html.includes('class="v-text is-strong"'), false, "explicit strong:false must not acquire strong presentation");
  assert.equal(MT.hashOf(ws.live), beforeRender, "native style rendering must be read-only over canonical matter");
  const rolled = MT.rollback(ws, committed.receipt.rollback_token);
  assert.equal(rolled.ok, true);
  assert.equal(rolled.exact, true);
  assert.equal(MT.structHash(ws.live), beforeHash);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-native-style-round12/v0.1",
    target_commit: INTERFACE_PR19,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "accent-boundary-0-to-1-preserved",
      "width-minimum-one-preserved",
      "strong-false-preserved",
      "signed-zero-rejected-before-transport",
      "native-render-readonly",
      "exact-rollback"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_CORE_RUNTIME_BOUNDARY"
  }));
});

function uiEligibility(id) {
  return {
    status: "CANDIDATE",
    machine: { id: "verification.eligibility", version: "0.1" },
    request_id: "eligibility-" + id,
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      id,
      name: "Verification UI target",
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-explicit-ui-eligibility" }
  };
}

const hasStyleClosure = !!process.env.R12_INTERFACE_ROOT && !!process.env.R12_ASSEMBLY_ROOT;
test("Interface PR #19 + Assembly main: native style matter survives combination and participates in closure identity", { skip: !hasStyleClosure }, () => {
  assert.equal(process.env.R12_INTERFACE_COMMIT, INTERFACE_PR19);
  assert.equal(process.env.R12_ASSEMBLY_COMMIT, ASSEMBLY_MAIN);
  const Interface = require(path.join(process.env.R12_INTERFACE_ROOT, "src"));
  const Assembly = require(path.join(process.env.R12_ASSEMBLY_ROOT, "src"));

  function author(accent) {
    return Interface.run(request("r12-style-closure-source", {
      tile_path: "mt_tower",
      title: "Closure-styled tower",
      accent,
      width: 2,
      elements: [{ kind: "text", text: "Closure", strong: true }]
    }));
  }
  function assemble(interfaceOut) {
    return Assembly.run({
      envelope_version: "0.1",
      request_id: "r12-style-closure-assembly",
      goal: "Prove style matter remains closure-significant through Assembly",
      intent: { id: "mt_tower", tile_path: "mt_tower", name: "Closure-styled tower" },
      inputs: [uiEligibility("mt_tower"), interfaceOut],
      provenance: { caller: "axm.morphtile.machine.verification" }
    });
  }

  const blueSource = author([0, 0.5, 1]);
  const orangeSource = author([1, 0.5, 0]);
  assert.equal(blueSource.status, "CANDIDATE", JSON.stringify(blueSource.holds));
  assert.equal(orangeSource.status, "CANDIDATE", JSON.stringify(orangeSource.holds));
  const blue = assemble(blueSource);
  const orange = assemble(orangeSource);
  assert.equal(blue.status, "CANDIDATE", JSON.stringify(blue.holds));
  assert.equal(orange.status, "CANDIDATE", JSON.stringify(orange.holds));
  assert.deepEqual(blue.candidate.view.accent, [0, 0.5, 1]);
  assert.deepEqual(orange.candidate.view.accent, [1, 0.5, 0]);
  assert.equal(blue.candidate.view.width, 2);
  assert.deepEqual(blue.candidate.view.body, [{ text: "Closure", strong: true }]);
  assert.deepEqual(blue.dependencies, blueSource.dependencies, "Assembly must retain Interface proof dependencies unchanged");
  assert.equal(blue.closure_hash.scope, "candidate+dependencies+world_requirements");
  assert.equal(orange.closure_hash.scope, "candidate+dependencies+world_requirements");
  assert.notDeepEqual(blue.closure_hash, orange.closure_hash, "changing only native style matter must change closure identity");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-style-assembly-closure-round12/v0.1",
    target_commit: INTERFACE_PR19,
    receiver_commit: ASSEMBLY_MAIN,
    status: "PASS",
    checked: [
      "style-matter-survives-assembly",
      "proof-dependencies-retained",
      "closure-scope-retained",
      "style-change-affects-closure-identity"
    ],
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_PLUS_ASSEMBLY_RECEIVER_BOUNDARY"
  }));
});
