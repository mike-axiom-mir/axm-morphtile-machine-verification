"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const CORE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const FORM_BASE = "92757ca5ff9790e85537c07e7c8e4a27b54cebae";
const FORM_PR38 = "04491c0eabf9333990bc7ae541b1f3a77139fb12";

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "independent Verification Machine round 27 replay",
    intent,
    provenance: { caller: "axm.morphtile.machine.verification" }
  };
}

function firstTarget(out) {
  return out.candidate.facets.mesh.data.parts[0].body[0];
}

const enabled = !!process.env.R27_FORM_BASE_ROOT && !!process.env.R27_FORM38_ROOT && !!process.env.R27_CORE_PATH;

test("Form PR #38: shared repeat linear finite-domain proof preserves owning contracts and real receiver effects", { skip: !enabled }, () => {
  assert.equal(process.env.R27_FORM_BASE_COMMIT, FORM_BASE);
  assert.equal(process.env.R27_FORM38_COMMIT, FORM_PR38);
  assert.equal(process.env.R27_CORE_COMMIT, CORE);

  const Base = require(path.join(process.env.R27_FORM_BASE_ROOT, "src"));
  const Head = require(path.join(process.env.R27_FORM38_ROOT, "src"));
  const HeadProgression = require(path.join(process.env.R27_FORM38_ROOT, "src", "repeat-progression.js"));
  const MT = require(path.resolve(process.env.R27_CORE_PATH));

  assert.equal(typeof HeadProgression.proveFiniteLinear, "function");

  // Attack the new helper itself beyond the producer's focused examples: first
  // non-finite generated state must win before semantic validation is invoked.
  const seen = [];
  const halfMax = Number.MAX_VALUE / 2;
  assert.deepEqual(
    HeadProgression.proveFiniteLinear(4, halfMax, halfMax, (value, index) => {
      seen.push([value, index]);
      return null;
    }),
    { ok: false, reason: "nonfinite", index: 2 }
  );
  assert.deepEqual(seen.map((entry) => entry[1]), [0, 1], "validator must not run for a non-finite generated value");

  // The helper must keep owning-domain detail and callback index intact rather
  // than flattening specialist semantics into a generic numeric rule.
  assert.deepEqual(
    HeadProgression.proveFiniteLinear(5, 3, -1, (value, index) => value <= 0 ? { value, index, owner: "verification" } : null),
    { ok: false, reason: "domain", index: 3, detail: { value: 0, index: 3, owner: "verification" } }
  );
  assert.deepEqual(
    HeadProgression.proveFiniteLinear(4, 2, -0.25, () => false),
    { ok: true },
    "false validator results must retain the established proveFiniteRepeat no-HOLD meaning"
  );

  const cases = [
    {
      id: "rotation",
      intent: {
        repeat: {
          count: 4,
          step: [0.2, 0.6, 0],
          rot_step: [0, 0.35, 0],
          part: { shape: "box", size: [1, 0.3, 0.5], pos: [1, 0, 0], rot: [0, 0.1, 0] }
        }
      }
    },
    {
      id: "size",
      intent: {
        repeat: {
          count: 4,
          step: [0, 1.1, 0],
          size_step: [0.2, -0.05, 0],
          part: { shape: "box", size: [1, 0.8, 0.5] }
        }
      }
    },
    {
      id: "scale-scalar",
      intent: {
        repeat: {
          count: 4,
          step: [1.8, 0, 0],
          scale_step: 0.15,
          instance: { use: "panel", scale: 0.6 }
        }
      }
    },
    {
      id: "scale-vector",
      intent: {
        repeat: {
          count: 4,
          step: [1.8, 0, 0],
          scale_step: [0.15, -0.05, 0],
          instance: { use: "panel", scale: [0.6, 1.1, 0.9] }
        }
      }
    }
  ];

  const outputs = new Map();
  for (const item of cases) {
    const input = request(`r27-${item.id}`, item.intent);
    const before = JSON.stringify(input);
    const base = Base.run(input);
    const head = Head.run(input);
    assert.equal(head.status, "CANDIDATE", `${item.id}: ${JSON.stringify(head.holds)}`);
    assert.deepEqual(head, base, `${item.id}: convergence must preserve exact public output`);
    assert.deepEqual(Head.run(input), head, `${item.id}: replay must remain deterministic`);
    assert.equal(JSON.stringify(input), before, `${item.id}: caller matter must remain unchanged`);
    outputs.set(item.id, head);
  }

  // First-overflow location and target-owned HOLD text must stay exactly the
  // same through all three migrated specialist lanes.
  const overflowCases = [
    {
      id: "rotation-overflow",
      intent: { repeat: { count: 3, step: [1, 0, 0], rot_step: [halfMax, 0, 0], part: { shape: "box", rot: [halfMax, 0, 0] } } }
    },
    {
      id: "size-overflow",
      intent: { repeat: { count: 3, step: [1, 0, 0], size_step: [halfMax, 0, 0], part: { shape: "box", size: [halfMax, 1, 1] } } }
    },
    {
      id: "scale-overflow",
      intent: { repeat: { count: 3, step: [1, 0, 0], scale_step: halfMax, instance: { use: "panel", scale: halfMax } } }
    }
  ];
  for (const item of overflowCases) {
    const input = request(`r27-${item.id}`, item.intent);
    const base = Base.run(input);
    const head = Head.run(input);
    assert.equal(head.status, "HOLD", item.id);
    assert.equal(head.holds[0].code, "HOLD_FORM_REPEAT_INVALID", item.id);
    assert.match(head.holds[0].detail, /non-finite generated value/, item.id);
    assert.deepEqual(head, base, `${item.id}: exact predecessor HOLD semantics must survive helper convergence`);
  }

  const sizeDomain = request("r27-size-domain", {
    repeat: {
      count: 4,
      step: [1, 0, 0],
      size_step: [-0.5, 0, 0],
      part: { shape: "box", size: [1, 1, 1] }
    }
  });
  const sizeDomainBase = Base.run(sizeDomain);
  const sizeDomainHead = Head.run(sizeDomain);
  assert.equal(sizeDomainHead.status, "HOLD");
  assert.deepEqual(sizeDomainHead, sizeDomainBase, "primitive-size positivity/HOLD wording remains owned by repeat-size");

  const scaleDomain = request("r27-scale-domain", {
    repeat: {
      count: 4,
      step: [1, 0, 0],
      scale_step: -0.5,
      instance: { use: "panel", scale: 1 }
    }
  });
  const scaleDomainBase = Base.run(scaleDomain);
  const scaleDomainHead = Head.run(scaleDomain);
  assert.equal(scaleDomainHead.status, "HOLD");
  assert.deepEqual(scaleDomainHead, scaleDomainBase, "definition-scale positivity/HOLD wording remains owned by repeat-scale");

  function worldFor(candidate) {
    const world = MT.createWorld("Verification round 27");
    world.defs = {
      panel: {
        id: "panel",
        name: "Verification panel",
        body: {
          facets: {
            mesh: { type: "primitive", source: null, data: { shape: "box", size: [1, 1, 1] } },
            material: { type: "primitive", source: null, data: { color: [0.7, 0.7, 0.9] } }
          }
        }
      }
    };
    const tile = MT.createTile(candidate);
    world.tiles[tile.id] = tile;
    return { world, tile };
  }

  function compile(candidate) {
    const { world, tile } = worldFor(candidate);
    const validation = MT.validateTile(tile);
    assert.equal(validation.ok, true, JSON.stringify(validation));
    return MT.compileMesh(tile, world);
  }

  // Real receiver proof: each migrated public lane must still change geometry,
  // not merely emit an expression that looks plausible.
  for (const id of ["rotation", "size", "scale-scalar", "scale-vector"]) {
    const changing = outputs.get(id);
    const fixedCandidate = JSON.parse(JSON.stringify(changing.candidate));
    const target = firstTarget({ candidate: fixedCandidate });
    if (id === "rotation") target.rot = [0, 0.1, 0];
    if (id === "size") target.size = [1, 0.8, 0.5];
    if (id === "scale-scalar") target.scale = 0.6;
    if (id === "scale-vector") target.scale = [0.6, 1.1, 0.9];

    const changedMesh = compile(changing.candidate);
    const fixedMesh = compile(fixedCandidate);
    assert.equal(changedMesh.hold, null, `${id}: ${JSON.stringify(changedMesh)}`);
    assert.equal(fixedMesh.hold, null, `${id}: fixed ${JSON.stringify(fixedMesh)}`);
    assert.ok(changedMesh.P.length > 0 && changedMesh.P.every(Number.isFinite), `${id}: finite receiver geometry`);
    assert.notDeepEqual(changedMesh.P, fixedMesh.P, `${id}: MorphTile must consume the migrated progression`);
  }

  console.log(JSON.stringify({
    schema: "axm.morphtile.verification/form-repeat-linear-domain-round27/v0.1",
    target_commit: FORM_PR38,
    predecessor_commit: FORM_BASE,
    receiver_commit: CORE,
    status: "PASS",
    checked: [
      "helper-first-nonfinite-order",
      "helper-owner-domain-detail-and-index",
      "helper-false-validator-compatibility",
      "rotation-public-output-equivalence",
      "size-public-output-equivalence",
      "scalar-scale-public-output-equivalence",
      "vector-scale-public-output-equivalence",
      "target-owned-overflow-hold-equivalence",
      "target-owned-positive-domain-hold-equivalence",
      "deterministic-replay",
      "caller-immutability",
      "real-core-rotation-effect",
      "real-core-size-effect",
      "real-core-scalar-scale-effect",
      "real-core-vector-scale-effect"
    ],
    placement: "FORM_MACHINE_REPEAT_LINEAR_FINITE_DOMAIN_CONVERGENCE"
  }));
});
