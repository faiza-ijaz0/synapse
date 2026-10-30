# ADR-0014: Browser origin and CSRF strategy

Status: **Accepted** · 2026-10-30 · Amended 2026-10-30 (M1, see below) · Refines [ADR-0009](0009-local-auth.md) and [ADR-0005](0005-spa-frontend.md)

## Context

Phase 2 defaulted `SYNAPSE_WEB_ORIGIN` to `http://localhost:5173`, the usual
Vite port. On the owner's machine, another local project (PulseDesk) already
runs its web dev server on `localhost:5173` and its API on `localhost:4000`.
The Phase 2 default would have made SYNAPSE trust another application's origin.

Two browser rules make this worse than a port clash:

- **Cookies are scoped by host, not port.** A cookie for `localhost` is sent to
  `localhost:4000`, `localhost:4100`, and `localhost:5173` alike, and any of
  them can overwrite it.
- **`SameSite` compares sites, and a site ignores the port.** `localhost:5173`
  and `localhost:4100` are the _same site_, so `SameSite=Strict` doesn't stop a
  page on another `localhost` port from sending the SYNAPSE session cookie.

So `SameSite` and `Host` checks alone can't separate SYNAPSE from other local
dev servers. The `Origin` header does include the port.

## Decision

1. **Canonical address.** SYNAPSE is used at `http://127.0.0.1:<SYNAPSE_API_PORT>`,
   not `localhost`. Its cookies then live in a separate cookie jar from every
   `localhost:*` page, and those pages count as cross-site, so `SameSite=Strict`
   applies to them. On the owner's machine the port is `4100`, set with
   `SYNAPSE_API_PORT` in `.env`. The code default stays `4000`.
2. **Default web origin.** `SYNAPSE_WEB_ORIGIN` defaults to the API's own
   origin, `http://127.0.0.1:<SYNAPSE_API_PORT>`, derived from the port. An
   explicit value must be an exact loopback origin (`127.0.0.1` or `[::1]`;
   `localhost` is rejected, see the amendment) with a port and no path.
   Wildcards are rejected. SYNAPSE never trusts another application's origin,
   including `localhost:5173`.
3. **Phase 5 frontend.** In development, the Vite dev server runs on its own
   pinned port on `127.0.0.1` (`strictPort`) and proxies `/api`, and
   `SYNAPSE_WEB_ORIGIN` is set to that origin. In production mode, the API
   serves the built SPA from its own origin (ADR-0005). Either way there is
   **no CORS**: the API sends no `Access-Control-*` headers.
4. **`Host` allowlist.** `127.0.0.1`, `localhost`, and `[::1]` on the API port,
   plus the host of `SYNAPSE_WEB_ORIGIN`. Nothing else, which defeats DNS
   rebinding (threat model T1).
5. **CSRF defense for cookie-authenticated, state-changing requests**
   (`POST`, `PUT`, `PATCH`, `DELETE`). All of these must hold:
   - `Origin` is present and exactly equals `SYNAPSE_WEB_ORIGIN`. A missing
     `Origin` is rejected for cookie authentication.
   - `Sec-Fetch-Site`, when the browser sends it, is `same-origin`.
   - The request carries the custom header `X-Synapse-CSRF: 1`. Cross-origin,
     a custom header forces a CORS preflight, which fails because the API
     answers no CORS.
6. **Bearer-token requests** (the CLI) don't need `Origin`. A web page can't
   attach an `Authorization` header cross-origin without a preflight, which fails.
7. **Safe methods stay safe.** `GET`, `HEAD`, and `OPTIONS` never change state.
   Responses to authentication endpoints are `Cache-Control: no-store`.

## Consequences

- \+ SYNAPSE is isolated from other local dev servers by cookie jar, by site,
  and by exact `Origin`, each independently.
- \+ The same rules work unchanged when the Phase 5 SPA arrives, in both its
  development and production modes.
- \+ No CSRF token state to store or rotate.
- − Opening SYNAPSE at `http://localhost:<port>` still passes the `Host` check,
  but cookie-authenticated writes from that origin always fail the `Origin`
  check, because `SYNAPSE_WEB_ORIGIN` can't name a `localhost` origin. The
  documented address is `127.0.0.1`.
- − Other applications served from `127.0.0.1` on other ports are still the
  same site. The exact `Origin` check is what stops them.

## Amendment — 2026-10-30 (M1)

Owner decisions R1 and R2, approved during the M1 configuration review:

- **R1.** `SYNAPSE_WEB_ORIGIN` accepts only `127.0.0.1` and `[::1]`. `localhost`
  is rejected: a `localhost` origin shares its cookie jar and site with every
  other `localhost` app, and rejecting it turns the old template value
  (`http://localhost:5173`) into a startup error instead of silent trust.
- **R2.** `SYNAPSE_API_HOST` must be exactly `127.0.0.1`, so the derived default
  origin always matches the address the API binds to.

The validation rules are listed in doc 07.

## Alternatives

- **Keep trusting `localhost:5173`:** rejected. It's another project's origin
  on this machine, and a common default for any Vite app.
- **CORS with credentials for a separate frontend origin:** rejected. More
  configuration and attack surface than a same-origin proxy (ADR-0005).
- **Synchronizer CSRF tokens:** unnecessary given exact `Origin`, the custom
  header, and `SameSite=Strict`, and they add server state.
- **`__Host-` cookie prefix:** requires `Secure`, and browsers don't treat
  plain-HTTP `127.0.0.1` consistently as a secure context. Reconsider if
  SYNAPSE is ever served over HTTPS.
- **Changing the code default port to `4100`:** rejected. The clash is specific
  to this machine, so the port belongs in `.env`.
