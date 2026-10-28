# ADR-0012: pg-boss on PostgreSQL for background jobs

Status: **Accepted** · 2026-10-28 · Supersedes [ADR-0004](0004-job-queue.md)

## Context

ADR-0004 proposed BullMQ on a Redis-protocol server. On Windows, the only
maintained native option found was Memurai Developer, which is proprietary and
licensed for non-production use only. SYNAPSE is single-user, so queue
throughput isn't a constraint. PostgreSQL 17 is already required.

## Decision

Use **pg-boss** (MIT) on the same PostgreSQL database, in its own `pgboss`
schema. Remove Redis, Memurai, and Valkey from the stack.

Compatibility was verified from the registry and README on 2026-10-28 for
pg-boss 12.38.0: Node `>=22.12.0` (we use 24.x ✅), PostgreSQL 13+ (we use 17.11 ✅).
Its dependencies (`pg`, `cron-parser`, `rrule-temporal`, `serialize-error`) are
all MIT. It's pure JavaScript with no native addons, so it doesn't need
Windows-specific build tools. It also declares a peer dependency on
`@opentelemetry/api`, whose license is checked when installed.

### Migration strategy

- pg-boss creates and versions its own schema (`pgboss`) during `start()`.
  Prisma migrations manage only `public`. The two never overlap.
- The `synapse` role owns the database, so it can create the schema without
  superuser rights.
- pg-boss version upgrades are explicit dependency bumps. Its schema migration
  runs on the next start, and the release notes are reviewed before upgrading.
- Tests use a separate database (`synapse_test`), never the dev database.

## Consequences

- \+ One service to install and back up. Fully open-source stack on Windows.
- \+ Jobs can be enqueued in the same transaction as the `Run` row.
- \+ Retries, expiry, singleton keys, scheduling, and dead-letter queues are built in.
- − Polling-based delivery has slightly more latency than Redis. Irrelevant for
  minute-scale jobs.
- − Queue tables add write load to Postgres. Negligible for a single user, and
  pg-boss archives and deletes completed jobs on its own.

## Alternatives

BullMQ + Memurai/Valkey (ADR-0004, superseded). Graphile Worker (also
Postgres-based. pg-boss was preferred for its simpler API and because it
doesn't need extra Postgres functions or triggers).
