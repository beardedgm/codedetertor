# Pass 2: Performance & Runtime Behavior

Every item is a hypothesis. A performance finding rises to P1 only with a local measurement or a complete static argument establishing both reachable workload and consequential failure; otherwise it is P2 or Unverified. Recommend added complexity (workers, virtualization, caching layers) only when a measurement justifies it. Cite the item's ID in every finding, task and plan. Apply the stack reference files Phase 0 selected.

The tag in brackets after each item names the recognized source behind it. `references/sources.md` says what each tag is and where to look it up; cite it in the task's `STANDARD` field.

**PERF-01 Measured Hot Paths** [Knuth 1974]
Identify what users do most and what handles the most data. Measure locally before recommending optimization, and separate compute cost from I/O and rendering cost. Record the harness, command and numbers in the report.

**PERF-02 Blocking Work on Shared Threads** [Node event loop guide; web.dev long tasks]
Synchronous CPU-bound or blocking work inside request handlers, event loops or UI threads, where one slow operation stalls every other user or interaction. Examples: synchronous hashing or crypto, synchronous file or compression calls, parsing very large untrusted JSON, expensive regexes, large loops in a request path. Confirmable by static trace as a correctness issue; priority follows the rule above.

**PERF-03 Data Access** [CWE-1050, CWE-1067, CWE-1073, CWE-770]
N+1 queries, missing indexes on filtered or sorted fields, unbounded queries without a maximum page size, oversized payloads, and queries inside loops. Check query plans only against a local or seeded database, never a hosted one.
Caveat: a cache is not a fix for a missing index or an N+1 query; it hides the cost and adds an invalidation problem. Fix the query first.

**PERF-04 Frontend Rendering & Bundles (if a client exists)** [web.dev long tasks; Rules of React]
- Which state changes cause broad rerenders; separate high render counts from actual frame drops before proposing structure changes.
- Bundle composition from a local build and a visualizer, not guesswork; whether heavy routes or features are code-split.
- Hook and lifecycle correctness: rely on the framework's lint rules in the evidence output first, then trace what they cannot see, such as stale closures in long-lived listeners.
- State mutated in place where the framework expects immutable updates.
- Lists with unstable or index keys on reorderable data.

**PERF-05 Long-Running Sessions** [CWE-672, CWE-404]
What happens when a user stays active for hours: token expiry, signed URL expiry, dropped connections, memory growth, and whether the app recovers or fails silently.

**PERF-06 Resource Cleanup** [CWE-404, CWE-459, CWE-770]
Unclosed connections, file handles, timers, listeners and streams; unbounded caches or in-memory collections.

**PERF-07 Runtime Error Handling** [A10; CWE-703, CWE-390]
Async errors are caught and surfaced with a defined outcome, failures do not leave partial state, process-level handlers for unhandled rejections and exceptions exist and exit rather than continue in an unknown state, and errors reach logs or an error tracker without leaking sensitive data.

**PERF-08 Shutdown & Restarts** [Twelve-Factor IX]
On a termination signal the process stops accepting connections, finishes in-flight work, flushes telemetry, closes database connections and exits. A shell wrapper in the start command does not swallow the signal.
