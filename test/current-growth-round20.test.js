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
    goal: "independent Verification Machine round 20 replay",
    intent,
    provenance: { caller }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fileSnapshot(root, relative) {
  const start = path.join(root, relative);
  const rows = [];
  function walk(current, rel) {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) {
        walk(path.join(current, name), path.join(rel, name));
      }
      return;
    }
    rows.push([rel.replaceAll(path.sep, "/"), fs.readFileSync(current).toString("base64")]);
  }
  walk(start, relative);
  return rows;
}

const hasForm = !!process.env.R20_FORM_BASE_ROOT && !!process.env.R20_FORM33_ROOT && !!process.env.R20_CORE_PATH;
test("Form PR #33: base-grid final position proof rejects precision collapse and overflow without rejecting a distinct combined state", { skip: !hasForm }, () => {
  assert.equal(process.env.R20_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R20_FORM33_COMMIT, FORM_PR33);
  assert.equal(process.env.R20_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R20_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R20_FORM33_ROOT, "src"));
  const MT = require(path.resolve(process.env.R20_CORE_PATH));
  const collapse = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(collapse + 1, collapse, "fixture must exercise JavaScript integer precision collapse");

  const collapsed = request("r20-form33-collapse", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0] }
    }
  });
  const collapsedBefore = JSON.stringify(collapsed);
  const oldCollapsed = Base.run(collapsed);
  const newCollapsed = Head.run(collapsed);
  assert.equal(oldCollapsed.status, "CANDIDATE", "integrated predecessor must demonstrate the base-grid precision hole");
  assert.equal(newCollapsed.status, "HOLD");
  assert.equal(newCollapsed.candidate, null);
  assert.equal(newCollapsed.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(newCollapsed.holds[0].detail, /duplicate authored state at \[1,0,0\]/);
  assert.equal(JSON.stringify(collapsed), collapsedBefore, "candidate evaluation must not rewrite caller matter");
  assert.deepEqual(Head.run(collapsed), newCollapsed, "precision-collapse replay must be deterministic");

  const composed = request("r20-form33-compose-collapse", {
    compose: [{
      grid: {
        counts: [2, 1, 1],
        step: [1, 0, 0],
        part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0] }
      }
    }]
  });
  assert.equal(Base.run(composed).status, "CANDIDATE", "predecessor compose route must expose the same hole");
  const composedHead = Head.run(composed);
  assert.equal(composedHead.status, "HOLD");
  assert.equal(composedHead.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(composedHead.holds[0].detail, /compose\[0\]\.grid: .*duplicate authored state/);

  const overflowing = request("r20-form33-overflow", {
    grid: {
      counts: [2, 1, 1],
      step: [Number.MAX_VALUE, 0, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [Number.MAX_VALUE, 0, 0] }
    }
  });
  const oldOverflow = Base.run(overflowing);
  const newOverflow = Head.run(overflowing);
  assert.equal(oldOverflow.status, "CANDIDATE", "predecessor must demonstrate that finite inputs alone did not prove generated finite state");
  assert.equal(newOverflow.status, "HOLD");
  assert.equal(newOverflow.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.match(newOverflow.holds[0].detail, /non-finite generated state at \[1,0,0\]/);

  const combined = request("r20-form33-collapse-plus-rotation", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      rot_step: { x: [0, 15, 0] },
      part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0], rot: [0, 0, 0] }
    }
  });
  const oldCombined = Base.run(combined);
  const newCombined = Head.run(combined);
  assert.equal(newCombined.status, "CANDIDATE", JSON.stringify(newCombined.holds));
  assert.deepEqual(newCombined, oldCombined, "a collapsed translation component must remain valid when another already-proven progression distinguishes complete state");

  const ordinary = request("r20-form33-real-receiver", {
    grid: {
      counts: [3, 2, 1],
      step: [2, 3, 0],
      part: { shape: "box", size: [0.5, 0.5, 0.5], pos: [0, 0, 0] }
    }
  });
  const oldOrdinary = Base.run(ordinary);
  const out = Head.run(ordinary);
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out, oldOrdinary, "ordinary distinct base-grid semantics must remain exact across the final proof");
  const mesh = MT.compileMesh(MT.createTile(out.candidate));
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 6);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));
  const xs = mesh.P.filter((_, i) => i % 3 === 0);
  const ys = mesh.P.filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 4, "real receiver must consume X grid translation");
  assert.ok(Math.max(...ys) - Math.min(...ys) > 3, "real receiver must consume Y grid translation");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-base-grid-distinctness-round20/v0.1",
    target_commit: FORM_PR33,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "predecessor-demonstrates-base-grid-precision-hole",
      "standalone-collapse-holds",
      "compose-collapse-holds",
      "generated-overflow-holds",
      "collapsed-translation-plus-distinguishing-rotation-passes",
      "deterministic-source-preserving-replay",
      "ordinary-semantics-exact-equivalence",
      "real-core-two-axis-grid-effect"
    ],
    placement: "FORM_MACHINE_BASE_GRID_FINAL_STATE_PROOF"
  }));
});

function uiEligibility(id, name) {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      id,
      name,
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "verification-ui-eligibility" }
  };
}

function panelDefinition() {
  return {
    id: "panel",
    name: "Verification round 20 panel definition",
    created_by: "verification-round20",
    body: {
      facets: {
        mesh: {
          type: "generated",
          source: null,
          data: {
            generator: "recipe",
            vars: {},
            parts: [{ shape: "plane", size: [2, 1, 1] }]
          }
        }
      }
    }
  };
}

function applyImported(MT, receiver, imported) {
  for (const operation of imported.ops || []) MT.applyStructOp(receiver, operation);
}

const hasAssembly = !!process.env.R20_ASSEMBLY_BASE_ROOT && !!process.env.R20_ASSEMBLY33_ROOT && !!process.env.R20_SURFACE_ROOT && !!process.env.R20_CAPABILITY_ROOT && !!process.env.R20_INTERFACE_ROOT && !!process.env.R20_FORM_INTEGRATED_ROOT && !!process.env.R20_CORE_PATH;
test("Assembly PR #33: current integrated semantics are portable with stable content hashes, corruption rejection, lexical runtime meaning, and no runtime source rewrite", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R20_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R20_ASSEMBLY33_COMMIT, ASSEMBLY_PR33);
  assert.equal(process.env.R20_FORM_INTEGRATED_COMMIT, FORM_BASE);
  assert.equal(process.env.R20_SURFACE_COMMIT, SURFACE);
  assert.equal(process.env.R20_CAPABILITY_COMMIT, CAPABILITY);
  assert.equal(process.env.R20_INTERFACE_COMMIT, INTERFACE);
  assert.equal(process.env.R20_CORE_COMMIT, CORE);

  for (const runtimePath of ["src", "machine.json", "package.json"]) {
    assert.deepEqual(
      fileSnapshot(process.env.R20_ASSEMBLY33_ROOT, runtimePath),
      fileSnapshot(process.env.R20_ASSEMBLY_BASE_ROOT, runtimePath),
      `${runtimePath} must remain byte-identical in an evidence-only receiver candidate`
    );
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

  function producerOutputs(tag, color) {
    const form = Form.run(request(`${tag}-form`, {
      repeat: {
        count: 3,
        step: [2, 0, 0],
        instance: { use: "panel", scale: [0.4, 1, 1] }
      }
    }, `${tag}-form-caller`));
    const surface = Surface.run(request(`${tag}-surface`, { base_color: color }, `${tag}-surface-caller`));
    const capability = Capability.run(request(`${tag}-capability`, { kind: "counter", initial: 2 }, `${tag}-capability-caller`));
    const interfaceOut = Interface.run(request(`${tag}-interface`, {
      tile_path: id,
      title: name,
      elements: [{
        kind: "repeat",
        binding: "count",
        step: 1,
        max: 4,
        children: [
          { kind: "text", text: "slot-r20" },
          { kind: "repeat_when", source: "index", comparison: "at_least", value: 1, children: [{ kind: "text", text: "after-first-r20" }] },
          { kind: "repeat_when", source: "index", comparison: "below", value: 2, children: [{ kind: "text", text: "first-two-r20" }] },
          { kind: "repeat_when", source: "count", comparison: "at_least", value: 3, children: [{ kind: "text", text: "crowded-r20" }] }
        ]
      }],
      bindings: { readouts: ["count"] }
    }, `${tag}-interface-caller`));
    for (const [label, output] of Object.entries({ form, surface, capability, interface: interfaceOut })) {
      assert.equal(output.status, "CANDIDATE", `${tag}/${label}: ${JSON.stringify(output.holds)}`);
    }
    return { form, surface, capability, interfaceOut };
  }

  function assembleSet(outputs, tag, reverse = false) {
    const inputs = [uiEligibility(id, name), outputs.form, outputs.surface, outputs.capability, outputs.interfaceOut];
    if (reverse) inputs.reverse();
    return Assembly.run({
      envelope_version: "0.1",
      request_id: `${tag}-assembly`,
      goal: "independently verify portable content identity and receiver meaning",
      intent: { id, name },
      inputs,
      world_requirements: { definitions: { panel: panelDefinition() } },
      provenance: { caller: `${tag}-assembly-caller` }
    });
  }

  const outputsA = producerOutputs("r20-a", [0.15, 0.35, 0.65]);
  const outputsB = producerOutputs("r20-b", [0.15, 0.35, 0.65]);
  const assembledA = assembleSet(outputsA, "r20-a", false);
  const assembledB = assembleSet(outputsB, "r20-b", true);
  assert.equal(assembledA.status, "CANDIDATE", JSON.stringify(assembledA.holds));
  assert.equal(assembledB.status, "CANDIDATE", JSON.stringify(assembledB.holds));
  assert.deepEqual(assembledA.candidate, assembledB.candidate, "compatible input ordering and source provenance must not rewrite semantic candidate matter");
  assert.deepEqual(assembledA.dependencies, assembledB.dependencies, "semantic dependency closure must remain stable across source ordering");
  assert.equal(assembledA.closure_hash, assembledB.closure_hash, "Assembly closure hash must identify semantic closure rather than source/provenance order");
  assert.equal(Object.prototype.hasOwnProperty.call(assembledA.candidate.facets.material.data, "paint"), false, "Assembly must preserve current Surface base-color-only omission");
  assert.equal(assembledA.candidate.facets.logic.data.vars.count, 2);
  assert.deepEqual(assembledA.required_definitions, ["panel"]);

  const portableA = materializeKit(assembledA, MT, { name: "Verification round 20 kit" });
  const portableB = materializeKit(assembledB, MT, { name: "Verification round 20 kit" });
  assert.equal(portableA.status, "CANDIDATE", JSON.stringify(portableA.holds));
  assert.equal(portableB.status, "CANDIDATE", JSON.stringify(portableB.holds));
  assert.equal(portableA.kit.expect.sha256, portableB.kit.expect.sha256, "MorphTile portable payload hash must remain stable when only provenance/request order changes");
  assert.equal(portableA.dependency_resolution.length, 1);
  assert.equal(portableA.dependency_resolution[0].status, "SATISFIED");
  assert.equal(portableA.dependency_resolution[0].proof_scope, "staged_morphtile_world");
  assert.equal(Object.prototype.hasOwnProperty.call(portableA.kit.tile.facets.material.data, "paint"), false);

  const outputsChanged = producerOutputs("r20-c", [0.65, 0.35, 0.15]);
  const assembledChanged = assembleSet(outputsChanged, "r20-c", false);
  assert.equal(assembledChanged.status, "CANDIDATE", JSON.stringify(assembledChanged.holds));
  const portableChanged = materializeKit(assembledChanged, MT, { name: "Verification round 20 kit" });
  assert.equal(portableChanged.status, "CANDIDATE", JSON.stringify(portableChanged.holds));
  assert.notEqual(assembledChanged.closure_hash, assembledA.closure_hash, "semantic material change must change Assembly closure identity");
  assert.notEqual(portableChanged.kit.expect.sha256, portableA.kit.expect.sha256, "semantic material change must change MorphTile kit payload identity");

  const corruptedKit = clone(portableA.kit);
  corruptedKit.tile.facets.material.data.color[0] = 0.99;
  const corruptReceiver = MT.createWorld("Verification corrupt receiver");
  const corruptImport = MT.importKit(corruptReceiver, corruptedKit);
  assert.notEqual(corruptImport.status, "READY", "payload mutation without recomputing kit receipt must fail closed");

  const receiver = MT.createWorld("Verification round 20 receiver");
  const imported = MT.importKit(receiver, clone(portableA.kit));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  assert.equal(imported.evidence, "verified_payload_sha256");
  applyImported(MT, receiver, imported);
  const received = MT.resolveTile(receiver, id);
  assert.ok(received);
  assert.equal(received.facets.logic.data.vars.count, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(received.facets.logic.data.vars, "index"), false, "repeat lexical index must not be copied into canonical logic state");
  assert.equal(Object.prototype.hasOwnProperty.call(received.facets.logic.data.vars, "i"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(received.facets.logic.data.vars, "i_of"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(received.facets.material.data, "paint"), false);

  const mesh = MT.compileMesh(received, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.every(Number.isFinite));

  const beforeRender = MT.structHash(receiver);
  const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
  assert.equal((html.match(/slot-r20/g) || []).length, 2, "canonical count=2 must drive exactly two repeated bodies");
  assert.equal((html.match(/after-first-r20/g) || []).length, 1, "index >= 1 must use lexical repeat index");
  assert.equal((html.match(/first-two-r20/g) || []).length, 2, "index < 2 must use lexical indices 0 and 1");
  assert.equal((html.match(/crowded-r20/g) || []).length, 0, "repeat-local count >= 3 must remain false when canonical count is 2");
  assert.equal(MT.structHash(receiver), beforeRender, "receiver rendering must remain structurally read-only");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-current-kit-integrity-round20/v0.1",
    target_commit: ASSEMBLY_PR33,
    predecessor_commit: ASSEMBLY_BASE,
    producer_commits: { form: FORM_BASE, surface: SURFACE, capability: CAPABILITY, interface: INTERFACE },
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "assembly-runtime-byte-identical-to-integrated-base",
      "compatible-input-order-does-not-change-semantic-candidate",
      "provenance-order-does-not-change-closure-or-kit-content-hash",
      "semantic-material-change-changes-both-content-identities",
      "surface-base-only-omission-survives-assembly-kit-import",
      "known-interface-proof-dependency-satisfied-in-staged-matter",
      "tampered-kit-payload-fails-closed",
      "fresh-world-import-verifies-payload-sha256",
      "form-definition-closes-and-compiles-finite-three-part-geometry",
      "repeat-local-index-and-count-evaluate-at-render-without-canonical-state-pollution",
      "render-read-only"
    ],
    visual_quality: "NOT_TESTED",
    placement: "ASSEMBLY_MACHINE_RECEIVER_EVIDENCE"
  }));
});
