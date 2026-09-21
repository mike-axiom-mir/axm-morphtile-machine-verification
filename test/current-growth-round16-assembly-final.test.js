"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_PR29_FINAL = "ff718341b7b69b23e117d9fb95e2a216a21f7b55";

function minimalTileCandidate(id) {
  return {
    schema: "morphtile.tile-spec/v0.4",
    id,
    name: "Verification tile",
    form_hints: ["game_asset"],
    facets: {
      mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } }
    }
  };
}

test("Assembly PR #29 final exact head: result provenance presence repair passes while source trace falsey loss remains explicit HOLD", () => {
  assert.equal(process.env.R16_ASSEMBLY_FINAL_COMMIT, ASSEMBLY_PR29_FINAL);
  const Assembly = require(path.join(process.env.R16_ASSEMBLY_FINAL_ROOT, "src"));

  for (const provenance of [null, false, 0, ""]) {
    const authored = {
      envelope_version: "0.1",
      request_id: `r16-assembly-final-${String(provenance)}`,
      goal: "exact-head result provenance replay",
      intent: { id: "mt_result_provenance" },
      inputs: [],
      provenance
    };
    const before = JSON.stringify(authored);
    const first = Assembly.run(authored);
    const second = Assembly.run(authored);
    assert.equal(first.status, "HOLD");
    assert.equal(first.holds[0].code, "HOLD_NO_CANDIDATES");
    assert.deepEqual(first.provenance, provenance, "falsey authored request provenance must survive result HOLD exactly");
    assert.deepEqual(first, second, "final-head HOLD must replay deterministically");
    assert.equal(JSON.stringify(authored), before, "final head must not mutate caller-owned request");
  }

  const absent = {
    envelope_version: "0.1",
    request_id: "r16-assembly-final-absent",
    goal: "genuine absence control",
    intent: { id: "mt_result_provenance" },
    inputs: []
  };
  const absentOut = Assembly.run(absent);
  assert.equal(absentOut.status, "HOLD");
  assert.deepEqual(absentOut.provenance, {}, "only genuine absence may select the result provenance default");

  const traceRequest = {
    envelope_version: "0.1",
    request_id: "r16-assembly-final-trace-hold",
    goal: "keep separate source trace truthiness defect visible",
    intent: { id: "mt_trace" },
    inputs: [{
      envelope_version: "0.1",
      request_id: "upstream-trace-source",
      machine: { id: "verification.upstream", version: "0" },
      status: "CANDIDATE",
      candidate: minimalTileCandidate("mt_trace"),
      dependencies: [],
      warnings: [],
      holds: [],
      provenance: false
    }],
    provenance: false
  };
  const traceOut = Assembly.run(traceRequest);
  assert.equal(traceOut.status, "CANDIDATE", JSON.stringify(traceOut.holds));
  assert.equal(traceOut.provenance, false, "result-envelope repair must preserve top-level false provenance");
  assert.equal(traceOut.source_provenance[0].provenance, null, "separate upstream source trace truthiness defect must remain visible, not silently reclassified as fixed");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-final-provenance-round16/v0.1",
    target_commit: ASSEMBLY_PR29_FINAL,
    status: "PASS_WITH_SEPARATE_HOLD",
    checked: [
      "null-result-provenance",
      "false-result-provenance",
      "zero-result-provenance",
      "empty-string-result-provenance",
      "genuine-absence-default",
      "deterministic-source-preserving-hold",
      "separate-source-provenance-loss-still-reproduces"
    ],
    remaining_hold: "ASSEMBLY_SOURCE_PROVENANCE_PRESENCE_SEMANTICS",
    placement: "ASSEMBLY_MACHINE"
  }));
});
