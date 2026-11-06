# Pass 4: Code Quality & Maintainability

This pass measures the code against the clean code definition in SKILL.md. Split everything into two kinds of finding, because they deserve different levels of trust. Cite the item's ID in every finding, task and plan.

## Checkable criteria (tool evidence; may be Confirmed)

| ID | Criterion | Evidence |
|---|---|---|
| QUAL-01 | Function understandability | Cognitive complexity above 15 per function, if the project's linter reports it. Otherwise note it as a missing tool rather than estimating by eye. |
| QUAL-02 | Duplication | Cloned blocks across files from the duplication output. |
| QUAL-03 | Dead code | Unused files, exports and dependencies from the dead code output. Verify each before queueing; dynamic imports and framework conventions cause false positives. |
| QUAL-04 | Coupling | Circular imports. |
| QUAL-05 | Type rigor | Type checker errors (shared with Pass 3). |
| QUAL-06 | Suppression debt | Lint and type suppressions, test skips and focus markers, with locations. |
| QUAL-07 | Error swallowing | Empty `catch` blocks, and `catch` blocks that only log and continue, prioritized on auth, payment and data-write paths. |
| QUAL-08 | Consistency | More than one library or pattern doing the same job (two HTTP clients, two validation libraries, two date libraries, two state approaches). |
| QUAL-09 | Outdated API usage | Patterns from older major versions of frameworks actually in use (see the stack reference files): removed APIs, compatibility shims the current version makes unnecessary, deprecated options. |
| QUAL-10 | Lint health | Rule violations from the project's own configured linter, and rules that the project has turned off which its framework recommends on. |

## Judgment criteria (advisory only; never P0 or P1)

- **QUAL-11 Design fit:** does the code belong where it is, and does it follow the patterns the rest of the system uses?
- **QUAL-12 Module depth:** does the interface stay small relative to what it hides? Many tiny shallow wrappers increase total complexity. Splitting a function is an improvement only when the extracted piece has a meaningful name, a cohesive purpose, and callers that no longer need to know its internals.
- **QUAL-13 Over-engineering:** abstractions with one implementation, configuration nobody sets, factory layers for a single type, defensive checks on values that cannot be null.
- **QUAL-14 Naming** beyond what a linter can check.
- **QUAL-15 Comment value:** a comment should explain why the code exists, not restate what it does. A comment explaining confusing code usually means the code should be simpler.
- **QUAL-16 Simplicity over cleverness.**

For every judgment finding, state the concrete simpler alternative and its rough diff size. If you cannot describe a simpler alternative, it is not a finding.

## Patterns typical of AI-assisted code

Look specifically for these, because they accumulate quickly when code is generated:
- new helpers that duplicate an existing one instead of reusing it;
- `try/catch` wrapped around everything, logging and continuing;
- optional chaining and null checks on values the types guarantee;
- verbose comments narrating what each line does;
- abstractions introduced for a single call site;
- APIs from an older major version of a framework the project has upgraded;
- dependencies that are unused, duplicated in purpose, or suspiciously unfamiliar.

## Prioritization

Maintainability findings are usually P2. Order them by how often the code is changed or read (hot files first), not by how ugly they are, because cleaning code nobody touches rarely pays back. A finding with no correctness, security or performance effect in code touched by few or no commits in the past six months is Optional (see Diminishing returns in SKILL.md): listed, not queued, and never counted against the verdict.
