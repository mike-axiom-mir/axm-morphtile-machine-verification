const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifySurfaceIntentBoundary } = require("../src/surface-intent-conformance");

const SURFACE_REPO_PATH = process.env.SURFACE_REPO_PATH;
const SURFACE_COMMIT = process.env.SURFACE_COMMIT;
const EXPECTED_SURFACE_COMMIT = "35e4c9f464f13d6778f1f82d340e5cd63c86ee7a";

function loadSurface() {
  assert.ok(SURFACE_REPO_PATH, "SURFACE_REPO_PATH is required for pinned cross-repo verification");
  assert.equal(SURFACE_COMMIT, EXPECTED_SURFACE_COMMIT, "CI Surface checkout must match the exact verified candidate head");
  return require(path.join(SURFACE_REPO_PATH, "src"));
}

test("repaired pinned Surface v0.3 candidate independently fails closed on authored numeric lookalikes", () => {
  const surface = loadSurface();
  const result = verifySurfaceIntentBoundary(surface, { expectedVersion: "0.3.0" });

  assert.equal(result.status, "PASS", JSON.stringify(result.errors, null, 2));
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checked, [
    "machine-version",
    "valid-request-and-immutability",
    "unknown-top-level-field-fail-closed",
    "paint-vars-strict-number-type",
    "base-color-strict-number-type",
    "base-color-range",
    "surface-rule-strict-number-types"
  ]);

  assert.deepEqual(result.receipt.base_color_type_cases, [
    { id: "string", input: ["0.2", 0.25, 0.3], status: "HOLD", hold_code: "HOLD_SURFACE_COLOR_INVALID", emitted_color: null, mutated: false },
    { id: "boolean", input: [false, 0.25, 0.3], status: "HOLD", hold_code: "HOLD_SURFACE_COLOR_INVALID", emitted_color: null, mutated: false },
    { id: "null", input: [null, 0.25, 0.3], status: "HOLD", hold_code: "HOLD_SURFACE_COLOR_INVALID", emitted_color: null, mutated: false }
  ]);

  assert.deepEqual(result.receipt.surface_rule_type_cases, [
    { id: "threshold-string", status: "HOLD", hold_code: "HOLD_SURFACE_RULE_THRESHOLD_INVALID", normalized_rule: null, mutated: false },
    { id: "match-color-null", status: "HOLD", hold_code: "HOLD_SURFACE_RULE_COLOR_INVALID", normalized_rule: null, mutated: false }
  ]);

  assert.equal(result.receipt.valid_status, "CANDIDATE");
  assert.equal(result.receipt.valid_surface_rule_status, "CANDIDATE");
  assert.equal(result.receipt.unknown_field_status, "HOLD");
  assert.equal(result.receipt.unknown_field_code, "HOLD_SURFACE_INTENT_FIELD_UNKNOWN");
  assert.equal(result.receipt.paint_var_string_status, "HOLD");
  assert.equal(result.receipt.paint_var_string_code, "HOLD_SURFACE_PAINT_VARS_INVALID");
  assert.equal(result.receipt.out_of_range_status, "HOLD");
  assert.equal(result.receipt.out_of_range_code, "HOLD_SURFACE_COLOR_INVALID");
});

test("exact repaired Surface head independently rejects explicitly authored falsey rules", () => {
  const { run } = loadSurface();
  for (const surface_rule of [false, null, 0, "", [], {}]) {
    const request = {
      envelope_version: "0.1",
      request_id: "verify-explicit-invalid-surface-rule",
      goal: "Verify explicit invalid surface rules remain explicit",
      intent: { surface_rule },
      provenance: { caller: "verification-machine" }
    };
    const before = JSON.stringify(request);
    const out = run(request);
    assert.equal(out.status, "HOLD", JSON.stringify(surface_rule));
    assert.equal(out.candidate, null);
    assert.match(out.holds[0].code, /^HOLD_SURFACE_RULE_/);
    assert.equal(JSON.stringify(request), before, "verifier request must remain immutable");
  }
});
