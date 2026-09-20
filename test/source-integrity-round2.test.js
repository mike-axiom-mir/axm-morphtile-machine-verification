"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfaceRepairAndIntentBoundary,
  verifyFormPreSerializationBoundary,
  verifyAssemblyPreSerializationBoundary
} = require("../src/source-integrity-round2-conformance");

const EXPECTED_SURFACE = "d078591b1e73f92b2b21dd7c35daf30822eb65e6";
const EXPECTED_FORM = "b698c8ebdecfcee7da1d0d245004bbdd595e4ee9";
const EXPECTED_ASSEMBLY = "807153339658d66f724feaece542a3802b08f82f";
const EXPECTED_CORE = "429a344f7d9333bef01cf9de1c292c3af09abec2";

const surfaceRoot = process.env.SOURCE_R2_SURFACE_ROOT;
const surfaceCommit = process.env.SOURCE_R2_SURFACE_COMMIT;
const formRoot = process.env.SOURCE_R2_FORM_ROOT;
const formCommit = process.env.SOURCE_R2_FORM_COMMIT;
const assemblyRoot = process.env.SOURCE_R2_ASSEMBLY_ROOT;
const assemblyCommit = process.env.SOURCE_R2_ASSEMBLY_COMMIT;
const corePath = process.env.SOURCE_R2_CORE_PATH;
const coreCommit = process.env.SOURCE_R2_CORE_COMMIT;

const surfaceIntegrationTest = surfaceRoot ? test : test.skip;
const formIntegrationTest = formRoot ? test : test.skip;
const assemblyIntegrationTest = assemblyRoot && corePath ? test : test.skip;

surfaceIntegrationTest("Surface repaired paint-field boundary passes, while the outer intent.paint accessor remains an independently detected FAIL/HOLD", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin the exact repaired Surface PR #15 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfaceRepairAndIntentBoundary(surface, { surfaceCommit });

  assert.equal(result.status, "FAIL", "current repaired head is expected to retain the newly exposed outer intent-field accessor gap");
  assert.ok(
    result.errors.some((entry) => entry.code === "SURFACE_INTENT_FIELD_ACCESSOR_EXECUTED_BEFORE_HOLD"),
    JSON.stringify(result, null, 2)
  );
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.previous_attack.pass, true, "the exact previous paint.color accessor failure must be closed on the repaired head");
  assert.equal(result.receipt.previous_attack.accessor_calls, 0);
  assert.ok(result.receipt.intent_field_attack.accessor_calls > 0, "the new receipt must prove caller-owned intent.paint accessor code executed");
  assert.equal(result.receipt.intent_field_attack.source_safe, false);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

formIntegrationTest("Form PR #16 rejects source-controlled request accessors and -0 before transport while preserving a portable caller recipe", () => {
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin exact Form PR #16 head");
  const form = require(path.resolve(formRoot, "src"));
  const result = verifyFormPreSerializationBoundary(form, { formCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.form_commit, EXPECTED_FORM);
  assert.equal(result.receipt.root_accessor.status, "HOLD");
  assert.equal(result.receipt.root_accessor.hold, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  assert.equal(result.receipt.root_accessor.accessor_calls, 0);
  assert.equal(result.receipt.negative_zero.status, "HOLD");
  assert.equal(result.receipt.negative_zero.hold, "HOLD_FORM_INPUT_NONPORTABLE_VALUE");
  assert.equal(result.receipt.negative_zero.path, "request.intent.recipe[0].pos[0]");
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
});

assemblyIntegrationTest("Assembly PR #19 protects request and kit trust boundaries without widening nested parent authority", () => {
  assert.equal(assemblyCommit, EXPECTED_ASSEMBLY, "workflow must pin exact Assembly PR #19 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin current MorphTile runtime");

  const assembly = require(path.resolve(assemblyRoot, "src"));
  const kitModule = require(path.resolve(assemblyRoot, "src", "kit"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyAssemblyPreSerializationBoundary(assembly, kitModule, MorphTile, { assemblyCommit, coreCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.equal(result.receipt.request_accessor.pass, true);
  assert.equal(result.receipt.request_accessor.accessor_calls, 0);
  assert.equal(result.receipt.portable_request.status, "CANDIDATE");
  assert.equal(result.receipt.portable_request.preserved, true);
  assert.equal(result.receipt.nested_parent_context.status, "HOLD");
  assert.equal(result.receipt.nested_parent_context.hold_preserved, true);
  assert.equal(result.receipt.kit_result_accessor.pass, true);
  assert.equal(result.receipt.kit_result_accessor.accessor_calls, 0);
  assert.equal(result.receipt.kit_options_accessor.pass, true);
  assert.equal(result.receipt.kit_options_accessor.accessor_calls, 0);
  assert.equal(result.receipt.portable_kit_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_kit_control.format, "morphtile-kit");
  assert.equal(result.receipt.portable_kit_control.pass, true);
});
