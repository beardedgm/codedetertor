#!/usr/bin/env node
// codedetective self-test.
// Checks the two bundled scripts against throwaway repositories set up the way the skill really sets a
// project up (for example with .audit/ git-ignored), so a change that only works in a bare test folder is
// caught here. Uses only Node and git. Stand-in tools are used where the real one is not needed; the real
// TypeScript compiler is used when it is on PATH.
//
// Usage: node scripts/self-test.mjs
// Exit code 1 if any check fails. It writes only inside a temporary folder, which it removes.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECK_DIFF = path.join(here, 'check-diff.mjs');
const EVIDENCE = path.join(here, 'collect-evidence.mjs');
const isWin = process.platform === 'win32';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codedetective-selftest-'));
const MARK = 'selftest-marker-do-not-leak';

const results = [];
function check(name, fn) {
  try {
    const out = fn();
    results.push(out === 'skip' ? [name, 'skipped'] : [name, 'ok']);
  } catch (e) {
    results.push([name, `FAILED: ${e.message}`]);
  }
}
function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function sh(cmd, args, cwd, env) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...(env || {}) }, maxBuffer: 64 * 1024 * 1024 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const git = (cwd, ...args) => sh('git', args, cwd);
const node = (cwd, script, args, env) => sh(process.execPath, [script, ...args], cwd, env);

function write(repo, rel, text) {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function newRepo(name) {
  const repo = path.join(tmp, name);
  fs.mkdirSync(repo, { recursive: true });
  git(repo, 'init', '-q');
  git(repo, 'config', 'user.email', 'selftest@example.invalid');
  git(repo, 'config', 'user.name', 'selftest');
  write(repo, 'src/a.js', 'export const a = 1;\n');
  return repo;
}
const commit = (repo) => { git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'init'); };
const auditFiles = (repo) => write(repo, '.audit/runs/x/code-health-report.md', '# report\n');

// A stand-in command-line tool: a Node script plus the small launcher each platform needs.
function stub(binDir, name, body) {
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, `${name}-stub.mjs`), body);
  if (isWin) {
    fs.writeFileSync(path.join(binDir, `${name}.cmd`), `@echo off\r\nnode "%~dp0${name}-stub.mjs" %*\r\n`);
  } else {
    const launcher = path.join(binDir, name);
    fs.writeFileSync(launcher, `#!/bin/sh\nexec node "$(dirname "$0")/${name}-stub.mjs" "$@"\n`);
    fs.chmodSync(launcher, 0o755);
  }
}

// ---- check-diff: the snapshot must work however .audit is (or is not) ignored ----
const setups = {
  'ignored through .git/info/exclude (how the skill sets a project up)': (repo) => { commit(repo); auditFiles(repo); fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '\n.audit/\n'); },
  'ignored through .gitignore': (repo) => { write(repo, '.gitignore', '.audit/\n'); commit(repo); auditFiles(repo); },
  'not ignored': (repo) => { commit(repo); auditFiles(repo); },
  'committed to the repository': (repo) => { auditFiles(repo); commit(repo); },
};
let n = 0;
for (const [label, setup] of Object.entries(setups)) {
  check(`check-diff: snapshot works with .audit ${label}`, () => {
    const repo = newRepo(`diff-${++n}`);
    setup(repo);
    const snap = node(repo, CHECK_DIFF, ['--snapshot']);
    assert(snap.code === 0, `snapshot exited ${snap.code}: ${snap.out.trim().split('\n')[0]}`);
    const tree = snap.out.trim();
    const listed = git(repo, 'ls-tree', '-r', '--name-only', tree).out;
    assert(!/^\.audit\//m.test(listed), '.audit is inside the snapshot');
    assert(/^src\/a\.js$/m.test(listed), 'source files are missing from the snapshot');
    write(repo, '.audit/runs/x/more.md', 'more\n');
    const clean = node(repo, CHECK_DIFF, ['--base', tree]);
    assert(clean.code === 0 && /FAIL: none/.test(clean.out), 'a change inside .audit was judged as part of the fix');
  });
}

check('check-diff: an edit made before the snapshot is not blamed, a weakening made after it fails', () => {
  const repo = newRepo('diff-blame');
  commit(repo);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '\n.audit/\n');
  write(repo, 'src/mine.ts', '// @ts-ignore\nexport const mine = 1;\n');
  const tree = node(repo, CHECK_DIFF, ['--snapshot']).out.trim();
  write(repo, 'src/fix.ts', 'export const fixed = 2;\n');
  const ok = node(repo, CHECK_DIFF, ['--base', tree]);
  assert(ok.code === 0, "the developer's own earlier edit was blamed on the fix");
  write(repo, 'src/fix.ts', '// @ts-ignore\nexport const fixed = 2;\n');
  const bad = node(repo, CHECK_DIFF, ['--base', tree]);
  assert(bad.code === 1 && /adds @ts-ignore/.test(bad.out), 'an added @ts-ignore was not rejected');
});

// ---- collect-evidence ----
check('collect-evidence: refuses to run without --out', () => {
  const repo = newRepo('ev-out');
  assert(node(repo, EVIDENCE, []).code === 2, 'expected exit code 2');
});

check('preflight: writes nothing', () => {
  const repo = newRepo('pf-clean');
  commit(repo);
  const r = node(repo, EVIDENCE, ['--preflight']);
  assert(r.code === 0, `exited ${r.code}`);
  assert(git(repo, 'status', '--porcelain').out.trim() === '' && !fs.existsSync(path.join(repo, '.audit')), 'the tool check created files');
});

check('preflight: finds a type-check config below the root and the compiler installed beside it', () => {
  const repo = newRepo('pf-tsc');
  write(repo, 'package.json', '{ "name": "selftest" }\n');
  write(repo, 'shared/tsconfig.json', '{ "compilerOptions": { "strict": true, "noEmit": true } }\n');
  stub(path.join(repo, 'shared', 'node_modules', '.bin'), 'tsc', 'process.exit(0);\n');
  const r = node(repo, EVIDENCE, ['--preflight']);
  const row = r.out.split('\n').find((l) => l.startsWith('| tsc |')) || '';
  assert(/\| installed \|/.test(row), `tsc row was: ${row || '(none)'}`);
  assert(row.includes('shared/tsconfig.json'), 'the config below the root was not named');
});

check('preflight: warns when Prettier would scan .audit, and stops once .prettierignore lists it', () => {
  const repo = newRepo('pf-prettier');
  write(repo, 'package.json', '{ "name": "selftest", "devDependencies": { "prettier": "3" } }\n');
  assert(/Prettier is used here/.test(node(repo, EVIDENCE, ['--preflight']).out), 'no warning was printed');
  write(repo, '.prettierignore', 'dist/\n.audit/\n');
  assert(!/Prettier is used here/.test(node(repo, EVIDENCE, ['--preflight']).out), 'the warning stayed after .audit/ was ignored');
});

// A stand-in jscpd that behaves like the real one where it matters: version 5 rejects --gitignore.
const JSCPD_STUB = `
import fs from 'node:fs';
import path from 'node:path';
const a = process.argv.slice(2);
const version = process.env.SELFTEST_JSCPD_VERSION || '5.4.2';
if (a.includes('--version')) { console.log(version); process.exit(0); }
if (version.startsWith('5') && a.includes('--gitignore')) { console.error("error: unexpected argument '--gitignore' found"); process.exit(2); }
const out = a[a.indexOf('--output') + 1];
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'args.json'), JSON.stringify(a));
fs.writeFileSync(path.join(out, 'jscpd-report.json'), JSON.stringify({
  statistics: { total: { clones: 3, percentage: 4.2 } },
  duplicates: [
    { format: 'javascript', lines: 5, fragment: 'const k = "${MARK}";\\nsecond line', firstFile: { name: 'src/a.js', start: 1, end: 5, blame: { who: 'x' } }, secondFile: { name: 'src/b.js', start: 1, end: 5 } },
    { format: 'markdown', lines: 9, firstFile: { name: '.audit/runs/x/code-health-report.md', start: 1, end: 9 }, secondFile: { name: 'docs/a.md', start: 1, end: 9 } },
    { format: 'javascript', lines: 6, snippet: 'const other = "${MARK}";\\nsecond line', firstFile: { name: 'src/c.js' }, secondFile: { name: 'src/d.js' } },
  ],
}));
`;
// A stand-in ESLint that reports one problem and, like the real one, includes the whole file's source.
const ESLINT_STUB = `
console.log(JSON.stringify([{ filePath: process.cwd() + '/src/a.js', errorCount: 1, warningCount: 0,
  messages: [{ ruleId: 'no-unused-vars', severity: 2, message: 'unused', line: 1, column: 1 }],
  source: 'const k = "${MARK}";', output: 'const k = "${MARK}";' }]));
process.exit(1);
`;
function evidenceRepo(name, { jscpdConfig } = {}) {
  const repo = newRepo(name);
  write(repo, 'package.json', '{ "name": "selftest" }\n');
  write(repo, 'eslint.config.js', 'export default [];\n');
  if (jscpdConfig) write(repo, '.jscpd.json', '{ "path": ["src"], "ignore": ["**/data/**"] }\n');
  commit(repo);
  auditFiles(repo);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '\n.audit/\n');
  const bin = path.join(repo, 'node_modules', '.bin');
  stub(bin, 'jscpd', JSCPD_STUB);
  stub(bin, 'eslint', ESLINT_STUB);
  return repo;
}
const evidenceDir = (repo) => path.join(repo, '.audit', 'runs', 'selftest', 'evidence');
const runEvidence = (repo, env) => node(repo, EVIDENCE, ['--out', '.audit/runs/selftest/evidence'], env);
const jscpdArgs = (repo) => JSON.parse(fs.readFileSync(path.join(evidenceDir(repo), 'jscpd', 'args.json'), 'utf8'));
const jscpdRow = (out) => out.split('\n').find((l) => l.startsWith('| jscpd |')) || '';
function allEvidenceText(dir) {
  let text = '';
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) text += allEvidenceText(full);
    else if (e.name !== 'args.json') text += fs.readFileSync(full, 'utf8');
  }
  return text;
}

check('jscpd 5: --gitignore is not passed, and the check runs', () => {
  const repo = evidenceRepo('ev-jscpd5');
  const r = runEvidence(repo, { SELFTEST_JSCPD_VERSION: '5.4.2' });
  assert(/\| ran/.test(jscpdRow(r.out)), `jscpd row was: ${jscpdRow(r.out)}`);
  const args = jscpdArgs(repo);
  assert(!args.includes('--gitignore'), '--gitignore was passed to jscpd 5');
  assert(args[args.length - 1] === '.' && args.includes('--ignore'), 'the default path and ignore list were not passed');
});

check('jscpd 4: --gitignore is passed', () => {
  const repo = evidenceRepo('ev-jscpd4');
  runEvidence(repo, { SELFTEST_JSCPD_VERSION: '4.0.5' });
  assert(jscpdArgs(repo).includes('--gitignore'), '--gitignore was not passed to jscpd 4');
});

check('jscpd with a project config: no path and no ignore list are passed', () => {
  const repo = evidenceRepo('ev-jscpd-config', { jscpdConfig: true });
  const r = runEvidence(repo, { SELFTEST_JSCPD_VERSION: '5.4.2' });
  const args = jscpdArgs(repo);
  assert(!args.includes('.') && !args.includes('--ignore') && !args.includes('--min-tokens'), `unexpected arguments: ${args.join(' ')}`);
  assert(jscpdRow(r.out).includes('.jscpd.json'), 'the summary does not say the project config was used');
});

check('jscpd report: copied code is stripped and clones in .audit are dropped', () => {
  const repo = evidenceRepo('ev-jscpd-report');
  const r = runEvidence(repo, { SELFTEST_JSCPD_VERSION: '5.4.2' });
  const report = JSON.parse(fs.readFileSync(path.join(evidenceDir(repo), 'jscpd', 'jscpd-report.json'), 'utf8'));
  assert(report.duplicates.length === 2, `expected 2 clones after dropping the .audit one, got ${report.duplicates.length}`);
  assert(/clones: 2\b/.test(jscpdRow(r.out)), `jscpd row was: ${jscpdRow(r.out)}`);
  assert(!JSON.stringify(report).includes(MARK), 'copied code is still in the saved report');
});

check('evidence: file source from ESLint or jscpd is never saved', () => {
  const repo = evidenceRepo('ev-source');
  runEvidence(repo, {});
  assert(fs.existsSync(path.join(evidenceDir(repo), 'eslint.json')), 'eslint.json was not written');
  assert(!allEvidenceText(evidenceDir(repo)).includes(MARK), 'source text reached the evidence folder');
});

check('type check (real compiler): a config below the root is found and checked', () => {
  const which = sh(isWin ? 'where' : 'which', ['tsc']);
  if (which.code !== 0) return 'skip';
  const repo = newRepo('ev-tsc-real');
  write(repo, 'package.json', '{ "name": "selftest" }\n');
  write(repo, 'shared/tsconfig.json', '{ "compilerOptions": { "strict": true, "noEmit": true }, "include": ["."] }\n');
  write(repo, 'shared/a.ts', 'export const n: number = "x";\n');
  commit(repo);
  const r = runEvidence(repo, {});
  const row = r.out.split('\n').find((l) => l.startsWith('| tsc |')) || '';
  assert(/\| ran/.test(row) && /errors: 1\b/.test(row) && /filesChecked: 1\b/.test(row), `tsc row was: ${row || '(none)'}`);
  assert(!fs.readdirSync(path.join(repo, 'shared')).some((f) => f.endsWith('.tsbuildinfo')), 'a build file was written into the project');
});

fs.rmSync(tmp, { recursive: true, force: true });
const failed = results.filter(([, status]) => status.startsWith('FAILED'));
for (const [name, status] of results) process.stdout.write(`${status === 'ok' ? 'ok     ' : status === 'skipped' ? 'skipped' : 'FAILED '} ${name}${status.startsWith('FAILED') ? `\n        ${status.slice(8)}` : ''}\n`);
process.stdout.write(`\n${results.length - failed.length} of ${results.length} checks passed${results.some(([, s]) => s === 'skipped') ? ' (skipped checks need a tool that is not installed here)' : ''}.\n`);
process.exit(failed.length ? 1 : 0);
