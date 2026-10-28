# ADR-0001: Single-user, local-first modular monolith + separate worker

Status: Accepted · 2026-10-28

## Context

SYNAPSE runs on one developer's machine. Some workloads (browser audits,
analysis) are long-running, CPU- or memory-heavy, and handle untrusted input.
The project must be distinct from a multi-tenant SaaS.

## Decision

One API process (Express) organized into feature modules with enforced
boundaries, plus one worker process for background jobs. There's a single
local user, with no tenant or org model anywhere in the schema.

## Consequences

- \+ Simple to run and debug. One deploy unit plus a worker.
- \+ Heavy or untrusted work is isolated from the request path.
- \+ No tenant-isolation complexity.
- − Module boundaries depend on discipline and lint rules, not network boundaries.
- − Supporting multiple users later would require a schema migration.

## Alternatives

- Microservices: no demonstrated need, and much more operational cost.
- A single process without a worker: browser and analysis jobs would block or
  destabilize the API.
