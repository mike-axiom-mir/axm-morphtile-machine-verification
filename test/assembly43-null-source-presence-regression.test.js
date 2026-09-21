"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "c45f8305196d149362045cef339ff1634f9095fe";
const ASSEMBLY43 = "b927da470b6ee92a9ce64c2f5697896dd4e8180c";

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
    provenance: { caller: "verification-assembly43" }
  };
}

test("Assembly #43 still collapses authored null machine id into absence in compact warning provenance", { skip: !enabled }, () => {
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

  // Establish that this ambiguity predates #43 rather than fabricating a new regression.
  assert.equal(baseNull.warnings[0].machine, null);
  assert.equal(baseAbsent.warnings[0].machine, null);

  // #43 claims own-key presence is now the warning-source identity boundary and that
  // null is the warning-source sentinel only when no machine.id key was authored.
  // Those two authored states therefore must no longer collapse to the same compact
  // warning source representation. The current exact candidate still emits null for
  // both, so this assertion intentionally remains red until the producer owns a repair.
  assert.notDeepEqual(
    headNull.warnings[0],
    headAbsent.warnings[0],
    "authored machine.id:null is still indistinguishable from an absent id in UPSTREAM_WARNING compact provenance"
  );
});
