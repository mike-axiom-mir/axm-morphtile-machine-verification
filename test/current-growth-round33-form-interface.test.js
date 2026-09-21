"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "969d802b4150d0b8f1e819bed1e8d13225fb273c";
const FORM41 = "5e4499f37c7b47dddfcd9e01f26141e9b50240a3";
const INTERFACE_BASE = "2cff4674c4cfb5de97bf842a6d307f3585268ab1";
const INTERFACE33 = "d837c0a71a79120e54a2c581894b5e8e80accb67";
const ASSEMBLY_CURRENT = "8a2a7bf6adf40266438945ad1482001be9d68900";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R33_FORM_BASE_ROOT && !!process.env.R33_FORM41_ROOT && !!process.env.R33_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R33_INTERFACE_BASE_ROOT && !!process.env.R33_INTERFACE33_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formFixture(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "fixtures", "request.box.json"), "utf8"));
}

function formRequest(root, requestId, intent) {
  return { ...formFixture(root), request_id: requestId, intent };
}

function assertEquivalentRun(Base, Head, input, label) {
  const baseInput = clone(input);
  const headInput = clone(input);
  const before = JSON.stringify(headInput);
  const baseOut = Base.run(baseInput);
  const first = Head.run(headInput);
  const second = Head.run(headInput);
  assert.deepEqual(first, baseOut, `${label}: public result drifted from integrated predecessor`);
  assert.deepEqual(second, first, `${label}: deterministic replay changed`);
  assert.equal(JSON.stringify(headInput), before, `${label}: caller-owned request mutated`);
  return first;
}

function filesUnder(root, relative) {
  const start = path.join(root, relative);
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  walk(start);
  return out.sort();
}

function assertTreeBytesEqual(aRoot, bRoot, relative) {
  const aFiles = filesUnder(aRoot, relative);
  const bFiles = filesUnder(bRoot, relative);
  assert.deepEqual(bFiles, aFiles, `${relative}: executable file set changed`);
  for (const file of aFiles) {
    assert.deepEqual(fs.readFileSync(path.join(bRoot, file)), fs.readFileSync(path.join(aRoot, file)), `${file}: bytes changed`);
  }
}

test("Form PR #41 reuses generated scale state without changing scale-lane semantics", { skip: !formEnabled }, () => {
  assert.equal(process.env.R33_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R33_FORM41_COMMIT, FORM41);
  assert.equal(process.env.R33_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R33_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R33_FORM41_ROOT, "src"));
  const { generatedScaleFromGrid } = require(path.join(process.env.R33_FORM41_ROOT, "src", "grid-scale-state.js"));
  const MT = require(path.join(process.env.R33_MORPHTILE_ROOT, "core", "morphtile.js"));

  const helperGrid = {
    counts: [3, 2, 1],
    instance: { use: "body", scale: [1, 2, 3] },
    scale_step: { x: [0.25, 0, -0.1], y: [0, 0.5, 0], z: [999, 999, 999] }
  };
  const helperBefore = JSON.stringify(helperGrid);
  const generated = generatedScaleFromGrid(helperGrid, [2, 1, 0]);
  assert.deepEqual(generated, [1.5, 2.5, 2.8], "owner-generated vector scale drifted");
  generated[0] = 999;
  assert.equal(JSON.stringify(helperGrid), helperBefore, "generated scale aliases caller-owned state");
  assert.deepEqual(generatedScaleFromGrid(helperGrid, [2, 1, 0]), [1.5, 2.5, 2.8], "inactive axis or replay changed generated scale");

  const scalar = formRequest(process.env.R33_FORM41_ROOT, "r33-scale-scalar", {
    grid: {
      counts: [3, 2, 1],
      step: [2, 0, 0],
      scale_step: { x: 0.25, y: 0.5 },
      instance: { use: "panel", scale: 1.5 }
    }
  });
  const scalarOut = assertEquivalentRun(Base, Head, scalar, "scalar-scale");
  assert.equal(scalarOut.status, "CANDIDATE", JSON.stringify(scalarOut.holds));

  const vector = formRequest(process.env.R33_FORM41_ROOT, "r33-scale-vector", {
    grid: {
      counts: [2, 2, 1],
      step: [2, 0, 0],
      scale_step: { x: [0.2, 0, 0], y: [0, 0.15, -0.1] },
      with_step: { x: { width: 0.5 }, y: { depth: 0.25 } },
      instance: { use: "panel", with: { width: 1, depth: 1 }, scale: [0.5, 1, 1.2] }
    }
  });
  const vectorOut = assertEquivalentRun(Base, Head, vector, "vector-scale-plus-setting");
  assert.equal(vectorOut.status, "CANDIDATE", JSON.stringify(vectorOut.holds));

  const collision = formRequest(process.env.R33_FORM41_ROOT, "r33-scale-collision", {
    grid: {
      counts: [2, 2, 1],
      step: [0, 0, 0],
      scale_step: { x: 0.5, y: -0.5 },
      instance: { use: "panel", scale: 2 }
    }
  });
  const collisionOut = assertEquivalentRun(Base, Head, collision, "complete-scale-state-collision");
  assert.equal(collisionOut.status, "HOLD");
  assert.equal(collisionOut.holds[0].code, "HOLD_FORM_GRID_INVALID");

  const nonpositive = formRequest(process.env.R33_FORM41_ROOT, "r33-scale-nonpositive", {
    grid: {
      counts: [2, 1, 1],
      step: [1, 0, 0],
      scale_step: { x: -2 },
      instance: { use: "panel", scale: 1 }
    }
  });
  const nonpositiveOut = assertEquivalentRun(Base, Head, nonpositive, "generated-nonpositive-scale");
  assert.equal(nonpositiveOut.status, "HOLD");
  assert.equal(nonpositiveOut.holds[0].code, "HOLD_FORM_GRID_INVALID");

  for (const output of [scalarOut, vectorOut]) {
    const tile = MT.createTile(output.candidate);
    const validity = MT.validateTile(tile);
    assert.equal(validity.ok, true, validity.errors.join(", "));
  }

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-scale-owner-round33/v0.1",
    target_commit: FORM41,
    predecessor_commit: FORM_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: ["owner-generated-scale", "copy-no-alias", "inactive-axis", "scalar-predecessor-equivalence", "vector-predecessor-equivalence", "complete-state-collision", "generated-nonpositive-hold", "deterministic-replay", "caller-immutability", "receiver-schema-acceptance"],
    placement: "FORM_GRID_SCALE_OWNER_CONVERGENCE"
  }));
});

test("Interface PR #33 changes receiver evidence and truth guards without changing Interface runtime", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R33_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R33_INTERFACE33_COMMIT, INTERFACE33);
  assert.equal(process.env.R33_ASSEMBLY_CURRENT_COMMIT, ASSEMBLY_CURRENT);
  assert.equal(process.env.R33_MORPHTILE_COMMIT, MORPHTILE);

  const baseRoot = process.env.R33_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R33_INTERFACE33_ROOT;
  assertTreeBytesEqual(baseRoot, headRoot, "src");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(headRoot, file)), fs.readFileSync(path.join(baseRoot, file)), `${file}: executable metadata drifted`);
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.repository, "mike-axiom-mir/axm-morphtile-machine-assembly");
  assert.equal(pins.assembly.commit, ASSEMBLY_CURRENT, "Interface receiver fixture does not pin current integrated Assembly");

  const manifest = JSON.parse(fs.readFileSync(path.join(headRoot, "machine.json"), "utf8"));
  assert.equal(manifest.tested_against.commit, MORPHTILE, "Interface MorphTile pin drifted");

  const status = fs.readFileSync(path.join(headRoot, "STATUS.md"), "utf8");
  const readme = fs.readFileSync(path.join(headRoot, "README.md"), "utf8");
  const workflow = fs.readFileSync(path.join(headRoot, ".github", "workflows", "test.yml"), "utf8");
  assert.ok(status.split(/\r?\n/).includes(`- Assembly receiver evidence target: \`${ASSEMBLY_CURRENT}\``), "STATUS receiver identity drifted from executable fixture");
  assert.ok(readme.split(/\r?\n/).some((line) => line.startsWith(`- ASSEMBLY RECEIVER TARGET: exact integrated Assembly \`${ASSEMBLY_CURRENT}\`;`)), "README receiver identity drifted from executable fixture");
  assert.ok(workflow.includes("repository: mike-axiom-mir/axm-morphtile-machine-assembly"), "workflow receiver repository drifted");
  assert.ok(workflow.includes('integration-sources.json").assembly.commit'), "workflow no longer derives Assembly receiver identity from the executable fixture");
  assert.ok(workflow.includes('ref: ${{ steps.pins.outputs.assembly }}'), "workflow no longer checks out the fixture-derived Assembly receiver");

  const integrationTest = fs.readFileSync(path.join(headRoot, "test", "assembly-dependency.integration.test.js"), "utf8");
  assert.ok(integrationTest.includes('item.kind === "KIT_RECEIVER_CLOSURE"'), "Interface receiver suite does not require closure evidence");
  assert.ok(integrationTest.includes('assert.equal(closureEvidence.status, "PASS")'), "Interface receiver suite does not require closure PASS");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-receiver-closure-round33/v0.1",
    target_commit: INTERFACE33,
    predecessor_commit: INTERFACE_BASE,
    assembly_receiver_commit: ASSEMBLY_CURRENT,
    morphtile_commit: MORPHTILE,
    status: "PASS",
    checked: ["src-byte-identity", "machine-byte-identity", "package-byte-identity", "fixture-receiver-pin", "core-pin", "status-truth", "readme-truth", "workflow-fixture-derived-receiver", "closure-evidence-required"],
    placement: "INTERFACE_RECEIVER_CLOSURE_EVIDENCE"
  }));
});
