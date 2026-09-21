"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ASSEMBLY_BASE = "3a4af4417de21fff862bf309e3576c362bcac7f5";
const ASSEMBLY36 = "fd0936dbf6372d918e8737221811a24c715e224b";
const INTERFACE = "96dfea316216922dffca872ec083a549e4777c96";

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

const enabled = !!process.env.R24_ASSEMBLY_BASE_ROOT
  && !!process.env.R24_ASSEMBLY36_ROOT
  && !!process.env.R24_INTERFACE_ROOT;

test("Assembly PR #36: current Interface v0.5 presentation grammar fails closed without rewriting legacy v0.4", { skip: !enabled }, () => {
  assert.equal(process.env.R24_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R24_ASSEMBLY36_COMMIT, ASSEMBLY36);
  assert.equal(process.env.R24_INTERFACE_COMMIT, INTERFACE);

  const Base = require(path.join(process.env.R24_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R24_ASSEMBLY36_ROOT, "src"));
  const Interface = require(path.join(process.env.R24_INTERFACE_ROOT, "src"));
  const assemblyFixture = loadJson(path.join(process.env.R24_ASSEMBLY_BASE_ROOT, "fixtures", "request.assembly.json"));
  const interfaceFixture = loadJson(path.join(process.env.R24_INTERFACE_ROOT, "fixtures", "request.counter-view.json"));
  const placementFixture = loadJson(path.join(process.env.R24_INTERFACE_ROOT, "fixtures", "request.counter-view-placement.json"));

  function interfaceForPlacement(id, placement) {
    const input = copy(interfaceFixture);
    input.request_id = id;
    input.intent = { ...copy(interfaceFixture.intent), placement: copy(placement) };
    return Interface.run(input);
  }

  function assemblyRequest(id, interfaceEnvelope) {
    const request = copy(assemblyFixture);
    request.request_id = id;
    request.intent = { id: "mt_counter", name: "Round 24 Interface transport proof" };
    if (!request.inputs[0].candidate.form_hints.includes("ui_panel")) request.inputs[0].candidate.form_hints.push("ui_panel");
    request.inputs.push(copy(interfaceEnvelope));
    return request;
  }

  function syntheticCandidate(id, placement) {
    const valid = interfaceForPlacement(`${id}-producer-control`, { mode: placement.mode });
    assert.equal(valid.status, "CANDIDATE", `${id}: control placement must be valid at the exact Interface producer`);
    const candidate = copy(valid);
    candidate.request_id = `${id}-synthetic-envelope`;
    candidate.candidate.operations[1].presentation = copy(placement);
    return candidate;
  }

  function headShapeHold(id, envelope) {
    const request = assemblyRequest(id, envelope);
    const before = JSON.stringify(request);
    const first = Head.run(request);
    const second = Head.run(request);
    assert.equal(first.status, "HOLD", `${id}: current receiver must fail closed`);
    const hold = first.holds.find((item) => item.code === "HOLD_INTERFACE_OPERATIONS_SHAPE_INVALID");
    assert.ok(hold, `${id}: failure must remain at the bounded Interface-operation grammar`);
    assert.deepEqual(second, first, `${id}: replay must remain deterministic`);
    assert.equal(JSON.stringify(request), before, `${id}: caller matter must remain unchanged`);
    return { request, result: first, hold };
  }

  // Positive control: consume the exact current producer candidate, not a hand-written approximation.
  const exactProducer = Interface.run(copy(placementFixture));
  assert.equal(exactProducer.status, "CANDIDATE", JSON.stringify(exactProducer.holds));
  assert.equal(exactProducer.candidate.schema, "morphtile.interface-operations/v0.5");
  const exactRequest = assemblyRequest("r24-exact-current-producer", exactProducer);
  const exactBase = Base.run(exactRequest);
  const exactHead = Head.run(exactRequest);
  assert.equal(exactHead.status, "CANDIDATE", JSON.stringify(exactHead.holds));
  assert.deepEqual(exactHead, exactBase, "valid exact current Interface output must remain Assembly-equivalent");
  assert.deepEqual(exactHead.candidate.presentation, {
    mode: "docked",
    dock: "right",
    preferred_size: [360, 480],
    preferred_position: [0, 0],
    user_adjustable: true
  });

  // Genuine omission stays omission and false/zero remain authored values.
  for (const mode of ["screen", "docked", "tile"]) {
    const producer = interfaceForPlacement(`r24-omitted-${mode}`, { mode });
    assert.equal(producer.status, "CANDIDATE", `${mode}: producer omission control`);
    assert.deepEqual(producer.candidate.operations[1].presentation, { mode });
    const request = assemblyRequest(`r24-omitted-${mode}-assembly`, producer);
    const base = Base.run(request);
    const head = Head.run(request);
    assert.equal(head.status, "CANDIDATE", JSON.stringify(head.holds));
    assert.deepEqual(head, base, `${mode}: tightened v0.5 grammar must not invent optional presentation defaults`);
    assert.deepEqual(head.candidate.presentation, { mode });
  }

  const falseZeroProducer = interfaceForPlacement("r24-false-zero", {
    mode: "screen",
    preferred_position: [0, 0],
    user_adjustable: false
  });
  assert.equal(falseZeroProducer.status, "CANDIDATE", JSON.stringify(falseZeroProducer.holds));
  const falseZeroRequest = assemblyRequest("r24-false-zero-assembly", falseZeroProducer);
  const falseZeroBase = Base.run(falseZeroRequest);
  const falseZeroHead = Head.run(falseZeroRequest);
  assert.deepEqual(falseZeroHead, falseZeroBase, "valid false/zero authorship must not be confused with omission");
  assert.deepEqual(falseZeroHead.candidate.presentation, {
    mode: "screen",
    preferred_position: [0, 0],
    user_adjustable: false
  });

  // Reproduce the predecessor gap independently: current Interface rejects each authored null,
  // while integrated Assembly previously accepted the equivalent malformed transport candidate.
  const nullCases = [
    ["dock", { mode: "docked", dock: null }],
    ["preferred_size", { mode: "screen", preferred_size: null }],
    ["preferred_position", { mode: "screen", preferred_position: null }],
    ["user_adjustable", { mode: "screen", user_adjustable: null }],
    ["anchor", { mode: "tile", anchor: null }]
  ];
  for (const [field, placement] of nullCases) {
    const producer = interfaceForPlacement(`r24-producer-null-${field}`, placement);
    assert.equal(producer.status, "HOLD", `${field}: exact Interface producer must reject authored null`);
    assert.equal(producer.holds[0].code, "HOLD_INVALID_PRESENTATION_PLACEMENT");

    const malformed = syntheticCandidate(`r24-null-${field}`, placement);
    const base = Base.run(assemblyRequest(`r24-base-null-${field}`, malformed));
    assert.equal(base.status, "CANDIDATE", `${field}: predecessor weakness must be reproduced, not assumed repaired`);

    const { hold } = headShapeHold(`r24-head-null-${field}`, malformed);
    assert.match(hold.detail, new RegExp(`presentation\\.${field}`));
  }

  // Attack every current mode, not only the producer's example. Dock belongs only to docked;
  // anchor belongs only to tile. Exact Interface and repaired Assembly must agree fail-closed.
  const modes = ["screen", "docked", "floating", "fullscreen", "embedded", "world", "tile"];
  for (const mode of modes.filter((item) => item !== "docked")) {
    const placement = { mode, dock: "left" };
    const producer = interfaceForPlacement(`r24-producer-dock-${mode}`, placement);
    assert.equal(producer.status, "HOLD", `${mode}: exact Interface must reject dock ownership drift`);
    assert.equal(producer.holds[0].code, "HOLD_INVALID_PRESENTATION_PLACEMENT");
    const malformed = syntheticCandidate(`r24-dock-${mode}`, placement);
    const base = Base.run(assemblyRequest(`r24-base-dock-${mode}`, malformed));
    assert.equal(base.status, "CANDIDATE", `${mode}: predecessor dock-ownership gap must be reproduced`);
    const { hold } = headShapeHold(`r24-head-dock-${mode}`, malformed);
    assert.match(hold.detail, /consumed only by docked/);
  }

  for (const mode of modes.filter((item) => item !== "tile")) {
    const placement = { mode, anchor: "mt_anchor" };
    const producer = interfaceForPlacement(`r24-producer-anchor-${mode}`, placement);
    assert.equal(producer.status, "HOLD", `${mode}: exact Interface must reject anchor ownership drift`);
    assert.equal(producer.holds[0].code, "HOLD_INVALID_PRESENTATION_PLACEMENT");
    const malformed = syntheticCandidate(`r24-anchor-${mode}`, placement);
    const base = Base.run(assemblyRequest(`r24-base-anchor-${mode}`, malformed));
    assert.equal(base.status, "CANDIDATE", `${mode}: predecessor anchor-ownership gap must be reproduced`);
    const { hold } = headShapeHold(`r24-head-anchor-${mode}`, malformed);
    assert.match(hold.detail, /consumed only by tile/);
  }

  // The repair explicitly scopes itself to v0.5. Re-label representative historical candidates
  // as v0.4 and prove exact predecessor equivalence instead of silently tightening old evidence.
  for (const [id, placement] of [
    ["legacy-null", { mode: "screen", preferred_size: null }],
    ["legacy-dock-owner", { mode: "screen", dock: "left" }],
    ["legacy-anchor-owner", { mode: "screen", anchor: "mt_anchor" }]
  ]) {
    const legacy = syntheticCandidate(`r24-${id}`, placement);
    legacy.machine.version = "0.2.0";
    legacy.candidate.schema = "morphtile.interface-operations/v0.4";
    const request = assemblyRequest(`r24-${id}`, legacy);
    const base = Base.run(request);
    const head = Head.run(request);
    assert.equal(base.status, "CANDIDATE", `${id}: historical compatibility control must remain accepted by predecessor`);
    assert.deepEqual(head, base, `${id}: v0.4 historical semantics must remain exact rather than being silently rewritten`);
  }

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-interface-presentation-contract-round24/v0.1",
    target_commit: ASSEMBLY36,
    predecessor_commit: ASSEMBLY_BASE,
    producer_commit: INTERFACE,
    status: "PASS",
    checked: [
      "exact-current-producer-positive-control",
      "genuine-omission-preserved",
      "false-zero-authorship-preserved",
      "all-five-authored-null-predecessor-gaps-reproduced-and-rejected",
      "dock-mode-ownership-across-full-current-mode-domain",
      "anchor-mode-ownership-across-full-current-mode-domain",
      "deterministic-replay",
      "caller-immutability",
      "legacy-v0.4-exact-predecessor-equivalence"
    ],
    placement: "ASSEMBLY_MACHINE_CURRENT_INTERFACE_PRESENTATION_GRAMMAR"
  }));
});
