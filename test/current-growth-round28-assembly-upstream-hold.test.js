"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_BASE = "4b7f89f83dff90d07ab6e70b7b40e8623579bbf1";
const ASSEMBLY37 = "27e9dc30a5148b73f9ea76a72c400f20111656b1";

function clone(value) {
  return structuredClone(value);
}

function tileCandidate(id = "held_tile") {
  return {
    schema: "morphtile.tile-spec/v0.4",
    id,
    form_hints: ["game_asset"],
    facets: {}
  };
}

function requestWith(input, requestId) {
  return {
    envelope_version: "0.1",
    request_id: requestId,
    goal: "Preserve unresolved upstream HOLD evidence instead of granting candidate authority",
    intent: { id: "held_tile", name: "Held tile" },
    inputs: [input],
    provenance: { caller: "axm.morphtile.machine.verification.round28" }
  };
}

function candidateEnvelope(holds) {
  return {
    envelope_version: "0.1",
    request_id: "upstream-held-candidate",
    machine: { id: "axm.morphtile.machine.form", version: "test" },
    status: "CANDIDATE",
    candidate: tileCandidate(),
    holds
  };
}

function directFragment(holds) {
  return {
    ...tileCandidate(),
    holds
  };
}

function runPreserving(run, matter) {
  const before = clone(matter);
  const first = run(matter);
  assert.deepEqual(matter, before, "Assembly mutated caller-owned input");
  const replayMatter = clone(before);
  const replay = run(replayMatter);
  assert.deepEqual(replayMatter, before, "Assembly replay mutated caller-owned input");
  assert.deepEqual(replay, first, "same exact Assembly input did not replay deterministically");
  return first;
}

const enabled = !!process.env.R28_ASSEMBLY_BASE_ROOT && !!process.env.R28_ASSEMBLY37_ROOT;

function machines() {
  assert.equal(process.env.R28_ASSEMBLY_BASE_COMMIT, ASSEMBLY_BASE);
  assert.equal(process.env.R28_ASSEMBLY37_COMMIT, ASSEMBLY37);
  return {
    base: require(path.join(process.env.R28_ASSEMBLY_BASE_ROOT, "src")).run,
    head: require(path.join(process.env.R28_ASSEMBLY37_ROOT, "src")).run
  };
}

test("PR #37 closes the reproduced CANDIDATE-envelope HOLD-loss path and preserves exact evidence", { skip: !enabled }, () => {
  const { base, head } = machines();
  const upstreamHolds = [{ code: "HOLD_UPSTREAM_UNRESOLVED", detail: "producer still has an unresolved boundary" }];
  const matter = requestWith(candidateEnvelope(upstreamHolds), "r28-candidate-holds");

  const predecessor = runPreserving(base, clone(matter));
  assert.equal(predecessor.status, "CANDIDATE", "predecessor gap must be independently reproduced");

  const repaired = runPreserving(head, clone(matter));
  assert.equal(repaired.status, "HOLD");
  const hold = repaired.holds.find((item) => item.code === "HOLD_INPUT_CANDIDATE_HAS_HOLDS");
  assert.ok(hold, JSON.stringify(repaired.holds));
  assert.equal(hold.input, 0);
  assert.equal(hold.path, "request.inputs[0].holds");
  assert.deepEqual(hold.upstream_holds, upstreamHolds);
});

test("PR #37 closes the reproduced direct-fragment HOLD-loss path and preserves exact evidence", { skip: !enabled }, () => {
  const { base, head } = machines();
  const upstreamHolds = [{ code: "HOLD_DIRECT_UNRESOLVED", detail: "compatibility fragment still has a blocker" }];
  const matter = requestWith(directFragment(upstreamHolds), "r28-direct-holds");

  const predecessor = runPreserving(base, clone(matter));
  assert.equal(predecessor.status, "CANDIDATE", "predecessor direct-fragment gap must be independently reproduced");

  const repaired = runPreserving(head, clone(matter));
  assert.equal(repaired.status, "HOLD");
  const hold = repaired.holds.find((item) => item.code === "HOLD_INPUT_DIRECT_HAS_HOLDS");
  assert.ok(hold, JSON.stringify(repaired.holds));
  assert.equal(hold.input, 0);
  assert.equal(hold.path, "request.inputs[0].holds");
  assert.deepEqual(hold.upstream_holds, upstreamHolds);
});

test("empty HOLD collections and already-HOLD envelopes keep predecessor semantics", { skip: !enabled }, () => {
  const { base, head } = machines();

  const empty = requestWith(candidateEnvelope([]), "r28-empty-holds");
  assert.deepEqual(runPreserving(head, clone(empty)), runPreserving(base, clone(empty)),
    "explicitly empty holds changed compatibility semantics");

  const heldInput = candidateEnvelope([{ code: "HOLD_UPSTREAM_EXISTING", detail: "already held" }]);
  heldInput.status = "HOLD";
  const alreadyHeld = requestWith(heldInput, "r28-existing-hold-status");
  assert.deepEqual(runPreserving(head, clone(alreadyHeld)), runPreserving(base, clone(alreadyHeld)),
    "existing non-CANDIDATE envelope behavior changed");
});

test("accessor-shaped HOLD evidence is rejected at portability before semantic HOLD inspection", { skip: !enabled }, () => {
  const { head } = machines();
  let getterCalls = 0;
  const input = candidateEnvelope([]);
  Object.defineProperty(input, "holds", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return [{ code: "HOLD_ACCESSOR_SHOULD_NOT_RUN" }];
    }
  });
  const matter = requestWith(input, "r28-accessor-holds");
  const out = head(matter);
  assert.equal(getterCalls, 0, "portable boundary invoked an authored accessor");
  assert.equal(out.status, "HOLD");
  assert.ok(out.holds.some((item) => item.code === "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE"), JSON.stringify(out.holds));
});

test("authored malformed CANDIDATE holds containers must fail closed instead of disappearing", { skip: !enabled }, () => {
  const { head } = machines();
  const malformedHolds = { 0: { code: "HOLD_CORRUPTED_CONTAINER", detail: "array shape was corrupted upstream" } };
  const matter = requestWith(candidateEnvelope(malformedHolds), "r28-malformed-candidate-holds");
  const out = runPreserving(head, clone(matter));
  assert.equal(out.status, "HOLD",
    "authored non-array holds evidence must not be silently ignored while CANDIDATE authority is accepted");
});

test("authored malformed direct-fragment holds containers must fail closed instead of disappearing", { skip: !enabled }, () => {
  const { head } = machines();
  const malformedHolds = { blocker: { code: "HOLD_CORRUPTED_DIRECT_CONTAINER", detail: "direct HOLD container is malformed" } };
  const matter = requestWith(directFragment(malformedHolds), "r28-malformed-direct-holds");
  const out = runPreserving(head, clone(matter));
  assert.equal(out.status, "HOLD",
    "direct-fragment compatibility must not erase authored malformed holds evidence");
});
