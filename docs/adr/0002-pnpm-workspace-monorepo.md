# ADR-0002: pnpm workspace monorepo

Status: Accepted · 2026-10-28

## Context

The web app, API, worker, and CLI share schemas, config, and analyzers.

## Decision

A single repository using pnpm workspaces (`apps/*`, `packages/*`), with pnpm
pinned via `packageManager`. TypeScript project references (`tsc -b`) handle
incremental builds and prevent cycles. No Turborepo or Nx until build times
justify it.

## Consequences

- \+ Atomic changes across contracts and consumers. Strict, non-flat
  `node_modules` catches undeclared dependencies.
- \+ pnpm doesn't run dependency lifecycle scripts unless allowlisted, which
  reduces supply-chain risk.
- − Contributors need pnpm (`corepack enable`).

## Alternatives

- npm/Yarn workspaces: looser hoisting.
- Polyrepo: contracts drift between repos.
