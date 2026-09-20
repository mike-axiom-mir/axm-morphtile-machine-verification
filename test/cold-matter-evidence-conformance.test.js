"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { verifyColdMatterEvidence } = require("../src/cold-matter-evidence-conformance");

const root = process.env.COLD_MATTER_REPO_PATH;
const revision = process.env.COLD_MATTER_COMMIT;
const ready = !!root && !!revision;

test("independently verifies committed Cold Matter measurement arithmetic, bounded claims and fail-closed corruption handling", { skip: !ready }, () => {
  const repo = path.resolve(root);
  const runtime = require(path.join(repo, "core", "morphtile.js"));
  const cold = require(path.join(repo, "experimental", "cold-matter.js"));
  const measurement = JSON.parse(fs.readFileSync(path.join(repo, "evidence", "cold-matter-measurement.json"), "utf8"));

  const result = verifyColdMatterEvidence({ runtime, cold, measurement, revision });
  assert.equal(result.status, "PASS", JSON.stringify(result, null, 2));
  assert.deepEqual(result.errors, []);
  assert.equal(result.receipt.revision, revision);
  assert.deepEqual(result.receipt.measurement.scales_tiles, [600, 1500, 3000]);
  assert.deepEqual(result.receipt.measurement.heap_boundary, { not_observed_through_tested_scale_tiles: 3000 });
  assert.deepEqual(result.receipt.measurement.rss_boundary, { first_non_beneficial_tested_scale_tiles: 600, delta_bytes: 8224768 });
  assert.deepEqual(result.receipt.measurement.samples.map((sample) => sample.exact), [true, true, true]);
  assert.deepEqual(result.receipt.corruption.cases, [
    { id: "manifest-hash", status: "HOLD_MANIFEST_HASH_MISMATCH" },
    { id: "region-hash", status: "HOLD_REGION_HASH_MISMATCH", mutated: false },
    { id: "missing-region", status: "HOLD_MISSING_REGION", mutated: false },
    { id: "tile-conflict", status: "HOLD_WAKE_FAILED", mutated: false }
  ]);
});
