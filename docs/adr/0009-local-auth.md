# ADR-0009: Local single-user authentication

Status: Accepted · 2026-10-28

## Decision

- The first-run setup creates the only user. The password is hashed with
  `node:crypto.scrypt` (built-in, so there are no native build tools on Windows).
- Browser: server-side sessions in Postgres. An opaque random cookie
  (`HttpOnly; SameSite=Strict`) stores only the session ID; the DB stores its hash.
- CLI: personal access tokens (random, shown once, SHA-256 hashed, scoped to
  `ingest`, revocable).
- Every request: the `Host` header must match the allowlist. State-changing
  requests also need `Origin` to equal `SYNAPSE_WEB_ORIGIN`.

## Rationale

Even on localhost, a hostile website in the same browser can send requests to
the API (CSRF), and DNS rebinding can read responses. "It's local" isn't an
authentication strategy.

## Alternatives

- No auth: unsafe because of drive-by attacks.
- JWTs: no revocation, and no benefit for one user.
- OAuth or an external IdP: requires external services.
