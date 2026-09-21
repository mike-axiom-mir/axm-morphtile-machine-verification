"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const roots = {
  base: process.env.R40_ASSEMBLY_BASE_ROOT,
  candidate: process.env.R40_ASSEMBLY44_ROOT
};

const expected = {
  assemblyBase: "c45f8305196d149362045cef339ff1634f9095fe",
  assembly44: "6107864c5c13c8e0b3461ff8892661b05c488866",
  form: "e551c53f642ceaa77c89dcd5b907c95fd59463dc",
  surface: "4e4495182aa83e5dfba37722fc3756a70cfaafaa",
  capability: "edc07af182ee26ca1ceb64b5d5205591ec6aca9d",
  interface: "ec92507b82d855de49ba024ecfdd32aada24b186",
  core: "2bdf8eade1376055473b9cc1b11734b72a5566e5"
};

const enabled = Boolean(
  roots.base &&
  roots.candidate &&
  process.env.R40_ASSEMBLY_BASE_COMMIT &&
  process.env.R40_ASSEMBLY44_COMMIT &&
  process.env.R40_FORM_COMMIT &&
  process.env.R40_SURFACE_COMMIT &&
  process.env.R40_CAPABILITY_COMMIT &&
  process.env.R40_INTERFACE_COMMIT &&
  process.env.R40_MORPHTILE_COMMIT
);

function hashTree(root) {
  const h = crypto.createHash("sha256");
  function walk(dir) {
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name);
      const stat = fs.statSync(file);
      const rel = path.relative(root, file).split(path.sep).join("/");
      h.update(rel + "\0");
      if (stat.isDirectory()) walk(file);
      else h.update(fs.readFileSync(file));
    }
  }
  walk(root);
  return h.digest("hex");
}

function requireText(file, needle, label) {
  assert.ok(file.includes(needle), `${label} must contain exact identity ${needle}`);
}

test("Assembly 44 is evidence-only and binds the converged current fleet exactly", { skip: !enabled }, () => {
  assert.equal(process.env.R40_ASSEMBLY_BASE_COMMIT, expected.assemblyBase);
  assert.equal(process.env.R40_ASSEMBLY44_COMMIT, expected.assembly44);
  assert.equal(process.env.R40_FORM_COMMIT, expected.form);
  assert.equal(process.env.R40_SURFACE_COMMIT, expected.surface);
  assert.equal(process.env.R40_CAPABILITY_COMMIT, expected.capability);
  assert.equal(process.env.R40_INTERFACE_COMMIT, expected.interface);
  assert.equal(process.env.R40_MORPHTILE_COMMIT, expected.core);

  assert.equal(
    hashTree(path.join(roots.base, "src")),
    hashTree(path.join(roots.candidate, "src")),
    "Assembly runtime source must remain byte-identical to integrated base"
  );

  const workflow = fs.readFileSync(path.join(roots.candidate, ".github/workflows/current-fleet.yml"), "utf8");
  const specimen = fs.readFileSync(path.join(roots.candidate, "test/round37-current-fleet.integration.test.js"), "utf8");

  for (const [name, sha] of Object.entries({
    form: expected.form,
    surface: expected.surface,
    capability: expected.capability,
    interface: expected.interface,
    core: expected.core
  })) {
    requireText(workflow, sha, `current-fleet workflow ${name}`);
    requireText(specimen, sha, `current-fleet specimen ${name}`);
  }

  assert.ok(!workflow.includes("a13e495c61e911ef1382512b4532ddf26fdcc080"), "moving current-fleet lane must not retain prior Form pin");
  assert.ok(!workflow.includes("58ccd3e05e63f18e9ad081a75bbce5e78edd28c8"), "moving current-fleet lane must not retain prior Interface pin");

  requireText(specimen, "KIT_IMPORT_PLAN_COVERAGE", "current-fleet specimen");
  requireText(specimen, "KIT_RECEIVER_CLOSURE", "current-fleet specimen");
  requireText(specimen, "render", "current-fleet specimen");
});
