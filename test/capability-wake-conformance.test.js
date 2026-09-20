const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifyCapabilityWakeModes } = require("../src/capability-wake-conformance");

const CAPABILITY_WAKE_REPO_PATH = process.env.CAPABILITY_WAKE_REPO_PATH;
const CAPABILITY_WAKE_COMMIT = process.env.CAPABILITY_WAKE_COMMIT;
const MORPHTILE_CURRENT_CORE_PATH = process.env.MORPHTILE_CURRENT_CORE_PATH;
const MORPHTILE_CURRENT_COMMIT = process.env.MORPHTILE_CURRENT_COMMIT;

const EXPECTED_CAPABILITY_COMMIT = "8fbb0b2ce090e39dd2b4b95dfc4ea7a487b2008a";
const EXPECTED_MORPHTILE_COMMIT = "a579182ae585e5722ac87dd0cc8209963b18d000";

function loadCapability() {
  assert.ok(CAPABILITY_WAKE_REPO_PATH, "CAPABILITY_WAKE_REPO_PATH is required for pinned cross-repo verification");
  assert.equal(CAPABILITY_WAKE_COMMIT, EXPECTED_CAPABILITY_COMMIT, "CI Capability checkout must match the exact verified candidate head");
  return require(path.join(CAPABILITY_WAKE_REPO_PATH, "src"));
}

function loadMorphTile() {
  assert.ok(MORPHTILE_CURRENT_CORE_PATH, "MORPHTILE_CURRENT_CORE_PATH is required for pinned runtime verification");
  assert.equal(MORPHTILE_CURRENT_COMMIT, EXPECTED_MORPHTILE_COMMIT, "CI MorphTile checkout must match the exact runtime pin");
  return require(path.resolve(MORPHTILE_CURRENT_CORE_PATH));
}

test("pinned Capability candidate independently proves near/value/time wake boundaries and replay", () => {
  const capability = loadCapability();
  const MorphTile = loadMorphTile();
  const result = verifyCapabilityWakeModes(capability, MorphTile, { expectedMachineVersion: "0.1.0" });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checked, [
    "machine-version",
    "near-defaults-explicit",
    "near-runtime-boundaries-replay",
    "value-under-explicit-settle-replay",
    "time-zero-explicit-settle-replay",
    "wake-intent-fail-closed"
  ]);

  assert.deepEqual(result.receipt.default_near_wake, { on: "near", within: 8, hysteresis: 1.25 });
  assert.equal(result.receipt.near.awake_at_radius, true);
  assert.equal(result.receipt.near.awake_at_exact_hysteresis_boundary, true);
  assert.equal(result.receipt.near.asleep_outside_hysteresis_boundary, true);
  assert.equal(result.receipt.near.preserved_count_after_sleep, 3);
  assert.equal(result.receipt.near.matter_sha256_before, result.receipt.near.matter_sha256_after);
  assert.equal(result.receipt.near.live_sha256, result.receipt.near.replay_sha256);

  assert.equal(result.receipt.value_under.trigger_after_cool, 2);
  assert.equal(result.receipt.value_under.awake_after_settle, true);
  assert.equal(result.receipt.value_under.matter_sha256_before, result.receipt.value_under.matter_sha256_after);
  assert.equal(result.receipt.value_under.live_sha256, result.receipt.value_under.replay_sha256);

  assert.equal(result.receipt.time_zero.awake_at_zero, true);
  assert.equal(result.receipt.time_zero.matter_sha256_before, result.receipt.time_zero.matter_sha256_after);
  assert.equal(result.receipt.time_zero.live_sha256, result.receipt.time_zero.replay_sha256);

  assert.deepEqual(result.receipt.malformed.map((item) => [item.id, item.status, item.hold_code, item.mutated, item.threw]), [
    ["near-string-radius", "HOLD", "HOLD_WAKE_RULE_INVALID", false, null],
    ["near-inverted-band", "HOLD", "HOLD_WAKE_RULE_INVALID", false, null],
    ["value-two-thresholds", "HOLD", "HOLD_WAKE_RULE_INVALID", false, null],
    ["time-negative", "HOLD", "HOLD_WAKE_RULE_INVALID", false, null],
    ["unproven-near-field", "HOLD", "HOLD_WAKE_RULE_FIELD_UNKNOWN", false, null]
  ]);
});
