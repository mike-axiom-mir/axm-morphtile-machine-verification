"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyInterfaceAssemblyCompatibility } = require("../src/interface-assembly-conformance");

const original = {
  interface: process.env.INTERFACE_COMPAT_REPO_PATH,
  interfaceCommit: process.env.INTERFACE_COMPAT_COMMIT,
  assembly: process.env.ASSEMBLY_COMPAT_REPO_PATH,
  assemblyCommit: process.env.ASSEMBLY_COMPAT_COMMIT
};
const originalReady = Object.values(original).every(Boolean);

const repaired = {
  interface: process.env.INTERFACE_COMPAT_REPAIRED_REPO_PATH,
  interfaceCommit: process.env.INTERFACE_COMPAT_REPAIRED_COMMIT,
  assembly: process.env.ASSEMBLY_COMPAT_REPAIRED_REPO_PATH,
  assemblyCommit: process.env.ASSEMBLY_COMPAT_REPAIRED_COMMIT
};
const repairedReady = Object.values(repaired).every(Boolean);

function machineEntry(repoPath) {
  return require(path.join(path.resolve(repoPath), "src"));
}

test("preserves the original Interface v0.5 to pre-repair Assembly schema drift as a bounded FAIL/HOLD receipt", { skip: !originalReady }, () => {
  const interfaceMachine = machineEntry(original.interface);
  const assemblyMachine = machineEntry(original.assembly);

  const result = verifyInterfaceAssemblyCompatibility({
    interfaceMachine,
    assemblyMachine,
    revisions: {
      interface: original.interfaceCommit,
      assembly: original.assemblyCommit
    }
  });

  assert.equal(result.status, "FAIL", JSON.stringify(result, null, 2));
  assert.ok(result.errors.some((item) => item.code === "INTERFACE_ASSEMBLY_SCHEMA_DRIFT"), JSON.stringify(result, null, 2));
  assert.equal(result.receipt.interface_status, "CANDIDATE");
  assert.equal(result.receipt.interface_schema, "morphtile.view-operation/v0.5");
  assert.equal(result.receipt.assembly_status, "HOLD");
  assert.equal(result.receipt.expected_schema_hold_observed, true);
  assert.equal(result.receipt.compatibility, "HOLD");
  assert.equal(result.receipt.revisions.interface, original.interfaceCommit);
  assert.equal(result.receipt.revisions.assembly, original.assemblyCommit);
});

test("independently re-runs the same Interface v0.5 boundary against the repaired Assembly candidate", { skip: !repairedReady }, () => {
  const interfaceMachine = machineEntry(repaired.interface);
  const assemblyMachine = machineEntry(repaired.assembly);

  const result = verifyInterfaceAssemblyCompatibility({
    interfaceMachine,
    assemblyMachine,
    revisions: {
      interface: repaired.interfaceCommit,
      assembly: repaired.assemblyCommit
    }
  });

  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.interface_status, "CANDIDATE");
  assert.equal(result.receipt.interface_schema, "morphtile.view-operation/v0.5");
  assert.equal(result.receipt.nested_structure_present, true);
  assert.equal(result.receipt.assembly_status, "CANDIDATE");
  assert.equal(result.receipt.expected_schema_hold_observed, false);
  assert.equal(result.receipt.compatibility, "PASS");
  assert.equal(result.receipt.revisions.interface, repaired.interfaceCommit);
  assert.equal(result.receipt.revisions.assembly, repaired.assemblyCommit);
});
