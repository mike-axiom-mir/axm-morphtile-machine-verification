"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const INTERFACE_BASE = "58ccd3e05e63f18e9ad081a75bbce5e78edd28c8";
const INTERFACE38 = "b1b37b28204ecf81623eb5d0caca7dc7aa8186f9";
const ASSEMBLY = "c45f8305196d149362045cef339ff1634f9095fe";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";

const enabled = !!process.env.R39_INTERFACE_BASE_ROOT && !!process.env.R39_INTERFACE38_ROOT && !!process.env.R39_ASSEMBLY_ROOT && !!process.env.R39_MORPHTILE_ROOT;
const clone = (value) => JSON.parse(JSON.stringify(value));

function request(id, readout, control, action) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Verify capability-classed Interface authority",
    intent: {
      tile_path: "mt_tower",
      title: "Independent namespace proof",
      elements: [
        { kind: "readout", binding: readout, label: "Readout" },
        { kind: "control", binding: control, label: "Control" },
        { kind: "action", binding: action, label: "Action" }
      ],
      bindings: {
        readouts: [readout],
        controls: [control],
        actions: [action]
      }
    },
    provenance: { verifier: "round39" }
  };
}

function exactRun(Base, Head, input, label) {
  const baseInput = clone(input);
  const headInput = clone(input);
  const before = JSON.stringify(headInput);
  const expected = Base.run(baseInput);
  const actual = Head.run(headInput);
  assert.deepEqual(actual, expected, `${label}: evidence-only candidate changed Interface runtime output`);
  assert.deepEqual(Head.run(headInput), actual, `${label}: replay drifted`);
  assert.equal(JSON.stringify(headInput), before, `${label}: caller input mutated`);
  return actual;
}

test("Interface #38 exact head keeps symbolic namespaces disjoint through current Assembly/Core receiver", { skip: !enabled }, () => {
  assert.equal(process.env.R39_INTERFACE_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.R39_INTERFACE38_COMMIT, INTERFACE38);
  assert.equal(process.env.R39_ASSEMBLY_COMMIT, ASSEMBLY);
  assert.equal(process.env.R39_MORPHTILE_COMMIT, MORPHTILE);

  const Base = require(path.join(process.env.R39_INTERFACE_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R39_INTERFACE38_ROOT, "src"));
  const { resolveInterfaceTargetProof } = require(path.join(process.env.R39_ASSEMBLY_ROOT, "src", "kit.js"));
  const MT = require(path.join(process.env.R39_MORPHTILE_ROOT, "core", "morphtile.js"));
  const world = MT.seedWorld();
  const target = world.tiles.mt_tower;
  const binding = { id: "mt_tower", path: "mt_tower" };

  const valid = exactRun(Base, Head, request("r39-interface-valid", "beacon", "levels", "toggle"), "valid authority classes");
  assert.equal(valid.status, "CANDIDATE", JSON.stringify(valid.holds));
  const validProof = resolveInterfaceTargetProof(valid.dependencies[0], target, binding, MT, world);
  assert.equal(validProof.status, "SATISFIED", JSON.stringify(validProof));
  assert.deepEqual(validProof.proven.readout_logic_vars, ["beacon"]);
  assert.deepEqual(validProof.proven.control_param_ids, ["levels"]);
  assert.deepEqual(validProof.proven.action_input_signal_socket_ids, ["toggle"]);

  const cases = [
    {
      id: "wrong-readout",
      req: request("r39-wrong-readout", "levels", "levels", "toggle"),
      field: "readout_logic_vars",
      value: "levels"
    },
    {
      id: "wrong-control",
      req: request("r39-wrong-control", "beacon", "beacon", "toggle"),
      field: "control_param_ids",
      value: "beacon"
    },
    {
      id: "wrong-action",
      req: request("r39-wrong-action", "beacon", "levels", "lit"),
      field: "action_input_signal_socket_ids",
      value: "lit"
    }
  ];

  for (const item of cases) {
    const authored = exactRun(Base, Head, item.req, item.id);
    assert.equal(authored.status, "CANDIDATE", `${item.id}: producer remains symbolic and target-agnostic`);
    const proof = resolveInterfaceTargetProof(authored.dependencies[0], target, binding, MT, world);
    assert.equal(proof.status, "UNSATISFIED", `${item.id}: wrong authority class must not satisfy by name existence`);
    assert.deepEqual(proof.missing[item.field], [item.value], `${item.id}: missing receipt must identify the requested authority class`);
    for (const other of ["readout_logic_vars", "control_param_ids", "action_input_signal_socket_ids"]) {
      if (other === item.field) continue;
      assert.deepEqual(proof.missing[other] || [], [], `${item.id}: valid sibling authority classes must remain satisfied`);
    }
  }

  const crossed = exactRun(Base, Head, request("r39-all-crossed", "levels", "beacon", "lit"), "all classes crossed");
  const crossedProof = resolveInterfaceTargetProof(crossed.dependencies[0], target, binding, MT, world);
  assert.equal(crossedProof.status, "UNSATISFIED");
  assert.deepEqual(crossedProof.missing, {
    readout_logic_vars: ["levels"],
    control_param_ids: ["beacon"],
    action_input_signal_socket_ids: ["lit"]
  });
});
