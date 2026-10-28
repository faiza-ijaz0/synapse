# ADR-0008: Pin TypeScript 6.0.x

Status: Accepted · 2026-10-28

## Context

On 2026-10-28, npm `typescript@latest` was 7.0.2 (the native port). The peer
range of `typescript-eslint` 8.72.1 was `>=4.8.4 <6.1.0`. The analyzers also use
the TypeScript compiler API, which must be available from the installed package.

## Decision

Pin `typescript` to **6.0.3** across the workspace. Re-evaluate TypeScript 7
when typescript-eslint supports it and the compiler API used by the analyzers
is available there.

## Consequences

- \+ Type-aware linting works. One TypeScript version everywhere.
- − We're not on the newest compiler or its speedups yet.
