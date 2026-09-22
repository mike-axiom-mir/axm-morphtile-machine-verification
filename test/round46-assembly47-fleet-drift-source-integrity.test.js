"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "3d0ee8511e1440d09511f0c777f67c2b63f02d7b";
const ASSEMBLY47 = "355a015bb24b96c2a3032e5a2930e80c63f213da";
const EXPECTED = Object.freeze({
  form: "8b4a18d9d35aad91575b02831a8448104993f4f9",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "9ea9dd6ca09813885aaaa7fc12c4e06f08fe42e9",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R46_ASSEMBLY47_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

test("Assembly 47 exact head has bounded Assembly-owned evidence scope and exact integrated pins", { skip: !enabled }, () => {
  assert.equal(process.env.R46_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R46_ASSEMBLY47_COMMIT, ASSEMBLY47);

  const changed = git(process.env.R46_ASSEMBLY47_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY47])
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(changed, [
    "STATUS.md",
    "fixtures/current-fleet.json",
    "scripts/current-fleet-pins.js",
    "test/current-fleet-drift-integrity.test.js"
  ]);

  const fleet = require(path.join(process.env.R46_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane} pin is not the inspected integrated identity`);
});

test("Assembly 47 plain authored observations replay deterministically without advancing pinned authority", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R46_ASSEMBLY47_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R46_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));
  const observed = {
    schema: Pins.OBSERVATION_SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  };
  const beforeFleet = copy(fleet);
  const beforeObserved = copy(observed);

  assert.deepEqual(Pins.validateFleet(fleet), []);
  assert.deepEqual(Pins.validateObservedFleet(observed), []);
  const first = Pins.assessFleetDrift(fleet, observed);
  const replay = Pins.assessFleetDrift(fleet, observed);
  assert.deepEqual(first, { status: "PASS", drift: [], holds: [] });
  assert.deepEqual(replay, first, "fleet assessment replay drifted");
  assert.deepEqual(fleet, beforeFleet, "fleet assessment advanced or mutated pinned authority");
  assert.deepEqual(observed, beforeObserved, "fleet assessment mutated observation evidence");

  const moved = { ...observed, form: "1".repeat(40) };
  const drift = Pins.assessFleetDrift(fleet, moved);
  assert.equal(drift.status, "HOLD");
  assert.deepEqual(drift.drift, ["form"]);
  assert.equal(drift.holds[0].code, "HOLD_CURRENT_FLEET_DRIFT");
  assert.equal(drift.holds[0].pinned_commit, EXPECTED.form);
  assert.equal(drift.holds[0].observed_commit, "1".repeat(40));
  assert.deepEqual(fleet, beforeFleet, "drift evidence silently advanced the pinned receipt");
});

test("Assembly 47 exact fleet grammar must reject inherited-only identity evidence", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R46_ASSEMBLY47_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R46_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));

  const inheritedObservation = Object.create({
    schema: Pins.OBSERVATION_SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  });
  assert.deepEqual(Object.keys(inheritedObservation), [], "attack fixture unexpectedly owns identity fields");
  const observationErrors = Pins.validateObservedFleet(inheritedObservation);
  assert.notDeepEqual(
    observationErrors,
    [],
    "prototype-inherited schema and lane identities were accepted as an explicitly authored observed-fleet snapshot"
  );
  const held = Pins.assessFleetDrift(fleet, inheritedObservation);
  assert.equal(held.status, "HOLD", "inherited-only observation bypassed fail-closed source integrity and produced PASS");
  assert.equal(held.holds[0].code, "HOLD_CURRENT_FLEET_OBSERVATION_INVALID");

  const inheritedManifest = Object.create({
    schema: Pins.SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  });
  assert.deepEqual(Object.keys(inheritedManifest), [], "attack manifest unexpectedly owns identity fields");
  assert.notDeepEqual(
    Pins.validateFleet(inheritedManifest),
    [],
    "prototype-inherited identities were accepted by the exact pinned-fleet grammar"
  );
});
