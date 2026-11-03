# Investigation Checklists

Every item is a hypothesis to investigate, not a bug to find. For each one, record a tier (Confirmed, Probable, Unverified), a Verified Safeguard, or Not Applicable with a reason. Add the project-specific hypotheses from your Phase 0 Applicability Map to the pass where they fit.

## Contents
- Pass 1: Security, Authorization & Data Integrity
- Pass 2: Performance & Runtime Behavior
- Pass 3: Architecture, Contracts & Test Integrity

---

## Pass 1: Security, Authorization & Data Integrity

**Authentication & Sessions**
Trace login, token or session issuance, expiry, refresh and revocation. Inspect cookie flags (`HttpOnly`, `SameSite`, `Secure`), CSRF protection and CORS configuration.

**Authorization & Tenant Isolation**
For every create, read, update, delete, export and upload endpoint or handler, trace whether ownership or role is checked server-side. Confirm users cannot supply arbitrary IDs, foreign tenant IDs, storage keys or privileged fields (mass assignment) to reach records outside their scope. Client-side checks do not count.

**Request State Leakage**
In long-running server processes, look for request-specific or user-specific state held in module-scoped variables, globals, singletons or class-level fields, where one request can read or overwrite another user's data under concurrent load. Example: a Node module variable holding "the current user", or a shared object mutated per request. This is a tenant isolation failure, not just a race.

**Input Validation & Injection**
Trace untrusted input into:
- database queries (SQL injection, NoSQL operator injection such as `$ne` or `$gt`);
- shell commands and template rendering;
- HTML output (XSS), noting where sanitization happens relative to the render boundary;
- outbound requests (SSRF) and filesystem paths (traversal);
- deserializers, and regexes (ReDoS).

**File Upload & Storage Lifecycle**
Trace upload authorization, key or path allocation, size limits, and content type enforcement (declared type vs actual file contents, such as magic bytes). Check signed URL scope, lifetime and reuse. Check what happens to rejected or abandoned uploads: orphaned objects, or records pointing at unverified files.

**Archive & Import Processing**
For any archive or bulk import, check path traversal (Zip Slip), decompression size limits (zip bombs), entry count limits, duplicate entries, where every entry ends up, and whether a failure rolls back cleanly.

**Secrets & Sensitive Data**
Verify secrets, keys, tokens and personal data cannot leak into client bundles, logs, error trackers, analytics, backups, exports or error responses. Check how encryption keys are stored and used, if any.

**Abuse Controls**
Verify rate limits or quotas on authentication, expensive operations, uploads and any paid third-party calls.

**Webhooks & Integrations**
If inbound webhooks exist, verify signature checking, replay protection and idempotency.

**Concurrency & Consistency**
Identify locks, transactions, version checks and idempotency keys. Determine whether each one is process-local or holds across multiple instances (horizontal scaling, overlapping deploys). Trace these scenarios where relevant:
- two clients writing the same record at the same time;
- an old instance draining during deploy while a new one accepts writes;
- a lock or lease expiring while its holder is still writing;
- a write succeeding but the response never reaching the client, followed by a retry.

**Dependency Vulnerabilities**
Run the ecosystem's read-only audit tool if it is already available (`npm audit`, `pip-audit`, `cargo audit`, `bundle audit`). Do not install one. If there is no network access, skip it and say so.

---

## Pass 2: Performance & Runtime Behavior

**Measured Hot Paths**
Identify what users do most and what handles the most data. Measure locally before recommending any optimization, and separate compute cost from I/O and rendering cost. Recommend added complexity (workers, virtualization, caching layers) only when a measurement justifies it.

**Blocking Work on Shared Threads**
Look for synchronous CPU-bound or blocking work inside request handlers, event loops or UI threads, where one slow operation stalls every other user or interaction. Examples: synchronous hashing or crypto, synchronous file reads (`fs.*Sync`), parsing very large JSON, expensive regexes, large loops in a Node.js handler or a Python async route. A synchronous call inside a request path is confirmable by static trace.

**Data Access**
Look for N+1 queries, missing indexes on filtered or sorted fields, unbounded queries without pagination, oversized payloads and queries inside loops.

**Frontend Rendering & Bundles (if a client exists)**
- Trace which state changes cause broad rerenders. Separate high render counts from actual frame drops before proposing structural changes.
- Analyze bundle composition, and whether heavy routes or features are code-split or loaded on first boot.
- Audit hook and lifecycle correctness: dependency arrays, stale closures in listeners or async callbacks, and props or remote state copied into local state through effects.
- Flag state mutated in place where the framework expects immutable updates, such as pushing into a React state array or editing an object inside a reducer.

**Long-Running Sessions**
Check what happens when a user stays active for hours: token expiry, signed URL expiry, dropped connections, memory growth, and whether the app recovers or fails silently.

**Resource Cleanup**
Look for unclosed connections, file handles, timers, listeners and streams, and for unbounded caches or in-memory collections.

**Error Handling**
Verify async errors are caught and surfaced, failures do not leave partial state, and errors reach logs or an error tracker without leaking sensitive data.

---

## Pass 3: Architecture, Contracts & Test Integrity

**Module Boundaries**
Verify documented boundaries hold: shared code free of runtime-specific APIs, no forbidden cross-layer imports, no circular dependencies.

**Contract Symmetry**
Confirm validation rules and schemas are enforced identically on both sides of every boundary (client and server, producer and consumer), especially for saved file formats, API payloads and import or export formats. A rule enforced only on the client is not enforced.

**Type Rigor**
Run the project's type checker if it has one. Identify implicit `any`, unchecked casts, untyped boundaries and loose types in core business logic.

**Configuration Drift**
Compare configuration across environments for undocumented differences, required variables with no startup validation, and defaults that are unsafe in production.

**Dead & Duplicated Code**
Identify unused exports, abandoned features, and logic duplicated in ways that will drift apart.

**Test Integrity**
Verify tests are isolated (state resets between tests, no ordering dependence), external services are faked, critical paths found in Pass 1 have coverage, and any CI test-selection logic actually triggers the right tests when shared code changes.

**Observability**
Check whether a failure in a critical path would actually be noticed: logging, metrics, alerts, error tracking.
