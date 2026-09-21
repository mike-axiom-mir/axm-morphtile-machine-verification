"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const FUNCTIONAL = "ae7d0de178e230240f2ce89e75f90feb2cd38876";
const FINAL = "d8d6af30116b2acd6cc4b987c346b1ee17a5a124";
const enabled = !!process.env.R32_ASSEMBLY40_FUNCTIONAL_ROOT && !!process.env.R32_ASSEMBLY40_FINAL_ROOT;

function filesUnder(root, relative) {
  const start = path.join(root, relative);
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  walk(start);
  return out.sort();
}

function assertTreeBytesEqual(aRoot, bRoot, relative) {
  const aFiles = filesUnder(aRoot, relative);
  const bFiles = filesUnder(bRoot, relative);
  assert.deepEqual(bFiles, aFiles, `${relative}: file set changed after functional green head`);
  for (const file of aFiles) {
    assert.deepEqual(fs.readFileSync(path.join(bRoot, file)), fs.readFileSync(path.join(aRoot, file)), `${file}: executable bytes changed after functional green head`);
  }
}

test("Assembly PR #40 final exact head preserves verified executable and test bytes", { skip: !enabled }, () => {
  assert.equal(process.env.R32_ASSEMBLY40_FUNCTIONAL_COMMIT, FUNCTIONAL);
  assert.equal(process.env.R32_ASSEMBLY40_FINAL_COMMIT, FINAL);
  const functional = process.env.R32_ASSEMBLY40_FUNCTIONAL_ROOT;
  const final = process.env.R32_ASSEMBLY40_FINAL_ROOT;

  assertTreeBytesEqual(functional, final, "src");
  assertTreeBytesEqual(functional, final, "test");
  assertTreeBytesEqual(functional, final, ".github/workflows");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(fs.readFileSync(path.join(final, file)), fs.readFileSync(path.join(functional, file)), `${file}: executable metadata changed after functional green head`);
  }

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-final-head-identity-round32/v0.1",
    functional_commit: FUNCTIONAL,
    final_exact_commit: FINAL,
    status: "PASS",
    checked: ["src-byte-identity", "test-byte-identity", "workflow-byte-identity", "machine-byte-identity", "package-byte-identity"],
    placement: "ASSEMBLY_DOCUMENTATION_ONLY_FINAL_HEAD"
  }));
});
