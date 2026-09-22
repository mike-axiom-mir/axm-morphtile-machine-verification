"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "cd0956217827ab263b76f4eab7f986f822bb6631";
const ASSEMBLY51 = "9dc3b67903e45b1afe9bb5e621308451d5e3a52b";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "586ac55c2523be59739b75c446b0b95938ae5319",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R52_ASSEMBLY51_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function head(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

test("Assembly 51 exact head is only the expected fleet/status truth refresh", { skip: !enabled }, () => {
  assert.equal(process.env.R52_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R52_ASSEMBLY51_COMMIT, ASSEMBLY51);
  const changed = git(process.env.R52_ASSEMBLY51_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY51]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "fixtures/current-fleet.json"].sort());
  assert.equal(git(process.env.R52_ASSEMBLY51_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY51, "--", "src", "machine.json", "package.json", "scripts", "test", ".github"]), "");
});

test("Assembly 51 executable receipt exactly matches independently checked-out integrated fleet", { skip: !enabled }, () => {
  const fleet = require(path.join(process.env.R52_ASSEMBLY51_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(Object.keys(fleet).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: current-fleet manifest drifted`);

  const roots = {
    form: process.env.R52_FORM_MAIN_ROOT,
    surface: process.env.R52_SURFACE_MAIN_ROOT,
    capability: process.env.R52_CAPABILITY_MAIN_ROOT,
    interface: process.env.R52_INTERFACE_MAIN_ROOT,
    core: process.env.R52_MORPHTILE_ROOT
  };
  for (const [lane, root] of Object.entries(roots)) {
    assert.ok(root, `${lane}: exact integrated checkout missing`);
    assert.equal(head(root), EXPECTED[lane], `${lane}: receipt does not match checked-out integrated revision`);
  }

  const pins = require(path.join(process.env.R52_ASSEMBLY51_ROOT, "scripts/current-fleet-pins.js"));
  assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
  assert.deepEqual(pins.validateFleet(fleet), [], "receipt fails executable fleet grammar");
  assert.equal(pins.outputLines(fleet), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n");
});

test("Assembly 51 status preserves predecessor acceptance as historical rather than transferable", { skip: !enabled }, () => {
  const status = fs.readFileSync(path.join(process.env.R52_ASSEMBLY51_ROOT, "STATUS.md"), "utf8");
  const marker = "## Current candidate: round 42 exact-fleet refresh";
  assert.ok(status.includes(marker));
  const current = status.split(marker)[1].split("## Evidence boundary")[0];
  for (const sha of Object.values(EXPECTED)) assert.ok(current.includes(sha), `current section omits ${sha}`);
  assert.ok(status.includes("historical exact evidence") || status.includes("historical evidence"), "status must preserve predecessor receipt as historical");
  assert.ok(status.includes("do not transfer") || status.includes("do not transfer to this changed receipt") || status.includes("they do not transfer"), "status must reject evidence transfer across the changed head");
  assert.ok(!current.includes("fc918bcddf4e0dce9bbc649ec35887c98a2d2af3"), "historical Interface identity is presented as current");
});