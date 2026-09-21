"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FORM_BASE = "bb2c2fe5d4c65ddaed031d645ac024d7040a7682";
const FORM40 = "c6ccf57580c2571a1ecce70359e6bef246371619";
const INTERFACE_BASE = "798038d20adb2c910e046eaa77c63a64da8a25e8";
const INTERFACE32 = "9106ee2cc1d67caf28a09e2714dcaf2b9a292747";
const ASSEMBLY_BASE = "4996d524e05ff50a7305c2ebce81b81954f4ac05";
const ASSEMBLY40 = "ae7d0de178e230240f2ce89e75f90feb2cd38876";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const formEnabled = !!process.env.R32_FORM_BASE_ROOT && !!process.env.R32_FORM40_ROOT && !!process.env.R32_MORPHTILE_ROOT;
const interfaceEnabled = !!process.env.R32_INTERFACE_BASE_ROOT && !!process.env.R32_INTERFACE32_ROOT;
const assemblyEnabled = !!process.env.R32_ASSEMBLY_BASE_ROOT && !!process.env.R32_ASSEMBLY40_ROOT && !!process.env.R32_MORPHTILE_ROOT;

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

function requestWithWords(root, requestId, words) {
  const request = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "request.assembly.json"), "utf8"));
  request.request_id = requestId;
  request.intent = { id: requestId.replace(/[^A-Za-z0-9_]/g, "_"), name: "Verification receiver closure proof" };
  request.world_requirements = { words };
  return request;
}

function firstHold(result) {
  assert.equal(result.status, "HOLD", JSON.stringify(result));
  assert.ok(Array.isArray(result.holds) && result.holds.length > 0, "HOLD result lost evidence");
  return result.holds[0];
}

test("Form PR #40 converges generated scale state without changing public grid semantics", { skip: !formEnabled }, () => {
  assert.equal(process.env.R32_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R32_FORM40_COMMIT, FORM40);
  assert.equal(process.env.R32_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R32_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R32_FORM40_ROOT, "src"));
  const { generatedScaleFromGrid } = require(path.join(process.env.R32_FORM40_ROOT, "src", "grid-scale-state.js"));
  const MT = require(path.join(process.env.R32_MORPHTILE_ROOT, "core", "morphtile.js"));

  const scalarGrid = { counts: [3, 1, 4], instance: { use: "body", scale: 2 }, scale_step: { z: 0.5, x: 1 } };
  const scalarBefore = JSON.stringify(scalarGrid);
  assert.deepEqual(generatedScaleFromGrid(scalarGrid, [2, 0, 3]), [5.5]);
  assert.equal(JSON.stringify(scalarGrid), scalarBefore);
  assert.deepEqual(generatedScaleFromGrid(scalarGrid, [2, 0, 3]), [5.5]);

  const vectorGrid = { counts: [3, 4, 1], instance: { use: "body", scale: [1, 2, 3] }, scale_step: { y: [0, 1, 0], x: [1, 0, -0.5], z: [99, 99, 99] } };
  const vectorBefore = JSON.stringify(vectorGrid);
  const generated = generatedScaleFromGrid(vectorGrid, [2, 3, 0]);
  assert.deepEqual(generated, [3, 5, 2], "inactive Z index leaked authored Z progression");
  generated[0] = 999;
  assert.equal(JSON.stringify(vectorGrid), vectorBefore, "generated scale aliases authored vector state");
  assert.deepEqual(generatedScaleFromGrid(vectorGrid, [2, 3, 0]), [3, 5, 2]);

  const staticGrid = { instance: { use: "body", scale: [2, 3, 4] } };
  const staticOut = generatedScaleFromGrid(staticGrid, [9, 9, 9]);
  assert.deepEqual(staticOut, [2, 3, 4]);
  staticOut[0] = 999;
  assert.deepEqual(staticGrid.instance.scale, [2, 3, 4], "static vector scale was returned by alias");

  const positive = formRequest(process.env.R32_FORM40_ROOT, "r32-scale-positive", {
    grid: {
      counts: [2, 2, 1],
      step: [2, 0, 0],
      scale_step: { x: [0.2, 0, 0], y: [0, 0.15, -0.1] },
      with_step: { x: { width: 0.5 }, y: { depth: 0.25 } },
      instance: { use: "panel", with: { width: 1, depth: 1 }, scale: [0.5, 1, 1.2] }
    }
  });
  const positiveOut = assertEquivalentRun(Base, Head, positive, "definition-scale+setting");
  assert.equal(positiveOut.status, "CANDIDATE", JSON.stringify(positiveOut.holds));

  const collision = formRequest(process.env.R32_FORM40_ROOT, "r32-scale-collision", {
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

  const tile = MT.createTile(positiveOut.candidate);
  const validity = MT.validateTile(tile);
  assert.equal(validity.ok, true, validity.errors.join(", "));

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-grid-scale-state-round32/v0.1",
    target_commit: FORM40,
    predecessor_commit: FORM_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: ["scalar-owner-state", "vector-owner-state", "static-copy", "inactive-axis-zero-index", "predecessor-equivalence", "complete-state-collision", "deterministic-replay", "caller-immutability", "receiver-schema-acceptance"],
    placement: "FORM_GRID_SCALE_STATE_CONVERGENCE"
  }));
});

test("Interface PR #32 changes receiver evidence without changing executable Interface runtime", { skip: !interfaceEnabled }, () => {
  assert.equal(process.env.R32_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R32_INTERFACE32_COMMIT, INTERFACE32);
  assert.equal(process.env.R32_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R32_MORPHTILE_COMMIT, MORPHTILE);

  const baseRoot = process.env.R32_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R32_INTERFACE32_ROOT;
  assertTreeBytesEqual(baseRoot, headRoot, "src");
  assertTreeBytesEqual(baseRoot, headRoot, ".github/workflows");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(headRoot, file)), fs.readFileSync(path.join(baseRoot, file)), `${file}: executable metadata drifted`);
  }

  const pins = JSON.parse(fs.readFileSync(path.join(headRoot, "fixtures", "integration-sources.json"), "utf8"));
  assert.equal(pins.assembly.commit, ASSEMBLY_BASE, "Interface receiver fixture does not pin exact integrated Assembly head");
  const manifest = JSON.parse(fs.readFileSync(path.join(headRoot, "machine.json"), "utf8"));
  assert.equal(manifest.tested_against.commit, MORPHTILE, "Interface MorphTile pin drifted");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-kit-receiver-round32/v0.1",
    target_commit: INTERFACE32,
    predecessor_commit: INTERFACE_BASE,
    assembly_receiver_commit: ASSEMBLY_BASE,
    morphtile_commit: MORPHTILE,
    status: "PASS",
    checked: ["src-byte-identity", "workflow-byte-identity", "machine-byte-identity", "package-byte-identity", "exact-assembly-pin", "exact-core-pin"],
    placement: "INTERFACE_RECEIVER_EVIDENCE"
  }));
});

test("Assembly PR #40 proves exact READY operation postconditions without changing portable kit identity", { skip: !assemblyEnabled }, () => {
  assert.equal(process.env.R32_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R32_ASSEMBLY40_COMMIT, ASSEMBLY40);
  assert.equal(process.env.R32_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R32_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R32_ASSEMBLY40_ROOT, "src"));
  const BaseKit = require(path.join(process.env.R32_ASSEMBLY_BASE_ROOT, "src", "kit.js"));
  const HeadKit = require(path.join(process.env.R32_ASSEMBLY40_ROOT, "src", "kit.js"));
  const MT = require(path.join(process.env.R32_MORPHTILE_ROOT, "core", "morphtile.js"));

  const request = requestWithWords(process.env.R32_ASSEMBLY40_ROOT, "r32-receiver-closure", {
    ease: { name: "ease", args: ["x"], body: ["var", "x"], note: "receiver closure verification" }
  });
  const before = JSON.stringify(request);
  const baseAssembly = Base.run(clone(request));
  const headAssembly = Head.run(clone(request));
  assert.deepEqual(headAssembly, baseAssembly, "Assembly combination semantics drifted before kit materialization");
  assert.equal(headAssembly.status, "CANDIDATE", JSON.stringify(headAssembly.holds));

  const baseMaterialized = BaseKit.materializeKit(baseAssembly, MT, { name: "receiver closure identity" });
  const headMaterialized = HeadKit.materializeKit(headAssembly, MT, { name: "receiver closure identity" });
  assert.equal(baseMaterialized.status, "CANDIDATE", JSON.stringify(baseMaterialized.holds));
  assert.equal(headMaterialized.status, "CANDIDATE", JSON.stringify(headMaterialized.holds));
  assert.deepEqual(headMaterialized.kit, baseMaterialized.kit, "receiver closure proof changed portable kit payload");
  assert.equal(headMaterialized.kit.expect.sha256, baseMaterialized.kit.expect.sha256, "receiver closure proof changed kit hash identity");
  assert.equal(headMaterialized.evidence.some((entry) => entry.kind === "KIT_RECEIVER_CLOSURE" && entry.status === "PASS"), true, "successful materialization lacks receiver closure receipt");

  const receiver = MT.createWorld("verification receiver closure");
  const plan = MT.importKit(receiver, headMaterialized.kit);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  assert.ok(Array.isArray(plan.ops) && plan.ops.length > 0, "READY plan lost inspectable operations");
  for (const operation of plan.ops) MT.applyStructOp(receiver, clone(operation));
  const closure = HeadKit.inspectReceiverClosure(MT, receiver, plan.ops);
  assert.equal(closure.status, "SATISFIED", JSON.stringify(closure));
  assert.equal(closure.verified_operations, plan.ops.length);
  assert.equal(closure.planned_operations, plan.ops.length);
  assert.equal(closure.plan_sha256, MT.hashOf(plan.ops));
  assert.deepEqual(closure.missing, { tile: [], definitions: [], words: [] });
  assert.deepEqual(closure.changed, { tile: [], definitions: [], words: [] });
  assert.deepEqual(closure.unsupported_operations, []);

  receiver.words.ease.body = ["lit", 999];
  const tampered = HeadKit.inspectReceiverClosure(MT, receiver, plan.ops);
  assert.equal(tampered.status, "UNSATISFIED");
  assert.equal(tampered.changed.words.length, 1, "word receiver corruption was not detected");
  assert.equal(tampered.changed.words[0].id, "ease");

  const silentRuntime = { ...MT, applyStructOp() {} };
  const silent = HeadKit.materializeKit(headAssembly, silentRuntime, { name: "silent receiver must not pass" });
  const silentHold = firstHold(silent);
  assert.equal(silentHold.code, "HOLD_KIT_RUNTIME_RECEIVER_INCOMPLETE");
  assert.equal(silent.kit, null);
  assert.ok(silentHold.receiver_closure.missing.tile.length > 0 || silentHold.receiver_closure.missing.words.length > 0);

  const partialRuntime = {
    ...MT,
    applyStructOp(world, operation) {
      if (operation && operation.op === "word.define") return;
      return MT.applyStructOp(world, operation);
    }
  };
  const partial = HeadKit.materializeKit(headAssembly, partialRuntime, { name: "partial receiver must not pass" });
  const partialHold = firstHold(partial);
  assert.equal(partialHold.code, "HOLD_KIT_RUNTIME_RECEIVER_INCOMPLETE");
  assert.deepEqual(partialHold.receiver_closure.missing.words, ["ease"]);

  const replay = HeadKit.materializeKit(headAssembly, MT, { name: "receiver closure identity" });
  assert.deepEqual(replay, headMaterialized, "receiver closure replay drifted");
  assert.equal(JSON.stringify(request), before, "caller-owned Assembly request mutated");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-kit-receiver-closure-round32/v0.1",
    target_commit: ASSEMBLY40,
    predecessor_commit: ASSEMBLY_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: ["combination-predecessor-equivalence", "portable-kit-identity", "kit-hash-identity", "receiver-plan-application", "operation-derived-closure", "receiver-word-corruption-detection", "silent-apply-hold", "partial-apply-hold", "deterministic-replay", "caller-immutability"],
    placement: "ASSEMBLY_KIT_RECEIVER_CLOSURE"
  }));
});
