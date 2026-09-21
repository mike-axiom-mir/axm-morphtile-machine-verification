"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM = "dd6975f29390e3175642a7d510b3c5320415b620";
const ASSEMBLY_BASE = "e72c625d8dad99b2021e9ddf3782cf90f158a46b";
const ASSEMBLY_PR33 = "316d6dcc6c0682db3e91ae97c301e83886faa9de";
const SURFACE = "4e4495182aa83e5dfba37722fc3756a70cfaafaa";
const CAPABILITY = "edc07af182ee26ca1ceb64b5d5205591ec6aca9d";
const INTERFACE = "8516da3a414c416ec1f76b1078901c56c49b04db";

function request(id, intent, caller) {
  return { envelope_version: "0.1", request_id: id, goal: "round 20 independent kit replay", intent, provenance: { caller } };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function snapshot(root, relative) {
  const rows = [];
  function walk(current, rel) {
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current).sort()) walk(path.join(current, name), path.join(rel, name));
    } else rows.push([rel.replaceAll(path.sep, "/"), fs.readFileSync(current).toString("base64")]);
  }
  walk(path.join(root, relative), relative);
  return rows;
}
function eligibility(id, name) {
  return { candidate: { schema: "morphtile.tile-spec/v0.4", id, name, form_hints: ["ui_panel"], facets: {} }, provenance: { caller: "verification-ui-eligibility" } };
}
function definition() {
  return { id: "panel", name: "Verification panel definition", created_by: "verification-round20", body: { facets: { mesh: { type: "generated", source: null, data: { generator: "recipe", vars: {}, parts: [{ shape: "plane", size: [2, 1, 1] }] } } } } };
}
function applyImported(MT, receiver, imported) {
  for (const op of imported.ops || []) MT.applyStructOp(receiver, op);
}

const enabled = !!process.env.R20_ASSEMBLY_BASE_ROOT && !!process.env.R20_ASSEMBLY33_ROOT && !!process.env.R20_FORM_INTEGRATED_ROOT && !!process.env.R20_SURFACE_ROOT && !!process.env.R20_CAPABILITY_ROOT && !!process.env.R20_INTERFACE_ROOT && !!process.env.R20_CORE_PATH;

test("Assembly PR #33 final: current integrated semantics retain content identity, kit integrity and lexical runtime meaning", { skip: !enabled }, () => {
  assert.equal(process.env.R20_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R20_ASSEMBLY33_COMMIT, ASSEMBLY_PR33);
  assert.equal(process.env.R20_FORM_INTEGRATED_COMMIT, FORM);
  assert.equal(process.env.R20_SURFACE_COMMIT, SURFACE);
  assert.equal(process.env.R20_CAPABILITY_COMMIT, CAPABILITY);
  assert.equal(process.env.R20_INTERFACE_COMMIT, INTERFACE);
  assert.equal(process.env.R20_CORE_COMMIT, CORE);

  for (const p of ["src", "machine.json", "package.json"]) {
    assert.deepEqual(snapshot(process.env.R20_ASSEMBLY33_ROOT, p), snapshot(process.env.R20_ASSEMBLY_BASE_ROOT, p), `${p} must remain byte-identical: PR #33 is receiver evidence, not runtime mutation`);
  }

  const Assembly = require(path.join(process.env.R20_ASSEMBLY33_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R20_ASSEMBLY33_ROOT, "src", "kit"));
  const FormMachine = require(path.join(process.env.R20_FORM_INTEGRATED_ROOT, "src"));
  const SurfaceMachine = require(path.join(process.env.R20_SURFACE_ROOT, "src"));
  const CapabilityMachine = require(path.join(process.env.R20_CAPABILITY_ROOT, "src"));
  const InterfaceMachine = require(path.join(process.env.R20_INTERFACE_ROOT, "src"));
  const MT = require(path.resolve(process.env.R20_CORE_PATH));
  const id = "mt_verification_round20_panel";
  const name = "Verification round 20 portable panel";

  function producerSet(tag, color) {
    const form = FormMachine.run(request(`${tag}-form`, { repeat: { count: 3, step: [2, 0, 0], instance: { use: "panel", scale: [0.4, 1, 1] } } }, `${tag}-form-caller`));
    const surface = SurfaceMachine.run(request(`${tag}-surface`, { base_color: color }, `${tag}-surface-caller`));
    const capability = CapabilityMachine.run(request(`${tag}-capability`, { kind: "counter", initial: 2 }, `${tag}-capability-caller`));
    const interfaceOut = InterfaceMachine.run(request(`${tag}-interface`, {
      tile_path: id,
      title: name,
      elements: [{ kind: "repeat", binding: "count", step: 1, max: 4, children: [
        { kind: "text", text: "slot-r20" },
        { kind: "repeat_when", source: "index", comparison: "at_least", value: 1, children: [{ kind: "text", text: "after-first-r20" }] },
        { kind: "repeat_when", source: "index", comparison: "below", value: 2, children: [{ kind: "text", text: "first-two-r20" }] },
        { kind: "repeat_when", source: "count", comparison: "at_least", value: 3, children: [{ kind: "text", text: "crowded-r20" }] }
      ] }],
      bindings: { readouts: ["count"] }
    }, `${tag}-interface-caller`));
    for (const [label, output] of Object.entries({ form, surface, capability, interface: interfaceOut })) assert.equal(output.status, "CANDIDATE", `${label}: ${JSON.stringify(output.holds)}`);
    return { form, surface, capability, interfaceOut };
  }

  function assemble(set, tag) {
    return Assembly.run({
      envelope_version: "0.1",
      request_id: `${tag}-assembly`,
      goal: "verify source-history/content separation and receiver semantics",
      intent: { id, name },
      inputs: [eligibility(id, name), set.form, set.surface, set.capability, set.interfaceOut],
      world_requirements: { definitions: { panel: definition() } },
      provenance: { caller: `${tag}-assembly-caller` }
    });
  }

  const a = assemble(producerSet("r20-a", [0.15, 0.35, 0.65]), "r20-a");
  const b = assemble(producerSet("r20-b", [0.15, 0.35, 0.65]), "r20-b");
  assert.equal(a.status, "CANDIDATE", JSON.stringify(a.holds));
  assert.equal(b.status, "CANDIDATE", JSON.stringify(b.holds));
  assert.deepEqual(a.candidate, b.candidate, "request/provenance changes alone must not rewrite semantic candidate matter");
  assert.deepEqual(a.dependencies, b.dependencies);
  assert.deepEqual(a.closure_hash, b.closure_hash, "closure receipt object must be value-identical when only source-history changes");
  assert.equal(Object.prototype.hasOwnProperty.call(a.candidate.facets.material.data, "paint"), false);
  assert.deepEqual(a.required_definitions, ["panel"]);

  const kitA = materializeKit(a, MT, { name: "Verification round 20 kit" });
  const kitB = materializeKit(b, MT, { name: "Verification round 20 kit" });
  assert.equal(kitA.status, "CANDIDATE", JSON.stringify(kitA.holds));
  assert.equal(kitB.status, "CANDIDATE", JSON.stringify(kitB.holds));
  assert.equal(kitA.kit.expect.sha256, kitB.kit.expect.sha256, "kit payload hash must exclude source-history sidecars");
  assert.equal(kitA.dependency_resolution.length, 1);
  assert.equal(kitA.dependency_resolution[0].status, "SATISFIED");
  assert.equal(kitA.dependency_resolution[0].proof_scope, "staged_morphtile_world");
  assert.equal(Object.prototype.hasOwnProperty.call(kitA.kit.tile.facets.material.data, "paint"), false);

  const changed = assemble(producerSet("r20-c", [0.65, 0.35, 0.15]), "r20-c");
  const changedKit = materializeKit(changed, MT, { name: "Verification round 20 kit" });
  assert.equal(changed.status, "CANDIDATE", JSON.stringify(changed.holds));
  assert.equal(changedKit.status, "CANDIDATE", JSON.stringify(changedKit.holds));
  assert.notEqual(changed.closure_hash.value, a.closure_hash.value, "semantic material change must alter Assembly closure identity");
  assert.notEqual(changedKit.kit.expect.sha256, kitA.kit.expect.sha256, "semantic material change must alter MorphTile kit identity");

  const tampered = clone(kitA.kit);
  tampered.tile.facets.material.data.color[0] = 0.99;
  const corrupt = MT.importKit(MT.createWorld("corrupt receiver"), tampered);
  assert.notEqual(corrupt.status, "READY", "payload corruption without matching receipt must fail closed");

  const receiver = MT.createWorld("round20 receiver");
  const imported = MT.importKit(receiver, clone(kitA.kit));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  assert.equal(imported.evidence, "verified_payload_sha256");
  applyImported(MT, receiver, imported);
  const tile = MT.resolveTile(receiver, id);
  assert.ok(tile);
  assert.equal(tile.facets.logic.data.vars.count, 2);
  for (const local of ["index", "i", "i_of"]) assert.equal(Object.prototype.hasOwnProperty.call(tile.facets.logic.data.vars, local), false, `${local} must remain lexical`);
  assert.equal(Object.prototype.hasOwnProperty.call(tile.facets.material.data, "paint"), false);

  const mesh = MT.compileMesh(tile, receiver);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.ok(mesh.P.every(Number.isFinite));

  const beforeRender = MT.structHash(receiver);
  const html = MT.vnodeToHTML(MT.compilePanel(receiver).root);
  assert.equal((html.match(/slot-r20/g) || []).length, 2);
  assert.equal((html.match(/after-first-r20/g) || []).length, 1);
  assert.equal((html.match(/first-two-r20/g) || []).length, 2);
  assert.equal((html.match(/crowded-r20/g) || []).length, 0);
  assert.equal(MT.structHash(receiver), beforeRender, "rendering must be structurally read-only");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-current-kit-integrity-round20/v0.3",
    target_commit: ASSEMBLY_PR33,
    predecessor_commit: ASSEMBLY_BASE,
    producers: { form: FORM, surface: SURFACE, capability: CAPABILITY, interface: INTERFACE },
    receiver_commit: CORE,
    status: "PASS",
    checked: ["runtime-byte-identical", "source-history-excluded-from-content-identities", "semantic-change-alters-content-identities", "surface-omission-preserved", "dependency-proof-satisfied", "tamper-rejected", "fresh-import-sha-verified", "finite-form-receiver", "lexical-interface-runtime-without-state-pollution", "render-read-only"],
    visual_quality: "NOT_TESTED",
    placement: "ASSEMBLY_MACHINE_RECEIVER_EVIDENCE"
  }));
});
