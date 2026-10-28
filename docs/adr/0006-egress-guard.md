# ADR-0006: Centralized egress guard

Status: Accepted · 2026-10-28

## Context

API testing and site audits make requests to user-supplied URLs from the
user's machine. That machine has a privileged network position (router, local
services, cloud metadata on VMs). SSRF, DNS rebinding, and redirect tricks are
the main risks.

## Decision

All outbound requests made on a user's behalf go through `packages/net-guard`:

1. WHATWG parsing, then scheme, port, and credential checks.
2. Resolve once and classify **all** addresses with `ipaddr.js`, denying
   non-public ranges.
3. **Pin** the connection to the validated IP (undici `connect.lookup`).
4. Follow redirects manually, re-validating each hop.
5. Enforce time and byte caps.

Local development targets are allowed only through an explicit per-project
allowlist stored in the DB. Chromium-based audits route all traffic through a
per-job filtering proxy that applies the same policy, with QUIC disabled and
non-proxied UDP blocked.

## Consequences

- \+ One reviewed, heavily tested choke point.
- − The proxy is non-trivial code. Some sites may behave differently through it.
- − Chromium bypass paths are a residual risk (threat model T5). They're tested
  with a canary server.

## Alternatives

- Hostname blocklists: bypassable.
- Validating without pinning: vulnerable to rebinding.
- Allowing everything with a warning: unsafe by default.
