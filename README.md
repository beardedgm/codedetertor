# codedetective

A Claude Code skill for evidence-backed code health audits and one-task-at-a-time remediation.

It investigates a repository the way a careful lead developer would. Every suspicion stays a hypothesis until evidence proves it. Findings are grounded in real analyzer output and complete traces, and a separate verifier tries to refute each one before it can become a task. The goal is good clean code: secure, understandable, consistent, and following current best practice for the versions the project actually uses.

## Install

Copy this folder so the skill lives at one of these paths:

- `~/.claude/skills/codedetective/` makes it available in every project.
- `.claude/skills/codedetective/` inside a repository makes it available in that project only.

Start a new Claude Code session, and `/codedetective` appears.

## Usage

| Command | What it does |
|---|---|
| `/codedetective` | Starts the audit, or resumes it where it stopped. Never starts fixing. |
| `/codedetective pass <1-4>` | Runs or reruns one pass. |
| `/codedetective fix <TASK-ID>` | Fixes one task from the queue, then stops for review. |
| `/codedetective fix` | Fixes the next eligible task, then stops for review. |
| `/codedetective status` | Reports progress. Changes nothing. |

The audit runs in phases and writes everything to `.audit/code-health-report.md` in the target repository:

- **Phase 0:** discovery, stack profile and tool evidence.
- **Pass 1:** security, authorization and data integrity. The audit stops here for your review.
- **Pass 2:** performance and runtime behavior.
- **Pass 3:** architecture, contracts and test integrity.
- **Pass 4:** code quality and maintainability.

Reconnaissance is read-only. Code changes happen only when you run `fix`, one reviewed task at a time.

## Optional files in the target repository

- `.audit/context.md`: your project's stack, claimed invariants, known concerns, and services that must never be touched. The template is in `references/report-template.md`.
- `.audit/false-positives.md`: findings refuted for reasons that recur, so they are not reported again. The skill maintains this file itself.

## Recommended analyzers

The evidence script uses whatever is already installed in the target project and never installs anything. For the fullest evidence, add these as dev dependencies or put them on your PATH: `typescript`, `eslint` (with `eslint-plugin-react-hooks` and `eslint-plugin-sonarjs` for React projects), `knip`, `madge`, `jscpd`, and `gitleaks`. Tools that need the network (`npm audit`, `osv-scanner`) run only when you agree.

## Layout

```
SKILL.md                     workflow, modes, evidence rules, safety rules
references/pass-1..4-*.md    checklist for each pass
references/stack-*.md        stack-specific checks, loaded only when detected
references/report-template.md
scripts/collect-evidence.mjs read-only analyzer runner
scripts/check-diff.mjs       rejects fixes that weaken tests or add suppressions
```

## Requirements

Claude Code, and Node.js for the bundled scripts. The `argument-hint` and `disable-model-invocation` frontmatter fields are Claude Code features; remove them if you load the skill somewhere that rejects them.
