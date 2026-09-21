"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const BASE = "c45f8305196d149362045cef339ff1634f9095fe";
const HEAD = "6107864c5c13c8e0b3461ff8892661b05c488866";
const enabled = !!process.env.A44_BASE_ROOT && !!process.env.A44_HEAD_ROOT;

function filesUnder(root, relative) {
  const out = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  walk(path.join(root, relative));
  return out.sort();
}

function assertTreeBytesEqual(baseRoot, headRoot, relative) {
  const baseFiles = filesUnder(baseRoot, relative);
  const headFiles = filesUnder(headRoot, relative);
  assert.deepEqual(headFiles, baseFiles, `${relative}: executable file set changed in evidence-only Assembly candidate`);
  for (const file of baseFiles) {
    assert.deepEqual(
      fs.readFileSync(path.join(headRoot, file)),
      fs.readFileSync(path.join(baseRoot, file)),
      `${file}: executable bytes changed in evidence-only Assembly candidate`
    );
  }
}

test("Assembly #44 refreshed head is evidence-only and retains exact runtime/package contract", { skip: !enabled }, () => {
  assert.equal(process.env.A44_BASE_COMMIT, BASE);
  assert.equal(process.env.A44_HEAD_COMMIT, HEAD);
  assertTreeBytesEqual(process.env.A44_BASE_ROOT, process.env.A44_HEAD_ROOT, "src");
  for (const file of ["machine.json", "package.json"]) {
    assert.deepEqual(
      fs.readFileSync(path.join(process.env.A44_HEAD_ROOT, file)),
      fs.readFileSync(path.join(process.env.A44_BASE_ROOT, file)),
      `${file}: contract bytes changed in evidence-only Assembly candidate`
    );
  }
  assert.equal(fs.existsSync(path.join(process.env.A44_HEAD_ROOT, "test", "round37-current-fleet.integration.test.js")), true,
    "Assembly #44 must carry the claimed current-fleet receiver proof");
});
