# Read-only Tools by Language

The evidence script covers JavaScript and TypeScript tooling, plus a built-in scan for suppressions and skipped tests in several languages. For other languages, run the equivalents below by hand during Phase 0, under the same rules as the script:

- Run only tools already installed in the project or on PATH. Never install one during reconnaissance; list missing ones as recommendations.
- Never use a fix or format mode (`--fix`, `format`, `-w`).
- Send any build output to a temp folder, never into the repository.
- Tools marked "network" query public vulnerability databases; run them only if the user agreed to network tools.
- Save each tool's output under the run's `evidence/` folder, and record in the summary which tools ran, which were missing, and how many files each checked. A tool that checked nothing makes the items it covers Unverified, never Passed.

Check the project's own configuration first (`pyproject.toml`, `setup.cfg`, `.golangci.yml`, `Cargo.toml`, `Gemfile`, `composer.json`, CI workflows). If the project already runs a tool, use its configuration rather than defaults.

| Language | Lint and quality | Types | Security | Known vulnerabilities (network) | Dead code and duplication |
|---|---|---|---|---|---|
| Python | `ruff check` | `mypy` or `pyright` | `bandit -r <src>` | `pip-audit` | `vulture`; `jscpd` also reads Python |
| Go | `go vet ./...`, `staticcheck ./...` or `golangci-lint run` | the compiler (`go build -o /dev/null ./...` or `go vet`) | `gosec ./...` | `govulncheck ./...` | `staticcheck` reports unused code; `jscpd` |
| Rust | `cargo clippy` with `CARGO_TARGET_DIR` set to a temp folder | the compiler (`cargo check`, same temp target) | `cargo clippy` lints; review `unsafe` blocks by hand | `cargo audit` | compiler warnings for unused code; `jscpd` |
| Ruby | `rubocop` | `steep` or `sorbet` if configured | `brakeman` (Rails) | `bundle audit` | `debride`; `jscpd` |
| PHP | `phpstan analyse` or `psalm` | same | `psalm --taint-analysis` | `composer audit` | `jscpd` |
| Java and Kotlin | the build's own check task with `--offline` where possible, writing to a temp build folder | the compiler | `spotbugs` with find-sec-bugs if configured | `dependency-check` if configured | `jscpd` |

Suppression and skip markers for these languages (`# noqa`, `# type: ignore`, `@pytest.mark.skip`, `//nolint`, `t.Skip()`, `#[ignore]`, `#[allow(...)]`) are already counted by the evidence script's built-in scan and checked by `check-diff.mjs`.
