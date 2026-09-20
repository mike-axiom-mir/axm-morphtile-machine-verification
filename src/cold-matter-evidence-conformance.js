"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { failure } = require("./verdict");

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function boundary(samples, field) {
  const first = samples.find((sample) => sample.memory && sample.memory[field] >= 0);
  if (first) {
    return {
      first_non_beneficial_tested_scale_tiles: first.input.expected.tiles,
      delta_bytes: first.memory[field]
    };
  }
  return {
    not_observed_through_tested_scale_tiles: samples[samples.length - 1].input.expected.tiles
  };
}

function makeFixtureWorld(runtime) {
  const world = runtime.createWorld("Independent Cold Matter verification");
  for (let region = 0; region < 2; region++) {
    const root = runtime.createTile({ id: "region_" + region, name: "Region " + region });
    root.facets.mesh = { type: "interior", source: null, data: {} };
    root.interior = { tiles: {}, edges: {}, ports: [] };
    for (let part = 0; part < 2; part++) {
      root.interior.tiles["part_" + part] = runtime.createTile({ id: "part_" + part, name: "Part " + part });
    }
    root.provenance.sha256 = runtime.contentHash(root);
    world.tiles[root.id] = root;
  }
  world.vars["region_1/part_1"] = { charge: 7 };
  return world;
}

function withFrozen(runtime, cold, fn) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "axm-cold-verify-"));
  try {
    const world = makeFixtureWorld(runtime);
    const frozen = cold.freezeWorld(world, directory);
    return fn({ directory, world, frozen });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function verifyMeasurement(report) {
  const errors = [];
  const checked = [];

  if (!report || typeof report !== "object") {
    return { status: "FAIL", checked, errors: [failure("COLD_MEASUREMENT_MISSING", "Cold Matter measurement evidence must be an object.")], receipt: null };
  }
  if (report.format !== "morphtile-cold-memory-measurement" || report.version !== "0.2") {
    errors.push(failure("COLD_MEASUREMENT_SCHEMA", "Expected the pinned morphtile-cold-memory-measurement v0.2 evidence format.", { observed_format: report.format || null, observed_version: report.version || null }));
  }
  if (!report.runtime || report.runtime.isolated_process_per_scale !== true || report.runtime.gc_exposed_in_samples !== true) {
    errors.push(failure("COLD_MEASUREMENT_RUNTIME_DISCLOSURE", "Evidence must explicitly disclose isolated sample processes and exposed GC for this measurement contract.", { runtime: clone(report.runtime || null) }));
  }
  if (typeof report.truth_boundary !== "string" || !/synthetic/i.test(report.truth_boundary) || !/not universal hardware/i.test(report.truth_boundary)) {
    errors.push(failure("COLD_MEASUREMENT_TRUTH_BOUNDARY", "The committed performance evidence must retain its bounded synthetic / non-universal truth boundary.", { truth_boundary: report.truth_boundary || null }));
  }
  checked.push("measurement-envelope-and-truth-boundary");

  const samples = Array.isArray(report.samples) ? report.samples : [];
  if (!samples.length) {
    errors.push(failure("COLD_MEASUREMENT_SAMPLES_MISSING", "Measurement evidence must carry at least one raw sample."));
    return { status: "FAIL", checked, errors, receipt: null };
  }

  const observedScales = [];
  const sampleReceipts = [];
  for (let index = 0; index < samples.length; index++) {
    const sample = samples[index];
    const tiles = sample && sample.input && sample.input.expected ? sample.input.expected.tiles : null;
    observedScales.push(tiles);
    const memory = sample && sample.memory || {};
    const full = memory.fully_realized || {};
    const warm = memory.warm_canonical || {};
    const cold = memory.cold_index_only || {};
    const expectedDeltas = {
      heap_delta_full_to_warm_bytes: warm.heap_used_bytes - full.heap_used_bytes,
      heap_delta_full_to_cold_bytes: cold.heap_used_bytes - full.heap_used_bytes,
      rss_delta_full_to_warm_bytes: warm.rss_bytes - full.rss_bytes,
      rss_delta_full_to_cold_bytes: cold.rss_bytes - full.rss_bytes
    };
    for (const [field, expected] of Object.entries(expectedDeltas)) {
      if (!Number.isFinite(expected) || memory[field] !== expected) {
        errors.push(failure("COLD_MEASUREMENT_DELTA_MISMATCH", "A committed memory delta must equal the raw endpoint subtraction exactly.", { sample_index: index, tiles, field, advertised: memory[field], recomputed: expected }));
      }
    }

    const verification = sample && sample.verification || {};
    const restored = verification.restored || {};
    const expected = sample && sample.input && sample.input.expected || {};
    const exactFromRaw = {
      live: restored.live_hash === expected.live_hash,
      struct: restored.struct_hash === expected.struct_hash,
      tiles: restored.tiles === expected.tiles
    };
    if (verification.exact_live_hash !== exactFromRaw.live || verification.exact_struct_hash !== exactFromRaw.struct || verification.exact_tile_count !== exactFromRaw.tiles) {
      errors.push(failure("COLD_MEASUREMENT_EXACT_FLAGS_MISMATCH", "Exact reconstruction flags must be derivable from the raw expected/restored values.", { sample_index: index, tiles, advertised: { live: verification.exact_live_hash, struct: verification.exact_struct_hash, tiles: verification.exact_tile_count }, recomputed: exactFromRaw }));
    }
    if (!exactFromRaw.live || !exactFromRaw.struct || !exactFromRaw.tiles || verification.mutation_preserved !== true || verification.unrelated_regions_resident_after_one_wake && verification.unrelated_regions_resident_after_one_wake.length) {
      errors.push(failure("COLD_MEASUREMENT_RECONSTRUCTION_NOT_EXACT", "A PASS requires exact reconstruction, preserved meaningful state, and no unrelated resident region after selective wake.", { sample_index: index, tiles, verification: clone(verification) }));
    }
    sampleReceipts.push({ tiles, heap_full_to_cold: memory.heap_delta_full_to_cold_bytes, rss_full_to_cold: memory.rss_delta_full_to_cold_bytes, exact: exactFromRaw.live && exactFromRaw.struct && exactFromRaw.tiles });
  }
  checked.push("measurement-delta-and-reconstruction-recomputation");

  const heapBoundary = boundary(samples, "heap_delta_full_to_cold_bytes");
  const rssBoundary = boundary(samples, "rss_delta_full_to_cold_bytes");
  const advertised = report.observed_boundaries || {};
  if (!same(heapBoundary, advertised.heap_full_to_cold)) {
    errors.push(failure("COLD_HEAP_BOUNDARY_MISMATCH", "Advertised heap boundary must be mechanically derivable from raw samples.", { advertised: clone(advertised.heap_full_to_cold || null), recomputed: heapBoundary }));
  }
  if (!same(rssBoundary, advertised.rss_full_to_cold)) {
    errors.push(failure("COLD_RSS_BOUNDARY_MISMATCH", "Advertised RSS boundary must be mechanically derivable from raw samples.", { advertised: clone(advertised.rss_full_to_cold || null), recomputed: rssBoundary }));
  }
  checked.push("measurement-boundary-recomputation");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.cold-matter-measurement-conformance-receipt/v0.1",
      measured_at: report.measured_at || null,
      scales_tiles: observedScales,
      samples: sampleReceipts,
      heap_boundary: heapBoundary,
      rss_boundary: rssBoundary
    }
  };
}

function verifyCorruptionAndConflict(runtime, cold) {
  const errors = [];
  const checked = [];
  const cases = [];

  if (!runtime || typeof runtime.hashOf !== "function" || typeof runtime.createWorld !== "function" || typeof runtime.createTile !== "function" || typeof runtime.contentHash !== "function" || typeof runtime.applyStructOp !== "function") {
    return { status: "FAIL", checked, errors: [failure("COLD_RUNTIME_CONTRACT_MISSING", "Cold Matter corruption verification requires the public MorphTile runtime contract.")], receipt: null };
  }
  for (const name of ["freezeWorld", "openColdWorld", "wakeRegion"]) {
    if (!cold || typeof cold[name] !== "function") {
      return { status: "FAIL", checked, errors: [failure("COLD_ADAPTER_CONTRACT_MISSING", "Cold Matter adapter entry point is missing.", { missing: name })], receipt: null };
    }
  }

  withFrozen(runtime, cold, ({ directory, frozen }) => {
    const manifestPath = path.join(directory, "cold-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.world.name = "tampered manifest";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    const opened = cold.openColdWorld(directory);
    cases.push({ id: "manifest-hash", status: opened && opened.status || null });
    if (!opened || opened.status !== "HOLD_MANIFEST_HASH_MISMATCH") {
      errors.push(failure("COLD_MANIFEST_TAMPER_NOT_HELD", "Manifest semantic tampering must fail closed before a cold handle is accepted.", { observed_status: opened && opened.status || null }));
    }
    if (!frozen || frozen.status !== "COLD_STORED") errors.push(failure("COLD_FIXTURE_FREEZE_FAILED", "Verification fixture did not freeze cleanly before manifest attack."));
  });
  checked.push("manifest-hash-tamper-rejection");

  withFrozen(runtime, cold, ({ directory, frozen }) => {
    const entry = frozen.manifest.entries.find((item) => item.root === "region_1");
    const regionPath = path.join(directory, entry.file);
    const payload = JSON.parse(fs.readFileSync(regionPath, "utf8"));
    payload.tiles.region_1.name = "tampered region";
    fs.writeFileSync(regionPath, JSON.stringify(payload));
    const handle = cold.openColdWorld(directory);
    const before = runtime.hashOf(handle.world);
    const result = cold.wakeRegion(handle, "region_1");
    const after = runtime.hashOf(handle.world);
    cases.push({ id: "region-hash", status: result && result.status || null, mutated: before !== after });
    if (!result || result.status !== "HOLD_REGION_HASH_MISMATCH") errors.push(failure("COLD_REGION_TAMPER_NOT_HELD", "Region semantic tampering must fail closed on the region hash.", { observed_status: result && result.status || null }));
    if (before !== after) errors.push(failure("COLD_REGION_TAMPER_MUTATED_RECEIVER", "Rejected region tampering must not mutate the resident cold world.", { before, after }));
  });
  checked.push("region-hash-tamper-no-mutation");

  withFrozen(runtime, cold, ({ directory, frozen }) => {
    const entry = frozen.manifest.entries.find((item) => item.root === "region_0");
    fs.unlinkSync(path.join(directory, entry.file));
    const handle = cold.openColdWorld(directory);
    const before = runtime.hashOf(handle.world);
    const result = cold.wakeRegion(handle, "region_0");
    const after = runtime.hashOf(handle.world);
    cases.push({ id: "missing-region", status: result && result.status || null, mutated: before !== after });
    if (!result || result.status !== "HOLD_MISSING_REGION") errors.push(failure("COLD_MISSING_REGION_NOT_HELD", "A manifest entry with missing payload bytes must fail closed.", { observed_status: result && result.status || null }));
    if (before !== after) errors.push(failure("COLD_MISSING_REGION_MUTATED_RECEIVER", "Missing-region rejection must not mutate the resident world.", { before, after }));
  });
  checked.push("missing-region-no-mutation");

  withFrozen(runtime, cold, ({ directory }) => {
    const handle = cold.openColdWorld(directory);
    const conflicting = runtime.createTile({ id: "region_0", name: "Pre-existing conflicting region" });
    runtime.applyStructOp(handle.world, { op: "tile.add", tile: conflicting });
    const before = runtime.hashOf(handle.world);
    const result = cold.wakeRegion(handle, "region_0");
    const after = runtime.hashOf(handle.world);
    cases.push({ id: "tile-conflict", status: result && result.status || null, mutated: before !== after });
    if (!result || result.status !== "HOLD_WAKE_FAILED") errors.push(failure("COLD_TILE_CONFLICT_NOT_HELD", "Resident tile identity conflict must fail closed during wake.", { observed_status: result && result.status || null, detail: result && result.detail || null }));
    if (before !== after) errors.push(failure("COLD_TILE_CONFLICT_NOT_ROLLED_BACK", "A failed conflicting wake must restore the exact pre-wake resident world.", { before, after }));
  });
  checked.push("tile-conflict-rollback");

  return {
    status: errors.length ? "FAIL" : "PASS",
    checked,
    errors,
    receipt: {
      schema: "axm.morphtile.cold-matter-corruption-conformance-receipt/v0.1",
      cases
    }
  };
}

function verifyColdMatterEvidence(options = {}) {
  const measurement = verifyMeasurement(options.measurement);
  const corruption = verifyCorruptionAndConflict(options.runtime, options.cold);
  const errors = [...(measurement.errors || []), ...(corruption.errors || [])];
  return {
    status: errors.length ? "FAIL" : "PASS",
    checked: [...(measurement.checked || []), ...(corruption.checked || [])],
    errors,
    receipt: {
      schema: "axm.morphtile.cold-matter-evidence-conformance-receipt/v0.1",
      revision: options.revision || null,
      measurement: measurement.receipt,
      corruption: corruption.receipt
    }
  };
}

module.exports = { boundary, verifyMeasurement, verifyCorruptionAndConflict, verifyColdMatterEvidence };
