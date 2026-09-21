"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "21d87499e162da2b583959b8344d4c8ec80be74a";
const ASSEMBLY43 = "08a11e78ab6d4d8bc267b4fd70ec0a846edc51da";

const enabled = !!process.env.A43_ASSEMBLY_BASE_ROOT && !!process.env.A43_ASSEMBLY43_ROOT;

function request(authoredNull) {
  const machine = { version: "fixture" };
  if (authoredNull) machine.id = null;
  return {
    envelope_version: "0.1",
    request_id: "verification-assembly43-null-source-presence",
    goal: "Preserve authored warning-source presence separately from absence",
    inputs: [
      {
        envelope_version: "0.1",
        request_id: "upstream-warning-source",
        machine,
        status: "CANDIDATE",
        warnings: [
          { code: "UPSTREAM_FIXTURE_WARNING", detail: "authored source presence must remain distinguishable" }
        ],
        candidate: {
          schema: "morphtile.tile-spec/v0.4",
          form_hints: [],
          facets: {}
        }
      }
    ],
    provenance: { caller: "verification-assembly43-current-head" }
  };
}

test("Assembly #43 current exact head still collapses authored null machine id into absence in compact warning provenance", { skip: !enabled }, () => {
  assert.equal(process.env.A43_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.A43_ASSEMBLY43_COMMIT, ASSEMBLY43);

  const Base = require(path.join(process.env.A43_ASSEMBLY_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.A43_ASSEMBLY43_ROOT, "src"));

  const authoredNullInput = request(true);
  const absentInput = request(false);
  const nullBefore = JSON.stringify(authoredNullInput);
  const absentBefore = JSON.stringify(absentInput);

  const baseNull = Base.run(authoredNullInput);
  const baseAbsent = Base.run(absentInput);
  const headNull = Head.run(authoredNullInput);
  const headAbsent = Head.run(absentInput);
  const headNullReplay = Head.run(authoredNullInput);

  assert.equal(baseNull.status, "CANDIDATE");
  assert.equal(baseAbsent.status, "CANDIDATE");
  assert.equal(headNull.status, "CANDIDATE");
  assert.equal(headAbsent.status, "CANDIDATE");
  assert.deepEqual(headNullReplay, headNull, "candidate replay changed");
  assert.equal(JSON.stringify(authoredNullInput), nullBefore, "authored-null input mutated");
  assert.equal(JSON.stringify(absentInput), absentBefore, "absent-id input mutated");

  assert.equal(Object.prototype.hasOwnProperty.call(headNull.source_provenance[0].machine, "id"), true,
    "full source provenance must retain authored null presence");
  assert.equal(headNull.source_provenance[0].machine.id, null);
  assert.equal(Object.prototype.hasOwnProperty.call(headAbsent.source_provenance[0].machine, "id"), false,
    "full source provenance must distinguish true absence");

  // Establish that the ambiguity is inherited rather than fabricated by this converged head.
  assert.equal(baseNull.warnings[0].machine, null);
  assert.equal(baseAbsent.warnings[0].machine, null);

  // #43 claims own-key presence is now the compact warning-source identity boundary and
  // that null is the absence sentinel. Authored null and true absence therefore must not
  // collapse to the same compact warning representation. This assertion intentionally
  // remains red until Assembly owns a policy/representation repair.
  assert.notDeepEqual(
    headNull.warnings[0],
    headAbsent.warnings[0],
    "authored machine.id:null is still indistinguishable from an absent id in UPSTREAM_WARNING compact provenance"
  );
});
