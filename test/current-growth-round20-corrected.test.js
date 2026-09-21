"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "dd6975f29390e3175642a7d510b3c5320415b620";
const FORM_PR33 = "1248fd020ae30a81ffd5fd7c95c42ea3474c6305";
const ASSEMBLY_BASE = "e72c625d8dad99b2021e9ddf3782cf90f158a46b";
const ASSEMBLY_PR33 = "316d6dcc6c0682db3e91ae97c301e83886faa9de";
const SURFACE = "4e4495182aa83e5dfba37722fc3756a70cfaafaa";
const CAPABILITY = "edc07af182ee26ca1ceb64b5d5205591ec6aca9d";
const INTERFACE = "8516da3a414c416ec1f76b1078901c56c49b04db";

function request(id, intent, caller = "axm.morphtile.machine.verification") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 20 corrected replay",
    intent,
    provenance: { caller }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileSnapshot(root, relative) {
  const rows = [];
  function walk(current, rel) {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name), path.join(rel, name));
      return;
    }
    rows.push([rel.replaceAll(path.sep, "/"), fs.readFileSync(current).toString("base64")]);
  }
  walk(path.join(root, relative), relative);
  return rows;
}

const hasForm = !!process.env.R20_FORM_BASE_ROOT && !!process.env.R20_FORM33_ROOT && !!process.env.R20_CORE_PATH;
test("Form PR #33: base-grid duplicate-state proof closes precision collapse without widening earlier finite-state or combined-state rules", { skip: !hasForm }, () => {
  assert.equal(process.env.R20_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R20_FORM33_COMMIT, FORM_PR33);
  assert.equal(process.env.R20_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R20_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R20_FORM33_ROOT, "src"));
  const MT = require(path.resolve(process.env.R20_CORE_PATH));

  const collapse = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(collapse + 1, collapse);
  const grid = {
    counts: [2, 1, 1],
    step: [1, 0, 0],
    part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0] }
  };
  const input = request("r20-form-collapse", { grid });
  const before = JSON.stringify(input);
  const oldOut = Base.run(input);
  const newOut = Head.run(input);
  assert.equal(oldOut.status, "CANDIDATE", "integrated predecessor must demonstrate the precision-collapse hole");
  assert.equal(newOut.status, "HOLD");
  assert.equal(newOut.candidate, null);
  assert.equal(newOut.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(newOut.holds[0].detail, /duplicate authored state at \[1,0,0\]/);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(Head.run(input), newOut, "replay must be deterministic");

  const composed = request("r20-form-compose-collapse", { compose: [{ grid }] });
  assert.equal(Base.run(composed).status, "CANDIDATE");
  const composedOut = Head.run(composed);
  assert.equal(composedOut.status, "HOLD");
  assert.equal(composedOut.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(composedOut.holds[0].detail, /compose\[0\]\.grid: .*duplicate authored state/);

  const overflow = request("r20-form-existing-overflow", {
    grid: {
      counts: [2, 1, 1],
      step: [Number.MAX_VALUE, 0, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
    }
  });
  const oldOverflow = Base.run(overflow);
  const newOverflow = Head.run(overflow);
  assert.equal(oldOverflow.status, "HOLD", "generated finite-state overflow was already guarded before PR #33");
  assert.deepEqual(newOverflow, oldOverflow, "PR #33 must preserve the earlier overflow HOLD exactly rather than relabeling it as a new fix");

  const combined = request("r20-form-collapse-plus-rotation", {
    grid: {
      ...grid,
      rot_step: { x: [0, 15, 0] },
      part: { ...grid.part, rot: [0, 0, 0] }
    }
  });
  const oldCombined = Base.run(combined);
  const newCombined = Head.run(combined);
  assert.equal(newCombined.status, "CANDIDATE", JSON.stringify(newCombined.holds));
  assert.deepEqual(newCombined, oldCombined, "collapsed position remains valid when another already-proven progression distinguishes complete authored state");

  const ordinary = request("r20-form-real-receiver", {
    grid: {
      counts: [3, 2, 1],
      step: [2, 3, 0],
      part: { shape: "box", size: [0.5, 0.5, 0.5], pos: [0, 0, 0] }
    }
  });
  const oldOrdinary = Base.run(ordinary);
  const ordinaryOut = Head.run(ordinary);
  assert.equal(ordinaryOut.status, "CANDIDATE", JSON.stringify(ordinaryOut.holds));
  assert.deepEqual(ordinaryOut, oldOrdinary, "ordinary distinct grid output remains exact-equivalent to integrated behavior");
  const mesh = MT.compileMesh(MT.createTile(ordinaryOut.candidate));
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 6);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));
  const xs = mesh.P.filter((_, i) => i % 3 === 0);
  const ys = mesh.P.filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 4);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 3);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-base-grid-distinctness-round20/v0.2",
    target_commit: FORM_PR33,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "predecessor-demonstrates-precision-collapse-hole",
      "standalone-and-compose-collapse-hold",
      "deterministic-source-preserving-replay",
      "preexisting-overflow-hold-preserved-exactly",
      "collapsed-position-plus-distinguishing-rotation-remains-valid",
      "ordinary-semantics-exact-equivalence",
      "real-core-two-axis-grid-effect"
    ],
    placement: "FORM_MACHINE_BASE_GRID_FINAL_STATE_PROOF"
  }));
});

function uiEligibility(id, name) {
  return {
    candidate: { schema: "morphtile.tile-spec/v0.4", id, name, form_hints: ["ui_panel"], facets: {} },
    provenance: { caller: "verification-ui-eligibility" }
  };
}

function panelDefinition() {
  return {
    id: "panel",
    name: "Verification round 20 panel definition",
    created_by: "verification-round20",
    body: { facets: { mesh: { type: "generated", source: null, data: { generator: "recipe", vars: {}, parts: [{ shape: "plane", size: [2, 1, 1] }] } } } }
  };
}

function applyImported(MT, receiver, imported) {
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
}

const hasAssembly = !!process.env.R20_ASSEMBLY_BASE_ROOT && !!process.env.R20_ASSEMBLY33_ROOT && !!process.env.R20_SURFACE_ROOT && !!process.env.R20_CAPABILITY_ROOT && !!process.env.R20_INTERFACE_ROOT && !!process.env.R20_FORM_INTEGRATED_ROOT && !!process.env.R20_CORE_PATH;
test("Assembly PR #33: evidence-only current receiver lane preserves content identity across provenance changes and fails closed on kit corruption", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R20_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R20_ASSEMBLY33_COMMIT, ASSEMBLY_PR33);
  assert.equal(process.env.R20_FORM_INTEGRATED_COMMIT, FORM_BASE);
  assert.equal(process.env.R20_SURFACE_COMMIT, SURFACE);
  assert.equal(process.env.R20_CAPABILITY_COMMIT, CAPABILITY);
  assert.equal(process.env.R20_INTERFACE_COMMIT, INTERFACE);
  assert.equal(process.env.R20_CORE_COMMIT, CORE);

  for (const runtimePath of ["src", "machine.json", "package.json"]) {
    assert.deepEqual(fileSnapshot(process.env.R20_ASSEMBLY33_ROOT, runtimePath), fileSnapshot(process.env.R20_ASSEMBLY_BASE_ROOT, runtimePath), `${runtimePath} must remain byte-identical in an evidence-only receiver candidate`);
  }

  const Assembly = require(path.join(process.env.R20_ASSEMBLY33_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R20_ASSEMBLY33_ROOT, "src", "kit"));
  const Form = require(path.join(process.env.R20_FORM_INTEGRATED_ROOT, "src"));
  const Surface = require(path.join(process.env.R20_SURFACE_ROOT, "src"));
  const Capability = require(path.join(process.env.R20_CAPABILITY_ROOT, "src"));
  const Interface = require(path.join(process.env.R20_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R20_CORE_PATH));
  const id = "mt_verification_round20_panel";
  const name = "Verification round 20 portable panel";

  function outputs(tag, color) {
    const form = Form.run(request(`${tag}-form`, { repeat: { count: 3, step: [2, 0, 0], instance: { use: "panel", scale: [0.4, 1, 1] } } }, `${tag}-form-caller`));
    const surface = Surface.run(request(`${tag}-surface`, { base_color: color }, `${tag}-surface-caller`));
    const capability = Capability.run(request(`${tag}-capability`, { kind: "counter", initial: 2 }, `${tag}-capability-caller`));
    const interfaceOut = Interface.run(request(`${tag}-interface`, {
      tile_path: id,
      title: name,
      elements: [{
        kind: "repeat", binding: "count", step: 1, max: 4,
        children: [
          { kind: "text", text: "slot-r20" },
          { kind: "repeat_when", source: "index", comparison: "at_least", value: 1, children: [{ kind: "text", text: "after-first-r20" }] },
          { kind: "repeat_when", source: "index", comparison: "below", value: 2, children: [{ kind: "text", text: "first-two-r20" }] },
          { kind: "repeat_when", source: "count", comparison: "at_least", value: 3, children: [{ kind: "text", text: "crowded-r20" }] }
        ]
      }],
      bindings: { readouts: ["count"] }
    }, `${tag}-interface-caller`));
    for (const [label, output] of Object.entries({ form, surface, capability, interface: interfaceOut })) assert.equal(output.status, "CANDIDATE", `${tag}/${label}: ${JSON.stringify(output.holds)}`);
    return { form, surface, capability, interfaceOut };
  }

  function assembleSet(set, tag) {
    return Assembly.run({
      envelope_version: "0.1",
      request_id: `${tag}-assembly`,
      goal: "independently verify portable content identity and receiver meaning",
      intent: { id, name },
      inputs: [uiEligibility(id, name), set.form, set.surface, set.capability, set.interfaceOut],
      world_requirements: { definitions: { panel: panelDefinition() } },
      provenance: { caller: `${tag}-assembly-caller` }
    });
  }

  const setA = outputs("r20-a", [0.15, 0.35, 0.65]);
  const setB = outputs("r20-b", [0.15, 0.35, 0.65]);
  const assembledA = assembleSet(setA, "r20-a");
  const assembledB = assembleSet(setB, "r20-b");
  assert.equal(assembledA.status, "CANDIDATE", JSON.stringify(assembledA.holds));
  assert.equal(assembledB.status, "CANDIDATE", JSON.stringify(assembledB.holds));
  assert.deepEqual(assembledA.candidate, assembledB.candidate, "source request/provenance changes alone must not rewrite candidate content");
  assert.deepEqual(assembledA.dependencies, assembledB.dependencies);
  assert.equal(assembledA.closure_hash, assembledB.closure_hash, "closure identity must exclude source-history sidecars");
  assert.equal(Object.prototype.hasOwnProperty.call(assembledA.candidate.facets.material.data, "paint"), false);
  assert.deepEqual(assembledA.required_definitions, ["panel"]);

  const portableA = materializeKit(assembledA, MT, { name: "Verification round 20 kit" });
  const portableB = materializeKit(assembledB, MT, { name: "Verification round 20 kit" });
  assert.equal(portableA.status, "CANDIDATE", JSON.stringify(portableA.holds));
  assert.equal(portableB.status, "CANDIDATE", JSON.stringify(portableB.holds));
  assert.equal(portableA.kit.expect.sha256, portableB.kit.expect.sha256, "kit content hash must remain stable when only source-history changes");
  assert.equal(portableA.dependency_resolution.length, 1);
  assert.equal(portableA.dependency_resolution[0].status, "SATISFIED");
  assert.equal(portableA.dependency_resolution[0].proof_scope, "staged_morphtile_world");
  assert.equal(Object.prototype.hasOwnProperty.call(portableA.kit.tile.facets.material.data, "paint"), false);

  const changedSet = outputs("r20-c", [0.65, 0.35, 0.15]);
  const assembledChanged = assembleSet(changedSet, "r20-c");
  const portableChanged = materializeKit(assembledChanged, MT, { name: "Verification round 20 kit" });
  assert.equal(assembledChanged.status, "CANDIDATE", JSON.stringify(assembledChanged.holds));
  assert.equal(portableChanged.status, "CANDIDATE", JSON.stringify(portableChanged.holds));
  assert.notEqual(assembledChanged.closure_hash, assembledA.closure_hash, "semantic material change must change Assembly closure identity");
  assert.notEqual(portableChanged.kit.expect.sha256, portableA.kit.expect.sha256, "semantic material change must change MorphTile kit payload identity");

  const tampered = clone(portableA.kit);
  tampered.tile.facets.material.data.color[0] = 0.99;
  const corruptImport = MT.importKit(MT.createWorld("Verification corrupt receiver"), tampered);
  assert.notEqual(corruptImport.status, "READY", "payload mutation without a matching kit receipt must fail closed");

  const receiver = MT.createWorld("Verification round 20 receiver");
  const imported = MT.importKit(receiver, clone(portableA.kit));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  assert.equal(imported.evidence, "verified_payload_sha256");
  applyImported(MT, receiver, imported);
  const received = MT.resolveTile(receiver, id);
  assert.ok(received);
  assert.equal(received.facets.logic.data.vars.count, 2);
  for (const local of ["index", "i", "i_of"]) assert.equal(Object.prototype.hasOwnProperty.call(received.facets.logic.data.vars, local), false, `${local} must remain lexical rather than canonical state`);
  assert.equal(Object.prototype.hasOwnProperty.call(received.facets.material.data, "paint"), false);

  const mesh = MT.compileMesh(received, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.every(Number.isFinite));

  const beforeRender = MT.structHash(receiver);
  const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
  assert.equal((html.match(/slot-r20/g) || []).length, 2);
  assert.equal((html.match(/after-first-r20/g) || []).length, 1);
  assert.equal((html.match(/first-two-r20/g) || []).length, 2);
  assert.equal((html.match(/crowded-r20/g) || []).length, 0);
  assert.equal(MT.structHash(receiver), beforeRender, "receiver rendering must remain structurally read-only");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-current-kit-integrity-round20/v0.2",
    target_commit: ASSEMBLY_PR33,
    predecessor_commit: ASSEMBLY_BASE,
    producer_commits: { form: FORM_BASE, surface: SURFACE, capability: CAPABILITY, interface: INTERFACE },
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "runtime-byte-identical-to-integrated-base",
      "source-history-does-not-change-candidate-closure-or-kit-content-identity",
      "semantic-material-change-changes-closure-and-kit-identities",
      "surface-base-only-omission-survives-assembly-kit-import",
      "known-interface-proof-dependency-satisfied",
      "tampered-kit-payload-fails-closed",
      "fresh-world-import-verifies-payload-sha256",
      "form-definition-closes-and-compiles-finite-three-part-geometry",
      "repeat-local-index-and-count-evaluate-without-canonical-state-pollution",
      "render-read-only"
    ],
    historical_verifier_failure: "run 35584434967 overclaimed producer responsibilities by treating pre-existing grid overflow as a new hole and compatible input permutation as contractually order-insensitive",
    visual_quality: "NOT_TESTED",
    placement: "ASSEMBLY_MACHINE_RECEIVER_EVIDENCE"
  }));
});
