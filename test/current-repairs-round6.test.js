"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const {
  verifySurfaceSpecialKeyRepair,
  verifyCoreRecipeOwnKeyIdentity,
  verifyInterfaceCurrentAssembly,
  verifyAssemblyFormRotation
} = require("../src/current-repairs-round6-conformance");

const EXPECTED_SURFACE = "5f4064364f216b4e83bd29b157d935265cc56d43";
const EXPECTED_CORE_PR15 = "f3b246894d3bafcb5918764cdb31fb44f436d448";
const EXPECTED_CORE_MAIN = "429a344f7d9333bef01cf9de1c292c3af09abec2";
const EXPECTED_INTERFACE = "f6e48a23da5a46d5f89aace920c906128cdc6669";
const EXPECTED_ASSEMBLY_MAIN = "688a39fc9762b2192d7db9f777416dafe5bf6ed7";
const EXPECTED_ASSEMBLY_PR21 = "e1043898bb69bf17a8b678e8a0f982f9d8082676";
const EXPECTED_FORM_MAIN = "6adea73ea3a396aa60fc6207372ba7ea611c60fc";

const surfaceRoot = process.env.R6_SURFACE_ROOT;
const corePr15Path = process.env.R6_CORE_PR15_PATH;
const coreMainPath = process.env.R6_CORE_MAIN_PATH;
const interfaceRoot = process.env.R6_INTERFACE_ROOT;
const assemblyMainRoot = process.env.R6_ASSEMBLY_MAIN_ROOT;
const assemblyPr21Root = process.env.R6_ASSEMBLY_PR21_ROOT;
const formRoot = process.env.R6_FORM_ROOT;

const surfaceTest = surfaceRoot ? test : test.skip;
const coreTest = corePr15Path ? test : test.skip;
const interfaceTest = interfaceRoot && assemblyMainRoot && coreMainPath ? test : test.skip;
const assemblyTest = assemblyPr21Root && formRoot && coreMainPath ? test : test.skip;

surfaceTest("Surface PR #16 repaired exact head closes the original own-key rewrite and preserves alternate inherited-looking keys as data", () => {
  assert.equal(process.env.R6_SURFACE_COMMIT, EXPECTED_SURFACE);
  const surface = require(path.resolve(surfaceRoot, "src"));
  const result = verifySurfaceSpecialKeyRepair(surface, { surfaceCommit: process.env.R6_SURFACE_COMMIT });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.surface_commit, EXPECTED_SURFACE);
  assert.equal(result.receipt.replayed_original_failure.status, "HOLD");
  assert.equal(result.receipt.replayed_original_failure.hold, "HOLD_SURFACE_RULE_FIELD_UNKNOWN");
  assert.equal(result.receipt.replayed_original_failure.candidate_present, false);
  assert.equal(result.receipt.replayed_original_failure.source_preserved, true);
  assert.equal(result.receipt.replayed_original_failure.global_prototype_clean, true);
  assert.equal(result.receipt.constructor_key.status, "HOLD");
  assert.equal(result.receipt.constructor_key.hold, "HOLD_SURFACE_RULE_FIELD_UNKNOWN");
  assert.equal(result.receipt.constructor_key.source_preserved, true);
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

coreTest("MorphTile core PR #15 preserves authored own recipe namespace keys and blocks inherited host-object names from becoming authority", () => {
  assert.equal(process.env.R6_CORE_PR15_COMMIT, EXPECTED_CORE_PR15);
  const MorphTile = require(path.resolve(corePr15Path));
  const result = verifyCoreRecipeOwnKeyIdentity(MorphTile, { coreCommit: process.env.R6_CORE_PR15_COMMIT });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE_PR15);
  assert.equal(result.receipt.authored.every((entry) => entry.pass), true);
  assert.equal(result.receipt.absent.every((entry) => entry.pass), true);
  assert.equal(result.receipt.loop.pass, true);
  assert.equal(result.receipt.definition.pass, true);
  assert.equal(result.receipt.definition.source_preserved, true);
});

interfaceTest("Interface PR #13 current exact head keeps meter semantics and independently replays transport against exact current Assembly main", () => {
  assert.equal(process.env.R6_INTERFACE_COMMIT, EXPECTED_INTERFACE);
  assert.equal(process.env.R6_ASSEMBLY_MAIN_COMMIT, EXPECTED_ASSEMBLY_MAIN);
  assert.equal(process.env.R6_CORE_MAIN_COMMIT, EXPECTED_CORE_MAIN);

  const Interface = require(path.resolve(interfaceRoot, "src"));
  const Assembly = require(path.resolve(assemblyMainRoot, "src"));
  const { materializeKit } = require(path.resolve(assemblyMainRoot, "src", "kit"));
  const MorphTile = require(path.resolve(coreMainPath));
  const integrationSources = require(path.resolve(interfaceRoot, "fixtures", "integration-sources.json"));
  const result = verifyInterfaceCurrentAssembly(Interface, Assembly, materializeKit, MorphTile, integrationSources, {
    interfaceCommit: process.env.R6_INTERFACE_COMMIT,
    assemblyCommit: process.env.R6_ASSEMBLY_MAIN_COMMIT,
    coreCommit: process.env.R6_CORE_MAIN_COMMIT
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.interface_commit, EXPECTED_INTERFACE);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY_MAIN);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE_MAIN);
  assert.equal(result.receipt.receiver_pin_exact, true);
  assert.equal(result.receipt.meter_status, "PASS");
  assert.equal(result.receipt.transport_status, "PASS");
  assert.equal(result.receipt.meter.runtime.rollback_exact, true);
  assert.equal(result.receipt.meter.runtime.structural_restored, true);
  assert.equal(result.receipt.transport.fresh_import_status, "READY");
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
});

assemblyTest("Assembly PR #21 preserves Form 0.11 rotation plus definition closure through kit hash, fresh import, and real runtime meaning", () => {
  assert.equal(process.env.R6_ASSEMBLY_PR21_COMMIT, EXPECTED_ASSEMBLY_PR21);
  assert.equal(process.env.R6_FORM_COMMIT, EXPECTED_FORM_MAIN);
  assert.equal(process.env.R6_CORE_MAIN_COMMIT, EXPECTED_CORE_MAIN);

  const Form = require(path.resolve(formRoot, "src"));
  const Assembly = require(path.resolve(assemblyPr21Root, "src"));
  const { materializeKit } = require(path.resolve(assemblyPr21Root, "src", "kit"));
  const MorphTile = require(path.resolve(coreMainPath));
  const result = verifyAssemblyFormRotation(Form, Assembly, materializeKit, MorphTile, {
    formCommit: process.env.R6_FORM_COMMIT,
    assemblyCommit: process.env.R6_ASSEMBLY_PR21_COMMIT,
    coreCommit: process.env.R6_CORE_MAIN_COMMIT
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.form_commit, EXPECTED_FORM_MAIN);
  assert.equal(result.receipt.assembly_commit, EXPECTED_ASSEMBLY_PR21);
  assert.equal(result.receipt.core_commit, EXPECTED_CORE_MAIN);
  assert.equal(result.receipt.form_exact, true);
  assert.deepEqual(result.receipt.missing_definition, { status: "HOLD", hold: "HOLD_DEFINITION_CLOSURE_INCOMPLETE" });
  assert.equal(result.receipt.complete_status, "CANDIDATE");
  assert.equal(result.receipt.kit_verification_status, "PASS");
  assert.deepEqual(result.receipt.rotation_tamper, { status: "HOLD_HASH_MISMATCH", receiver_unchanged: true });
  assert.equal(result.receipt.runtime.import_status, "READY");
  assert.equal(result.receipt.runtime.import_evidence, "verified_payload_sha256");
  assert.equal(result.receipt.runtime.exact_parts_preserved, true);
  assert.equal(result.receipt.runtime.hold, null);
  assert.equal(result.receipt.runtime.recipe_parts, 3);
  assert.equal(result.receipt.runtime.positions_finite, true);
});
