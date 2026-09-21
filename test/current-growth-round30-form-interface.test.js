"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "32ffc491684b82165374e14618b197c39d84b474";
const FORM39 = "2493734dae9b91f0da91171576a9bba435a9bf2a";
const INTERFACE_BASE = "bcfb0189773c5ddf20b7b85887b61995c371c347";
const INTERFACE31 = "c6468d46a1393e4a67318a0dce2fc66eda044935";
const ASSEMBLY = "9fe8b53daf3e572c596c142859cca2199a976553";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R30_FORM_BASE_ROOT && !!process.env.R30_FORM39_ROOT && !!process.env.R30_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R30_INTERFACE_BASE_ROOT && !!process.env.R30_INTERFACE31_ROOT;

function formFixture(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "fixtures", "request.box.json"), "utf8"));
}

function formRequest(root, requestId, intent) {
  return { ...formFixture(root), request_id: requestId, intent };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

test("Form PR #39 reuses owner-provided rotation state without changing downstream size/scale/setting semantics", { skip: !formEnabled }, () => {
  assert.equal(process.env.R30_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R30_FORM39_COMMIT, FORM39);
  assert.equal(process.env.R30_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R30_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R30_FORM39_ROOT, "src"));
  const { rotationDeltasFromGrid } = require(path.join(process.env.R30_FORM39_ROOT, "src", "grid-rotation.js"));
  const MorphTile = require(path.join(process.env.R30_MORPHTILE_ROOT, "core", "morphtile.js"));

  const authoredGrid = { rot_step: { z: [0, 15, -5], x: [2, 0, 0] } };
  const authoredBefore = JSON.stringify(authoredGrid);
  const state = rotationDeltasFromGrid(authoredGrid);
  assert.deepEqual(state, [[2, 0, 0], null, [0, 15, -5]], "rotation owner lost canonical xyz/inactive-axis state");
  state[0][0] = 999;
  state[2][1] = 999;
  assert.equal(JSON.stringify(authoredGrid), authoredBefore, "owner representation aliased authored vectors");
  assert.deepEqual(rotationDeltasFromGrid(authoredGrid), [[2, 0, 0], null, [0, 15, -5]], "owner representation replay drifted after consumer mutation");

  const sizeInput = formRequest(process.env.R30_FORM39_ROOT, "r30-size-rotation", {
    grid: {
      counts: [2, 2, 1],
      step: [2, 0, 0],
      size_step: { x: [0.2, 0, 0], y: [0, 0.3, 0] },
      rot_step: { y: [0, 0.1, 0] },
      part: { shape: "wedge", size: [1, 2, 1], rot: [0, 0.5, 0] }
    }
  });
  const sizeOut = assertEquivalentRun(Base, Head, sizeInput, "primitive-size+rotation");
  assert.equal(sizeOut.status, "CANDIDATE");

  const scaleInput = formRequest(process.env.R30_FORM39_ROOT, "r30-scale-rotation", {
    grid: {
      counts: [2, 2, 1],
      step: [0, 0, 0],
      scale_step: { x: [0.2, 0, 0], y: [0, 0.15, -0.1] },
      rot_step: { y: [0, 0.1, 0] },
      instance: { use: "panel", scale: [0.5, 1, 1.2], rot: [0, 0.2, 0] }
    }
  });
  assert.equal(assertEquivalentRun(Base, Head, scaleInput, "definition-scale+rotation").status, "CANDIDATE");

  const settingInput = formRequest(process.env.R30_FORM39_ROOT, "r30-setting-rotation", {
    grid: {
      counts: [2, 2, 1],
      step: [0, 0, 0],
      with_step: { x: { width: 0.5 }, y: { depth: 0.25 } },
      scale_step: { x: 0.1 },
      rot_step: { y: [0, 0.2, 0] },
      instance: { use: "panel", with: { width: 1, depth: 1 }, scale: 1 }
    }
  });
  assert.equal(assertEquivalentRun(Base, Head, settingInput, "definition-setting+scale+rotation").status, "CANDIDATE");

  const collisionInput = formRequest(process.env.R30_FORM39_ROOT, "r30-complete-state-collision", {
    grid: {
      counts: [2, 2, 1],
      step: [0, 0, 0],
      size_step: { x: [1, 0, 0], y: [-1, 0, 0] },
      rot_step: { x: [0, 0.25, 0], y: [0, -0.25, 0] },
      part: { shape: "box", size: [10, 1, 1] }
    }
  });
  const collisionOut = assertEquivalentRun(Base, Head, collisionInput, "complete-state-collision");
  assert.equal(collisionOut.status, "HOLD");
  assert.equal(collisionOut.holds[0].code, "HOLD_FORM_GRID_INVALID");

  const tile = MorphTile.createTile(sizeOut.candidate);
  const validity = MorphTile.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));
  const compiled = MorphTile.compileMesh(tile);
  assert.equal(compiled.hold, null);
  assert.equal(compiled.recipe_parts, 4);
  assert.ok(compiled.P.length > 0 && compiled.P.every(Number.isFinite));

  const fixedCandidate = clone(sizeOut.candidate);
  const leaf = fixedCandidate.facets.mesh.data.parts[0].body[0].body[0];
  leaf.rot = [0, 0.5, 0];
  const fixedCompiled = MorphTile.compileMesh(MorphTile.createTile(fixedCandidate));
  assert.equal(fixedCompiled.hold, null);
  assert.notDeepEqual(compiled.P, fixedCompiled.P, "receiver did not consume preserved rotation progression");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-rotation-state-round30/v0.1",
    target_commit: FORM39,
    predecessor_commit: FORM_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: ["owner-state-copy", "xyz-order", "inactive-axis-null", "size-predecessor-equivalence", "scale-predecessor-equivalence", "setting-predecessor-equivalence", "collision-hold-equivalence", "deterministic-replay", "caller-immutability", "receiver-rotation-effect"],
    placement: "FORM_GRID_ROTATION_STATE_CONVERGENCE"
  }));
});

test("Interface PR #31 is evidence-only and pins the exact integrated Assembly receiver without executable drift", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R30_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R30_INTERFACE31_COMMIT, INTERFACE31);
  assert.equal(process.env.R30_ASSEMBLY_COMMIT, ASSEMBLY);
  assert.equal(process.env.R30_MORPHTILE_COMMIT, MORPHTILE);

  const baseRoot = process.env.R30_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R30_INTERFACE31_ROOT;
  assertTreeBytesEqual(baseRoot, headRoot, "src");
  assertTreeBytesEqual(baseRoot, headRoot, "test");
  assertTreeBytesEqual(baseRoot, headRoot, ".github/workflows");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(headRoot, file)), fs.readFileSync(path.join(baseRoot, file)), `${file}: executable metadata drifted`);
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.commit, ASSEMBLY, "Interface evidence does not pin current integrated Assembly exactly");
  const manifest = JSON.parse(fs.readFileSync(path.join(headRoot, "machine.json"), "utf8"));
  assert.equal(manifest.tested_against.commit, MORPHTILE, "Interface core evidence pin drifted");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-receiver-truth-round30/v0.1",
    target_commit: INTERFACE31,
    predecessor_commit: INTERFACE_BASE,
    assembly_receiver_commit: ASSEMBLY,
    morphtile_commit: MORPHTILE,
    status: "PASS",
    checked: ["src-byte-identity", "test-byte-identity", "workflow-byte-identity", "machine-byte-identity", "package-byte-identity", "exact-assembly-pin", "exact-core-pin"],
    placement: "INTERFACE_RECEIVER_EVIDENCE_ONLY"
  }));
});
