const test = require("node:test");
const assert = require("node:assert/strict");
const good = require("../fixtures/good.tile-spec.json");
const broken = require("../fixtures/broken.tile-spec.json");
const { run } = require("../src");
const request = candidate => ({ envelope_version: "0.1", request_id: "verify-1", goal: "Verify candidate", candidate, provenance: { caller: "fixture" } });

function reverseObjectKeys(value) {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).reverse().map(key => [key, reverseObjectKeys(value[key])]));
}

test("passes the known-good structure with an evidence receipt and explicit non-claims", () => {
  const out = run(request(good));
  assert.equal(out.status, "PASS");
  assert.equal(out.evidence[1].candidate_sha256.length, 64);
  assert.equal(out.evidence[1].candidate_digest_encoding, "canonical-json-sorted-keys/v1");
  assert.equal(out.evidence[1].morph_tile_runtime_executed, false);
});

test("candidate hash is invariant to object key insertion order", () => {
  const a = run(request(good));
  const b = run(request(reverseObjectKeys(good)));
  assert.equal(a.status, "PASS");
  assert.equal(b.status, "PASS");
  assert.equal(a.evidence[1].candidate_sha256, b.evidence[1].candidate_sha256);
});

test("candidate hash changes when candidate content changes", () => {
  const changed = JSON.parse(JSON.stringify(good));
  changed.facets.mesh.type = "generated";
  const a = run(request(good));
  const b = run(request(changed));
  assert.notEqual(a.evidence[1].candidate_sha256, b.evidence[1].candidate_sha256);
});

test("fails the broken fixture for the exact structural fields", () => {
  const out = run(request(broken));
  assert.equal(out.status, "FAIL");
  assert.deepEqual(out.evidence[0].errors, ["schema", "name", "facets"]);
});

test("holds when there is no candidate to inspect", () => assert.equal(run(request(null)).status, "HOLD"));
