"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ASSEMBLY_BASE = "9fe8b53daf3e572c596c142859cca2199a976553";
const ASSEMBLY39 = "968e7351787f8bf8ffb7c327a937aa5d8978bcc1";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = !!process.env.R31_ASSEMBLY_BASE_ROOT && !!process.env.R31_ASSEMBLY39_ROOT && !!process.env.R31_MORPHTILE_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requestWithWords(root, requestId, words) {
  const request = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "request.assembly.json"), "utf8"));
  request.request_id = requestId;
  request.intent = { id: requestId.replace(/[^A-Za-z0-9_]/g, "_"), name: "Verification receiver application proof" };
  request.world_requirements = { words };
  return request;
}

function firstHold(result) {
  assert.equal(result.status, "HOLD", JSON.stringify(result));
  assert.ok(Array.isArray(result.holds) && result.holds.length > 0, "HOLD result lost hold evidence");
  return result.holds[0];
}

test("Assembly PR #39 closes READY-as-plan overclaim while preserving portable kit identity and exact failure evidence", { skip: !enabled }, () => {
  assert.equal(process.env.R31_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R31_ASSEMBLY39_COMMIT, ASSEMBLY39);
  assert.equal(process.env.R31_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R31_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R31_ASSEMBLY39_ROOT, "src"));
  const BaseKit = require(path.join(process.env.R31_ASSEMBLY_BASE_ROOT, "src", "kit.js"));
  const HeadKit = require(path.join(process.env.R31_ASSEMBLY39_ROOT, "src", "kit.js"));
  const MT = require(path.join(process.env.R31_MORPHTILE_ROOT, "core", "morphtile.js"));

  const invalidRequest = requestWithWords(process.env.R31_ASSEMBLY39_ROOT, "r31-invalid-word", {
    "2legs": { name: "2legs", args: [], body: 1, note: null }
  });
  const invalidBefore = JSON.stringify(invalidRequest);
  const baseInvalid = Base.run(clone(invalidRequest));
  const headInvalid = Head.run(clone(invalidRequest));
  assert.deepEqual(headInvalid, baseInvalid, "Assembly combination semantics drifted before kit materialization");
  assert.equal(headInvalid.status, "CANDIDATE", JSON.stringify(headInvalid.holds));

  const baseMaterialized = BaseKit.materializeKit(baseInvalid, MT, { name: "predecessor ready-plan overclaim" });
  assert.equal(baseMaterialized.status, "CANDIDATE", "predecessor weakness was not independently reproduced");
  const basePlan = MT.importKit(MT.createWorld("verification predecessor receiver"), baseMaterialized.kit);
  assert.equal(basePlan.status, "READY", JSON.stringify(basePlan));
  assert.ok(Array.isArray(basePlan.ops) && basePlan.ops.length > 0, "predecessor READY plan had no inspectable operations");
  assert.throws(() => MT.applyStructOp(MT.createWorld("verification invalid application"), clone(basePlan.ops[0])), /word needs a plain name/);

  const headMaterialized = HeadKit.materializeKit(headInvalid, MT, { name: "candidate receiver application proof" });
  const invalidHold = firstHold(headMaterialized);
  assert.equal(headMaterialized.kit, null);
  assert.equal(invalidHold.code, "HOLD_KIT_RUNTIME_APPLY_FAILED");
  assert.equal(invalidHold.operation_index, 0);
  assert.equal(invalidHold.operation.op, "word.define");
  assert.equal(invalidHold.operation.name, "2legs");
  assert.match(invalidHold.error, /word needs a plain name/);
  assert.equal(JSON.stringify(invalidRequest), invalidBefore, "caller-owned invalid request mutated");

  const positiveRequest = requestWithWords(process.env.R31_ASSEMBLY39_ROOT, "r31-valid-word", {
    ease: { name: "ease", args: ["x"], body: ["var", "x"], note: "identity proof" }
  });
  const positiveBefore = JSON.stringify(positiveRequest);
  const basePositive = Base.run(clone(positiveRequest));
  const headPositive = Head.run(clone(positiveRequest));
  assert.deepEqual(headPositive, basePositive, "valid Assembly result drifted before materialization");

  const basePositiveMaterialized = BaseKit.materializeKit(basePositive, MT, { name: "positive kit identity" });
  const headPositiveMaterialized = HeadKit.materializeKit(headPositive, MT, { name: "positive kit identity" });
  assert.equal(basePositiveMaterialized.status, "CANDIDATE", JSON.stringify(basePositiveMaterialized.holds));
  assert.equal(headPositiveMaterialized.status, "CANDIDATE", JSON.stringify(headPositiveMaterialized.holds));
  assert.deepEqual(headPositiveMaterialized.kit, basePositiveMaterialized.kit, "receiver-application proof changed portable kit payload/identity");
  assert.equal(headPositiveMaterialized.kit.expect.sha256, basePositiveMaterialized.kit.expect.sha256, "receiver proof changed kit hash");
  assert.equal(headPositiveMaterialized.evidence.some((entry) => entry.kind === "KIT_APPLY" && entry.status === "PASS"), true, "successful application proof lacks KIT_APPLY receipt");

  const manualReceiver = MT.createWorld("verification independent receiver");
  const positivePlan = MT.importKit(manualReceiver, headPositiveMaterialized.kit);
  assert.equal(positivePlan.status, "READY", JSON.stringify(positivePlan));
  assert.ok(Array.isArray(positivePlan.ops) && positivePlan.ops.length >= 2, "positive control needs at least two ordered operations for sequencing attack");
  for (const operation of positivePlan.ops) MT.applyStructOp(manualReceiver, clone(operation));

  const noOpsRuntime = {
    ...MT,
    importKit(world, kit, options) {
      const planned = MT.importKit(world, kit, options);
      return { ...planned, ops: null };
    }
  };
  const noOps = HeadKit.materializeKit(headPositive, noOpsRuntime, { name: "missing operation evidence" });
  assert.equal(firstHold(noOps).code, "HOLD_KIT_RUNTIME_IMPORT_OPS_INVALID");
  assert.equal(noOps.kit, null);

  const noApplyRuntime = { ...MT, applyStructOp: undefined };
  const noApply = HeadKit.materializeKit(headPositive, noApplyRuntime, { name: "missing apply contract" });
  const noApplyHold = firstHold(noApply);
  assert.equal(noApplyHold.code, "HOLD_MORPHTILE_RUNTIME_CONTRACT_MISSING");
  assert.ok(noApplyHold.missing.includes("applyStructOp"));

  const calls = [];
  const secondOperationRejectRuntime = {
    ...MT,
    applyStructOp(world, operation) {
      calls.push(clone(operation));
      if (calls.length === 2) throw new Error("verification-second-operation-sentinel");
      return MT.applyStructOp(world, operation);
    }
  };
  const assembledBefore = JSON.stringify(headPositive);
  const rejectedSecond = HeadKit.materializeKit(headPositive, secondOperationRejectRuntime, { name: "ordered failure evidence" });
  const secondHold = firstHold(rejectedSecond);
  assert.equal(secondHold.code, "HOLD_KIT_RUNTIME_APPLY_FAILED");
  assert.equal(secondHold.operation_index, 1, "failure index did not preserve ordered receiver position");
  assert.deepEqual(secondHold.operation, calls[1], "failure receipt did not preserve exact rejected operation");
  assert.match(secondHold.error, /verification-second-operation-sentinel/);
  assert.equal(calls.length, 2, "receiver application continued after first rejection");
  assert.equal(JSON.stringify(headPositive), assembledBefore, "failed receiver application mutated Assembly candidate");
  assert.equal(JSON.stringify(positiveRequest), positiveBefore, "caller-owned positive request mutated");

  const replay = HeadKit.materializeKit(headPositive, MT, { name: "positive kit identity" });
  assert.deepEqual(replay, headPositiveMaterialized, "kit receiver application replay drifted");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-kit-application-round31/v0.1",
    target_commit: ASSEMBLY39,
    predecessor_commit: ASSEMBLY_BASE,
    receiver_commit: MORPHTILE,
    status: "PASS",
    checked: [
      "predecessor-ready-overclaim-reproduced",
      "exact-runtime-invalid-operation-hold",
      "operation-index-operation-error-preserved",
      "positive-kit-payload-and-hash-stable",
      "independent-ordered-application",
      "missing-ops-fail-closed",
      "missing-apply-contract-fail-closed",
      "second-operation-order-and-stop",
      "deterministic-replay",
      "source-integrity"
    ],
    placement: "ASSEMBLY_KIT_RECEIVER_APPLICATION"
  }));
});
