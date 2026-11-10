# Report Template & Task Schema

## Contents
- Optional developer context file (`.audit/context.md`)
- False positives file (`.audit/false-positives.md`)
- Accepted items file (`.audit/accepted.md`)
- Plan files (`plans/` in the run folder)
- Report structure (`code-health-report.md` in the run folder)
- Since last audit
- Final report presentation (what is shown in the conversation when the audit ends)
- Task schema
- Progress tracking

---

## Optional developer context file

The developer can drop this at `.audit/context.md` to sharpen the investigation. Offer it once if it is missing, then carry on without it. Treat everything in it as a claim to verify.

```markdown
# Project Context
- Project name and purpose:
- Stack (languages, frameworks, database, storage, hosting):
- Repository layout:
- Claimed invariants to verify:
- Known concerns or recent incidents:
- Production services that must never be touched:
- Areas out of scope:
- Network tools allowed (public vulnerability databases): <yes | no>
```

---

## False positives file

Persistent exclusions, read at the start of every invocation. Add an entry whenever a finding is refuted for a reason that will recur. Remove or revise an entry if the code changes so its reason no longer holds.

```markdown
# False Positives
## <Short name>
- Checklist ID: <e.g. QUAL-03>
- Pattern: <what the finding looked like, e.g. "dead export flagged in server/routes/*.js">
- Reason: <why it is not a real issue, e.g. "routes are loaded dynamically by the router index">
- Added: <date>, during <pass or task ID>
```

---

## Accepted items file

Items the developer decided on: an answered Decision Needed, a finding they chose not to fix, or a blocked task they accepted. Read at the start of every invocation and carried across runs, but re-evaluated, never obeyed blindly (see "Earlier decisions are re-evaluated" in SKILL.md): each audit still checks the item, tests its premise against the code, compares the decisions with each other, and raises a Reconsider recommendation when there is evidence that reversing one would better meet the standard. The developer reviews them in the final report, not before the audit. Facts the developer confirmed (Confirmed by developer) are recorded in the run's report, not here, because they can change between audits and are asked again each time.

```markdown
# Accepted
## <Checklist ID>: <short name>
- Where: <path :: symbol>
- Decision: <what the developer chose, in their words>
- Reason: <why>
- Premise to check: <a condition the code can confirm, e.g. "signup requires an invite code", or "none">
- Accepted: <date>, during <run-id> <task or section>
- Last reconfirmed: <date, or "not yet">
```

---

## Plan files

Approved plans are saved in the current run's `plans/` folder after plan mode, because plan mode's own file does not survive sessions. One file per single-task plan, one per batch.

```markdown
# Plan: <TASK-ID> | batch-<name>
- Approved: <date>
- Against commit: <short hash>
- Tasks (batch only): <ordered TASK-IDs, noting any prerequisites pulled in>

## Interactions (batch only)
<shared files or symbols, required order, one fix changing what another must do, combined risk>

## <TASK-ID>: <title>
- Files and symbols: <path :: symbol, per change>
- Changes: <what changes in each>
- Regression test: <file and what it asserts, or how the fix is verified when no test is feasible>
- Verification: <commands>
- Risk: <blast radius and containment>
- Differs from report task: <anything the current code forced to change, or "nothing">
```

---

## Report structure

Write `code-health-report.md` in the current run's folder (`.audit/runs/<run-id>/`) with exactly these sections. Append each pass as you finish it, and keep the verdict and sections 7 to 10 current as findings accumulate.

```markdown
# <Project Name>: Code Health & Self-Remediation Plan

**Verdict:** <Audit in progress (Pass N of 4) | Standard met | Standard met, with gaps | Fixes remaining>: <one line with the evidence, e.g. "38 of 48 gated items passed, 7 not applicable, 2 confirmed by developer (SEC-15, ARCH-06), 1 accepted and reconfirmed today (SEC-16), at commit abc123 on 2026-11-06", or open task counts by priority, or "All findings fixed through commit def456; run /codedetective new to confirm the standard is met">

## 0. Progress
- Run: <run-id>, started <date and time> against commit <short hash>
- Status: <unfinished | complete | abandoned>
- Previous run: <run-id, or "none">
- Phase 0: <done | in progress | not started>
- Pass 1: <...>
- Pass 2: <...>
- Pass 3: <...>
- Pass 4: <...>
- Full report presented: <date, or "not yet">
- Decisions: <n waiting on the developer | all answered on date>
- Remediation: <n of m tasks done; next eligible task ID>
- Active batch plan: <plans/batch-<name>.md, tasks remaining | none>

## 1. Codebase Familiarization & Baseline
- **Git State:** commit hash, working tree status, pre-existing changes.
- **Stack Profile:** exact versions of runtime, frameworks, ODM or driver, build tool, test runner.
- **Architecture Summary:** entry points, module boundaries, main data flows, external services.
- **File Inventory:** every source file in scope, counted by area, taken from the repository itself, and what was left out (generated output, vendored code, lockfiles, binary assets). Section 10 tracks what has been examined.
- **Threat Model:** trust boundaries (where untrusted data enters) and assets (what is worth stealing or breaking).
- **Context Verification:** each developer-supplied claim marked verified, false, or unverifiable.
- **Applicability Map:** items that apply, items Not Applicable (with reasons, by ID), conditional sections that apply, project-specific hypotheses added, stack reference files loaded.
- **Evidence Baseline:** the evidence script summary (tools run, tools missing, tools skipped and why, key counts). Tools that would help but are not installed are listed as recommendations; never install them during reconnaissance.
- **Baseline Checks:** build, type check, lint and test commands that were safe to run, with results. Separate pre-existing failures from audit limitations, and list commands skipped for isolation reasons.

## 2. Verified Safeguards
Existing defenses confirmed working, with file locations and the checklist ID each satisfies.

## 3. Probable & Unverified Findings
For each:
- **Checklist ID, Topic & File Location:**
- **Tier:** Probable | Unverified
- **Observed Indicator:** why it was flagged.
- **Next Step:** the specific command, trace or environment that would confirm or dismiss it.

## 4. Decisions Needed
**New decisions.** Questions only the developer can answer: a business choice the right fix depends on, a blocked task, or a fact the code cannot show. For each: the checklist ID, what was found, the choice or fact needed, and the options with their trade-offs. Once answered, record the outcome here and in Checklist Coverage: a task, Accepted (and an entry in `.audit/accepted.md`), Confirmed by developer, or a Finding if the developer says something is missing.

**Earlier decisions.** Every decision carried forward in `.audit/accepted.md`, reviewed against today's code and against each other. List **Reconsider** recommendations and conflicts first; a Reconsider also gives what changed, the evidence, and the fix and its rough cost. The rows below are format examples only:

| ID | Decision and date | Reason given | What the code says now | Conflicts with | Recommendation |
|---|---|---|---|---|---|
| SEC-16 | No signup rate limit, 2026-08-02 | Invite-only beta | Contradicted: public signup route added in server/routes/auth.js | none | Reconsider: add the limit (small, one middleware) |
| PERF-08 | No graceful shutdown, 2026-09-10 | "We only ever run one instance" | Cannot tell from the code | ARCH-04 decision of 2026-10-20 added a second instance | Conflict: which is true? |
| QUAL-02 | Keep the two export helpers, 2026-07-15 | They change for different reasons | Still holds | none | Keep |

Record the developer's answer for each (kept, reversed, or updated) with the date, here and in `.audit/accepted.md`. One they do not answer stays in force, marked "carried forward, not reconfirmed".

## 5. Advisory Notes
Judgment findings from Pass 4. For each: the checklist ID, location, the issue, the concrete simpler alternative, and its rough diff size. These never count against the verdict; the developer may promote any into the queue as P2.

## 6. Since Last Audit
Only when there is a previous run. Match findings by checklist or stack ID plus file and function or symbol (never line numbers, which drift), and `PROJ` findings by file, symbol and description, after every finding in this run has been verified on its own. List:
- **Fixed:** in the previous run, not found now (note whether its task was marked Done).
- **Still open:** found in both runs.
- **Regressed:** a task marked Done in the previous run, found again now. Flag these in the queue and rank them ahead of other tasks of the same priority.
- **New:** found now, not in the previous run.
- **Not compared:** previous findings that could not be matched (changed IDs, a legacy run, moved code).

## 7. Top Systemic Risks
Up to five highest-impact Confirmed risks. If fewer than five meet the bar, list only those.

## 8. Ordered Remediation Queue
Tasks in the schema below.

## 9. Checklist Coverage
One line per gated item (every checklist item except `QUAL-11` to `QUAL-16`, plus loaded stack items, `GAP` rows and `COV` rows), plus any `PROJ-NN` findings, so the verdict can be checked. The rows below are format examples only:

| ID | Outcome | Where or why |
|---|---|---|
| SEC-01 | Passed | Verified Safeguard: session cookies HttpOnly, Secure, SameSite=Lax in server/auth.js |
| SEC-20 | Not Applicable | No LLM features |
| SEC-03 | Finding | P0-01 |
| SEC-15 | Confirmed by developer | Developer, 2026-11-06: "Sentry alerts page me on auth error spikes" |
| SEC-16 | Accepted, reconfirmed 2026-11-06 | No signup rate limit: invite-only beta; premise checked, signup still requires an invite code |
| MONGO-02 | Passed | Filters built from picked fields in server/routes/*.js |
| GAP-Supabase | Unverified | No stack reference; checked against the general checklists only |

Rows cover every gated checklist item, every non-advisory item of each loaded stack reference, one `GAP-<technology>` row per detected technology with no stack reference, and one `COV-<area>` row per area or file left unexamined (section 10). Outcomes: Passed (a Verified Safeguard or nothing found), Not Applicable, Confirmed by developer (with what they said and the date), Accepted (with the reason), Finding (with task or section reference), Unverified (with the blocker), Decision Needed. The verdict counts come from this table.

## 10. Codebase Coverage
Shows that the audit examined the whole repository, so "we looked at everything" can be checked. Update it as each pass finishes. The rows below are format examples only:

- Inventory: <n> source files in scope across <m> areas, from `git ls-files` at commit <short hash>. Left out: <generated output, vendored code, lockfiles, binary assets, with paths>.
- Examined: <n of n> files read in this run.

| Area | Files | Read | Passes that examined it | Not examined, and why |
|---|---|---|---|---|
| server/routes | 24 | 24 | 1, 2, 3, 4 | - |
| client/src/legacy | 40 | 0 | none | Session ended before it was reached; COV-client-legacy is Unverified |

Every file in the inventory is read at least once, and every pass considers every area. Anything left unexamined when the run ends is listed here with the reason and gets a `COV-<area>` row in section 9 marked Unverified.
```

---

## Final report presentation

When the audit is complete, show this in the conversation, in this order. It is the whole picture the developer decides from, so list every queued task and never cut it down to highlights. Keep each row short; the full traces and tool excerpts stay in the report file.

1. **Verdict:** the verdict line.
2. **At a glance:** task counts by priority (P0, P1, P2), how many items are Probable or Unverified, how many decisions are waiting on the developer, how many advisory notes there are, and what was examined: the four passes, the stack references loaded, and how many source files were read out of the inventory (for example "412 of 412 files").
3. **P0 Critical**, then **P1 High**, then **P2 Hygiene:** one table for each, with every task in queue order. A priority with no tasks says "None".

   | Task | What is wrong | Where | Evidence |
   |---|---|---|---|
   | P0-01 (SEC-03) | Any signed-in user can read another tenant's invoices | server/routes/invoices.js :: getInvoice | Trace: the request's ID reaches `Invoice.findById` with no owner check. Verifier could not refute it. |

   The row above is a format example only. "What is wrong" is one plain sentence a developer outside the project would understand. "Evidence" names the kind of proof and its key fact: the tool and what it reported, the trace's source and sink, the failing test, or the measurement.
4. **Not proven yet:** every Probable and Unverified item, with its ID, what was seen, and the step that would settle it.
5. **Waiting on you:** every Decision Needed and every question only the developer can answer, each with the choice or fact needed. Then **your earlier decisions**, as the table from section 4: each one with what the code says now, any conflict with another decision, and a keep or reconsider recommendation, Reconsider and conflicts first.
6. **Not checked:** any files or areas that were not examined and why, tools that were missing or skipped, checks that did not happen, and technologies checked only against the general checklists.
7. **Where the full report is:** the path to `code-health-report.md`, and one line saying that nothing has been changed and nothing will be planned or fixed until they ask.

Record the date in the Progress section ("Full report presented"). If the conversation ends before the developer has seen it, present it again when they next run `/codedetective`.

---

## Task schema

Order tasks topologically: prerequisites (shared contracts, security boundaries) before the changes that depend on them. Keep each task to one reviewable diff, roughly a handful of files; split anything bigger. Formatting or style changes are always their own task.

Priorities, by reachable consequence:
- **P0 Critical:** demonstrated security boundary failure, proven data loss or corruption, severe service failure.
- **P1 High Drag:** substantial usability degradation, measured performance bottleneck, confirmed race condition.
- **P2 Hygiene & Architecture:** type strictness, contract parity, dead code, duplication, modernization, preventive maintenance.

The block below is a format template only. Do not report it, and do not assume any file, function or bug it implies exists.

```task
[TASK-ID]: <P0-01 | P1-01 | P2-01>
TITLE: <Concise, action-oriented title describing the remediation>
STATUS: <Confirmed | Preventive>
PRIORITY: <P0 | P1 | P2>
PROGRESS: <Queued | Planned | In progress | Done | Blocked: reason>
PLAN: <plans/<file>.md in the run folder once a plan is approved, or "none">
CHECK_ID: <Checklist ID, e.g. SEC-03, or PROJ-NN for a project-specific finding>
SUBSYSTEM: <Comma-separated list of affected areas>
STANDARD: <Security: OWASP Top 10:2025 category and ASVS 5.0 chapter. Others: the source tag on the checklist item (a CWE ID or named practice from sources.md). PROJ-NN: the closest source, or "none">
TARGET_SYMBOLS:
  - <path/to/file :: functionOrClassSymbol (Lstart-Lend)>
EVIDENCE:
  <File and line, plus tool output (exact command and short excerpt), a complete source-to-sink trace, a failing test, or a recorded measurement>
VERIFIER:
  <Verdict from the refutation step and why the finding survived, or "n/a" for tool-backed P2 hygiene>
FAILURE SCENARIO:
  <Triggering condition/input -> reachable execution path -> observed failure consequence>
COMPATIBILITY & DATA IMPACT:
  <Migrations, saved data format impacts, API breaking changes, or "None">
PREREQUISITES: <None | Comma-separated list of prerequisite TASK-IDs>
ACTION PLAN:
  1. <Specific implementation step>
  2. <Defensive edge case or cleanup step>
IMPLEMENTATION RISK & CONTAINMENT:
  <Potential blast radius and regression mitigation strategy>
VERIFICATION COMMANDS:
  - Planned: <Specific test command for this change>
  - Planned: <Type check, lint, or build command>
DONE CRITERIA:
  <Unambiguous, verifiable condition confirming the fix without regression>
VERIFICATION RESULTS:
  <Filled in when done: commands run and outcomes, diff check result, evidence delta before and after>
```

---

## Progress tracking

When a plan is approved, set each covered task's `PROGRESS` to Planned and fill in `PLAN`. When a task finishes, set its `PROGRESS` to Done, fill in `VERIFICATION RESULTS`, and update section 0. When a task is blocked (for example it cannot pass without weakening security or tests, or it needs a dependency the user has not approved), set `PROGRESS` to `Blocked: <reason>`, add it to Decisions Needed, and stop. The next eligible task is the first in queue order that is Queued or Planned and whose prerequisites are all Done; while a batch plan is active, take its next task in the batch's order. When the full report has been shown, record the date under "Full report presented", and keep the "Decisions" line current as the developer answers.
