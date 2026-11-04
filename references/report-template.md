# Report Template & Task Schema

## Contents
- Optional developer context file (`.audit/context.md`)
- False positives file (`.audit/false-positives.md`)
- Report structure (`.audit/code-health-report.md`)
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
```

---

## False positives file

Persistent exclusions, read at the start of every invocation. Add an entry whenever a finding is refuted for a reason that will recur. Remove or revise an entry if the code changes so its reason no longer holds.

```markdown
# False Positives
## <Short name>
- Pattern: <what the finding looked like, e.g. "dead export flagged in server/routes/*.js">
- Reason: <why it is not a real issue, e.g. "routes are loaded dynamically by the router index">
- Added: <date>, during <pass or task ID>
```

---

## Report structure

Write `.audit/code-health-report.md` with exactly these sections. Append each pass as you finish it, and keep sections 5 and 6 current as findings accumulate.

```markdown
# <Project Name>: Code Health & Self-Remediation Plan

## 0. Progress
- Phase 0: <done | in progress | not started>
- Pass 1: <...> (review stop: <pending | cleared>)
- Pass 2: <...>
- Pass 3: <...>
- Pass 4: <...>
- Remediation: <n of m tasks done; next eligible task ID>

## 1. Codebase Familiarization & Baseline
- **Git State:** commit hash, working tree status, pre-existing changes.
- **Stack Profile:** exact versions of runtime, frameworks, ODM or driver, build tool, test runner.
- **Architecture Summary:** entry points, module boundaries, main data flows, external services.
- **Context Verification:** each developer-supplied claim marked verified, false, or unverifiable.
- **Applicability Map:** items that apply, items Not Applicable (with reasons), project-specific hypotheses added, stack reference files loaded.
- **Evidence Baseline:** the evidence script summary (tools run, tools missing, tools skipped and why, key counts). Tools that would help but are not installed are listed as recommendations; never install them during reconnaissance.
- **Baseline Checks:** build, type check, lint and test commands that were safe to run, with results. Separate pre-existing failures from audit limitations, and list commands skipped for isolation reasons.

## 2. Verified Safeguards
Existing defenses confirmed working, with file locations.

## 3. Probable & Unverified Findings
For each:
- **Topic & File Location:**
- **Tier:** Probable | Unverified
- **Observed Indicator:** why it was flagged.
- **Next Step:** the specific command, trace or environment that would confirm or dismiss it.

## 4. Advisory Maintainability Notes
Judgment findings from Pass 4. For each: the location, the issue, the concrete simpler alternative, and its rough diff size. These never become P0 or P1 tasks; the developer may promote any of them into the queue as P2.

## 5. Top Systemic Risks
Up to five highest-impact Confirmed risks. If fewer than five meet the bar, list only those.

## 6. Ordered Remediation Queue
Tasks in the schema below.
```

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
PROGRESS: <Queued | In progress | Done | Blocked: reason>
SUBSYSTEM: <Comma-separated list of affected areas>
STANDARD: <OWASP Top 10:2025 category and ASVS 5.0 chapter for security findings, or "n/a">
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

When a task finishes, set its `PROGRESS` to Done, fill in `VERIFICATION RESULTS`, and update section 0. When a task is blocked (for example it cannot pass without weakening security or tests, or it needs a dependency the user has not approved), set `PROGRESS` to `Blocked: <reason>` and stop. The next eligible task is the first in queue order that is Queued and whose prerequisites are all Done. Mark the Pass 1 review stop as cleared when the user invokes reconnaissance again after it.
