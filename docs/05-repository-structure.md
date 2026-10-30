# 05 — Repository Structure

Status: revised 2026-10-28 (Phase 2 in progress)

pnpm workspace monorepo (ADR-0002). The tree below is the target. Each folder
is created in the phase that first needs it (shown in brackets). Folders marked
[P2] exist now. Shared TypeScript, ESLint, Prettier, and Vitest configuration
lives at the repo root instead of in `tsconfig`/`eslint-config` packages.

```
synapse/
├─ apps/
│  ├─ web/                 [P5] React SPA (Vite)
│  │  └─ src/{app,features/<capability>,components/ui,lib}
│  ├─ api/                 [P2] Express REST API
│  │  └─ src/{app.ts,server.ts,middleware/,modules/<module>/{router,service,repository}.ts}
│  ├─ worker/              [P2] pg-boss worker
│  │  └─ src/{main.ts,jobs/<queue>.ts,sandbox/}
│  └─ cli/                 [P3b] `synapse` CLI
├─ packages/
│  ├─ config/              [P2] Zod-validated env loading
│  ├─ logger/              [P2] pino factory + redaction
│  ├─ contracts/           [P2] Zod schemas: DTOs, error codes, job payloads, ingest document
│  ├─ db/                  [P2] Prisma schema, migrations, client, test helpers
│  ├─ queue/               [P2] pg-boss factory + typed queue helpers
│  ├─ analyzers/           [P3b] code analysis engines (CLI + worker)
│  ├─ net-guard/           [P4] SSRF-safe fetch + filtering proxy
│  └─ ai/                  [P9] optional explanation providers
├─ fixtures/               [P3b+] fixture servers, sites, projects, test reports
├─ e2e/                    [P5] Playwright end-to-end tests
├─ docs/
│  ├─ 01-product-requirements.md … 09-local-development.md
│  └─ adr/                 architecture decision records
├─ .github/workflows/      [P2] CI
├─ .env.example  .gitignore  .gitattributes  .editorconfig  .nvmrc
├─ package.json            root scripts, packageManager pin
└─ pnpm-workspace.yaml
```

## Dependency rules (enforced by lint in Phase 2)

- `apps/*` may depend on `packages/*`, but never on another app.
- `packages/contracts` depends only on `zod`. It's safe to import in the browser.
- `apps/web` may import **only** `contracts` (plus `tsconfig`/`eslint-config`).
  Never `db`, `logger`, or `net-guard`.
- `packages/db` and `packages/queue` are imported by `api` and `worker` only.
- No circular package dependencies (`tsc -b` project references enforce this).

## Naming

- Package names: `@synapse/<folder>`. Workspace deps use `workspace:*`.
- Files: `kebab-case.ts`. React components: `PascalCase.tsx`.
- Tests sit next to their source as `*.test.ts(x)`. Integration tests are named
  `*.int.test.ts`. E2E tests live in `/e2e`.
