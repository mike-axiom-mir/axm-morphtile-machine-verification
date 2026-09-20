const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { verifySurfaceIntentBoundary } = require("../src/surface-intent-conformance");

const SURFACE_REPO_PATH = process.env.SURFACE_REPO_PATH;
const SURFACE_COMMIT = process.env.SURFACE_COMMIT;
const EXPECTED_SURFACE_COMMIT = "8d6a561a214ae39c77d5552bd29822a58829b9c8";

function loadSurface() {
  assert.ok(SURFACE_REPO_PATH, "SURFACE_REPO_PATH is required for pinned cross-repo verification");
  assert.equal(SURFACE_COMMIT, EXPECTED_SURFACE_COMMIT, "CI Surface checkout must match the exact verified candidate head");
  return require(path.join(SURFACE_REPO_PATH, "src"));
}

test("pinned Surface v0.3 candidate exposes numeric type coercion as independent FAIL/HOLD evidence", () => {
  const surface = loadSurface();
  const result = verifySurfaceIntentBoundary(surface, { expectedVersion: "0.3.0" });

  assert.equal(result.status, "FAIL");
  assert.deepEqual(result.checked, [
    "machine-version",
    "valid-request-and-immutability",
    "unknown-top-level-field-fail-closed",
    "paint-vars-strict-number-type",
    "base-color-strict-number-type",
    "base-color-range",
    "surface-rule-strict-number-types"
  ]);

  const colorErrors = result.errors.filter((error) => error.code === "BASE_COLOR_TYPE_COERCION");
  assert.equal(colorErrors.length, 3);
  assert.deepEqual(colorErrors.map((error) => error.case), ["string", "boolean", "null"]);

  const ruleErrors = result.errors.filter((error) => error.code === "SURFACE_RULE_TYPE_COERCION");
  assert.equal(ruleErrors.length, 2);
  assert.deepEqual(ruleErrors.map((error) => error.case), ["threshold-string", "match-color-null"]);

  assert.deepEqual(result.receipt.base_color_type_cases, [
    {
      id: "string",
      input: ["0.2", 0.25, 0.3],
      status: "CANDIDATE",
      hold_code: null,
      emitted_color: [0.2, 0.25, 0.3],
      mutated: false
    },
    {
      id: "boolean",
      input: [false, 0.25, 0.3],
      status: "CANDIDATE",
      hold_code: null,
      emitted_color: [0, 0.25, 0.3],
      mutated: false
    },
    {
      id: "null",
      input: [null, 0.25, 0.3],
      status: "CANDIDATE",
      hold_code: null,
      emitted_color: [0, 0.25, 0.3],
      mutated: false
    }
  ]);

  assert.deepEqual(result.receipt.surface_rule_type_cases, [
    {
      id: "threshold-string",
      status: "CANDIDATE",
      hold_code: null,
      normalized_rule: {
        kind: "facing",
        direction: "up",
        threshold: 0.6,
        match_color: [0.9, 0.8, 0.7],
        else_color: [0.1, 0.2, 0.3]
      },
      mutated: false
    },
    {
      id: "match-color-null",
      status: "CANDIDATE",
      hold_code: null,
      normalized_rule: {
        kind: "facing",
        direction: "up",
        threshold: 0.6,
        match_color: [0, 0.8, 0.7],
        else_color: [0.1, 0.2, 0.3]
      },
      mutated: false
    }
  ]);

  assert.equal(result.receipt.unknown_field_status, "HOLD");
  assert.equal(result.receipt.unknown_field_code, "HOLD_SURFACE_INTENT_FIELD_UNKNOWN");
  assert.equal(result.receipt.paint_var_string_status, "HOLD");
  assert.equal(result.receipt.paint_var_string_code, "HOLD_SURFACE_PAINT_VARS_INVALID");
  assert.equal(result.receipt.out_of_range_status, "HOLD");
  assert.equal(result.receipt.out_of_range_code, "HOLD_SURFACE_COLOR_INVALID");
});
