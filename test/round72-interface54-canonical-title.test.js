"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const INTERFACE_BASE = "cec03d917227881100d4ce576ed49174e51d8210";
const INTERFACE_HEAD = "fe83ee7c434f08ab32e1500ba93b880b5dbd2f2c";
const CORE = "685df074701feeae3e9d789e532d0a3658030bf4";
const DECLARED_ASSEMBLY = "726fb4ad8efc4068bcda0c2c3d5e3873335b280e";
const CURRENT_ASSEMBLY = "6f16e1019af8d081e390a3a74d836a10a93d8d5d";
const EXPECTED_DIFF = [
  "CHANGELOG.md",
  "INTEGRATION.md",
  "README.md",
  "STATUS.md",
  "machine.json",
  "package.json",
  "src/index.js",
  "src/interface-intent.js",
  "test/assembly-dependency.integration.test.js",
  "test/canonical-title-binding.integration.test.js",
  "test/canonical-title-binding.test.js",
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

function request(id, intent) {
  return {
    envelope_version: "0.1",
    request_id: id,
    goal: "Independently verify one bounded canonical-state title source without copied state",
    intent,
    provenance: { caller: "verification-round72" }
  };
}

test("round72 Interface54 exposes only one bounded canonical title read through existing authority", { timeout: 120000 }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "axm-round72-"));
  try {
    const iface = checkout(
      tmp,
      "interface",
      "mike-axiom-mir/axm-morphtile-machine-interface",
      INTERFACE_HEAD,
      [INTERFACE_BASE]
    );
    const core = checkout(tmp, "core", "mike-axiom-mir/axm-morphtile", CORE);
    const assembly = checkout(
      tmp,
      "assembly",
      "mike-axiom-mir/axm-morphtile-machine-assembly",
      CURRENT_ASSEMBLY,
      [DECLARED_ASSEMBLY]
    );

    const changed = git(iface, ["diff", "--name-only", INTERFACE_BASE, INTERFACE_HEAD])
      .split("\n").filter(Boolean).sort();
    assert.deepEqual(changed, [...EXPECTED_DIFF].sort(), "Interface #54 widened beyond its declared producer scope");

    const manifest = JSON.parse(fs.readFileSync(path.join(iface, "machine.json"), "utf8"));
    const pkg = JSON.parse(fs.readFileSync(path.join(iface, "package.json"), "utf8"));
    assert.equal(manifest.version, "0.5.18");
    assert.equal(pkg.version, "0.5.18");
    assert.equal(manifest.tested_against.commit, CORE, "Core compatibility identity drifted");

    const sources = JSON.parse(fs.readFileSync(path.join(iface, "fixtures/integration-sources.json"), "utf8"));
    assert.equal(sources.assembly.commit, DECLARED_ASSEMBLY, "Interface widened its declared Assembly receiver identity");
    const currentFleet = JSON.parse(fs.readFileSync(path.join(assembly, "fixtures/current-fleet.json"), "utf8"));
    assert.equal(currentFleet.interface, INTERFACE_BASE, "current Assembly does not contain settled Interface base");
    assert.equal(currentFleet.core, CORE, "current Assembly Core identity disagrees with Interface Core pin");
    const parentLines = git(assembly, ["cat-file", "-p", CURRENT_ASSEMBLY])
      .split("\n").filter((line) => line.startsWith("parent "));
    assert.ok(parentLines.includes(`parent ${DECLARED_ASSEMBLY}`), "declared Assembly receiver is not direct provenance of current Assembly main");

    const ifaceRun = require(path.join(iface, "src")).run;
    const out = ifaceRun(request("canonical-title", {
      tile_path: "mt_tower",
      title_binding: "beacon",
      elements: [{ kind: "text", text: "Tower status" }],
      bindings: { readouts: ["beacon"] }
    }));
    assert.equal(out.status, "CANDIDATE", JSON.stringify(out.holds));
    assert.deepEqual(out.candidate.operation.view.title, ["var", "beacon"]);
    assert.deepEqual(out.dependencies[0].requires.readout_logic_vars, ["beacon"]);
    assert.equal(JSON.stringify(out.candidate).includes("canonical_state"), false, "Interface copied canonical state into its candidate");

    const ambiguous = ifaceRun(request("ambiguous-title", {
      tile_path: "mt_tower",
      title: "Static",
      title_binding: "beacon",
      bindings: { readouts: ["beacon"] }
    }));
    assert.equal(ambiguous.status, "HOLD");
    assert.equal(ambiguous.holds[0].code, "HOLD_INTERFACE_CONTENT_AMBIGUOUS");
    assert.equal(ambiguous.candidate, null);

    const undeclared = ifaceRun(request("undeclared-title", {
      tile_path: "mt_tower",
      title_binding: "beacon",
      bindings: { readouts: [] }
    }));
    assert.equal(undeclared.status, "HOLD");
    assert.equal(undeclared.holds[0].code, "HOLD_INVALID_INTERFACE_BINDING");
    assert.equal(undeclared.candidate, null);

    const expression = ifaceRun(request("arbitrary-title", {
      tile_path: "mt_tower",
      title: ["+", "Tower ", ["var", "beacon"]]
    }));
    assert.equal(expression.status, "HOLD");
    assert.equal(expression.holds[0].code, "HOLD_INTERFACE_TEXT_INVALID");

    const MT = require(path.join(core, "core", "morphtile.js"));
    const ws = MT.createWorkspace(MT.seedWorld());
    const candidate = MT.cloneBody(ws, "ai", "ai:verification-round72");
    const edited = MT.editCandidate(ws, candidate, out.candidate.operation);
    assert.ok(edited.ok, edited.error);
    const plan = MT.planMerge(ws, [candidate]);
    assert.equal(plan.status, "READY", JSON.stringify(plan));
    const committed = MT.commitPlan(ws, plan.id);
    assert.ok(committed.ok, JSON.stringify(committed));

    const titleOf = () => {
      const compiled = MT.compilePanel(ws.live);
      const panels = collect(compiled.root, (node) => node.tile === "mt_tower" && String(node.cls || "").includes("is-view"));
      assert.equal(panels.length, 1);
      const headings = collect(panels[0], (node) => node.tag === "h3");
      assert.equal(headings.length, 1);
      return headings[0].text;
    };
    const authoredView = JSON.stringify(ws.live.tiles.mt_tower.view);
    const committedHash = MT.structHash(ws.live);
    assert.equal(titleOf(), "0");
    assert.equal(MT.structHash(ws.live), committedHash, "canonical title rendering mutated structure");
    MT.act(ws, { do: "signal", tile: "mt_tower", name: "toggle" });
    assert.equal(MT.readVars(ws.live, "mt_tower", 0).beacon, 1);
    assert.equal(titleOf(), "1", "canonical title did not follow target-owned state");
    assert.equal(JSON.stringify(ws.live.tiles.mt_tower.view), authoredView, "canonical state transition rewrote Interface-authored matter");

    runNode(iface, ["--test"]);
    runNode(iface, ["scripts/run-integration-proofs.js", "--dependency", "morphtile"], {
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
    runNode(iface, ["scripts/run-integration-proofs.js", "--dependency", "assembly"], {
      MORPHTILE_ASSEMBLY: path.join(assembly, "src"),
      MORPHTILE_ASSEMBLY_COMMIT: DECLARED_ASSEMBLY,
      MORPHTILE_CORE: path.join(core, "core", "morphtile.js"),
      MORPHTILE_COMMIT: CORE
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
