# Architecture Decision Records

Format: Context → Decision → Consequences → Alternatives. Status values:
**Proposed** (awaiting owner review), **Accepted**, **Superseded**.

| #                                            | Decision                                                                                                    | Status                        |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [0001](0001-modular-monolith-single-user.md) | Single-user, local-first modular monolith + separate worker                                                 | Accepted                      |
| [0002](0002-pnpm-workspace-monorepo.md)      | pnpm workspace monorepo                                                                                     | Accepted                      |
| [0003](0003-postgresql-prisma.md)            | PostgreSQL 17 + Prisma 7 (stable pin) with versioned migrations                                             | Accepted                      |
| [0004](0004-job-queue.md)                    | BullMQ on a Redis-protocol server                                                                           | **Superseded** by 0012        |
| [0005](0005-spa-frontend.md)                 | Client-rendered React SPA built with Vite                                                                   | Accepted                      |
| [0006](0006-egress-guard.md)                 | Centralized egress guard: DNS pinning, manual redirects, filtering proxy for Chromium                       | Accepted                      |
| [0007](0007-cli-push-model.md)               | Code analysis via a CLI push model; never execute target code by default                                    | Accepted                      |
| [0008](0008-typescript-version-pin.md)       | Pin TypeScript 6.0.x                                                                                        | Accepted                      |
| [0009](0009-local-auth.md)                   | Local single-user auth: sessions + scoped access tokens + Host/Origin guard                                 | Accepted (amended 2026-10-30) |
| [0010](0010-optional-local-ai.md)            | Optional AI behind a provider interface (Ollama), output advisory only                                      | Accepted                      |
| [0011](0011-zod-shared-contracts.md)         | Zod schemas in a shared package as the single source of API contracts                                       | Accepted                      |
| [0012](0012-pg-boss-queue.md)                | pg-boss on PostgreSQL for background jobs                                                                   | **Accepted**                  |
| [0013](0013-mit-license.md)                  | MIT License for SYNAPSE                                                                                     | **Accepted**                  |
| [0014](0014-browser-origin-and-csrf.md)      | Browser origin and CSRF: `127.0.0.1` address, own default origin, exact `Origin` for cookie writes, no CORS | Accepted                      |
