# The flow: stages, stops and what comes next

A run moves through the stages below, in this order. This file is the one place that says where the skill stops, what it asks there, and what each answer leads to. Read it at every stop, on `resume`, and whenever you are unsure what comes next. Never invent a transition: if a situation is not covered here, stop, say where the run stands, and ask.

## Contents
- Stages
- How to ask
- The closing question (after the full report)
- The next-step question (every other stop)
- P2 re-check and groups
- Resume

## Stages

Record the current stage in the report's Progress section (`Stage:`) and update it at every stop, so a later session picks up in the right place.

| Stage | What happens in it | It ends when | Then |
|---|---|---|---|
| 1. Audit | Phase 0, Passes 1 to 4, the challenge (`references/challenge.md`), and `history.mjs record-run` (`references/history.md`), straight through. Read-only. | The challenge and history comparison are written | Stage 2, without asking |
| 2. Report | The full report is shown in the conversation. | It has been shown | Stop: the closing question |
| 3. Decisions | The decision step: the developer corrects, answers and accepts. Optional, and they may come back to it at any stop. | They have answered what they want to | Stop: the next-step question |
| 4. Plan P0 and P1 | One plan covering every open P0 and P1 task, P0 first, written as a list of pull requests. Read-only. | The plan is approved | Stop: the next-step question |
| 5. Fix P0 and P1 | The planned tasks, one at a time, in the plan's order. Each is delivered as its own pull request the moment it is proven (`references/delivery.md`), and the next one starts without waiting for the merge. | No P0 or P1 task is open | Stop: say that all P0 and P1 tasks are done and which pull requests are open or merged, then the next-step question |
| 6. P2 re-check | Every open P2 task is checked again against the code as it now stands, and the ones that remain are sorted into groups. Read-only. | The groups are written | Stage 7, without asking |
| 7. Plan P2 | One plan listing every group as a pull request. Read-only. | The plan is approved | Stop: the next-step question |
| 8. Fix P2 | The groups, one at a time, in the plan's order. Each group is delivered as one pull request the moment it is proven, and the next one starts without waiting for the merge. | No task is open | Stage 9, once every pull request is merged |
| 9. Finished | Every finding is fixed, accepted or settled, and every pull request of the run is merged. | | Prune throwaway `scratch/` files and intermediate `evidence/after-*` raw dumps (keep the report, `plans/`, `external/`, and baseline `evidence/summary.*`), then stop: say so, and offer a new audit |

Rules that hold across stages:
- **P0 and P1 come first, P2 comes last.** P0 and P1 fixes change the code that P2 plans would be written against, so P2 waits. If the developer asks to plan or fix a P2 task while a P0 or P1 task is open, say this in one line and ask whether to go ahead anyway; it is their choice.
- **A stage with nothing in it is skipped.** With no open P0 or P1 task, planning goes straight to stage 6. With no open task at all, the run goes from the report to stage 9 (or stops at "Standard met, with gaps", listing the gaps).
- **A task that appears later goes to the stage its priority belongs to.** An outside review, a reversed decision or a finding that came back (`came-back`) can add a task at any time. Findings flagged as `circle` by `history.mjs` are routed to stage 3 (Decisions Needed) rather than auto-queued, and settled circles (`set-status --status settled`) stay closed unless the code changes. If a P0 or P1 task appears during stages 6 to 8, finish the task in hand, say what appeared, and return to stage 4.
- **Nothing is left behind.** A proven fix is delivered before anything else happens (`references/delivery.md`). Never start the next unit, and never offer the next stage, over a proven fix that is still sitting undelivered in the working tree.
- **Stops inside stages 5 and 8 depend on what was asked.** `fix all` runs through every approved unit and stops only at a problem, at something that needs the developer, or when the stage is done. `fix <TASK-ID>` and `fix batch <name>` deliver their one unit and then stop. With `Delivery: ask`, every unit stops for review, as `references/delivery.md` describes.
- **Reading never needs permission; changing always does.** Stages 1, 2, 4, 6 and 7 change no code. No code changes without an approved plan, and only `fix` builds one.

## How to ask

Every question in this skill that offers choices is asked with the agent's question tool, the one that shows the developer a box of choices to pick from (`AskUserQuestion` in Claude Code). Never write the choices as a numbered list in the message when that tool exists. This covers the closing question, the next-step question, the setup question, the stale-run question and any decision that is a choice between options.

- **Message first, then the tool.** Say where the run stands in the message, then call the tool. Do not repeat the options as text, and do not end the message with "What next?" followed by a list.
- **Two to four options.** That is what the tool takes. Put the option that continues the main path first and Stop last. When more than four apply, keep the main path, "Go through the decisions" if any are waiting, and Stop, and name the others in one line of the message; the developer can always type a different answer.
- **Short labels.** A label is a few words ("Build group 1", "Plan the P0 and P1 fixes", "Stop here"). The option's description is one short line that names the command and says what will happen. Anything longer, such as what a group contains or which pull request is still open, belongs in the message above, not in the option.
- **A short header**, such as "Next step".
- **Several questions at once** (the grouped decision questions) go in one call when the tool allows it. A question that needs a typed answer, not a choice, is asked in the message.
- **No such tool, or the call fails:** write the same choices as a short numbered list, each with its command. This is the fallback, never the default.

## The closing question (after the full report)

If the verdict is Standard met, say so plainly and offer only to stop or to review the advisory notes.

Otherwise ask one question with the question tool (see How to ask), with the options in this order:
1. **Plan the P0 and P1 fixes** (`/codedetective plan`), when any P0 or P1 task is open. Say how many there are and that planning changes no code. When none is open but P2 tasks are, offer **Re-check and group the P2 fixes** (`/codedetective plan P2`) here instead.
2. **Go through the decisions**, when any question, Decision Needed or earlier decision is waiting. Say how many.
3. **Stop here so I can read it.** Say that everything is saved and that `/codedetective resume` picks up at this point.

Say in one line that they can also reply with corrections. Choosing an option counts as invoking it. Anything else, including silence, means stop. Do not start planning or fixing before they choose, and never offer fixing here.

## The next-step question (every other stop)

Every stop after the closing question ends the same way, so the developer is never left to work out how to continue.

First say where the run stands: the stage, how many tasks are open at each priority, and which of them have an approved plan. If a priority level, a plan or a group was just finished, say so plainly ("All P0 and P1 tasks are done").

Then ask one question with the question tool (see How to ask), naming the command in each option's description so it can be chosen now or typed in a later session. Build the options from the state of the run:

| State of the run | Offer |
|---|---|
| Open P0 or P1 tasks, none with an approved plan | **Plan the P0 and P1 fixes** (`/codedetective plan`), and **Plan and fix only the next task** (`/codedetective fix`) |
| P0 or P1 tasks with an approved plan are waiting | **Fix them all, one pull request each** (`/codedetective fix all`), saying how many, and **Fix only the next task** (`/codedetective fix <TASK-ID>`), naming it |
| A task was interrupted part-way through its fix | **Continue that task** (`/codedetective fix <TASK-ID>`), saying what had been done |
| No P0 or P1 task is open, P2 tasks are open and not yet grouped | **Re-check and group the P2 fixes** (`/codedetective plan P2`) |
| The P2 groups are approved and groups are waiting | **Build every group, one pull request each** (`/codedetective fix all`), saying how many, and **Build only the next group** (`/codedetective fix batch <name>`), naming it |
| A proven fix has not been delivered (only under `Delivery: ask`) | **Commit it, open a pull request and merge when its checks pass**, before any other option |
| Questions, Decisions Needed or earlier decisions are waiting | **Go through the decisions** |
| The queue is empty | **Run a new audit to confirm the standard is met** (`/codedetective new`). If pull requests of this run are still open, say which; the audit waits for them (`references/delivery.md`) |
| Always | **Stop** (`/codedetective resume` picks up here) |

Put the option that continues the main path first, "Go through the decisions" after it, and Stop last. Planning comes before fixing: never offer to build a task that has no approved plan. Before asking, run a delivery check point and say in one line which pull requests of this run are still open and how they will merge. With `Delivery: ask`, `fix all` is not offered. Choosing an option counts as invoking that command. Anything else, including silence, means stop.

## P2 re-check and groups

`/codedetective plan P2` (and `plan` with no target, once no P0 or P1 task is open) runs stage 6 and then stage 7 in one go.

**Re-check.** The P2 tasks were written before the P0 and P1 fixes changed the code. Re-read the targets of every open P2 task, rerun the tool evidence that backs it where there is any, and give each task one result:

| Result | What to do |
|---|---|
| Still valid | Leave it as it is. |
| Changed | The problem is still there but its place or size moved. Update the task's targets and evidence. |
| Resolved by earlier work | It is no longer present. Set its progress to `Resolved: no longer present after <TASK-ID or commit>`, with the evidence. It is closed, like Done. |
| No longer applies | The code it was about is gone or replaced. Set its progress to `Resolved: <reason>`. |

This is a re-check of the listed tasks, not a new pass. Do not go looking for new findings; a new audit does that. Recompute the verdict afterwards.

**Groups.** Sort the tasks that remain into groups. A group is a pull request: it is built back to back and delivered as one, so it must be small enough to review and to revert on its own:
- One group holds one kind of change (one checklist item) in one area of the codebase, using the areas from the file inventory.
- At most about ten tasks or fifteen files. Split a larger one by sub-area.
- Tasks that touch the same file or symbol go in the same group, in the order they must be built, even when their checklist items differ.
- Formatting-only changes are their own group, never mixed with a change in behavior.
- A task that adds or upgrades a dependency, or that needs something from the developer (a key, a manual check), goes in a group of its own, so it cannot hold up the tasks beside it.
- A large mechanical change, such as converting many tests to a new pattern, is its own group even when it shares an area with small fixes.
- Order the groups by prerequisites first, then by how often the code is changed or read, hot areas first.
- Name each group `p2-<kind>-<area>`, for example `p2-dead-code-server`. Its branch is `<prefix><group name>`, using `Branch prefix:` from `.audit/context.md` (default `codedetective/`).

**The plan.** Write one plan that lists every group as a pull request (format in `references/report-template.md`): what the re-check found, how many pull requests there will be, the table of them (order, branch, title, tasks, what each depends on, what each needs from the developer), and for each group a batch plan with a short plan per task and its interactions. One approval covers all the groups. Save the overview as `plans/p2-groups.md` and each group as `plans/batch-<name>.md`. Each group is then built with `/codedetective fix batch <name>`, and the drift check still runs before every task, because earlier groups change the code later ones were planned against.

## Resume

`/codedetective resume` picks the current run up at the stage it stopped in. Read `Stage:` from the Progress section. If the line is missing (a run from an earlier version), work the stage out from the pass lines, the "Full report presented" line and the tasks' progress, and write it in.

| Where the run stopped | What resume does |
|---|---|
| Stage 1, the audit is unfinished | Run the stale-run check, then continue with the next unfinished pass, or with the challenge if all four passes are written. This counts as approval to continue the audit and nothing else. |
| Stage 2, the report has not been shown | Show the full report, then the closing question. |
| Stage 2, the report was shown and nothing was chosen | Give the verdict and counts in a line or two (the whole report again only if asked), then the closing question. |
| Stage 3 | List what is still waiting on the developer and carry on with the decision step. |
| Stages 4, 5, 7 or 8 | Run a delivery check point, so merged pull requests are recorded and a failed check is dealt with. Then say where the queue stands, including any task interrupted part-way and any pull request still open, and ask the next-step question. Resume never starts a fix on its own. |
| Stage 6, the re-check was not finished | Run a delivery check point, then the re-check again from the start (it is read-only), then go on to stage 7. |
| Stage 9, or there is no run to pick up | Say "Nothing to resume" and why: there are no runs, the last run finished with everything fixed on a given date, or the last run was abandoned. Name `/codedetective new`. Never start an audit from `resume`. |

`/codedetective` with no argument behaves like `resume`, with one difference: when there are no runs, or the current run is finished with nothing left to fix, it starts a new run.
