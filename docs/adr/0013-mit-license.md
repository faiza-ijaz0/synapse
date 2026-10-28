# ADR-0013: License SYNAPSE under MIT

Status: **Accepted** · 2026-10-28

## Decision

SYNAPSE's own source code is released under the MIT License (`LICENSE` at the
repo root, `"license": "MIT"` in every workspace `package.json`).

## Third-party obligations

- MIT, ISC, BSD, and Apache-2.0 dependencies: keep their copyright and license
  notices. npm packages ship their own `LICENSE` files, and SYNAPSE doesn't strip them.
- Apache-2.0 (Prisma, TypeScript, Playwright, Lighthouse, …): keep any `NOTICE`
  files if SYNAPSE ever redistributes bundled copies.
- MPL-2.0 (axe-core): used unmodified. If axe-core source files are ever
  modified, those files must stay under MPL-2.0 and be published.
- `pnpm licenses list` runs in CI against the allowlist in doc 06. Adding a
  dependency outside the allowlist needs a new ADR.
- Choosing MIT for SYNAPSE doesn't relicense any dependency.
