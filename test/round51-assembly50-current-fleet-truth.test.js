"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "5171aa6f1d12141192604bd458042013f65be8f3";
const ASSEMBLY50 = "be2569087358c503c11b4d213cd2845d41dc862b";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "fc918bcddf4e0dce9bbc649ec35887c98a2d2af3",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R51_ASSEMBLY50_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function head(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

test("Assembly 50 exact head is only a fleet/status truth refresh", { skip: !enabled }, () => {
  assert.equal(process.env.R51_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R51_ASSEMBLY50_COMMIT, ASSEMBLY50);
  const changed = git(process.env.R51_ASSEMBLY50_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY50]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "fixtures/current-fleet.json"].sort());
  assert.equal(git(process.env.R51_ASSEMBLY50_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY50, "--", "src", "machine.json", "package.json", "scripts", "test", ".github"]), "");
});

test("Assembly 50 executable receipt exactly matches independently checked-out integrated fleet", { skip: !enabled }, () => {
  const fleet = require(path.join(process.env.R51_ASSEMBLY50_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(Object.keys(fleet).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: current-fleet manifest drifted`);

  const roots = {
    form: process.env.R51_FORM_MAIN_ROOT,
    surface: process.env.R51_SURFACE_MAIN_ROOT,
    capability: process.env.R51_CAPABILITY_MAIN_ROOT,
    interface: process.env.R51_INTERFACE_MAIN_ROOT,
    core: process.env.R51_MORPHTILE_ROOT
  };
  for (const [lane, root] of Object.entries(roots)) {
    assert.ok(root, `${lane}: exact integrated checkout missing`);
    assert.equal(head(root), EXPECTED[lane], `${lane}: receipt does not match checked-out integrated revision`);
  }

  const pins = require(path.join(process.env.R51_ASSEMBLY50_ROOT, "scripts/current-fleet-pins.js"));
  assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
  assert.deepEqual(pins.validateFleet(fleet), [], "receipt fails executable fleet grammar");
  assert.equal(pins.outputLines(fleet), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n");
});

test("Assembly 50 status tells current truth without transferring predecessor acceptance", { skip: !enabled }, () => {
  const status = fs.readFileSync(path.join(process.env.R51_ASSEMBLY50_ROOT, "STATUS.md"), "utf8");
  const marker = "## Current candidate: round 41 exact-fleet refresh";
  assert.ok(status.includes(marker));
  const current = status.split(marker)[1].split("## Evidence boundary")[0];
  for (const sha of Object.values(EXPECTED)) assert.ok(current.includes(sha), `current section omits ${sha}`);
  assert.ok(status.includes("historical exact evidence"), "status must preserve predecessor receipt as historical");
  assert.ok(status.includes("do not transfer") || status.includes("do not transfer to this changed receipt") || status.includes("they do not transfer"), "status must reject evidence transfer across the changed head");
  assert.ok(!current.includes("dd5764efdcd75bb826dd908a4d2245ad04d0a57a"), "historical Form identity is presented as current");
  assert.ok(!current.includes("ddafc9e30144d12605c6e4198cd8d6c5764e6212"), "historical Interface identity is presented as current");
});