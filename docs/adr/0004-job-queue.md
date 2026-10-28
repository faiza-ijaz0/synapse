# ADR-0004: BullMQ on a Redis-protocol server

Status: **Superseded by [ADR-0012](0012-pg-boss-queue.md)** · 2026-10-28
(The owner chose pg-boss on PostgreSQL. No Redis-compatible server is part of
the stack. This record is kept for history.)

## Context

The proposed stack names BullMQ. Facts found on this machine:

- **Memurai Developer 4.1.2** (Redis API 7.2.5) is installed and running on
  `127.0.0.1:6379` with `maxmemory-policy noeviction` (which BullMQ requires).
- Memurai Developer is **proprietary** freeware. Its on-disk EULA states:
  "You may not use the software in a production environment."
- Recent Redis versions aren't BSD-licensed (Redis 8: AGPLv3/RSALv2/SSPLv1).
  Valkey is BSD-3 but has no native Windows build.

## Decision (proposed)

Use BullMQ through `ioredis`, targeting the **Redis protocol only** (no
vendor-specific commands). Supported backends:

- Windows native development: Memurai Developer (free, development-only use,
  which matches SYNAPSE's local dev usage).
- Linux, WSL, CI: Valkey (BSD-3).

Job payloads hold IDs only. Postgres stays the system of record, so the queue
holds no data that can't be rebuilt.

## Consequences

- \+ Mature retries, backoff, concurrency, progress, and cancellation.
- − Adds a second service to install. On Windows, the only maintained native
  option is proprietary (free).

## Alternative to decide on: pg-boss (MIT)

A Postgres-backed queue would **remove the Redis dependency entirely**. That
means one fewer service, and fully open source on Windows. Its throughput is
lower, which doesn't matter for a single-user tool. If the owner prefers zero
proprietary components, switch to pg-boss before Phase 2. A thin queue adapter
in the worker keeps this swappable either way.
