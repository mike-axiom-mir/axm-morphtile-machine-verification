"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "3d0ee8511e1440d09511f0c777f67c2b63f02d7b";
const ASSEMBLY47 = "fd17b1115e24028c3014f7dc6633b493abedbb5d";
const EXPECTED = Object.freeze({
  form: "f2f549266e3a5c15eb87fd967261eb874a990d27",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "67894cab657168bd316af1f0c6b6463c7cc7bb3a",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R47_ASSEMBLY47_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

test("repaired Assembly 47 exact head remains bounded and pins the integrated fleet", { skip: !enabled }, () => {
  assert.equal(process.env.R47_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R47_ASSEMBLY47_COMMIT, ASSEMBLY47);

  const changed = git(process.env.R47_ASSEMBLY47_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY47])
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(changed, [
    "STATUS.md",
    "fixtures/current-fleet.json",
    "scripts/current-fleet-pins.js",
    "test/current-fleet-drift-integrity.test.js"
  ]);

  const fleet = require(path.join(process.env.R47_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  for (const [lane, sha] of Object.entries(EXPECTED)) {
    assert.equal(fleet[lane], sha, `${lane} pin is not the inspected integrated identity`);
    assert.equal(Object.prototype.hasOwnProperty.call(fleet, lane), true, `${lane} pin is not own evidence`);
  }
});

test("repaired Assembly 47 rejects inherited-only manifest and observation identity", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R47_ASSEMBLY47_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R47_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));

  const inheritedObservation = Object.create({
    schema: Pins.OBSERVATION_SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  });
  assert.deepEqual(Object.keys(inheritedObservation), []);
  assert.notDeepEqual(Pins.validateObservedFleet(inheritedObservation), []);
  const held = Pins.assessFleetDrift(fleet, inheritedObservation);
  assert.equal(held.status, "HOLD");
  assert.equal(held.holds[0].code, "HOLD_CURRENT_FLEET_OBSERVATION_INVALID");

  const inheritedManifest = Object.create({
    schema: Pins.SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  });
  assert.deepEqual(Object.keys(inheritedManifest), []);
  assert.notDeepEqual(Pins.validateFleet(inheritedManifest), []);
  assert.throws(() => Pins.assessFleetDrift(inheritedManifest, {
    schema: Pins.OBSERVATION_SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  }), /Invalid current-fleet manifest/);
});

test("repaired Assembly 47 still treats explicit observations as immutable evidence rather than authority", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R47_ASSEMBLY47_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R47_ASSEMBLY47_ROOT, "fixtures/current-fleet.json"));
  const observed = {
    schema: Pins.OBSERVATION_SCHEMA,
    ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]]))
  };
  const beforeFleet = copy(fleet);
  const beforeObserved = copy(observed);

  assert.deepEqual(Pins.assessFleetDrift(fleet, observed), { status: "PASS", drift: [], holds: [] });
  assert.deepEqual(fleet, beforeFleet);
  assert.deepEqual(observed, beforeObserved);

  const moved = { ...observed, interface: "1".repeat(40) };
  const drift = Pins.assessFleetDrift(fleet, moved);
  assert.equal(drift.status, "HOLD");
  assert.deepEqual(drift.drift, ["interface"]);
  assert.equal(drift.holds[0].pinned_commit, EXPECTED.interface);
  assert.equal(drift.holds[0].observed_commit, "1".repeat(40));
  assert.deepEqual(fleet, beforeFleet);
});
