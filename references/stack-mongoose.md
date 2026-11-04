# Stack Reference: Mongoose & MongoDB

Written against Mongoose 8 and 9 with MongoDB Atlas, late 2026. Compare against the version Phase 0 recorded. Run query plans and index checks only against a local or seeded database, never Atlas production.

## Injection & filters

- **Patched version.** CVE-2026-42334 (CVSS 7.5) allowed bypassing `sanitizeFilter` by nesting operators inside `$nor`; per the advisory it is fixed in 6.13.9, 7.8.9, 8.22.1 and 9.1.6, and affects apps that pass unsanitized user input directly into query methods. Verify the recorded version against the advisory itself.
- **Never pass `req.body` or `req.query` directly as a filter.** Build filters from explicitly picked, validated fields. `sanitizeFilter: true` is a safety net, not the primary control.
- **`strictQuery`** has defaulted to `false` since Mongoose 7, so unknown filter fields pass through to MongoDB. Setting it to `true` strips unknown fields, which can reduce a filter to `{}` and match every document. On update and delete paths, check what an empty or stripped filter would do.

## Data exposure & mass assignment

- `Model.create(req.body)`, `new Model(req.body)` or `doc.set(req.body)` without a field allowlist lets users set privileged fields such as `role`, `tenantId` or `isAdmin`.
- Sensitive fields use `select: false` and a `toJSON` or `toObject` transform so they never serialize into responses.

## Performance & correctness

- Read-only queries use `.lean()`, remembering the results are plain objects: no getters, virtuals or `save()`.
- `autoIndex` is disabled in production; indexes are declared in schemas and built deliberately.
- Every query on a hot path has a supporting index.
- Pagination has a maximum `limit`, and large collections use cursor or range pagination rather than deep `skip`.
- Multi-document writes that must be atomic use `connection.transaction()` or `session.withTransaction()`, every operation inside passes `{ session }`, and nothing inside the transaction runs in parallel with `Promise.all`, which the docs call undefined behaviour.
- One connection per process, opened at startup and closed in the termination signal handler.
