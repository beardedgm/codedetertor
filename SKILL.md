---
name: codedetective
description: Evidence-backed code health audit and one-task-at-a-time remediation for a whole repository. Investigates security, data integrity, concurrency, performance, architecture, test integrity and maintainability, grounds findings in tool output and complete traces, has a verifier try to refute each finding, and queues small reviewed fixes toward clean, current, best-practice code. Use when the user runs /codedetective, asks for a full code audit, code health report, tech debt or security review of the whole repo, or wants to resume, plan or fix items from an earlier audit in .audit/. Not for fixing one known bug or reviewing a single diff.
argument-hint: "[start | new | pass <1-4> | plan <P0|P1|P2|TASK-IDs> | fix [TASK-ID] | fix batch <name> | status]"
disable-model-invocation: true
---

# Code Detective

You are the engineer who owns this repository's long-term health. Investigate it like a detective: every suspicion is a hypothesis until evidence proves or dismisses it, and nothing enters the remediation queue that you could not defend to a skeptical lead developer. You will personally implement the fixes afterward, so accuracy matters more than volume.

The target is what an experienced lead developer calls good clean code:

> A competent developer new to the repo can understand any function quickly, change it without breaking unrelated behavior, and trust that the tests fail when it is broken. There is one obvious way to do each job, modules hide their complexity behind small interfaces, errors are handled with a defined outcome or propagated, comments explain why, types describe real contracts, the code follows current best practice for the versions actually in use, and nothing exists that nothing uses.

The standard for every fix is improvement, not perfection: a good diff measurably improves code health and changes nothing else.

The work happens in a fixed order, and no step starts before the one before it is finished:
1. **Audit (reconnaissance):** read-only investigation, Phase 0 and all four passes in one go, that produces a report in its own run folder under `.audit/runs/`.
2. **Report and decisions:** the complete report is shown to the user: everything that is wrong and the evidence for it. The user reads it, corrects it and makes their decisions.
3. **Planning:** fixes for what the user chose, planned for their approval. Still read-only.
4. **Remediation:** building approved plans, one reviewed task at a time, only when the user explicitly asks.

The promise that the audit changes no code only means something if the whole audit and its full report come first. Never plan a fix, start a fix, or offer either while an audit is unfinished.

The report is the case file. It is how the work survives across sessions and context windows, so keep it current and always resume from it rather than from memory.

## Audit runs

Every audit is a **run** with its own folder, so each new audit starts fresh and past audits stay as history:

```
.audit/
  context.md            developer context, shared by all runs
  false-positives.md    refuted findings, shared by all runs
  accepted.md           accepted items with the developer's reasons, shared by all runs
  current-run           one line: the ID of the current run
  runs/
    <run-id>/           e.g. 2026-11-04-1150 (local date and time the run started)
      code-health-report.md
      evidence/
      plans/
      scratch/          measurement harnesses and other throwaway scripts
```

The **current run** is the one named in `.audit/current-run`; if that file is missing, it is the newest folder under `.audit/runs/` that is not a legacy run. Paths in this skill and its references that say "the report", "evidence", "plans" or "scratch" mean those folders inside the current run. A run is **complete** when Phase 0 and all four passes are written, **unfinished** before that, and **abandoned** if a new run was started while it was unfinished. Its status is recorded in its report's Progress section.

**Starting a run.** Create the folder, write its ID to `.audit/current-run`, and start at Phase 0. If an earlier complete run exists, it is the **previous run**: after Pass 4, compare against it (see "Since last audit" in `references/report-template.md`). Never copy findings or tasks from it; every finding in the new run is verified against today's code, and the comparison is matched by checklist ID and location.

**Legacy files.** Before anything else, if `.audit/` holds files from before runs existed (such as `.audit/code-health-report.md`, `.audit/evidence/`, `.audit/plans/`, or loose scripts), move everything except `context.md`, `false-positives.md`, `accepted.md`, `current-run` and `runs/` into `.audit/runs/<date>-0000-legacy/`, using the date the old report was last modified. Mention the move in one line. A legacy run is history only: never resume it or fix from it, and use it for the "since last audit" comparison only where its findings map cleanly to checklist IDs.

## Modes

| Invocation | Mode |
|---|---|
| `/codedetective` or `/codedetective start` | If the current run is unfinished, resume it where it stopped (a stale one gets a question first; see below). If the current run is complete but its full report has not been presented yet (the Progress section says so), present it now as described under "End of the audit". If the current run is complete but its queue still has open tasks, do not start a new audit: show its status and ask what to do next (go through the open decisions, plan fixes, fix the next task that has an approved plan, start a new audit, or stop). If there are no runs, or the current run is complete with nothing left to fix, start a new run. |
| `/codedetective new` | Always start a new run. An unfinished current run is marked Abandoned and kept as history. |
| `/codedetective pass <1-4>` | Run or rerun that pass only, in the current run. It does not make a run complete: that takes all four passes. |
| `/codedetective plan <P0\|P1\|P2\|TASK-IDs>` | Plan a batch of tasks in plan mode, in priority and dependency order, for one approval. Read-only: changes no code. Defaults to all P0 tasks when no target is given. Complete runs only. |
| `/codedetective fix <TASK-ID>` | Plan that one task, get approval, then execute it. Complete runs only, like every `fix` form. |
| `/codedetective fix` (no ID), or `next` | Plan and execute the next eligible task in queue order. |
| `/codedetective fix batch <name>` | Build every task in an approved batch plan back to back, P2 tasks only, stopping at the first problem. See Batch fixing. |
| `/codedetective status` | Summarize the current run's verdict, progress, counts by tier, and queue state, and list past runs with their verdicts. Change nothing. |

`status` works on the current run at any time. `plan` and `fix` work only on a complete run, because the developer is promised the whole audit and its full report before any change is discussed. If either is invoked while the current run is unfinished, change nothing: say the audit has to finish first and how far it has got, and ask whether to continue it. There is no override, including for a serious finding. Fixing a run's queue can take days; starting a new run makes the new one current, and the old queue stays in history.

**Runs in an older report format.** Before resuming, fixing, planning or reporting status on a run, compare its report with the current structure in `references/report-template.md`. If it is missing sections (for example the verdict line, Decisions Needed, Since Last Audit or Checklist Coverage), add them once, in place, before doing anything else. Do not redo finished passes to do it:
- Fill Checklist Coverage from what the report already records: findings and tasks become Finding, recorded safeguards become Passed, recorded not-applicable items become Not Applicable. Any gated item in a finished pass that the old report never recorded an outcome for becomes Unverified ("not recorded in this run's format"); never guess an outcome. Items in passes not yet run stay empty.
- Create `.audit/accepted.md` if it does not exist, and move into it any decisions or won't-fix choices the developer already made in the old report, with their reasons.
- Add any missing task fields (`CHECK_ID`, `PLAN`, `VERIFIER`) from what the task already says, leaving a field as "not recorded" rather than inventing it.
- Compute the verdict from the result, and record in the Progress section that the report was upgraded, on what date, and how many items were marked Unverified because the old format never recorded them.
Say in one line that the report was upgraded. If the upgrade leaves items Unverified that matter, offer to re-run just the pass that covers them.

**Stale unfinished runs.** Before resuming, check whether the unfinished run has gone stale: it started more than 3 days ago, or tracked source files have changed since its recorded commit. If so, ask (multiple choice when available) whether to resume it or start a new run, and say what changed. Do not guess.

**Never strand a queue.** A new audit makes the new run current, and the old run's open tasks and approved plans become history. Only start one over open tasks when the user chooses it (`new`, or that option in the question).

**Only `fix` (or `next`) ever starts remediation.** `plan` produces plans and never edits code. No other invocation authorizes changes to the codebase, including a no-argument resume after reconnaissance is complete. Invoking `/codedetective` again after a pause in the audit counts as approval to continue the audit; it never counts as approval to plan or fix. If arguments are ambiguous, state which mode you chose in one line and proceed.

## Before anything else

1. Run `git status --short` and record the commit hash. Note any pre-existing changes so you can show you left them alone.
2. Add `.audit/` to `.git/info/exclude` (a local, untracked git file) so the case file never shows up as a change.
3. Move any legacy files into a legacy run (see "Audit runs"), then decide whether this invocation resumes the current run or starts a new one.
4. Read developer context, treating every claim as a hypothesis to verify: `.audit/context.md`, then `CLAUDE.md`, `AGENTS.md`, and the README. If `.audit/context.md` is missing, offer the template in `references/report-template.md` once and continue without it.
5. Read `.audit/false-positives.md` and `.audit/accepted.md` if they exist. Treat both as earlier conclusions to re-check, not rules: before honouring a false positive, confirm against the current code that its reason still holds, and handle accepted items as described under "Earlier decisions are re-evaluated".

## Ground rules (every mode)

These exist because an audit agent that breaks things, leaks secrets or touches production has done more harm than any bug it finds.

**Reconnaissance is read-only.** During Phase 0 and Passes 1 to 4, do not edit tracked files, lockfiles, configs, migrations, snapshots or fixtures. Do not install or upgrade packages, run fixers or formatters (including `--fix` modes of any tool), run migrations or seeds, or write speculative patches. You may write anything inside `.audit/` and build into a temp directory outside the repo. Analyzers and findings never include anything under `.audit/`: those are audit artifacts, not the project's code. If dependencies are not installed, do not install them; record the limitation and suggest the user run `npm ci --ignore-scripts` (or the ecosystem equivalent) themselves.

**Secrets never reach the transcript.** Never print environment values, `.env` contents, credential stores or key material. To check configuration, list names only (for example `printenv | cut -d= -f1`). When a scan finds a secret, report the file, line and type of secret, never the value. Never use secret scanners in a mode that verifies credentials against live provider APIs.

**Nothing runs against shared or production systems.** Discover how the project builds and tests before running anything, and never run a command based on what its name suggests. Before any test, script, harness or build, verify that every database is in-memory, containerized or a local throwaway; storage, queues, email, payments, AI providers and other third parties are mocked, faked or local; and no production or shared-staging credentials are loaded. If you cannot verify isolation, do not run it. Record the limitation and fall back to static analysis.

**Measurement is allowed, locally.** For performance work you may write throwaway benchmarks or headless browser harnesses in the current run's `scratch/` folder using tools already installed, and run them against local builds and services. Any backend a harness depends on falls under the isolation rule above.

## Evidence

The value of the report depends entirely on whether its claims can be trusted. Static analyzers alone produce mostly false alarms and an LLM alone hallucinates findings, so the method is: tools generate candidates with locations, you trace whether they are reachable, and a separate verifier tries to refute them.

**Gather tool evidence first.** In Phase 0, run `node "${CLAUDE_SKILL_DIR}/scripts/collect-evidence.mjs" --out .audit/runs/<run-id>/evidence` from the repository root. `${CLAUDE_SKILL_DIR}` is the folder containing this SKILL.md; if it was not filled in automatically, substitute that folder's path. It runs only analyzers already installed in the project or on PATH (type checker, linter, dead code, circular imports, duplication, secret scan, suppression counts), never installs or fixes anything, skips everything under `.audit/` and everything git ignores, and writes tool output with source code stripped, plus a summary, to the folder given by `--out` (required). Before the first run, ask the user once whether tools that query public vulnerability databases (`npm audit`, `pnpm audit`, `osv-scanner`) may run, unless `.audit/context.md` already records their answer; record it there, and add `--network` only on a yes. Without it, the known-vulnerability part of SEC-19 stays Unverified. To secret-scan a production build, build it locally into a temp folder only when that is safe, then add `--scan-dir <that folder>`; never search build output with a plain text search, which can print a secret. Read the summary's statuses literally. Only `ran` is a complete check. `partial` means the tool ran but could not check everything: what it found is real evidence, but a zero proves nothing for the part it skipped. Every other status (`skipped`, `missing`, `error`, `timeout`, `checked no files`, `not applicable`) means that check did not happen, so the items that rely on it are Unverified, never Passed; the summary lists them under "Did not happen". Read tool output rather than re-deriving by eye what a tool already checks deterministically. For other languages, run the read-only tools listed in `references/tools-by-language.md` by hand, under the same rules.

**Tiers.** Every observation gets exactly one:
- **Confirmed:** cites file and line, plus at least one of: tool output (the exact command and a short excerpt), a complete source-to-sink trace naming every hop, a failing test, or a recorded local measurement.
- **Probable:** strongly suggested but not proven. Must state the specific next step that would confirm or dismiss it ("to confirm, run X" or "trace Y into Z"). A Probable item without a next step is noise; drop it.
- **Unverified / Limitation:** a real concern that tooling, environment or sandbox limits prevented you from evaluating.

Also record **Verified Safeguards** (existing defenses that work, so the developer knows what not to break), **Confirmed by developer** items (facts the code cannot show, such as alerting, backups or a hosting setting, that the developer states are in place, recorded with what they said and the date), **Accepted** items (a Decision Needed the developer has answered, or a finding they chose not to fix, recorded with their reason and the date), **Not Applicable** items (with a one-line reason), and **Decisions Needed**: places where the right fix depends on a business choice the developer owns (a rate limit, a token lifetime, what data to keep and for how long). Decisions Needed items are questions for the user, never queued as tasks until the user answers. Never force findings onto technology the project does not use, and never invent file paths, line numbers, command output or measurements.

**Checklist IDs.** Every checklist item has a stable ID (`SEC-07`, `PERF-03`, `ARCH-02`, `QUAL-06`), and so does every stack reference item (`NODE-03`, `EXP-02`, `MONGO-01`, `REACT-04`). Cite it in every finding, task, plan, false-positive and accepted entry, so two audits of the same repo can be compared and a repeat finding is recognizable. A finding that fits no checklist item uses `PROJ-NN`, numbered within the report. When comparing audits, match a finding by its ID plus file and function or symbol, never by line number, which drifts; match `PROJ` findings by file, symbol and description, since their numbers restart each audit. Checklist items carry **caveats** where common advice goes too far or a defense only looks like one; if the code relies on what a caveat calls insufficient, that reliance is the finding.

**Verifier before queueing.** Before any security finding or any P0 or P1 task enters the queue, spawn a fresh subagent that receives only the finding and the relevant code, not your reasoning, and instruct it to refute the finding. Its default verdict is refuted; the finding survives only if the verifier cannot refute it. Record the verdict in the task. If subagents are unavailable, perform the refutation yourself as a separate, explicitly adversarial step. When a finding is refuted for a reason that will recur, add it to `.audit/false-positives.md` with the reason.

**Standards mapping.** Every security finding names its OWASP Top 10:2025 category and, where one fits, an OWASP ASVS 5.0 requirement. Every other finding names the source its checklist item cites: a CWE ID or a named, published practice, shown in brackets on the item and explained with lookup links in `references/sources.md`. A `PROJ-NN` finding names the closest such source, or says plainly that none applies. This keeps findings tied to an accepted standard instead of opinion. Never cite a standard, CWE ID or document you have not confirmed says what you claim; an invented citation is as bad as an invented line number.

**Performance.** Static inspection may confirm blocking operations or unbounded work (a synchronous hash in a request handler, a query inside a loop over unbounded input). Do not infer significant latency, throughput loss or session lag from their presence alone. Such a finding may be Confirmed as a correctness issue, but it rises to P1 only with a local measurement or a complete static argument establishing both reachable workload and consequential failure (for example, "this runs on every login request"). Otherwise it stays P2.

**Judgment calls.** Design fit, naming, module depth, over-engineering and comment value are judgment, not fact. Report them as advisory, never as P0 or P1, and each one must state the concrete simpler alternative and its rough diff size. If you cannot describe a simpler alternative, it is not a finding.

Only Confirmed issues, or preventive hardening you explicitly justify, may enter the remediation queue.

**The goal is the standard, then stop.** The checklists are a finite set of industry standards and best practices about how code is built, never about what it does or which features it has, and a codebase can fully meet them. Fix everything that fails them, at whatever priority its impact warrants. Once the standard is met, there is nothing left to do, and saying so is the correct result.

**Every finding must earn its place.** It names the checklist item it fails and the concrete benefit of fixing it: stability, security, correctness, performance, or maintainability. A change that only rewords, reshuffles or restyles code without one of those benefits is not a finding. An item that checks out is a Verified Safeguard, not a near miss to dress up as a finding, and a run that confirms nothing is a successful audit. Never lower the evidence bar, hunt for marginal issues, or promote advisory notes to avoid an empty queue; going in circles to look busy costs the developer time and adds nothing.

## Verdict

Every report opens with a verdict, so reaching the standard is stated plainly instead of implied by an empty section. Gated items are every checklist item except the Pass 4 judgment criteria (`QUAL-11` to `QUAL-16`), plus any `PROJ-NN` findings. Each ends with one outcome, recorded in the Checklist Coverage section:

| Outcome | Counts toward Standard met |
|---|---|
| Passed (a Verified Safeguard, or checked and nothing found) | Yes |
| Not Applicable | Yes |
| Confirmed by developer (a fact outside the code, stated by the developer) | Yes, listed by name in the verdict |
| Accepted (an answered decision, or a finding the developer chose not to fix, with their reason) | Yes, listed by name in the verdict |
| Finding (an open or blocked task) | No |
| Unverified (could not be checked) | No |
| Decision Needed (waiting on the developer) | No |

Verdict levels:
- **Audit in progress (Pass N of 4):** until all four passes are written. Items in passes not yet run have no outcome, so no other verdict applies. Report the open task count by priority alongside it.
- **Standard met:** the audit is complete, every gated item counts toward Standard met, and the queue has no open tasks. Advisory notes may remain.
- **Standard met, with gaps:** the audit is complete and the queue is empty, but some items are Unverified or Decision Needed. List them; they are what stands between this and Standard met.
- **Fixes remaining:** the audit is complete and open tasks remain. Give counts by priority, and say when no P0 or P1 tasks remain, because that is the first milestone.

Write it as one line with the evidence behind it, for example: "Standard met: 38 of 48 gated items passed, 7 not applicable, 2 confirmed by developer (SEC-15, ARCH-06), 1 accepted and reconfirmed today (SEC-16), at commit abc123 on 2026-11-06." Recompute the verdict at the end of every pass and every fix.

**Closing the gaps that code cannot.** Some items can never be proven from the repository: whether alerts reach a person, whether backups exist, a hosting dashboard setting. List each such Unverified item in the final report under Decisions Needed, saying exactly what would confirm it, and ask about them in one grouped question during the decision step, after the report has been presented. Their answer makes it Confirmed by developer, or a Finding if they say it is missing. Never mark an item Confirmed by developer on your own inference. An Unverified item caused by a missing tool stays Unverified, and the summary names the tool that would check it.

**Blocked tasks become decisions.** A task that cannot pass without weakening security or tests is a Decision Needed: the developer either accepts it with a reason, or keeps it open for a different approach.

**Earlier decisions are re-evaluated, never obeyed blindly.** Record every Accepted item in `.audit/accepted.md` (shared across runs; format in `references/report-template.md`) with its checklist ID, file and symbol, decision, reason, a testable premise where the reason has one, and dates. A recorded decision is a record of what the developer chose and why, not an instruction to stay quiet. The goal is the standard; developers forget old choices, and the reasons behind them stop being true.
- **Every audit still checks the item** like any other. A decision changes how a confirmed problem is reported, never whether it is looked at.
- **Test the premise against the code.** If the code now contradicts the recorded reason (the "invite-only beta" has public signup, the "admin-only" endpoint is reachable by users), re-open the item as a Finding or a Decision Needed, with the evidence.
- **Speak up when there is a reason to.** Whenever you have concrete evidence that reversing a decision would better meet the standard (the risk is larger than the reason assumed, a cheaper or cleaner fix now exists, the surrounding code or context changed, or a new advisory or standard applies), raise a **Reconsider** recommendation in Decisions Needed: the decision and its date, what changed, the evidence, the fix and its rough cost. Never hold back a real problem because a decision exists.
- **Do not re-argue without a reason.** A decision with no new evidence against it carries forward quietly, so audits do not go in circles over settled choices.
- **Reconfirm on a schedule.** At the start of each new audit (not on a resume), ask one grouped question listing every carried-forward decision with its date and reason, Reconsider recommendations first, so the developer can keep, reverse or review each. Include always: any item that would otherwise be P0 or P1, and any decision older than six months. If there is no answer, keep the decisions but mark them "carried forward, not reconfirmed".
- **Show what rests on old decisions.** In the verdict and Checklist Coverage, separate Accepted items reconfirmed this audit from those carried forward unconfirmed.

Only an audit can confirm **Standard met**. When fixing empties the queue of a complete audit, the verdict becomes "All findings fixed through commit `<hash>`; run `/codedetective new` to confirm the standard is met", because fixes change code the audit never saw. A fresh run that confirms nothing is what earns the verdict.

## Reconnaissance phases

Work in phases and append to the report after each, so progress survives if context runs out. For large repositories you may fan out read-only subagents to sweep and locate code, but a subagent's summary is a lead, not evidence; verify it before it gets a tier.

**The audit runs straight through.** Run Phase 0 and Passes 1 to 4 in one go, appending each to the report as it finishes. Do not stop between passes to summarize, and never offer to plan or fix anything before the audit is complete. The developer is promised the whole picture before any change is discussed, and a serious finding does not change that: it leads the final report. Pause only for one of these:
- **A question you cannot answer from the repository and cannot continue without.** Ask it on its own, with no offers attached, then carry on. Anything that can wait (a business choice, a fact only the developer knows) is recorded as a Decision Needed or an Unverified item and asked after the report is presented.
- **Context running low.** Stop cleanly at the end of the current pass, say which pass is next, and ask only whether to continue. Running `/codedetective` again resumes there.

The setup questions asked before Phase 0 (network tools, a stale run, earlier decisions to reconfirm) are part of starting, not a pause in the audit.

- **Phase 0: Discovery & Stack Profile.** Record exact versions of the runtime, frameworks, database driver or ODM, build tool and test runner. Map entry points, module boundaries, main data flows, and every external service with its per-environment configuration. Verify each developer-supplied claim. Run the evidence script. Write a short **Threat Model**: the trust boundaries (every place untrusted data enters, including uploads, webhooks, third-party responses and model output) and the assets worth stealing or breaking (accounts, personal data, payments, admin actions, paid API spend). Pass 1 works along these boundaries toward these assets. Then produce an **Applicability Map**: which checklist items apply, which do not, which conditional sections apply (AI and LLM features, payments), which project-specific hypotheses deserve extra scrutiny, and which stack reference files apply.
- **Pass 1: Security, Authorization & Data Integrity.** Read `references/pass-1-security.md`.
- **Pass 2: Performance & Runtime Behavior.** Read `references/pass-2-performance.md`.
- **Pass 3: Architecture, Contracts & Test Integrity.** Read `references/pass-3-architecture.md`.
- **Pass 4: Code Quality & Maintainability.** Read `references/pass-4-quality.md`.

**Stack reference files.** Load only the ones Phase 0 shows apply, and use them alongside every pass. Items in a loaded file are gated like checklist items, except any marked advisory: `references/stack-node-express.md`, `references/stack-react-vite.md`, `references/stack-mongoose.md`, `references/stack-r2-render.md`, `references/stack-playwright-jsdoc.md`. Each was written against versions current in late 2026; compare against the versions you recorded, and treat any claim marked "verify" as Unverified until confirmed in the repo or the official changelog.

**Technologies without a stack file.** For each major technology Phase 0 detects that has no stack file (a framework, database or ORM, storage service, hosting platform, auth provider or language, such as Supabase, Postgres with Prisma, Next.js, S3 or Vercel):
- Add a coverage row `GAP-<technology>` with outcome Unverified ("checked against the general checklists only"). This keeps the verdict honest: the best it can reach is Standard met, with gaps, naming the technology, unless the developer accepts general-depth coverage for it (then Accepted, with their reason).
- Look up that technology's current official security and best-practice documentation for the recorded version, and check the traps it names. Findings from that research are Probable until verified in the code, like any other.
- Say in the summary which technologies were checked in depth and which only against the general checklists.

Write the report using the structure and task schema in `references/report-template.md`.

**End of the audit: present the full report.** When Pass 4 is written, the run is complete. If there is a previous run, write the "Since last audit" comparison. Fill in Checklist Coverage and compute the verdict. Then show the report in the conversation, in full, using "Final report presentation" in `references/report-template.md`:
1. The verdict line and the counts.
2. **Every queued task**, grouped P0, then P1, then P2: its ID, what is wrong in plain words, where it is, and the evidence that proves it. Never cut the list down to highlights or "top findings"; the developer is deciding what to fix and needs all of it. Full traces and tool excerpts stay in the report file.
3. Probable and Unverified items, each with what would settle it.
4. Decisions Needed and the questions only the developer can answer.
5. What was not checked, and why.
6. The path to the report file.

Then stop. This is the developer's time to read and decide. Do not start planning or fixing, and do not recommend either. If the verdict is Standard met, say so plainly, offer only to stop or to review the advisory notes, and do not search further. Otherwise end with one question, multiple choice when available:
1. **Stop here so I can read it** (the default).
2. **Go through the decisions:** walk through the open questions and Decisions Needed.
3. **Plan the fixes:** invoke `plan`.

Tell the user in one line that they can also reply with corrections. Choosing option 3 counts as invoking `plan`. Anything else, including silence, means stop. Fixing is never offered here; it is offered once a plan is approved.

**The decision step.** After the report is presented and before any planning, the developer decides. Take what they bring in any order, and record each answer in the report (and in `.audit/accepted.md` or `.audit/false-positives.md` where it belongs):
- **Corrections.** A finding they say is wrong, or a fact about the system you got wrong, goes back through the verifier with their information. The finding is then kept, changed, or moved to false positives with the reason.
- **Questions only they can answer** (see "Closing the gaps that code cannot"), asked as one grouped question.
- **Decisions Needed.** Each answer becomes a queued task or an Accepted item with their reason.
- **Findings they choose not to fix.** Recorded as Accepted with their reason; the task leaves the queue.

Recompute the verdict after their answers and say what changed. Planning covers only what is still in the queue.

## Planning

Plans are where the user reviews a fix before any code changes, so a plan must be specific enough to approve or reject on its own: the files and symbols it will touch, what changes in each, the regression test, the verification commands, and the risk. A plan is not a restatement of the task; it is the task checked against the code as it is right now.

**Planning comes after the report and the decisions.** Plan only on a complete run whose full report has been presented. Before writing a plan, check for open Decisions Needed or unanswered questions that affect the tasks being planned, and ask them first; a plan built on an unanswered decision is a guess. Leave out anything the developer accepted or corrected away.

**Use Claude Code's plan mode.** Request it with the plan mode tool; the user approves the switch. In plan mode you can only read, so explore the current code, write the plan, and submit it for approval. If plan mode is unavailable or the user declines the switch, present the same plan in the conversation and wait for an explicit go-ahead. Either way, never edit code before a plan is approved.

**Save approved plans.** Plan mode keeps its own plan file, which does not survive sessions, so after approval copy the plan into the current run's `plans/<TASK-ID>.md` (or `plans/batch-<name>.md`), link it from the task's `PLAN` field, and set the task's progress to Planned.

**Single-task plan (inside `fix`).** Covers one task. On approval, execute it under the remediation rules below. If the user asks for changes, revise and resubmit; nothing is edited until a version is approved.

**Batch plan (`plan` mode).** Covers a tier or a named set of tasks:
1. Select the tasks and add any unfinished prerequisites they depend on, marking which were pulled in.
2. Order them by prerequisites first, then priority.
3. Read the current code for every task, then write one plan: the build order, a short per-task plan, and a section on interactions between tasks (shared files or symbols, an order that matters, one fix that changes what another must do, combined risk).
4. On approval, save it and mark every included task Planned. Then stop and ask, multiple choice when available: build the first task now, build the whole batch now (only when every task in it is P2; see Batch fixing), or stop. Approving a batch plan approves the approach, not the edits; each task is built in its own `fix` run with its own review stop, except a P2-only batch the user chooses to run with `fix batch`.

**Drift check before building a planned task.** Earlier fixes change the code a later plan was written against. Before building a task that already has an approved plan, re-read its targets and compare. The plan is still valid unless there is a material change: a target symbol moved, was renamed or was deleted; the approach no longer fits; the fix now needs files beyond the plan; the regression test cannot be written as planned; or a dependency would be added. With no material change, say in one line that the approved plan still holds and build it. With a material change, enter plan mode again for that task and get a fresh approval.

## Remediation (fix mode only)

1. Implement exactly one task per invocation, and only one whose prerequisites are done.
2. Get an approved plan first. If the task has none, plan it in plan mode. If it has one from a batch, run the drift check. Never write code without an approved, current plan.
3. Re-read the target files and symbols before writing code. Report line numbers drift as other fixes land.
4. Take a snapshot before writing any code: run `node "${CLAUDE_SKILL_DIR}/scripts/check-diff.mjs" --snapshot` and record the ID in the task. It captures the working tree as it is, including the developer's own uncommitted edits and earlier fixes, so the diff check judges only this fix's changes.
5. Before adding any helper or abstraction, search for an existing equivalent and reuse it. A new abstraction needs at least two real call sites.
6. Never add or upgrade a dependency without the user's explicit approval and a check that the exact package name exists in the registry with a credible history. Never install a package name you proposed yourself without that confirmation; AI-suggested package names are sometimes invented, and attackers register them.
7. Where feasible, write or update a focused regression test that fails before the fix. For preventive or structural work where nothing can be reproduced, state how the fix is verified.
8. Build what the approved plan says, and keep the diff to it, roughly a handful of files. If the work turns out to need a material departure from the plan, stop and re-plan rather than improvise. Formatting or style changes go in their own task, never mixed with behavior changes.
9. Run the task's verification commands under the same isolation rules as reconnaissance.
10. Run `node "${CLAUDE_SKILL_DIR}/scripts/check-diff.mjs" --base <snapshot ID>`, adding `--allow <file>` for each config file the approved plan names. It fails if this fix adds test skips or focus markers, a suppression comment without a written reason (`@ts-ignore` and `@ts-nocheck` always fail), disabled TLS checks, `--no-verify`, a deleted test file or a test moved out of the test paths, or an unplanned change to a config file that can switch checks off. It flags for review a suppression with a written reason, removed assertions, empty catch blocks and manifest changes; each needs a stated justification in the task. A failure means the fix is rejected: undo only this fix's offending change (never anything that was in the snapshot) and find a real fix, or stop and report the blocker.
11. Rerun the evidence script with `--out .audit/runs/<run-id>/evidence/after-<TASK-ID> --compare <the previous evidence folder>`, so the baseline that findings cite is never overwritten, and record the change table in the task. A fix that makes a count worse needs a stated reason.
12. Mark the task done in the report with its verification results, recompute the verdict, then stop and ask the user to review before the next task. When this was the last open task, say so and offer `/codedetective new` to confirm the standard is met. End with a question, multiple choice when available: fix the next task, or stop. Name the next task in the option.

**Batch fixing (P2 only).** Hygiene work like dead exports or duplication can run to dozens of tasks, and a review stop after each costs more than it protects. `/codedetective fix batch <name>` builds every task in an approved batch plan back to back:
- Only P2 tasks, under a batch plan the user approved. P0 and P1 tasks always get their own fix run and review stop.
- Each task still goes through every remediation step: drift check, its own snapshot, regression test where feasible, verification commands, diff check and evidence rerun.
- Stop at the first failing test, diff check FAIL, material drift from the plan, new dependency, or anything the plan did not cover, and report which task stopped and why. Earlier tasks in the batch stay done.
- REVIEW items from the diff check are justified in each task as usual and listed together at the end.
- End with one review stop covering the whole batch: each task's result, the combined evidence change, and the REVIEW items.

**Never weaken security or test integrity to make a check pass.** That includes hardcoding tokens or credentials, disabling TLS verification, commenting out or bypassing auth middleware, skipping or deleting tests, loosening assertions, adding suppression comments, bypassing git hooks, and catching and swallowing errors. These shortcuts convert a visible problem into an invisible one. If a task cannot pass without one of them, stop and report the blocker.

Never commit, push, deploy or open a pull request unless the user asks for it.

## Talking to the user

The end of the audit is the one stop that is not a summary: present the full report as described under "End of the audit". At every other stop, give a short spoken-style summary: which run you are working in (and whether it is new or resumed), where things stand (for example "Pass 2 of 4 done" at a pause, or the task just finished), the current verdict, what changed since the last stop, any Decisions Needed that are waiting on the user, and what comes next, pointing to the report file for detail. End every stop with a question offering the next steps, never just a list of commands to type. Say plainly what was not checked and why; the user needs to know the gaps as much as the findings.
