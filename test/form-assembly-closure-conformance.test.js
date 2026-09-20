"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyFormV08AssemblyClosure } = require("../src/form-v08-assembly-closure-conformance");

const env = {
  form: process.env.FORM_V08_REPO_PATH,
  formCommit: process.env.FORM_V08_COMMIT,
  assembly: process.env.ASSEMBLY_V06_REPO_PATH,
  assemblyCommit: process.env.ASSEMBLY_V06_COMMIT,
  core: process.env.MORPHTILE_V04_CORE_PATH,
  coreCommit: process.env.MORPHTILE_V04_COMMIT
};
const ready = Object.values(env).every(Boolean);

function machineEntry(repoPath) {
  return require(path.join(path.resolve(repoPath), "src"));
}

test("independently verifies Form v0.8 mixed pattern output through recursive Assembly closure, real runtime and portable kit", { skip: !ready }, () => {
  const form = machineEntry(env.form);
  const assembly = machineEntry(env.assembly);
  const { materializeKit } = require(path.join(path.resolve(env.assembly), "src", "kit"));
  const runtime = require(path.resolve(env.core));

  const result = verifyFormV08AssemblyClosure({
    form,
    assembly,
    materializeKit,
    runtime,
    revisions: {
      form: env.formCommit,
      assembly: env.assemblyCommit,
      morphtile: env.coreCommit
    }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.revisions.form, env.formCommit);
  assert.equal(result.receipt.revisions.assembly, env.assemblyCommit);
  assert.equal(result.receipt.revisions.morphtile, env.coreCommit);
  assert.deepEqual(result.receipt.nested_uses, ["frame", "panel"]);
  assert.equal(result.receipt.exact_64_status, "CANDIDATE");
  assert.equal(result.receipt.over_65_status, "HOLD");
  assert.equal(result.receipt.over_65_hold, "HOLD_FORM_COMPOSITION_INVALID");
  assert.deepEqual(result.receipt.direct_missing, ["frame", "panel"]);
  assert.deepEqual(result.receipt.transitive_missing, ["beam"]);
  assert.deepEqual(result.receipt.complete_required_definitions, ["beam", "frame", "panel"]);
  assert.equal(result.receipt.assembly_status, "CANDIDATE");
  assert.equal(result.receipt.runtime.hold, null);
  assert.equal(result.receipt.runtime.triangles, 10);
  assert.equal(result.receipt.kit_status, "CANDIDATE");
  assert.deepEqual(result.receipt.kit_defs, ["beam", "frame", "panel"]);
  assert.equal(result.receipt.kit_verification_status, "PASS");
});
