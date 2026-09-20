"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyAssemblyCurrentRetention } = require("../src/assembly-current-retention-conformance");

const env = {
  assembly: process.env.ASSEMBLY_RETENTION_REPO_PATH,
  assemblyCommit: process.env.ASSEMBLY_RETENTION_COMMIT,
  form: process.env.FORM_RETENTION_REPO_PATH,
  formCommit: process.env.FORM_RETENTION_COMMIT,
  surface: process.env.SURFACE_RETENTION_REPO_PATH,
  surfaceCommit: process.env.SURFACE_RETENTION_COMMIT,
  capability: process.env.CAPABILITY_RETENTION_REPO_PATH,
  capabilityCommit: process.env.CAPABILITY_RETENTION_COMMIT,
  core: process.env.MORPHTILE_RETENTION_CORE_PATH,
  coreCommit: process.env.MORPHTILE_RETENTION_COMMIT
};
const ready = Object.values(env).every(Boolean);

function machineEntry(repoPath) {
  return require(path.join(path.resolve(repoPath), "src"));
}

test("independently verifies current Surface + Capability semantics through Assembly, kit hash, import and targeted tamper rejection", { skip: !ready }, () => {
  const assembly = machineEntry(env.assembly);
  const { materializeKit } = require(path.join(path.resolve(env.assembly), "src", "kit"));
  const form = machineEntry(env.form);
  const surface = machineEntry(env.surface);
  const capability = machineEntry(env.capability);
  const runtime = require(path.resolve(env.core));

  const result = verifyAssemblyCurrentRetention({
    assembly,
    materializeKit,
    form,
    surface,
    capability,
    runtime,
    revisions: {
      assembly: env.assemblyCommit,
      form: env.formCommit,
      surface: env.surfaceCommit,
      capability: env.capabilityCommit,
      morphtile: env.coreCommit
    }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.revisions.assembly, env.assemblyCommit);
  assert.equal(result.receipt.revisions.surface, env.surfaceCommit);
  assert.equal(result.receipt.revisions.capability, env.capabilityCommit);
  assert.equal(result.receipt.revisions.morphtile, env.coreCommit);
  assert.equal(result.receipt.generic_kit_status, "PASS");
  assert.equal(result.receipt.fresh_import_status, "READY");
  assert.equal(result.receipt.surface_pattern, "checker");
  assert.equal(result.receipt.surface_scale, 2.25);
  assert.deepEqual(result.receipt.capability_wake, { on: "value", tile: "", var: "count", over: 3, sleeps: false });
  assert.notEqual(result.receipt.assembly_closure_hash, result.receipt.omission_closure_hash);
  assert.deepEqual(result.receipt.falsey_tamper_cases, [
    { id: "false-to-true", status: "HOLD_HASH_MISMATCH", receiver_mutated: false },
    { id: "empty-tile-omitted", status: "HOLD_HASH_MISMATCH", receiver_mutated: false }
  ]);
});
