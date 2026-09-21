"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BASE = "ec92507b82d855de49ba024ecfdd32aada24b186";
const INTERFACE39 = "ef20bba019167a07be1045b2d0affad04c82daa7";
const enabled = !!process.env.R42_INTERFACE_BASE_ROOT && !!process.env.R42_INTERFACE39_ROOT;

function filesUnder(root) {
  const out = new Map();
  function walk(dir, rel = "") {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const nextRel = path.join(rel, ent.name);
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full, nextRel);
      else out.set(nextRel.replaceAll(path.sep, "/"), fs.readFileSync(full, "utf8"));
    }
  }
  walk(root);
  return out;
}

function runTest(root, file) {
  return spawnSync(process.execPath, ["--test", file], { cwd: root, encoding: "utf8" });
}

function tempClone(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axm-interface39-"));
  fs.cpSync(source, root, { recursive: true });
  return root;
}

test("Interface #39 exact head changes evidence machinery only and fails closed under adversarial drift", { skip: !enabled }, () => {
  assert.equal(process.env.R42_INTERFACE_BASE_COMMIT, BASE);
  assert.equal(process.env.R42_INTERFACE39_COMMIT, INTERFACE39);

  const baseRoot = process.env.R42_INTERFACE_BASE_ROOT;
  const headRoot = process.env.R42_INTERFACE39_ROOT;
  assert.deepEqual(filesUnder(path.join(headRoot, "src")), filesUnder(path.join(baseRoot, "src")), "Interface #39 must not alter runtime source");

  for (const file of ["test/integration-workflow-coverage.test.js", "test/integration-evidence-identity.test.js"]) {
    const result = runTest(headRoot, file);
    assert.equal(result.status, 0, `${file} must pass at exact candidate head\n${result.stdout}\n${result.stderr}`);
  }

  const omitted = tempClone(headRoot);
  fs.writeFileSync(path.join(omitted, "test", "unlisted-assembly.integration.test.js"), '"use strict";\n// MORPHTILE_ASSEMBLY\nconst test=require("node:test"); test("adversarial unlisted receiver proof",()=>{});\n');
  let result = runTest(omitted, "test/integration-workflow-coverage.test.js");
  assert.notEqual(result.status, 0, "an Assembly-dependent proof omitted from receiver CI must fail closed");

  const stale = tempClone(headRoot);
  const boundProof = path.join(stale, "test", "binding-namespace-authority.integration.test.js");
  assert.ok(fs.existsSync(boundProof), "expected receiver proof must exist at exact candidate head");
  fs.unlinkSync(boundProof);
  result = runTest(stale, "test/integration-workflow-coverage.test.js");
  assert.notEqual(result.status, 0, "a stale receiver-workflow entry must fail closed after its proof is removed");

  const floating = tempClone(headRoot);
  const statusPath = path.join(floating, "STATUS.md");
  let status = fs.readFileSync(statusPath, "utf8");
  status = status.replace(/Executable Interface receiver evidence is pinned to integrated Assembly `[^`]+`\./, "Assembly receiver evidence currently targets integrated main.");
  fs.writeFileSync(statusPath, status);
  result = runTest(floating, "test/integration-evidence-identity.test.js");
  assert.notEqual(result.status, 0, "floating current-main wording must fail pinned evidence identity truth");
});
