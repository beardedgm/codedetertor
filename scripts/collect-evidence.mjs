#!/usr/bin/env node
// codedetective evidence collector.
// Runs only analyzers already installed in the project (node_modules/.bin) or on PATH.
// Never installs, never fixes, never writes outside .audit/evidence/, never prints raw tool output.
// Usage (from the repository root): node <skill-dir>/scripts/collect-evidence.mjs [--network]
//   --network  also run tools that query public vulnerability databases (npm audit, osv-scanner)

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outDir = path.join(root, '.audit', 'evidence');
const allowNetwork = process.argv.includes('--network');
const isWin = process.platform === 'win32';
const TIMEOUT_MS = 10 * 60 * 1000;
const SKIP_DIRS = new Set(['node_modules', '.git', '.audit', 'dist', 'build', 'coverage', '.next', '.turbo', '.cache', 'out', 'vendor', 'playwright-report', 'test-results']);
const CODE_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte']);

fs.mkdirSync(outDir, { recursive: true });

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

const results = [];
function record(tool, status, extra = {}) {
  results.push({ tool, status, ...extra });
}

// 1. Type checker
(() => {
  const config = firstExisting(['tsconfig.json', 'jsconfig.json']);
  if (!config) return record('tsc', 'skipped', { reason: 'no tsconfig.json or jsconfig.json' });
  const bin = findBin('tsc');
  if (!bin) return record('tsc', 'missing');
  const r = run(bin, ['--noEmit', '-p', config, '--pretty', 'false']);
  const text = r.stdout + r.stderr;
  const file = save('tsc.txt', text);
  const errors = (text.match(/error TS\d+/g) || []).length;
  record('tsc', r.timedOut ? 'timeout' : 'ran', { exit: r.code, file, counts: { errors } });
})();

// 2. Linter (uses the project's own configuration)
(() => {
  const configs = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'];
  const pkg = tryJson(exists('package.json') ? fs.readFileSync(path.join(root, 'package.json'), 'utf8') : '') || {};
  if (!firstExisting(configs) && !pkg.eslintConfig) return record('eslint', 'skipped', { reason: 'no ESLint configuration found' });
  const bin = findBin('eslint');
  if (!bin) return record('eslint', 'missing');
  const r = run(bin, ['.', '--format', 'json', '--no-error-on-unmatched-pattern']);
  const file = save('eslint.json', r.stdout || r.stderr);
  const data = tryJson(r.stdout);
  if (!Array.isArray(data)) return record('eslint', 'error', { exit: r.code, file, reason: 'output was not JSON; see file' });
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
  record('eslint', 'ran', { exit: r.code, file, counts: { errors, warnings }, topRules });
})();

// 3. Dead code: unused files, exports, dependencies
(() => {
  if (!exists('package.json')) return record('knip', 'skipped', { reason: 'no package.json' });
  const bin = findBin('knip');
  if (!bin) return record('knip', 'missing');
  const r = run(bin, ['--reporter', 'json', '--no-exit-code', '--no-progress']);
  const file = save('knip.json', r.stdout || r.stderr);
  const data = tryJson(r.stdout);
  if (!data) return record('knip', 'error', { exit: r.code, file, reason: 'output was not JSON; see file' });
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
  const args = ['--circular', '--json', '--extensions', 'js,jsx,mjs,cjs,ts,tsx'];
  const tsconfig = firstExisting(['tsconfig.json', 'jsconfig.json']);
  if (tsconfig) args.push('--ts-config', tsconfig);
  const r = run(bin, [...args, ...targets]);
  const file = save('madge-circular.json', r.stdout || r.stderr);
  const data = tryJson(r.stdout);
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
    '--ignore', '**/node_modules/**,**/dist/**,**/build/**,**/.audit/**,**/coverage/**,**/*.min.js,**/package-lock.json',
    '--silent',
    '.',
  ]);
  const reportFile = path.join(reportDir, 'jscpd-report.json');
  const data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!data) {
    const file = save('jscpd.txt', r.stdout + r.stderr);
    return record('jscpd', 'error', { exit: r.code, file, reason: 'no JSON report produced; see file' });
  }
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
  const data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!Array.isArray(data)) {
    // Do not save stdout/stderr here: on error it could echo content. Record only the failure.
    return record('gitleaks', 'error', { exit: r.code, reason: 'no JSON report produced' });
  }
  const byRule = {};
  for (const f of data) byRule[f.RuleID || 'unknown'] = (byRule[f.RuleID || 'unknown'] || 0) + 1;
  record('gitleaks', 'ran', { exit: r.code, file: path.relative(root, reportFile), counts: { findings: data.length }, byRule });
})();

// 7. Network tools (only with --network)
(() => {
  if (!allowNetwork) {
    record('npm audit', 'skipped', { reason: 'needs network; rerun with --network if the user agrees' });
    record('osv-scanner', 'skipped', { reason: 'needs network; rerun with --network if the user agrees' });
    return;
  }
  if (exists('package-lock.json') || exists('npm-shrinkwrap.json')) {
    const npm = findBin('npm');
    if (!npm) record('npm audit', 'missing');
    else {
      const r = run(npm, ['audit', '--json']);
      const file = save('npm-audit.json', r.stdout || r.stderr);
      const data = tryJson(r.stdout);
      const v = data && data.metadata && data.metadata.vulnerabilities;
      record('npm audit', data ? 'ran' : 'error', { exit: r.code, file, counts: v || null });
    }
  } else {
    record('npm audit', 'skipped', { reason: 'no package-lock.json' });
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
    ['test-skip', /\b(?:it|test|describe|context)\.(?:skip|fixme|todo)\s*\(|\b(?:xit|xdescribe|xtest)\s*\(/],
    ['test-only', /\b(?:it|test|describe|context)\.only\s*\(|\b(?:fit|fdescribe)\s*\(/],
    ['empty-catch', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/],
    ['tls-disabled', /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED/],
  ];
  const hits = [];
  const counts = Object.fromEntries(patterns.map(([k]) => [k, 0]));
  let scanned = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      if (!CODE_EXT.has(path.extname(e.name))) continue;
      let text;
      try {
        if (fs.statSync(full).size > 2 * 1024 * 1024) continue;
        text = fs.readFileSync(full, 'utf8');
      } catch { continue; }
      scanned++;
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const [kind, re] of patterns) {
          if (re.test(line)) {
            counts[kind]++;
            hits.push({ file: path.relative(root, full), line: i + 1, kind });
          }
        }
      });
    }
  }
  walk(root);
  const file = save('suppressions.json', JSON.stringify(hits, null, 2));
  record('suppression scan', 'ran', { file, filesScanned: scanned, counts });
})();

// Summary
const summary = { generatedAt: new Date().toISOString(), root, network: allowNetwork, results };
save('summary.json', JSON.stringify(summary, null, 2));

const lines = ['# Evidence Summary', '', `Generated: ${summary.generatedAt}`, `Network tools: ${allowNetwork ? 'enabled' : 'disabled'}`, '', '| Tool | Status | Key counts | Output |', '|---|---|---|---|'];
for (const r of results) {
  const counts = r.counts ? Object.entries(r.counts).map(([k, v]) => `${k}: ${v}`).join(', ') : (r.reason || '');
  lines.push(`| ${r.tool} | ${r.status}${r.exit != null ? ` (exit ${r.exit})` : ''} | ${counts} | ${r.file || ''} |`);
}
const missing = results.filter((r) => r.status === 'missing').map((r) => r.tool);
if (missing.length) {
  lines.push('', `Not installed (recommend to the user; never install during reconnaissance): ${missing.join(', ')}`);
}
const md = lines.join('\n') + '\n';
save('summary.md', md);
process.stdout.write(md);
