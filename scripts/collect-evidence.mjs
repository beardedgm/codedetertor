#!/usr/bin/env node
// codedetective evidence collector.
// Runs only analyzers already installed in the project (node_modules/.bin) or on PATH.
// Never installs, never fixes, never writes outside the --out folder, never prints raw tool output.
// Saved output never holds source code: ESLint sources and fixes and jscpd fragments are stripped, and
// long token-like string literals in diagnostics are redacted, so reading the evidence cannot print a secret.
// Usage (from the repository root):
//   node <skill-dir>/scripts/collect-evidence.mjs --out <dir> [--compare <dir>] [--scan-dir <dir>] [--network]
//   --out <dir>       required: where to write results, inside .audit/ (normally .audit/runs/<run-id>/evidence)
//   --compare <dir>   an earlier output folder; adds a before/after table of the key counts
//   --scan-dir <dir>  also secret-scan a build output folder with gitleaks, values redacted
//   --network         also run tools that query public vulnerability databases (npm audit, pnpm audit, osv-scanner)
// Everything under .audit/ (earlier audits, scratch scripts, harnesses) is excluded from every tool,
// and filtered out of their results as well, so audit artifacts never count as findings. Files git ignores
// (virtual environments, build folders, installed packages) are not scanned either.
//
// Statuses: "ran" is a complete check. "partial" ran but could not check everything; what it found is real,
// but a zero proves nothing for the part it skipped. Every other status means the check did not happen.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
};
const outArg = argValue('--out');
if (!outArg) {
  // No default: an implicit folder would land outside the run and later be mistaken for a legacy audit.
  process.stderr.write('--out is required, for example --out .audit/runs/<run-id>/evidence\n');
  process.exit(2);
}
const outDir = path.resolve(root, outArg);
const auditRoot = path.join(root, '.audit');
if (outDir === auditRoot || !outDir.startsWith(auditRoot + path.sep)) {
  process.stderr.write('--out must point to a folder inside .audit/\n');
  process.exit(2);
}
const allowNetwork = process.argv.includes('--network');
const compareDir = argValue('--compare');
const scanDir = argValue('--scan-dir');
const isWin = process.platform === 'win32';
const TIMEOUT_MS = 10 * 60 * 1000;
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.audit', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', 'out', 'vendor', 'playwright-report', 'test-results',
  // Installed packages and build output of other ecosystems, for folders that are not git repositories.
  '.venv', 'venv', '__pycache__', 'site-packages', '.tox', '.nox', '.mypy_cache', '.pytest_cache', '.ruff_cache', 'target', '.gradle', 'Pods',
]);
const CODE_EXT = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte',
  '.py', '.go', '.rs', '.rb', '.java', '.kt', '.cs', '.php', '.swift',
]);

fs.mkdirSync(outDir, { recursive: true });

// True for any path (relative or absolute, either slash style) that lies under .audit/.
const AUDIT_PATH = /(^|[\\/])\.audit([\\/]|$)/;
const inAudit = (p) => typeof p === 'string' && AUDIT_PATH.test(path.isAbsolute(p) ? path.relative(root, p) : p);

const exists = (p) => fs.existsSync(path.join(root, p));
const firstExisting = (list) => list.find(exists);

function findBin(name) {
  const local = path.join(root, 'node_modules', '.bin', name + (isWin ? '.cmd' : ''));
  if (fs.existsSync(local)) return local;
  const exts = isWin ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch { /* not here */ }
    }
  }
  return null;
}

function run(bin, args) {
  const useShell = isWin && /\.(cmd|bat)$/i.test(bin);
  const res = spawnSync(bin, args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: TIMEOUT_MS,
    shell: useShell,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  return {
    code: res.status,
    timedOut: res.error && res.error.code === 'ETIMEDOUT',
    error: res.error ? String(res.error.message || res.error) : null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function save(name, text) {
  const file = path.join(outDir, name);
  fs.writeFileSync(file, text);
  return path.relative(root, file);
}

function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// Diagnostics can quote a string literal from the code (a TypeScript literal type, a lint message).
// Redact quoted values that look like tokens or keys: 20+ characters, no spaces, letters and digits mixed.
// Module paths and ordinary words are left alone so the message stays useful.
const QUOTED = /(["'`])([^"'`\s]{20,})\1/g;
const tokenLike = (s) => /\d/.test(s) && /[A-Za-z]/.test(s) && !/^[./@~]/.test(s) && !/\.(?:[cm]?[jt]sx?|json|d\.ts)$/.test(s);
const redact = (text) => String(text).replace(QUOTED, (m, q, s) => (tokenLike(s) ? `${q}[redacted ${s.length} chars]${q}` : m));

const results = [];
function record(tool, status, extra = {}) {
  results.push({ tool, status, ...extra });
}

// 1. Type checker
// Solution-style configs ("files": [] plus "references", the default Vite layout) check nothing with -p,
// so every referenced project is expanded and checked on its own. Build info goes to a temp folder,
// never into the repository. A run that checked zero project files is reported as such, never as 0 errors.
(() => {
  const config = firstExisting(['tsconfig.json', 'jsconfig.json']);
  if (!config) return record('tsc', 'skipped', { reason: 'no tsconfig.json or jsconfig.json' });
  const bin = findBin('tsc');
  if (!bin) return record('tsc', 'missing');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codedetective-tsc-'));
  const projects = [];
  const seen = new Set();
  const addProject = (cfgPath) => {
    const abs = path.resolve(root, cfgPath);
    if (seen.has(abs) || inAudit(abs)) return;
    seen.add(abs);
    projects.push(abs);
    const shown = tryJson(run(bin, ['--showConfig', '-p', abs]).stdout) || {};
    for (const ref of shown.references || []) {
      let refPath = path.resolve(path.dirname(abs), ref.path || '');
      if (fs.existsSync(refPath) && fs.statSync(refPath).isDirectory()) refPath = path.join(refPath, 'tsconfig.json');
      if (fs.existsSync(refPath)) addProject(refPath);
    }
  };
  addProject(config);

  const projectFile = (f) => f && !/[\\/]node_modules[\\/]/.test(f) && !/[\\/]lib\.[^\\/]*\.d\.ts$/.test(f) && !inAudit(f);
  const checkedFiles = new Set();
  const kept = new Set();
  const perProject = [];
  let timedOut = false;
  projects.forEach((proj, i) => {
    const listed = run(bin, ['--listFilesOnly', '-p', proj]).stdout.split(/\r?\n/).map((s) => s.trim()).filter(projectFile);
    listed.forEach((f) => checkedFiles.add(path.resolve(f)));
    perProject.push({ project: path.relative(root, proj), files: listed.length });
    if (!listed.length) return; // a solution root with only references
    const r = run(bin, ['--noEmit', '-p', proj, '--pretty', 'false', '--tsBuildInfoFile', path.join(tmp, `p${i}.tsbuildinfo`)]);
    if (r.timedOut) timedOut = true;
    // Drop diagnostics (and their indented continuation lines) for files under .audit/; dedupe across projects.
    let skipping = false;
    let current = [];
    const flush = () => { if (current.length) kept.add(current.join('\n')); current = []; };
    for (const line of (r.stdout + r.stderr).split(/\r?\n/)) {
      const head = line.match(/^(\S[^(]*)\(\d+,\d+\): /);
      if (head) { flush(); skipping = inAudit(head[1]); }
      else if (!/^\s/.test(line)) { flush(); skipping = false; }
      if (!skipping && line) current.push(line);
    }
    flush();
  });
  fs.rmSync(tmp, { recursive: true, force: true });
  const text = redact([...kept].join('\n'));
  const file = save('tsc.txt', text);
  const filesChecked = checkedFiles.size;
  if (!filesChecked) {
    return record('tsc', 'checked no files', { file, reason: 'the configs include no project files; treat type checking as Unverified', projects: perProject });
  }
  // TS6305: a referenced composite project has no built output yet. Checking without building is how this
  // script stays read-only, so this is a gap in the check, not a type error in the code.
  const unbuiltReferences = (text.match(/error TS6305\b/g) || []).length;
  const errors = (text.match(/error TS\d+/g) || []).length - unbuiltReferences;
  const counts = { errors, filesChecked, projects: projects.length };
  if (unbuiltReferences) {
    counts.unbuiltReferences = unbuiltReferences;
    return record('tsc', timedOut ? 'timeout' : 'partial', {
      file, counts, projects: perProject,
      reason: 'referenced projects are not built (TS6305), so imports across project references were not type-checked; those errors are real, but a zero proves nothing for cross-project types',
    });
  }
  record('tsc', timedOut ? 'timeout' : 'ran', { file, counts, projects: perProject });
})();

// 2. Linter (uses the project's own configuration)
(() => {
  const configs = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'];
  const pkg = tryJson(exists('package.json') ? fs.readFileSync(path.join(root, 'package.json'), 'utf8') : '') || {};
  if (!firstExisting(configs) && !pkg.eslintConfig) return record('eslint', 'skipped', { reason: 'no ESLint configuration found' });
  const bin = findBin('eslint');
  if (!bin) return record('eslint', 'missing');
  const r = run(bin, ['.', '--format', 'json', '--no-error-on-unmatched-pattern', '--ignore-pattern', '.audit/**']);
  const raw = tryJson(r.stdout);
  if (!Array.isArray(raw)) {
    // stdout may be partial JSON carrying file sources, so only the error stream is kept.
    const file = save('eslint-error.txt', redact(r.stderr || '(no error output)'));
    return record('eslint', 'error', { exit: r.code, file, reason: 'output was not JSON; see file' });
  }
  // ESLint's JSON carries each flagged file's full text (source, output) and fix text: strip them all,
  // keeping only where each problem is and what it is.
  const data = raw.filter((f) => !inAudit(f.filePath)).map((f) => ({
    filePath: f.filePath,
    errorCount: f.errorCount,
    warningCount: f.warningCount,
    fatalErrorCount: f.fatalErrorCount,
    messages: (f.messages || []).map((m) => ({
      ruleId: m.ruleId, severity: m.severity, message: redact(m.message || ''),
      line: m.line, column: m.column, endLine: m.endLine, endColumn: m.endColumn, fatal: m.fatal,
    })),
  }));
  const file = save('eslint.json', JSON.stringify(data));
  const rules = {};
  let errors = 0, warnings = 0;
  for (const f of data) {
    errors += f.errorCount || 0;
    warnings += f.warningCount || 0;
    for (const m of f.messages || []) {
      const id = m.ruleId || '(parse error)';
      rules[id] = (rules[id] || 0) + 1;
    }
  }
  const topRules = Object.entries(rules).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const complexity = (rules['sonarjs/cognitive-complexity'] || 0) + (rules['complexity'] || 0);
  record('eslint', 'ran', { exit: r.code, file, counts: { errors, warnings, complexity }, topRules });
})();

// 3. Dead code: unused files, exports, dependencies
(() => {
  if (!exists('package.json')) return record('knip', 'skipped', { reason: 'no package.json' });
  const bin = findBin('knip');
  if (!bin) return record('knip', 'missing');
  const r = run(bin, ['--reporter', 'json', '--no-exit-code', '--no-progress']);
  const data = tryJson(r.stdout);
  if (!data) {
    const file = save('knip.json', r.stdout || r.stderr);
    return record('knip', 'error', { exit: r.code, file, reason: 'output was not JSON; see file' });
  }
  if (Array.isArray(data.files)) data.files = data.files.filter((f) => !inAudit(f));
  if (Array.isArray(data.issues)) data.issues = data.issues.filter((i) => !inAudit(i.file));
  const file = save('knip.json', JSON.stringify(data));
  const counts = { unusedFiles: Array.isArray(data.files) ? data.files.length : 0 };
  for (const issue of data.issues || []) {
    for (const [key, val] of Object.entries(issue)) {
      if (Array.isArray(val) && val.length) counts[key] = (counts[key] || 0) + val.length;
    }
  }
  record('knip', 'ran', { exit: r.code, file, counts });
})();

// 4. Circular imports
(() => {
  const bin = findBin('madge');
  if (!bin) return record('madge', 'missing');
  const dirs = ['src', 'client', 'server', 'shared', 'app', 'lib', 'packages'].filter(exists);
  const targets = dirs.length ? dirs : ['.'];
  const args = ['--circular', '--json', '--extensions', 'js,jsx,mjs,cjs,ts,tsx', '--exclude', '(^|/)\\.audit/'];
  const tsconfig = firstExisting(['tsconfig.json', 'jsconfig.json']);
  if (tsconfig) args.push('--ts-config', tsconfig);
  const r = run(bin, [...args, ...targets]);
  let data = tryJson(r.stdout);
  if (Array.isArray(data)) data = data.filter((cycle) => !cycle.some(inAudit));
  const file = save('madge-circular.json', data ? JSON.stringify(data) : (r.stdout || r.stderr));
  record('madge', data ? 'ran' : 'error', { exit: r.code, file, targets, counts: { cycles: Array.isArray(data) ? data.length : null } });
})();

// 5. Duplication
(() => {
  const bin = findBin('jscpd');
  if (!bin) return record('jscpd', 'missing');
  const reportDir = path.join(outDir, 'jscpd');
  const r = run(bin, [
    '--min-tokens', '50',
    '--reporters', 'json',
    '--output', reportDir,
    '--gitignore',
    '--ignore', [
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/.audit/**', '**/coverage/**', '**/*.min.js', '**/package-lock.json',
      '**/.venv/**', '**/venv/**', '**/site-packages/**', '**/__pycache__/**', '**/target/**', '**/vendor/**',
      // Repeated setup in tests and fixtures is normal; QUAL-02 counts production duplication only.
      '**/__tests__/**', '**/__mocks__/**', '**/__fixtures__/**', '**/fixtures/**', '**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go',
    ].join(','),
    '--silent',
    '.',
  ]);
  const reportFile = path.join(reportDir, 'jscpd-report.json');
  const data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!data) {
    // Never keep a report that could not be parsed: it may hold copied code.
    fs.rmSync(reportDir, { recursive: true, force: true });
    const file = save('jscpd-error.txt', redact(r.stderr || '(no error output)'));
    return record('jscpd', 'error', { exit: r.code, file, reason: 'no JSON report produced; see file' });
  }
  // The report copies each duplicated block of code (fragment) and may include blame data: keep locations only.
  for (const d of data.duplicates || []) {
    delete d.fragment;
    for (const side of [d.firstFile, d.secondFile]) if (side) delete side.blame;
  }
  fs.writeFileSync(reportFile, JSON.stringify(data));
  const total = (data.statistics && data.statistics.total) || {};
  record('jscpd', 'ran', {
    exit: r.code,
    file: path.relative(root, reportFile),
    counts: { clones: total.clones ?? (data.duplicates || []).length, duplicatedPercent: total.percentage ?? null },
  });
})();

// 6. Secrets in repository and history (values redacted; never printed)
(() => {
  const bin = findBin('gitleaks');
  if (!bin) return record('gitleaks', 'missing');
  const reportFile = path.join(outDir, 'gitleaks.json');
  const r = run(bin, ['detect', '--no-banner', '--redact', '--source', '.', '--report-format', 'json', '--report-path', reportFile, '--exit-code', '0']);
  let data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!Array.isArray(data)) {
    // Do not save stdout/stderr here: on error it could echo content. Record only the failure.
    return record('gitleaks', 'error', { exit: r.code, reason: 'no JSON report produced' });
  }
  data = data.filter((f) => !inAudit(f.File));
  fs.writeFileSync(reportFile, JSON.stringify(data, null, 2));
  const byRule = {};
  for (const f of data) byRule[f.RuleID || 'unknown'] = (byRule[f.RuleID || 'unknown'] || 0) + 1;
  record('gitleaks', 'ran', { exit: r.code, file: path.relative(root, reportFile), counts: { findings: data.length }, byRule });
})();

// 6b. Secrets in a build output folder (only with --scan-dir), values redacted and never printed
(() => {
  if (!scanDir) return;
  const target = path.resolve(root, scanDir);
  if (!fs.existsSync(target)) return record('gitleaks (build output)', 'skipped', { reason: `${scanDir} does not exist; build it locally first` });
  const bin = findBin('gitleaks');
  if (!bin) return record('gitleaks (build output)', 'missing');
  const reportFile = path.join(outDir, 'gitleaks-build-output.json');
  const r = run(bin, ['detect', '--no-git', '--no-banner', '--redact', '--source', target, '--report-format', 'json', '--report-path', reportFile, '--exit-code', '0']);
  const data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!Array.isArray(data)) return record('gitleaks (build output)', 'error', { exit: r.code, reason: 'no JSON report produced' });
  record('gitleaks (build output)', 'ran', { exit: r.code, file: path.relative(root, reportFile), counts: { findings: data.length } });
})();

// 7. Network tools (only with --network)
(() => {
  if (!allowNetwork) {
    const reason = 'needs network and the user has not agreed; known vulnerabilities (SEC-19) stay Unverified until this runs';
    record('npm audit', 'skipped', { reason });
    record('osv-scanner', 'skipped', { reason });
    return;
  }
  const lock = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].find(exists);
  const manager = !lock ? null : lock.startsWith('pnpm') ? 'pnpm' : lock.startsWith('yarn') ? 'yarn' : lock.startsWith('bun') ? 'bun' : 'npm';
  if (!manager) {
    record('npm audit', 'skipped', { reason: 'no JavaScript lockfile' });
  } else if (manager === 'npm' || manager === 'pnpm') {
    const bin = findBin(manager);
    if (!bin) record(`${manager} audit`, 'missing');
    else {
      const r = run(bin, ['audit', '--json']);
      const file = save(`${manager}-audit.json`, r.stdout || r.stderr);
      const data = tryJson(r.stdout);
      const v = data && data.metadata && data.metadata.vulnerabilities;
      record(`${manager} audit`, data ? 'ran' : 'error', { exit: r.code, file, counts: v || null });
    }
  } else {
    record(`${manager} audit`, 'skipped', { reason: `${lock} found; osv-scanner reads it, so rely on osv-scanner for known vulnerabilities` });
  }
  const osv = findBin('osv-scanner');
  if (!osv) return record('osv-scanner', 'missing');
  let r = run(osv, ['scan', 'source', '-r', '.', '--format', 'json']);
  if (!tryJson(r.stdout)) r = run(osv, ['-r', '.', '--format', 'json']);
  const file = save('osv-scanner.json', r.stdout || r.stderr);
  const data = tryJson(r.stdout);
  let vulns = null;
  if (data && Array.isArray(data.results)) {
    vulns = 0;
    for (const res of data.results) for (const p of res.packages || []) vulns += (p.vulnerabilities || []).length;
  }
  record('osv-scanner', data ? 'ran' : 'error', { exit: r.code, file, counts: { vulnerabilities: vulns } });
})();

// 8. Suppressions, skips, focus markers, empty catches (built in, no tool needed)
(() => {
  const patterns = [
    ['ts-ignore', /@ts-ignore\b/],
    ['ts-nocheck', /@ts-nocheck\b/],
    ['ts-expect-error', /@ts-expect-error\b/],
    ['eslint-disable', /eslint-disable(?:-next-line|-line)?\b/],
    ['test-skip', /\b(?:it|test|describe|context|suite)(?:\.\w+)*\.(?:skip|skipIf|runIf|fixme|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/],
    ['test-only', /\b(?:it|test|describe|context|suite)(?:\.\w+)*\.only\s*\(|\b(?:fit|fdescribe)\s*\(/],
    ['empty-catch', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/],
    ['tls-disabled', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED|verify\s*=\s*False|InsecureSkipVerify\s*:\s*true/],
    ['py-noqa', /#\s*noqa\b/],
    ['py-type-ignore', /#\s*type:\s*ignore\b/],
    ['py-test-skip', /@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.skip\s*\(|@unittest\.skip/],
    ['go-nolint', /\/\/\s*nolint\b/],
    ['go-test-skip', /\bt\.Skip(?:Now|f)?\s*\(/],
    ['rust-ignore-or-allow', /#\[ignore\]|#!?\[allow\(/],
  ];
  const hits = [];
  const counts = Object.fromEntries(patterns.map(([k]) => [k, 0]));
  let scanned = 0;
  function scanFile(full) {
    if (!CODE_EXT.has(path.extname(full))) return;
    let text;
    try {
      const st = fs.lstatSync(full);
      if (!st.isFile() || st.size > 2 * 1024 * 1024) return;
      text = fs.readFileSync(full, 'utf8');
    } catch { return; }
    scanned++;
    text.split(/\r?\n/).forEach((line, i) => {
      for (const [kind, re] of patterns) {
        if (re.test(line)) {
          counts[kind]++;
          hits.push({ file: path.relative(root, full), line: i + 1, kind });
        }
      }
    });
  }
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(full); }
      else scanFile(full);
    }
  }
  // In a git repository, scan exactly the files git would track (committed or new, never ignored), so
  // virtual environments and installed packages are left out whatever they are called. Otherwise, walk.
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (listed.status === 0) {
    const skipped = (rel) => rel.split('/').some((seg) => SKIP_DIRS.has(seg));
    for (const rel of new Set(listed.stdout.split('\0').filter(Boolean))) {
      if (!skipped(rel) && !inAudit(rel)) scanFile(path.join(root, rel));
    }
  } else {
    walk(root);
  }
  const file = save('suppressions.json', JSON.stringify(hits, null, 2));
  if (!scanned) return record('suppression scan', 'not applicable', { reason: 'no source files in a supported language; this is not a clean result' });
  for (const k of Object.keys(counts)) if (!counts[k]) delete counts[k];
  record('suppression scan', 'ran', { file, filesScanned: scanned, counts: { total: hits.length, ...counts } });
})();

// Summary
const summary = { generatedAt: new Date().toISOString(), root, network: allowNetwork, results };
save('summary.json', JSON.stringify(summary, null, 2));

const lines = ['# Evidence Summary', '', `Generated: ${summary.generatedAt}`, `Network tools: ${allowNetwork ? 'enabled' : 'disabled'}`, '', '| Tool | Status | Key counts | Output |', '|---|---|---|---|'];
for (const r of results) {
  const counts = r.counts ? Object.entries(r.counts).map(([k, v]) => `${k}: ${v}`).join(', ') : (r.reason || '');
  lines.push(`| ${r.tool} | ${r.status}${r.exit != null ? ` (exit ${r.exit})` : ''} | ${counts} | ${r.file || ''} |`);
}
if (compareDir) {
  const before = tryJson((() => { try { return fs.readFileSync(path.resolve(root, compareDir, 'summary.json'), 'utf8'); } catch { return ''; } })());
  if (!before) {
    lines.push('', `Compare: no summary.json in ${compareDir}`);
  } else {
    lines.push('', `## Change since ${compareDir}`, '', '| Tool | Count | Before | After | Change |', '|---|---|---|---|---|');
    let changed = 0;
    const prior = Object.fromEntries((before.results || []).map((r) => [r.tool, r]));
    for (const r of results) {
      const old = prior[r.tool];
      if (!old || !old.counts || !r.counts) continue;
      for (const [k, v] of Object.entries(r.counts)) {
        const was = old.counts[k];
        if (typeof v !== 'number' || typeof was !== 'number' || v === was) continue;
        lines.push(`| ${r.tool} | ${k} | ${was} | ${v} | ${v > was ? '+' : ''}${v - was} |`);
        changed++;
      }
    }
    if (!changed) lines.push('| (none) | No count changed | | | |');
  }
}
const missing = results.filter((r) => r.status === 'missing').map((r) => r.tool);
if (missing.length) {
  lines.push('', `Not installed (recommend to the user; never install during reconnaissance): ${missing.join(', ')}`);
}
const partial = results.filter((r) => r.status === 'partial').map((r) => r.tool);
if (partial.length) {
  lines.push('', `Partial (findings are real, but a zero proves nothing for what was skipped): ${partial.join(', ')}`);
}
const notRun = results.filter((r) => r.status !== 'ran' && r.status !== 'partial').map((r) => `${r.tool} (${r.status})`);
if (notRun.length) {
  lines.push('', `Did not happen (items that rely on these stay Unverified, never Passed): ${notRun.join(', ')}`);
}
const md = lines.join('\n') + '\n';
save('summary.md', md);
process.stdout.write(md);
