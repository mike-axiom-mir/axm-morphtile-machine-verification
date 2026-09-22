"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "778bd4f46d9675bbbc991ba98a0bddf85a92c6b3";
const ASSEMBLY43 = "f4d4650c4c84d4b320ad51bd4f971ac0fcadd42e";
const enabled = !!process.env.A43_ASSEMBLY_BASE_ROOT && !!process.env.A43_ASSEMBLY43_ROOT;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const clone = (value) => JSON.parse(JSON.stringify(value));

function requestWithMachine(idMode, requestId) {
  const machine = { version: "fixture" };
  if (idMode !== "absent") machine.id = idMode;
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify exact upstream warning source identity",
    inputs: [{
      envelope_version: "0.1",
      request_id: "upstream-source",
      machine,
      status: "CANDIDATE",
      warnings: [{ code: "UPSTREAM_FIXTURE_WARNING", detail: "keep source identity exact" }],
      candidate: { schema: "morphtile.tile-spec/v0.4", form_hints: [], facets: {} }
    }],
    provenance: { caller: "verification-assembly43-current-base" }
  };
}

function runStable(machine, input, label) {
  const before = JSON.stringify(input);
  const first = machine.run(input);
  const replay = machine.run(input);
  assert.deepEqual(replay, first, `${label}: replay drifted`);
  assert.equal(JSON.stringify(input), before, `${label}: caller input mutated`);
  return first;
}

test("Assembly #43 exact current-base candidate preserves portable authored falsey warning-source ids", { skip: !enabled }, () => {
  assert.equal(process.env.A43_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.A43_ASSEMBLY43_COMMIT, ASSEMBLY43);
  const Base = require(path.join(process.env.A43_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.A43_ASSEMBLY43_ROOT, "src"));

  for (const [label, id] of [["empty-string", ""], ["zero", 0], ["false", false]]) {
    const baseInput = requestWithMachine(id, `base-${label}`);
    const headInput = requestWithMachine(id, `head-${label}`);
    const base = runStable(Base, baseInput, `base ${label}`);
    const head = runStable(Head, headInput, `head ${label}`);

    assert.equal(base.status, "CANDIDATE", label);
    assert.equal(head.status, "CANDIDATE", label);
    assert.equal(base.warnings[0].machine, null, `${label}: predecessor must reproduce the truthiness collapse being repaired`);
    assert.equal(head.warnings[0].machine, id, `${label}: compact warning source must preserve the exact authored value`);
    assert.equal(head.source_provenance[0].machine.id, id, `${label}: full provenance must agree with compact authored value`);
    assert.deepEqual(head.warnings[0].warning, headInput.inputs[0].warnings[0], `${label}: warning body drifted`);

    const sourceMachineBefore = clone(headInput.inputs[0].machine);
    head.source_provenance[0].machine.version = "mutated-output";
    head.warnings[0].warning.detail = "mutated-output";
    assert.deepEqual(headInput.inputs[0].machine, sourceMachineBefore, `${label}: returned provenance aliases caller machine object`);
    assert.equal(headInput.inputs[0].warnings[0].detail, "keep source identity exact", `${label}: returned warning aliases caller warning object`);
  }
});

test("authored null and true absence may share compact null only while full provenance preserves presence", { skip: !enabled }, () => {
  const Head = require(path.join(process.env.A43_ASSEMBLY43_ROOT, "src"));
  const authoredNullInput = requestWithMachine(null, "authored-null");
  const absentInput = requestWithMachine("absent", "true-absence");
  const authoredNull = runStable(Head, authoredNullInput, "authored null");
  const absent = runStable(Head, absentInput, "true absence");

  assert.equal(authoredNull.status, "CANDIDATE");
  assert.equal(absent.status, "CANDIDATE");
  assert.equal(authoredNull.warnings[0].machine, null, "authored null must remain exact in compact warning source");
  assert.equal(absent.warnings[0].machine, null, "true absence uses the compact null sentinel");
  assert.equal(hasOwn(authoredNull.source_provenance[0].machine, "id"), true,
    "full provenance must preserve that null was authored");
  assert.equal(authoredNull.source_provenance[0].machine.id, null);
  assert.equal(hasOwn(absent.source_provenance[0].machine, "id"), false,
    "full provenance must distinguish true absence from authored null");
  assert.deepEqual(absent.source_provenance[0].machine, { version: "fixture" });
  assert.deepEqual(authoredNull.warnings[0].warning, authoredNullInput.inputs[0].warnings[0]);
  assert.deepEqual(absent.warnings[0].warning, absentInput.inputs[0].warnings[0]);
});

test("own-key undefined fails the existing portability boundary instead of collapsing into omission", { skip: !enabled }, () => {
  const Head = require(path.join(process.env.A43_ASSEMBLY43_ROOT, "src"));
  const input = requestWithMachine("placeholder", "undefined-own-key");
  input.inputs[0].machine.id = undefined;
  const beforeMachine = { ...input.inputs[0].machine };
  const first = Head.run(input);
  const replay = Head.run(input);

  assert.equal(first.status, "HOLD");
  assert.deepEqual(replay, first, "undefined-own-key HOLD replay drifted");
  assert.equal(hasOwn(input.inputs[0].machine, "id"), true, "caller own-key presence mutated");
  assert.equal(input.inputs[0].machine.id, undefined, "caller undefined value mutated");
  assert.equal(input.inputs[0].machine.version, beforeMachine.version);
  assert.equal(first.holds.some((hold) => hold.code === "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE"), true,
    `undefined own-key must fail portability, got ${JSON.stringify(first.holds)}`);
});
