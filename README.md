# codedetective

A Claude Code skill that gives a codebase a full checkup, then fixes what it finds, one small reviewed change at a time.

Think of it as a home inspection before a renovation. The agent walks through the whole repository looking for security holes, data integrity risks, slow paths, architectural drift, weak tests and messy code. It does not touch anything while it looks. It writes everything into a report, sorts each finding by how well it can be proven, and builds an ordered to-do list of fixes. Fixing starts only when you ask. Every fix is planned in Claude Code's plan mode and approved by you before any code changes, and it stops for your review after every single fix.

The goal is what an experienced lead developer would call good clean code: secure, easy to understand, consistent, following current best practice for the versions the project actually uses, and with tests you can trust.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [How an audit runs](#how-an-audit-runs)
- [What to do at the Pass 1 stop](#what-to-do-at-the-pass-1-stop)
- [Audit history](#audit-history)
- [How findings are judged](#how-findings-are-judged)
- [When the report is finished](#when-the-report-is-finished)
- [How planning works](#how-planning-works)
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
5. Read the finished report in `.audit/runs/<date>/code-health-report.md`. It ends by offering to fix the next task, plan a batch, or stop.
6. Run `/codedetective plan` to plan all P0 fixes together, or `/codedetective fix` to plan and fix the top task on its own.
7. Approve the plan, review the finished fix, then run `/codedetective fix` for the next one.

## Commands

| Command | What it does |
|---|---|
| `/codedetective` | Resumes an unfinished audit, or starts a new one if the last audit is complete. Never starts fixing. |
| `/codedetective new` | Always starts a fresh audit. |
| `/codedetective pass <1-4>` | Runs or reruns one pass. |
| `/codedetective plan` | Plans all P0 tasks together in plan mode, for one approval. Changes no code. |
| `/codedetective plan <P1\|P2\|TASK-IDs>` | Plans another tier, or a list of tasks such as `P0-01 P1-03`. |
| `/codedetective fix <TASK-ID>` | Plans that one task, waits for your approval, fixes it, then stops for review. |
| `/codedetective fix` | Same, for the next eligible task in priority order. |
| `/codedetective status` | Reports progress and counts, and lists past audits. Changes nothing. |

Only `fix` ever changes your code, and only after you approve its plan. `plan` never edits anything. Running `/codedetective` after the report is finished just summarizes the queue and waits.

## How an audit runs

| Step | What it covers |
|---|---|
| **Phase 0: Discovery** | Exact versions of your runtime and frameworks, entry points, data flows, external services, and a run of the analyzers already installed in your project. Writes a short threat model: where untrusted data enters, and what is worth stealing or breaking. Decides which checklist items and stack references apply. |
| **Pass 1: Security** | Authentication, authorization and tenant isolation, injection, XSS, file uploads, imports, secrets, account deletion, error handling that fails open, logging, rate limits, concurrency, and supply chain. Adds AI and LLM checks (prompt injection, model output, key handling, spend limits) and payment checks (server-side pricing, webhook replay, entitlements) when the app has those features. Aligned to OWASP Top 10:2025 and ASVS 5.0. **Stops here for your review.** |
| **Pass 2: Performance** | Measured hot paths, blocking work on the event loop, database access patterns, frontend rendering and bundles, long sessions, cleanup, and graceful shutdown. |
| **Pass 3: Architecture** | Module boundaries, client and server contracts, type rigor, configuration, test integrity, and observability. |
| **Pass 4: Code quality** | Complexity, duplication, dead code, suppressions, swallowed errors, inconsistent patterns, outdated framework APIs, and patterns typical of AI-generated code. |

Stack-specific checks load automatically when Phase 0 detects them: Node.js and Express 5, React 19 and Vite, Mongoose and MongoDB, Cloudflare R2 and Render, and Playwright with JSDoc type checking.

Everything is appended to the report after each phase, so an interrupted audit picks up where it left off.

## Audit history

Every audit is a separate run in its own dated folder under `.audit/runs/`, so a new audit always starts fresh and earlier ones stay as history.

- **Resuming.** Running `/codedetective` again continues an audit that hasn't finished, such as one paused at the Pass 1 review. If that audit is more than 3 days old or the code has changed since it started, it asks whether to resume or start over.
- **Starting fresh.** Once an audit is complete, the next `/codedetective` starts a new one. `/codedetective new` starts a new one any time.
- **Comparing.** A new audit compares itself with the previous one by checklist ID: what was fixed, what is still open, what is new, and anything that came back after being fixed. Regressions are flagged and ranked first within their priority. Nothing is copied over: every finding is re-verified against today's code.
- **Fixing.** `fix`, `plan` and `status` work on the current audit's queue, even across several days.
- **Older files.** If `.audit/` holds files from before runs existed, they are moved into a `legacy` run folder automatically before anything else happens.
- **Shared across audits.** `context.md` and `false-positives.md` stay at the top of `.audit/`, because they describe the project rather than one audit.

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
| **Decision Needed** | The right fix depends on a business choice that is yours to make, such as a rate limit or how long to keep data. Listed as a question for you, not queued as a task until you answer. |

Before any security finding or high-priority task is queued, a separate verifier agent sees only the finding and the code and tries to prove it wrong. Findings that are refuted for a recurring reason go into `.audit/false-positives.md` so they are not raised again.

Every checklist item has a stable ID, such as `SEC-03` or `PERF-02`, and every finding and task cites it. That makes two audits of the same repo easy to compare and a repeated finding easy to spot. Many items also carry a caveat: where common advice goes too far, or where a defense only looks like one (an unguessable ID is not access control, a rate limit counted in one server's memory does nothing during a deploy overlap). If your code relies on one of those, that reliance is the finding.

Design and style opinions are reported as advisory notes, never as urgent tasks, and each one must name the simpler alternative.

Tasks are prioritized by real consequence:

- **P0 Critical:** a demonstrated security failure, proven data loss, or a severe outage risk.
- **P1 High:** a measured slowdown, a confirmed race condition, or substantial usability damage.
- **P2 Hygiene:** types, contracts, duplication, dead code, modernization, and preventive work.

## When the report is finished

After Pass 4, it summarizes the report and asks what you want next:

1. **Fix the next task.** It plans the top task, you approve, and it builds that one fix.
2. **Plan a batch.** It plans all the P0 tasks (or another tier you name) together. It recommends this when there are several urgent tasks, because seeing them side by side catches fixes that touch the same code.
3. **Stop here.** You read the report on your own time and come back with `fix` or `plan` later.

## How planning works

No code changes until you approve a plan. Plans use Claude Code's plan mode, which is read-only: Claude asks to switch into it, reads the current code, writes the plan, and submits it for your approval. If you'd rather not switch modes, it shows the same plan in the conversation and waits for your go-ahead.

Every plan names the files and functions it will change, what changes in each, the regression test it will write, how it will verify the fix, and the risk. It also says where the current code forced it to differ from the report. Approved plans are saved in `.audit/plans/`, so they survive between sessions.

**One task at a time.** `/codedetective fix` plans the task, waits for your approval, then builds it.

**A batch.** `/codedetective plan` lays out a group of tasks in the order they must be built, with a short plan for each and a section on how they interact: fixes that touch the same files, an order that matters, or one fix changing what another must do. Approving a batch approves the approach, not the edits. Each task is still built in its own `fix` run, with its own review stop.

**Plans are rechecked before building.** Each fix changes code that later plans were written against. Before building a planned task, it compares the plan with the current code. If nothing material changed, it says so and builds. If a target moved or was renamed, the approach no longer fits, more files are needed, or a dependency would be added, it plans that task again and asks for a fresh approval.

## How fixes work

Each `fix` run handles exactly one task and then stops. For every fix it:

1. Gets an approved plan first: a new one, or a batch plan that passed the recheck.
2. Re-reads the target code, since line numbers drift as earlier fixes land.
3. Reuses an existing helper instead of writing a new one where possible.
4. Writes a regression test that fails before the fix, where that is feasible.
5. Builds what the plan says and nothing more. If the work needs to depart from the plan, it stops and re-plans. Formatting changes are always a separate task.
6. Runs the task's verification commands.
7. Runs `scripts/check-diff.mjs`, which rejects the fix if it skips or deletes tests, adds `.only`, adds `@ts-ignore` or `eslint-disable`, or disables TLS checks, and flags any removed assertions.
8. Reruns the evidence script and records the before and after numbers.
9. Marks the task done in the report and waits for your review.

It never adds a dependency without your approval, and never commits, pushes, deploys or opens a pull request unless you ask.

## Safety guarantees

- **Nothing changes without an approved plan.** Every fix is planned and approved before code is touched, and stops for review after.
- **Read-only investigation.** No edits, installs, fixers, migrations or seeds during the audit. It writes only inside `.audit/`, which it hides from git through `.git/info/exclude`, and analyzers never count anything under `.audit/` as part of your code.
- **Secrets stay hidden.** It checks configuration by variable name only and never prints values. Secret scan results report location and type, never the secret.
- **Nothing touches production.** Tests, builds and measurement scripts run only after it confirms that every database is local or in-memory and every third-party service is mocked. Anything it cannot confirm, it skips and reports.
- **No cheating to go green.** It will not hardcode credentials, bypass auth, skip or delete tests, loosen assertions, suppress lint or type errors, bypass git hooks, or swallow errors. If a fix cannot pass without one of those, it stops and tells you.

## Files it creates in your project

| File | Purpose |
|---|---|
| `.audit/runs/<date>/code-health-report.md` | One audit's full report and remediation queue. The audit's memory across sessions. |
| `.audit/runs/<date>/evidence/` | That audit's raw analyzer output and a summary. |
| `.audit/runs/<date>/plans/` | That audit's approved plans, one per task or batch. |
| `.audit/runs/<date>/scratch/` | Throwaway measurement scripts. |
| `.audit/current-run` | Which run is current. |
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
