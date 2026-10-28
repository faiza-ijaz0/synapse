# 03 — Threat Model (initial)

Status: **Approved** 2026-10-28 · revised for Phase 2 · Revisit at the start of every phase.

## 1. Scope and assumptions

- **A1** SYNAPSE runs on a single developer machine, used by its owner. The OS
  account is trusted. Malware already running as that user is out of scope.
- **A2** The API binds to `127.0.0.1`. Exposing it on a network is unsupported in v1.
- **A3** The things SYNAPSE _looks at_ are **untrusted**: websites, API
  responses, source trees, test reports, and model output.
- **A4** Other websites open in the user's browser are **hostile** and can make
  requests to `localhost`.
- **A5** Dependencies are trusted only to the degree that the lockfile and
  review allow. Supply chain risk is real (T13).

## 2. Assets

User password and sessions · CLI access tokens · stored API-test secrets
(tokens, cookies, keys) · the user's source code (confidentiality) · the
integrity of the local network and services reachable from the machine ·
integrity of stored results · machine resources.

## 3. Trust boundaries

1. Browser (other origins) → SYNAPSE API
2. SYNAPSE web UI → API
3. CLI → API (`/ingest`)
4. API → Postgres / queue
5. Worker → **outbound network** (Internet _and_ local network)
6. Worker → child processes (Chromium, Lighthouse, analyzers)
7. Worker → local model (Ollama)

## 4. Threats and mitigations

| ID      | Threat                                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                                                                                                    | Residual risk                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **T1**  | A malicious website the user visits sends requests to `http://localhost:4000` (CSRF), or uses **DNS rebinding** to read API responses.                       | API bound to loopback. `Host` header allowlist (`localhost:<port>`, `127.0.0.1:<port>`), which rejects rebinding hostnames. `Origin` must equal `SYNAPSE_WEB_ORIGIN` on non-GET requests. Cookie is `SameSite=Strict; HttpOnly`. No wildcard CORS. Authentication is required for every endpoint except setup and login.                      | Low. A browser bug that bypasses the SameSite or Origin semantics.                                                    |
| **T2**  | **SSRF**: an audit or API test targets internal services, cloud metadata (`169.254.169.254`), or the router admin page.                                      | `net-guard` (architecture §5.1). Resolved IPs are classified. Private, loopback, link-local, and reserved ranges are denied unless explicitly allowlisted per project. Only http(s) schemes, with a port policy.                                                                                                                              | Medium until the SSRF corpus tests exist (Phase 3 exit criterion).                                                    |
| **T3**  | **DNS rebinding against the guard** (time-of-check/time-of-use): a hostname resolves to a public IP at check time and a private IP at connect time.          | The validated IP is pinned for the connection with an undici `connect.lookup` override.                                                                                                                                                                                                                                                       | Low.                                                                                                                  |
| **T4**  | **Redirect to an internal host.**                                                                                                                            | Redirects are followed manually and each hop is re-validated, with a hop limit.                                                                                                                                                                                                                                                               | Low.                                                                                                                  |
| **T5**  | **SSRF through Chromium**: page subresources, JS `fetch`, WebSocket, WebRTC, or QUIC reaching internal addresses during an audit.                            | A per-job filtering proxy covers all Chromium traffic, along with `--disable-quic`, a WebRTC policy that forbids non-proxied UDP, and a Playwright `page.route` check. A fresh profile is used for each job.                                                                                                                                  | Medium. Chromium features that bypass the proxy. This needs E2E tests with an internal canary server.                 |
| **T6**  | A malicious page **exploits Chromium**.                                                                                                                      | Chromium sandbox enabled (never `--no-sandbox`), headless, a throwaway profile, a separate process with a timeout, and Playwright/Chromium kept current.                                                                                                                                                                                      | Medium. Browser 0-days are outside our control.                                                                       |
| **T7**  | **Analyzing code executes it**: ESLint flat configs and plugins are JavaScript, `npm install` runs lifecycle scripts, and TS language-service plugins exist. | By default SYNAPSE uses its own ESLint config and never loads the target's config or plugins. It never installs the target's dependencies. TypeScript is used via the compiler API only (no plugins). Analysis runs in the CLI on the owner's machine, against code they chose. Executing the project's own config is opt-in, with a warning. | Low by default. In opt-in mode it's equivalent to the user running `eslint` themselves.                               |
| **T8**  | **Malicious analysis inputs**: huge files, deep ASTs, symlinks escaping the root, zip-slip.                                                                  | File count and size caps, depth limits, and the analyzer runs in a child process with memory and time limits. Symlinks aren't followed outside the root. There's no archive extraction in v1 (push model).                                                                                                                                    | Low.                                                                                                                  |
| **T9**  | **Malicious uploaded reports**: XML bombs, XXE, oversized JSON.                                                                                              | Upload size cap. `fast-xml-parser` (it doesn't resolve external entities) with entity processing disabled, and parsing happens in the worker, not the API. Zod validation follows.                                                                                                                                                            | Low.                                                                                                                  |
| **T10** | **Stored XSS**: response bodies, finding messages, page titles, or AI text rendered in the UI.                                                               | React's text escaping, a lint ban on `dangerouslySetInnerHTML`, and a strict CSP via helmet (no inline scripts). Raw Lighthouse HTML is never served from the app origin.                                                                                                                                                                     | Low.                                                                                                                  |
| **T11** | **Secret leakage**: API-test credentials appearing in logs, job payloads, history, or exports.                                                               | Secrets encrypted at rest (AES-256-GCM, key in `SYNAPSE_ENCRYPTION_KEY`). Job payloads carry IDs only. pino redaction paths. Response and header excerpts are redacted (`Authorization`, `Cookie`, `Set-Cookie`, `*-api-key`, token-like patterns) before storage. Exports are redacted.                                                      | Medium. Secrets inside arbitrary response bodies can't be fully detected. Bodies are stored only as bounded excerpts. |
| **T12** | **Resource exhaustion**: many jobs, slow targets, giant responses.                                                                                           | Per-queue concurrency, per-job timeout, response byte caps, body-size limits on the API, a rate limit on auth endpoints, and cancellation support.                                                                                                                                                                                            | Low.                                                                                                                  |
| **T13** | **Supply chain**: a malicious or compromised npm package.                                                                                                    | Committed lockfile. pnpm blocks dependency lifecycle scripts unless they're allowlisted. Use pnpm's `minimumReleaseAge` to avoid freshly published versions. Run `pnpm audit` in CI. Keep the dependency count small (doc 06). Dependabot (free) for updates.                                                                                 | Medium. Inherent to the npm ecosystem.                                                                                |
| **T14** | **CLI token theft.**                                                                                                                                         | Tokens are hashed in the DB, scoped to `ingest`, revocable, and show last-used time. The CLI stores the token in the user's config dir.                                                                                                                                                                                                       | Medium on Windows, since file ACLs inherit the user profile. This is documented.                                      |
| **T15** | **Prompt injection** via analyzed content steering AI explanations.                                                                                          | The model has no tools, no network, and no write access. Its output is display-only and labelled. Code changes are never auto-applied (they'd require review of an explicit diff).                                                                                                                                                            | Low impact. The output may be misleading, so the UI says so.                                                          |
| **T16** | **Database (and therefore the queue) exposed on the network.**                                                                                               | The queue lives in PostgreSQL (pg-boss), so there's no separate queue service to expose. **PostgreSQL was observed listening on `0.0.0.0:5432` and `[::]:5432`.** The documented manual fix binds it to localhost (doc 09 §3). The app uses a least-privilege role with a strong password.                                                    | **Open until the owner applies doc 09 §3.**                                                                           |
| **T17** | Brute-forcing the local password.                                                                                                                            | scrypt hashing, rate limiting with backoff on login, and a generic error message.                                                                                                                                                                                                                                                             | Low.                                                                                                                  |

## 5. Findings from the Phase 1 environment inspection

- **PostgreSQL 17 is listening on all interfaces** (`0.0.0.0:5432`, `[::]:5432`).
  Remote access is then governed only by `pg_hba.conf` and Windows Firewall.
  **The owner approved recommending localhost-only binding.** The safe manual
  procedure (backup, edit, `pg_hba.conf` review, service restart, verification,
  and rollback) is in doc 09 §3. SYNAPSE never changes system configuration or
  services itself.
- A Redis-compatible server is no longer part of the stack (ADR-0012). Memurai
  is still installed on this machine (loopback-only), but SYNAPSE doesn't use it.

## 6. Known limitations (documented, not hidden)

- SYNAPSE can't make it safe to audit a page whose purpose is to exploit Chromium.
  It reduces the impact (sandbox, throwaway profile) but doesn't eliminate it.
- "Local dev target" allowlisting deliberately lets SYNAPSE reach local
  services. Allowlisted origins are trusted by the user's choice.
- Single-user design: anyone with the OS account, or the password, has full access.
