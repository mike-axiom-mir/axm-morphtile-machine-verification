"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "2b080e5789074eab5829b324c360936bb1878aa0";
const ASSEMBLY48 = "64e04f13fd98ff1a91b573b6ed17802fa35750d6";
const enabled = Boolean(process.env.R48_ASSEMBLY48_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R48_ASSEMBLY48_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

test("Assembly 48 exact head is bounded to current-fleet evidence integrity", { skip: !enabled }, () => {
  assert.equal(process.env.R48_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R48_ASSEMBLY48_COMMIT, ASSEMBLY48);
  const changed = git(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY48]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "scripts/current-fleet-pins.js", "test/current-fleet-data-only-integrity.test.js"].sort());
  assert.equal(git(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY48, "--", "src", "machine.json", "package.json"]), "");
});

test("Assembly 48 rejects inherited, accessor, and hidden unsupported identity evidence without invoking getters", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "fixtures/current-fleet.json"));

  const inherited = Object.create({ schema: Pins.OBSERVATION_SCHEMA, ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]])) });
  assert.notDeepEqual(Pins.validateObservedFleet(inherited), []);

  let reads = 0;
  const accessor = { schema: Pins.OBSERVATION_SCHEMA };
  for (const lane of Pins.LANES) {
    Object.defineProperty(accessor, lane, { enumerable: true, get() { reads += 1; return fleet[lane]; } });
  }
  assert.notDeepEqual(Pins.validateObservedFleet(accessor), []);
  assert.equal(reads, 0, "validation executed authored identity getters");

  const hidden = { schema: Pins.OBSERVATION_SCHEMA, ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]])) };
  Object.defineProperty(hidden, "shadow", { enumerable: false, value: "not part of the grammar" });
  assert.match(Pins.validateObservedFleet(hidden).join("\n"), /unsupported authored field/);
});

test("accepted observation identity must not re-enter executable property lookup after descriptor validation", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "fixtures/current-fleet.json"));
  const target = { schema: Pins.OBSERVATION_SCHEMA, ...Object.fromEntries(Pins.LANES.map((lane) => [lane, fleet[lane]])) };
  const reads = [];
  const observed = new Proxy(target, {
    get(object, key, receiver) {
      if (Pins.LANES.includes(key)) {
        reads.push(key);
        if (key === "interface") return "1".repeat(40);
      }
      return Reflect.get(object, key, receiver);
    }
  });

  assert.deepEqual(Pins.validateObservedFleet(observed), [], "descriptor-valid observation should reach the post-validation boundary");
  reads.length = 0;
  const result = Pins.assessFleetDrift(fleet, observed);
  assert.deepEqual(reads, [], "drift comparison re-entered executable property lookup after validating data descriptors");
  assert.deepEqual(result, { status: "PASS", drift: [], holds: [] }, "comparison did not use the exact data values it validated");
});

test("accepted manifest identity must not re-enter executable lookup while emitting exact pins", { skip: !enabled }, () => {
  const Pins = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "scripts/current-fleet-pins"));
  const fleet = require(path.join(process.env.R48_ASSEMBLY48_ROOT, "fixtures/current-fleet.json"));
  const target = JSON.parse(JSON.stringify(fleet));
  const reads = [];
  const manifest = new Proxy(target, {
    get(object, key, receiver) {
      if (Pins.LANES.includes(key)) reads.push(key);
      return Reflect.get(object, key, receiver);
    }
  });
  assert.deepEqual(Pins.validateFleet(manifest), []);
  reads.length = 0;
  const lines = Pins.outputLines(manifest);
  assert.deepEqual(reads, [], "pin emission re-entered executable property lookup after validating data descriptors");
  assert.equal(lines, Pins.LANES.map((lane) => `${lane}=${fleet[lane]}`).join("\n") + "\n");
});
