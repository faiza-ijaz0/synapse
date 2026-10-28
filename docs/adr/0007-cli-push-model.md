# ADR-0007: Code analysis via a CLI push model

Status: Accepted · 2026-10-28

## Context

A browser can't read arbitrary local folders. Letting the API read any path a
browser sends turns it into a local file reader. Many analysis tools execute
project code (ESLint JS configs and plugins, install scripts).

## Decision

The `synapse` CLI analyzes a folder locally using `packages/analyzers` and
uploads a validated **results document** (findings and metrics, not source) to
`/api/v1/ingest` with a scoped access token. By default it uses SYNAPSE's own
ESLint ruleset and the TypeScript compiler API, and never loads target configs
or plugins or installs dependencies. Running the project's own ESLint config is
opt-in (`--use-project-eslint-config`) and prints a warning.

## Consequences

- \+ No server-side filesystem exposure. Source never leaves the CLI.
- \+ Analysis is reproducible in CI by running the same CLI.
- − Analysis requires a terminal step. The UI shows copy-paste commands.
- − The SYNAPSE ruleset can't see project-specific lint rules unless the user opts in.

## Alternatives

- Browser File System Access API: Chromium-only, prompts for each folder, slow
  for large trees.
- Zip upload: zip-slip and size risks, plus it sends source.
- Worker reading allowlisted `WORKSPACE_ROOTS`: possible later as an opt-in setting.
