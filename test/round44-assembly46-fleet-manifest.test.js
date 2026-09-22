"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ASSEMBLY_BASE = "778bd4f46d9675bbbc991ba98a0bddf85a92c6b3";
const ASSEMBLY46 = "893ceaf76cc1d60f8afe3b7edf8baf6d478ac32a";
const EXPECTED = Object.freeze({
  form: "416326bcafec510dc16cd3712677461d45ca8b6c",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "d242b9a18625b663dd389684e1f16d614432f3c9",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
});
const enabled = !!process.env.R44_ASSEMBLY46_ROOT;

function runGit(args) {
  const out = spawnSync("git", args, { cwd: process.env.R44_ASSEMBLY46_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

function workflowText() {
  return fs.readFileSync(path.join(process.env.R44_ASSEMBLY46_ROOT, ".github/workflows/current-fleet.yml"), "utf8");
}

test("Assembly 46 exact head is evidence-only with bounded changed-file scope", { skip: !enabled }, () => {
  assert.equal(process.env.R44_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R44_ASSEMBLY46_COMMIT, ASSEMBLY46);

  const changed = runGit(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY46]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, [
    ".github/workflows/current-fleet.yml",
    "fixtures/current-fleet.json",
    "scripts/current-fleet-pins.js",
    "test/current-fleet-pin-integrity.test.js",
    "test/current-form-position-receiver.integration.test.js",
    "test/current-form-size-receiver.integration.test.js",
    "test/round37-current-fleet.integration.test.js"
  ].sort());

  const semanticDiff = runGit(["diff", "--name-only", ASSEMBLY_BASE, ASSEMBLY46, "--", "src", "package.json", "machine.json"]);
  assert.equal(semanticDiff, "", "Assembly 46 changed runtime/package/manifest semantics despite evidence-only scope");
});

test("canonical fleet manifest exactly binds the integrated sibling/core identities", { skip: !enabled }, () => {
  const fleet = require(path.join(process.env.R44_ASSEMBLY46_ROOT, "fixtures/current-fleet.json"));
  assert.equal(fleet.schema, "axm.morphtile.assembly-current-fleet/v1");
  for (const [lane, sha] of Object.entries(EXPECTED)) {
    assert.equal(fleet[lane], sha, `${lane}: manifest identity is stale or unexpected`);
    assert.match(fleet[lane], /^[0-9a-f]{40}$/);
  }

  const pins = require(path.join(process.env.R44_ASSEMBLY46_ROOT, "scripts/current-fleet-pins.js"));
  assert.deepEqual(pins.validateFleet(fleet), []);
  assert.equal(
    pins.outputLines(fleet),
    Object.keys(EXPECTED).map((lane) => `${lane}=${EXPECTED[lane]}`).join("\n") + "\n",
    "pin emitter output disagrees with the canonical manifest"
  );
});

test("workflow executable bindings consume pin outputs instead of raw coincidental SHA text", { skip: !enabled }, () => {
  const text = workflowText();
  assert.match(text, /id:\s*pins\s*\n\s*run:\s*node scripts\/current-fleet-pins\.js >> "\$GITHUB_OUTPUT"/);
  const contracts = {
    form: ["mike-axiom-mir/axm-morphtile-machine-form", "CURRENT_FORM_COMMIT"],
    surface: ["mike-axiom-mir/axm-morphtile-machine-surface", "CURRENT_SURFACE_COMMIT"],
    capability: ["mike-axiom-mir/axm-morphtile-machine-capability", "CURRENT_CAPABILITY_COMMIT"],
    interface: ["mike-axiom-mir/axm-morphtile-machine-interface", "CURRENT_INTERFACE_COMMIT"],
    core: ["mike-axiom-mir/axm-morphtile", "CURRENT_MORPHTILE_COMMIT"]
  };

  for (const [lane, [repository, envName]] of Object.entries(contracts)) {
    const output = `\${{ steps.pins.outputs.${lane} }}`;
    const escaped = output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const repoEscaped = repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(text, new RegExp(`repository:\\s*${repoEscaped}[\\s\\S]{0,160}?ref:\\s*${escaped}(?:\\s|$)`), `${lane}: checkout is not bound to pin output`);
    assert.match(text, new RegExp(`${envName}:\\s*${escaped}(?:\\s|$)`), `${lane}: evidence env is not bound to pin output`);
    assert.equal(text.includes(EXPECTED[lane]), false, `${lane}: workflow duplicates exact SHA text outside canonical manifest`);
  }
});

test("malformed manifest identities fail closed before checkout output is emitted", { skip: !enabled }, () => {
  const pins = require(path.join(process.env.R44_ASSEMBLY46_ROOT, "scripts/current-fleet-pins.js"));
  const fleet = require(path.join(process.env.R44_ASSEMBLY46_ROOT, "fixtures/current-fleet.json"));
  assert.throws(() => pins.outputLines({ ...fleet, form: "not-a-sha" }), /form: expected an exact lowercase 40-character commit sha/);
  const missing = { ...fleet };
  delete missing.interface;
  assert.throws(() => pins.outputLines(missing), /interface: expected an exact lowercase 40-character commit sha/);
  assert.throws(() => pins.outputLines({ ...fleet, schema: "wrong" }), /manifest: schema must equal/);
});
