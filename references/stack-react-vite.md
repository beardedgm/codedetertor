# Stack Reference: React & Vite

Written against React 19 (with React Compiler 1.0 available) and current Vite, late 2026. Compare against the versions Phase 0 recorded.

Each item has an ID. When Phase 0 loads this file, its items are gated like checklist items, except any marked advisory: cite the ID in findings, tasks and Checklist Coverage.

## React

- REACT-01: **Lint rules first.** `eslint-plugin-react-hooks` recommended preset (7.x) is enabled and not overridden to off. It includes compiler-powered rules such as `purity`, `refs`, `immutability`, `set-state-in-effect` and `set-state-in-render`, and does not require the compiler to be installed. A project that disables these rules is a finding in itself.
- REACT-02: **"You Might Not Need an Effect" anti-patterns:** deriving state from props in an effect, transforming data in an effect, synchronously setting state in an effect, chains of effects updating each other.
- REACT-03: **Immutable updates.** No in-place mutation of state arrays or objects, reducer state, or context values.
- REACT-04: **Memoization.** If React Compiler is enabled, manual `useMemo` or `useCallback` added purely for performance is usually redundant. Flag it as P2; do not mass-remove without measurement.
- REACT-05: **Modern APIs as modernization only (P2 at most):** Actions, `useActionState` and `useOptimistic` where they replace hand-rolled pending and error state; `use()` where it simplifies reading context or promises. Advisory: not gated.
- REACT-06: **Keys.** Stable keys on lists; no array-index keys on reorderable or filterable lists.
- REACT-07: **Raw HTML.** Every `dangerouslySetInnerHTML` (or equivalent) receives sanitized content, sanitized at the render boundary.

## Vite

- VITE-01: **Client environment.** Only variables prefixed `VITE_` reach the client bundle, so any secret with that prefix is a P0 leak. Also secret-scan a locally built `dist/` with the evidence script's `--scan-dir`, not just the source, and report location and type only, never with a plain text search that prints matches.
- VITE-02: **Source maps.** Production source maps are not publicly served unless intended. If uploaded to an error tracker, they are removed from the deployed output afterward.
- VITE-03: **Code splitting.** Heavy routes and features load through `React.lazy` or dynamic import. Judge bundle composition from a local build plus a visualizer, not by guessing.
