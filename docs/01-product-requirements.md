# 01 — Product Requirements

Status: **Approved** 2026-10-28 · revised for Phase 2

## 1. Summary

SYNAPSE is a local-first Engineering Intelligence Platform. A developer runs it
on their own machine, opens it in a browser, and uses it to analyze codebases,
exercise HTTP APIs, audit websites, make sense of test results, and track all of
it over time. Everything core works offline (except auditing public websites)
and without paid services or an AI model.

## 2. Users

| Persona                                   | Need                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------- |
| **Individual developer** (primary)        | Find real problems in their project and see whether they're improving.                  |
| **Reviewer / hiring manager** (secondary) | Clone, run, and evaluate the product on a Windows or Linux machine in under 15 minutes. |

SYNAPSE is **single-user and single-installation**. There are no tenants,
organizations, billing, or cross-user sharing. (See ADR-0001.)

## 3. Goals

1. Produce **real, reproducible findings** from established open-source tools,
   with no fabricated metrics.
2. Show **history**: every run is persisted, so regressions and improvements
   are visible across runs.
3. Stay **safe by default** for a tool that fetches URLs and reads source code.
4. Be **free to run**: no paid APIs, hosting, or AI.

## 4. Non-goals

- Multi-tenant SaaS, teams, RBAC, or billing.
- Hosted/cloud deployment as a requirement.
- Executing a target project's own code (build scripts, tests, ESLint plugins)
  inside the trusted API process.
- Automatically applying AI-generated code changes.
- Replacing CI systems. SYNAPSE _imports_ test results; it does not orchestrate
  CI pipelines.

## 5. Capabilities and functional requirements

Priority: **P0** = required for v1, **P1** = should, **P2** = later.

### 5.1 Platform (P0)

- FR-P1 Local account: first-run setup creates the single local user (password).
- FR-P2 Projects: group runs, targets, and history under a named project.
- FR-P3 Runs: every analysis/test/audit is a _Run_ with status
  (`queued → running → succeeded | failed | cancelled`), timings, tool versions,
  and an error message on failure.
- FR-P4 Long operations run in the background worker. The UI shows progress
  and allows cancellation.
- FR-P5 Every finding records its **source tool, rule ID, and tool version**.

### 5.2 Codebase analysis (P0)

- FR-C1 Analyze a JS/TS project directory via the **SYNAPSE CLI** (the browser
  cannot read local folders; see architecture §6).
- FR-C2 Checks: TypeScript compiler diagnostics, ESLint using a
  **SYNAPSE-owned ruleset**, dependency manifest inspection (outdated / known
  license categories), and size/complexity metrics computed from the AST.
- FR-C3 Findings carry a stable _fingerprint_ so the same issue can be tracked
  across runs (new / fixed / persisting).
- FR-C4 (P1) Opt-in mode that uses the project's _own_ ESLint config, run only
  by the CLI on the developer's machine, with an explicit warning that this
  executes project code.

### 5.3 API testing (P0)

- FR-A1 Define requests (method, URL, headers, query, body) grouped in collections.
- FR-A2 Assertions: status, header, JSON-path value, response time, JSON Schema.
- FR-A3 Environments with variables. Secret variables are encrypted at rest and
  redacted in logs, history, and exports.
- FR-A4 Targets are **only** public addresses or an explicit per-project
  allowlist of local development origins (e.g. `http://localhost:3000`).
- FR-A5 Enforced limits on timeout, response size, redirects, and concurrency.

### 5.4 Website quality audit (P0)

- FR-W1 Audit a URL with Lighthouse (performance, accessibility, best practices, SEO).
- FR-W2 Accessibility scan with axe-core via Playwright.
- FR-W3 All browser traffic is routed through SYNAPSE's egress guard (SSRF policy).
- FR-W4 Store the structured results; render them natively (not as raw third-party HTML).

### 5.5 Test-result intelligence (P1)

- FR-T1 Import JUnit XML, Playwright JSON, and Vitest JSON reports (upload or CLI).
- FR-T2 Per-test history: pass rate, duration trend, flaky detection
  (a test that both passed and failed on the same commit).
- FR-T3 Slowest and most-failing test lists per project.

### 5.6 Reports and history (P1)

- FR-R1 Per-project trends across runs (finding counts by severity, Lighthouse
  scores, test pass rate).
- FR-R2 Run-to-run diff: new / fixed / persisting findings.
- FR-R3 Export a run or comparison as JSON and Markdown, with secrets redacted.

### 5.7 Optional AI explanations (P2)

- FR-AI1 Disabled by default. When enabled with a local Ollama model, the user
  can ask for an explanation of a finding.
- FR-AI2 AI output is labelled as AI-generated, rendered as sanitized text, and
  never executed or applied automatically.
- FR-AI3 Every feature works with AI disabled.

## 6. Non-functional requirements

| ID    | Requirement                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------- |
| NFR-1 | Runs natively on Windows 11; also on Linux and macOS.                                               |
| NFR-2 | API binds to `127.0.0.1` by default.                                                                |
| NFR-3 | API p95 under 200 ms for non-job endpoints with 10k runs stored (local hardware).                   |
| NFR-4 | Strict TypeScript; no unchecked `any`.                                                              |
| NFR-5 | All external inputs (HTTP bodies, query, env, uploaded files, CLI payloads) are validated with Zod. |
| NFR-6 | Structured JSON logs with secret redaction.                                                         |
| NFR-7 | Every UI data view has loading, empty, error, and success states.                                   |
| NFR-8 | WCAG 2.2 AA for SYNAPSE's own UI (verified with axe in E2E tests).                                  |
| NFR-9 | Zero paid dependencies; all licenses recorded in doc 06.                                            |

## 7. Success criteria for v1

- A reviewer can follow `docs/09-local-development.md` and get a working
  instance on Windows.
- Each P0 capability produces real findings against the bundled fixture
  projects and sites, and those findings are verified by automated tests.
- The SSRF test corpus (doc 08 §5) passes.
- CI is green on the default branch.

## 8. Open product questions

1. Which language ecosystems besides JS/TS, if any, does codebase analysis need for v1?
   (Proposed: JS/TS only.)

### Resolved 2026-10-28

- **Priority:** the core comes first: foundation, environment validation, the
  database, the codebase analysis CLI, and API testing. Website audits (§5.4) and
  test-result intelligence (§5.5) follow, and optional AI (§5.7) comes last. See doc 04.
- **License:** MIT (ADR-0013).
- **Queue:** pg-boss on PostgreSQL (ADR-0012). No Redis-compatible server.
