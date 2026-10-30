# 07 — Environment Variables

Status: **Approved** 2026-10-28 · revised for Phase 2 · revised 2026-10-30 for Phase 3a

- The template is `.env.example` (committed, with no real values). The real
  values go in `.env` (git-ignored).
- `packages/config` validates every variable with Zod at process start. Invalid
  or missing **required** values stop the process with an error that names the
  variable and **never prints its value**.
- Secret variables (🔒) are never logged and never passed into job payloads.

| Variable                            | Used by         | Required                            | Default                               | Description                                                                                                                                                                                                                                                                                         |
| ----------------------------------- | --------------- | ----------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                          | all             | no                                  | `development`                         | `development` \| `test` \| `production`                                                                                                                                                                                                                                                             |
| `LOG_LEVEL`                         | all             | no                                  | `info`                                | pino level                                                                                                                                                                                                                                                                                          |
| `SYNAPSE_API_HOST`                  | api             | no                                  | `127.0.0.1`                           | Bind address. Must be exactly `127.0.0.1`; `localhost`, `::1`, and every other value are rejected (threat model A2, ADR-0014).                                                                                                                                                                      |
| `SYNAPSE_API_PORT`                  | api             | no                                  | `4000`                                | Loopback port of the API. Set it in `.env` if another local app uses the default; on the owner's machine it's `4100` (ADR-0014). If the port is taken at startup, the API exits with a one-line message (doc 09 §7).                                                                                |
| `SYNAPSE_WEB_ORIGIN`                | api             | no                                  | `http://127.0.0.1:<SYNAPSE_API_PORT>` | The only browser origin the API trusts; normally leave it unset. Cookie-authenticated state-changing requests need an exact `Origin` match, and its host joins the `Host` allowlist. Set it only for the Phase 5 Vite dev server on its own pinned port. Rules below. No CORS is served (ADR-0014). |
| 🔒 `SYNAPSE_SESSION_SECRET`         | api             | **yes, from Phase 3a (auth)**       | —                                     | Standard base64 of 32–1024 random bytes. HMAC-SHA256 key for the stored session IDs, so the DB never holds a usable cookie value. Rotating it ends every browser session; CLI tokens aren't affected (ADR-0009 amendment). Rules below. The worker doesn't use it.                                  |
| 🔒 `SYNAPSE_ENCRYPTION_KEY`         | api, worker     | **yes, from Phase 4 (API testing)** | —                                     | Exactly 32 random bytes, base64. AES-256-GCM key for stored API-test secrets. **Losing it makes stored secrets unrecoverable.**                                                                                                                                                                     |
| 🔒 `DATABASE_URL`                   | api, worker, db | **yes**                             | —                                     | `postgresql://synapse:<pw>@127.0.0.1:5432/synapse?schema=public`                                                                                                                                                                                                                                    |
| 🔒 `DATABASE_URL_TEST`              | tests           | for integration tests               | —                                     | A separate database, truncated between test files. The test helpers **refuse to run** unless its database name ends in `_test`.                                                                                                                                                                     |
| `SYNAPSE_REQUIRE_INTEGRATION_TESTS` | tests           | no                                  | unset (`0`)                           | `1` makes `pnpm test` fail if `DATABASE_URL_TEST` is missing or any `*.int.test.ts` test doesn't run and pass. Set by the ubuntu CI job. Values other than `1`/`true`/`0`/`false` are rejected.                                                                                                     |
| `SYNAPSE_QUEUE_SCHEMA`              | api, worker     | no                                  | `pgboss`                              | Postgres schema that pg-boss creates and migrates in the `DATABASE_URL` database. Must be a plain lowercase identifier.                                                                                                                                                                             |
| `SYNAPSE_WORKER_CONCURRENCY`        | worker          | no                                  | `2`                                   | Per queue. Browser queues are capped at 1.                                                                                                                                                                                                                                                          |
| `SYNAPSE_JOB_TIMEOUT_MS`            | worker          | no                                  | `300000`                              | Hard wall-clock limit per job.                                                                                                                                                                                                                                                                      |
| `SYNAPSE_HTTP_TIMEOUT_MS`           | worker          | no                                  | `15000`                               | Per outbound request.                                                                                                                                                                                                                                                                               |
| `SYNAPSE_HTTP_MAX_RESPONSE_BYTES`   | worker          | no                                  | `5242880` (5 MiB)                     | The body stream is aborted beyond this.                                                                                                                                                                                                                                                             |
| `SYNAPSE_HTTP_MAX_REDIRECTS`        | worker          | no                                  | `5`                                   |                                                                                                                                                                                                                                                                                                     |
| `SYNAPSE_DATA_DIR`                  | api, worker     | no                                  | `./.synapse-data`                     | Raw audit JSON and uploaded reports. Git-ignored.                                                                                                                                                                                                                                                   |
| `SYNAPSE_MAX_UPLOAD_BYTES`          | api             | no                                  | `20971520` (20 MiB)                   |                                                                                                                                                                                                                                                                                                     |
| `SYNAPSE_AI_PROVIDER`               | worker          | no                                  | `none`                                | `none` \| `ollama`                                                                                                                                                                                                                                                                                  |
| `SYNAPSE_OLLAMA_URL`                | worker          | if ollama                           | `http://127.0.0.1:11434`              | Must be loopback.                                                                                                                                                                                                                                                                                   |
| `SYNAPSE_OLLAMA_MODEL`              | worker          | if ollama                           | —                                     | e.g. a locally pulled model tag.                                                                                                                                                                                                                                                                    |

### Validation rules for the API's security settings

`SYNAPSE_SESSION_SECRET` is rejected, with a fixed message that never contains
the value or anything derived from it, when it:

- is missing or empty;
- contains whitespace anywhere;
- isn't standard base64 (`A–Z a–z 0–9 + /` with `=` padding, length a multiple
  of 4). base64url (`-`, `_`) is rejected;
- isn't canonical, meaning decoding and re-encoding it gives a different string
  (wrong padding bits);
- decodes to fewer than 32 or more than 1024 bytes;
- decodes to fewer than 16 distinct byte values, a sign it was typed by hand.

Once accepted, it's held as a `SecretValue`, whose string, JSON, and inspect
forms are all `[REDACTED]`.

`SYNAPSE_WEB_ORIGIN`, when set, must be an exact origin: `http` or `https`,
host `127.0.0.1` or `[::1]`, an explicit port, and nothing else (no path other
than `/`, query, fragment, or credentials). `localhost` is rejected because its
cookies and site are shared with every other `localhost` app (ADR-0014). The
accepted value is normalized, e.g. `HTTP://127.0.0.1:5180/` becomes
`http://127.0.0.1:5180`. Because the port must be explicit, the default ports
(`:80`, `:443`) can't be used.

**Not configured by env, on purpose:** the allowlist of local dev targets lives
in the database per project (`ApiTarget`). That makes it visible and editable in
the UI, and auditable, rather than a global switch that turns SSRF protection off.

## Generating secrets (PowerShell or any shell with Node)

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Run it once for each secret and paste the output into `.env`. Don't paste
secrets into issues, logs, or chat.

For `SYNAPSE_SESSION_SECRET`, prefer the PowerShell snippet in doc 09 §4. It
writes the value straight into `.env` and never displays it.

To log out every browser session, replace `SYNAPSE_SESSION_SECRET` with a new
value and restart the API.
