const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { verifyNestedInterfaceAssemblyTransport } = require("../src/nested-interface-assembly-conformance");

test("nested Interface/Assembly verifier fails closed when producer contracts are absent", () => {
  const result = verifyNestedInterfaceAssemblyTransport(null, null, null, null);
  assert.equal(result.status, "FAIL");
  assert.equal(result.errors[0].code, "NESTED_TRANSPORT_MACHINE_CONTRACT_MISSING");
});

const interfaceRepo = process.env.INTERFACE_NESTED_MACHINE_PATH;
const interfaceCommit = process.env.INTERFACE_NESTED_COMMIT;
const assemblyRepo = process.env.ASSEMBLY_REPO_PATH;
const assemblyCommit = process.env.ASSEMBLY_COMMIT;
const corePath = process.env.MORPHTILE_CORE_PATH;
const coreCommit = process.env.MORPHTILE_COMMIT;
const integrationTest = interfaceRepo && assemblyRepo && corePath ? test : test.skip;

integrationTest("exact Interface PR7 -> Assembly PR15 nested transport preserves explicit path provenance without polluting portable identity", () => {
  const Interface = require(path.join(path.resolve(interfaceRepo), "src"));
  const Assembly = require(path.join(path.resolve(assemblyRepo), "src"));
  const { materializeKit } = require(path.join(path.resolve(assemblyRepo), "src", "kit.js"));
  const MorphTile = require(path.resolve(corePath));

  const result = verifyNestedInterfaceAssemblyTransport(
    Interface,
    Assembly,
    materializeKit,
    MorphTile,
    { interfaceCommit, assemblyCommit, morphTileCommit: coreCommit }
  );

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.unbound_status, "HOLD");
  assert.equal(result.receipt.mismatch_status, "HOLD");
  assert.equal(result.receipt.bound_a_status, "CANDIDATE");
  assert.equal(result.receipt.bound_b_status, "CANDIDATE");
  assert.deepEqual(result.receipt.bound_a_target, { id: "mt_inner", path: "mt_shell/mt_inner" });
  assert.deepEqual(result.receipt.bound_b_target, { id: "mt_inner", path: "mt_other_shell/mt_inner" });
  assert.equal(result.receipt.closure_hash_equal, true);
  assert.equal(result.receipt.fresh_import_status, "READY");
});
