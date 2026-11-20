#!/usr/bin/env node
// codedetective history: remembers every finding and every fix across audit runs, so a later run can tell
// "came back", "follows a fix" and "going in circles" apart from "new".
//
// The history never chooses what an audit examines. It is read only after the four passes are written
// (record-run) and when a fix is being planned (lookup). Matching is done here, by rule, so two runs
// match the same way every time.
//
// It keeps .audit/history.json, which is local and git-ignored. Fix commits made by the skill carry a
// "Codedetective-Fix:" line, so fixes can be recovered from git when that file is lost.
//
// Usage (from the repository root):
//   node history.mjs record-run --run <run-id> --findings <file.json> [--commit <sha>]
//   node history.mjs record-fix --task <TASK-ID> --id <CHECK-ID> --at <file#symbol> [--commit <sha>]
//                               [--created <file#symbol>]... [--changed <file#symbol>]...
//                               [--renamed <old#sym=new#sym>]...
//   node history.mjs set-status --id <CHECK-ID> --at <file#symbol> --status <open|accepted|settled> [--note <text>]
//   node history.mjs lookup --at <file#symbol>
//   node history.mjs label --task <TASK-ID> --id <CHECK-ID> --at <file#symbol>
//
// <file.json> is an array of { "id": "QUAL-02", "file": "src/a.js", "symbol": "helper" }, one per finding
// this run verified on its own. Output is JSON on stdout. It reads git and writes only .audit/history.json.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const FILE = path.join(root, '.audit', 'history.json');
const LABEL = 'Codedetective-Fix:';

function fail(message) {
  process.stderr.write(`history: ${message}\n`);
  process.exit(2);
}
function git(args) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

// ---- arguments ----
const [command, ...rest] = process.argv.slice(2);
const opts = {};
for (let i = 0; i < rest.length; i += 2) {
  const key = rest[i];
  if (!key || !key.startsWith('--') || rest[i + 1] === undefined) fail(`bad argument near "${key}"`);
  (opts[key.slice(2)] ||= []).push(rest[i + 1]);
}
const one = (name, required = true) => {
  if (!opts[name]) { if (required) fail(`--${name} is required for ${command}`); return undefined; }
  return opts[name][opts[name].length - 1];
};
const many = (name) => opts[name] || [];

// ---- locations ----
const norm = (file) => String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
function parseLoc(text) {
  const at = String(text).indexOf('#');
  const file = norm(at === -1 ? text : text.slice(0, at));
  const symbol = at === -1 ? undefined : text.slice(at + 1) || undefined;
  if (!file) fail(`"${text}" is not a file or file#symbol`);
  return symbol ? { file, symbol } : { file };
}
const showLoc = (loc) => (loc.symbol ? `${loc.file}#${loc.symbol}` : loc.file);
const sameLoc = (a, b) => a.file === b.file && (a.symbol || '') === (b.symbol || '');
// Does a place a fix worked on cover this finding's place?
function covers(place, loc, created) {
  if (place.file !== loc.file) return false;
  if (!place.symbol) return created || !loc.symbol;
  return place.symbol === loc.symbol;
}

// ---- the file ----
function load() {
  let data = { version: 1, runs: [], entries: [], fixes: [] };
  if (fs.existsSync(FILE)) {
    try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { fail(`${FILE} is not valid JSON; move it aside and run again`); }
    if (data.version !== 1) fail(`${FILE} has version ${data.version}; this script reads version 1`);
  }
  recoverFromGit(data);
  return data;
}
function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`);
}
const places = (entry) => [{ file: entry.file, symbol: entry.symbol }, ...(entry.aliases || [])];
function findEntry(data, id, loc) {
  return data.entries.find((e) => e.id === id && places(e).some((p) => sameLoc(p, loc)));
}
function addEntry(data, id, loc) {
  const entry = { id, file: loc.file, ...(loc.symbol ? { symbol: loc.symbol } : {}), aliases: [], status: 'open', comebacks: 0, runs: [] };
  data.entries.push(entry);
  return entry;
}
function moveEntry(entry, to) {
  const from = { file: entry.file, ...(entry.symbol ? { symbol: entry.symbol } : {}) };
  if (sameLoc(from, to)) return;
  if (!entry.aliases.some((a) => sameLoc(a, from))) entry.aliases.push(from);
  entry.file = to.file;
  if (to.symbol) entry.symbol = to.symbol; else delete entry.symbol;
}

// Fix commits carry "Codedetective-Fix: <TASK> <CHECK-ID> <file#symbol>". Add any the file does not know.
function recoverFromGit(data) {
  const log = git(['log', '--format=%H%x00%B%x01']);
  if (!log) return;
  for (const chunk of log.split('\x01').reverse()) {
    const [hash, body] = chunk.trim().split('\x00');
    if (!body) continue;
    for (const line of body.split('\n')) {
      if (!line.startsWith(LABEL)) continue;
      const [task, id, where] = line.slice(LABEL.length).trim().split(/\s+/);
      if (!task || !id || !where) continue;
      if (data.fixes.some((f) => f.task === task && f.id === id)) continue;
      const loc = parseLoc(where);
      const entry = findEntry(data, id, loc) || addEntry(data, id, loc);
      if (entry.status === 'open') entry.status = 'fixed';
      data.fixes.push({ task, id, at: loc, commit: hash.slice(0, 12), created: [], changed: [loc], renamed: [], recovered: true });
    }
  }
}

// Files git saw renamed since a commit: old path -> newest path.
function renamesSince(commit) {
  if (!commit) return new Map();
  const out = git(['log', '--diff-filter=R', '-M', '--name-status', '--format=', '--reverse', `${commit}..HEAD`]);
  const map = new Map();
  if (!out) return map;
  for (const line of out.split('\n')) {
    const parts = line.split('\t');
    if (parts.length !== 3 || !parts[0].startsWith('R')) continue;
    const [, from, to] = parts.map(norm);
    for (const [k, v] of map) if (v === from) map.set(k, to);
    if (!map.has(from)) map.set(from, to);
  }
  return map;
}
function commitsSince(commit, file) {
  if (!commit) return [];
  const out = git(['log', '--format=%h %s', '-5', `${commit}..HEAD`, '--', file]);
  return out ? out.split('\n').filter(Boolean) : [];
}

// ---- commands ----
function recordRun() {
  const run = one('run');
  const data = load();
  if (data.runs.some((r) => r.run === run)) fail(`run "${run}" is already recorded; each run is recorded once, after Pass 4`);
  let findings;
  try { findings = JSON.parse(fs.readFileSync(one('findings'), 'utf8')); } catch (e) { fail(`could not read the findings file: ${e.message}`); }
  if (!Array.isArray(findings)) fail('the findings file must be a JSON array');
  const commit = one('commit', false) || (git(['rev-parse', '--short=12', 'HEAD']) || '').trim() || undefined;
  const previous = data.runs[data.runs.length - 1];
  const renames = renamesSince(previous && previous.commit);
  // Follow files git saw renamed, so a moved file still matches.
  for (const entry of data.entries) {
    const to = renames.get(entry.file);
    if (to) moveEntry(entry, { file: to, symbol: entry.symbol });
  }

  const seen = new Set();
  const report = [];
  for (const raw of findings) {
    if (!raw || !raw.id || !raw.file) fail('every finding needs an "id" and a "file"');
    const loc = parseLoc(raw.symbol ? `${raw.file}#${raw.symbol}` : raw.file);
    let entry = findEntry(data, raw.id, loc);
    const row = { id: raw.id, at: showLoc(loc) };
    if (!entry) {
      entry = addEntry(data, raw.id, loc);
      const cause = [...data.fixes].reverse().find((f) => f.created.some((p) => covers(p, loc, true)) || f.changed.some((p) => covers(p, loc, false)));
      if (cause) {
        entry.followsFix = cause.task;
        row.label = 'follows-fix';
        row.fix = { task: cause.task, id: cause.id, commit: cause.commit };
      } else {
        row.label = previous ? 'new' : 'first-run';
      }
    } else if (entry.status === 'fixed') {
      const fix = [...data.fixes].reverse().find((f) => f.id === entry.id && places(entry).some((p) => sameLoc(p, f.at)));
      entry.comebacks += 1;
      entry.status = 'open';
      row.fixedBy = fix ? { task: fix.task, commit: fix.commit } : undefined;
      row.changedSince = fix ? commitsSince(fix.commit, entry.file) : [];
      // A circle: the second comeback, or a fix for a finding that itself followed this one's fix.
      const chain = fix && data.fixes.find((f) => {
        const other = data.entries.find((e) => e.id === f.id && places(e).some((p) => sameLoc(p, f.at)));
        return other && other !== entry && other.followsFix === fix.task
          && [...f.created, ...f.changed].some((p) => places(entry).some((q) => covers(p, q, false) || sameLoc(p, q)));
      });
      if (entry.comebacks >= 2 || chain) {
        row.label = 'circle';
        row.why = chain ? `fixing ${chain.id} (${chain.task}) brought it back, and ${chain.id} followed this finding's own fix` : `came back ${entry.comebacks} times`;
        if (chain) row.chain = [{ task: fix.task, id: entry.id }, { task: chain.task, id: chain.id }];
      } else {
        row.label = 'came-back';
      }
    } else if (entry.status === 'settled' || entry.status === 'accepted') {
      row.label = entry.status;
      row.note = entry.note;
    } else {
      row.label = entry.runs.some((r) => r.found) ? 'still-open' : 'new';
    }
    if (entry.aliases.length && !sameLoc(loc, { file: entry.file, symbol: entry.symbol })) moveEntry(entry, loc);
    row.comebacks = entry.comebacks;
    entry.runs.push({ run, found: true });
    seen.add(entry);
    report.push(row);
  }

  // Entries from earlier runs that this run did not find.
  for (const entry of data.entries) {
    if (seen.has(entry)) continue;
    entry.runs.push({ run, found: false });
    if (!entry.runs.some((r) => r.found) && entry.status !== 'open') continue;
    const at = showLoc({ file: entry.file, symbol: entry.symbol });
    if (entry.status === 'fixed') report.push({ id: entry.id, at, label: 'fixed' });
    else if (entry.status === 'open') {
      const present = fs.existsSync(path.join(root, entry.file));
      report.push({ id: entry.id, at, label: present ? 'gone' : 'not-compared', why: present ? 'not found this run, with no recorded fix' : 'the file is no longer there and git shows no rename' });
      entry.status = present ? 'gone' : 'not-compared';
    }
  }
  for (const entry of data.entries) if (seen.has(entry) && (entry.status === 'gone' || entry.status === 'not-compared')) entry.status = 'open';

  data.runs.push({ run, commit, findings: findings.length });
  save(data);
  const count = (label) => report.filter((r) => r.label === label).length;
  const labels = ['circle', 'came-back', 'follows-fix', 'still-open', 'new', 'first-run', 'settled', 'accepted', 'fixed', 'gone', 'not-compared'];
  process.stdout.write(`${JSON.stringify({ run, commit, comparedWith: previous ? previous.run : null, counts: Object.fromEntries(labels.map((l) => [l, count(l)])), findings: report }, null, 2)}\n`);
}

function recordFix() {
  const data = load();
  const task = one('task');
  const id = one('id');
  const at = parseLoc(one('at'));
  const entry = findEntry(data, id, at) || addEntry(data, id, at);
  const renamed = many('renamed').map((text) => {
    const eq = text.indexOf('=');
    if (eq === -1) fail(`--renamed needs old=new, got "${text}"`);
    return { from: parseLoc(text.slice(0, eq)), to: parseLoc(text.slice(eq + 1)) };
  });
  for (const { from, to } of renamed) {
    for (const e of data.entries) if (sameLoc({ file: e.file, symbol: e.symbol }, from)) moveEntry(e, to);
  }
  entry.status = 'fixed';
  const commit = one('commit', false) || (git(['rev-parse', '--short=12', 'HEAD']) || '').trim() || undefined;
  const fix = { task, id, at: { file: entry.file, ...(entry.symbol ? { symbol: entry.symbol } : {}) }, commit, created: many('created').map(parseLoc), changed: [at, ...many('changed').map(parseLoc)], renamed };
  data.fixes = data.fixes.filter((f) => !(f.task === task && f.id === id));
  data.fixes.push(fix);
  save(data);
  process.stdout.write(`${JSON.stringify({ recorded: fix, label: `${LABEL} ${task} ${id} ${showLoc(fix.at)}` }, null, 2)}\n`);
}

function setStatus() {
  const data = load();
  const status = one('status');
  if (!['open', 'accepted', 'settled'].includes(status)) fail('--status must be open, accepted or settled');
  const id = one('id');
  const at = parseLoc(one('at'));
  const entry = findEntry(data, id, at);
  if (!entry) fail(`no recorded finding ${id} at ${showLoc(at)}`);
  entry.status = status;
  const note = one('note', false);
  if (note) entry.note = note; else delete entry.note;
  save(data);
  process.stdout.write(`${JSON.stringify({ id, at: showLoc(at), status, note: entry.note }, null, 2)}\n`);
}

// What has already happened at this place: earlier findings and the fixes that created or changed it.
function lookup() {
  const data = load();
  const at = parseLoc(one('at'));
  const hit = (p, created) => covers(p, at, created) || (!at.symbol && p.file === at.file);
  const findings = data.entries.filter((e) => places(e).some((p) => hit(p, false))).map((e) => ({ id: e.id, at: showLoc({ file: e.file, symbol: e.symbol }), status: e.status, comebacks: e.comebacks, followsFix: e.followsFix, note: e.note }));
  const fixes = data.fixes.filter((f) => f.created.some((p) => hit(p, true)) || f.changed.some((p) => hit(p, false)) || f.renamed.some((r) => hit(r.to, false) || hit(r.from, false)))
    .map((f) => ({ task: f.task, id: f.id, commit: f.commit, created: f.created.map(showLoc), changed: f.changed.map(showLoc), renamed: f.renamed.map((r) => `${showLoc(r.from)} -> ${showLoc(r.to)}`) }));
  process.stdout.write(`${JSON.stringify({ at: showLoc(at), findings, fixes }, null, 2)}\n`);
}

if (command === 'record-run') recordRun();
else if (command === 'record-fix') recordFix();
else if (command === 'set-status') setStatus();
else if (command === 'lookup') lookup();
else if (command === 'label') process.stdout.write(`${LABEL} ${one('task')} ${one('id')} ${showLoc(parseLoc(one('at')))}\n`);
else fail('use one of: record-run, record-fix, set-status, lookup, label');
