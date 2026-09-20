const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  resolveInterfaceTargetProof,
  verifyInterfaceTargetProofBoundary
} = require("../src/interface-target-proof-conformance");

const interfaceRepo = process.env.INTERFACE_TARGET_PROOF_REPO_PATH;
const interfaceCommit = process.env.INTERFACE_TARGET_PROOF_COMMIT;
const corePath = process.env.INTERFACE_TARGET_PROOF_CORE_PATH;
const coreCommit = process.env.INTERFACE_TARGET_PROOF_CORE_COMMIT;
const integrationTest = interfaceRepo && interfaceCommit && corePath && coreCommit ? test : test.skip;

test("target-proof resolver fails closed when the target tile is absent", () => {
  const MorphTile = {
    resolveTile() { return null; }
  };
  const dependency = {
    id: "morphtile.interface-target-proof:missing",
    kind: "morphtile.interface-target-proof/v0.1",
    tile_path: "missing",
    requires: {
      tile_exists: true,
      form_hints_include: [],
      readout_logic_vars: [],
      control_param_ids: [],
      action_input_signal_socket_ids: []
    }
  };
  const result = resolveInterfaceTargetProof(MorphTile, { tiles: {} }, dependency);
  assert.equal(result.status, "HOLD");
  assert.deepEqual(result.errors.map((entry) => entry.code), ["INTERFACE_TARGET_TILE_MISSING"]);
});

integrationTest("Interface PR8 proof obligations resolve against canonical MorphTile target and fail closed per missing fact", () => {
  const interfaceMachine = require(path.join(path.resolve(interfaceRepo), "src"));
  const MorphTile = require(path.resolve(corePath));
  const result = verifyInterfaceTargetProofBoundary(interfaceMachine, MorphTile, {
    interfaceCommit,
    morphTileCommit: coreCommit
  });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors));
  assert.equal(result.receipt.interface_commit, interfaceCommit);
  assert.equal(result.receipt.morphtile_commit, coreCommit);
  assert.equal(result.receipt.dependency_id, "morphtile.interface-target-proof:mt_tower");
  assert.equal(result.receipt.live_resolution, "PASS");
  assert.equal(result.receipt.action_authority, "NOT_PROVEN");
  assert.equal(result.receipt.visual_quality, "NOT_TESTED");
  assert.deepEqual(result.receipt.attacks.map(({ attack, expected_code, status }) => ({ attack, expected_code, status })), [
    { attack: "remove-ui-panel", expected_code: "INTERFACE_TARGET_FORM_HINT_MISSING", status: "HOLD" },
    { attack: "remove-readout-var", expected_code: "INTERFACE_TARGET_READOUT_MISSING", status: "HOLD" },
    { attack: "remove-control-param", expected_code: "INTERFACE_TARGET_CONTROL_MISSING", status: "HOLD" },
    { attack: "flip-action-socket-direction", expected_code: "INTERFACE_TARGET_ACTION_INPUT_SIGNAL_MISSING", status: "HOLD" }
  ]);
});
