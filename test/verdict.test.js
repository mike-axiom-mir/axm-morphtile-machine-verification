const test = require("node:test");
const assert = require("node:assert/strict");
const { failure } = require("../src/verdict");

test("observed metadata cannot overwrite verifier primary failure identity", () => {
  const result = failure("PRIMARY_FAILURE", "Verifier-owned meaning", {
    code: "PRODUCER_HOLD_CODE",
    detail: "Producer detail must not replace verifier detail",
    status: "HOLD",
    observed_code: "PRODUCER_HOLD_CODE"
  });

  assert.equal(result.code, "PRIMARY_FAILURE");
  assert.equal(result.detail, "Verifier-owned meaning");
  assert.equal(result.status, "HOLD");
  assert.equal(result.observed_code, "PRODUCER_HOLD_CODE");
});

test("verification failure identity itself must be explicit and non-empty", () => {
  assert.throws(() => failure("", "detail"), /failure code must be a non-empty string/);
  assert.throws(() => failure("CODE", ""), /failure detail must be a non-empty string/);
});
