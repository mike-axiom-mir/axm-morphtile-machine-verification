"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyInterfaceAssemblyCompatibility } = require("../src/interface-assembly-conformance");

const env = {
  interface: process.env.INTERFACE_COMPAT_REPO_PATH,
  interfaceCommit: process.env.INTERFACE_COMPAT_COMMIT,
  assembly: process.env.ASSEMBLY_COMPAT_REPO_PATH,
  assemblyCommit: process.env.ASSEMBLY_COMPAT_COMMIT
};
const ready = Object.values(env).every(Boolean);

test("reports current Interface v0.5 to Assembly schema drift as a bounded verification FAIL/HOLD", { skip: !ready }, () => {
  const interfaceMachine = require(path.resolve(env.interface));
  const assemblyMachine = require(path.resolve(env.assembly));

  const result = verifyInterfaceAssemblyCompatibility({
    interfaceMachine,
    assemblyMachine,
    revisions: {
      interface: env.interfaceCommit,
      assembly: env.assemblyCommit
    }
  });

  assert.equal(result.status, "FAIL", JSON.stringify(result, null, 2));
  assert.ok(result.errors.some((item) => item.code === "INTERFACE_ASSEMBLY_SCHEMA_DRIFT"), JSON.stringify(result, null, 2));
  assert.equal(result.receipt.interface_status, "CANDIDATE");
  assert.equal(result.receipt.interface_schema, "morphtile.view-operation/v0.5");
  assert.equal(result.receipt.assembly_status, "HOLD");
  assert.equal(result.receipt.expected_schema_hold_observed, true);
  assert.equal(result.receipt.compatibility, "HOLD");
  assert.equal(result.receipt.revisions.interface, env.interfaceCommit);
  assert.equal(result.receipt.revisions.assembly, env.assemblyCommit);
});
