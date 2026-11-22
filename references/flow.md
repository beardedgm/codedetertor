# The flow: stages, stops and what comes next

A run moves through the stages below, in this order. This file is the one place that says where the skill stops, what it asks there, and what each answer leads to. Read it at every stop, on `resume`, and whenever you are unsure what comes next. Never invent a transition: if a situation is not covered here, stop, say where the run stands, and ask.

## Contents
- Stages
- The closing question (after the full report)
- The next-step question (every other stop)
- P2 re-check and groups
- Resume

## Stages

Record the current stage in the report's Progress section (`Stage:`) and update it at every stop, so a later session picks up in the right place.

| Stage | What happens in it | It ends when | Then |
|---|---|---|---|
| 1. Audit | Phase 0 and Passes 1 to 4, straight through. Read-only. | Pass 4 is written | Stage 2, without asking |
| 2. Report | The full report is shown in the conversation. | It has been shown | Stop: the closing question |
| 3. Decisions | The decision step: the developer corrects, answers and accepts. Optional, and they may come back to it at any stop. | They have answered what they want to | Stop: the next-step question |
| 4. Plan P0 and P1 | One plan covering every open P0 and P1 task, P0 first. Read-only. | The plan is approved | Stop: the next-step question |
| 5. Fix P0 and P1 | The planned tasks, one at a time, in the plan's order, with a review stop after each. | No P0 or P1 task is open | Stop: say that all P0 and P1 tasks are done, then the next-step question |
| 6. P2 re-check | Every open P2 task is checked again against the code as it now stands, and the ones that remain are sorted into groups. Read-only. | The groups are written | Stage 7, without asking |
| 7. Plan P2 | One plan listing every group. Read-only. | The plan is approved | Stop: the next-step question |
| 8. Fix P2 | The groups, one at a time, in the plan's order, with one review stop after each group. | No task is open | Stage 9 |
| 9. Finished | Every finding is fixed, accepted or settled. | | Stop: say so, and offer a new audit |

Rules that hold across stages:
- **P0 and P1 come first, P2 comes last.** P0 and P1 fixes change the code that P2 plans would be written against, so P2 waits. If the developer asks to plan or fix a P2 task while a P0 or P1 task is open, say this in one line and ask whether to go ahead anyway; it is their choice.
- **A stage with nothing in it is skipped.** With no open P0 or P1 task, planning goes straight to stage 6. With no open task at all, the run goes from the report to stage 9 (or stops at "Standard met, with gaps", listing the gaps).
- **A task that appears later goes to the stage its priority belongs to.** An outside review, a reversed decision or a finding that came back can add a task at any time. If a P0 or P1 task appears during stages 6 to 8, finish the task in hand, say what appeared, and return to stage 4.
- **Reading never needs permission; changing always does.** Stages 1, 2, 4, 6 and 7 change no code. No code changes without an approved plan, and only `fix` builds one.

## The closing question (after the full report)

If the verdict is Standard met, say so plainly and offer only to stop or to review the advisory notes.

Otherwise ask one question, multiple choice when available, with the options in this order:
1. **Plan the P0 and P1 fixes** (`/codedetective plan`), when any P0 or P1 task is open. Say how many there are and that planning changes no code. When none is open but P2 tasks are, offer **Re-check and group the P2 fixes** (`/codedetective plan P2`) here instead.
2. **Go through the decisions**, when any question, Decision Needed or earlier decision is waiting. Say how many.
3. **Stop here so I can read it.** Say that everything is saved and that `/codedetective resume` picks up at this point.

Say in one line that they can also reply with corrections. Choosing an option counts as invoking it. Anything else, including silence, means stop. Do not start planning or fixing before they choose, and never offer fixing here.

## The next-step question (every other stop)

Every stop after the closing question ends the same way, so the developer is never left to work out how to continue.

First say where the run stands: the stage, how many tasks are open at each priority, and which of them have an approved plan. If a priority level, a plan or a group was just finished, say so plainly ("All P0 and P1 tasks are done").

Then ask one question, multiple choice when available, with the command beside each option so it can be chosen now or typed in a later session. Build the options from the state of the run:

| State of the run | Offer |
|---|---|
| Open P0 or P1 tasks, none with an approved plan | **Plan the P0 and P1 fixes** (`/codedetective plan`), and **Plan and fix only the next task** (`/codedetective fix`) |
| A P0 or P1 task with an approved plan is waiting | **Fix the next task** (`/codedetective fix <TASK-ID>`), naming the task |
| A task was interrupted part-way through its fix | **Continue that task** (`/codedetective fix <TASK-ID>`), saying what had been done |
| No P0 or P1 task is open, P2 tasks are open and not yet grouped | **Re-check and group the P2 fixes** (`/codedetective plan P2`) |
| The P2 groups are approved and a group is waiting | **Build the next group** (`/codedetective fix batch <name>`), naming it and saying how many tasks it holds |
| Questions, Decisions Needed or earlier decisions are waiting | **Go through the decisions** |
| The queue is empty | **Run a new audit to confirm the standard is met** (`/codedetective new`) |
| Always | **Stop** (`/codedetective resume` picks up here) |

Put the option that continues the main path first, "Go through the decisions" after it, and Stop last. Planning comes before fixing: never offer to build a task that has no approved plan. Mention in one line any finished fix that is still uncommitted or sits in an open pull request, without committing or merging it unasked. Choosing an option counts as invoking that command. Anything else, including silence, means stop.

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

**Groups.** Sort the tasks that remain into groups. Each group is built back to back and is meant to be one pull request, so it must be small enough to review and to revert on its own:
- One group holds one kind of change (one checklist item) in one area of the codebase, using the areas from the file inventory.
- At most about ten tasks or fifteen files. Split a larger one by sub-area.
- Tasks that touch the same file or symbol go in the same group, in the order they must be built, even when their checklist items differ.
- Formatting-only changes are their own group, never mixed with a change in behavior.
- Order the groups by prerequisites first, then by how often the code is changed or read, hot areas first.
- Name each group `p2-<kind>-<area>`, for example `p2-dead-code-server`.

**The plan.** Write one plan that lists every group (format in `references/report-template.md`): what the re-check found, the table of groups, and for each group a batch plan with a short plan per task and its interactions. One approval covers all the groups. Save the overview as `plans/p2-groups.md` and each group as `plans/batch-<name>.md`. Each group is then built with `/codedetective fix batch <name>`, and the drift check still runs before every task, because earlier groups change the code later ones were planned against.

## Resume

`/codedetective resume` picks the current run up at the stage it stopped in. Read `Stage:` from the Progress section. If the line is missing (a run from an earlier version), work the stage out from the pass lines, the "Full report presented" line and the tasks' progress, and write it in.

| Where the run stopped | What resume does |
|---|---|
| Stage 1, the audit is unfinished | Run the stale-run check, then continue with the next unfinished pass. This counts as approval to continue the audit and nothing else. |
| Stage 2, the report has not been shown | Show the full report, then the closing question. |
| Stage 2, the report was shown and nothing was chosen | Give the verdict and counts in a line or two (the whole report again only if asked), then the closing question. |
| Stage 3 | List what is still waiting on the developer and carry on with the decision step. |
| Stages 4, 5, 7 or 8 | Say where the queue stands, including any task interrupted part-way, then the next-step question. Resume never starts a fix on its own. |
| Stage 6, the re-check was not finished | Run the re-check again from the start (it is read-only), then go on to stage 7. |
| Stage 9, or there is no run to pick up | Say "Nothing to resume" and why: there are no runs, the last run finished with everything fixed on a given date, or the last run was abandoned. Name `/codedetective new`. Never start an audit from `resume`. |

`/codedetective` with no argument behaves like `resume`, with one difference: when there are no runs, or the current run is finished with nothing left to fix, it starts a new run.
