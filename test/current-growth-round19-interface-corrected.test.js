"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const INTERFACE_BASE = "8516da3a414c416ec1f76b1078901c56c49b04db";
const INTERFACE_PR27 = "55f9ea7e96db0c65c7440550c9f4a7800facd34e";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 19 corrected interface replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function commitInterface(MT, ws, output, label) {
  const candidate = MT.cloneBody(ws, "verification", label);
  const operations = output.candidate.operations || [output.candidate.operation];
  for (const operation of operations) {
    const edited = MT.editCandidate(ws, candidate, operation);
    assert.equal(edited.ok, true, edited.error || JSON.stringify(edited));
  }
  const plan = MT.planMerge(ws, [candidate]);
  assert.equal(plan.status, "READY", JSON.stringify(plan));
  const committed = MT.commitPlan(ws, plan.id, "verification");
  assert.equal(committed.ok, true, JSON.stringify(committed));
  return committed;
}

function findVNode(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of node.children || []) {
    const found = findVNode(child, predicate);
    if (found) return found;
  }
  return null;
}

const enabled = !!process.env.R19_INTERFACE_BASE_ROOT && !!process.env.R19_INTERFACE27_ROOT && !!process.env.R19_CORE_PATH;
test("Interface PR #27 corrected: placement presence, receiver-owned render default, read-only resolution and rollback", { skip: !enabled }, () => {
  assert.equal(process.env.R19_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R19_INTERFACE27_COMMIT, INTERFACE_PR27);
  assert.equal(process.env.R19_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R19_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R19_INTERFACE27_ROOT, "src"));
  const MT = require(path.resolve(process.env.R19_CORE_PATH));

  const cases = [
    ["dock", { mode: "docked", dock: null }],
    ["preferred_size", { mode: "screen", preferred_size: null }],
    ["preferred_position", { mode: "screen", preferred_position: null }],
    ["user_adjustable", { mode: "screen", user_adjustable: null }],
    ["anchor", { mode: "tile", anchor: null }]
  ];

  for (const [field, placement] of cases) {
    const authored = request(`r19-interface-null-${field}`, {
      tile_path: "mt_tower",
      title: "Null placement proof",
      text: "placement source-integrity proof",
      placement
    });
    const before = JSON.stringify(authored);
    const baseline = Base.run(authored);
    const candidate = Head.run(authored);
    assert.equal(baseline.status, "CANDIDATE", `${field}: integrated predecessor must demonstrate the repaired null-admission bug`);
    assert.equal(candidate.status, "HOLD", `${field}: explicit null must not survive as pseudo-absence`);
    assert.equal(candidate.candidate, null);
    assert.equal(candidate.holds[0].code, "HOLD_INVALID_PRESENTATION_PLACEMENT");
    assert.match(candidate.holds[0].detail, new RegExp(`placement\\.${field}`));
    assert.equal(JSON.stringify(authored), before, `${field}: caller matter must remain unchanged`);
    assert.deepEqual(Head.run(authored), candidate, `${field}: replay must be deterministic`);
  }

  const explicitFalse = request("r19-interface-explicit-false-zero", {
    tile_path: "mt_tower",
    title: "Explicit portable placement values",
    text: "False and zero are authored values",
    placement: { mode: "screen", user_adjustable: false, preferred_position: [0, 0] }
  });
  const explicitOut = Head.run(explicitFalse);
  assert.equal(explicitOut.status, "CANDIDATE", JSON.stringify(explicitOut.holds));
  assert.deepEqual(explicitOut.candidate.operations[1].presentation, {
    mode: "screen",
    preferred_position: [0, 0],
    user_adjustable: false
  });

  const omitted = request("r19-interface-omitted-dock", {
    tile_path: "mt_tower",
    title: "Native dock default",
    text: "No producer-side dock default",
    placement: { mode: "docked" }
  });
  const out = Head.run(omitted);
  assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
  assert.deepEqual(out.candidate.operations[1].presentation, { mode: "docked" });

  const ws = MT.createWorkspace(MT.seedWorld());
  const beforeHash = MT.structHash(ws.live);
  const committed = commitInterface(MT, ws, out, "r19-interface-placement-corrected");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, { mode: "docked" }, "canonical matter must preserve genuine omission");
  const canonicalHash = MT.hashOf(ws.live);

  const resolved = MT.resolvePresentation(ws.live, "mt_tower");
  assert.equal(resolved.status, "READY", JSON.stringify(resolved));
  assert.deepEqual(resolved.resolved, { mode: "docked" }, "resolution preserves canonical omission rather than materializing a dock value");
  assert.equal(MT.hashOf(ws.live), canonicalHash, "resolution must be structurally read-only");

  const panel = MT.compilePanel(ws.live);
  const tower = findVNode(panel.vnode || panel, (node) => node.tile === "mt_tower" && typeof node.cls === "string" && node.cls.includes("mt-p-docked"));
  assert.ok(tower, "real core panel must render mt_tower in docked presentation mode");
  const tag = findVNode(tower, (node) => typeof node.cls === "string" && node.cls.includes("mt-presentation-tag"));
  assert.ok(tag, "real core panel must expose its presentation tag");
  assert.equal(tag.text, "docked right", "receiver render owns the omitted-dock default while canonical matter remains omission");
  assert.deepEqual(ws.live.tiles.mt_tower.presentation, { mode: "docked" });
  assert.equal(MT.hashOf(ws.live), canonicalHash, "rendering must remain structurally read-only");

  const rollback = MT.rollback(ws, committed.receipt.rollback_token);
  assert.ok(rollback.ok && rollback.exact, JSON.stringify(rollback));
  assert.equal(MT.structHash(ws.live), beforeHash);

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/interface-placement-presence-round19-corrected/v0.1",
    target_commit: INTERFACE_PR27,
    predecessor_commit: INTERFACE_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "predecessor-demonstrates-null-admission",
      "all-five-null-placement-fields-fail-closed",
      "deterministic-source-preserving-replay",
      "false-and-zero-remain-authored-values",
      "genuine-omission-stays-omitted",
      "resolve-preserves-omission-read-only",
      "receiver-render-default-docked-right",
      "render-read-only",
      "exact-rollback"
    ],
    historical_verifier_failure: "run 35578932341 incorrectly expected resolvePresentation to materialize dock=right; core actually applies that default only while rendering",
    visual_quality: "NOT_TESTED",
    placement: "INTERFACE_MACHINE_AUTHORSHIP_CORE_RENDER_DEFAULT"
  }));
});
