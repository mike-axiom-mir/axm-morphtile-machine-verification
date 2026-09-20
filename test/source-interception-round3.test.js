"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfaceOuterRepairAndProxyBoundary,
  verifyFormProxyBoundary,
  verifyInterfaceProxyAndReceiverBoundary,
  verifyAssemblyProxyBoundary
} = require("../src/source-interception-round3-conformance");

const EXPECTED_SURFACE = "20245de80c6a866d7bd8ed2508a2c4e2fbc897cd";
const EXPECTED_FORM = "b8c26f06671ec6ce034c0956d3b34a3bd80ebf47";
const EXPECTED_INTERFACE = "d1ffb78b64104a696f6ff6f1ef50f0b4e73caa32";
const EXPECTED_ASSEMBLY_RECEIVER = "1b81da5e3c885a904236cc643c910b83ad0d7bc6";
const EXPECTED_ASSEMBLY_CANDIDATE = "cc95e92965e896638bb27c8492d1bda43b7fc8e4";
const EXPECTED_CORE = "429a344f7d9333bef01cf9de1c292c3af09abec2";

const surfaceRoot = process.env.SOURCE_R3_SURFACE_ROOT;
const formRoot = process.env.SOURCE_R3_FORM_ROOT;
const interfaceRoot = process.env.SOURCE_R3_INTERFACE_ROOT;
const assemblyReceiverRoot = process.env.SOURCE_R3_ASSEMBLY_RECEIVER_ROOT;
const assemblyCandidateRoot = process.env.SOURCE_R3_ASSEMBLY_CANDIDATE_ROOT;
const corePath = process.env.SOURCE_R3_CORE_PATH;

const surfaceCommit = process.env.SOURCE_R3_SURFACE_COMMIT;
const formCommit = process.env.SOURCE_R3_FORM_COMMIT;
const interfaceCommit = process.env.SOURCE_R3_INTERFACE_COMMIT;
const assemblyReceiverCommit = process.env.SOURCE_R3_ASSEMBLY_RECEIVER_COMMIT;
const assemblyCandidateCommit = process.env.SOURCE_R3_ASSEMBLY_CANDIDATE_COMMIT;
const coreCommit = process.env.SOURCE_R3_CORE_COMMIT;

const surfaceTest = surfaceRoot ? test : test.skip;
const formTest = formRoot ? test : test.skip;
const interfaceTest = interfaceRoot && assemblyReceiverRoot ? test : test.skip;
const assemblyTest = assemblyCandidateRoot && corePath ? test : test.skip;

surfaceTest("Surface outer accessor repair passes, but Proxy interception remains an independently detected FAIL/HOLD", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin exact repaired Surface PR #15 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfaceOuterRepairAndProxyBoundary(surface, { surfaceCommit });

  assert.equal(result.status, "FAIL", "the repaired Surface head is expected to retain the newly attacked Proxy-reflection gap");
  assert.ok(
    result.errors.some((entry) => entry.code === "SURFACE_INTENT_PROXY_TRAP_EXECUTED"),
    JSON.stringify(result, null, 2)
  );
  assert.ok(
    result.errors.some((entry) => entry.code === "SURFACE_PAINT_PROXY_TRAP_EXECUTED"),
    JSON.stringify(result, null, 2)
  );
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.ok(result.receipt.outer_accessor_fields.every((entry) => entry.pass && entry.calls === 0), JSON.stringify(result.receipt.outer_accessor_fields, null, 2));
  assert.equal(result.receipt.nested_paint_accessor.pass, true);
  assert.equal(result.receipt.nested_paint_accessor.calls, 0);
  assert.ok(result.receipt.intent_proxy.trap_calls > 0, "receipt must prove caller Proxy traps actually executed on current Surface head");
  assert.equal(result.receipt.intent_proxy.source_safe, false);
  assert.ok(result.receipt.paint_proxy.trap_calls > 0, "receipt must prove nested paint Proxy traps actually executed on current Surface head");
  assert.equal(result.receipt.paint_proxy.source_safe, false);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

formTest("Form PR #17 rejects nested, root and revoked Proxy interception before reflection while preserving portable input", () => {
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin exact Form PR #17 head");
  const form = require(path.resolve(formRoot, "src"));
  const result = verifyFormProxyBoundary(form, { formCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.form_commit, EXPECTED_FORM);
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_proxy.path, "request.intent.recipe[0]");
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.path, "request");
  assert.equal(result.receipt.revoked_root_proxy.threw, null);
  assert.equal(result.receipt.revoked_root_proxy.pass, true);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.preserved, true);
});

interfaceTest("Interface PR #11 rejects authored accessors, Proxy interception and hidden transport hooks while current Assembly preserves exact proof identity", () => {
  assert.equal(interfaceCommit, EXPECTED_INTERFACE, "workflow must pin exact Interface PR #11 head");
  assert.equal(assemblyReceiverCommit, EXPECTED_ASSEMBLY_RECEIVER, "workflow must pin current integrated Assembly receiver");
  const interfaceMachine = require(path.resolve(interfaceRoot, "src"));
  const assemblyReceiver = require(path.resolve(assemblyReceiverRoot, "src"));
  const result = verifyInterfaceProxyAndReceiverBoundary(interfaceMachine, assemblyReceiver, {
    interfaceCommit,
    assemblyCommit: assemblyReceiverCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.interface_commit, EXPECTED_INTERFACE);
  assert.equal(result.receipt.assembly_receiver_commit, EXPECTED_ASSEMBLY_RECEIVER);
  assert.equal(result.receipt.request_intent_accessor.calls, 0);
  assert.equal(result.receipt.request_intent_accessor.pass, true);
  assert.equal(result.receipt.root_intent_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_intent_proxy.pass, true);
  assert.equal(result.receipt.nested_placement_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_placement_proxy.pass, true);
  assert.equal(result.receipt.hidden_tojson.calls, 0);
  assert.equal(result.receipt.hidden_tojson.pass, true);
  assert.equal(result.receipt.special_proto_key.hold, "HOLD_INTERFACE_INTENT_FIELD_UNKNOWN");
  assert.equal(result.receipt.special_proto_key.source_preserved, true);
  assert.equal(result.receipt.special_proto_key.prototype_polluted, false);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.source_preserved, true);
  assert.equal(result.receipt.receiver_proof.pass, true);
  assert.deepEqual(result.receipt.receiver_proof.dependency_ids, ["morphtile.interface-target-proof:mt_shell/mt_inner"]);
  assert.deepEqual(result.receipt.receiver_proof.target_binding, { id: "mt_inner", path: "mt_shell/mt_inner" });
});

assemblyTest("Assembly PR #20 rejects Proxy interception at request and kit boundaries, including revoked Proxies, while portable kit materialization remains valid", () => {
  assert.equal(assemblyCandidateCommit, EXPECTED_ASSEMBLY_CANDIDATE, "workflow must pin exact Assembly PR #20 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin current MorphTile runtime");
  const assembly = require(path.resolve(assemblyCandidateRoot, "src"));
  const kitModule = require(path.resolve(assemblyCandidateRoot, "src", "kit"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyAssemblyProxyBoundary(assembly, kitModule, MorphTile, {
    assemblyCommit: assemblyCandidateCommit,
    coreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY_CANDIDATE);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.path, "request");
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_proxy.path, "request.dependencies[0]");
  assert.equal(result.receipt.revoked_request.threw, null);
  assert.equal(result.receipt.revoked_request.pass, true);
  assert.equal(result.receipt.portable_request.status, "CANDIDATE");
  assert.equal(result.receipt.portable_request.preserved, true);
  assert.equal(result.receipt.kit_candidate_proxy.trap_calls, 0);
  assert.equal(result.receipt.kit_candidate_proxy.path, "assembly_result.candidate");
  assert.equal(result.receipt.revoked_result.threw, null);
  assert.equal(result.receipt.revoked_result.pass, true);
  assert.equal(result.receipt.revoked_options.threw, null);
  assert.equal(result.receipt.revoked_options.pass, true);
  assert.equal(result.receipt.portable_kit.status, "CANDIDATE");
  assert.equal(result.receipt.portable_kit.format, "morphtile-kit");
  assert.equal(result.receipt.portable_kit.pass, true);
});
