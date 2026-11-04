# Pass 3: Architecture, Contracts & Test Integrity

Every item is a hypothesis. Cite the item's ID in every finding, task and plan. Prefer tool evidence from the run's `evidence/` folder over reading code by eye. Apply the stack reference files Phase 0 selected.

**ARCH-01 Module Boundaries**
Documented boundaries hold: shared code free of runtime-specific APIs, no forbidden cross-layer imports, no circular dependencies (see the circular import output).

**ARCH-02 Contract Symmetry**
Verify that producers and consumers agree on payload shapes, saved formats, normalization and shared constraints. Every receiving trust boundary must independently enforce the checks required to protect it; client validation cannot substitute for server enforcement. Distinguish accidental contract drift from intentional differences such as server-only authorization, ownership, quotas and state-dependent validation. Shared shapes are ideally defined once and imported by both sides.

**ARCH-03 Type Rigor**
Results of the project's type checker. Implicit `any`, unchecked casts, untyped boundaries, loose types in core business logic, and the count and location of type suppression comments (see the suppression output). A whole-file type check opt-out is a finding.

**ARCH-04 Configuration**
Configuration loaded through one validated module at startup. Undocumented differences across environments, required variables with no validation, and defaults unsafe in production.

**ARCH-05 Test Integrity**
- Tests are isolated: state resets between tests, no ordering dependence, separate accounts or records where tests mutate server state.
- External services are faked; tests run only against local or ephemeral environments.
- Critical paths found in Pass 1 have coverage.
  Caveat: a coverage percentage says which lines ran, not which behavior was checked. Judge coverage of a critical path by whether a test would fail if that path broke.
- Tests actually assert: no tests without assertions, no assertions that cannot fail, no retries hiding flakiness (measure with repeated local runs if safe).
- Committed skips and focus markers (see the suppression output).
- Any CI test-selection logic triggers the right tests when shared code changes.

**ARCH-06 Observability**
Whether a failure in a critical path would actually be noticed: logging, metrics, alerts, error tracking, and a health check that verifies real dependencies rather than returning a static success.
