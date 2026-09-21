"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const INTERFACE_BASE = "b5d88226f9e3482825d0e26984da630d1780a5ea";
const INTERFACE30 = "f78355d9212cc15abb4535edfdd370225ffaaee5";
const ASSEMBLY = "4b7f89f83dff90d07ab6e70b7b40e8623579bbf1";

function clone(value) {
  return structuredClone(value);
}

function request() {
  return {
    envelope_version: "0.1",
    request_id: "r26-interface-presentation",
    goal: "Author exact current presentation matter while preserving receiver-owned defaults",
    intent: {
      tile_path: "mt_shell/mt_inner",
      title: "Receiver presentation proof",
      elements: [{ kind: "text", text: "Placement proof" }],
      placement: {
        mode: "docked",
        preferred_position: [0, 0],
        user_adjustable: false
      }
    },
    provenance: { caller: "axm.morphtile.machine.verification.round26" }
  };
}

function uiEligibility() {
  return {
    candidate: {
      schema: "morphtile.tile-spec/v0.4",
      form_hints: ["ui_panel"],
      facets: {}
    },
    provenance: { caller: "r26-explicit-ui-eligibility" }
  };
}

function exactRun(machine, matter) {
  const firstInput = clone(matter);
  const secondInput = clone(matter);
  const firstBefore = clone(firstInput);
  const secondBefore = clone(secondInput);
  const first = machine.run(firstInput);
  const second = machine.run(secondInput);
  assert.deepEqual(firstInput, firstBefore, "first Interface replay mutated caller matter");
  assert.deepEqual(secondInput, secondBefore, "second Interface replay mutated caller matter");
  assert.deepEqual(second, first, "same exact Interface input must replay deterministically");
  return first;
}

const enabled = !!process.env.R26_INTERFACE_BASE_ROOT
  && !!process.env.R26_INTERFACE30_ROOT
  && !!process.env.R26_ASSEMBLY_ROOT;

test("Interface PR #30 re-proves the current Assembly presentation boundary without runtime drift", { skip: !enabled }, () => {
  assert.equal(process.env.R26_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R26_INTERFACE30_COMMIT, INTERFACE30);
  assert.equal(process.env.R26_ASSEMBLY_COMMIT, ASSEMBLY);

  const Base = require(path.join(process.env.R26_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R26_INTERFACE30_ROOT, "src"));
  const { run: assemble } = require(path.resolve(process.env.R26_ASSEMBLY_ROOT, "src"));

  const matter = request();
  const base = exactRun(Base, matter);
  const head = exactRun(Head, matter);
  assert.deepEqual(head, base, "evidence-only Interface candidate changed public runtime output");
  assert.equal(head.status, "CANDIDATE", JSON.stringify(head.holds));
  assert.equal(head.candidate.schema, "morphtile.interface-operations/v0.5");

  const presentation = head.candidate.operations[1].presentation;
  assert.deepEqual(presentation, {
    mode: "docked",
    preferred_position: [0, 0],
    user_adjustable: false
  });
  assert.equal(Object.prototype.hasOwnProperty.call(presentation, "dock"), false,
    "receiver-owned dock omission must remain an omission");

  const assembled = assemble({
    envelope_version: "0.1",
    request_id: "r26-assembly-presentation-contract",
    goal: "Fold exact Interface presentation matter without inventing receiver defaults",
    intent: { id: "mt_inner", tile_path: "mt_shell/mt_inner", name: "Nested receiver proof" },
    inputs: [uiEligibility(), head],
    provenance: { caller: "axm.morphtile.machine.verification.round26" }
  });

  assert.equal(assembled.status, "CANDIDATE", JSON.stringify(assembled.holds));
  assert.deepEqual(assembled.candidate.presentation, presentation,
    "Assembly receiver changed omission/false/zero presentation semantics");
  assert.deepEqual(assembled.dependencies, head.dependencies,
    "Assembly receiver changed Interface target-proof dependencies");

  const pins = JSON.parse(fs.readFileSync(
    path.join(process.env.R26_INTERFACE30_ROOT, "fixtures", "integration-sources.json"),
    "utf8"
  ));
  assert.equal(pins.assembly.commit, ASSEMBLY,
    "Interface candidate must pin the exact Assembly receiver independently replayed here");
});
