# Intent: What `codedetective` Is Built For

Modern coding agents let a small team or solo builder ship at studio speed — and just as quickly accumulate hidden security holes, concurrency races, brittle contracts, and subtle bloat that nobody has time to audit by hand. Ordinary AI code reviews don't solve this: ask an AI to "review the codebase" and you get unverified guesses, shifting opinions, and an endless stream of nits that changes every time you ask.

`codedetective` turns codebase health from subjective guesswork into a repeatable, evidence-backed engineering discipline with a clear finish line.

## The Vision

Think of `codedetective` as an automated principal engineer paired with a licensed building inspector:

- It inspects the **entire** repository against a fixed, published standard — never against an AI's personal taste.
- It **proves** every failure with analyzer output, complete traces, failing tests, or local measurements before queuing any work.
- It **repairs** only what fails the standard, one approved, reviewable pull request at a time, guarded by regression tests and anti-gaming checks.
- And once nothing remains that fails the standard, **it says so and stops** instead of inventing busywork.

## Why Ordinary AI Reviews Break Down

1. **Subjectivity and endless churn:** Without a finite standard, every review invents new stylistic preferences, so a codebase can never reach "done."
2. **Hallucinated bugs and false confidence:** Reviews without deterministic tooling either cry wolf on unreachable code or rubber-stamp `"looks good"` without reading every file.
3. **Silent regressions and circular fixes:** Fixing duplication creates an over-abstracted helper; removing the helper brings duplication back — unless something remembers across runs.
4. **Cheating to go green:** Under pressure to make tests or builds pass, agents skip tests, loosen assertions, or add `@ts-ignore` unless a hard gate inspects every diff.
5. **Alert fatigue:** Mixing cosmetic nits with real security or data-loss risks trains developers to ignore the whole report.

## How `codedetective` Works Differently

### 1. Published standards, never AI taste
Every gated check traces to a named industry source — **OWASP Top 10:2025**, **OWASP ASVS 5.0**, **OWASP LLM Top 10**, **CWE / ISO 5055**, **Sonar Cognitive Complexity**, **Twelve-Factor**, **Google SRE**, and each framework's own current documentation — paired with explicit caveats for defenses that only *look* safe.

### 2. Proof on both sides
Findings require concrete evidence, security and high-priority claims must survive an independent adversarial verifier without seeing the audit's reasoning, every `Passed` checklist item must show what was examined and what it proved, and every completed audit faces a blind area-by-area **Challenge** looking for anything the first look missed.

### 3. Built to converge, not loop forever
- **Strict priority by consequence:** P0 (security/data-loss/outage), P1 (measured bottlenecks/races/usability damage), and P2 (hygiene above a clear materiality bar) — P0 and P1 always land before P2 is re-checked and grouped.
- **Non-blocking Advisory Notes:** Style opinions, cosmetic discrepancies, and sub-bar nits never block `Standard met` or clutter your PR queue, while cross-run **Seen** counts (plus optional muting) let recurring debt surface cleanly without alert fatigue.
- **Deterministic memory:** `history.mjs` tracks findings, renames, follow-on regressions (`follows-fix`), comebacks, and fix loops (`circle`), stopping loops for a human decision instead of ping-ponging.

### 4. Human authority with automated discipline
Reconnaissance never touches your code or production systems. Nothing changes without an approved plan. Every fix takes a working-tree snapshot, runs a failing-then-passing regression test, passes an anti-gaming diff check, verifies analyzer deltas before and after, and leaves cleanly on its own branch and pull request. Even past developer decisions (`accepted.md`) are re-tested against live code so stale assumptions reopen automatically when reality changes.

### 5. Radical honesty about gaps
Missing analyzers, unexamined files, unconfirmed operational facts, `Probable` leads, and unmodeled stacks stay visibly `Unverified` rather than silently passing. When `codedetective` reports **`Standard met`**, you know exactly what was checked, what tools ran, and what stands behind the claim.

## Constraints & Non-Goals

### Hard Constraints
- **Read-only reconnaissance:** Audit discovery and multi-pass inspection never modify the audited codebase or touch production systems.
- **No weakening checks to go green:** Fix Mode never deletes failing assertions, bypasses linters or type checks, loosens security controls, or adds broad suppressions to manufacture a passing verdict.
- **No secrets or source dumps in audit artifacts:** Saved reports, logs, and history ledgers never record raw credentials, tokens, or pasted source code blocks.
- **No queue pollution:** `Partial` verifications, borderline speculation, and cosmetic nits never enter the remediation queue as blocking tasks; unexamined code, missing analyzers, and unconfirmed facts stay `Unverified` rather than `Passed`.
- **No autonomous production or destructive git actions:** `codedetective` requires human approval before modifying code, never merges PRs or force-pushes shared branches unprompted, and never deploys to production.

### Non-Goals
- **Not a quick single-diff reviewer:** Built for full-repository, multi-pass engineering audits with tracked convergence rather than one-off style feedback on an isolated PR or bug.
- **Not a substitute for product or architecture design:** Audits correctness, security, and maintainability against engineering standards and declared intent rather than inventing product requirements.
- **Not a mathematical proof of zero bugs:** Delivers repeatable, tool-backed verification within explicit scope and stated coverage limits.

## Who It's For

Solo builders, small product studios, and fast-moving engineering teams shipping with AI coding agents who want production-grade security, reliability, and maintainability — without dedicating a team to manual audits, fighting alert fatigue, or settling for "good enough" guesses.

## What Success Looks Like

- Critical security and data-integrity risks (**P0** and **P1**) drive down to zero and stay there.
- Every shipped fix is small, proven, reversible, and tested against regressions.
- Persistent design debt is visible by frequency, never forced into blocking churn.
- You spend your time building product — with objective, verifiable certainty in the foundation underneath it.
