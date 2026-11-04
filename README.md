# codedetective

A Claude Code skill that gives a codebase a full checkup, then fixes what it finds, one small reviewed change at a time.

Think of it as a home inspection before a renovation. The agent walks through the whole repository looking for security holes, data integrity risks, slow paths, architectural drift, weak tests and messy code. It does not touch anything while it looks. It writes everything into a report, sorts each finding by how well it can be proven, and builds an ordered to-do list of fixes. Fixing starts only when you ask, and it stops for your review after every single fix.

The goal is what an experienced lead developer would call good clean code: secure, easy to understand, consistent, following current best practice for the versions the project actually uses, and with tests you can trust.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [How an audit runs](#how-an-audit-runs)
- [What to do at the Pass 1 stop](#what-to-do-at-the-pass-1-stop)
- [How findings are judged](#how-findings-are-judged)
- [How fixes work](#how-fixes-work)
- [Safety guarantees](#safety-guarantees)
- [Files it creates in your project](#files-it-creates-in-your-project)
- [Recommended analyzers](#recommended-analyzers)
- [Repository layout](#repository-layout)
- [Requirements](#requirements)

## Install

**For every project** (recommended):

```bash
npx skills add beardedgm/codedetertor -g -a claude-code
```

**For one project only**, run this from that project's folder:

```bash
npx skills add beardedgm/codedetertor -a claude-code
```

This uses the open [skills](https://github.com/vercel-labs/skills) installer and needs Node.js 22.20 or later. It installs into `~/.claude/skills/codedetective/` (every project) or `.claude/skills/codedetective/` (one project). Leave off `-a claude-code` and it will ask which coding agents to install for.

Start a new Claude Code session and `/codedetective` appears.

To update later:

```bash
npx skills update codedetective
```

**Without Node.js**, clone the repository instead. The installed folder must be named `codedetective`:

```bash
# macOS or Linux
git clone https://github.com/beardedgm/codedetertor.git ~/.claude/skills/codedetective

# Windows (PowerShell)
git clone https://github.com/beardedgm/codedetertor.git "$env:USERPROFILE\.claude\skills\codedetective"
```

To update a cloned install, run `git pull` inside that folder.

## Quick start

1. Open Claude Code in the repository you want to audit.
2. Optionally create `.audit/context.md` describing your stack and anything that must never be touched (template in `references/report-template.md`). Five lines here noticeably sharpen the audit.
3. Run `/codedetective`. It profiles the project, gathers tool evidence, runs the security pass, and stops.
4. Review the Pass 1 summary (see below), then run `/codedetective` again to continue through Passes 2 to 4.
5. Read the finished report at `.audit/code-health-report.md`.
6. Run `/codedetective fix` to fix the highest-priority task. Review it, then repeat.

## Commands

| Command | What it does |
|---|---|
| `/codedetective` | Starts the audit, or resumes it where it stopped. Never starts fixing. |
| `/codedetective pass <1-4>` | Runs or reruns one pass. |
| `/codedetective fix <TASK-ID>` | Fixes that one task, then stops for review. |
| `/codedetective fix` | Fixes the next eligible task in priority order, then stops for review. |
| `/codedetective status` | Reports progress and counts. Changes nothing. |

Only `fix` ever changes your code. Running `/codedetective` after the report is finished just summarizes the queue and waits.

## How an audit runs

| Step | What it covers |
|---|---|
| **Phase 0: Discovery** | Exact versions of your runtime and frameworks, entry points, data flows, external services, and a run of the analyzers already installed in your project. Decides which checklist items and stack references apply. |
| **Pass 1: Security** | Authentication, authorization and tenant isolation, injection, XSS, file uploads, imports, secrets, error handling that fails open, logging, rate limits, concurrency, and supply chain. Aligned to OWASP Top 10:2025 and ASVS 5.0. **Stops here for your review.** |
| **Pass 2: Performance** | Measured hot paths, blocking work on the event loop, database access patterns, frontend rendering and bundles, long sessions, cleanup, and graceful shutdown. |
| **Pass 3: Architecture** | Module boundaries, client and server contracts, type rigor, configuration, test integrity, and observability. |
| **Pass 4: Code quality** | Complexity, duplication, dead code, suppressions, swallowed errors, inconsistent patterns, outdated framework APIs, and patterns typical of AI-generated code. |

Stack-specific checks load automatically when Phase 0 detects them: Node.js and Express 5, React 19 and Vite, Mongoose and MongoDB, Cloudflare R2 and Render, and Playwright with JSDoc type checking.

Everything is appended to the report after each phase, so an interrupted audit picks up where it left off.

## What to do at the Pass 1 stop

The pause exists so you can check its work before it spends effort on the remaining passes.

1. **Read the summary.** It lists the most important confirmed findings and how many items landed in each tier.
2. **Spot-check one confirmed finding.** Open the report, pick the scariest item, and look at the file and function it names. If the trace is real, you can trust the rest more. If it is wrong, say so now.
3. **Settle what you already know.** Some unproven items you can answer from experience ("we only ever run one instance"). Tell it, and it confirms or dismisses them.
4. **Correct its picture of the system** if the Phase 0 summary got your architecture wrong.
5. **Choose what happens next.** Run `/codedetective` to continue the passes, or run `/codedetective fix P0-01` first if Pass 1 found something urgent.

## How findings are judged

Every observation gets one label:

| Label | Meaning |
|---|---|
| **Confirmed** | Proven by analyzer output, a complete trace from input to the dangerous operation, a failing test, or a local measurement. Only these become tasks. |
| **Probable** | Strongly suggested but not proven. Always comes with the exact next step that would confirm or dismiss it. |
| **Unverified** | A real concern the agent could not check because of tooling or environment limits. |
| **Verified Safeguard** | An existing defense that works, so you know what not to break. |
| **Not Applicable** | A checklist item your stack does not have. |

Before any security finding or high-priority task is queued, a separate verifier agent sees only the finding and the code and tries to prove it wrong. Findings that are refuted for a recurring reason go into `.audit/false-positives.md` so they are not raised again.

Design and style opinions are reported as advisory notes, never as urgent tasks, and each one must name the simpler alternative.

Tasks are prioritized by real consequence:

- **P0 Critical:** a demonstrated security failure, proven data loss, or a severe outage risk.
- **P1 High:** a measured slowdown, a confirmed race condition, or substantial usability damage.
- **P2 Hygiene:** types, contracts, duplication, dead code, modernization, and preventive work.

## How fixes work

Each `fix` run handles exactly one task and then stops. For every fix it:

1. Re-reads the target code, since line numbers drift as earlier fixes land.
2. Reuses an existing helper instead of writing a new one where possible.
3. Writes a regression test that fails before the fix, where that is feasible.
4. Keeps the change to the task's scope. Formatting changes are always a separate task.
5. Runs the task's verification commands.
6. Runs `scripts/check-diff.mjs`, which rejects the fix if it skips or deletes tests, adds `.only`, adds `@ts-ignore` or `eslint-disable`, or disables TLS checks, and flags any removed assertions.
7. Reruns the evidence script and records the before and after numbers.
8. Marks the task done in the report and waits for your review.

It never adds a dependency without your approval, and never commits, pushes, deploys or opens a pull request unless you ask.

## Safety guarantees

- **Read-only investigation.** No edits, installs, fixers, migrations or seeds during the audit. It writes only inside `.audit/`, which it hides from git through `.git/info/exclude`.
- **Secrets stay hidden.** It checks configuration by variable name only and never prints values. Secret scan results report location and type, never the secret.
- **Nothing touches production.** Tests, builds and measurement scripts run only after it confirms that every database is local or in-memory and every third-party service is mocked. Anything it cannot confirm, it skips and reports.
- **No cheating to go green.** It will not hardcode credentials, bypass auth, skip or delete tests, loosen assertions, suppress lint or type errors, bypass git hooks, or swallow errors. If a fix cannot pass without one of those, it stops and tells you.

## Files it creates in your project

| File | Purpose |
|---|---|
| `.audit/code-health-report.md` | The full report and remediation queue. The audit's memory across sessions. |
| `.audit/evidence/` | Raw analyzer output and a summary. |
| `.audit/false-positives.md` | Findings refuted for recurring reasons. Maintained by the skill. |
| `.audit/context.md` | Optional. Your project context, written by you. |

## Recommended analyzers

The evidence script runs only tools already installed in your project or on your PATH, and lists anything missing. For the fullest evidence, add these as dev dependencies:

```bash
npm install --save-dev typescript eslint knip madge jscpd
```

For React projects, also enable `eslint-plugin-react-hooks` (recommended preset) and `eslint-plugin-sonarjs` for complexity. Install `gitleaks` separately for secret scanning.

Tools that send data to public vulnerability databases (`npm audit`, `osv-scanner`) run only if you agree.

## Repository layout

```
SKILL.md                        Workflow, commands, evidence rules, safety rules
references/
  pass-1-security.md            Checklist for each pass
  pass-2-performance.md
  pass-3-architecture.md
  pass-4-quality.md
  stack-node-express.md         Stack checks, loaded only when detected
  stack-react-vite.md
  stack-mongoose.md
  stack-r2-render.md
  stack-playwright-jsdoc.md
  report-template.md            Report structure, task format, context template
scripts/
  collect-evidence.mjs          Read-only analyzer runner
  check-diff.mjs                Rejects fixes that weaken tests or add suppressions
```

## Requirements

- Claude Code.
- Node.js, for the two bundled scripts.

The `argument-hint` and `disable-model-invocation` lines in the `SKILL.md` frontmatter are Claude Code features. The second one means the skill runs only when you type `/codedetective`, never on its own. If you load the skill somewhere that rejects those fields, delete those two lines.
