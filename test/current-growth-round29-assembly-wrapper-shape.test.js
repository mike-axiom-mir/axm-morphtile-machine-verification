"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "3759ffecedb19ad18d45cf1ca61e133bd5c674e6";
const ASSEMBLY_PR38 = "cc9e8a84cfa89d6f07e7aa08c26902769f5135c1";

const enabled = !!process.env.R29_ASSEMBLY_BASE_ROOT && !!process.env.R29_ASSEMBLY38_ROOT;

function fixture(root) {
  return JSON.parse(require("node:fs").readFileSync(path.join(root, "fixtures", "request.assembly.json"), "utf8"));
}

function requestWith(root, input, id) {
  const request = fixture(root);
  request.request_id = id;
  request.inputs.push(input);
  return request;
}

function firstHold(out) {
  assert.equal(out.status, "HOLD", JSON.stringify(out));
  assert.ok(Array.isArray(out.holds) && out.holds.length > 0, JSON.stringify(out));
  return out.holds[0];
}

test("rebased Assembly PR #38 closes malformed status-less candidate wrappers without stealing integrated HOLD authority", { skip: !enabled }, () => {
  assert.equal(process.env.R29_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R29_ASSEMBLY38_COMMIT, ASSEMBLY_PR38);

  const Base = require(path.join(process.env.R29_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R29_ASSEMBLY38_ROOT, "src"));

  const malformed = [null, false, 0, "", [], "not-a-candidate"];
  for (const [index, value] of malformed.entries()) {
    const baseInput = requestWith(process.env.R29_ASSEMBLY_BASE_ROOT, { candidate: value }, `r29-base-${index}`);
    const headInput = requestWith(process.env.R29_ASSEMBLY38_ROOT, { candidate: value }, `r29-head-${index}`);
    const before = JSON.stringify(headInput);

    const base = Base.run(baseInput);
    assert.equal(base.status, "CANDIDATE", `integrated predecessor weakness must reproduce for case ${index}: ${JSON.stringify(base)}`);

    const head = Head.run(headInput);
    const hold = firstHold(head);
    assert.deepEqual(hold, {
      code: "HOLD_CANDIDATE_SHAPE_INVALID",
      path: "request.inputs[2].candidate",
      detail: "An authored candidate wrapper must contain a plain candidate map; null, arrays, and primitive values are not candidate omission."
    });
    assert.deepEqual(Head.run(headInput), head, `case ${index}: deterministic replay`);
    assert.equal(JSON.stringify(headInput), before, `case ${index}: caller matter unchanged`);
  }

  const valid = requestWith(process.env.R29_ASSEMBLY38_ROOT, {
    candidate: { form_hints: ["verification-r29"], facets: {} }
  }, "r29-valid-wrapper");
  const validBase = Base.run(valid);
  const validHead = Head.run(valid);
  assert.equal(validHead.status, "CANDIDATE", JSON.stringify(validHead));
  assert.deepEqual(validHead, validBase, "plain-map wrapper compatibility must remain predecessor-equivalent");

  const nullProtoCandidate = Object.create(null);
  nullProtoCandidate.form_hints = ["null-proto-map"];
  nullProtoCandidate.facets = Object.create(null);
  const nullProtoRequest = requestWith(process.env.R29_ASSEMBLY38_ROOT, { candidate: nullProtoCandidate }, "r29-null-proto");
  const nullProtoOut = Head.run(nullProtoRequest);
  assert.equal(nullProtoOut.status, "CANDIDATE", JSON.stringify(nullProtoOut));

  const upstreamHold = requestWith(process.env.R29_ASSEMBLY38_ROOT, {
    status: "HOLD",
    candidate: null,
    holds: [{ code: "UPSTREAM_BLOCK", detail: "verification control" }]
  }, "r29-upstream-hold");
  assert.deepEqual(Head.run(upstreamHold), Base.run(upstreamHold), "status-bearing HOLD authority changed");
  assert.equal(firstHold(Head.run(upstreamHold)).code, "HOLD_INPUT_NOT_CANDIDATE");

  const upstreamMissing = requestWith(process.env.R29_ASSEMBLY38_ROOT, {
    status: "CANDIDATE",
    candidate: null,
    holds: []
  }, "r29-upstream-candidate-missing");
  assert.deepEqual(Head.run(upstreamMissing), Base.run(upstreamMissing), "status-bearing CANDIDATE missing semantics changed");
  assert.equal(firstHold(Head.run(upstreamMissing)).code, "HOLD_INPUT_CANDIDATE_MISSING");

  const integratedHoldAuthority = requestWith(process.env.R29_ASSEMBLY38_ROOT, {
    candidate: null,
    holds: [{ code: "UPSTREAM_DIRECT_BLOCK", detail: "integrated PR37 authority" }]
  }, "r29-integrated-direct-hold");
  const integratedBase = Base.run(integratedHoldAuthority);
  const integratedHead = Head.run(integratedHoldAuthority);
  assert.deepEqual(integratedHead, integratedBase, "wrapper-shape repair must not steal integrated PR37 HOLD authority");
  assert.equal(firstHold(integratedHead).code, "HOLD_INPUT_DIRECT_HAS_HOLDS");

  const siblingMalformed = requestWith(process.env.R29_ASSEMBLY38_ROOT, {
    candidate: null,
    holds: { code: "not-an-array" }
  }, "r29-sibling-holds-shape");
  assert.deepEqual(Head.run(siblingMalformed), Base.run(siblingMalformed), "candidate guard masked sibling container evidence");
  assert.equal(firstHold(Head.run(siblingMalformed)).code, "HOLD_HOLDS_SHAPE_INVALID");

  const nonPlain = requestWith(process.env.R29_ASSEMBLY38_ROOT, { candidate: new Date(0) }, "r29-nonplain");
  assert.deepEqual(Head.run(nonPlain), Base.run(nonPlain), "portability authority changed");
  assert.equal(firstHold(Head.run(nonPlain)).code, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");

  let getterHits = 0;
  const accessorWrapper = {};
  Object.defineProperty(accessorWrapper, "candidate", {
    enumerable: true,
    get() {
      getterHits += 1;
      return null;
    }
  });
  const accessorRequest = requestWith(process.env.R29_ASSEMBLY38_ROOT, accessorWrapper, "r29-accessor");
  const accessorHold = firstHold(Head.run(accessorRequest));
  assert.equal(accessorHold.code, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  assert.equal(accessorHold.path, "request.inputs[2].candidate");
  assert.equal(getterHits, 0, "candidate accessor must not execute");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-wrapper-shape-round29/v0.1",
    target_commit: ASSEMBLY_PR38,
    predecessor_commit: ASSEMBLY_BASE,
    status: "PASS",
    checked: [
      "integrated-predecessor-wrapper-disappearance-reproduced",
      "malformed-wrapper-fails-closed",
      "exact-authored-path",
      "deterministic-replay",
      "caller-immutability",
      "valid-wrapper-predecessor-equivalence",
      "null-prototype-plain-map-compatibility",
      "status-bearing-envelope-authority",
      "integrated-pr37-hold-authority",
      "sibling-container-precedence",
      "portability-precedence",
      "accessor-nonexecution"
    ],
    placement: "ASSEMBLY_COMPATIBILITY_WRAPPER_SOURCE_INTEGRITY"
  }));
});
