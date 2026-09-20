"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfaceOuterRepairAndProxyBoundary,
  verifyFormProxyBoundary,
  verifyAssemblyProxyBoundary
} = require("../src/source-interception-round3-conformance");
const {
  verifyInterfaceEnvelopeAndReceiver
} = require("../src/source-integrity-round4-conformance");

const EXPECTED_SURFACE = "3026016693e1132c219876c92cd24b801aa7d25f";
const EXPECTED_FORM = "f2fe446cf67310ad23e1e6fccf9866160b3fafac";
const EXPECTED_INTERFACE = "d8c06b9d1db6d0350c4b443b562be19fb67d4e6f";
const EXPECTED_ASSEMBLY = "2ac0df773c8318b46945fb5814b7c5d4b78a3e10";
const EXPECTED_CORE = "429a344f7d9333bef01cf9de1c292c3af09abec2";

const surfaceRoot = process.env.SOURCE_R4_SURFACE_ROOT;
const formRoot = process.env.SOURCE_R4_FORM_ROOT;
const interfaceRoot = process.env.SOURCE_R4_INTERFACE_ROOT;
const assemblyRoot = process.env.SOURCE_R4_ASSEMBLY_ROOT;
const corePath = process.env.SOURCE_R4_CORE_PATH;

const surfaceCommit = process.env.SOURCE_R4_SURFACE_COMMIT;
const formCommit = process.env.SOURCE_R4_FORM_COMMIT;
const interfaceCommit = process.env.SOURCE_R4_INTERFACE_COMMIT;
const assemblyCommit = process.env.SOURCE_R4_ASSEMBLY_COMMIT;
const coreCommit = process.env.SOURCE_R4_CORE_COMMIT;

const surfaceTest = surfaceRoot ? test : test.skip;
const formTest = formRoot ? test : test.skip;
const interfaceTest = interfaceRoot && assemblyRoot ? test : test.skip;
const assemblyTest = assemblyRoot && corePath ? test : test.skip;

surfaceTest("Surface PR #15 repaired head closes the exact Proxy-reflection failures from Verification #29", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin exact repaired Surface PR #15 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfaceOuterRepairAndProxyBoundary(surface, { surfaceCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.ok(result.receipt.outer_accessor_fields.every((entry) => entry.pass && entry.calls === 0), JSON.stringify(result.receipt.outer_accessor_fields, null, 2));
  assert.equal(result.receipt.nested_paint_accessor.pass, true);
  assert.equal(result.receipt.nested_paint_accessor.calls, 0);
  assert.equal(result.receipt.intent_proxy.trap_calls, 0);
  assert.equal(result.receipt.intent_proxy.hold, "HOLD_SURFACE_INTENT_NONPORTABLE_VALUE");
  assert.equal(result.receipt.intent_proxy.source_safe, true);
  assert.equal(result.receipt.paint_proxy.trap_calls, 0);
  assert.equal(result.receipt.paint_proxy.hold, "HOLD_SURFACE_PAINT_NONPORTABLE_VALUE");
  assert.equal(result.receipt.paint_proxy.source_safe, true);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

formTest("Form PR #17 repaired head closes the revoked-root-Proxy failure from Verification #29", () => {
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin exact repaired Form PR #17 head");
  const form = require(path.resolve(formRoot, "src"));
  const result = verifyFormProxyBoundary(form, { formCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.form_commit, EXPECTED_FORM);
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_proxy.path, "request.intent.recipe[0]");
  assert.equal(result.receipt.nested_proxy.pass, true);
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.path, "request");
  assert.equal(result.receipt.root_proxy.pass, true);
  assert.equal(result.receipt.revoked_root_proxy.status, "HOLD");
  assert.equal(result.receipt.revoked_root_proxy.path, "request");
  assert.equal(result.receipt.revoked_root_proxy.threw, null);
  assert.equal(result.receipt.revoked_root_proxy.pass, true);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
});

interfaceTest("Interface PR #12 rejects executable envelope/provenance source and still preserves proof identity through current Assembly PR #20", () => {
  assert.equal(interfaceCommit, EXPECTED_INTERFACE, "workflow must pin exact Interface PR #12 head");
  assert.equal(assemblyCommit, EXPECTED_ASSEMBLY, "workflow must pin exact current Assembly PR #20 head");
  const interfaceMachine = require(path.resolve(interfaceRoot, "src"));
  const assembly = require(path.resolve(assemblyRoot, "src"));
  const fixture = require(path.resolve(interfaceRoot, "fixtures", "request.counter-view.json"));
  const result = verifyInterfaceEnvelopeAndReceiver(interfaceMachine, assembly, fixture, {
    interfaceCommit,
    assemblyCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.interface_commit, EXPECTED_INTERFACE);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY);
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.error_code, "INTERFACE_ENVELOPE_NONPORTABLE_VALUE");
  assert.equal(result.receipt.root_proxy.pass, true);
  assert.equal(result.receipt.revoked_root_proxy.error_code, "INTERFACE_ENVELOPE_NONPORTABLE_VALUE");
  assert.equal(result.receipt.revoked_root_proxy.pass, true);
  assert.equal(result.receipt.request_id_accessor.calls, 0);
  assert.equal(result.receipt.request_id_accessor.descriptor_preserved, true);
  assert.equal(result.receipt.request_id_accessor.pass, true);
  assert.equal(result.receipt.provenance_accessor.calls, 0);
  assert.equal(result.receipt.provenance_accessor.pass, true);
  assert.equal(result.receipt.provenance_proxy.trap_calls, 0);
  assert.equal(result.receipt.provenance_proxy.error_code, "INTERFACE_ENVELOPE_NONPORTABLE_VALUE");
  assert.equal(result.receipt.provenance_proxy.pass, true);
  assert.equal(result.receipt.revoked_provenance_proxy.error_code, "INTERFACE_ENVELOPE_NONPORTABLE_VALUE");
  assert.equal(result.receipt.revoked_provenance_proxy.pass, true);
  assert.equal(result.receipt.provenance_tojson.calls, 0);
  assert.equal(result.receipt.provenance_tojson.pass, true);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.source_preserved, true);
  assert.equal(result.receipt.portable_control.provenance_preserved, true);
  assert.equal(result.receipt.portable_control.normal_prototype, true);
  assert.equal(result.receipt.portable_control.pass, true);
  assert.equal(result.receipt.receiver_regression.interface_commit, EXPECTED_INTERFACE);
  assert.equal(result.receipt.receiver_regression.assembly_receiver_commit, EXPECTED_ASSEMBLY);
  assert.equal(result.receipt.receiver_regression.receiver_proof.pass, true);
  assert.deepEqual(result.receipt.receiver_regression.receiver_proof.dependency_ids, ["morphtile.interface-target-proof:mt_shell/mt_inner"]);
  assert.deepEqual(result.receipt.receiver_regression.receiver_proof.target_binding, { id: "mt_inner", path: "mt_shell/mt_inner" });
});

assemblyTest("Assembly PR #20 current convergence head retains its independently verified request/kit Proxy safety", () => {
  assert.equal(assemblyCommit, EXPECTED_ASSEMBLY, "workflow must pin exact current Assembly PR #20 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile runtime");
  const assembly = require(path.resolve(assemblyRoot, "src"));
  const kitModule = require(path.resolve(assemblyRoot, "src", "kit"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyAssemblyProxyBoundary(assembly, kitModule, MorphTile, {
    assemblyCommit,
    coreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.path, "request");
  assert.equal(result.receipt.root_proxy.pass, true);
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_proxy.path, "request.dependencies[0]");
  assert.equal(result.receipt.nested_proxy.pass, true);
  assert.equal(result.receipt.revoked_request.threw, null);
  assert.equal(result.receipt.revoked_request.pass, true);
  assert.equal(result.receipt.kit_candidate_proxy.trap_calls, 0);
  assert.equal(result.receipt.kit_candidate_proxy.path, "assembly_result.candidate");
  assert.equal(result.receipt.kit_candidate_proxy.pass, true);
  assert.equal(result.receipt.revoked_result.threw, null);
  assert.equal(result.receipt.revoked_result.pass, true);
  assert.equal(result.receipt.revoked_options.threw, null);
  assert.equal(result.receipt.revoked_options.pass, true);
  assert.equal(result.receipt.portable_kit.status, "CANDIDATE");
  assert.equal(result.receipt.portable_kit.format, "morphtile-kit");
  assert.equal(result.receipt.portable_kit.pass, true);
});