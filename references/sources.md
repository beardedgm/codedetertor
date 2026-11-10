# Sources: where each rule comes from

Security items in `pass-1-security.md` carry OWASP codes. The performance, architecture and quality items carry a source tag in brackets (or in the Source column of the Pass 4 table). This file says what each tag is and where to look it up, so a reviewer can check that a rule comes from a recognized, published source and not from the agent's taste.

How to use it:
- A source backs the principle. The checklist item states the specific check, and its caveats still apply.
- Cite the item's tag in the task's `STANDARD` field.
- Never cite a standard, CWE ID or document that is not listed here unless you have opened it and confirmed it says what you claim. An invented citation is as bad as an invented line number.
- Every link below was opened and checked in November 2026. For the two books (Ousterhout, The Pragmatic Programmer) the link or citation confirms the book, and the one-line summary is of its well-known argument. Standards are revised; if a link or a name has changed, say so in the report and do not guess the new one.

## Formal standards

| Standard | What it is | Look it up |
|---|---|---|
| OWASP Top 10:2025, ASVS 5.0, API Security Top 10:2023, Top 10 for LLM Applications 2025 | The security standards. The codes are on each item in `pass-1-security.md`. | owasp.org |
| ISO/IEC 25010:2023 | The product quality model. It names the quality characteristics, including Security, Reliability, Performance Efficiency and Maintainability, which are the ones the four passes cover. It defines categories, not checks. | https://quality.arc42.org/standards/iso-25010 (summary; the standard itself is sold by ISO) |
| ISO/IEC 5055:2021 | Automated source code quality measures, developed by CISQ. It measures Security, Reliability, Performance Efficiency and Maintainability, each as a set of weaknesses, and every weakness is a CWE entry. | https://www.it-cisq.org/standards/code-quality-standards/ |
| CWE | The Common Weakness Enumeration, MITRE's public catalog of software weaknesses. A tag `CWE-<n>` is at `https://cwe.mitre.org/data/definitions/<n>.html`. | https://cwe.mitre.org |

## CWE entries used

The "CISQ measure" column names the measure that lists the entry in CWE's public "CISQ Quality Measures (2020)" view (CWE-1305). CISQ's automated quality measures are what was published as ISO/IEC 5055:2021; the ISO text itself is sold, so this column goes by the public CWE view. A dash means the entry is in CWE but not in that view.

| Tag | Name | CISQ measure | Used by |
|---|---|---|---|
| CWE-390 | Detection of Error Condition Without Action | Reliability | PERF-07, QUAL-07 |
| CWE-404 | Improper Resource Shutdown or Release | Reliability, Performance Efficiency, Security | PERF-05, PERF-06 |
| CWE-459 | Incomplete Cleanup | Reliability | PERF-06 |
| CWE-477 | Use of Obsolete Function | Security | QUAL-09 |
| CWE-561 | Dead Code | Maintainability | QUAL-03 |
| CWE-602 | Client-Side Enforcement of Server-Side Security | - | ARCH-02 |
| CWE-672 | Operation on a Resource after Expiration or Release | Reliability, Security | PERF-05 |
| CWE-703 | Improper Check or Handling of Exceptional Conditions | Reliability | PERF-07 |
| CWE-704 | Incorrect Type Conversion or Cast | Reliability | ARCH-03, QUAL-05 |
| CWE-770 | Allocation of Resources Without Limits or Throttling | - | PERF-03, PERF-06 |
| CWE-1041 | Use of Redundant Code | Maintainability | QUAL-02 |
| CWE-1047 | Modules with Circular Dependencies | Maintainability | ARCH-01, QUAL-04 |
| CWE-1050 | Excessive Platform Resource Consumption within a Loop | Performance Efficiency | PERF-03 |
| CWE-1051 | Initialization with Hard-Coded Network Resource Configuration Data | Maintainability, Reliability | ARCH-04 |
| CWE-1054 | Invocation of a Control Element at an Unnecessarily Deep Horizontal Layer | Maintainability | ARCH-01 |
| CWE-1057 | Data Access Operations Outside of Expected Data Manager Component | Performance Efficiency | ARCH-01 |
| CWE-1067 | Excessive Execution of Sequential Searches of Data Resource | Performance Efficiency | PERF-03 |
| CWE-1069 | Empty Exception Block | - | QUAL-07 |
| CWE-1073 | Non-SQL Invokable Control Element with Excessive Number of Data Resource Accesses | Performance Efficiency | PERF-03 |
| CWE-1121 | Excessive McCabe Cyclomatic Complexity | - (in the 2016 CISQ list only) | QUAL-01 |

## Named practices

| Tag | Source | What it says | Used by |
|---|---|---|---|
| Google review standard | Google Engineering Practices, "The Standard of Code Review". https://google.github.io/eng-practices/review/reviewer/standard.html | Approve a change once it definitely improves the overall code health, even if it is not perfect. There is no perfect code, only better code. | The fix standard in SKILL.md ("improvement, not perfection") |
| Google review guide | Google Engineering Practices, "What to look for in a code review", sections Design, Complexity, Naming and Comments. https://google.github.io/eng-practices/review/reviewer/looking-for.html | Design: does the change belong here and fit the system. Complexity: too complex means it cannot be understood quickly by readers, and over-engineering is a kind of complexity. Naming: a name communicates what the item is or does. Comments: explain why the code exists, not what it does. | QUAL-11, QUAL-13, QUAL-14, QUAL-15, QUAL-16 |
| Sonar Cognitive Complexity | SonarSource white paper "Cognitive Complexity" by G. Ann Campbell (https://sonarsource.com/resources/cognitive-complexity), and rule S3776. | A measure of how hard a function is to understand. The rule's default limit is 15, chosen by testing on open source projects (https://community.sonarsource.com/t/s3776-reason-for-the-current-default-value-of-15/127103). | QUAL-01 |
| Ousterhout | John Ousterhout, *A Philosophy of Software Design*, 2nd edition, 2021. https://web.stanford.edu/~ouster/cgi-bin/book.php | Good modules are deep: a small interface that hides a lot of work. Many shallow wrappers add complexity. | QUAL-12 |
| DRY | Andrew Hunt and David Thomas, *The Pragmatic Programmer* (Addison-Wesley, 1999; 20th anniversary edition 2019), which named the principle. | Don't Repeat Yourself: each piece of knowledge has one authoritative place, so a change is made once. It is about knowledge that must change together, not text that looks alike. | QUAL-02, QUAL-08 (closest match; see note) |
| YAGNI | "You Aren't Gonna Need It", from Extreme Programming. Martin Fowler, "Yagni", 2015. https://www.martinfowler.com/bliki/Yagni.html | Do not build a capability now because you presume you will need it later. | QUAL-13; remediation step 5 (a new abstraction needs real call sites) |
| Fowler: Non-Determinism | Martin Fowler, "Eradicating Non-Determinism in Tests", 2011. https://www.martinfowler.com/articles/nonDeterminism.html | Tests that pass or fail unpredictably ruin a suite. Causes: lack of isolation, asynchronous behavior, remote services, time, resource leaks. Keep tests isolated so one cannot affect another. | ARCH-05 |
| Fowler: Test Coverage | Martin Fowler, "Test Coverage", 2012. https://martinfowler.com/bliki/TestCoverage.html | Coverage is useful for finding untested code and of little use as a number saying how good the tests are. | ARCH-05 (the coverage caveat) |
| Twelve-Factor III | The Twelve-Factor App, "III. Config". https://12factor.net/config | Strict separation of config from code; config lives in the environment. | ARCH-04 |
| Twelve-Factor IX | The Twelve-Factor App, "IX. Disposability". https://12factor.net/disposability | On SIGTERM a process stops listening, lets current requests finish, then exits. | PERF-08 |
| Google SRE ch. 6 | *Site Reliability Engineering* (Google, O'Reilly), chapter 6, "Monitoring Distributed Systems". https://sre.google/sre-book/monitoring-distributed-systems/ | The four golden signals: latency, traffic, errors, saturation. Every page should be actionable. | ARCH-06 |
| Knuth 1974 | Donald Knuth, "Structured Programming with go to Statements", 1974. | Forget small efficiencies about 97% of the time, but do not pass up the critical 3%. The checklist's rule follows from it: measure to find that 3% before optimizing anything. | PERF-01, and the performance rule in SKILL.md |
| Node event loop guide | Node.js documentation, "Don't Block the Event Loop (or the Worker Pool)". https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop | While a thread is blocked for one client it cannot serve any other. Names vulnerable regexes, synchronous crypto, zlib, file and child process calls, and large JSON. | PERF-02 |
| web.dev long tasks | web.dev, "Optimize long tasks". https://web.dev/optimize-long-tasks/ | Any task over 50 milliseconds is a long task; while one runs, the page cannot respond to the user. | PERF-02, PERF-04 |
| Rules of React | React documentation, "Rules of React". https://react.dev/reference/rules | Components and Hooks must be pure, props and state are immutable, and the Rules of Hooks. Breaking them likely means bugs. For another framework, use its own published rules. | PERF-04 |
| TypeScript strict | TypeScript TSConfig reference, `strict`. https://www.typescriptlang.org/tsconfig/strict.html | The strict flag gives stronger guarantees of program correctness. For another language, use its own strict mode. | ARCH-03, QUAL-05 |
| ban-ts-comment | typescript-eslint rule `ban-ts-comment`, part of its recommended set. https://typescript-eslint.io/rules/ban-ts-comment | By default `@ts-ignore` and `@ts-nocheck` are reported, and `@ts-expect-error` is allowed only with a written description. | ARCH-03, QUAL-06, and the same rule in `check-diff.mjs` |
| Project linter | The project's own lint configuration, and the recommended rule set a framework publishes for itself. | The team's chosen rules are its standard; a framework's recommended preset is that framework's published guidance. | QUAL-10 |

Note on QUAL-08 (more than one library or pattern for the same job): no formal standard names this directly. DRY is the closest published principle, since two tools for one job duplicate the knowledge of how that job is done. Treat the tag as the nearest match, not an exact one.

## Stack reference files

Stack items come from each technology's own documentation, changelog and security advisories for the version Phase 0 recorded. Check a stack item against these official pages, and against that project's release notes for the recorded version:

| Stack file | Official pages to check against |
|---|---|
| `stack-node-express.md` | Node.js: https://nodejs.org/en/learn/asynchronous-work/dont-block-the-event-loop. Express: "Production Best Practices: Security" (https://expressjs.com/en/advanced/best-practice-security.html) and the v5 release notes (https://expressjs.com/2024/10/15/v5-release). |
| `stack-react-vite.md` | React: https://react.dev/reference/rules and https://react.dev/learn/you-might-not-need-an-effect. Vite: "Env Variables and Modes" (https://vite.dev/guide/env-and-mode). |
| `stack-mongoose.md` | Mongoose documentation, for example "Query Casting" (https://mongoosejs.com/docs/tutorials/query_casting.html), and the project's security advisories. |
| `stack-r2-render.md` | Cloudflare R2: "Presigned URLs" (https://developers.cloudflare.com/r2/api/s3/presigned-urls/). Render: "How Deploys Work" (https://docs.render.com/deploys) and "Health Checks" (https://render.com/docs/health-checks). |
| `stack-playwright-jsdoc.md` | Playwright: "Best Practices" (https://playwright.dev/docs/best-practices). TypeScript: "JS Projects Utilizing TypeScript" (https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html). |
