"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vectors = require("../fixtures/canonical-hash-vectors.json");
const good = require("../fixtures/good.tile-spec.json");
const { canonicalJson, digest } = require("../src");
const { verifyHashVectors } = require("../src/hash-conformance");

test("verification hash implementation conforms to fixed portable vectors", () => {
  const report = verifyHashVectors(vectors, { canonicalize: canonicalJson, digest });
  assert.deepEqual(report, {
    status: "PASS",
    profile: "canonical-json-sorted-keys/v1+sha256-utf8",
    checked: 4,
    errors: []
  });
});

test("canonical profile preserves MorphTile undefined handling", () => {
  assert.equal(canonicalJson({ keep: 1, omit: undefined }), "{\"keep\":1}");
  assert.equal(canonicalJson([1, undefined, 3]), "[1,null,3]");
});

const corePath = process.env.MORPHTILE_CORE_PATH;
test("pinned MorphTile core and Verification Machine agree on canonical hash vectors", { skip: !corePath }, () => {
  assert.equal(process.env.MORPHTILE_COMMIT, vectors.reference.commit, "CI MorphTile checkout must match the vector pin");
  const core = require(path.resolve(corePath));
  assert.equal(core.VERSION, "0.4");
  const report = verifyHashVectors(vectors, { canonicalize: core.canonical, digest: core.hashOf });
  assert.equal(report.status, "PASS", JSON.stringify(report.errors));
  assert.equal(report.checked, vectors.vectors.length);
  assert.equal(core.canonical(good), canonicalJson(good));
  assert.equal(core.hashOf(good), digest(good));
});
