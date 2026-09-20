"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { digest } = require("../src");
const { verifyKitCandidate } = require("../src/kit-conformance");

function fakeRuntime() {
  return {
    VERSION: "fake-0.1",
    hashOf: digest,
    createWorld(name) { return { kind: "morphtile-world", name, tiles: {}, defs: {}, words: {} }; },
    validateTile(tile) { return { ok: !!tile && tile.kind === "morphtile", errors: tile && tile.kind === "morphtile" ? [] : ["kind"] }; },
    importKit(_world, kit) {
      const observed = digest({ tile: kit.tile, defs: kit.defs || {}, words: kit.words || {} });
      return observed === kit.expect.sha256
        ? { status: "READY", evidence: "verified_payload_sha256", ops: [] }
        : { status: "HOLD_HASH_MISMATCH", evidence: "claimed_hash_not_verified", ops: [] };
    }
  };
}

function fakeKit() {
  const runtime = fakeRuntime();
  const kit = {
    format: "morphtile-kit",
    version: "0.1",
    name: "Proof kit",
    tile: { id: "proof", kind: "morphtile", name: "Proof", facets: {} },
    defs: {},
    words: {}
  };
  kit.expect = {
    sha256: runtime.hashOf({ tile: kit.tile, defs: kit.defs, words: kit.words }),
    defs: 0,
    words: 0,
    missing: []
  };
  return kit;
}

test("kit checker independently recomputes the payload and attacks semantic tampering", () => {
  const runtime = fakeRuntime();
  const kit = fakeKit();
  const before = JSON.parse(JSON.stringify(kit));
  const report = verifyKitCandidate(kit, runtime);
  assert.equal(report.status, "PASS", JSON.stringify(report.errors));
  assert.equal(report.receipt.expected_payload_sha256, report.receipt.observed_payload_sha256);
  assert.equal(report.receipt.fresh_import_status, "READY");
  assert.equal(report.receipt.tamper_status, "HOLD_HASH_MISMATCH");
  assert.equal(report.receipt.import_analysis_mutated_receiver, false);
  assert.equal(report.receipt.tamper_analysis_mutated_receiver, false);
  assert.deepEqual(kit, before, "verification must not mutate the supplied candidate");
});

test("kit checker fails a false advertised hash before trusting producer evidence", () => {
  const kit = fakeKit();
  kit.expect.sha256 = "0".repeat(64);
  const report = verifyKitCandidate(kit, fakeRuntime());
  assert.equal(report.status, "FAIL");
  assert.ok(report.errors.some(error => error.code === "KIT_HASH_MISMATCH"));
});

const kitCorePath = process.env.KIT_MORPHTILE_CORE_PATH;
const assemblyPath = process.env.ASSEMBLY_REPO_PATH;

test("Assembly Machine kit output passes independent pinned-runtime verification", { skip: !(kitCorePath && assemblyPath) }, () => {
  assert.equal(process.env.KIT_MORPHTILE_COMMIT, "13d83a2b2c0d12644442d3d9e45bcbe0af19876a");
  assert.equal(process.env.ASSEMBLY_COMMIT, "0ae941c3ebc2293bbe974a309bdd27a97b4f3fd0");

  const MT = require(path.resolve(kitCorePath));
  const assembly = require(path.join(path.resolve(assemblyPath), "src"));
  const { materializeKit } = require(path.join(path.resolve(assemblyPath), "src/kit"));
  const baseRequest = require(path.join(path.resolve(assemblyPath), "fixtures/request.assembly.json"));

  const request = JSON.parse(JSON.stringify(baseRequest));
  request.request_id = "verification-external-kit-conformance";
  request.inputs[0].world_requirements = {
    words: {
      ease: {
        name: "ease",
        args: ["x"],
        body: ["*", ["var", "x"], ["var", "x"]]
      }
    }
  };

  const assembled = assembly.run(request);
  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds || []));
  const materialized = materializeKit(assembled, MT);
  assert.equal(materialized.status, "CANDIDATE", JSON.stringify(materialized.holds || []));
  assert.ok(materialized.source_closure_hash, "Assembly closure identity must remain linked to the portable kit");
  assert.equal(Object.keys(materialized.kit.words).length, 1, "declared word closure must survive materialization");

  const report = verifyKitCandidate(materialized, MT);
  assert.equal(report.status, "PASS", JSON.stringify(report.errors));
  assert.equal(report.receipt.runtime_version, MT.VERSION);
  assert.equal(report.receipt.source_closure_hash, materialized.source_closure_hash);
  assert.equal(report.receipt.expected_payload_sha256, report.receipt.observed_payload_sha256);
  assert.equal(report.receipt.words, 1);
  assert.equal(report.receipt.fresh_import_evidence, "verified_payload_sha256");
  assert.equal(report.receipt.tamper_status, "HOLD_HASH_MISMATCH");
});

test("Assembly Machine refuses kit materialization when arbitrary dependency closure would be dropped", { skip: !(kitCorePath && assemblyPath) }, () => {
  const MT = require(path.resolve(kitCorePath));
  const assembly = require(path.join(path.resolve(assemblyPath), "src"));
  const { materializeKit } = require(path.join(path.resolve(assemblyPath), "src/kit"));
  const baseRequest = require(path.join(path.resolve(assemblyPath), "fixtures/request.assembly.json"));

  const request = JSON.parse(JSON.stringify(baseRequest));
  request.request_id = "verification-external-dependency-hold";
  request.dependencies = [{ id: "external-pack", ref: "sha256:abc" }];
  const assembled = assembly.run(request);
  assert.equal(assembled.status, "CANDIDATE");
  const materialized = materializeKit(assembled, MT);
  assert.equal(materialized.status, "HOLD");
  assert.equal(materialized.holds[0].code, "HOLD_KIT_DEPENDENCY_UNREPRESENTABLE");
  assert.equal(materialized.kit, null);
});
