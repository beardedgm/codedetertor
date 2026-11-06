# Pass 1: Security, Authorization & Data Integrity

Every item is a hypothesis to investigate, not a bug to find. For each, record a tier, a Verified Safeguard, or Not Applicable with a reason. Cite the item's ID in every finding, task, plan and false-positive entry. Map every security finding to its OWASP Top 10:2025 category (codes in brackets) and an ASVS 5.0 chapter where one fits. Also apply the stack reference files Phase 0 selected.

Work along the trust boundaries and assets named in Phase 0: start each item at the boundaries where untrusted data enters and follow it toward the assets.

**Caveats** mark where common advice goes too far or where a defense only looks like one. A caveat is part of the check: if the code relies on what a caveat calls insufficient, that reliance is the finding. Where the right fix depends on a business choice (a limit, a lifetime, what to keep), record it under Decisions Needed instead of forcing it into the queue.

The **conditional** sections apply only when Phase 0 finds the feature. Mark the whole section Not Applicable otherwise.

## Access control & identity

**SEC-01 Authentication & Sessions** [A07; ASVS V6, V7]
Trace login, token or session issuance, expiry, refresh and revocation. Inspect cookie flags (`HttpOnly`, `SameSite`, `Secure`), CSRF protection and CORS configuration. Check password hashing algorithm and cost, and that tokens come from a cryptographically secure source. Check that password reset and magic-link tokens expire quickly and die after first use.
Caveat: CORS is not authentication. A wildcard or reflected origin with credentials enabled is a finding even though "the browser blocks it."

**SEC-02 Self-contained Tokens** [A07; ASVS V9]
If JWTs or similar are used: algorithm pinned (no `none`, no algorithm taken from the token), signature verified on every request, expiry enforced, issuer and audience checked, secrets not shared across environments. Auth tokens are not kept in `localStorage` or other script-readable storage.

**SEC-03 Authorization & Tenant Isolation** [A01; ASVS V8]
For every create, read, update, delete, export and upload endpoint or handler, trace whether ownership or role is checked server-side. Confirm users cannot supply arbitrary IDs, foreign tenant IDs, storage keys or privileged fields to reach records outside their scope.
Caveat: unguessable IDs (UUIDs, random keys) are not authorization, a hidden button or admin URL is not access control, and a check in the client does not count. Each of these is a finding when it is the only defense.

**SEC-04 Property-level Authorization & Data Exposure** [A01; OWASP API3:2023]
Two directions: mass assignment (request bodies written into models without a field allowlist, letting a user set `role`, `tenantId` or `isAdmin`), and excessive exposure (whole database documents serialized into responses, leaking password hashes, reset tokens or internal fields).

**SEC-05 Request State Leakage** [A01]
In long-running server processes, look for request-specific or user-specific state held in module-scoped variables, globals, singletons or class-level fields, where one request can read or overwrite another user's data under concurrent load. This is a tenant isolation failure, not just a race. The same applies to caches keyed without the user or tenant.

**SEC-06 Open Redirects** [A01]
Redirect targets taken from request input (`next`, `returnTo`, `redirect`) in login, logout, magic-link and OAuth flows, without an allowlist of exact destinations.
Caveat: a "starts with our domain" check is bypassable (`ourdomain.com.evil.example`, protocol-relative `//evil.example`, encoded values). Only exact matches or relative paths count.

## Input & output

**SEC-07 Injection** [A05; ASVS V1, V2]
Trace untrusted input into database queries (SQL injection, NoSQL operator injection), shell commands, template rendering, outbound requests (SSRF [A01]), filesystem paths (traversal), deserializers, and regexes (ReDoS). For ReDoS, require a regex on user-controlled input with a demonstrated catastrophic pattern and no upstream length limit.
Caveat: values that look internal (filenames on shared storage, job payloads, data from another service, model output) are untrusted if a user influenced them. Trust follows who wrote the value, not which channel delivered it.

**SEC-08 XSS & Frontend Security** [A05; ASVS V3]
Trace user-authored content (Markdown, rich text, SVG, custom blocks) to the DOM. Note where sanitization happens relative to the render boundary, and any raw HTML injection points. Check security headers, framing protection, and whether the Content Security Policy actually restricts script sources.
Caveat: a CSP that allows `unsafe-inline` scripts or wildcard script sources gives little XSS protection; report it as weak rather than as a safeguard.

**SEC-09 Prototype Pollution** [A08]
Deep merges or recursive assignment of request bodies into objects, keys like `__proto__` or `constructor` not stripped.

## Files & imports

**SEC-10 File Upload & Storage Lifecycle** [A01, A08; ASVS V5]
Trace upload authorization, key or path allocation (server-generated, never the client filename), size limits, and content type enforcement (declared type vs actual contents, such as magic bytes). Check signed URL method, scope, lifetime and reuse, and what happens to rejected or abandoned uploads: orphaned objects, or records pointing at unverified files.
Caveat: a declared `Content-Type` is a claim by the client. Only a server-side check of the stored object proves what was uploaded.

**SEC-11 Archive & Import Processing** [A08; ASVS V5]
For any archive or bulk import: path traversal (Zip Slip), decompression size limits (zip bombs), entry count limits, duplicate entries, where every entry ends up, and whether a failure rolls back cleanly.

## Secrets, crypto & data protection

**SEC-12 Secrets & Sensitive Data** [A04; ASVS V11, V14]
Verify secrets, keys, tokens and personal data cannot leak into client bundles, logs, error trackers, analytics, backups, exports or error responses. If a production build is safe to run locally into a temp directory, secret-scan the built output with the evidence script's `--scan-dir` (never a plain text search, which can print the secret); report location and type, never the value. Check how encryption keys are stored and used. Webhook and signature comparisons use timing-safe equality.
Caveat: removing a secret from the current code does not remove it from git history. A secret that was ever committed needs rotating, and the finding says so.

**SEC-13 Account & Data Deletion** [A04; ASVS V14]
When a user or tenant is deleted, trace every store that holds their data: primary database, related collections, object storage (uploaded files), caches, search indexes, analytics, logs and backups. Report stores the deletion path never touches, and soft-deleted data that stays readable.
Caveat: what must be kept and for how long is often a legal or business decision. Record retention questions under Decisions Needed rather than deciding them.

## Failure handling, logging & abuse

**SEC-14 Mishandling of Exceptional Conditions** [A10; ASVS V16]
Fail-open logic: a `catch` on an auth, payment or data-write path that grants access, continues, or returns success. Partial writes with no rollback. Unhandled promise rejections in background work. Errors that only log and continue where the caller needed to know.

**SEC-15 Security Logging & Alerting** [A09; ASVS V16]
Security events (failed logins, authorization denials, admin actions, password resets) are logged; PII, tokens and secrets are not. Error tracker events are scrubbed before sending. Production error responses hide stack traces, queries, paths and internal names. Something actually alerts when these events spike.

**SEC-16 Abuse Controls & Business Flows** [A06; OWASP API4:2023, API6:2023]
Rate limits or quotas on authentication, password reset, signup, invites, upload signing, expensive operations and paid third-party calls. Request body size limits. Endpoints that can be scripted at scale to abuse a business flow. Require reachability: an endpoint that accepts unauthenticated or cheap input with no upstream limit.
Caveat: a rate limiter that counts in one process's memory does nothing when more than one instance runs, including the overlap window during a deploy. Counters belong in a shared store. The right limit itself is a business decision; record it under Decisions Needed.

**SEC-17 Webhooks & Integrations** [A08; OWASP API10:2023]
Inbound webhooks verify signatures, reject replays, and process idempotently. Responses from third-party APIs are validated before use.
Caveat: a secret or unguessable webhook URL is not authentication. Only a verified signature is.

## Consistency & supply chain

**SEC-18 Concurrency & Consistency** [A06]
Identify locks, transactions, version checks and idempotency keys. Determine whether each holds across multiple instances (horizontal scaling, overlapping deploys) or is process-local. Trace where relevant:
- two clients writing the same record at the same time;
- an old instance draining during deploy while a new one accepts writes;
- a lock or lease expiring while its holder is still writing;
- a write succeeding but the response never reaching the client, followed by a retry;
- scheduled jobs or in-process timers that run twice when two instances are live.

**SEC-19 Software Supply Chain** [A03]
- Lockfile present, committed, and resolving to the expected registry only.
- Packages with install scripts identified; anything unexpected flagged.
- Dependencies that are very new, very low-download, or close misspellings of popular packages flagged for human review. AI-suggested code sometimes references packages that do not exist, and attackers register those names.
- CI actions pinned to a commit or trusted version.
- Known vulnerabilities from the evidence script (`npm audit` or `osv-scanner`, only if the user allowed network) or the ecosystem equivalent. Record which advisory source was used and its date.
- Agent instruction and skill files in the repo (`CLAUDE.md`, `AGENTS.md`, skill folders) are treated as code that steers tools, and reviewed for instructions that weaken security.

Caveat: a clean audit only means no known advisory matched. It does not detect a newly malicious package or make install scripts safe. Do not recommend runtime sandboxing (such as the Node permission model) as the fix for a supply chain finding; it is defense in depth, not containment.

## Conditional: AI & LLM features

Apply when the app calls a language model, runs agents with tools, uses retrieval (RAG), or streams model audio or text to users. Map findings to the OWASP Top 10 for LLM Applications 2025 as well as the main categories.

**SEC-20 Prompt Injection & Untrusted Context**
Text a user or third party can influence (messages, uploaded documents, retrieved records, web pages, tool results) reaches the model. Check that instructions and data are separated, that the model cannot be talked into using tools or data beyond the current user's scope, and that retrieval only returns records the current user may read.
Caveat: no prompt wording reliably stops injection. The defense is limiting what the model can reach and do, not asking it to behave.

**SEC-21 Model Output Handling**
Model output is untrusted input. Trace it to every sink: the DOM (render as text or sanitize), database writes (validate against a schema), URLs and redirects, shell commands, file paths, and other tools. Structured output is validated before use, not just parsed.

**SEC-22 Model Keys, Identity & Spend**
Provider keys stay server-side; any user-supplied keys are encrypted at rest and never logged or returned. Agents and tools act with the current user's permissions, not a shared admin credential. Per-user and global spend or token limits exist, with a cap that stops runaway loops, and requests have timeouts.

## Conditional: Payments & subscriptions

Apply when the app takes payments, runs subscriptions, or gates features by plan.

**SEC-23 Server-side Pricing & Entitlements**
Prices, plans and quantities come from the server's own data, never from the client. Access is granted only after a verified payment event (webhook or a server-side status check), not after the client returns from checkout. Plan checks for gated features happen on the server for every request.

**SEC-24 Payment Webhook Processing**
Payment webhooks verify the provider signature, store processed event IDs to reject replays, process idempotently, and handle out-of-order events. Failed payments, cancellations, refunds and disputes each move the account to a defined state, and access is revoked when it should be.
Caveat: the checkout success redirect proves nothing about payment. Treat it as navigation only.
