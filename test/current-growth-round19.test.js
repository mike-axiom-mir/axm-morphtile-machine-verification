"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "d83b9c92a90c71f0b0be62bdf63bd903387cfa01";
const FORM_PR32 = "752963988b66adb8bb8f17406e83bfff6b5aa58e";
const INTERFACE_BASE = "8516da3a414c416ec1f76b1078901c56c49b04db";
const INTERFACE_PR27 = "55f9ea7e96db0c65c7440550c9f4a7800facd34e";
const ASSEMBLY_BASE = "dffd3af4222dd3e404b1d21343db347444893eb4";
const ASSEMBLY_PR31 = "6aa70c4d74526099e3c8856a1d181a423ef338c5";
const ASSEMBLY_PR32 = "8f0ac5f6fa1d7c50f285cb97f6a8a06865715e08";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 19 replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formDefinitionWorld() {
  return {
    defs: {
      panel: {
        id: "panel",
        name: "Parametric panel",
        body: {
          facets: {
            mesh: {
              type: "generated",
              source: null,
              data: {
                generator: "recipe",
                vars: { width: 1 },
                parts: [{ shape: "box", size: [["var", "width"], 0.25, 0.5] }]
              }
            }
          }
        }
      }
    }
  };
}

function commitInterface(MT, ws, output, label) {
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

const hasForm = !!process.env.R19_FORM_BASE_ROOT && !!process.env.R19_FORM32_ROOT && !!process.env.R19_CORE_PATH;
test("Form PR #32: base repeat arithmetic convergence preserves integrated semantics, prior precision guard, exact HOLD details and real receiver meaning", { skip: !hasForm }, () => {
  assert.equal(process.env.R19_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R19_FORM32_COMMIT, FORM_PR32);
  assert.equal(process.env.R19_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R19_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R19_FORM32_ROOT, "src"));
  const MT = require(path.resolve(process.env.R19_CORE_PATH));

  const corpus = [
    request("r19-form32-definition-repeat", { repeat: { count: 4, step: [0.5, 0, -1], instance: { use: "panel", pos: [10, -2, 3], with: { width: 2 } }, with_step: { width: -0.25 } } }),
    request("r19-form32-position-overflow", { repeat: { count: 2, step: [Number.MAX_VALUE, 0, 0], part: { shape: "box", pos: [Number.MAX_VALUE, 0, 0] } } }),
    request("r19-form32-setting-overflow", { repeat: { count: 2, step: [1, 0, 0], instance: { use: "panel", with: { width: Number.MAX_VALUE } }, with_step: { width: Number.MAX_VALUE } } }),
    request("r19-form32-prior-precision-collapse", { repeat: { count: 2, step: [1, 0, 0], part: { shape: "box", pos: [Number.MAX_SAFE_INTEGER + 1, 0, 0] } } })
  ];

  for (const authored of corpus) {
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.deepEqual(candidate, baseline, `${authored.request_id}: convergence must preserve the exact public result`);
    assert.equal(JSON.stringify(authored), before, `${authored.request_id}: caller matter must remain unchanged`);
    assert.deepEqual(Head.run(authored), candidate, `${authored.request_id}: replay must be deterministic`);
  }

  const positive = Head.run(corpus[0]);
  assert.equal(positive.status, "CANDIDATE", JSON.stringify(positive.holds));
  const leaf = positive.candidate.facets.mesh.data.parts[0].body[0];
  assert.deepEqual(leaf.pos, [["+", 10, ["*", ["var", "i"], 0.5]], -2, ["+", 3, ["*", ["var", "i"], -1]]]);
  assert.deepEqual(leaf.with.width, ["+", 2, ["*", ["var", "i"], -0.25]]);

  const positionOverflow = Head.run(corpus[1]);
  assert.equal(positionOverflow.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  assert.equal(positionOverflow.holds[0].detail, "repeat position axis 0 produces a non-finite generated value at index 1");
  const settingOverflow = Head.run(corpus[2]);
  assert.equal(settingOverflow.holds[0].code, "HOLD_FORM_REPEAT_INVALID");
  assert.equal(settingOverflow.holds[0].detail, "repeat.with_step.width produces a non-finite generated value at index 1");
  const precision = Head.run(corpus[3]);
  assert.equal(precision.status, "HOLD");
  assert.match(precision.holds[0].detail, /duplicate authored state/);

  const world = formDefinitionWorld();
  const tile = MT.createTile(positive.candidate);
  world.tiles = { [tile.id]: tile };
  const mesh = MT.compileMesh(tile, world);
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 4);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));

  const fixed = clone(positive.candidate);
  const fixedLeaf = fixed.facets.mesh.data.parts[0].body[0];
  fixedLeaf.pos = [10, -2, 3];
  fixedLeaf.with.width = 2;
  const fixedTile = MT.createTile(fixed);
  world.tiles[fixedTile.id] = fixedTile;
  const fixedMesh = MT.compileMesh(fixedTile, world);
  assert.equal(fixedMesh.hold, null, JSON.stringify(fixedMesh));
  assert.notDeepEqual(mesh.P, fixedMesh.P, "real MorphTile must consume the compact repeat expressions preserved by the convergence");

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/form-base-repeat-kernel-round19/v0.1", target_commit: FORM_PR32, predecessor_commit: FORM_BASE, receiver_commit: CORE, status: "PASS", checked: ["exact-public-equivalence", "canonical-translation-expression", "canonical-definition-setting-expression", "legacy-overflow-hold-detail", "prior-precision-collapse-guard-retained", "deterministic-source-preserving-replay", "real-core-receiver-effect"], placement: "FORM_MACHINE_INTERNAL_CONVERGENCE" }));
});

const hasInterface = !!process.env.R19_INTERFACE_BASE_ROOT && !!process.env.R19_INTERFACE27_ROOT && !!process.env.R19_CORE_PATH;
test("Interface PR #27: null placement authorship fails closed while genuine omission stays omitted through real core commit/default resolution/rollback", { skip: !hasInterface }, () => {
  assert.equal(process.env.R19_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R19_INTERFACE27_COMMIT, INTERFACE_PR27);
  assert.equal(process.env.R19_CORE_COMMIT, CORE);
  const Base = require(path.join(process.env.R19_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R19_INTERFACE27_ROOT, "src"));
  const MT = require(path.resolve(process.env.R19_CORE_PATH));

  const cases = [["dock", { mode: "docked", dock: null }], ["preferred_size", { mode: "screen", preferred_size: null }], ["preferred_position", { mode: "screen", preferred_position: null }], ["user_adjustable", { mode: "screen", user_adjustable: null }], ["anchor", { mode: "tile", anchor: null }]];
  for (const [field, placement] of cases) {
    const authored = request(`r19-interface-null-${field}`, { tile_path: "mt_tower", title: "Null placement proof", text: "placement source-integrity proof", placement });
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.equal(baseline.status, "CANDIDATE", `${field}: integrated predecessor must demonstrate the repaired null-admission bug`);
    assert.equal(candidate.status, "HOLD", `${field}: explicit null must not survive as pseudo-absence`);
    assert.equal(candidate.candidate, null);
    assert.equal(candidate.holds[0].code, "HOLD_INVALID_PRESENTATION_PLACEMENT");
    assert.match(candidate.holds[0].detail, new RegExp(`placement\\.${field}`));
    assert.equal(JSON.stringify(authored), before, `${field}: caller matter must not be rewritten`);
    assert.deepEqual(Head.run(authored), candidate, `${field}: replay must be deterministic`);
  }

  const omitted = request("r19-interface-omitted-dock", { tile_path: "mt_tower", title: "Native dock default", text: "No producer-side dock default", placement: { mode: "docked" } });
  const out = Head.run(omitted);
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.candidate.operations[1].presentation, { mode: "docked" });

  const explicitFalse = request("r19-interface-explicit-false-zero", { tile_path: "mt_tower", title: "Explicit portable placement values", text: "False and zero are authored values", placement: { mode: "screen", user_adjustable: false, preferred_position: [0, 0] } });
  const explicitOut = Head.run(explicitFalse);
  assert.equal(explicitOut.status, "CANDIDATE", JSON.stringify(explicitOut.holds));
  assert.deepEqual(explicitOut.candidate.operations[1].presentation, { mode: "screen", preferred_position: [0, 0], user_adjustable: false });

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const committed = commitInterface(MT, ws, out, "r19-interface-placement");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, { mode: "docked" }, "canonical matter must preserve genuine omission");
  const canonicalHash = MT.hashOf(ws.live);
  const resolved = MT.resolvePresentation(ws.live, "mt_tower");
  assert.equal(resolved.status, "READY", JSON.stringify(resolved));
  assert.equal(resolved.resolved.dock, "right", "native core may supply its docked default without rewriting canonical matter");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, { mode: "docked" });
  assert.equal(MT.hashOf(ws.live), canonicalHash, "presentation resolution must remain structurally read-only");
  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeHash);

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/interface-placement-presence-round19/v0.1", target_commit: INTERFACE_PR27, predecessor_commit: INTERFACE_BASE, receiver_commit: CORE, status: "PASS", checked: ["predecessor-demonstrates-null-admission", "all-five-null-placement-fields-fail-closed", "deterministic-source-preserving-replay", "false-and-zero-remain-authored-values", "genuine-omission-stays-omitted", "native-core-default-resolution-read-only", "exact-rollback"], visual_quality: "NOT_TESTED", placement: "INTERFACE_MACHINE_AUTHORSHIP_CORE_RUNTIME_DEFAULT" }));
});

function assemblyFixture(root) { return require(path.join(root, "fixtures", "request.assembly.json")); }

const hasAssembly31 = !!process.env.R19_ASSEMBLY_BASE_ROOT && !!process.env.R19_ASSEMBLY31_ROOT;
test("Assembly PR #31: authored name validity and upstream HOLD-container identity fail closed without overreaching into valid omission/control paths", { skip: !hasAssembly31 }, () => {
  assert.equal(process.env.R19_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R19_ASSEMBLY31_COMMIT, ASSEMBLY_PR31);
  const Base = require(path.join(process.env.R19_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R19_ASSEMBLY31_ROOT, "src"));
  const fixture = assemblyFixture(process.env.R19_ASSEMBLY31_ROOT);

  const structuredName = clone(fixture);
  structuredName.request_id = "r19-assembly31-structured-name";
  structuredName.intent.name = { text: "not a semantic name" };
  const structuredBefore = JSON.stringify(structuredName);
  const oldName = Base.run(structuredName);
  const newName = Head.run(structuredName);
  assert.equal(oldName.status, "CANDIDATE", "integrated predecessor must demonstrate structured truthy name admission");
  assert.deepEqual(oldName.candidate.name, { text: "not a semantic name" });
  assert.equal(newName.status, "HOLD");
  assert.equal(newName.holds[0].code, "HOLD_ASSEMBLY_NAME_INVALID");
  assert.equal(newName.holds[0].path, "request.intent.name");
  assert.equal(JSON.stringify(structuredName), structuredBefore);
  assert.deepEqual(Head.run(structuredName), newName);

  const badHolds = clone(fixture);
  badHolds.request_id = "r19-assembly31-holds-map";
  badHolds.inputs.push({ envelope_version: "0.1", request_id: "upstream-held-map", status: "HOLD", machine: { id: "axm.test.producer", version: "0.1" }, candidate: null, holds: { code: "HOLD_NOT_AN_ARRAY" } });
  const oldHolds = Base.run(badHolds);
  const newHolds = Head.run(badHolds);
  assert.equal(oldHolds.status, "HOLD");
  assert.equal(oldHolds.holds[0].code, "HOLD_INPUT_NOT_CANDIDATE", "predecessor must demonstrate host-container reinterpretation before the repair");
  assert.deepEqual(oldHolds.holds[0].upstream_holds, { code: "HOLD_NOT_AN_ARRAY" });
  assert.equal(newHolds.status, "HOLD");
  assert.equal(newHolds.holds[0].code, "HOLD_HOLDS_SHAPE_INVALID");
  assert.equal(newHolds.holds[0].path, "request.inputs[2].holds");

  const validHeld = clone(fixture);
  validHeld.request_id = "r19-assembly31-valid-holds-control";
  validHeld.inputs.push({ envelope_version: "0.1", request_id: "upstream-held-array", status: "HOLD", machine: { id: "axm.test.producer", version: "0.1" }, candidate: null, holds: [{ code: "HOLD_UPSTREAM_CONTROL", detail: "preserve me" }] });
  const validHeldOut = Head.run(validHeld);
  assert.equal(validHeldOut.status, "HOLD");
  assert.equal(validHeldOut.holds[0].code, "HOLD_INPUT_NOT_CANDIDATE");
  assert.deepEqual(validHeldOut.holds[0].upstream_holds, [{ code: "HOLD_UPSTREAM_CONTROL", detail: "preserve me" }]);

  const nullHeld = clone(fixture);
  nullHeld.request_id = "r19-assembly31-null-holds-control";
  nullHeld.inputs.push({ status: "HOLD", candidate: null, holds: null });
  const nullHeldOut = Head.run(nullHeld);
  assert.equal(nullHeldOut.status, "HOLD");
  assert.equal(nullHeldOut.holds[0].code, "HOLD_INPUT_NOT_CANDIDATE");
  assert.deepEqual(nullHeldOut.holds[0].upstream_holds, [], "this candidate deliberately retains the established null-omission behavior");

  const absentName = clone(fixture);
  absentName.request_id = "r19-assembly31-name-absent";
  delete absentName.intent.name;
  const absentOut = Head.run(absentName);
  assert.equal(absentOut.status, "CANDIDATE", JSON.stringify(absentOut.holds));
  assert.equal(absentOut.candidate.name, "Assembled candidate");
  const validName = clone(fixture);
  validName.request_id = "r19-assembly31-name-valid";
  validName.intent.name = "Exact authored name";
  const validNameOut = Head.run(validName);
  assert.equal(validNameOut.status, "CANDIDATE");
  assert.equal(validNameOut.candidate.name, "Exact authored name");

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/assembly-name-holds-shape-round19/v0.1", target_commit: ASSEMBLY_PR31, predecessor_commit: ASSEMBLY_BASE, status: "PASS", checked: ["predecessor-demonstrates-structured-name-admission", "authored-invalid-name-fails-before-defaulting", "predecessor-demonstrates-hold-container-reinterpretation", "wrong-holds-container-fails-at-exact-path", "valid-upstream-hold-array-remains-authoritative", "established-null-holds-omission-remains-bounded", "true-name-absence-defaults-valid-name-survives", "deterministic-source-preserving-replay"], placement: "ASSEMBLY_MACHINE_SEMANTIC_SHAPE" }));
});

const hasAssembly32 = !!process.env.R19_ASSEMBLY_BASE_ROOT && !!process.env.R19_ASSEMBLY32_ROOT;
test("Assembly PR #32: source trace preserves authored false/zero/empty identity values by own-key presence while malformed identity policy remains explicitly unproven", { skip: !hasAssembly32 }, () => {
  assert.equal(process.env.R19_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R19_ASSEMBLY32_COMMIT, ASSEMBLY_PR32);
  const Base = require(path.join(process.env.R19_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R19_ASSEMBLY32_ROOT, "src"));
  const fixture = assemblyFixture(process.env.R19_ASSEMBLY32_ROOT);

  for (const [label, machine, requestId] of [["false", false, false], ["zero", 0, 0], ["empty", "", ""]]) {
    const authored = clone(fixture);
    authored.request_id = `r19-assembly32-${label}`;
    authored.inputs[0].machine = machine;
    authored.inputs[0].request_id = requestId;
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.equal(baseline.status, "CANDIDATE", JSON.stringify(baseline.holds));
    assert.equal(candidate.status, "CANDIDATE", JSON.stringify(candidate.holds));
    assert.equal(baseline.source_provenance[0].machine, null, `${label}: predecessor must demonstrate truthiness collapse`);
    assert.equal(baseline.source_provenance[0].request_id, null, `${label}: predecessor must demonstrate truthiness collapse`);
    assert.deepEqual(candidate.source_provenance[0].machine, machine, label);
    assert.deepEqual(candidate.source_provenance[0].request_id, requestId, label);
    assert.equal(JSON.stringify(authored), before, `${label}: caller matter must remain unchanged`);
    assert.deepEqual(Head.run(authored), candidate, `${label}: replay must be deterministic`);
  }

  const absent = clone(fixture);
  absent.request_id = "r19-assembly32-absent";
  delete absent.inputs[0].machine;
  delete absent.inputs[0].request_id;
  const absentOut = Head.run(absent);
  assert.equal(absentOut.status, "CANDIDATE");
  assert.equal(absentOut.source_provenance[0].machine, null);
  assert.equal(absentOut.source_provenance[0].request_id, null);

  const malformed = clone(fixture);
  malformed.request_id = "r19-assembly32-malformed-policy-hold";
  malformed.inputs[0].machine = { id: "not-validated-here", version: null };
  malformed.inputs[0].request_id = ["not", "an", "identity"];
  const malformedOut = Head.run(malformed);
  assert.equal(malformedOut.status, "CANDIDATE", "candidate explicitly does not invent an upstream identity-validity policy");
  assert.deepEqual(malformedOut.source_provenance[0].machine, { id: "not-validated-here", version: null });
  assert.deepEqual(malformedOut.source_provenance[0].request_id, ["not", "an", "identity"]);

  const authoredNull = clone(fixture);
  authoredNull.request_id = "r19-assembly32-authored-null-observability";
  authoredNull.inputs[0].machine = null;
  authoredNull.inputs[0].request_id = null;
  const nullOut = Head.run(authoredNull);
  assert.equal(nullOut.status, "CANDIDATE");
  assert.equal(nullOut.source_provenance[0].machine, null);
  assert.equal(nullOut.source_provenance[0].request_id, null);
  assert.deepEqual({ machine: nullOut.source_provenance[0].machine, request_id: nullOut.source_provenance[0].request_id }, { machine: absentOut.source_provenance[0].machine, request_id: absentOut.source_provenance[0].request_id }, "authored null and true absence remain observationally identical until an identity-validity/presence policy exists");

  console.log(JSON.stringify({ schema: "axm.morphtile.verification/assembly-source-identity-presence-round19/v0.1", target_commit: ASSEMBLY_PR32, predecessor_commit: ASSEMBLY_BASE, status: "PASS_WITH_HOLD", checked: ["predecessor-demonstrates-falsey-truthiness-collapse", "false-preserved-by-own-key-presence", "zero-preserved-by-own-key-presence", "empty-string-preserved-by-own-key-presence", "true-absence-defaults-to-null", "deterministic-source-preserving-replay"], remaining_hold: "UPSTREAM_MACHINE_REQUEST_ID_VALIDITY_AND_NULL_PRESENCE_OBSERVABILITY_NOT_PROVEN", placement: "ASSEMBLY_MACHINE_SOURCE_TRACE" }));
});
