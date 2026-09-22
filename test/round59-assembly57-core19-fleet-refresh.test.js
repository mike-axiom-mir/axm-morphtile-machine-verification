"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "690f15a65398bf34b8f1ddd2d6a8eca5f40aecfe";
const ASSEMBLY57 = "0190b870ef6a1d8430deb032b0389438f2801d01";
const PREVIOUS_CORE = "34eddb9df6450a7da0da20dd596fd2b388bbb788";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "25dcb936e09bd440816d158b55151c879d5a558d",
  core: "685df074701feeae3e9d789e532d0a3658030bf4"
});
const enabled = Boolean(process.env.R59_ASSEMBLY57_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function jsonAt(root, ref, file) {
  return JSON.parse(git(root, ["show", `${ref}:${file}`]));
}

test("Assembly57 is exactly a one-lane current-fleet identity refresh", { skip: !enabled }, () => {
  assert.equal(process.env.R59_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R59_ASSEMBLY57_COMMIT, ASSEMBLY57);
  const root = process.env.R59_ASSEMBLY57_ROOT;
  assert.equal(git(root, ["rev-parse", "HEAD"]), ASSEMBLY57);

  const changed = git(root, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY57]).split("\n").filter(Boolean);
  assert.deepEqual(changed, ["fixtures/current-fleet.json"]);
  assert.equal(git(root, ["diff", "--numstat", ASSEMBLY_BASE, ASSEMBLY57]), "1\t1\tfixtures/current-fleet.json");

  const before = jsonAt(root, ASSEMBLY_BASE, "fixtures/current-fleet.json");
  const after = require(path.join(root, "fixtures/current-fleet.json"));
  for (const lane of ["schema", "form", "surface", "capability", "interface"]) {
    assert.equal(after[lane], before[lane], `${lane}: unrelated fleet identity moved`);
  }
  assert.equal(before.core, PREVIOUS_CORE, "predecessor receipt is not the expected pre-Core19 fleet");
  assert.equal(after.core, EXPECTED.core, "Core19 integrated identity was not pinned exactly");
});

test("Assembly57 executable receipt matches independently checked-out integrated heads", { skip: !enabled }, () => {
  const root = process.env.R59_ASSEMBLY57_ROOT;
  const fleet = require(path.join(root, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(Object.keys(fleet).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: current-fleet manifest drifted`);

  const roots = {
    form: process.env.R59_FORM_MAIN_ROOT,
    surface: process.env.R59_SURFACE_MAIN_ROOT,
    capability: process.env.R59_CAPABILITY_MAIN_ROOT,
    interface: process.env.R59_INTERFACE_MAIN_ROOT,
    core: process.env.R59_MORPHTILE_ROOT
  };
  for (const [lane, checkout] of Object.entries(roots)) {
    assert.ok(checkout, `${lane}: independent exact checkout missing`);
    assert.equal(git(checkout, ["rev-parse", "HEAD"]), EXPECTED[lane], `${lane}: receipt identity does not match checked-out integrated head`);
  }

  const pins = require(path.join(root, "scripts/current-fleet-pins.js"));
  assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
  assert.deepEqual(pins.validateFleet(fleet), [], "candidate receipt fails Assembly executable grammar");
  assert.equal(pins.outputLines(fleet), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n");
});

test("Core pin movement is provenance-bound to the integrated Core19 merge, not inferred from prose", { skip: !enabled }, () => {
  const core = process.env.R59_MORPHTILE_ROOT;
  assert.equal(git(core, ["rev-parse", "HEAD"]), EXPECTED.core);
  const parents = git(core, ["show", "-s", "--format=%P", "HEAD"]).split(/\s+/).filter(Boolean);
  assert.ok(parents.includes(PREVIOUS_CORE), "integrated Core19 merge does not descend directly from the fleet's previous core pin");
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", PREVIOUS_CORE, EXPECTED.core], { cwd: core, encoding: "utf8" });
  assert.equal(ancestor.status, 0, "previous core pin is not an ancestor of the newly pinned integrated core");
});
