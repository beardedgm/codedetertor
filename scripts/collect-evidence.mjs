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
//
//   node <skill-dir>/scripts/collect-evidence.mjs --preflight
//       Only checks which tools are installed and prints, for each one that is missing, what the audit cannot
//       prove without it and how to get it. Runs no tool and writes nothing. Use it before an audit starts.
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
const preflight = process.argv.includes('--preflight');
const outArg = argValue('--out');
if (!outArg && !preflight) {
  // No default: an implicit folder would land outside the run and later be mistaken for a legacy audit.
  process.stderr.write('--out is required, for example --out .audit/runs/<run-id>/evidence\n');
  process.exit(2);
}
const outDir = preflight ? null : path.resolve(root, outArg);
const auditRoot = path.join(root, '.audit');
if (!preflight && (outDir === auditRoot || !outDir.startsWith(auditRoot + path.sep))) {
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

if (!preflight) fs.mkdirSync(outDir, { recursive: true });

// True for any path (relative or absolute, either slash style) that lies under .audit/.
const AUDIT_PATH = /(^|[\\/])\.audit([\\/]|$)/;
const inAudit = (p) => typeof p === 'string' && AUDIT_PATH.test(path.isAbsolute(p) ? path.relative(root, p) : p);

const exists = (p) => fs.existsSync(path.join(root, p));
const firstExisting = (list) => list.find(exists);

// Looks in node_modules/.bin from `fromDir` up to the repository root (a tool may be installed in a
// sub-package such as client/ or shared/), then on PATH.
function findBin(name, fromDir = root) {
  const file = name + (isWin ? '.cmd' : '');
  let dir = path.resolve(fromDir);
  if (dir !== root && !dir.startsWith(root + path.sep)) dir = root;
  for (;;) {
    const local = path.join(dir, 'node_modules', '.bin', file);
    if (fs.existsSync(local)) return local;
    if (dir === root) break;
    dir = path.dirname(dir);
  }
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

// Config files often live below the repository root (client/, server/, shared/, packages/*). Returns the
// first of `names` found in the root and in each folder up to `maxDepth` levels down, skipping hidden,
// dependency and build folders. Paths are relative to the root, with forward slashes.
function findConfigs(names, maxDepth = 2) {
  const found = [];
  const visit = (rel, depth) => {
    const hit = names.find((n) => exists(rel ? `${rel}/${n}` : n));
    if (hit) found.push(rel ? `${rel}/${hit}` : hit);
    if (depth >= maxDepth) return;
    let entries;
    try { entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      // Test fixtures often carry their own config for a deliberately broken sample project.
      if (!e.isDirectory() || e.isSymbolicLink() || e.name.startsWith('.') || SKIP_DIRS.has(e.name) || /^(__)?fixtures(__)?$|^__mocks__$/.test(e.name)) continue;
      visit(rel ? `${rel}/${e.name}` : e.name, depth + 1);
    }
  };
  visit('', 0);
  return found;
}
const TS_CONFIG_NAMES = ['tsconfig.json', 'jsconfig.json'];
const tscFor = (config) => findBin('tsc', path.dirname(path.resolve(root, config)));

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

// What each tool proves. Used by --preflight and by the summary, so a missing tool is always named together
// with the checklist items it leaves unproven.
const PROVES = {
  tsc: 'type errors (ARCH-03, QUAL-05)',
  eslint: 'lint health (QUAL-10) and, with a complexity rule, function complexity (QUAL-01)',
  knip: 'dead code and unused dependencies (QUAL-03)',
  madge: 'circular imports (ARCH-01, QUAL-04)',
  jscpd: 'duplicated code (QUAL-02)',
  gitleaks: 'secrets in the repository and its history (SEC-12)',
  'npm audit': 'known vulnerabilities in dependencies (SEC-19)',
  'pnpm audit': 'known vulnerabilities in dependencies (SEC-19)',
  'osv-scanner': 'known vulnerabilities in dependencies (SEC-19)',
};
const proves = (tool) => PROVES[tool] || PROVES[tool.replace(/ \(.*\)$/, '')] || '';
const ESLINT_CONFIGS = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'];
const LOCKFILES = ['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'];
const managerOf = (lock) => (!lock ? null : lock.startsWith('pnpm') ? 'pnpm' : lock.startsWith('yarn') ? 'yarn' : lock.startsWith('bun') ? 'bun' : 'npm');

// --preflight: say what is installed and what each missing tool costs, before any audit time is spent.
// It only looks for files and programs. It runs no tool and writes nothing.
if (preflight) {
  // Tools for languages the evidence script does not run itself (see references/tools-by-language.md).
  // Each entry is [alternatives, what it proves, optional]; any one alternative is enough. Optional tools only
  // add leads for Pass 1, which proves its findings by tracing the code, so missing one blocks no verdict.
  const LEADS = 'extra security leads for Pass 1';
  const OTHER_LANGUAGES = {
    Python: { ext: ['.py'], tools: [[['ruff'], 'lint health (QUAL-10)'], [['mypy', 'pyright'], 'type errors (ARCH-03, QUAL-05)'], [['bandit'], LEADS, true], [['pip-audit'], 'known vulnerabilities in dependencies (SEC-19)'], [['vulture'], 'dead code (QUAL-03)']] },
    Go: { ext: ['.go'], tools: [[['go'], 'compile and vet errors (ARCH-03, QUAL-10)'], [['staticcheck', 'golangci-lint'], 'lint health and unused code (QUAL-10, QUAL-03)'], [['gosec'], LEADS, true], [['govulncheck'], 'known vulnerabilities in dependencies (SEC-19)']] },
    Rust: { ext: ['.rs'], tools: [[['cargo'], 'compile errors and unused code (ARCH-03, QUAL-03)'], [['cargo-clippy'], 'lint health (QUAL-10)'], [['cargo-audit'], 'known vulnerabilities in dependencies (SEC-19)']] },
    Ruby: { ext: ['.rb'], tools: [[['rubocop'], 'lint health (QUAL-10)'], [['brakeman'], `${LEADS} (Rails)`, true], [['bundle-audit', 'bundler-audit'], 'known vulnerabilities in dependencies (SEC-19)']] },
    PHP: { ext: ['.php'], tools: [[['phpstan', 'psalm'], 'lint health and type errors (QUAL-10, ARCH-03)'], [['composer'], 'known vulnerabilities in dependencies, through composer audit (SEC-19)']] },
  };
  const extCounts = {};
  const bump = (rel) => {
    const ext = path.extname(rel).toLowerCase();
    if (CODE_EXT.has(ext)) extCounts[ext] = (extCounts[ext] || 0) + 1;
  };
  const listed = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const inGit = listed.status === 0;
  if (inGit) {
    for (const rel of listed.stdout.split('\0').filter(Boolean)) {
      if (!rel.split('/').some((seg) => SKIP_DIRS.has(seg)) && !inAudit(rel)) bump(rel);
    }
  } else {
    const walk = (dir) => {
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name)); }
        else bump(e.name);
      }
    };
    walk(root);
  }

  const pkg = exists('package.json') ? tryJson(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) || {} : null;
  const lock = LOCKFILES.find(exists);
  const manager = managerOf(lock);
  // With a package.json, install as a dev dependency using the project's own package manager; without one, globally.
  const install = (name) => (pkg ? `${{ npm: 'npm install --save-dev', pnpm: 'pnpm add -D', yarn: 'yarn add -D', bun: 'bun add -d' }[manager || 'npm']} ${name}` : `npm install -g ${name}`);
  const platformHint = (win, mac, other) => (isWin ? win : process.platform === 'darwin' ? mac : other);
  const rows = [];
  const add = (tool, status, what, how = '') => rows.push({ tool, status, what, how });
  const notes = [];

  const jsFiles = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.vue', '.svelte'].reduce((n, e) => n + (extCounts[e] || 0), 0);
  if (pkg || jsFiles) {
    // Same discovery as the real run: configs at the root or up to two folders down, compiler nearest each.
    const tsConfigs = findConfigs(TS_CONFIG_NAMES);
    const tsBin = tsConfigs.some(tscFor) || Boolean(findBin('tsc'));
    const needConfig = 'add a tsconfig.json or jsconfig.json (checkJs covers plain JavaScript)';
    if (tsBin) add('tsc', tsConfigs.length ? 'installed' : 'not set up', proves('tsc'), tsConfigs.length ? `will check ${tsConfigs.join(', ')}` : needConfig);
    else add('tsc', 'missing', proves('tsc'), `${install('typescript')}${tsConfigs.length ? '' : `, then ${needConfig}`}`);

    const eslintConfig = firstExisting(ESLINT_CONFIGS) || (pkg && pkg.eslintConfig);
    if (findBin('eslint')) add('eslint', eslintConfig ? 'installed' : 'not set up', proves('eslint'), eslintConfig ? '' : 'add an ESLint configuration file');
    else add('eslint', 'missing', proves('eslint'), `${install('eslint')}${eslintConfig ? '' : ', then add an ESLint configuration file'}`);
    const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
    if (!deps['eslint-plugin-sonarjs']) {
      notes.push("Function complexity (QUAL-01) is measured only if ESLint has a complexity rule. eslint-plugin-sonarjs is not in package.json, so unless your config turns on ESLint's own `complexity` rule, QUAL-01 will stay Unverified.");
    }

    if (pkg) add('knip', findBin('knip') ? 'installed' : 'missing', proves('knip'), findBin('knip') ? '' : install('knip'));
    else add('knip', 'not set up', proves('knip'), 'knip needs a package.json');
    add('madge', findBin('madge') ? 'installed' : 'missing', proves('madge'), findBin('madge') ? '' : install('madge'));
  } else {
    notes.push('No JavaScript or TypeScript here, so tsc, eslint, knip and madge do not apply.');
  }

  const jscpdConfig = exists('.jscpd.json') ? '.jscpd.json' : pkg && pkg.jscpd ? 'package.json "jscpd"' : null;
  add('jscpd', findBin('jscpd') ? 'installed' : 'missing', proves('jscpd'), findBin('jscpd') ? (jscpdConfig ? `will scan what the project's ${jscpdConfig} says` : '') : install('jscpd'));
  add('gitleaks', findBin('gitleaks') ? 'installed' : 'missing', proves('gitleaks'), findBin('gitleaks') ? '' : platformHint('winget install -e --id Gitleaks.Gitleaks', 'brew install gitleaks', 'see https://github.com/gitleaks/gitleaks#installing'));

  const networkNote = 'runs only if you allow network tools';
  if (manager === 'npm' || manager === 'pnpm') {
    add(`${manager} audit`, findBin(manager) ? 'installed' : 'missing', proves(`${manager} audit`), findBin(manager) ? networkNote : `install ${manager}`);
  } else if (pkg && !lock) {
    add('npm audit', 'not set up', proves('npm audit'), 'no lockfile found; commit one so dependencies can be checked');
  }
  // osv-scanner is optional when the project's own package manager can audit every dependency it has.
  const otherLanguages = Object.values(OTHER_LANGUAGES).some((l) => l.ext.some((e) => extCounts[e]));
  const managerAudits = (manager === 'npm' || manager === 'pnpm') && findBin(manager) && !otherLanguages;
  const osvHint = platformHint('winget install Google.OSVScanner', 'brew install osv-scanner', 'see https://google.github.io/osv-scanner/installation');
  if (findBin('osv-scanner')) add('osv-scanner', 'installed', proves('osv-scanner'), networkNote);
  else if (managerAudits) add('osv-scanner', 'missing (optional)', proves('osv-scanner'), `${osvHint}. Optional here: ${manager} audit covers this project.`);
  else add('osv-scanner', 'missing', proves('osv-scanner'), osvHint);

  for (const [language, { ext, tools }] of Object.entries(OTHER_LANGUAGES)) {
    const files = ext.reduce((n, e) => n + (extCounts[e] || 0), 0);
    if (!files) continue;
    notes.push(`${language} files found (${files}). The audit runs that language's tools by hand; they are in the table above and in references/tools-by-language.md.`);
    for (const [names, what, optional] of tools) {
      const found = names.find((n) => findBin(n));
      add(names.join(' or '), found ? 'installed' : optional ? 'missing (optional)' : 'missing', what, found ? (names.length > 1 ? `found ${found}` : '') : "see the tool's own install instructions");
    }
  }
  if ((extCounts['.java'] || 0) + (extCounts['.kt'] || 0)) {
    notes.push("Java or Kotlin files found. The audit uses the build's own check task; see references/tools-by-language.md.");
  }

  // The project's own format check scans the whole tree unless told otherwise, and Prettier does not read
  // .git/info/exclude, which is where the skill hides .audit/.
  const ignoresAudit = (file) => exists(file) && /^\s*\/?\.audit\/?\s*$/m.test(fs.readFileSync(path.join(root, file), 'utf8'));
  const allDeps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {};
  const usesPrettier = Boolean(allDeps.prettier || (pkg && pkg.prettier) || /prettier/.test(JSON.stringify((pkg && pkg.scripts) || {}))
    || ['.prettierrc', '.prettierrc.json', '.prettierrc.yml', '.prettierrc.yaml', '.prettierrc.js', '.prettierrc.cjs', '.prettierrc.mjs', 'prettier.config.js', 'prettier.config.cjs', 'prettier.config.mjs'].some(exists));
  if (usesPrettier && !ignoresAudit('.prettierignore') && !ignoresAudit('.gitignore')) {
    notes.push("Prettier is used here and `.audit/` is not in `.prettierignore` or `.gitignore`, so the project's format check will fail on the audit's own files. The fix is one line, `.audit/`, in `.prettierignore`.");
  }

  const gitFound = Boolean(findBin('git'));
  const out = ['# codedetective preflight', '', 'This only checked what is installed. No tool was run and nothing was written.', '', '**Required**', `- Node.js: ${process.version}`];
  out.push(`- git: ${!gitFound ? 'not found. The diff check and the file inventory need it.' : inGit ? 'found, and this folder is a git repository' : 'found, but this folder is not a git repository. The diff check that guards every fix needs one.'}`);
  out.push('', '**Analyzers**', '', '| Tool | Status | What it proves | To get it |', '|---|---|---|---|');
  for (const r of rows) out.push(`| ${r.tool} | ${r.status} | ${r.what} | ${r.how} |`);
  if (notes.length) out.push('', ...notes.map((n) => `- ${n}`));
  const gaps = rows.filter((r) => r.status === 'missing' || r.status === 'not set up');
  out.push('');
  if (!gaps.length) {
    out.push('Every tool this project can use is installed.');
  } else {
    out.push(`Missing or not set up: ${gaps.map((r) => r.tool).join(', ')}.`);
    out.push(`Without them the audit cannot prove: ${[...new Set(gaps.map((r) => r.what))].join('; ')}.`);
    out.push('Those checks stay Unverified, so the verdict cannot reach "Standard met". The audit never installs tools: install the ones you want and run it again, or continue without them.');
  }
  process.stdout.write(out.join('\n') + '\n');
  process.exit(0);
}

const results = [];
function record(tool, status, extra = {}) {
  results.push({ tool, status, ...extra });
}

// 1. Type checker
// Solution-style configs ("files": [] plus "references", the default Vite layout) check nothing with -p,
// so every referenced project is expanded and checked on its own. Build info goes to a temp folder,
// never into the repository. A run that checked zero project files is reported as such, never as 0 errors.
// Configs are looked for at the root and up to two folders down, so a project whose only config is
// shared/tsconfig.json or client/jsconfig.json is still checked.
(() => {
  const configs = findConfigs(TS_CONFIG_NAMES);
  if (!configs.length) return record('tsc', 'skipped', { reason: 'no tsconfig.json or jsconfig.json at the root or up to two folders down' });
  if (!configs.some(tscFor)) return record('tsc', 'missing');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codedetective-tsc-'));
  const projects = [];
  const seen = new Set();
  const noCompiler = [];
  // Each project uses the compiler nearest to it; a referenced project falls back to its parent's.
  const addProject = (cfgPath, fallbackBin) => {
    const abs = path.resolve(root, cfgPath);
    if (seen.has(abs) || inAudit(abs)) return;
    seen.add(abs);
    const bin = tscFor(abs) || fallbackBin;
    if (!bin) { noCompiler.push(path.relative(root, abs)); return; }
    projects.push({ path: abs, bin });
    const shown = tryJson(run(bin, ['--showConfig', '-p', abs]).stdout) || {};
    for (const ref of shown.references || []) {
      let refPath = path.resolve(path.dirname(abs), ref.path || '');
      if (fs.existsSync(refPath) && fs.statSync(refPath).isDirectory()) refPath = path.join(refPath, 'tsconfig.json');
      if (fs.existsSync(refPath)) addProject(refPath, bin);
    }
  };
  configs.forEach((c) => addProject(c, null));

  const projectFile = (f) => f && !/[\\/]node_modules[\\/]/.test(f) && !/[\\/]lib\.[^\\/]*\.d\.ts$/.test(f) && !inAudit(f);
  const checkedFiles = new Set();
  const kept = new Set();
  const perProject = [];
  let timedOut = false;
  projects.forEach(({ path: proj, bin }, i) => {
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
  if (noCompiler.length) {
    return record('tsc', timedOut ? 'timeout' : 'partial', {
      file, counts, projects: perProject,
      reason: `no TypeScript compiler was found for ${noCompiler.join(', ')}, so those projects were not type-checked`,
    });
  }
  record('tsc', timedOut ? 'timeout' : 'ran', { file, counts, projects: perProject });
})();

// 2. Linter (uses the project's own configuration)
(() => {
  const pkg = tryJson(exists('package.json') ? fs.readFileSync(path.join(root, 'package.json'), 'utf8') : '') || {};
  if (!firstExisting(ESLINT_CONFIGS) && !pkg.eslintConfig) return record('eslint', 'skipped', { reason: 'no ESLint configuration found' });
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
// Two things differ between installs, and getting either wrong breaks the check:
// - jscpd 5 honours .gitignore by default and rejects --gitignore; jscpd 4 needs the flag.
// - When the project has its own jscpd config, that config decides what is scanned. A path or an ignore
//   list on the command line overrides it, which makes jscpd scan the whole repository (data files included).
(() => {
  const bin = findBin('jscpd');
  if (!bin) return record('jscpd', 'missing');
  const reportDir = path.join(outDir, 'jscpd');
  const major = Number((run(bin, ['--version']).stdout.match(/(\d+)\.\d+\.\d+/) || [])[1]) || null;
  const pkg = exists('package.json') ? tryJson(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) || {} : {};
  const projectConfig = exists('.jscpd.json') ? '.jscpd.json' : pkg.jscpd ? 'package.json "jscpd"' : null;
  const args = ['--reporters', 'json', '--output', reportDir, '--silent'];
  if (!projectConfig) {
    args.push('--min-tokens', '50');
    if (major !== null && major < 5) args.push('--gitignore');
    args.push('--ignore', [
      '**/node_modules/**', '**/dist/**', '**/build/**', '**/.audit/**', '**/coverage/**', '**/*.min.js', '**/package-lock.json',
      '**/.venv/**', '**/venv/**', '**/site-packages/**', '**/__pycache__/**', '**/target/**', '**/vendor/**',
      // Repeated setup in tests and fixtures is normal; QUAL-02 counts production duplication only.
      '**/__tests__/**', '**/__mocks__/**', '**/__fixtures__/**', '**/fixtures/**', '**/*.test.*', '**/*.spec.*', '**/test_*.py', '**/*_test.go',
    ].join(','), '.');
  }
  const r = run(bin, args);
  const scope = projectConfig ? `the project's ${projectConfig}` : 'skill defaults (whole repository, tests and fixtures left out)';
  const reportFile = path.join(reportDir, 'jscpd-report.json');
  const data = fs.existsSync(reportFile) ? tryJson(fs.readFileSync(reportFile, 'utf8')) : null;
  if (!data) {
    // Never keep a report that could not be parsed: it may hold copied code.
    fs.rmSync(reportDir, { recursive: true, force: true });
    const file = save('jscpd-error.txt', redact(r.stderr || r.stdout || '(no error output)'));
    return record('jscpd', 'error', { exit: r.code, file, version: major, scope, reason: 'no JSON report produced; see file' });
  }
  // The report copies duplicated code and may include blame data. Keep locations only: drop the known
  // fields, then any multi-line or very long string wherever it sits, so a format change cannot leak source.
  const stripCode = (node) => {
    if (Array.isArray(node)) { node.forEach(stripCode); return; }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'fragment' || key === 'blame') delete node[key];
      else if (typeof value === 'string') { if (value.includes('\n') || value.length > 400) delete node[key]; }
      else stripCode(value);
    }
  };
  stripCode(data);
  // Clones that touch the audit's own files are not findings.
  const sideFile = (side) => (side && (side.name || side.path || side.file)) || '';
  const all = Array.isArray(data.duplicates) ? data.duplicates : [];
  const kept = all.filter((d) => ![d.firstFile, d.secondFile, d.first, d.second].some((side) => inAudit(sideFile(side))));
  const dropped = all.length - kept.length;
  if (Array.isArray(data.duplicates)) data.duplicates = kept;
  fs.writeFileSync(reportFile, JSON.stringify(data));
  const total = (data.statistics && data.statistics.total) || {};
  const clones = Array.isArray(data.duplicates) ? kept.length : total.clones ?? null;
  record('jscpd', 'ran', {
    exit: r.code,
    file: path.relative(root, reportFile),
    version: major,
    scope,
    // The percentage comes from jscpd's own total, so it is dropped when audit files had to be removed from it.
    counts: { clones, duplicatedPercent: dropped ? null : total.percentage ?? null },
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
  const lock = LOCKFILES.find(exists);
  const manager = managerOf(lock);
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
  lines.push(`| ${r.tool} | ${r.status}${r.exit != null ? ` (exit ${r.exit})` : ''} | ${counts}${r.scope ? `; scanned using ${r.scope}` : ''} | ${r.file || ''} |`);
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
  lines.push('', 'Not installed (recommend to the user; never install during reconnaissance). Name each one in the report with what it left unproven:');
  for (const tool of missing) lines.push(`- ${tool}: cannot prove ${proves(tool) || 'its checks'}`);
}
const partial = results.filter((r) => r.status === 'partial');
if (partial.length) {
  lines.push('', 'Partial (findings are real, but a zero proves nothing for what was skipped):');
  for (const r of partial) lines.push(`- ${r.tool}: ${r.reason || 'see its output file'}`);
}
const notRun = results.filter((r) => r.status !== 'ran' && r.status !== 'partial').map((r) => `${r.tool} (${r.status})`);
if (notRun.length) {
  lines.push('', `Did not happen (items that rely on these stay Unverified, never Passed): ${notRun.join(', ')}`);
}
const md = lines.join('\n') + '\n';
save('summary.md', md);
process.stdout.write(md);
