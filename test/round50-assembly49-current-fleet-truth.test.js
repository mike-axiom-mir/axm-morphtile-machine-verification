"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "a2fb0808e53a2a849b6746d5a4d2c1c296f2cfb0";
const ASSEMBLY49 = "fea9f0b7ba5a8c4bf6710806e636f53f6a6a72cc";
const EXPECTED = Object.freeze({
  form: "dd5764efdcd75bb826dd908a4d2245ad04d0a57a",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "ddafc9e30144d12605c6e4198cd8d6c5764e6212",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const FORM53 = "2484c05a9782e7eb84730a03e4a57e9f63584b55";
const INTERFACE44 = "c7f145526f56c54e5a545ad1115d2afb5170fc77";
const enabled = Boolean(process.env.R50_ASSEMBLY49_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function head(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

test("Assembly 49 exact head is only a fleet/status truth refresh", { skip: !enabled }, () => {
  assert.equal(process.env.R50_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R50_ASSEMBLY49_COMMIT, ASSEMBLY49);
  const changed = git(process.env.R50_ASSEMBLY49_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY49]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "fixtures/current-fleet.json"].sort());
  assert.equal(git(process.env.R50_ASSEMBLY49_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY49, "--", "src", "machine.json", "package.json", "scripts", "test", ".github"]), "");
});

test("Assembly 49 fleet manifest uses the executable grammar and matches independently checked-out integrated heads", { skip: !enabled }, () => {
  const fleet = require(path.join(process.env.R50_ASSEMBLY49_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(Object.keys(fleet).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: current-fleet manifest drifted`);

  const roots = {
    form: process.env.R50_FORM_MAIN_ROOT,
    surface: process.env.R50_SURFACE_MAIN_ROOT,
    capability: process.env.R50_CAPABILITY_MAIN_ROOT,
    interface: process.env.R50_INTERFACE_MAIN_ROOT,
    core: process.env.R50_MORPHTILE_ROOT
  };
  for (const [lane, root] of Object.entries(roots)) {
    assert.ok(root, `${lane}: exact integrated checkout missing`);
    assert.equal(head(root), EXPECTED[lane], `${lane}: manifest identity does not match checked-out integrated revision`);
  }

  const pins = require(path.join(process.env.R50_ASSEMBLY49_ROOT, "scripts/current-fleet-pins.js"));
  assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"], "receipt keys diverged from executable current-fleet grammar");
  assert.deepEqual(pins.validateFleet(fleet), [], "refreshed current-fleet manifest is not executable evidence");
  assert.equal(pins.outputLines(fleet), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n", "pin emission diverged from validated current fleet");
});

test("Assembly 49 status separates current integrated truth from historical and still-open producer heads", { skip: !enabled }, () => {
  const status = fs.readFileSync(path.join(process.env.R50_ASSEMBLY49_ROOT, "STATUS.md"), "utf8");
  const marker = "## Current candidate: round 39 exact-fleet refresh";
  assert.ok(status.includes(marker), "status lost current-candidate truth section");
  const current = status.split(marker)[1].split("## Evidence trail")[0];
  for (const sha of Object.values(EXPECTED)) assert.ok(current.includes(sha), `current section omits integrated identity ${sha}`);
  assert.ok(status.includes("historical exact evidence"), "status lost historical/current evidence distinction");
  assert.match(status, /Form #53 is currently a separate Form-owned draft candidate and is not part of this receipt/);
  assert.ok(!current.includes(FORM53), "open Form #53 was prematurely presented as integrated fleet truth");
  assert.ok(!current.includes(INTERFACE44), "open Interface #44 was prematurely presented as integrated fleet truth");
  assert.ok(!current.includes("f2f549266e3a5c15eb87fd967261eb874a990d27"), "historical Form identity is presented as current");
  assert.ok(!current.includes("67894cab657168bd316af1f0c6b6463c7cc7bb3a"), "historical Interface identity is presented as current");
});
