"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "7e6836d3fc171668b14c4e99d265ec9ddb7b31f4";
const ASSEMBLY52 = "02861b410d6b2d35c35e60a2d742e573973a5862";
const EXPECTED = Object.freeze({
  form: "ef6a09e4d662d960e015f61d7991c58d33f5c6d1",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "586ac55c2523be59739b75c446b0b95938ae5319",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const OPEN_INTERFACE46 = "115fdd6121449f3f496a76777ed2c20b5a1cdcd7";
const enabled = Boolean(process.env.R53_ASSEMBLY52_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function head(root) {
  return git(root, ["rev-parse", "HEAD"]);
}

test("Assembly 52 changes only persistent truth prose plus its regression check", { skip: !enabled }, () => {
  assert.equal(process.env.R53_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R53_ASSEMBLY52_COMMIT, ASSEMBLY52);

  const changed = git(process.env.R53_ASSEMBLY52_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY52]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "test/status-truth-surface-integrity.test.js"].sort());
  assert.equal(
    git(process.env.R53_ASSEMBLY52_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY52, "--", "src", "machine.json", "package.json", "scripts", ".github", "fixtures/current-fleet.json"]),
    "",
    "stable-status repair must not move runtime, package, workflow, pin grammar, or fleet identity"
  );
});

test("Assembly 52 leaves executable fleet authority unchanged and equal to independently checked-out mains", { skip: !enabled }, () => {
  const root = process.env.R53_ASSEMBLY52_ROOT;
  const fleetPath = path.join(root, "fixtures/current-fleet.json");
  const fleet = require(fleetPath);

  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  assert.deepEqual(Object.keys(fleet).sort(), ["schema", "form", "surface", "capability", "interface", "core"].sort());
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: executable receipt drifted`);

  const roots = {
    form: process.env.R53_FORM_MAIN_ROOT,
    surface: process.env.R53_SURFACE_MAIN_ROOT,
    capability: process.env.R53_CAPABILITY_MAIN_ROOT,
    interface: process.env.R53_INTERFACE_MAIN_ROOT,
    core: process.env.R53_MORPHTILE_ROOT
  };
  for (const [lane, checkout] of Object.entries(roots)) {
    assert.ok(checkout, `${lane}: exact integrated checkout missing`);
    assert.equal(head(checkout), EXPECTED[lane], `${lane}: receipt does not match independently checked-out integrated revision`);
  }

  const pins = require(path.join(root, "scripts/current-fleet-pins.js"));
  assert.deepEqual([...pins.LANES], ["form", "surface", "capability", "interface", "core"]);
  assert.deepEqual(pins.validateFleet(fleet), []);
  assert.equal(pins.outputLines(fleet), pins.LANES.map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n");

  const baseFleet = git(root, ["show", `${ASSEMBLY_BASE}:fixtures/current-fleet.json`]);
  const currentFleet = fs.readFileSync(fleetPath, "utf8").trim();
  assert.equal(currentFleet, baseFleet.trim(), "status cleanup must not silently rewrite the executable fleet receipt");
});

test("persistent status is merge-stable and cannot silently present draft or exact-run state as current truth", { skip: !enabled }, () => {
  const status = fs.readFileSync(path.join(process.env.R53_ASSEMBLY52_ROOT, "STATUS.md"), "utf8");

  assert.match(status, /fixtures\/current-fleet\.json/);
  assert.match(status, /scripts\/current-fleet-pins\.js/);
  assert.match(status, /producer evidence is not merge authority/i);
  assert.match(status, /does not auto-advance/i);
  assert.match(status, /Exact-head CI and independent Verification receipts belong on the PR and durable handoff/i);

  assert.doesNotMatch(status, /\b[0-9a-f]{40}\b/, "persistent status must not copy exact commit identities");
  assert.doesNotMatch(status, /^- State:.*\bCANDIDATE\b/im);
  assert.doesNotMatch(status, /^- State:.*FRESH VERIFICATION REQUIRED/im);
  assert.doesNotMatch(status, /^- Assembly integrated main\/base:/im);
  assert.doesNotMatch(status, /^`?PAUSE_RECOMMENDED\s*:/im);
  assert.ok(!status.includes(OPEN_INTERFACE46), "unintegrated Interface 46 must not appear as current fleet truth");

  const fleet = require(path.join(process.env.R53_ASSEMBLY52_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.interface, EXPECTED.interface, "current fleet must remain on integrated Interface main, not open PR 46");
});
