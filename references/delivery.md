# Delivery: every fix leaves as a pull request

A fix that is proven but still sitting in the working tree is not finished. When delivery is automatic, every proven fix is committed, pushed and opened as a pull request that merges itself when its checks pass, and the work continues at once. Nothing is left behind, and nothing waits on a merge that GitHub can do by itself.

Read this before the first fix of a run, whenever a unit of work is proven, and at every check point.

## Contents
- The setting
- The first-time check
- Units: what becomes one pull request
- Delivering a unit
- Check points
- When a check fails
- Where it does wait
- When delivery is set to ask

## The setting

`.audit/context.md` records `Delivery: automatic` or `Delivery: ask`. It is **automatic unless the developer has said otherwise.**

The first time fixes are about to start in a project, say once, before the first edit: delivery is automatic; each fix goes out as its own pull request that merges itself when its checks pass; and a merge to the default branch may deploy. Ask with the question tool whether to keep it automatic or to be asked each time. Record the answer and never ask again. The developer can change the line at any time.

## The first-time check

Before the first delivery, check these once, read-only, and record the results in `.audit/context.md`:

| Check | Why it matters |
|---|---|
| The remote is on GitHub and `gh` is installed and signed in (`gh auth status`) | Without both there are no pull requests. Fall back to committing on a branch and pushing it, and say so. |
| The default branch's name | Every pull request targets it. Never push to it directly. |
| The merge methods the repository allows | Use a merge commit when it is allowed, otherwise squash. |
| Whether the repository allows auto-merge | Needed for GitHub to merge by itself. |
| Whether the default branch has required status checks | GitHub's auto-merge waits only for required checks. With none, it merges at once, even while checks are running or failing. |
| Whether pull requests get any checks at all | With none there is no green to wait for. |
| Branch prefix (`.audit/context.md` `Branch prefix:` and `CLAUDE.md` / repo rules) | Defaults to `codedetective/`. Use the repository's required prefix (such as `claude/`) when configured so branch rules pass. |

Then say in one or two lines what this means for the project:
- **Required checks and auto-merge allowed:** GitHub merges each pull request by itself when its checks pass.
- **Checks, but none required, or auto-merge not allowed:** never turn GitHub's auto-merge on. The skill merges each pull request itself at a check point, once every check on it has finished green. Tell the developer once that marking a check as required and allowing auto-merge would let GitHub do this unattended.
- **No checks at all:** ask once whether to merge on the skill's own proof or to leave the pull requests open for them. Leaving them open is the default.

## Units: what becomes one pull request

- **Each P0 or P1 task is one pull request**, so a single fix can be reverted alone. A task that has to be built in the same change as another shares its pull request.
- **Each P2 group is one pull request.** A group and a pull request are the same thing.
- **A task gets a pull request of its own** when it adds or upgrades a dependency, or when it needs something from the developer (a key, a manual check, a decision), so it cannot hold up the others. Formatting-only changes are their own pull request too.

Plans are written as lists of pull requests (formats in `references/report-template.md`): the order, the branch, the title, the tasks, what each depends on, and what each needs from the developer. A plan states how many pull requests it will open. Approving the plan approves opening them; do not ask again per pull request.

## Delivering a unit

1. **Branch before the first edit.** Create `<prefix><task-id-or-group>` from the up-to-date default branch, where `<prefix>` is `Branch prefix:` from `.audit/context.md` (respecting `CLAUDE.md` or repository rules; default `codedetective/`). If the unit touches the same files as an earlier unit whose pull request has not merged, or depends on it, create the branch from that unit's branch instead, and record it as the base.
2. **Leave the developer's work alone.** Never carry their uncommitted changes into a commit, and never stash, reset or discard them. If their changes would block creating the branch, stop and ask.
3. **Build and prove the unit** as the remediation steps say. Delivery starts only when the unit meets Proof of done.
4. **Commit only this unit's files, one commit per task**, staged by path. The message says what changed and why, names the task and checklist item, and ends with the trailer from `node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" label --run <run-id> --task <TASK-ID> --id <CHECK-ID> --at <file#symbol>` (`Codedetective-Fix: <run-id>/<TASK-ID> <CHECK-ID> <file#symbol>`). Never use `--no-verify`; a failing commit hook is a failure to fix or to report. Immediately after committing, record the fix with `node "${CLAUDE_SKILL_DIR}/scripts/history.mjs" record-fix` (`references/history.md`), passing `--run`, `--commit`, and any `--created`, `--changed`, or `--renamed` locations.
5. **Push the branch.** Never force-push.
6. **Open the pull request** against the default branch. The title is the task or group and what it fixes. The body lists the tasks and checklist items, what was wrong, what changed, and the proof (each command and its result). If it builds on an unmerged pull request, say which. For a security fix in a public repository, describe the change, not how to exploit the hole. Never put a secret in a commit, a title or a body.
7. **Switch merging on** as the first-time check decided: `gh pr merge <n> --auto` with the chosen method where GitHub can be trusted to wait, otherwise leave it for a check point. If the agent can watch a pull request and respond to failed checks (Claude Code's Auto-fix), turn that on as well.
8. **Record it** in the task's `DELIVERY` field and in the Progress section: branch, commit, pull request number, how it will merge, and its state.
9. **Say it in one or two lines** (the task, the proof in brief, the pull request number) and **go straight on to the next unit.** Do not wait for the merge.

## Check points

Look at every open pull request of this run before starting each new unit, at every stop, on `resume`, before the P2 re-check, and before a confirming audit. Take them in the order they were opened:

| State | What to do |
|---|---|
| Merged | Record it. Fetch the default branch. |
| Every check finished green, not merged, and the skill is the one merging | Merge it now with the chosen method, and record it. |
| Checks still running | Leave it and carry on. |
| A check failed | See "When a check fails". |
| A merge conflict | Merge the default branch into the pull request's branch. If the resolution is mechanical, rerun the unit's verification and push. If both sides changed the same logic, stop and ask. |
| Its changes reached the default branch through a later pull request | Close it with a note naming the pull request that carried it. |
| Closed by someone without merging | Stop and say so. Never reopen it silently. |

After an earlier pull request merges, update any later open branch that was built on it by merging the default branch in, so its pull request shows only its own changes.

## When a check fails

1. Read the failing check's output. Decide whether this pull request caused it: a failure that also happens on the default branch, or in something the change does not touch, is not this pull request's. Rerun the failed job once. If it still fails and is not caused by the change, leave the pull request open, tell the developer what is failing and why it is not this change, and carry on.
2. If the change caused it, fix it on the pull request's branch, inside the unit's approved plan. Reproduce it locally where possible, rerun the unit's verification and the diff check, commit and push.
3. **Never get a check green by weakening it:** no skipped, deleted or loosened test, no suppression, no relaxed threshold or check configuration, no "continue on error", no retrying until it passes, no empty commit.
4. **Two attempts per pull request.** If it is still red after two honest fixes, stop: mark the task `Blocked: checks failing on PR #<n>`, say what was tried and what the output shows, and ask.

## Where it does wait

Only where the merged state itself matters:
- **Before a confirming audit.** A new audit has to look at what is really on the default branch. If pull requests from this run are still open, say which, run a check point, and ask whether to wait or to start anyway.
- **Before saying a run is finished.** Stage 9 needs every pull request merged, or closed by the developer's decision.
- **Before the P2 re-check**, only as far as the code is concerned: the re-check has to see every P0 and P1 fix. If some of their pull requests are still open, do the re-check on a local branch made from the default branch with those branches merged in, push nothing, and say that this is what was checked.

## When delivery is set to ask

Never commit, push or open a pull request on your own. After each proven fix, stop and show the proof, and offer in the next-step question to commit it, open a pull request and merge it when its checks pass. Never offer the next stage while a proven fix is still uncommitted without saying so first and offering to deliver it. When the developer asks for a commit, a pull request or a merge, do exactly that, record it, and come back to the run.

In either setting: never deploy, never push to the default branch, never force-push, and never merge over a failed check.
