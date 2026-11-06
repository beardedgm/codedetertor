# Stack Reference: Node.js & Express

Written against Node.js 24 (ESM) and Express 5, late 2026. Compare against the versions Phase 0 recorded. Items marked "verify" come from secondary sources; treat them as Unverified until confirmed in the repo or official changelogs.

Each item has an ID. When Phase 0 loads this file, its items are gated like checklist items, except any marked advisory: cite the ID in findings, tasks and Checklist Coverage.

## Node.js

- NODE-01: **Patched runtime.** The runtime is on a currently supported, patched release line. Check the Node.js security release notes for the recorded version rather than assuming.
- NODE-02: **Permission model.** `--permission` is defense in depth, not a sandbox; the Node.js docs state it does not protect against malicious code. Never recommend it as the fix for a supply chain finding. Advisory: not gated; it only shapes which fixes to recommend.
- NODE-03: **Per-request state.** Request-scoped data lives in `AsyncLocalStorage` or is passed explicitly, never in module-level variables. In ESM, module scope is shared by every request on the process.
- NODE-04: **No blocking calls on request paths:** synchronous crypto or hashing, `fs.*Sync`, synchronous zlib, `JSON.parse` on very large untrusted bodies, catastrophic regexes.
- NODE-05: **Process handlers.** `unhandledRejection` and `uncaughtException` handlers report to the error tracker and exit, rather than continuing in an unknown state.
- NODE-06: **Configuration.** Loaded once through a validated module; `--env-file` or dotenv only in development.
- NODE-07: **Randomness and comparison.** Tokens from `crypto.randomBytes` or `crypto.randomUUID`, never `Math.random`. Signature checks use `crypto.timingSafeEqual`.

## Express 5

- EXP-01: **Async errors.** Rejected promises and thrown errors in handlers are forwarded to error middleware automatically. `express-async-errors` and hand-rolled `asyncHandler` wrappers are now dead code. Check for double responses where old code both catches and calls `next(err)`.
- EXP-02: **`req.query` is a getter** and the default query parser is "simple", not "extended". Middleware that writes to `req.query` no longer works. Verify: `express-mongo-sanitize` is reported to be silently ineffective on Express 5 for this reason. If the project relies on it, treat it as a suspected missing safeguard and confirm by test.
- EXP-03: **Route syntax** (path-to-regexp 8): a bare `*` must be named (for example `/*splat`), optional segments use braces, regex characters in string paths are not supported. Check that catch-all and SPA fallback routes still match what they should.
- EXP-04: **Removed APIs** that indicate Express 4 era code: `req.param()`, `app.del`, `res.sendfile`, `res.redirect('back')`, singular `req.acceptsCharset` and similar.
- EXP-05: **Central error handler** returns a generic message and never leaks stack traces in production.
- EXP-06: **Hardening:** a security headers middleware (such as Helmet) with a real Content Security Policy; rate limiting on auth, reset, signup and upload-signing routes; schema validation at every route boundary; explicit body size limits on JSON and urlencoded parsers.
