"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfacePreSerializationBoundary,
  verifyFormCurrentCoreBoundary,
  verifyInterfaceCurrentRuntimeBoundary
} = require("../src/current-source-runtime-boundaries-conformance");

const EXPECTED_SURFACE = "d35b88288597de0010986856a268a661d929d83f";
const EXPECTED_FORM = "5f71d1762a0c42ee3c4fa8d23580c5252ce7ffd2";
const EXPECTED_INTERFACE = "552ff2b47906a9bd034fa40b263e9c068811a059";
const EXPECTED_CORE = "429a344f7d9333bef01cf9de1c292c3af09abec2";

const surfaceRoot = process.env.CURRENT_SOURCE_SURFACE_ROOT;
const surfaceCommit = process.env.CURRENT_SOURCE_SURFACE_COMMIT;
const formRoot = process.env.CURRENT_SOURCE_FORM_ROOT;
const formCommit = process.env.CURRENT_SOURCE_FORM_COMMIT;
const interfaceRoot = process.env.CURRENT_SOURCE_INTERFACE_ROOT;
const interfaceCommit = process.env.CURRENT_SOURCE_INTERFACE_COMMIT;
const corePath = process.env.CURRENT_SOURCE_CORE_PATH;
const coreCommit = process.env.CURRENT_SOURCE_CORE_COMMIT;

const surfaceIntegrationTest = surfaceRoot ? test : test.skip;
const formIntegrationTest = formRoot && corePath ? test : test.skip;
const interfaceIntegrationTest = interfaceRoot && corePath ? test : test.skip;

surfaceIntegrationTest("Surface PR #15 exposes the remaining top-level paint-accessor execution gap while retaining portable controls", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin exact Surface PR #15 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfacePreSerializationBoundary(surface, { surfaceCommit });

  assert.equal(result.status, "FAIL", "the exact PR #15 head is expected to retain the independently discovered accessor-execution gap");
  assert.ok(
    result.errors.some((entry) => entry.code === "SURFACE_PAINT_ACCESSOR_EXECUTED_BEFORE_HOLD"),
    JSON.stringify(result, null, 2)
  );
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.accessor_probe.status, "HOLD");
  assert.equal(result.receipt.accessor_probe.hold, "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  assert.ok(result.receipt.accessor_probe.accessor_calls > 0, "the failure receipt must prove caller code actually executed before HOLD");
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

formIntegrationTest("Form PR #15 independently passes signed derived-overflow replay against current MorphTile core", () => {
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin exact Form PR #15 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile core");

  const form = require(path.resolve(formRoot, "src"));
  const manifest = require(path.resolve(formRoot, "machine.json"));
  const MorphTile = require(path.resolve(corePath));
  assert.equal(manifest.tested_against.commit, EXPECTED_CORE, "Form manifest must identify the independently executed receiver");

  const result = verifyFormCurrentCoreBoundary(form, MorphTile, { formCommit, coreCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.receipt.probes.map((probe) => [probe.name, probe.producer_status, probe.hold, probe.positions, probe.triangles, probe.colors, probe.request_unchanged, probe.threw]),
    [
      ["positive-derived-overflow", "CANDIDATE", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, true, null],
      ["negative-derived-overflow", "CANDIDATE", "HOLD_MESH_NONFINITE_VALUE", 0, 0, 0, true, null]
    ]
  );
  assert.equal(result.receipt.finite_control.producer_status, "CANDIDATE");
  assert.equal(result.receipt.finite_control.hold, null);
  assert.equal(result.receipt.finite_control.all_positions_finite, true);
});

interfaceIntegrationTest("Interface PR #10 keeps non-adjustable session overlays read-only, deterministic, subordinate, and exactly rollbackable", () => {
  assert.equal(interfaceCommit, EXPECTED_INTERFACE, "workflow must pin exact Interface PR #10 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile core");

  const interfaceMachine = require(path.resolve(interfaceRoot, "src"));
  const manifest = require(path.resolve(interfaceRoot, "machine.json"));
  const MorphTile = require(path.resolve(corePath));
  assert.equal(manifest.tested_against.commit, EXPECTED_CORE, "Interface manifest must identify the independently executed receiver");

  const result = verifyInterfaceCurrentRuntimeBoundary(interfaceMachine, MorphTile, { interfaceCommit, coreCommit });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.producer_status, "CANDIDATE");
  assert.equal(result.receipt.resolution_status, "READY");
  assert.equal(result.receipt.session_applied, false);
  assert.equal(result.receipt.deterministic_replay, true);
  assert.equal(result.receipt.canonical_unchanged, true);
  assert.equal(result.receipt.host_unchanged, true);
  assert.equal(result.receipt.rollback_exact, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});
