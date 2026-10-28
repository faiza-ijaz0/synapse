# ADR-0011: Zod schemas as the single source of API contracts

Status: Accepted · 2026-10-28

## Decision

`packages/contracts` holds Zod 4 schemas for request and response DTOs, error
codes, job payloads, and the CLI ingest document. The API validates inputs (and
outputs, in tests). The web app and CLI use the inferred types and the same
schemas for forms. `contracts` depends only on `zod`.

## Consequences

- \+ One definition. Drift between client and server shows up as a type error.
- − No OpenAPI document out of the box. One can be generated from the Zod
  schemas later if external consumers appear.
