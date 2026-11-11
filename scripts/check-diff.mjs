#!/usr/bin/env node
// codedetective anti-gaming diff check.
// Compares the working tree now against a snapshot taken before the fix started, and flags changes that
// make checks pass by weakening them. Only the fix's own changes are judged: edits the developer had
// already made, and earlier fixes, are part of the snapshot and never blamed on this fix.
//
// Usage (from the repository root):
//   node <skill-dir>/scripts/check-diff.mjs --snapshot
//       Prints a snapshot ID of the whole working tree (tracked and untracked files, minus ignored files
//       and .audit/). Take it before writing any code for a task and record it in the task.
//   node <skill-dir>/scripts/check-diff.mjs --base <snapshot ID or git ref> [--allow <path>]...
//       Judges every change since the snapshot. --allow names a config file the approved plan says will
//       change; config changes not named this way fail.
//
// Read-only for your files: it never touches the working tree, the real index, branches or stashes. It uses
// a temporary index and writes only ordinary git objects. Exit code 1 if any FAIL item is found; REVIEW
// items need a written justification in the task.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const args = process.argv.slice(2);
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};
const allowed = new Set(args.flatMap((a, i) => (a === '--allow' && args[i + 1] ? [args[i + 1].replace(/\\/g, '/').replace(/^\.\//, '')] : [])));

function git(gitArgs, env) {
  const r = spawnSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: env || process.env });
  if (r.status !== 0) {
    process.stderr.write(`git ${gitArgs.join(' ')} failed: ${(r.stderr || '').trim()}\n`);
    process.exit(2);
  }
  return r.stdout;
}

// Tree object of the working tree as it is now, built in a throwaway index.
function snapshotTree() {
  const index = path.join(os.tmpdir(), `codedetective-index-${process.pid}-${Date.now()}`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    const hasHead = spawnSync('git', ['rev-parse', '--verify', '-q', 'HEAD'], { cwd: root }).status === 0;
    git(hasHead ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], env);
    // Add everything git would track, then drop .audit from this throwaway index. Never name .audit in
    // an exclude pathspec on `git add`: when .audit is git-ignored, which is how the skill sets a project
    // up, git refuses with "paths are ignored by one of your .gitignore files". Ignored files are skipped
    // by `git add` anyway; the `git rm --cached` covers a .audit that is not ignored or was committed.
    // --cached only touches the index, and this index is the temporary one, so no file is deleted.
    git(['add', '-A', '--', '.'], env);
    git(['rm', '-r', '-q', '-f', '--cached', '--ignore-unmatch', '--', '.audit'], env);
    return git(['write-tree'], env).trim();
  } finally {
    fs.rmSync(index, { force: true });
  }
}

if (args.includes('--snapshot')) {
  process.stdout.write(snapshotTree() + '\n');
  process.exit(0);
}

const baseArg = valueOf('--base');
const baseTree = git(['rev-parse', '--verify', `${baseArg || 'HEAD'}^{tree}`]).trim();
const currentTree = snapshotTree();

const norm = (f) => f.replace(/\\/g, '/');
const isTestFile = (f) =>
  /(^|\/)(__tests__|e2e|tests?|spec)\//i.test(f) ||
  /[._-](test|spec)\.[cm]?[jt]sx?$/i.test(f) ||
  /(^|\/)test_[^/]*\.py$|_test\.(py|go)$/i.test(f);
const ignoredPath = (f) => f.startsWith('.audit/') || f.includes('node_modules/');

// Config files that can switch checks off. Changing one fails unless the approved plan names it (--allow).
const GUARDED_CONFIG = [
  /(^|\/)[tj]sconfig[^/]*\.json$/,
  /(^|\/)eslint\.config\.[cm]?[jt]s$/, /(^|\/)\.eslintrc[^/]*$/, /(^|\/)\.eslintignore$/,
  /(^|\/)(vitest|vite|jest|playwright|cypress|karma)\.config\.[^/]+$/, /(^|\/)\.mocharc[^/]*$/, /(^|\/)jest\.config[^/]*$/,
  /(^|\/)(pytest\.ini|setup\.cfg|tox\.ini|\.coveragerc|mypy\.ini|\.flake8|ruff\.toml|\.ruff\.toml)$/,
  /(^|\/)\.golangci\.[^/]+$/, /(^|\/)clippy\.toml$/,
  /(^|\/)\.github\/workflows\/[^/]+$/, /(^|\/)\.husky\//, /(^|\/)\.pre-commit-config\.yaml$/,
];
// Manifests mix dependencies with check settings, so changes are flagged for review rather than failed.
const REVIEW_CONFIG = [/(^|\/)package\.json$/, /(^|\/)pyproject\.toml$/, /(^|\/)Cargo\.toml$/, /(^|\/)go\.mod$/];

// Suppressions: always fail without a written reason; with one they are flagged for review.
// The capture group is whatever follows the marker, where a reason would be written.
const SUPPRESSIONS = [
  ['@ts-ignore', /@ts-ignore\b(.*)$/, 'never'],
  ['@ts-nocheck', /@ts-nocheck\b(.*)$/, 'never'],
  ['@ts-expect-error', /@ts-expect-error\b(.*)$/, 'reason'],
  ['eslint-disable', /eslint-disable(?:-next-line|-line)?\b(.*)$/, 'reason', (s) => (s.includes('--') ? s.slice(s.indexOf('--') + 2) : '')],
  ['# noqa', /#\s*noqa\b[:\s\w,]*(?:#(.*))?$/, 'reason'],
  ['# type: ignore', /#\s*type:\s*ignore\b(?:\[[^\]]*\])?(?:\s*#(.*))?$/, 'reason'],
  ['//nolint', /\/\/\s*nolint\b(?::[\w,]+)?(?:\s*\/\/(.*))?$/, 'reason'],
  ['#[allow(...)]', /#!?\[allow\([^)]*\)\](.*)$/, 'reason'],
];
const hasReason = (text) => (text || '').replace(/[^\w\s]/g, ' ').trim().split(/\s+/).filter((w) => w.length > 1).length >= 3;

const FAIL_PATTERNS = [
  ['adds a test skip', /\b(?:it|test|describe|context|suite)(?:\.\w+)*\.(?:skip|skipIf|runIf|fixme|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/],
  ['adds a test focus marker', /\b(?:it|test|describe|context|suite)(?:\.\w+)*\.only\s*\(|\b(?:fit|fdescribe)\s*\(/],
  ['adds a Python test skip', /@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip/],
  ['adds a Go test skip', /\bt\.Skip(?:Now|f)?\s*\(/],
  ['adds a Rust #[ignore]', /#\[ignore\]/],
  ['disables TLS verification', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true/],
  ['adds --no-verify or --passWithNoTests', /--no-verify\b|--passWithNoTests\b/],
];
const REVIEW_PATTERNS = [['adds an empty catch block', /catch\s*(?:\([^)]*\))?\s*\{\s*\}|except[^:\n]*:\s*pass\s*$/]];
const ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+|Equal|True|False|Raises)?\s*\(|^\s*assert\s|\.should\b|\bt\.(?:is|true|false|deepEqual|throws|Error|Fatal)\w*\s*\(/g;

const fails = [];
const reviews = [];
const assertionDelta = {};

function scanAdded(file, lineNo, text) {
  for (const [label, re, mode, reasonOf] of SUPPRESSIONS) {
    const m = text.match(re);
    if (!m) continue;
    const reason = reasonOf ? reasonOf(m[1] || '') : m[1];
    if (mode === 'never') fails.push(`${file}:${lineNo} adds ${label} (never allowed; use a typed fix or a reasoned @ts-expect-error)`);
    else if (hasReason(reason)) reviews.push(`${file}:${lineNo} adds ${label} with a written reason; confirm the reason holds`);
    else fails.push(`${file}:${lineNo} adds ${label} without a written reason`);
  }
  for (const [label, re] of FAIL_PATTERNS) if (re.test(text)) fails.push(`${file}:${lineNo} ${label}`);
  for (const [label, re] of REVIEW_PATTERNS) if (re.test(text)) reviews.push(`${file}:${lineNo} ${label}`);
  if (isTestFile(file)) assertionDelta[file] = (assertionDelta[file] || 0) + (text.match(ASSERTION) || []).length;
}
function scanRemoved(file, text) {
  if (isTestFile(file)) assertionDelta[file] = (assertionDelta[file] || 0) - (text.match(ASSERTION) || []).length;
}
function checkConfig(file) {
  if (allowed.has(file)) return;
  if (GUARDED_CONFIG.some((re) => re.test(file))) fails.push(`${file} changes a config file that can switch checks off; not named in the plan (--allow)`);
  else if (REVIEW_CONFIG.some((re) => re.test(file))) reviews.push(`${file} changes a manifest; confirm no check, script or threshold was weakened`);
}

const diff = git(['diff', baseTree, currentTree, '--unified=0', '--no-color', '--no-ext-diff', '-M']);
let current = null;
let renameFrom = null;
let newLine = 0;
const touched = new Set();
for (const line of diff.split('\n')) {
  if (line.startsWith('diff --git ')) { current = null; renameFrom = null; continue; }
  if (line.startsWith('rename from ')) { renameFrom = norm(line.slice(12)); continue; }
  if (line.startsWith('rename to ')) {
    const to = norm(line.slice(10));
    if (!ignoredPath(to)) {
      touched.add(to);
      if (isTestFile(renameFrom) && !isTestFile(to)) fails.push(`${renameFrom} -> ${to} moves a test file out of the test paths`);
    }
    continue;
  }
  if (line.startsWith('deleted file mode')) { current = '__deleted__'; continue; }
  if (line.startsWith('--- ')) {
    if (current === '__deleted__') {
      const f = norm(line.slice(4).replace(/^a\//, ''));
      if (!ignoredPath(f)) {
        touched.add(f);
        if (isTestFile(f)) fails.push(`${f} test file deleted`);
      }
      current = ignoredPath(f) ? null : f;
    }
    continue;
  }
  if (line.startsWith('+++ ')) {
    const f = line.slice(4);
    if (f !== '/dev/null') {
      const p = norm(f.replace(/^b\//, ''));
      current = ignoredPath(p) ? null : p;
      if (current) touched.add(current);
    }
    continue;
  }
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { newLine = Number(hunk[1]); continue; }
  if (!current || current === '__deleted__') {
    if (current === '__deleted__' && line.startsWith('-')) { /* lines of a deleted file */ }
    continue;
  }
  if (line.startsWith('+')) { scanAdded(current, newLine, line.slice(1)); newLine++; }
  else if (line.startsWith('-')) scanRemoved(current, line.slice(1));
}
for (const f of touched) checkConfig(f);
for (const [file, delta] of Object.entries(assertionDelta)) {
  if (delta < 0) reviews.push(`${file} net assertions removed: ${-delta}; justify each or restore it`);
}

const out = [`Diff check against ${baseArg ? `snapshot ${baseArg}` : 'HEAD (no snapshot given: changes made before this fix are included)'}`];
out.push(fails.length ? `FAIL (${fails.length}):` : 'FAIL: none');
fails.forEach((f) => out.push(`  - ${f}`));
out.push(reviews.length ? `REVIEW (${reviews.length}), each needs a stated justification in the task:` : 'REVIEW: none');
reviews.forEach((r) => out.push(`  - ${r}`));
process.stdout.write(out.join('\n') + '\n');
process.exit(fails.length ? 1 : 0);
