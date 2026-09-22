"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "a2fb0808e53a2a849b6746d5a4d2c1c296f2cfb0";
const ASSEMBLY49 = "d8f856e6cabb917ee8be4c84642121a023187422";
const EXPECTED = Object.freeze({
  form: "dd5764efdcd75bb826dd908a4d2245ad04d0a57a",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "ddafc9e30144d12605c6e4198cd8d6c5764e6212",
  morphtile: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = Boolean(process.env.R49_ASSEMBLY49_ROOT);

function git(root, args) {
  const out = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function head(root) { return git(root, ["rev-parse", "HEAD"]); }

test("Assembly 49 is exactly a fleet/status truth refresh with runtime identity untouched", { skip: !enabled }, () => {
  assert.equal(process.env.R49_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R49_ASSEMBLY49_COMMIT, ASSEMBLY49);
  const changed = git(process.env.R49_ASSEMBLY49_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY49]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["STATUS.md", "fixtures/current-fleet.json"].sort());
  assert.equal(git(process.env.R49_ASSEMBLY49_ROOT, ["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY49, "--", "src", "machine.json", "package.json", "scripts", "test", ".github"]), "");
});

test("Assembly 49 fleet receipt names the exact integrated sibling identities independently checked out", { skip: !enabled }, () => {
  const fleet = require(path.join(process.env.R49_ASSEMBLY49_ROOT, "fixtures/current-fleet.json"));
  for (const [lane, sha] of Object.entries(EXPECTED)) assert.equal(fleet[lane], sha, `${lane}: current-fleet manifest drifted`);
  const roots = {
    form: process.env.R49_FORM_MAIN_ROOT,
    surface: process.env.R49_SURFACE_MAIN_ROOT,
    capability: process.env.R49_CAPABILITY_MAIN_ROOT,
    interface: process.env.R49_INTERFACE_MAIN_ROOT,
    morphtile: process.env.R49_MORPHTILE_ROOT
  };
  for (const [lane, root] of Object.entries(roots)) {
    assert.ok(root, `${lane}: exact integrated checkout missing`);
    assert.equal(head(root), EXPECTED[lane], `${lane}: receipt identity does not match checked-out integrated revision`);
  }
});

test("Assembly 49 persistent status separates current integrated truth from historical evidence and open work", { skip: !enabled }, () => {
  const status = fs.readFileSync(path.join(process.env.R49_ASSEMBLY49_ROOT, "STATUS.md"), "utf8");
  const current = status.split("## Current candidate: round 39 exact-fleet refresh")[1].split("## Evidence trail")[0];
  for (const sha of Object.values(EXPECTED)) assert.ok(current.includes(sha), `current section omits integrated identity ${sha}`);
  assert.ok(status.includes("historical exact evidence"), "status lost the distinction between historical and current receipts");
  assert.match(status, /Form #53 is currently a separate Form-owned draft candidate and is not part of this receipt/);
  assert.ok(!current.includes("f2f549266e3a5c15eb87fd967261eb874a990d27"), "historical Form identity is presented as current");
  assert.ok(!current.includes("67894cab657168bd316af1f0c6b6463c7cc7bb3a"), "historical Interface identity is presented as current");
});
