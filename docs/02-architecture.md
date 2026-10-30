# 02 — Architecture

Status: **Approved** 2026-10-28 · revised for Phase 2 · revised 2026-10-30 for Phase 3a

## 1. Shape: modular monolith + worker

SYNAPSE is a **modular monolith** (one API process) plus a **separate worker
process**. They share code through workspace packages. PostgreSQL is both the
system of record and the job queue (pg-boss, in a dedicated `pgboss` schema), so
only **one** backing service is needed. There are no microservices (ADR-0001,
ADR-0012).

```
                 ┌──────────────────────── developer machine ────────────────────────┐
                 │                                                                     │
  Browser ──────►│  apps/web (Vite SPA, static)                                        │
  (127.0.0.1)    │      │  fetch /api/* (cookie session, same-origin via proxy)        │
                 │      ▼                                                              │
                 │  apps/api  (Express 5, 127.0.0.1:4000)                              │
                 │      │  Prisma ──────────────► PostgreSQL 17                        │
                 │      │  pg-boss send ────────►   ├─ schema public (app data)        │
                 │      ▼                           └─ schema pgboss (job queue)       │
                 │  apps/worker (pg-boss work)  ◄───────┘                              │
                 │      ├─ child processes: analyzers, Lighthouse, Playwright/Chromium │
                 │      ├─ egress guard + filtering proxy ──► Internet / allowlisted   │
                 │      │                                     local dev targets        │
                 │      └─ Prisma ──► PostgreSQL (writes results)                      │
                 │                                                                     │
  Terminal ─────►│  apps/cli (synapse)  ── analyzes local folders, POSTs results ──►  │
                 │                         to apps/api with a personal access token    │
                 │                                                                     │
                 │  (optional) Ollama 127.0.0.1:11434 ◄── worker, only if AI enabled   │
                 └─────────────────────────────────────────────────────────────────────┘
```

## 2. Frontend — `apps/web`

- React 19, TypeScript (strict), Vite 8, Tailwind CSS 4, shadcn/ui (copied
  components built on Radix primitives), TanStack Query, React Hook Form with
  Zod resolvers, Recharts, Motion (used sparingly for transitions).
- A **client-rendered SPA**. There is no SSR, because there's no SEO need and no
  server rendering budget. In development, Vite proxies `/api` to the API so
  cookies stay same-origin. In production mode, the API serves the built static
  files from the same origin.
- Feature-sliced layout: `src/features/<capability>/{api,components,routes}`.
  Server state lives in TanStack Query only. There's no global client store until
  one is needed.
- API types come from `packages/contracts` (shared Zod schemas), so request and
  response shapes can't drift from the server.
- Untrusted content (response bodies, finding messages, AI text) is rendered as
  text. `dangerouslySetInnerHTML` is banned by a lint rule. Third-party HTML reports
  are never embedded directly; SYNAPSE renders the stored JSON.

## 3. API — `apps/api`

- Express 5 (native async error propagation), REST, JSON only.
- Modules: `auth`, `projects`, `runs`, `findings`, `api-testing`, `audits`,
  `test-results`, `reports`, `ingest` (CLI), `ai` (optional). Each module owns
  `router.ts`, `service.ts`, and `repository.ts`. Routers validate, services hold
  logic, and repositories own Prisma access. Modules talk to each other through
  services, never through each other's tables.
- **Request pipeline:** request-id → pino-http logger (redacting) → host/origin
  guard → helmet (CSP, etc.) → body limits → auth → Zod validation → handler →
  error mapper.
- **Error envelope** (every non-2xx):
  ```json
  { "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [...], "requestId": "…" } }
  ```
  Codes come from a closed enum in `packages/contracts`. Unknown errors map to
  `INTERNAL` and their stack traces are logged, never returned.
- **Pagination:** cursor-based (`?cursor=&limit=`) on all list endpoints.
- **Versioning:** routes are under `/api/v1`.
- **No untrusted code runs in this process.** Anything that parses large
  untrusted input or launches tools is enqueued for the worker.

### 3.1 Authentication (single local user)

- First-run setup creates one user and requires a one-time setup code that the
  API prints to its console while no user exists. The password is hashed with
  `node:crypto.scrypt` (built-in, so no native addon is needed on Windows).
- Browser: server-side session row plus an opaque cookie
  (`HttpOnly; SameSite=Strict; Path=/`, and `Secure` when served over HTTPS).
  The row stores `HMAC-SHA256(SYNAPSE_SESSION_SECRET, session ID)`. A session
  ends after 24 hours idle or 7 days after login.
- CLI: **personal access tokens**. The random token is shown once and stored as
  a SHA-256 hash. Its scope is limited to `ingest`, it expires after 90 days by
  default (365 at most), and it can be revoked.
- Login and setup attempts are rate-limited in memory, with backoff.
- Localhost-specific defenses against drive-by attacks from other websites and
  other local dev servers: SYNAPSE is used at `http://127.0.0.1:<port>`, a
  `Host` header allowlist (defeats DNS rebinding), an exact `Origin` match plus
  a custom header on cookie-authenticated state-changing requests, and no CORS.
  See ADR-0009 (amended 2026-10-30), ADR-0014, and threat model T1, T17, T18.

## 4. Database — PostgreSQL + Prisma

- PostgreSQL 17 (installed locally). Prisma 7 ORM with the `@prisma/adapter-pg`
  driver adapter. Migrations are generated by `prisma migrate dev` and committed
  under `packages/db/prisma/migrations`.
- The app connects as a dedicated, non-superuser `synapse` role.

### 4.1 Core entities (initial sketch, finalized per phase)

| Entity                                               | Key fields                                                                                                         | Notes / indexes                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `User`                                               | id, passwordHash, createdAt                                                                                        | exactly one row (enforced in the service)                       |
| `Session`                                            | id (hash), userId, expiresAt                                                                                       | index `expiresAt` for cleanup                                   |
| `AccessToken`                                        | id, tokenHash (unique), name, scopes, lastUsedAt, revokedAt                                                        |                                                                 |
| `Project`                                            | id, name (unique), description                                                                                     |                                                                 |
| `Run`                                                | id, projectId, kind (enum), status (enum), trigger, toolVersions (jsonb), startedAt, finishedAt, error             | index `(projectId, kind, createdAt DESC)`                       |
| `Finding`                                            | id, runId, tool, ruleId, severity (enum), fingerprint, location (file/line or URL/selector), message, data (jsonb) | index `(runId, severity)`, `(fingerprint)` for cross-run diff   |
| `ApiTarget`                                          | id, projectId, origin, kind (`local_dev`)                                                                          | unique `(projectId, origin)`; this is the egress allowlist      |
| `ApiCollection` / `ApiRequestDef` / `ApiEnvironment` | …                                                                                                                  | secret variables stored as AES-256-GCM ciphertext               |
| `ApiRequestResult`                                   | runId, requestDefId, status, durationMs, sizeBytes, assertions (jsonb), redacted body excerpt                      |                                                                 |
| `AuditResult`                                        | runId, url, finalUrl, scores (jsonb), artifactPath                                                                 | big raw JSON goes on disk under `SYNAPSE_DATA_DIR`, not in rows |
| `TestCaseResult`                                     | runId, suite, name, caseKey, status, durationMs, failureMessage                                                    | index `(caseKey, createdAt)` for history and flakiness          |
| `AiExplanation`                                      | findingId, model, prompt hash, text, createdAt                                                                     | only when AI enabled                                            |

Enums are Postgres enums. Foreign keys use `ON DELETE CASCADE` from `Project`
downward, so deleting a project removes its history. Timestamps are `timestamptz`.

## 5. Worker — `apps/worker`

- pg-boss consumers (`boss.work`), one queue per capability, created as each
  capability lands: `maintenance` (Phase 2), `code-analysis`, `api-test`,
  then later `site-audit`, `test-import`, and `ai-explain`.
- **Job payloads hold IDs only.** The worker loads inputs from the app tables,
  so payloads stay small and no secrets are written to the queue tables.
- **Queue schema ownership:** pg-boss creates and migrates its own `pgboss`
  schema at `boss.start()`. Prisma owns `public` only. Prisma migrations never
  touch `pgboss`, and pg-boss never touches `public`. The `synapse` role owns
  the database, so it can create the schema without superuser rights.
- **Transactional enqueue:** the API can create the `Run` row and enqueue its
  job atomically (pg-boss can join an existing transaction). That's a
  consistency gain over a queue in a separate datastore.
- State machine: the API creates `Run(status=queued)` and enqueues a job with
  `singletonKey = runId`. The worker sets `running`, does the work, writes
  results inside a transaction, then sets `succeeded` or `failed`. Progress is
  stored on the `Run` row, and the UI polls it (SSE may come later).
- Heavy or untrusted work runs in **child processes**:
  Lighthouse/Chromium, Playwright, and analyzers (with `--max-old-space-size`).
  Each has a wall-clock timeout, its output is size-capped, and it is killed on
  cancel or timeout.
- Concurrency is per queue (default 2). Browser jobs are limited to 1. pg-boss
  handles retries (`retryLimit`, `retryDelay`, backoff) and job expiry
  (`expireInSeconds`), aligned with `SYNAPSE_JOB_TIMEOUT_MS`.
- Idempotency: one job per Run (`singletonKey`), and a retried job first clears
  the Run's partial results.

### 5.1 Egress guard — `packages/net-guard`

All outbound HTTP made on a user's behalf goes through one module.

1. Parse and normalize the URL (WHATWG URL). Only `http:` and `https:` are
   allowed, credentials in the URL are rejected, and the port is checked.
2. Resolve DNS **once**. Classify **every** returned address (IPv4, IPv6, and
   IPv4-mapped IPv6) with `ipaddr.js`. Loopback, private, link-local (including
   `169.254.169.254`), CGNAT, multicast, unspecified, and reserved ranges are
   denied unless the origin is in the project's `ApiTarget` allowlist.
3. **Pin** the connection to the validated IP using an undici `Agent` with a
   custom `connect.lookup`. This defeats DNS rebinding between check and use.
4. Follow redirects **manually** (`redirect: 'manual'`), re-running steps 1–3 for
   each hop, up to `SYNAPSE_HTTP_MAX_REDIRECTS`.
5. Enforce the timeout and stream the body with a byte cap.

**Browser-based audits** can't pin DNS inside Chromium. Instead, the worker
starts a per-job **filtering HTTP(S) proxy** (CONNECT-aware) that applies the
same policy, and launches Chromium with `--proxy-server=<proxy>`,
`--proxy-bypass-list=<-loopback>`, `--disable-quic`, and
`--force-webrtc-ip-handling-policy=disable_non_proxied_udp`. Playwright
additionally checks each request with `page.route`. The Chromium sandbox stays
**on**.

## 6. CLI — `apps/cli` (Phase 3b)

A web page can't read arbitrary folders, and the API shouldn't read paths a
browser sends it. So code analysis follows a **push model**:

```
synapse login --server http://127.0.0.1:4000     # stores a personal access token
synapse analyze ./my-project --project my-app    # runs analyzers locally, uploads results
synapse import-tests ./junit.xml --project my-app
```

- The CLI runs the shared `packages/analyzers` locally against the folder, then
  POSTs a **validated results document** (findings and metrics, without source
  files) to `/api/v1/ingest/...`.
- Default mode never executes project code: SYNAPSE's own ESLint ruleset, the
  TypeScript compiler API (which loads no plugins), and AST-based metrics. The
  `--use-project-eslint-config` flag is opt-in and prints a warning.
- The server re-validates every ingested payload with Zod, applying size caps
  and per-field length limits.
- _Alternative considered:_ the worker reads from allowlisted `WORKSPACE_ROOTS`.
  It was rejected for v1 because it turns the API into a path-addressable file
  reader. It could be added later as an opt-in setting.

## 7. Optional AI — `packages/ai`

- A `ExplanationProvider` interface with `NoopProvider` (default) and
  `OllamaProvider` (local HTTP at `127.0.0.1:11434`).
- Only the worker calls the provider, through the `ai-explain` queue. Prompts
  carry the finding plus a bounded excerpt, treat that excerpt as untrusted data,
  and are never given tools.
- Output is stored and displayed as plain text or sanitized Markdown, labelled
  "AI-generated". There's no auto-apply path. A future "suggest fix" feature
  produces a diff the user must review and apply themselves.

## 8. Cross-cutting packages

| Package                                                                             | Responsibility                                                                                                             |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts`                                                                | Zod schemas for API DTOs, job payloads, the ingest document, and error codes. Imported by web, api, worker, and cli.       |
| `packages/config`                                                                   | Loads `.env` and validates the environment with Zod at startup. Fails fast with a clear message and never logs values.     |
| `packages/logger`                                                                   | pino factory with standard redact paths (`authorization`, `cookie`, `set-cookie`, `*.password`, `*.token`, `*.secret`, …). |
| `packages/db`                                                                       | Prisma schema, migrations, client factory, and test helpers.                                                               |
| `packages/queue`                                                                    | pg-boss factory, queue names, and typed send/work helpers (payload schemas from `contracts`).                              |
| `packages/net-guard`                                                                | URL validation, IP classification, pinned fetch, filtering proxy.                                                          |
| `packages/analyzers`                                                                | Code-analysis engines shared by the CLI and worker (Phase 3b).                                                             |
| `packages/ai`                                                                       | Provider interface plus the Ollama adapter (Phase 9).                                                                      |
| Shared compiler, lint, format, and test settings live at the repo root              |
| (`tsconfig.base.json`, `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`)  |
| rather than in separate config packages. That's the same effect with less ceremony. |

Packages are created **in the phase that first needs them**, not up front.

## 9. Runtime and build

- Node.js 24 LTS. TypeScript **6.0.x** (pinned; typescript-eslint requires
  `<6.1.0`, see ADR-0008).
- SYNAPSE is MIT-licensed (ADR-0013).
- **Internal packages are source-only.** Each `package.json` `exports` points
  at `src/index.ts`, so there's no per-package build step. The apps run under
  `tsx` (`pnpm dev` runs the API and worker with `tsx watch`). Type checking is
  `tsc --noEmit` per package. A bundled production build (e.g. with esbuild) is
  deferred to the hardening phase, and `vite build` will cover the web app.
- Logs are JSON to stdout, piped through `pino-pretty` in development.
