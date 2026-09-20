const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyCapabilityKindAndSignal } = require("../src/capability-kind-signal-conformance");

const CAPABILITY_CURRENT_REPO_PATH = process.env.CAPABILITY_CURRENT_REPO_PATH;
const CAPABILITY_CURRENT_COMMIT = process.env.CAPABILITY_CURRENT_COMMIT;
const MORPHTILE_CURRENT_CORE_PATH = process.env.MORPHTILE_CURRENT_CORE_PATH;
const MORPHTILE_CURRENT_COMMIT = process.env.MORPHTILE_CURRENT_COMMIT;

const EXPECTED_CAPABILITY_COMMIT = "31e9155edd165513a05a8252d1fd37b5cae8eb0f";
const EXPECTED_MORPHTILE_COMMIT = "a579182ae585e5722ac87dd0cc8209963b18d000";

function loadTargets() {
  assert.ok(CAPABILITY_CURRENT_REPO_PATH, "CAPABILITY_CURRENT_REPO_PATH is required");
  assert.ok(MORPHTILE_CURRENT_CORE_PATH, "MORPHTILE_CURRENT_CORE_PATH is required");
  assert.equal(CAPABILITY_CURRENT_COMMIT, EXPECTED_CAPABILITY_COMMIT, "Capability checkout must match exact verified candidate head");
  assert.equal(MORPHTILE_CURRENT_COMMIT, EXPECTED_MORPHTILE_COMMIT, "MorphTile checkout must match exact current substrate pin");
  return {
    machine: require(path.join(CAPABILITY_CURRENT_REPO_PATH, "src")),
    runtime: require(path.resolve(MORPHTILE_CURRENT_CORE_PATH))
  };
}

test("current Capability strict kind and named signal wake semantics pass independent conformance", () => {
  const { machine, runtime } = loadTargets();
  const result = verifyCapabilityKindAndSignal(machine, runtime, { expectedMachineVersion: "0.1.0" });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checked, [
    "machine-version",
    "omitted-kind-default",
    "malformed-kind-fail-closed",
    "unsupported-kind-distinction",
    "custom-signal-candidate-determinism",
    "custom-signal-world-validation",
    "wrong-signal-remains-dormant",
    "custom-wake-separate-from-action",
    "post-wake-sparse-increment",
    "custom-signal-replay"
  ]);

  assert.deepEqual(result.receipt.malformed_kind_cases.map(({ status, code }) => ({ status, code })), [
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" },
    { status: "HOLD", code: "HOLD_CAPABILITY_KIND_INVALID" }
  ]);
  assert.equal(result.receipt.unsupported_kind_status, "HOLD");
  assert.equal(result.receipt.unsupported_kind_code, "HOLD_CAPABILITY_NOT_EXPRESSIBLE");
  assert.equal(result.receipt.wake_count, 2);
  assert.equal(result.receipt.incremented_count, 3);
  assert.equal(result.receipt.canonical_matter_sha256_before, result.receipt.canonical_matter_sha256_after);
  assert.equal(result.receipt.live_sha256, result.receipt.replay_sha256);
});
