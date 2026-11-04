# Pass 1: Security, Authorization & Data Integrity

Every item is a hypothesis to investigate, not a bug to find. For each, record a tier, a Verified Safeguard, or Not Applicable with a reason. Map every security finding to its OWASP Top 10:2025 category (codes in brackets) and an ASVS 5.0 chapter where one fits. Also apply the stack reference files Phase 0 selected.

## Access control & identity

**Authentication & Sessions** [A07; ASVS V6, V7]
Trace login, token or session issuance, expiry, refresh and revocation. Inspect cookie flags (`HttpOnly`, `SameSite`, `Secure`), CSRF protection and CORS configuration. Check password hashing algorithm and cost, and that tokens come from a cryptographically secure source.

**Self-contained Tokens** [A07; ASVS V9]
If JWTs or similar are used: algorithm pinned (no `none`, no algorithm taken from the token), expiry enforced, issuer and audience checked, secrets not shared across environments.

**Authorization & Tenant Isolation** [A01; ASVS V8]
For every create, read, update, delete, export and upload endpoint or handler, trace whether ownership or role is checked server-side. Confirm users cannot supply arbitrary IDs, foreign tenant IDs, storage keys or privileged fields to reach records outside their scope. Client-side checks do not count.

**Property-level Authorization & Data Exposure** [A01; OWASP API3:2023]
Two directions: mass assignment (request bodies written into models without a field allowlist, letting a user set `role`, `tenantId` or `isAdmin`), and excessive exposure (whole database documents serialized into responses, leaking password hashes, reset tokens or internal fields).

**Request State Leakage** [A01]
In long-running server processes, look for request-specific or user-specific state held in module-scoped variables, globals, singletons or class-level fields, where one request can read or overwrite another user's data under concurrent load. This is a tenant isolation failure, not just a race.

**Open Redirects** [A01]
Redirect targets taken from request input (`next`, `returnTo`, `redirect`) without an allowlist.

## Input & output

**Injection** [A05; ASVS V1, V2]
Trace untrusted input into database queries (SQL injection, NoSQL operator injection), shell commands, template rendering, outbound requests (SSRF [A01]), filesystem paths (traversal), deserializers, and regexes (ReDoS). For ReDoS, require a regex on user-controlled input with a demonstrated catastrophic pattern and no upstream length limit.

**XSS & Frontend Security** [A05; ASVS V3]
Trace user-authored content (Markdown, rich text, SVG, custom blocks) to the DOM. Note where sanitization happens relative to the render boundary, and any raw HTML injection points. Check security headers and whether the Content Security Policy actually restricts script sources.

**Prototype Pollution** [A08]
Deep merges or recursive assignment of request bodies into objects, keys like `__proto__` or `constructor` not stripped.

## Files & imports

**File Upload & Storage Lifecycle** [A01, A08; ASVS V5]
Trace upload authorization, key or path allocation (server-generated, never the client filename), size limits, and content type enforcement (declared type vs actual contents, such as magic bytes). Check signed URL method, scope, lifetime and reuse, and what happens to rejected or abandoned uploads: orphaned objects, or records pointing at unverified files.

**Archive & Import Processing** [A08; ASVS V5]
For any archive or bulk import: path traversal (Zip Slip), decompression size limits (zip bombs), entry count limits, duplicate entries, where every entry ends up, and whether a failure rolls back cleanly.

## Secrets, crypto & data protection

**Secrets & Sensitive Data** [A04; ASVS V11, V14]
Verify secrets, keys, tokens and personal data cannot leak into client bundles, logs, error trackers, analytics, backups, exports or error responses. If a production build is safe to run locally into a temp directory, scan the built output for secret patterns, not just the source; report location and type, never the value. Check how encryption keys are stored and used. Webhook and signature comparisons use timing-safe equality.

## Failure handling, logging & abuse

**Mishandling of Exceptional Conditions** [A10; ASVS V16]
Fail-open logic: a `catch` on an auth, payment or data-write path that grants access, continues, or returns success. Partial writes with no rollback. Unhandled promise rejections in background work. Errors that only log and continue where the caller needed to know.

**Security Logging & Alerting** [A09; ASVS V16]
Security events (failed logins, authorization denials, admin actions, password resets) are logged; PII, tokens and secrets are not. Error tracker events are scrubbed before sending. Something actually alerts when these events spike.

**Abuse Controls & Business Flows** [A06; OWASP API4:2023, API6:2023]
Rate limits or quotas on authentication, password reset, signup, invites, upload signing, expensive operations and paid third-party calls. Request body size limits. Endpoints that can be scripted at scale to abuse a business flow. Require reachability: an endpoint that accepts unauthenticated or cheap input with no upstream limit.

**Webhooks & Integrations** [A08; OWASP API10:2023]
Inbound webhooks verify signatures, reject replays, and process idempotently. Responses from third-party APIs are validated before use.

## Consistency & supply chain

**Concurrency & Consistency** [A06]
Identify locks, transactions, version checks and idempotency keys. Determine whether each holds across multiple instances (horizontal scaling, overlapping deploys) or is process-local. Trace where relevant:
- two clients writing the same record at the same time;
- an old instance draining during deploy while a new one accepts writes;
- a lock or lease expiring while its holder is still writing;
- a write succeeding but the response never reaching the client, followed by a retry;
- scheduled jobs or in-process timers that run twice when two instances are live.

**Software Supply Chain** [A03]
- Lockfile present, committed, and resolving to the expected registry only.
- Packages with install scripts identified; anything unexpected flagged.
- Dependencies that are very new, very low-download, or close misspellings of popular packages flagged for human review. AI-suggested code sometimes references packages that do not exist, and attackers register those names.
- CI actions pinned to a commit or trusted version.
- Known vulnerabilities from the evidence script (`npm audit` or `osv-scanner`, only if the user allowed network) or the ecosystem equivalent. Record which advisory source was used and its date.
- Do not recommend runtime sandboxing (such as the Node permission model) as the fix for a supply chain finding; it is defense in depth, not containment.
