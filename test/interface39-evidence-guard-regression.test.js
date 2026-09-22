"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const INTERFACE_BASE = "ec92507b82d855de49ba024ecfdd32aada24b186";
const INTERFACE39 = "00f70546da3b4f569f4ce7b161e8935442ed819a";
const ASSEMBLY = "c45f8305196d149362045cef339ff1634f9095fe";
const MORPHTILE = "2bdf8eade1376055473b9cc1b11734b72a5566e5";
const enabled = !!process.env.I39_ROOT && !!process.env.I39_BASE_ROOT;

function copyCandidate() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "interface39-guard-"));
  fs.cpSync(process.env.I39_ROOT, root, {
    recursive: true,
    filter: (src) => path.basename(src) !== ".git"
  });
  return root;
}

function runGuard(root) {
  return spawnSync(process.execPath, ["--test", "test/integration-workflow-coverage.test.js"], {
    cwd: root,
    encoding: "utf8"
  });
}

function hashTree(root) {
  const rows = [];
  function walk(dir, relative = "") {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, entry.name);
      const rel = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(abs, rel);
      else rows.push(`${rel}:${crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex")}`);
    }
  }
  walk(root);
  return rows;
}

function manifestModule(root) {
  const modPath = path.join(root, "scripts", "run-integration-proofs.js");
  delete require.cache[require.resolve(modPath)];
  return require(modPath);
}

test("Interface #39 repaired exact head keeps runtime source identical and binds exact receiver identities", { skip: !enabled }, () => {
  assert.equal(process.env.I39_BASE_COMMIT, INTERFACE_BASE);
  assert.equal(process.env.I39_COMMIT, INTERFACE39);
  assert.equal(process.env.I39_ASSEMBLY_COMMIT, ASSEMBLY);
  assert.equal(process.env.I39_MORPHTILE_COMMIT, MORPHTILE);
  assert.deepEqual(
    hashTree(path.join(process.env.I39_ROOT, "src")),
    hashTree(path.join(process.env.I39_BASE_ROOT, "src")),
    "Interface #39 must remain evidence/CI-only rather than changing runtime source"
  );

  const manifest = JSON.parse(fs.readFileSync(path.join(process.env.I39_ROOT, "test", "integration-proof-manifest.json"), "utf8"));
  const assemblyProofs = manifest.proofs
    .filter((proof) => proof.dependencies.includes("assembly"))
    .map((proof) => proof.path)
    .sort();
  assert.deepEqual(assemblyProofs, [
    "test/assembly-dependency.integration.test.js",
    "test/assembly-plan-coverage.integration.test.js",
    "test/binding-namespace-authority.integration.test.js"
  ]);
});

test("unregistered integration proof fails closed even when Assembly dependency key is computed", { skip: !enabled }, () => {
  const root = copyCandidate();
  try {
    fs.writeFileSync(path.join(root, "test", "computed-assembly-consumer.integration.test.js"), `
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
test("computed Assembly environment-key consumer", () => {
  const key = ["MORPHTILE", "ASSEMBLY"].join("_");
  assert.ok(Object.prototype.hasOwnProperty.call(process.env, key) || true);
});
`);
    const mod = manifestModule(root);
    assert.throws(
      () => mod.validateManifest(mod.loadManifest()),
      /registry mismatch.*computed-assembly-consumer\.integration\.test\.js/,
      "a newly added integration proof must not evade evidence registration because it computes the env key"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("removing an Assembly proof from the structured registry fails closed while source remains", { skip: !enabled }, () => {
  const root = copyCandidate();
  try {
    const manifestPath = path.join(root, "test", "integration-proof-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.proofs = manifest.proofs.filter((proof) => proof.path !== "test/binding-namespace-authority.integration.test.js");
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const mod = manifestModule(root);
    assert.throws(
      () => mod.validateManifest(mod.loadManifest()),
      /registry mismatch.*binding-namespace-authority\.integration\.test\.js/,
      "source/environment references cannot substitute for structured proof registration"
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("workflow comment cannot substitute for executable registry runner", { skip: !enabled }, () => {
  const root = copyCandidate();
  try {
    const workflowPath = path.join(root, ".github", "workflows", "test.yml");
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const needle = "      - run: npm run test:integration:assembly";
    assert.ok(workflow.includes(needle), "fixture drift: executable Assembly registry runner missing");
    fs.writeFileSync(workflowPath, workflow.replace(needle, "      # run: npm run test:integration:assembly"));
    const result = runGuard(root);
    assert.notEqual(result.status, 0,
      `coverage guard accepted a registry runner that survived only as a YAML comment\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("second raw Assembly proof list is rejected instead of creating two evidence sources", { skip: !enabled }, () => {
  const root = copyCandidate();
  try {
    const workflowPath = path.join(root, ".github", "workflows", "test.yml");
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const needle = "      - run: npm run test:integration:assembly";
    assert.ok(workflow.includes(needle), "fixture drift: executable Assembly registry runner missing");
    const mutated = workflow.replace(
      needle,
      `${needle}\n      - run: node --test test/assembly-dependency.integration.test.js`
    );
    fs.writeFileSync(workflowPath, mutated);
    const result = runGuard(root);
    assert.notEqual(result.status, 0,
      `coverage guard accepted a second hand-maintained raw Assembly proof list\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
