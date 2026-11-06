# Stack Reference: Playwright & JSDoc Type Checking

Written against current Playwright and TypeScript `checkJs`, late 2026.

Each item has an ID. When Phase 0 loads this file, its items are gated like checklist items: cite the ID in findings, tasks and Checklist Coverage.

## Playwright

- PW-01: **Isolation.** Each test runs independently with its own storage, cookies and data. Flag tests that depend on execution order or on shared server-side records. Tests that modify server state use separate accounts.
- PW-02: **Auth state.** Authentication uses a setup project and `storageState`, and the stored auth directory (commonly `playwright/.auth`) is gitignored because it contains cookies and headers.
- PW-03: **Locators.** Role and user-facing text locators (`getByRole`, `getByLabel`, `getByText`) rather than CSS or XPath tied to markup.
- PW-04: **Web-first assertions.** `await expect(locator).toBeVisible()`, not `expect(await locator.isVisible()).toBe(true)`, which does not wait.
- PW-05: **No sleeps.** No `waitForTimeout` used as synchronization.
- PW-06: **Third parties mocked** with `page.route()`; test only what the project controls.
- PW-07: **Flakiness.** Retries in config are not masking flaky tests; if it is safe to run locally, measure with `--repeat-each`.
- PW-08: **Environment.** End-to-end tests run only against a local or ephemeral environment, never a shared staging database.

## JSDoc with TypeScript checkJs

- JSDOC-01: **Config.** `tsconfig.json` or `jsconfig.json` sets `allowJs`, `checkJs`, `strict` and `noEmit`. `checkJs` is equivalent to `// @ts-check` on every file.
- JSDOC-02: **Suppressions.** Count and locate `@ts-nocheck`, `@ts-ignore` and `@ts-expect-error`. Each needs a justification; `@ts-nocheck` on a whole file is a finding.
- JSDOC-03: **Silent `any`.** In JavaScript files, variables initialized with `null`, `undefined` or `[]` are typed `any` or `any[]` even under strict null checks. These need explicit JSDoc types to get real checking.
- JSDOC-04: **Shared shapes.** Request and response shapes are defined once (a `@typedef` or a shared schema) and imported by both client and server.
