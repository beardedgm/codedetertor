# Stack Reference: React & Vite

Written against React 19 (with React Compiler 1.0 available) and current Vite, late 2026. Compare against the versions Phase 0 recorded.

## React

- **Lint rules first.** `eslint-plugin-react-hooks` recommended preset (7.x) is enabled and not overridden to off. It includes compiler-powered rules such as `purity`, `refs`, `immutability`, `set-state-in-effect` and `set-state-in-render`, and does not require the compiler to be installed. A project that disables these rules is a finding in itself.
- **"You Might Not Need an Effect" anti-patterns:** deriving state from props in an effect, transforming data in an effect, synchronously setting state in an effect, chains of effects updating each other.
- **Immutable updates.** No in-place mutation of state arrays or objects, reducer state, or context values.
- **Memoization.** If React Compiler is enabled, manual `useMemo` or `useCallback` added purely for performance is usually redundant. Flag it as P2; do not mass-remove without measurement.
- **Modern APIs as modernization only (P2 at most):** Actions, `useActionState` and `useOptimistic` where they replace hand-rolled pending and error state; `use()` where it simplifies reading context or promises.
- **Keys.** Stable keys on lists; no array-index keys on reorderable or filterable lists.
- **Raw HTML.** Every `dangerouslySetInnerHTML` (or equivalent) receives sanitized content, sanitized at the render boundary.

## Vite

- **Client environment.** Only variables prefixed `VITE_` reach the client bundle, so any secret with that prefix is a P0 leak. Also scan a locally built `dist/` for secret patterns, not just the source, and report location and type only.
- **Source maps.** Production source maps are not publicly served unless intended. If uploaded to an error tracker, they are removed from the deployed output afterward.
- **Code splitting.** Heavy routes and features load through `React.lazy` or dynamic import. Judge bundle composition from a local build plus a visualizer, not by guessing.
