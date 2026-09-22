"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BASE = "dd5764efdcd75bb826dd908a4d2245ad04d0a57a";
const CANDIDATE = "2484c05a9782e7eb84730a03e4a57e9f63584b55";
const enabled = Boolean(process.env.R49_FORM53_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R49_FORM53_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

test("Form 53 is bounded to private grid-size generated-state convergence", { skip: !enabled }, () => {
  assert.equal(process.env.R49_FORM_BASE_COMMIT, BASE);
  assert.equal(process.env.R49_FORM53_COMMIT, CANDIDATE);
  const changed = git(["diff", "--name-only", BASE, CANDIDATE]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["src/grid-size-state.js", "src/grid-size.js", "test/grid-size-state-kernel.test.js"].sort());
  assert.equal(git(["diff", "--name-only", BASE, CANDIDATE, "--", "machine.json", "package.json", "src/index.js"]), "");
});

test("Form 53 state is copied, deterministic, and validation-neutral", { skip: !enabled }, () => {
  const State = require(path.join(process.env.R49_FORM53_ROOT, "src/grid-size-state"));
  const grid = {
    counts: [3, 4, 1],
    part: { shape: "box", size: [1, 2, 3] },
    size_step: { x: [0.25, 0, -0.1], y: [0, 0.5, 0] }
  };
  const before = JSON.stringify(grid);
  const state = State.sizeStateFromGrid(grid);
  assert.deepEqual(state, { base: [1, 2, 3], deltas: [[0.25, 0, -0.1], [0, 0.5, 0], null] });
  state.base[0] = 99;
  state.deltas[0][0] = 99;
  assert.equal(JSON.stringify(grid), before, "state helper aliased caller-authored data");
  assert.deepEqual(State.generatedSizeFromGrid(grid, [2, 3, 0]), [1.5, 3.5, 2.8]);
  assert.deepEqual(State.sizeExpressionStateFromGrid(grid), [
    ["+", 1, ["*", ["var", "gx"], 0.25]],
    ["+", 2, ["*", ["var", "gy"], 0.5]],
    ["+", 3, ["*", ["var", "gx"], -0.1]]
  ]);

  const malformed = { part: { shape: "box", size: [1, 2] }, size_step: { x: [0.5, 0] } };
  assert.deepEqual(State.sizeStateFromGrid(malformed), { base: [1, 1, 1], deltas: [null, null, null] });
});

test("Form 53 preserves base semantic decisions on representative valid and invalid size progressions", { skip: !enabled }, () => {
  const base = require(path.join(process.env.R49_FORM_BASE_ROOT, "src"));
  const candidate = require(path.join(process.env.R49_FORM53_ROOT, "src"));
  const requests = [
    { envelope_version: "0.1", request_id: "r49-valid", goal: "grid size", intent: { grid: { counts: [3, 2, 1], part: { shape: "box", size: [1, 2, 3] }, step: [2, 2, 0], size_step: { x: [0.25, 0, 0], y: [0, 0.5, 0] } } }, provenance: { caller: "verification-r49" } },
    { envelope_version: "0.1", request_id: "r49-invalid", goal: "grid size", intent: { grid: { counts: [3, 1, 1], part: { shape: "box", size: [1, 1, 1] }, step: [2, 0, 0], size_step: { x: [-1, 0, 0] } } }, provenance: { caller: "verification-r49" } }
  ];
  for (const request of requests) {
    const before = JSON.stringify(request);
    const oldOut = base.run(request);
    const newOut = candidate.run(request);
    assert.equal(newOut.status, oldOut.status);
    assert.deepEqual(newOut.holds || [], oldOut.holds || []);
    assert.deepEqual(newOut.candidate || null, oldOut.candidate || null);
    assert.equal(JSON.stringify(request), before, "candidate mutated caller request");
    assert.deepEqual(candidate.run(request), newOut, "candidate replay drifted");
  }
});
