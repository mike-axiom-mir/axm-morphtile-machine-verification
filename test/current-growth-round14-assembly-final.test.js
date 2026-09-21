"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const ASSEMBLY_PR27 = "d3c8f5e3469b3b91f9e9eb7535ffbab00ce755f0";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function firstHold(value) {
  if (value && Array.isArray(value.holds) && value.holds[0]) return value.holds[0];
  if (value && value.hold && typeof value.hold === "object") return value.hold;
  return value || null;
}

const hasAssembly = !!process.env.R14A_ASSEMBLY_ROOT;
test("Assembly PR #27 final exact head: own-key grammar remains deterministic and Proxy-safe after documentation-only head move", { skip: !hasAssembly }, () => {
  assert.equal(process.env.R14A_ASSEMBLY_COMMIT, ASSEMBLY_PR27);
  const Assembly = require(path.join(process.env.R14A_ASSEMBLY_ROOT, "src"));
  const base = require(path.join(process.env.R14A_ASSEMBLY_ROOT, "fixtures", "request.assembly.json"));

  const one = clone(base);
  one.request_id = "r14a-assembly-unknown-order";
  one.zeta_extension = "z";
  one.alpha_extension = "a";
  const two = clone(base);
  two.request_id = "r14a-assembly-unknown-order";
  two.alpha_extension = "a";
  two.zeta_extension = "z";
  const outOne = Assembly.run(one);
  const outTwo = Assembly.run(two);
  assert.equal(outOne.status, "HOLD");
  assert.deepEqual(outOne, outTwo, "unsupported request-key HOLD selection must be deterministic across insertion order");
  assert.deepEqual(firstHold(outOne), {
    code: "HOLD_REQUEST_FIELD_UNSUPPORTED",
    path: "request.alpha_extension",
    detail: "Assembly v0.1 request grammar does not define this authored field."
  });

  const symbolIntent = clone(base);
  symbolIntent.request_id = "r14a-assembly-symbol-intent";
  const symbol = Symbol("future-intent-authority");
  symbolIntent.intent[symbol] = "nearest";
  const symbolOut = Assembly.run(symbolIntent);
  assert.equal(symbolOut.status, "HOLD");
  assert.deepEqual(firstHold(symbolOut), {
    code: "HOLD_REQUEST_INTENT_FIELD_UNSUPPORTED",
    path: "request.intent",
    detail: "Assembly v0.1 request.intent grammar does not define symbol-keyed authored fields."
  });
  assert.equal(symbolIntent.intent[symbol], "nearest", "Assembly must not rewrite caller-owned symbol data");

  const revokedIntent = clone(base);
  revokedIntent.request_id = "r14a-assembly-revoked-intent";
  const pair = Proxy.revocable(clone(base.intent), {});
  revokedIntent.intent = pair.proxy;
  pair.revoke();
  let revokedOut;
  assert.doesNotThrow(() => { revokedOut = Assembly.run(revokedIntent); }, "Proxy rejection must precede exact-own-key reflection on nested request.intent");
  assert.equal(revokedOut.status, "HOLD");
  assert.equal(firstHold(revokedOut).code, "HOLD_ASSEMBLY_INPUT_NONPORTABLE_VALUE");
  assert.equal(firstHold(revokedOut).path, "request.intent");

  const control = clone(base);
  control.request_id = "r14a-assembly-exact-control";
  control.intent.id = "proof_tile";
  control.intent.tile_path = "proof_tile";
  control.dependencies = [];
  control.world_requirements = null;
  const before = JSON.stringify(control);
  const first = Assembly.run(control);
  const second = Assembly.run(control);
  assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
  assert.deepEqual(first, second, "exact v0.1 request control must replay deterministically");
  assert.equal(JSON.stringify(control), before, "Assembly must not mutate exact caller-owned request data");

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/assembly-request-own-keys-round14-final/v0.1",
    target_commit: ASSEMBLY_PR27,
    status: "PASS",
    checked: [
      "final-exact-head-replay",
      "unsupported-request-key-selection-is-lexically-deterministic",
      "nested-intent-symbol-key-held",
      "nested-revoked-proxy-rejected-before-reflection",
      "exact-v01-control-remains-candidate",
      "deterministic-source-preserving-control"
    ],
    visual_quality: "NOT_APPLICABLE",
    placement: "ASSEMBLY_MACHINE"
  }));
});
