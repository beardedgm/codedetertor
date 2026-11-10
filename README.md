# codedetective

A Claude Code skill that holds a codebase to a fixed, published standard: it audits the whole repository, proves each problem before raising it, fixes what fails one small approved change at a time, and tells you plainly when the standard is met.

Think of it as a building inspector who also does the repairs. It checks security, data integrity, performance, architecture, tests and code quality against named standards (OWASP, CWE and each framework's own documentation), never against an AI's taste. It touches nothing while it inspects. Fixing starts only when you ask, every fix is planned and approved by you first, and it stops for your review after each one. When nothing is left that fails the standard, it says so and stops instead of inventing work.

**Best for:** JavaScript and TypeScript web apps. It goes deepest on Node, Express, React, Vite, MongoDB with Mongoose, Cloudflare R2, Render and Playwright. Other stacks get the full general checklists, and the report says where depth is missing.

The goal is what an experienced lead developer would call good clean code: secure, easy to understand, consistent, following current best practice for the versions the project actually uses, and with tests you can trust.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [How an audit runs](#how-an-audit-runs)
- [Audit history](#audit-history)
- [When the audit finishes](#when-the-audit-finishes)
- [How findings are judged](#how-findings-are-judged)
- [The verdict: reaching the standard](#the-verdict-reaching-the-standard)
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
3. Run `/codedetective`. It profiles the project, gathers tool evidence, and runs all four passes without stopping. It pauses only if it has a question it cannot continue without.
4. Read the full report it shows at the end: every P0, P1 and P2, with what is wrong, where, and the evidence. The same report, with full detail, is saved in `.audit/runs/<date>/code-health-report.md`.
5. Make your decisions: correct anything it got wrong, answer its open questions, and say which findings you accept as they are.
6. Run `/codedetective plan` to plan the fixes. Nothing is planned or fixed before this point.
7. Approve the plan, then run `/codedetective fix` to build one fix at a time, reviewing each.

## Commands

| Command | What it does |
|---|---|
| `/codedetective` | Resumes an unfinished audit. On a finished audit with open fixes, shows status and asks what's next. Starts a new audit only when nothing is left to fix. Never starts fixing. |
| `/codedetective new` | Always starts a fresh audit of the whole codebase, from beginning to end. It never resumes, and it never looks only at what changed. |
| `/codedetective pass <1-4>` | Runs or reruns one pass. |
| `/codedetective plan` | Plans all P0 tasks together in plan mode, for one approval. Changes no code. |
| `/codedetective plan <P1\|P2\|TASK-IDs>` | Plans another tier, or a list of tasks such as `P0-01 P1-03`. |
| `/codedetective fix <TASK-ID>` | Plans that one task, waits for your approval, fixes it, then stops for review. |
| `/codedetective fix` | Same, for the next eligible task in priority order. |
| `/codedetective fix batch <name>` | Builds every task in an approved batch plan back to back, P2 cleanup only, with one review at the end. Stops at the first problem. |
| `/codedetective status` | Reports the verdict, progress and counts, and lists past audits with their verdicts. Changes nothing. |

Only `fix` ever changes your code, and only after you approve its plan. `plan` never edits anything. Both work only on a finished audit: if the audit is still running or paused, they say so and offer to continue it. Running `/codedetective` on a finished audit that still has open fixes shows where things stand and asks what's next, rather than starting a new audit over your queue. Once nothing is left to fix, it starts a fresh audit to confirm the standard is met.

## How an audit runs

| Step | What it covers |
|---|---|
| **Phase 0: Discovery** | Exact versions of your runtime and frameworks, entry points, data flows, external services, and a run of the analyzers already installed in your project. Writes a short threat model: where untrusted data enters, and what is worth stealing or breaking. Decides which checklist items and stack references apply. |
| **Pass 1: Security** | Authentication, authorization and tenant isolation, injection, XSS, file uploads, imports, secrets, account deletion, error handling that fails open, logging, rate limits, concurrency, and supply chain. Adds AI and LLM checks (prompt injection, model output, key handling, spend limits) and payment checks (server-side pricing, webhook replay, entitlements) when the app has those features. Aligned to OWASP Top 10:2025 and ASVS 5.0. |
| **Pass 2: Performance** | Measured hot paths, blocking work on the event loop, database access patterns, frontend rendering and bundles, long sessions, cleanup, and graceful shutdown. |
| **Pass 3: Architecture** | Module boundaries, client and server contracts, type rigor, configuration, test integrity, and observability. |
| **Pass 4: Code quality** | Complexity, duplication, dead code, suppressions, swallowed errors, inconsistent patterns, outdated framework APIs, and patterns typical of AI-generated code. |

All four passes run in one go. The audit pauses only for a question it cannot continue without, and it never offers to plan or fix anything along the way. However serious a finding is, it waits for the full report, where it is listed first.

**Every audit covers the whole codebase.** A new audit examines everything from beginning to end, as if for the first time. It never narrows to recent commits, pull requests or files changed since the last audit, and it never uses an earlier report to decide where to look. To make that checkable, it starts by listing every source file, and the report states how many were examined out of the total and names anything it did not get to, with the reason. An area it did not examine keeps the verdict from reaching "Standard met".

Stack-specific checks load automatically when Phase 0 detects them: Node.js and Express 5, React 19 and Vite, Mongoose and MongoDB, Cloudflare R2 and Render, and Playwright with JSDoc type checking. Each check has its own ID (such as `EXP-02` or `MONGO-01`) and counts toward the verdict like any checklist item.

**On other stacks** (Supabase, Postgres with Prisma, Next.js, S3, Vercel, Python, Go and so on), the general checklists still apply in full. What's missing is version-specific depth, and the skill is honest about it:
- Each major technology without a stack file is listed as a coverage gap, so the best verdict it can give is "Standard met, with gaps", naming the technology. You can accept general-depth coverage for it if that's enough for you.
- During the audit it looks up that technology's current official security and best-practice docs, and treats anything it learns as unproven until it's verified in your code.
- For other languages, it runs that language's own read-only tools (listed in `references/tools-by-language.md`) by hand, since the evidence script's analyzers are JavaScript tools.

Everything is appended to the report after each phase, so an interrupted audit picks up where it left off.

## Audit history

Every audit is a separate run in its own dated folder under `.audit/runs/`, so a new audit always starts fresh and earlier ones stay as history.

- **Resuming.** Running `/codedetective` again continues an audit that hasn't finished, such as one that was interrupted or paused for a question. If that audit is more than 3 days old or the code has changed since it started, it asks whether to resume or start over.
- **Starting fresh.** Once an audit is complete and nothing is left to fix, the next `/codedetective` starts a new one. If fixes are still open, it asks first instead of replacing your queue. `/codedetective new` starts a new one any time.
- **Comparing.** A new audit compares itself with the previous one by checklist ID: what was fixed, what is still open, what is new, and anything that came back after being fixed. Regressions are flagged and ranked first within their priority. Nothing is copied over: every finding is re-verified against today's code. The comparison is written at the end, after the new audit has examined everything on its own, so an earlier audit never decides where a new one looks.
- **Fixing.** Once the audit is finished, `plan` and `fix` work on its queue, even across several days. `status` works at any time.
- **Older files.** If `.audit/` holds files from before runs existed, they are moved into a `legacy` run folder automatically before anything else happens.
- **Older report formats.** If a run's report was started by an earlier version of the skill, it's upgraded once, in place, when you next resume it: missing sections like the verdict and the coverage table are added from what the report already recorded, without redoing finished passes. Anything the old report never recorded is marked unverified rather than guessed, and it offers to re-run just that pass.
- **Shared across audits.** `context.md`, `false-positives.md` and `accepted.md` stay at the top of `.audit/`, because they describe the project rather than one audit. Each new audit re-checks them against the code. They change how something is reported, never whether it is examined.

## When the audit finishes

The audit ends by showing you the full report in the conversation, not a summary of it:

- the verdict
- every P0, P1 and P2 task, each with what is wrong, where it is, and the evidence that proves it
- what it suspects but could not prove, and what would settle each one
- the decisions and questions waiting on you
- your past decisions, each with what the code says now and whether it conflicts with another
- what it could not check, and why

The same report, with the full traces and tool output, is saved in `.audit/runs/<date>/code-health-report.md`.

Then it stops. Nothing has been changed, and nothing is planned or fixed until you ask. If the verdict is Standard met, it says so and there is nothing to do. Otherwise it asks what you want next:

1. **Stop so you can read it.** This is the default.
2. **Go through the decisions.** It walks you through its open questions and the choices that are yours to make.
3. **Plan the fixes.** It moves on to planning.

Picking a choice is the same as typing the command, so you never need to remember the syntax.

**What to do with the report**

1. **Spot-check one confirmed finding.** Pick the scariest item and look at the file and function it names. If the trace is real, you can trust the rest more. If it is wrong, say so.
2. **Correct it.** Tell it about any finding that is wrong, or anything it got wrong about your system. It re-checks the finding with what you told it and updates the report.
3. **Settle what only you know.** Some items can't be proven from code ("we only ever run one instance", "alerts page me"). Your answer confirms or dismisses them.
4. **Decide what you won't fix.** Anything you accept as it is gets recorded with your reason and leaves the queue.
5. **Review your past decisions.** Keep, reverse or update each one. A decision you reverse goes back into the queue as a fix.

Planning covers only what is still in the queue after your decisions.

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

## The verdict: reaching the standard

The goal is to fix the codebase until it meets a fixed standard, then stop. The checklists are a finite set of industry standards and best practices. They are about how the code is built, never about what you build, and a codebase can fully meet them. Each audit and fix round should leave fewer findings, until nothing is left that would add stability, security, correctness, performance or maintainability.

Every rule names where it comes from, so you can check that it is a recognized standard and not the AI's taste:

- **Security:** OWASP Top 10:2025 and ASVS 5.0, plus the OWASP lists for APIs and for AI features.
- **Performance, architecture and code quality:** CWE, the public weakness catalog behind ISO/IEC 5055 (dead code, circular dependencies, swallowed errors, unreleased resources and more), and named published practices: Google's code review standard, SonarSource's Cognitive Complexity, The Twelve-Factor App, DRY and YAGNI, Martin Fowler on testing, and Google's SRE book.
- **Your stack:** each framework's own official documentation and security advisories.

Each checklist item carries its source as a short tag, and `references/sources.md` lists every tag with a link to look it up. The agent is told never to cite a standard it has not confirmed.

Once the real work is done, the skill should say so instead of inventing work. Every finding has to name the checklist item it fails and the concrete benefit of fixing it, and a change that only rewords, reshuffles or restyles code doesn't qualify. A run that finds nothing is treated as a successful audit, and the skill is told never to lower its evidence bar or hunt for marginal issues to avoid an empty report.

Every report opens with a verdict:

| Verdict | Meaning |
|---|---|
| **Audit in progress (Pass N of 4)** | The audit hasn't finished, so no other verdict applies yet. |
| **Standard met** | Every applicable checklist item passed or doesn't apply, nothing went unchecked, no decisions are waiting on you, and nothing is left to fix. |
| **Standard met, with gaps** | Nothing left to fix, but some items couldn't be checked or a decision is waiting on you. It lists exactly what stands between this and Standard met. |
| **Fixes remaining** | Fixes remain, counted by priority. It also tells you when no P0 or P1 tasks remain, which is the first milestone. |

The verdict carries its evidence, for example: *"Standard met: 38 of 48 gated items passed, 7 not applicable, 2 confirmed by developer (SEC-15, ARCH-06), 1 accepted (SEC-16), at commit abc123 on 2026-11-06."* A Checklist Coverage table at the end of the report shows the outcome of every item, so you can check the claim.

Two outcomes exist so the finish line is always reachable:

- **Confirmed by you.** Some things can't be proven from code at all: whether alerts actually reach a person, whether backups exist, a setting in your hosting dashboard. The report lists them, and after you have seen it, it asks you about them in one grouped question. Your answer settles them, and the verdict names which ones rest on your word.
- **Accepted by you.** When a fix depends on a business choice (how strict a rate limit should be), or a task can't be fixed without weakening tests or security, it becomes a decision for you. If you accept it with a reason, it's recorded in `.audit/accepted.md` and counts as settled.

**Past decisions are re-evaluated, not obeyed.** A recorded decision is a note of what you chose and why, never an instruction to stay quiet. Later audits:
- still check every accepted item, and test its reason against the code. If you said "invite-only beta" and signup is now public, the decision is reopened with the evidence.
- speak up with a **Reconsider** recommendation whenever there's real evidence that reversing a decision would better meet the standard: the risk is bigger than assumed, a cheaper fix now exists, or something changed. You get the evidence and the cost of the fix.
- don't re-argue a decision when nothing new argues against it, so audits don't go in circles.
- compare your decisions with each other. If a later choice contradicts an earlier one, or removes the reason for it, the report names both and asks which is true.
- list every past decision in the final report, with what the code says now and a keep or reconsider recommendation. You review them with the evidence in front of you, instead of being asked before the audit has looked at anything.
- show in the verdict which accepted items you reconfirmed this time and which were carried forward without reconfirmation.

The same goes for the skill's own past conclusions: a finding it once ruled a false positive is re-checked against the current code before it's set aside again.

- **Everything that fails the standard gets fixed.** Low-impact findings are fixed at low priority, not skipped.
- **Opinions never block the verdict.** Pass 4's judgment calls (design fit, naming, simplicity) are advisory only, so "could be written differently" never keeps you from the finish line.
- **Only an audit can confirm it.** When you fix the last task, the verdict says all findings are fixed and offers `/codedetective new` to confirm, because the fixes changed code the audit never saw.
- **The verdict has a date.** It applies to the audited commit. New code, a newly published vulnerability in a package you use, or a new edition of a standard can change it, which is what the next audit is for.
- **It is not a proof of zero bugs.** No tool or reviewer can prove that. It shows every item in the standard was checked and passed.

## How planning works

Planning starts only after the audit is finished and you have seen the full report. If decisions that affect a fix are still open, it asks you those first. No code changes until you approve a plan. Plans use Claude Code's plan mode, which is read-only: Claude asks to switch into it, reads the current code, writes the plan, and submits it for your approval. If you'd rather not switch modes, it shows the same plan in the conversation and waits for your go-ahead.

Every plan names the files and functions it will change, what changes in each, the regression test it will write, how it will verify the fix, and the risk. It also says where the current code forced it to differ from the report. Approved plans are saved in the audit's own `plans/` folder, so they survive between sessions.

**One task at a time.** `/codedetective fix` plans the task, waits for your approval, then builds it.

**A batch.** `/codedetective plan` lays out a group of tasks in the order they must be built, with a short plan for each and a section on how they interact: fixes that touch the same files, an order that matters, or one fix changing what another must do. Approving a batch approves the approach, not the edits. Each task is still built in its own `fix` run, with its own review stop. The one exception is a batch made entirely of P2 cleanup tasks: `/codedetective fix batch <name>` builds them back to back, with every task still going through its own snapshot, tests and cheating check, and stops at the first problem, with one review at the end. P0 and P1 fixes always get their own review.

**Plans are rechecked before building.** Each fix changes code that later plans were written against. Before building a planned task, it compares the plan with the current code. If nothing material changed, it says so and builds. If a target moved or was renamed, the approach no longer fits, more files are needed, or a dependency would be added, it plans that task again and asks for a fresh approval.

## How fixes work

Each `fix` run handles exactly one task and then stops. For every fix it:

1. Gets an approved plan first: a new one, or a batch plan that passed the recheck.
2. Re-reads the target code, since line numbers drift as earlier fixes land.
3. Takes a snapshot of your working tree, including any edits you haven't committed, so only this fix's own changes are judged afterward.
4. Reuses an existing helper instead of writing a new one where possible.
5. Writes a regression test that fails before the fix, where that is feasible.
6. Builds what the plan says and nothing more. If the work needs to depart from the plan, it stops and re-plans. Formatting changes are always a separate task.
7. Runs the task's verification commands.
8. Runs `scripts/check-diff.mjs` against the snapshot. It rejects the fix if it:
   - skips, focuses, deletes, or moves tests out of the test folders (JavaScript, Python, Go and Rust forms)
   - adds `@ts-ignore` or `@ts-nocheck`, or any other suppression comment without a written reason
   - changes a config file that can switch checks off (tsconfig, ESLint, test-runner, CI, git hooks) without the plan naming it
   - disables TLS checks, or uses `--no-verify` or `--passWithNoTests`

   It flags for your review any suppression that does carry a reason, removed assertions, empty catch blocks, and manifest changes. It never undoes anything that was in the snapshot.
9. Reruns the evidence script into its own folder and records a before-and-after table, so the original evidence is never overwritten.
10. Marks the task done in the report and waits for your review.

It never adds a dependency without your approval, and never commits, pushes, deploys or opens a pull request unless you ask.

## Safety guarantees

- **The full report comes first.** The audit runs all four passes and shows you everything it found before any fix is planned or offered. `plan` and `fix` refuse to run on an unfinished audit.
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
| `.audit/accepted.md` | Items you accepted, with your reasons. Honoured by later audits. |
| `.audit/context.md` | Optional. Your project context, written by you. |

## Recommended analyzers

The evidence script runs only tools already installed in your project or on your PATH, and lists anything missing. For the fullest evidence, add these as dev dependencies:

```bash
npm install --save-dev typescript eslint knip madge jscpd
```

For React projects, also enable `eslint-plugin-react-hooks` (recommended preset) and `eslint-plugin-sonarjs` for complexity. Install `gitleaks` separately for secret scanning.

Tools that send data to public vulnerability databases (`npm audit`, `pnpm audit`, `osv-scanner`) run only if you agree. The audit asks once and remembers your answer in `.audit/context.md`. If you say no, the known-vulnerability check (SEC-19) stays Unverified.

A few details worth knowing:
- **Saved evidence never holds your code.** ESLint's saved output keeps where each problem is and what it is, not the file's source; duplicated code blocks are dropped from the jscpd report; and long key-like values quoted in error messages are redacted. A secret in your code cannot reach the transcript through the evidence files.
- **Each check says whether it really ran.** Only `ran` counts as a complete check. `partial` means the findings are real but a zero proves nothing for what was skipped. Anything else (skipped, missing, error, timeout) means the check did not happen, and the items that rely on it stay Unverified.
- **Project references are followed.** The type check checks every project a solution-style `tsconfig.json` points to, such as the default Vite layout. If it ends up checking zero files, it says so, rather than reporting zero errors. In a monorepo whose composite projects have not been built, it reports the check as `partial` instead of counting "not built" as type errors.
- **Ignored files are not scanned.** Anything your `.gitignore` excludes, such as a Python `.venv` or a Rust `target` folder, is left out, so installed packages never show up as your findings.
- **Build output can be secret-scanned.** Pass `--scan-dir dist` after a local build. gitleaks scans it with values redacted, so a found secret is never printed.
- **Non-JavaScript code is partly covered.** The built-in scan for suppressions and skipped tests also covers Python, Go, Rust and several other languages. If it finds no source files at all, it reports "not applicable", not a clean result.

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
  sources.md                    The standard behind each rule, with lookup links
  tools-by-language.md          Read-only tools for Python, Go, Rust, Ruby, PHP, Java
  report-template.md            Report structure, task format, context template
scripts/
  collect-evidence.mjs          Read-only analyzer runner
  check-diff.mjs                Rejects fixes that weaken tests or add suppressions
```

## Requirements

- Claude Code.
- Node.js, for the two bundled scripts.

The `argument-hint` and `disable-model-invocation` lines in the `SKILL.md` frontmatter are Claude Code features. The second one means the skill runs only when you type `/codedetective`, never on its own. If you load the skill somewhere that rejects those fields, delete those two lines.
