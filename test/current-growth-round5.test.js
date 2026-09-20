"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfaceNestedAuthoring,
  verifyFormRepeatRotation,
  verifyInterfaceMeter,
  verifyAssemblyCurrentHead
} = require("../src/current-growth-round5-conformance");

const EXPECTED_SURFACE = "dfc6b0a491a2a22d31738cc3d2e0e49d3b0c362f";
const EXPECTED_FORM = "05697081bbfe4443cdb5bfa6a93afdebf5c49bb6";
const EXPECTED_INTERFACE = "93f0c7161e8a3e3e58a067c4c227110fd5a294e6";
const EXPECTED_ASSEMBLY = "fb5c93153b7c3e9a364fa0b55f5a2d8d1fffb58d";
const EXPECTED_CORE = "429a344f7d9333bef01cf9de1c292c3af09abec2";

const surfaceRoot = process.env.GROWTH_R5_SURFACE_ROOT;
const formRoot = process.env.GROWTH_R5_FORM_ROOT;
const interfaceRoot = process.env.GROWTH_R5_INTERFACE_ROOT;
const assemblyRoot = process.env.GROWTH_R5_ASSEMBLY_ROOT;
const corePath = process.env.GROWTH_R5_CORE_PATH;

const surfaceCommit = process.env.GROWTH_R5_SURFACE_COMMIT;
const formCommit = process.env.GROWTH_R5_FORM_COMMIT;
const interfaceCommit = process.env.GROWTH_R5_INTERFACE_COMMIT;
const assemblyCommit = process.env.GROWTH_R5_ASSEMBLY_COMMIT;
const coreCommit = process.env.GROWTH_R5_CORE_COMMIT;

const surfaceTest = surfaceRoot ? test : test.skip;
const formTest = formRoot && corePath ? test : test.skip;
const interfaceTest = interfaceRoot && corePath ? test : test.skip;
const assemblyTest = assemblyRoot && corePath ? test : test.skip;

surfaceTest("Surface PR #16 nested snapshot replay exposes own __proto__ semantic rewrite while prior Proxy boundary remains closed", () => {
  assert.equal(surfaceCommit, EXPECTED_SURFACE, "workflow must pin exact Surface PR #16 head");
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfaceNestedAuthoring(surface, { surfaceCommit });

  // Green Verification means the verifier reproduced this producer FAIL/HOLD;
  // it does not relabel the Surface candidate PASS.
  assert.equal(result.status, "FAIL", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors.map((entry) => entry.code), ["SURFACE_COMPILED_AUTHORING_PROTO_KEY_REWRITTEN"]);
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.portable_control.status, "CANDIDATE");
  assert.equal(result.receipt.portable_control.deterministic, true);
  assert.equal(result.receipt.portable_control.source_preserved, true);
  assert.equal(result.receipt.nested_proxy.status, "HOLD");
  assert.equal(result.receipt.nested_proxy.hold, "HOLD_SURFACE_PATTERN_NONPORTABLE_VALUE");
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.special_key.status, "CANDIDATE");
  assert.equal(result.receipt.special_key.candidate_present, true);
  assert.equal(result.receipt.special_key.source_preserved, true);
  assert.equal(result.receipt.special_key.global_prototype_clean, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

formTest("Form PR #18 repeat rotation is deterministic, bounded, and executes as finite changed geometry in current MorphTile", () => {
  assert.equal(formCommit, EXPECTED_FORM, "workflow must pin exact Form PR #18 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile core");
  const form = require(path.resolve(formRoot, "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyFormRepeatRotation(form, MorphTile, { formCommit, morphTileCommit: coreCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.form_commit, EXPECTED_FORM);
  assert.equal(result.receipt.morphtile_commit, EXPECTED_CORE);
  assert.equal(result.receipt.deterministic_replay, true);
  assert.equal(result.receipt.source_preserved, true);
  assert.equal(result.receipt.runtime.hold, null);
  assert.equal(result.receipt.runtime.recipe_parts, 4);
  assert.equal(result.receipt.runtime.positions_finite, true);
  assert.equal(result.receipt.runtime.geometry_differs_from_straight, true);
  assert.equal(result.receipt.runtime.triangle_count_preserved, true);
  assert.deepEqual(result.receipt.overflow, { status: "HOLD", hold: "HOLD_FORM_REPEAT_INVALID" });
});

interfaceTest("Interface PR #13 meter remains symbolic, requires a real readout proof, follows canonical state, and rolls back exactly", () => {
  assert.equal(interfaceCommit, EXPECTED_INTERFACE, "workflow must pin exact Interface PR #13 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile core");
  const interfaceMachine = require(path.resolve(interfaceRoot, "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyInterfaceMeter(interfaceMachine, MorphTile, { interfaceCommit, morphTileCommit: coreCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.interface_commit, EXPECTED_INTERFACE);
  assert.equal(result.receipt.morphtile_commit, EXPECTED_CORE);
  assert.equal(result.receipt.deterministic_replay, true);
  assert.equal(result.receipt.source_preserved, true);
  assert.equal(result.receipt.live_proof, "PASS");
  assert.equal(result.receipt.missing_readout_proof.status, "HOLD");
  assert.ok(result.receipt.missing_readout_proof.codes.includes("INTERFACE_TARGET_READOUT_MISSING"));
  assert.equal(result.receipt.runtime.before_value, 0);
  assert.equal(result.receipt.runtime.on_value, 1);
  assert.equal(result.receipt.runtime.restored_value, 0);
  assert.equal(result.receipt.runtime.off_zero, true);
  assert.equal(result.receipt.runtime.on_full, true);
  assert.equal(result.receipt.runtime.compile_read_only_off, true);
  assert.equal(result.receipt.runtime.compile_read_only_on, true);
  assert.equal(result.receipt.runtime.rollback_exact, true);
  assert.equal(result.receipt.runtime.structural_restored, true);
  assert.equal(result.receipt.state_authority, "CANONICAL_MORPHTILE_ONLY");
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

assemblyTest("Assembly PR #20 latest sibling-convergence head retains the independently verified request/kit Proxy safety", () => {
  assert.equal(assemblyCommit, EXPECTED_ASSEMBLY, "workflow must pin exact latest Assembly PR #20 head");
  assert.equal(coreCommit, EXPECTED_CORE, "workflow must pin exact current MorphTile core");
  const assembly = require(path.resolve(assemblyRoot, "src"));
  const kitModule = require(path.resolve(assemblyRoot, "src", "kit"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyAssemblyCurrentHead(assembly, kitModule, MorphTile, { assemblyCommit, coreCommit });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE);
  assert.equal(result.receipt.root_proxy.trap_calls, 0);
  assert.equal(result.receipt.root_proxy.pass, true);
  assert.equal(result.receipt.nested_proxy.trap_calls, 0);
  assert.equal(result.receipt.nested_proxy.pass, true);
  assert.equal(result.receipt.revoked_request.pass, true);
  assert.equal(result.receipt.kit_candidate_proxy.trap_calls, 0);
  assert.equal(result.receipt.kit_candidate_proxy.pass, true);
  assert.equal(result.receipt.revoked_result.pass, true);
  assert.equal(result.receipt.revoked_options.pass, true);
  assert.equal(result.receipt.portable_kit.status, "CANDIDATE");
  assert.equal(result.receipt.portable_kit.format, "morphtile-kit");
  assert.equal(result.receipt.portable_kit.pass, true);
});
