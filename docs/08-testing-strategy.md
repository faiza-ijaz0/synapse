# 08 — Testing Strategy

Status: **Approved** 2026-10-28 · revised for Phase 2

## 1. Principles

- Tests check **real behavior against real inputs**. Analyzer and audit tests use
  fixture projects and sites with _known_ defects, so expected findings are
  real, not mocked.
- Integration tests use a **real PostgreSQL** database (`synapse_test`), and
  that includes the pg-boss queue. The DB and queue aren't mocked; mocks are
  kept for third-party network calls only.
- **Destructive test helpers are guarded.** They refuse to run unless the
  target database name ends in `_test`, so tests can never truncate the
  development database.
- A test is reported as passing only if it was actually run. CI output is the
  source of truth.
- Checks are never weakened to get green. No `@ts-ignore`, no skipped tests,
  and no lowered thresholds without a written reason in the PR.

## 2. Layers

| Layer              | Tool                                                                           | Scope                                                                                                              | Runs                                 |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Static             | `tsc -b` (strict), ESLint, Prettier check                                      | whole repo                                                                                                         | every commit, CI                     |
| Unit               | Vitest                                                                         | pure logic: IP classification, URL normalization, redaction, fingerprinting, flakiness, parsers, Zod schemas       | every commit                         |
| Component          | Vitest + React Testing Library + jsdom; MSW for HTTP                           | UI states (loading/empty/error/success), forms, accessibility roles                                                | every commit                         |
| API integration    | Vitest + Supertest against `createApp()` + real Postgres (`DATABASE_URL_TEST`) | routes, auth, validation, error envelope, host/origin guard, DB constraints                                        | every commit (CI service containers) |
| Worker integration | Vitest + real queue (unique prefix) + Postgres                                 | job lifecycle, retries, cancellation, timeouts                                                                     | every commit                         |
| Fixture/golden     | Vitest                                                                         | analyzers on `fixtures/projects/*`, importers on `fixtures/reports/*`; results compared with reviewed golden files | every commit                         |
| Security           | Vitest + local fixture servers                                                 | SSRF corpus (§5), redaction, code-execution traps, XML bombs                                                       | every commit                         |
| End-to-end         | Playwright (`@playwright/test`)                                                | full stack: setup → login → each capability's happy path and an error path; axe scan of SYNAPSE's own pages        | CI on PR; locally on demand          |

## 3. Database testing

- Migrations are applied to `synapse_test` once per run (`prisma migrate deploy`).
- Each test file truncates the tables it touches (`TRUNCATE … RESTART IDENTITY
CASCADE`) using a helper in `packages/db/testing`.
- Constraint tests (unique, FK cascade, enum) are explicit, not incidental.

## 4. Coverage

- Line coverage is reported (v8), but **not** a merge gate on its own.
- Hard gate: `packages/net-guard`, `packages/config` redaction, and the auth
  module must stay at ≥ 90% branch coverage. These are the security boundary.

## 5. SSRF corpus (Phase 4 exit criterion)

Each case must be **denied** unless the origin is allowlisted:
`http://127.0.0.1`, `http://localhost`, `http://[::1]`, `http://0.0.0.0`,
`http://2130706433` (decimal), `http://0x7f.1`, `http://017700000001` (octal),
`http://[::ffff:127.0.0.1]`, `http://169.254.169.254/latest/meta-data`,
`http://10.0.0.1`, `http://192.168.1.1`, `http://172.16.0.1`, `http://100.64.0.1`,
`http://[fd00::1]`, `http://[fe80::1]`, `file:///C:/Windows/win.ini`,
`gopher://…`, `http://user:pass@example.com`, a public URL that **302s** to
`127.0.0.1`, and a hostname whose test resolver returns public then private
(rebinding). Each case also has a positive control: an allowlisted
`http://localhost:<fixture-port>` succeeds.

## 6. CI (GitHub Actions, Phase 2)

- `ubuntu-latest`: install with a frozen lockfile, typecheck, lint, unit,
  component, integration (a Postgres 17 service container), build,
  and E2E (Playwright browsers cached).
- The ubuntu job sets `SYNAPSE_REQUIRE_INTEGRATION_TESTS=1`. `pnpm test` then
  fails if `DATABASE_URL_TEST` is missing, or if any `*.int.test.ts` test is
  skipped, pending, or didn't run (`vitest.integration-guard.ts`), so a green
  job proves the integration tests executed.
- `windows-latest`: typecheck, unit, and component tests. This guards against
  Windows path and line-ending issues. It has no Postgres, so it sets
  `SYNAPSE_REQUIRE_INTEGRATION_TESTS=0` and integration tests skip by design.
- `pnpm audit --prod` and a license allowlist check.
- No secrets are required. CI generates throwaway values.

## 7. Commands (to exist after Phase 2)

```sh
pnpm typecheck        # tsc -b
pnpm lint
pnpm test             # unit + component + integration (needs Postgres + queue)
pnpm test:unit        # no services needed
pnpm test:e2e         # Playwright, starts the full stack
```
