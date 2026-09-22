"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "778bd4f46d9675bbbc991ba98a0bddf85a92c6b3";
const ASSEMBLY46 = "3c31efbdbc3875a53bf798ad2ffea5473547de38";
const FORM = "416326bcafec510dc16cd3712677461d45ca8b6c";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R43_ASSEMBLY46_ROOT && !!process.env.R43_FORM_ROOT && !!process.env.R43_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(requestId) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify current integrated Form position state through Assembly receiver closure",
    provenance: { verifier: "round43" },
    intent: {
      repeat: {
        count: 3,
        step: [0.5, 0, -1],
        part: { shape: "box", pos: [10, -2, 3], size: [1, 1, 0.5] }
      }
    }
  };
}

function recipeLeaf(candidate) {
  const repeat = candidate.facets.mesh.data.parts[0];
  assert.equal(repeat.as, "i");
  assert.equal(repeat.repeat, 3);
  return repeat.body[0];
}

function applyImported(MT, receiver, imported) {
  for (const op of imported.ops || []) MT.applyStructOp(receiver, op);
}

test("Assembly #46 exact head preserves current Form position matter through complete receiver closure", { skip: !enabled }, () => {
  assert.equal(process.env.R43_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R43_ASSEMBLY46_COMMIT, ASSEMBLY46);
  assert.equal(process.env.R43_FORM_COMMIT, FORM);
  assert.equal(process.env.R43_MORPHTILE_COMMIT, MORPHTILE);

  const Assembly = require(path.join(process.env.R43_ASSEMBLY46_ROOT, "src"));
  const { materializeKit } = require(path.join(process.env.R43_ASSEMBLY46_ROOT, "src", "kit.js"));
  const Form = require(path.join(process.env.R43_FORM_ROOT, "src"));
  const MT = require(path.join(process.env.R43_MORPHTILE_ROOT, "core", "morphtile.js"));

  const formInput = request("r43-form-position");
  const formBefore = JSON.stringify(formInput);
  const form = Form.run(formInput);
  const formReplay = Form.run(formInput);
  assert.equal(form.status, "CANDIDATE", JSON.stringify(form.holds));
  assert.deepEqual(formReplay, form, "Form exact integrated replay drifted");
  assert.equal(JSON.stringify(formInput), formBefore, "Form caller input mutated");

  const expectedPos = [
    ["+", 10, ["*", ["var", "i"], 0.5]],
    -2,
    ["+", 3, ["*", ["var", "i"], -1]]
  ];
  assert.deepEqual(recipeLeaf(form.candidate).pos, expectedPos,
    "Form must expose the integrated lexical-i position representation claimed by Assembly #46");

  const id = "mt_verification_current_position_repeat";
  const assemblyInput = {
    envelope_version: "0.1",
    request_id: "r43-assembly-position",
    goal: "Verify exact Form position matter survives Assembly",
    intent: { id, name: "Verification current position repeat" },
    inputs: [form],
    provenance: { verifier: "round43" }
  };
  const assemblyBefore = JSON.stringify(assemblyInput);
  const assembled = Assembly.run(assemblyInput);
  const assembledReplay = Assembly.run(assemblyInput);
  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds));
  assert.deepEqual(assembledReplay, assembled, "Assembly replay drifted");
  assert.equal(JSON.stringify(assemblyInput), assemblyBefore, "Assembly caller input mutated");
  assert.deepEqual(recipeLeaf(assembled.candidate).pos, expectedPos,
    "Assembly changed the exact current Form repeat-position recipe matter");

  const portable = materializeKit(assembled, MT, { name: "Verification Form position receiver kit" });
  const portableReplay = materializeKit(assembled, MT, { name: "Verification Form position receiver kit" });
  assert.equal(portable.status, "CANDIDATE", JSON.stringify(portable.holds));
  assert.deepEqual(portableReplay, portable, "portable kit materialization replay drifted");
  assert.deepEqual(recipeLeaf(portable.kit.tile).pos, expectedPos,
    "portable kit changed the exact current Form position recipe matter");

  for (const kind of ["KIT_IMPORT_PLAN_COVERAGE", "KIT_APPLY", "KIT_RECEIVER_CLOSURE"]) {
    assert.equal(portable.evidence.some((entry) => entry.kind === kind && entry.status === "PASS"), true,
      `portable receiver evidence missing ${kind}`);
  }

  const serialized = JSON.stringify(portable.kit);
  const receiver = MT.createWorld("Verification current Form position receiver");
  const imported = MT.importKit(receiver, JSON.parse(serialized));
  assert.equal(imported.status, "READY", JSON.stringify(imported));
  applyImported(MT, receiver, imported);

  const received = MT.resolveTile(receiver, id);
  assert.ok(received, "fresh receiver did not resolve imported tile");
  assert.deepEqual(recipeLeaf(received).pos, expectedPos,
    "fresh-world import changed current Form position recipe matter");

  const mesh = MT.compileMesh(received, receiver);
  const meshReplay = MT.compileMesh(received, receiver);
  assert.deepEqual(meshReplay, mesh, "receiver mesh replay drifted");
  assert.equal(mesh.hold, null, JSON.stringify(mesh));
  assert.equal(mesh.recipe_parts, 3);
  assert.equal(mesh.P.every(Number.isFinite), true, "transported position progression compiled non-finite geometry");
});
