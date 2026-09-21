"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "379b25f35f90ad6998c7967d3b112478186540f0";
const FORM_PR34 = "c3d9024daeeef37e7f337aa594d1a5a134f3929f";
const INTERFACE_BASE = "13ff908b84094e81ee422bf59292fccabfeeea59";
const INTERFACE_PR28 = "0c82830f1b8048fbe0f62f04204ca17e96fc0c32";
const ASSEMBLY_BASE = "92f97d4d9b002c76d37a14910e05e65a60f78de8";
const ASSEMBLY_PR34 = "bd207d70acfd3466b674964e77db19bae553d28a";

function request(id, intent, caller = "axm.morphtile.machine.verification") {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 21 replay",
    intent,
    provenance: { caller }
  };
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

const hasForm = !!process.env.R21_FORM_BASE_ROOT && !!process.env.R21_FORM34_ROOT && !!process.env.R21_CORE_PATH;
test("Form PR #34: shared grid position kernel is exact-equivalent at public boundaries and keeps receiver-visible geometry", { skip: !hasForm }, () => {
  assert.equal(process.env.R21_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R21_FORM34_COMMIT, FORM_PR34);
  assert.equal(process.env.R21_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R21_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R21_FORM34_ROOT, "src"));
  const { axisAlignedVectorDeltas } = require(path.join(process.env.R21_FORM34_ROOT, "src", "grid-progression"));
  const MT = require(path.resolve(process.env.R21_CORE_PATH));

  assert.deepEqual(axisAlignedVectorDeltas([2, 3, 9], [3, 2, 1]), [[2, 0, 0], [0, 3, 0], null], "inactive one-cell axes must not receive lexical loop deltas");
  assert.deepEqual(axisAlignedVectorDeltas([0, 4, 0], [4, 4, 4]), [null, [0, 4, 0], null], "zero movement stays absent from the canonical delta representation");

  const ordinary = request("r21-form-ordinary", {
    grid: {
      counts: [3, 2, 1],
      step: [2, 3, 9],
      part: { shape: "box", size: [0.5, 0.75, 1], pos: [1, -2, 4] }
    }
  });
  const ordinaryBase = Base.run(ordinary);
  const ordinaryHead = Head.run(ordinary);
  assert.equal(ordinaryHead.status, "CANDIDATE", JSON.stringify(ordinaryHead.holds));
  assert.deepEqual(ordinaryHead, ordinaryBase, "internal convergence must preserve exact public output for ordinary grids");
  assert.equal(JSON.stringify(ordinaryHead.candidate).includes('"gz"'), false, "inactive z axis must not leak a nonexistent gz lexical reference");
  assert.deepEqual(Head.run(ordinary), ordinaryHead, "replay must be deterministic");

  const collapse = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(collapse + 1, collapse);
  const collapsed = request("r21-form-collapse", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0] }
    }
  });
  const collapsedBase = Base.run(collapsed);
  const collapsedHead = Head.run(collapsed);
  assert.equal(collapsedHead.status, "HOLD");
  assert.equal(collapsedHead.holds[0].code, "HOLD_FORM_GRID_INVALID");
  assert.deepEqual(collapsedHead, collapsedBase, "the already-integrated complete-domain duplicate-state guard must remain exact");

  const combined = request("r21-form-collapse-plus-rotation", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      rot_step: { x: [0, 15, 0] },
      part: { shape: "box", size: [1, 1, 1], pos: [collapse, 0, 0], rot: [0, 0, 0] }
    }
  });
  const combinedBase = Base.run(combined);
  const combinedHead = Head.run(combined);
  assert.equal(combinedHead.status, "CANDIDATE", JSON.stringify(combinedHead.holds));
  assert.deepEqual(combinedHead, combinedBase, "collapsed translation remains valid when another verified progression distinguishes complete state");

  const signedZero = request("r21-form-signed-zero", {
    grid: {
      counts: [2, 1, 1],
      step: [-0, 0, 0],
      part: { shape: "box", size: [1, 1, 1] }
    }
  });
  const signedZeroBase = Base.run(signedZero);
  const signedZeroHead = Head.run(signedZero);
  assert.equal(signedZeroHead.status, "HOLD");
  assert.equal(signedZeroHead.holds[0].code, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  assert.deepEqual(signedZeroHead, signedZeroBase, "the refactor must not silently canonicalize signed zero before the portability boundary");
  assert.equal(Object.is(signedZero.intent.grid.step[0], -0), true, "caller-owned signed zero must remain untouched");

  const mesh = MT.compileMesh(MT.createTile(ordinaryHead.candidate));
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 6);
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));
  const xs = mesh.P.filter((_, i) => i % 3 === 0);
  const ys = mesh.P.filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 4, "x progression must remain receiver-visible");
  assert.ok(Math.max(...ys) - Math.min(...ys) > 3, "y progression must remain receiver-visible");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-kernel-round21/v0.1",
    target_commit: FORM_PR34,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "canonical-axis-deltas",
      "inactive-axis-lexical-omission",
      "ordinary-public-output-exact-equivalence",
      "integrated-precision-collapse-hold-preserved",
      "complete-state-progression-semantics-preserved",
      "signed-zero-portability-precedes-kernel",
      "deterministic-replay",
      "real-core-two-axis-geometry-effect"
    ],
    placement: "FORM_MACHINE_INTERNAL_GRID_ARITHMETIC"
  }));
});

const hasInterface = !!process.env.R21_INTERFACE_BASE_ROOT && !!process.env.R21_INTERFACE28_ROOT;
test("Interface PR #28: integration-truth candidate changes no runtime contract and pins the exact integrated Assembly receiver", { skip: !hasInterface }, () => {
  assert.equal(process.env.R21_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R21_INTERFACE28_COMMIT, INTERFACE_PR28);

  for (const runtimePath of ["src", "machine.json", "package.json"]) {
    assert.deepEqual(
      fileSnapshot(process.env.R21_INTERFACE28_ROOT, runtimePath),
      fileSnapshot(process.env.R21_INTERFACE_BASE_ROOT, runtimePath),
      `${runtimePath} must remain byte-identical in a truth/receiver-pin-only candidate`
    );
  }

  const pins = JSON.parse(fs.readFileSync(path.join(process.env.R21_INTERFACE28_ROOT, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.repository, "mike-axiom-mir/axm-morphtile-machine-assembly");
  assert.equal(pins.assembly.commit, ASSEMBLY_BASE, "receiver evidence must pin the exact current integrated Assembly head");

  const pkg = JSON.parse(fs.readFileSync(path.join(process.env.R21_INTERFACE28_ROOT, "package.json"), "utf8"));
  assert.equal(pkg.version, "0.5.14");
  const status = fs.readFileSync(path.join(process.env.R21_INTERFACE28_ROOT, "STATUS.md"), "utf8");
  assert.match(status, /0\.5\.14/);
  assert.doesNotMatch(status, /current[^\n]*0\.5\.13/i, "current status must not claim the superseded integrated version");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-integration-truth-round21/v0.1",
    target_commit: INTERFACE_PR28,
    predecessor_commit: INTERFACE_BASE,
    receiver_commit: ASSEMBLY_BASE,
    status: "PASS",
    checked: ["runtime-byte-identity", "package-version-truth", "status-version-truth", "exact-assembly-receiver-pin"],
    placement: "INTERFACE_MACHINE_INTEGRATION_TRUTH"
  }));
});

function directTile(extra = {}) {
  return {
    schema: "morphtile.tile-spec/v0.4",
    id: "mt_round21_direct",
    name: "Round 21 direct candidate",
    form_hints: ["game_asset"],
    facets: {
      mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } }
    },
    ...extra
  };
}

function assemblyRequest(id, input) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent direct-candidate semantic-container verification",
    intent: { id: "mt_round21_direct", name: "Round 21 direct candidate" },
    inputs: [input],
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

const hasAssembly = !!process.env.R21_ASSEMBLY_BASE_ROOT && !!process.env.R21_ASSEMBLY34_ROOT && !!process.env.R21_CORE_PATH;
test("Assembly PR #34: direct candidate representations receive semantic container checks before host iteration or merge semantics", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R21_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R21_ASSEMBLY34_COMMIT, ASSEMBLY_PR34);
  assert.equal(process.env.R21_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R21_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R21_ASSEMBLY34_ROOT, "src"));
  const MT = require(path.resolve(process.env.R21_CORE_PATH));

  const badHintsSource = assemblyRequest("r21-assembly-direct-form-hints", directTile({ form_hints: { 0: "game_asset" } }));
  const badHintsBefore = JSON.stringify(badHintsSource);
  assert.throws(() => Base.run(badHintsSource), TypeError, "integrated predecessor must demonstrate the direct-container host-iteration escape");
  let badHintsOut;
  assert.doesNotThrow(() => { badHintsOut = Head.run(badHintsSource); });
  assert.equal(badHintsOut.status, "HOLD");
  assert.equal(badHintsOut.holds[0].code, "HOLD_FORM_HINTS_SHAPE_INVALID");
  assert.equal(badHintsOut.holds[0].path, "request.inputs[0].form_hints");
  assert.equal(JSON.stringify(badHintsSource), badHintsBefore, "caller matter must remain unchanged");
  assert.deepEqual(Head.run(badHintsSource), badHintsOut, "semantic HOLD replay must be deterministic");

  const badFacetsSource = assemblyRequest("r21-assembly-direct-facets", directTile({
    facets: [{ type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } }]
  }));
  const oldFacets = Base.run(badFacetsSource);
  assert.equal(oldFacets.status, "CANDIDATE", "predecessor must demonstrate array-index facet reinterpretation");
  const newFacets = Head.run(badFacetsSource);
  assert.equal(newFacets.status, "HOLD");
  assert.equal(newFacets.holds[0].code, "HOLD_FACETS_SHAPE_INVALID");
  assert.equal(newFacets.holds[0].path, "request.inputs[0].facets");

  const badCapabilitiesSource = assemblyRequest("r21-assembly-direct-capabilities", directTile({ capabilities: false }));
  const oldCapabilities = Base.run(badCapabilitiesSource);
  assert.equal(oldCapabilities.status, "CANDIDATE", "predecessor must demonstrate falsey capability-container reinterpretation");
  assert.equal(oldCapabilities.candidate.capabilities, false);
  const newCapabilities = Head.run(badCapabilitiesSource);
  assert.equal(newCapabilities.status, "HOLD");
  assert.equal(newCapabilities.holds[0].code, "HOLD_CAPABILITIES_SHAPE_INVALID");
  assert.equal(newCapabilities.holds[0].path, "request.inputs[0].capabilities");

  const sparseCapabilities = [];
  sparseCapabilities.length = 1;
  const sparseSource = assemblyRequest("r21-assembly-sparse-capabilities", directTile({ capabilities: sparseCapabilities }));
  const sparseOut = Head.run(sparseSource);
  assert.equal(sparseOut.status, "HOLD");
  assert.equal(sparseOut.holds[0].code, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  assert.equal(sparseOut.holds[0].path, "request.inputs[0].capabilities[0]", "portability must reject holes before later collection semantics");

  const nullProtoFacets = Object.create(null);
  Object.defineProperty(nullProtoFacets, "mesh", {
    value: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } },
    enumerable: true,
    configurable: true,
    writable: true
  });
  const validSource = assemblyRequest("r21-assembly-valid-direct", directTile({ facets: nullProtoFacets, capabilities: [] }));
  const validBefore = JSON.stringify(validSource);
  const validOut = Head.run(validSource);
  assert.equal(validOut.status, "CANDIDATE", JSON.stringify(validOut.holds));
  assert.deepEqual(validOut.candidate.form_hints, ["game_asset"]);
  assert.deepEqual(validOut.candidate.capabilities, []);
  assert.equal(validOut.candidate.facets.mesh.type, "primitive");
  assert.equal(JSON.stringify(validSource), validBefore);
  assert.deepEqual(Head.run(validSource), validOut, "valid direct-candidate replay must remain deterministic");

  const mesh = MT.compileMesh(MT.createTile(validOut.candidate));
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.ok(mesh.P.length > 0 && mesh.P.every(Number.isFinite));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-direct-container-round21/v0.1",
    target_commit: ASSEMBLY_PR34,
    predecessor_commit: ASSEMBLY_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "predecessor-direct-form-hints-native-throw-reproduced",
      "direct-form-hints-fail-closed",
      "predecessor-facet-array-reinterpretation-reproduced",
      "direct-facets-fail-closed",
      "predecessor-falsey-capabilities-reinterpretation-reproduced",
      "direct-capabilities-fail-closed",
      "sparse-array-portability-precedes-collection-use",
      "null-prototype-facet-map-remains-valid",
      "deterministic-source-preserving-replay",
      "real-core-valid-direct-candidate-effect"
    ],
    placement: "ASSEMBLY_MACHINE_INPUT_GRAMMAR"
  }));
});
