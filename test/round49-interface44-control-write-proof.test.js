"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BASE = "ddafc9e30144d12605c6e4198cd8d6c5764e6212";
const CANDIDATE = "b2d2b809f1805bc029cb2b5aaa18fcc0aa6c0cf8";
const enabled = Boolean(process.env.R49_INTERFACE44_ROOT);

function git(args) {
  const out = spawnSync("git", args, { cwd: process.env.R49_INTERFACE44_ROOT, encoding: "utf8" });
  assert.equal(out.status, 0, out.stderr || out.stdout);
  return out.stdout.trim();
}

test("Interface 44 is evidence-only and does not widen runtime authority", { skip: !enabled }, () => {
  assert.equal(process.env.R49_INTERFACE_BASE_COMMIT, BASE);
  assert.equal(process.env.R49_INTERFACE44_COMMIT, CANDIDATE);
  const changed = git(["diff", "--name-only", BASE, CANDIDATE]).split("\n").filter(Boolean).sort();
  assert.deepEqual(changed, ["test/control-write-through-presentation.integration.test.js", "test/integration-proof-manifest.json"].sort());
  assert.equal(git(["diff", "--name-only", BASE, CANDIDATE, "--", "src", "machine.json", "package.json"]), "");
});

test("Interface 44 registers exactly one MorphTile-owned write-through proof", { skip: !enabled }, () => {
  const manifest = require(path.join(process.env.R49_INTERFACE44_ROOT, "test/integration-proof-manifest.json"));
  const matches = manifest.proofs.filter((entry) => entry.path === "test/control-write-through-presentation.integration.test.js");
  assert.equal(matches.length, 1, "proof path must be registered exactly once");
  assert.equal(matches[0].claim, "canonical-control-write-through-presentations");
  assert.deepEqual(matches[0].dependencies, ["morphtile"]);

  const source = require("node:fs").readFileSync(path.join(process.env.R49_INTERFACE44_ROOT, matches[0].path), "utf8");
  assert.match(source, /param\.set/);
  assert.match(source, /rollback/);
  assert.match(source, /compilePanel/);
  assert.match(source, /session_presentations/);
  assert.doesNotMatch(source, /require\([^)]*assembly/i, "proof must not manufacture Assembly authority");
});
