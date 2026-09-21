"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "82a65a965013654a5929596013ecbf3467f4d5ae";
const FORM37 = "411633f1a34f4045edfbcd474d0ddc947f7c4064";

function request(id, repeat) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 25 repeat-kernel replay",
    intent: { name: id, repeat },
    constraints: { budget: 64 },
    provenance: { caller: "axm.morphtile.machine.verification.round25" }
  };
}

function clone(value) {
  return structuredClone(value);
}

function exactReplay(machine, matter) {
  const firstInput = clone(matter);
  const secondInput = clone(matter);
  const firstBefore = clone(firstInput);
  const secondBefore = clone(secondInput);
  const first = machine.run(firstInput);
  const second = machine.run(secondInput);
  assert.deepEqual(firstInput, firstBefore, "first replay mutated caller matter");
  assert.deepEqual(secondInput, secondBefore, "second replay mutated caller matter");
  assert.deepEqual(second, first, "same exact input must replay deterministically");
  return first;
}

const enabled = !!process.env.R25_FORM_BASE_ROOT && !!process.env.R25_FORM37_ROOT && !!process.env.R25_CORE_PATH;

test("Form PR #37 preserves public repeat semantics while centralizing private validation movement", { skip: !enabled }, () => {
  assert.equal(process.env.R25_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R25_FORM37_COMMIT, FORM37);
  assert.equal(process.env.R25_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R25_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R25_FORM37_ROOT, "src"));
  const MT = require(path.resolve(process.env.R25_CORE_PATH));

  const cases = [
    request("r25-rotation-only", {
      count: 4,
      step: [0, 0, 0],
      part: { shape: "box", size: [1.5, 0.75, 0.5], pos: [2, -1, 3] },
      rot_step: [0, 15, 0]
    }),
    request("r25-size-only", {
      count: 4,
      step: [0, 0, 0],
      part: { shape: "box", size: [1, 2, 0.5] },
      size_step: [0.2, -0.1, 0.05]
    }),
    request("r25-scale-only", {
      count: 3,
      step: [0, 0, 0],
      instance: { use: "panel", scale: [1, 1, 1] },
      scale_step: [0.25, 0.1, 0]
    }),
    request("r25-setting-only", {
      count: 3,
      step: [0, 0, 0],
      instance: { use: "panel", with: { width: 1.25 } },
      with_step: { width: 0.375 }
    }),
    request("r25-authored-translation", {
      count: 3,
      step: [1.25, 0, -0.5],
      part: { shape: "box", size: [1, 1, 1] },
      rot_step: [0, 0, 10],
      size_step: [0.1, 0, 0]
    }),
    request("r25-no-progression", {
      count: 3,
      step: [0, 0, 0],
      part: { shape: "box", size: [1, 1, 1] }
    })
  ];

  for (const matter of cases) {
    const base = exactReplay(Base, matter);
    const head = exactReplay(Head, matter);
    assert.deepEqual(head, base, `${matter.request_id}: public output drifted across private-kernel convergence`);
  }

  const primitive = request("r25-real-core-effect", {
    count: 5,
    step: [0, 0, 0],
    part: { shape: "box", size: [1, 0.5, 0.25] },
    size_step: [0.125, 0.05, 0],
    rot_step: [0, 0, 12]
  });
  const candidate = exactReplay(Head, primitive);
  assert.equal(candidate.status, "CANDIDATE");
  assert.equal(candidate.holds.length, 0);
  assert.deepEqual(candidate.candidate.facets.mesh.data.parts[0].body[0].pos, [0, 0, 0], "validation-only movement leaked into authored output");

  const compiled = MT.compileMesh(MT.createTile(candidate.candidate));
  assert.equal(compiled.hold, null);
  assert.equal(compiled.recipe_parts, 5);
  assert.ok(compiled.P.length > 0);
  assert.ok(compiled.P.every(Number.isFinite));

  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(process.env.R25_FORM37_ROOT, "machine.json"), "utf8")).tested_against.commit,
    CORE,
    "candidate machine pin must remain the exact core receiver used by this verification"
  );
});
