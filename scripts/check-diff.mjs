#!/usr/bin/env node
// codedetective anti-gaming diff check.
// Inspects the working tree diff (tracked changes against a base, plus untracked files) for changes that
// make checks pass by weakening them. Read-only: it never modifies files.
// Usage (from the repository root): node <skill-dir>/scripts/check-diff.mjs [--base <git-ref>]
// Exit code 1 if any FAIL item is found; REVIEW items need an explicit justification in the task.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const argBase = process.argv.indexOf('--base');
const base = argBase !== -1 ? process.argv[argBase + 1] : 'HEAD';

function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    process.stderr.write(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}\n`);
    process.exit(2);
  }
  return r.stdout;
}

const isTestFile = (f) => /(^|[\\/])(__tests__|e2e|tests?)[\\/]|[._-](test|spec)\.[cm]?[jt]sx?$/i.test(f);
const ignored = (f) => f.startsWith('.audit/') || f.includes('node_modules/');

const FAIL_PATTERNS = [
  ['adds @ts-ignore', /@ts-ignore\b/],
  ['adds @ts-nocheck', /@ts-nocheck\b/],
  ['adds @ts-expect-error', /@ts-expect-error\b/],
  ['adds eslint-disable', /eslint-disable(?:-next-line|-line)?\b/],
  ['adds a test skip', /\b(?:it|test|describe|context)\.(?:skip|fixme)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/],
  ['adds a test focus marker', /\b(?:it|test|describe|context)\.only\s*\(|\b(?:fit|fdescribe)\s*\(/],
  ['disables TLS verification', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/],
];
const REVIEW_PATTERNS = [
  ['adds an empty catch block', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/],
  ['adds a catch that may swallow errors', /catch\s*(?:\([^)]*\))?\s*\{\s*(?:\/\/.*)?$/],
];
const ASSERTION = /\bexpect\s*\(|\bassert(?:\.\w+)?\s*\(|\.should\b|\bt\.(?:is|true|false|deepEqual|throws)\s*\(/g;

const fails = [];
const reviews = [];
const assertionDelta = {};

function scanAdded(file, lineNo, text) {
  for (const [label, re] of FAIL_PATTERNS) if (re.test(text)) fails.push(`${file}:${lineNo} ${label}`);
  for (const [label, re] of REVIEW_PATTERNS) if (re.test(text)) reviews.push(`${file}:${lineNo} ${label}`);
  if (isTestFile(file)) assertionDelta[file] = (assertionDelta[file] || 0) + (text.match(ASSERTION) || []).length;
}
function scanRemoved(file, text) {
  if (isTestFile(file)) assertionDelta[file] = (assertionDelta[file] || 0) - (text.match(ASSERTION) || []).length;
}

// Tracked changes
const diff = git(['diff', base, '--unified=0', '--no-color', '--no-ext-diff', '-M']);
let current = null;
let deleted = false;
let newLine = 0;
for (const line of diff.split('\n')) {
  if (line.startsWith('diff --git ')) {
    current = null;
    deleted = false;
    continue;
  }
  if (line.startsWith('deleted file mode')) { deleted = true; continue; }
  if (line.startsWith('--- ')) {
    if (deleted) {
      const f = line.slice(4).replace(/^a\//, '');
      if (!ignored(f) && isTestFile(f)) fails.push(`${f} test file deleted`);
      current = ignored(f) ? null : f;
    }
    continue;
  }
  if (line.startsWith('+++ ')) {
    const f = line.slice(4);
    if (f !== '/dev/null') current = ignored(f.replace(/^b\//, '')) ? null : f.replace(/^b\//, '');
    continue;
  }
  const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if (hunk) { newLine = Number(hunk[1]); continue; }
  if (!current) continue;
  if (line.startsWith('+')) { scanAdded(current, newLine, line.slice(1)); newLine++; }
  else if (line.startsWith('-')) scanRemoved(current, line.slice(1));
}

// Untracked files count as entirely added
const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
for (const f of untracked) {
  if (ignored(f)) continue;
  const full = path.join(root, f);
  let text;
  try {
    if (fs.statSync(full).size > 2 * 1024 * 1024) continue;
    text = fs.readFileSync(full, 'utf8');
  } catch { continue; }
  text.split(/\r?\n/).forEach((l, i) => scanAdded(f, i + 1, l));
}

for (const [file, delta] of Object.entries(assertionDelta)) {
  if (delta < 0) reviews.push(`${file} net assertions removed: ${-delta}`);
}

const out = [`Diff check against ${base}`];
out.push(fails.length ? `FAIL (${fails.length}):` : 'FAIL: none');
fails.forEach((f) => out.push(`  - ${f}`));
out.push(reviews.length ? `REVIEW (${reviews.length}), each needs a stated justification in the task:` : 'REVIEW: none');
reviews.forEach((r) => out.push(`  - ${r}`));
process.stdout.write(out.join('\n') + '\n');
process.exit(fails.length ? 1 : 0);
