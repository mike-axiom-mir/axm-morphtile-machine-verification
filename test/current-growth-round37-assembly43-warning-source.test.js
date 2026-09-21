"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "c45f8305196d149362045cef339ff1634f9095fe";
const ASSEMBLY43 = "b927da470b6ee92a9ce64c2f5697896dd4e8180c";

const enabled = !!process.env.R37_ASSEMBLY_BASE_ROOT && !!process.env.R37_ASSEMBLY43_ROOT;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function requestWithMachine(machine, requestId) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Verify exact upstream warning source identity",
    inputs: [
      {
        envelope_version: "0.1",
        request_id: "upstream-r37",
        machine,
        status: "CANDIDATE",
        warnings: [
          {
            code: "UPSTREAM_FIXTURE_WARNING",
            detail: "warning body must survive source wrapping",
            nested: { authored: false, zero: 0 }
          }
        ],
        candidate: {
          schema: "morphtile.tile-spec/v0.4",
          form_hints: [],
          facets: {}
        }
      }
    ],
    provenance: { verifier: "round37" }
  };
}

function runStable(Machine, request, label) {
  const firstInput = clone(request);
  const secondInput = clone(request);
  const firstBefore = JSON.stringify(firstInput);
  const secondBefore = JSON.stringify(secondInput);
  const first = Machine.run(firstInput);
  const second = Machine.run(secondInput);
  assert.deepEqual(second, first, `${label}: deterministic replay changed`);
  assert.equal(JSON.stringify(firstInput), firstBefore, `${label}: first caller input mutated`);
  assert.equal(JSON.stringify(secondInput), secondBefore, `${label}: second caller input mutated`);
  return first;
}

function warning(out) {
  assert.equal(out.status, "CANDIDATE");
  assert.ok(Array.isArray(out.warnings));
  assert.equal(out.warnings.length, 1);
  assert.equal(out.warnings[0].code, "UPSTREAM_WARNING");
  return out.warnings[0];
}

test("Assembly #43 separates authored presence from host-language truthiness", { skip: !enabled }, () => {
  assert.equal(process.env.R37_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R37_ASSEMBLY43_COMMIT, ASSEMBLY43);

  const Base = require(path.join(process.env.R37_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_ASSEMBLY43_ROOT, "src"));

  for (const [label, machineId] of [
    ["empty-string", ""],
    ["zero", 0],
    ["false", false]
  ]) {
    const request = requestWithMachine({ id: machineId, version: "fixture" }, `r37-${label}`);
    const baseOut = runStable(Base, request, `base-${label}`);
    const headOut = runStable(Head, request, `head-${label}`);

    const baseWarning = warning(baseOut);
    const headWarning = warning(headOut);

    assert.equal(baseWarning.machine, null, `${label}: predecessor should demonstrate the truthiness defect`);
    assert.equal(headWarning.machine, machineId, `${label}: authored id must be preserved exactly`);
    assert.deepEqual(headWarning.warning, request.inputs[0].warnings[0], `${label}: warning body changed`);
    assert.equal(headOut.source_provenance[0].machine.id, machineId, `${label}: compact/full provenance disagree`);
  }
});

test("Assembly #43 keeps true absence distinct and preserves ordinary predecessor-visible behavior", { skip: !enabled }, () => {
  const Base = require(path.join(process.env.R37_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R37_ASSEMBLY43_ROOT, "src"));

  const absent = requestWithMachine({ version: "fixture" }, "r37-absent");
  const absentBase = runStable(Base, absent, "absent-base");
  const absentHead = runStable(Head, absent, "absent-head");
  assert.deepEqual(absentHead, absentBase, "true absence should remain predecessor-visible behavior");
  assert.equal(warning(absentHead).machine, null);
  assert.equal(Object.prototype.hasOwnProperty.call(absentHead.source_provenance[0].machine, "id"), false);

  const ordinary = requestWithMachine({ id: "machine-a", version: "fixture" }, "r37-ordinary");
  const ordinaryBase = runStable(Base, ordinary, "ordinary-base");
  const ordinaryHead = runStable(Head, ordinary, "ordinary-head");
  assert.deepEqual(ordinaryHead, ordinaryBase, "truthy authored id behavior drifted");
  assert.equal(warning(ordinaryHead).machine, "machine-a");
});

test("Assembly #43 clones sourced warning identity instead of aliasing caller-owned authored matter", { skip: !enabled }, () => {
  const Head = require(path.join(process.env.R37_ASSEMBLY43_ROOT, "src"));
  const authoredId = { namespace: "portable", ordinal: 0 };
  const request = requestWithMachine({ id: authoredId, version: "fixture" }, "r37-object-id");
  const before = JSON.stringify(request);
  const out = Head.run(request);
  const sourced = warning(out);

  assert.deepEqual(sourced.machine, authoredId);
  assert.notEqual(sourced.machine, request.inputs[0].machine.id, "warning identity aliases caller object");
  assert.notEqual(out.source_provenance[0].machine, request.inputs[0].machine, "full provenance aliases caller machine object");
  sourced.machine.ordinal = 99;
  out.source_provenance[0].machine.id.ordinal = 88;
  assert.equal(JSON.stringify(request), before, "mutating returned provenance changed caller input");
});
