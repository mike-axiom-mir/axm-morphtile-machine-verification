'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function unquote(value) {
  const v = String(value || '').trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) return v.slice(1, -1);
  return v;
}

function topLevelOnLines(source) {
  const lines = String(source).replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => /^on:\s*(?:#.*)?$/.test(line));
  if (start < 0) {
    const inline = lines.find((line) => /^on:\s*\[/.test(line));
    return inline ? [inline] : [];
  }
  const out = [lines[start]];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^[^\s#][^:]*:\s*/.test(line)) break;
    out.push(line);
  }
  return out;
}

function inlineEvents(lines) {
  if (lines.length !== 1) return [];
  const m = lines[0].match(/^on:\s*\[(.*)\]\s*$/);
  if (!m) return [];
  return m[1].split(',').map(unquote).filter(Boolean);
}

function eventBlock(lines, eventName) {
  const inline = inlineEvents(lines);
  if (inline.length) return inline.includes(eventName) ? { exists: true, lines: [] } : { exists: false, lines: [] };
  const re = new RegExp(`^  ${eventName}:\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => re.test(line));
  if (start < 0) return { exists: false, lines: [] };
  const block = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^  [A-Za-z0-9_-]+:\s*/.test(line)) break;
    block.push(line);
  }
  return { exists: true, lines: block };
}

function listUnder(block, key) {
  const re = new RegExp(`^    ${key}:\\s*(?:#.*)?$`);
  const start = block.findIndex((line) => re.test(line));
  if (start < 0) return null;
  const values = [];
  for (let i = start + 1; i < block.length; i += 1) {
    const line = block[i];
    if (/^    [A-Za-z0-9_-]+:\s*/.test(line)) break;
    const m = line.match(/^      -\s*(.+?)\s*(?:#.*)?$/);
    if (m) values.push(unquote(m[1]));
  }
  return values;
}

function literalPatternMatchesMain(pattern) {
  const p = unquote(pattern);
  return p === 'main' || p === '*' || p === '**' || p === 'refs/heads/main';
}

function classifyWorkflow(source) {
  const lines = topLevelOnLines(source);
  const push = eventBlock(lines, 'push');
  const pr = eventBlock(lines, 'pull_request');
  const manual = eventBlock(lines, 'workflow_dispatch');

  let mainPush = false;
  if (push.exists) {
    const branches = listUnder(push.lines, 'branches');
    const ignored = listUnder(push.lines, 'branches-ignore');
    if (branches && branches.length) mainPush = branches.some(literalPatternMatchesMain);
    else if (ignored && ignored.some((p) => unquote(p) === 'main')) mainPush = false;
    else mainPush = true;
  }

  return {
    main_push_automatic: mainPush,
    pull_request_automatic: pr.exists,
    manual_replay: manual.exists,
  };
}

function auditWorkflows(rootDir) {
  const workflowDir = path.join(rootDir, '.github', 'workflows');
  const files = fs.readdirSync(workflowDir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  const entries = files.map((name) => {
    const source = fs.readFileSync(path.join(workflowDir, name), 'utf8');
    return { path: `.github/workflows/${name}`, ...classifyWorkflow(source) };
  });
  const select = (key) => entries.filter((entry) => entry[key]).map((entry) => entry.path);
  const main = select('main_push_automatic');
  const pr = select('pull_request_automatic');
  const manual = select('manual_replay');
  const manualMissing = entries.filter((entry) => (entry.main_push_automatic || entry.pull_request_automatic) && !entry.manual_replay).map((entry) => entry.path);
  const digest = crypto.createHash('sha256').update(JSON.stringify({ main, pr, manual })).digest('hex');
  return {
    schema: 'axm.morphtile.verification-workflow-trigger-audit/v1',
    workflow_count: entries.length,
    main_push_automatic: main,
    pull_request_automatic: pr,
    manual_replay: manual,
    automatic_without_manual_replay: manualMissing,
    inventory_sha256: digest,
  };
}

if (require.main === module) {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  process.stdout.write(`${JSON.stringify(auditWorkflows(root), null, 2)}\n`);
}

module.exports = { classifyWorkflow, auditWorkflows };
