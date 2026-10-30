# ADR-0009: Local single-user authentication

Status: Accepted · 2026-10-28 · Amended 2026-10-30 (Phase 3a, see below)

## Decision

- The first-run setup creates the only user. The password is hashed with
  `node:crypto.scrypt` (built-in, so there are no native build tools on Windows).
- Browser: server-side sessions in Postgres. An opaque random cookie
  (`HttpOnly; SameSite=Strict`) stores only the session ID; the DB stores its hash.
- CLI: personal access tokens (random, shown once, SHA-256 hashed, scoped to
  `ingest`, revocable).
- Every request: the `Host` header must match the allowlist. State-changing
  requests also need `Origin` to equal `SYNAPSE_WEB_ORIGIN`.

## Amendment — 2026-10-30 (Phase 3a)

Owner decisions D2–D7, approved before Phase 3a implementation. Where they
differ from the Decision above, they take precedence.

- **Setup code (D3).** First-run setup also requires a one-time setup code.
  The API prints it to its console at startup while no user exists. It's kept
  only in memory and is invalidated once used. This defends against setup
  hijacking (threat model T18).
- **Session IDs (D4).** The DB stores `HMAC-SHA256(SYNAPSE_SESSION_SECRET, session ID)`
  rather than a plain hash. Rotating `SYNAPSE_SESSION_SECRET` therefore
  invalidates every browser session at once, and serves as a deliberate
  "log out everywhere" switch.
- **CLI tokens (D4).** Unchanged: plain SHA-256. Rotating the session secret
  doesn't affect them.
- **Lifetimes (D6).** A session ends after 24 hours without activity, or
  7 days after login, whichever comes first. An access token expires after
  90 days by default. The maximum is 365 days.
- **Token names (D7).** `UNIQUE(user_id, name)` also covers revoked tokens, so a
  revoked token's name can't be reused. Creating a token with a taken name
  returns `CONFLICT`.
- **Rate limiting (D5).** Login and setup attempts are limited in memory, with
  backoff, without a new dependency. Counters reset when the API restarts,
  which is accepted: restarting it already requires access to the OS account.
- **Origin and CSRF (D2).** The browser origin, `Host` allowlist, and CSRF
  rules are specified in [ADR-0014](0014-browser-origin-and-csrf.md).

## Rationale

Even on localhost, a hostile website in the same browser can send requests to
the API (CSRF), and DNS rebinding can read responses. "It's local" isn't an
authentication strategy.

## Alternatives

- No auth: unsafe because of drive-by attacks.
- JWTs: no revocation, and no benefit for one user.
- OAuth or an external IdP: requires external services.
