# History: tracking findings and fixes across runs

`scripts/history.mjs` keeps `.audit/history.json` so later runs tell what came back, what followed a fix, and what is going in circles. Matching runs by rule in that script rather than by eye.

## Contents
- Blind audit rule
- After the challenge: recording a run
- Advisory note recurrence and muting
- Planning: checking history before changing code
- Remediation and delivery: recording each fix
- Decisions: settling circles and updating status
- Recovery from git

## Blind audit rule

Every audit still examines the whole codebase from scratch. Never read `.audit/history.json` or call `history.mjs` before Phase 0, Passes 1 to 4, and the challenge (`references/challenge.md`) are all written. The only time `history.mjs` is read before an audit ends is `lookup` during planning on an already-complete run.

## After the challenge: recording a run

At the end of Stage 1 (once the challenge is written and every confirmed finding in this run is verified on its own), write the open and confirmed findings of this run as a JSON array to `.audit/runs/<run-id>/scratch/findings.json`:

```json
[
  { "id": "QUAL-02", "file": "src/a.js", "symbol": "helper" }
]
```

Then run (adding `--advisories` when Section 5 has advisory notes):

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" record-run --run <run-id> --findings .audit/runs/<run-id>/scratch/findings.json [--advisories .audit/runs/<run-id>/scratch/advisories.json]
```

Use its JSON output to write Section 6 ("Since Last Audit") in `code-health-report.md` and handle each label as follows:

| Label | Meaning and action |
|---|---|
| `circle` | Came back a second time, or fixing A caused B and fixing B brought A back. **Do not auto-queue another fix.** Move it to Section 4 (Decisions Needed) with the chain or comeback count and commits since the fix, so the developer decides how to break the loop (fix differently or settle it). |
| `came-back` | Previously fixed, now back again. Flag as regressed in the queue, rank ahead of other tasks of the same priority, and include `fixedBy` and `changedSince`. |
| `follows-fix` | New finding in code created or changed by an earlier fix. Flag in the queue and Section 6, naming the earlier task and commit. |
| `still-open` | Found in an earlier run and still open. Keep in the queue and Section 6. |
| `new` / `first-run` | Not seen in earlier runs (or the first recorded run). |
| `fixed` | Recorded fixed earlier and not found in this run. |
| `settled` / `accepted` | Recorded as settled or accepted in `.audit/history.json`. Still verify against today's code under "Earlier decisions are re-evaluated" in `SKILL.md`; if the reason no longer holds, raise it to Decisions Needed. |
| `gone` / `not-compared` | Previously open, not found this time with no recorded fix (`gone` if the file still exists; `not-compared` if the file disappeared with no git rename). |

## Advisory note recurrence and muting

Pass `--advisories .audit/runs/<run-id>/scratch/advisories.json` (same `{ "id", "file", "symbol" }` array shape) to `record-run` to track how many independent audits have noticed each advisory nit.

- Advisory recurrence lives in its own `advisories` ledger in `.audit/history.json` — it **never** enters `entries`, `comebacks`, `circle`, the remediation queue, or the `Standard met` verdict.
- An advisory nit absent from a later run simply does not appear in that run's Section 5 (no `gone` tracking).
- Sort Section 5 using `advisories` from `record-run` (most-recurring active items first) and show each item's `Seen` indicator (`1st time`, or `<seenCount>× since <firstSeen>`). Collapse any `muted` advisories into a single summary line at the bottom of Section 5.
- If the developer decides a recurring nit is intentional and doesn't want it surfaced in future Section 5 lists, optionally mute (or later unmute) it:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" set-advisory --id <CHECK-ID> --at <file#symbol> --status <muted|active> --note "<reason>"
```

## Planning: checking history before changing code

During Stages 4 and 7 (before writing any single-task, batch, or P2 group plan), inspect prior findings and fixes for each target symbol or file:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" lookup --at <file#symbol>
```

Check for earlier fixes, comebacks, or `follows-fix` links at that location, and record any relevant history in the plan's Interactions or Risk section so the plan does not repeat a failed approach or undo an earlier fix.

## Remediation and delivery: recording each fix

First run `lookup --at <file>` to check whether an earlier or open entry already exists and match the exact `<file#symbol>` recorded by `record-run` (using one canonical checklist ID per entry, never slash-joined IDs like `PW-03/PW-05`). If `record-fix` gets a slightly different or omitted symbol name, it auto-matches only when there is a single open entry for that `(id, file)`; when multiple open entries share `(id, file)`, it leaves them untouched and emits a warning.

Before committing a proven fix, generate its commit trailer:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" label --run <run-id> --task <TASK-ID> --id <CHECK-ID> --at <file#symbol>
```

That emits `Codedetective-Fix: <run-id>/<TASK-ID> <CHECK-ID> <file#symbol>`. Include it as the final line of the commit message (`references/delivery.md`).

Immediately after committing (or under `Delivery: ask`, once Proof of done is met, and again with `--commit <short-sha>` once committed), record the fix:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" record-fix --run <run-id> --task <TASK-ID> --id <CHECK-ID> --at <file#symbol> --commit <short-sha> [--created <file#symbol>]... [--changed <file#symbol>]... [--renamed <old#sym=new#sym>]...
```

Pass `--created` for new files/symbols, `--changed` for additional files/symbols modified, and `--renamed` whenever the fix moved or renamed a symbol so later audits still match it.

## Decisions: settling circles and updating status

Whenever the developer accepts a finding, settles a circle so it stops looping, or reverses an earlier choice during Stage 3 (or at any decision stop), update `.audit/accepted.md` and sync `.audit/history.json`:

```bash
node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" set-status --id <CHECK-ID> --at <file#symbol> --status <open|accepted|settled> --note "<reason>"
```

Use `settled` for circles the developer chose to stop chasing, `accepted` for accepted findings/decisions, and `open` when reversing a decision back into the queue.

## Recovery from git

If `.audit/history.json` is deleted or missing, `history.mjs` automatically recovers recorded fixes from `Codedetective-Fix:` lines in `git log` on the next call.
