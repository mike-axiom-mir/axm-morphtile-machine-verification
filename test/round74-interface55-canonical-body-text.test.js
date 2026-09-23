"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const INTERFACE_BASE = "8c0559abfd705cd7437b94f5840902933eb3ec47";
const INTERFACE_HEAD = "7299b580d700c32ec03a30d7a682dbbfc0be4964";
const CORE = "685df074701feeae3e9d789e532d0a3658030bf4";
const DECLARED_ASSEMBLY = "726fb4ad8efc4068bcda0c2c3d5e3873335b280e";
const CURRENT_ASSEMBLY = "ac4a7d4234a8b92eb06fd10d4ceb15dd393daefa";

const EXPECTED_DIFF = [
  "INTEGRATION.md",
  "machine.json",
  "package.json",
  "src/index.js",
  "src/interface-intent.js",
  "test/canonical-body-text.integration.test.js",
  "test/canonical-body-text.test.js",
  "test/integration-proof-manifest.json",
  "test/interface-intent.test.js",
  "test/nested-layout.test.js",
  "test/ordered-elements.test.js"
];

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function checkout(parent, name, repo, head, extra = []) {
  const root = path.join(parent, name);
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["remote", "add", "origin", `https://github.com/${repo}.git`]);
  git(root, ["fetch", "-q", "--depth=1", "origin", head]);
  for (const sha of extra) git(root, ["fetch", "-q", "--depth=1", "origin", sha]);
  git(root, ["checkout", "-q", "--detach", head]);
  assert.equal(git(root, ["rev-parse", "HEAD"]), head);
  return root;
}

function runNode(root, args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...env }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Independently verify bounded canonical-state body text without copied state or widened authority",
    intent,
    provenance: { caller: "verification-round74" }
  };
}

function collect(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(root);
  return found;
}

function bodyTextOf(MT, ws) {
  const compiled = MT.compilePanel(ws.live);
  const panels = collect(compiled.root, (node) => node.tile === "mt_tower" && String(node.cls || "").includes("is-view"));
  assert.equal(panels.length, 1, "exactly one authored tower view must render");
  const paragraphs = collect(panels[0], (node) => node.tag === "p" && String(node.cls || "").includes("v-text"));
  assert.equal(paragraphs.length, 1, "canonical body-text request must render exactly one body text node");
  return paragraphs[0].text;
}

test("round74 Interface55 keeps canonical body text a deterministic read-only view over target-owned state", { timeout: 180000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axm-round74-"));
  try {
    const iface = checkout(
      tmp,
      "interface",
      "mike-axiom-mir/axm-morphtile-machine-interface",
      INTERFACE_HEAD,
      [INTERFACE_BASE]
    );
    const core = checkout(tmp, "core", "mike-axiom-mir/axm-morphtile", CORE);
    const declaredAssembly = checkout(
      tmp,
      "assembly-declared",
      "mike-axiom-mir/axm-morphtile-machine-assembly",
      DECLARED_ASSEMBLY
    );
    const currentAssembly = checkout(
      tmp,
      "assembly-current",
      "mike-axiom-mir/axm-morphtile-machine-assembly",
      CURRENT_ASSEMBLY,
      [DECLARED_ASSEMBLY]
    );

    const changed = git(iface, ["diff", "--name-only", INTERFACE_BASE, INTERFACE_HEAD])
      .split("\n").filter(Boolean).sort();
    assert.deepEqual(changed, [...EXPECTED_DIFF].sort(), "Interface #55 widened beyond the reviewed producer scope");
    assert.equal(changed.some((name) => name.startsWith(".github/")), false, "producer must not smuggle workflow authority into this lane");

    const manifest = JSON.parse(fs.readFileSync(path.join(iface, "machine.json"), "utf8"));
    const pkg = JSON.parse(fs.readFileSync(path.join(iface, "package.json"), "utf8"));
    const sources = JSON.parse(fs.readFileSync(path.join(iface, "fixtures/integration-sources.json"), "utf8"));
    assert.equal(manifest.version, "0.5.19");
    assert.equal(pkg.version, "0.5.19");
    assert.equal(manifest.tested_against.commit, CORE, "Core compatibility identity drifted");
    assert.equal(sources.assembly.commit, DECLARED_ASSEMBLY, "producer silently widened its declared Assembly receiver");

    const currentFleet = JSON.parse(fs.readFileSync(path.join(currentAssembly, "fixtures/current-fleet.json"), "utf8"));
    assert.equal(currentFleet.interface, INTERFACE_BASE, "current Assembly fleet does not contain the settled Interface base");
    assert.equal(currentFleet.core, CORE, "current Assembly fleet disagrees with Interface Core identity");
    assert.equal(
      git(currentAssembly, ["rev-parse", `${CURRENT_ASSEMBLY}:src`]),
      git(currentAssembly, ["rev-parse", `${DECLARED_ASSEMBLY}:src`]),
      "Assembly receiver implementation changed after the producer's declared exact receiver"
    );

    const ifaceRun = require(path.join(iface, "src")).run;
    const canonicalIntent = {
      tile_path: "mt_tower",
      title: "Canonical tower body",
      elements: [{ kind: "text", text_binding: "beacon", strong: true }],
      bindings: { readouts: ["beacon"] }
    };
    const callerBefore = JSON.stringify(canonicalIntent);
    const first = ifaceRun(request("canonical-body-a", canonicalIntent));
    const second = ifaceRun(request("canonical-body-a", canonicalIntent));
    assert.equal(JSON.stringify(canonicalIntent), callerBefore, "Interface mutated caller-authored intent");
    assert.deepEqual(second, first, "same request must replay deterministically");
    assert.equal(first.status, "CANDIDATE", JSON.stringify(first.holds));
    assert.deepEqual(first.candidate.operation.view.body, [{ text: ["var", "beacon"], strong: true }]);
    assert.deepEqual(first.dependencies[0].requires.readout_logic_vars, ["beacon"]);
    assert.equal(JSON.stringify(first.candidate).includes("canonical_state"), false, "candidate copied canonical state");

    const legacy = ifaceRun(request("canonical-body-legacy", {
      tile_path: "mt_tower",
      text_binding: "beacon",
      bindings: { readouts: ["beacon"] }
    }));
    assert.equal(legacy.status, "CANDIDATE", JSON.stringify(legacy.holds));
    assert.deepEqual(legacy.candidate.operation.view.body, [{ text: ["var", "beacon"] }]);

    const reused = ifaceRun(request("canonical-body-reused", {
      tile_path: "mt_tower",
      elements: [
        { kind: "text", text_binding: "beacon" },
        { kind: "group", children: [{ kind: "text", text_binding: "beacon", strong: true }] }
      ],
      bindings: { readouts: ["beacon"] }
    }));
    assert.equal(reused.status, "CANDIDATE", JSON.stringify(reused.holds));
    assert.deepEqual(reused.dependencies[0].requires.readout_logic_vars, ["beacon"], "multiple views of one binding must not multiply canonical authority");

    for (const [id, intent, code] of [
      ["ambiguous-body", { tile_path: "mt_tower", text: "static", text_binding: "beacon", bindings: { readouts: ["beacon"] } }, "HOLD_INTERFACE_CONTENT_AMBIGUOUS"],
      ["undeclared-body", { tile_path: "mt_tower", text_binding: "beacon", bindings: { readouts: [] } }, "HOLD_INVALID_INTERFACE_BINDING"],
      ["expression-body", { tile_path: "mt_tower", text: ["var", "beacon"] }, "HOLD_INTERFACE_TEXT_INVALID"]
    ]) {
      const out = ifaceRun(request(id, intent));
      assert.equal(out.status, "HOLD", `${id} must fail closed`);
      assert.equal(out.candidate, null, `${id} must not leak a candidate`);
      assert.equal(out.holds[0].code, code, `${id} returned the wrong HOLD boundary`);
    }

    const MT = require(path.join(core, "core", "morphtile.js"));
    const ws = MT.createWorkspace(MT.seedWorld());
    assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 0);
    const candidate = MT.cloneBody(ws, "ai", "ai:verification-round74");
    const edited = MT.editCandidate(ws, candidate, first.candidate.operation);
    assert.ok(edited.ok, edited.error);
    const plan = MT.planMerge(ws, [candidate]);
    assert.equal(plan.status, "READY", JSON.stringify(plan));
    const committed = MT.commitPlan(ws, plan.id);
    assert.ok(committed.ok, JSON.stringify(committed));

    const authoredView = JSON.stringify(ws.live.tiles.mt_tower.view);
    const committedHash = MT.structHash(ws.live);
    assert.equal(bodyTextOf(MT, ws), "0");
    assert.equal(MT.structHash(ws.live), committedHash, "rendering canonical body text mutated world structure");
    MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
    assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
    assert.equal(bodyTextOf(MT, ws), "1", "body text did not follow target-owned canonical state");
    assert.equal(JSON.stringify(ws.live.tiles.mt_tower.view), authoredView, "canonical transition rewrote Interface-authored view matter");

    runNode(iface, ["--test"]);
    runNode(iface, ["scripts/run-integration-proofs.js", "--dependency", "morphtile"], {
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
    runNode(iface, ["scripts/run-integration-proofs.js", "--dependency", "assembly"], {
      MORPHTILE_ASSEMBLY: path.join(declaredAssembly, "src"),
      MORPHTILE_ASSEMBLY_COMMIT: DECLARED_ASSEMBLY,
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
