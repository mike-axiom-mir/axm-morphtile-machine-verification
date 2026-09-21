"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const INTERFACE39 = "ef20bba019167a07be1045b2d0affad04c82daa7";
const enabled = !!process.env.I39_ROOT;

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

test("Interface #39 guard must detect Assembly consumers that do not spell the environment key literally", { skip: !enabled }, () => {
  assert.equal(process.env.I39_COMMIT, INTERFACE39);
  const root = copyCandidate();
  try {
    fs.writeFileSync(path.join(root, "test", "computed-assembly-consumer.integration.test.js"), `
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
test("computed Assembly environment-key consumer", () => {
  const key = ["MORPHTILE", "ASSEMBLY"].join("_");
  assert.ok(process.env[key] || true);
});
`);

    const result = runGuard(root);
    assert.notEqual(
      result.status,
      0,
      `coverage guard passed despite a genuine Assembly-dependent integration proof that is absent from the receiver CI command\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Interface #39 guard must bind workflow coverage to executable command matter rather than comments", { skip: !enabled }, () => {
  assert.equal(process.env.I39_COMMIT, INTERFACE39);
  const root = copyCandidate();
  try {
    const workflowPath = path.join(root, ".github", "workflows", "test.yml");
    const workflow = fs.readFileSync(workflowPath, "utf8");
    const proof = "test/binding-namespace-authority.integration.test.js";
    assert.ok(workflow.includes(proof), "fixture drift: expected proof path is not present in candidate workflow");

    // Remove the proof from the executable node command but retain the same path as a YAML
    // comment inside the Assembly receiver job. A text-regex guard must not treat the comment
    // as execution evidence.
    const commandNeedle = ` ${proof}`;
    const withoutExecution = workflow.replace(commandNeedle, "");
    assert.notEqual(withoutExecution, workflow, "fixture drift: could not remove proof from executable command");
    const withCommentOnly = withoutExecution.replace(
      "        env:\n          MORPHTILE_ASSEMBLY:",
      `        # historical proof path only, not executed: ${proof}\n        env:\n          MORPHTILE_ASSEMBLY:`
    );
    fs.writeFileSync(workflowPath, withCommentOnly);

    const result = runGuard(root);
    assert.notEqual(
      result.status,
      0,
      `coverage guard passed when a proof path survived only as a YAML comment after removal from the executable command\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
