# 07 — Environment Variables

Status: **Approved** 2026-10-28 · revised for Phase 2

- The template is `.env.example` (committed, with no real values). The real
  values go in `.env` (git-ignored).
- `packages/config` validates every variable with Zod at process start. Invalid
  or missing **required** values stop the process with an error that names the
  variable and **never prints its value**.
- Secret variables (🔒) are never logged and never passed into job payloads.

| Variable                            | Used by         | Required                            | Default                  | Description                                                                                                                                                                                     |
| ----------------------------------- | --------------- | ----------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | all             | no                                  | `development`            | `development` \| `test` \| `production`                                                                                                                                                         |
| `LOG_LEVEL`                         | all             | no                                  | `info`                   | pino level                                                                                                                                                                                      |
| `SYNAPSE_API_HOST`                  | api             | no                                  | `127.0.0.1`              | Bind address. Changing it to a non-loopback address is unsupported (threat model A2).                                                                                                           |
| `SYNAPSE_API_PORT`                  | api             | no                                  | `4000`                   |                                                                                                                                                                                                 |
| `SYNAPSE_WEB_ORIGIN`                | api             | no                                  | `http://localhost:5173`  | Allowed `Origin` and CORS origin. Also feeds the `Host` allowlist.                                                                                                                              |
| 🔒 `SYNAPSE_SESSION_SECRET`         | api             | **yes, from Phase 3 (auth)**        | —                        | ≥ 32 random bytes, base64. Signs session cookies.                                                                                                                                               |
| 🔒 `SYNAPSE_ENCRYPTION_KEY`         | api, worker     | **yes, from Phase 4 (API testing)** | —                        | Exactly 32 random bytes, base64. AES-256-GCM key for stored API-test secrets. **Losing it makes stored secrets unrecoverable.**                                                                 |
| 🔒 `DATABASE_URL`                   | api, worker, db | **yes**                             | —                        | `postgresql://synapse:<pw>@127.0.0.1:5432/synapse?schema=public`                                                                                                                                |
| 🔒 `DATABASE_URL_TEST`              | tests           | for integration tests               | —                        | A separate database, truncated between test files. The test helpers **refuse to run** unless its database name ends in `_test`.                                                                 |
| `SYNAPSE_REQUIRE_INTEGRATION_TESTS` | tests           | no                                  | unset (`0`)              | `1` makes `pnpm test` fail if `DATABASE_URL_TEST` is missing or any `*.int.test.ts` test doesn't run and pass. Set by the ubuntu CI job. Values other than `1`/`true`/`0`/`false` are rejected. |
| `SYNAPSE_QUEUE_SCHEMA`              | api, worker     | no                                  | `pgboss`                 | Postgres schema that pg-boss creates and migrates in the `DATABASE_URL` database. Must be a plain lowercase identifier.                                                                         |
| `SYNAPSE_WORKER_CONCURRENCY`        | worker          | no                                  | `2`                      | Per queue. Browser queues are capped at 1.                                                                                                                                                      |
| `SYNAPSE_JOB_TIMEOUT_MS`            | worker          | no                                  | `300000`                 | Hard wall-clock limit per job.                                                                                                                                                                  |
| `SYNAPSE_HTTP_TIMEOUT_MS`           | worker          | no                                  | `15000`                  | Per outbound request.                                                                                                                                                                           |
| `SYNAPSE_HTTP_MAX_RESPONSE_BYTES`   | worker          | no                                  | `5242880` (5 MiB)        | The body stream is aborted beyond this.                                                                                                                                                         |
| `SYNAPSE_HTTP_MAX_REDIRECTS`        | worker          | no                                  | `5`                      |                                                                                                                                                                                                 |
| `SYNAPSE_DATA_DIR`                  | api, worker     | no                                  | `./.synapse-data`        | Raw audit JSON and uploaded reports. Git-ignored.                                                                                                                                               |
| `SYNAPSE_MAX_UPLOAD_BYTES`          | api             | no                                  | `20971520` (20 MiB)      |                                                                                                                                                                                                 |
| `SYNAPSE_AI_PROVIDER`               | worker          | no                                  | `none`                   | `none` \| `ollama`                                                                                                                                                                              |
| `SYNAPSE_OLLAMA_URL`                | worker          | if ollama                           | `http://127.0.0.1:11434` | Must be loopback.                                                                                                                                                                               |
| `SYNAPSE_OLLAMA_MODEL`              | worker          | if ollama                           | —                        | e.g. a locally pulled model tag.                                                                                                                                                                |

**Not configured by env, on purpose:** the allowlist of local dev targets lives
in the database per project (`ApiTarget`). That makes it visible and editable in
the UI, and auditable, rather than a global switch that turns SSRF protection off.

## Generating secrets (PowerShell or any shell with Node)

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Run it once for each secret and paste the output into `.env`. Don't paste
secrets into issues, logs, or chat.
