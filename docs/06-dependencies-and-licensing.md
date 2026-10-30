# 06 — Dependencies and Licensing

Status: **Approved** 2026-10-28 · revised for Phase 2

## 1. Method

Each npm license and version below was checked against the npm registry on
2026-10-28 (`npm view <pkg> version license engines.node`). Software that isn't on
npm was checked against its on-disk license or EULA where installed. Phase 2
dependencies are now installed, and **`pnpm-lock.yaml` is authoritative** for
exact versions. Licenses are re-checked whenever a dependency is added or upgraded.

Accepted licenses: **MIT, ISC, BSD-2/3-Clause, 0BSD, Apache-2.0, Unlicense/CC0
(public domain), MPL-2.0** (file-level copyleft, which is fine for unmodified
use), and the PostgreSQL License. Anything else needs a recorded review (§5) or an ADR.

## 1a. Installed in Phase 2 (verified)

| Where             | Package                                          | Version                                                                    | License                                          |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------ |
| root (dev)        | typescript                                       | 6.0.3                                                                      | Apache-2.0                                       |
| root (dev)        | eslint / @eslint/js                              | 10.13.0 / 10.0.1                                                           | MIT                                              |
| root (dev)        | typescript-eslint                                | **8.72.0** (8.72.1 was blocked by `minimumReleaseAge`, published < 3 days) | MIT                                              |
| root (dev)        | eslint-config-prettier, globals, prettier        | 10.1.8, 17.13.0, 3.9.10                                                    | MIT                                              |
| root (dev)        | vitest, @types/node                              | 5.0.5, 24.19.2                                                             | MIT                                              |
| config, contracts | zod                                              | 4.6.7                                                                      | MIT                                              |
| logger            | pino                                             | 10.4.0                                                                     | MIT                                              |
| db                | @prisma/client, @prisma/adapter-pg, prisma (dev) | 7.10.1                                                                     | Apache-2.0                                       |
| queue             | pg-boss                                          | 12.38.0                                                                    | MIT (peer @opentelemetry/api 1.10.0: Apache-2.0) |
| api               | express, helmet, pino-http                       | 5.3.0, 8.3.0, 11.0.0                                                       | MIT                                              |
| api (dev)         | supertest, @types/supertest, @types/express      | 7.3.1, 7.2.1, 5.0.6                                                        | MIT                                              |
| api, worker (dev) | tsx                                              | 4.23.15                                                                    | MIT                                              |

`dotenv` is **not** a SYNAPSE dependency: Node's built-in `process.loadEnvFile` loads `.env`. (dotenv 17.4.2 appears in the lockfile only transitively, via `prisma` → `@prisma/config` → `c12`.)

**Blocked install scripts** (`allowBuilds` in `pnpm-workspace.yaml`, all set to
`false` after reading what they do): `prisma` (a Node version check),
`@prisma/engines` (downloads the schema engine, which the Prisma CLI fetches on
first use from Prisma's binaries CDN), and `esbuild` (validates a binary that pnpm
already installs from `@esbuild/win32-x64`).

**Production-tree license audit** (`pnpm licenses list --prod`, 2026-10-28):
183 MIT, 26 ISC, 21 Apache-2.0, 3 BSD-3-Clause, 1 BSD-2-Clause, 1 "MIT and ISC",
1 "(MIT OR CC0-1.0)", 2 Unlicense, and 1 **EPL-2.0** (see §5). CI lists these on
every run. Automatic enforcement against the allowlist is still to be added.

**SYNAPSE itself is MIT-licensed** (`LICENSE`, ADR-0013). Third-party notices
stay with their packages, and ADR-0013 lists the obligations.

## 2. System services

| Component                 | Version found                      | License                                                                       | Status / notes                                                                                                                                                                                                |
| ------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                   | 24.18.0 (installed)                | MIT                                                                           | ✅ LTS line                                                                                                                                                                                                   |
| pnpm                      | 11.21.0 (installed)                | MIT                                                                           | ✅                                                                                                                                                                                                            |
| Git                       | 2.46.2 (installed)                 | GPL-2.0 (a tool, not linked or distributed)                                   | ✅                                                                                                                                                                                                            |
| PostgreSQL                | 17.11 (installed, service running) | PostgreSQL License (permissive)                                               | ✅                                                                                                                                                                                                            |
| ~~Redis-protocol server~~ | —                                  | —                                                                             | **Removed from the stack** (ADR-0012). The queue runs on PostgreSQL via pg-boss. Memurai is still installed on this machine but isn't used. You can uninstall it whenever you like; SYNAPSE doesn't touch it. |
| Ollama (optional, P8)     | — (not installed)                  | MIT (per the project; verify on install). **Each model has its own license.** | Optional. Never required.                                                                                                                                                                                     |
| WSL                       | 2.7.14 (installed, **no distros**) | —                                                                             | Not needed for the native Windows setup.                                                                                                                                                                      |
| Docker                    | not installed                      | —                                                                             | Not required. Docker Desktop has commercial-use terms. Optional Compose files will name both Docker and Podman.                                                                                               |

## 3. npm packages (planned)

### Frontend (`apps/web`)

| Package                                           | Version checked | License    |
| ------------------------------------------------- | --------------- | ---------- |
| react, react-dom                                  | 19.3.1          | MIT        |
| vite                                              | 8.3.5           | MIT        |
| @vitejs/plugin-react                              | 6.1.2           | MIT        |
| tailwindcss, @tailwindcss/vite                    | 4.3.3           | MIT        |
| shadcn (CLI; components are copied into the repo) | 4.23.0          | MIT        |
| @radix-ui/* (e.g. react-dialog)                   | 1.3.1           | MIT        |
| class-variance-authority                          | 0.7.1           | Apache-2.0 |
| clsx                                              | 2.1.1           | MIT        |
| tailwind-merge                                    | 3.7.0           | MIT        |
| lucide-react                                      | 1.63.0          | ISC        |
| @tanstack/react-query                             | 5.105.0         | MIT        |
| react-hook-form                                   | 7.91.0          | MIT        |
| @hookform/resolvers                               | 6.0.2           | MIT        |
| recharts                                          | 3.10.1          | MIT        |
| motion (successor package name of framer-motion)  | 14.7.1          | MIT        |

### Backend and worker

| Package                                    | Version checked | License      | Notes                                                                                                                                                              |
| ------------------------------------------ | --------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| express                                    | 5.3.0           | MIT          |                                                                                                                                                                    |
| helmet                                     | 8.3.0           | MIT          |                                                                                                                                                                    |
| express-rate-limit                         | 8.7.1           | MIT          | Not used: in-memory rate limiting without a new dependency (ADR-0009 amendment, D5).                                                                               |
| zod                                        | 4.6.7           | MIT          | shared with web                                                                                                                                                    |
| prisma, @prisma/client, @prisma/adapter-pg | **pin 7.10.1**  | Apache-2.0   | npm `latest` tag currently points to `8.0.0-rc.28`, so the stable 7.10.1 is pinned (ADR-0003)                                                                      |
| pg                                         | 8.23.1          | MIT          | driver for the adapter                                                                                                                                             |
| pg-boss                                    | 12.38.0         | MIT          | Node ≥ 22.12, PostgreSQL ≥ 13; deps `pg`, `cron-parser`, `rrule-temporal`, `serialize-error` (all MIT); peer `@opentelemetry/api` (license checked when installed) |
| pino                                       | 10.4.0          | MIT          |                                                                                                                                                                    |
| pino-http                                  | 11.0.0          | MIT          |                                                                                                                                                                    |
| pino-pretty (dev)                          | 13.2.0          | MIT          |                                                                                                                                                                    |
| undici                                     | 8.12.3          | MIT          | pinned-IP fetch                                                                                                                                                    |
| ipaddr.js                                  | 2.5.0           | MIT          | IP range classification                                                                                                                                            |
| dotenv                                     | 18.0.9          | BSD-2-Clause | **Not adopted** (Phase 2): replaced by Node's built-in `process.loadEnvFile`                                                                                       |

### Analysis and auditing

| Package                                             | Version checked | License     | Notes                                                                                       |
| --------------------------------------------------- | --------------- | ----------- | ------------------------------------------------------------------------------------------- |
| playwright, @playwright/test                        | 1.64.1          | Apache-2.0  | downloads Chromium; Chromium is BSD-3 plus bundled licenses                                 |
| lighthouse                                          | 13.6.0          | Apache-2.0  | requires Node ≥ 22.19 ✅                                                                    |
| chrome-launcher                                     | 1.2.2           | Apache-2.0  |                                                                                             |
| axe-core, @axe-core/playwright                      | 4.14.0          | **MPL-2.0** | used unmodified; file-level copyleft applies only if axe files are modified                 |
| eslint (as an analysis engine and for repo linting) | 10.13.0         | MIT         |                                                                                             |
| @eslint/js                                          | 10.0.1          | MIT         |                                                                                             |
| typescript-eslint                                   | 8.72.1          | MIT         | peer `typescript >=4.8.4 <6.1.0`                                                            |
| typescript                                          | **pin 6.0.3**   | Apache-2.0  | npm `latest` is 7.0.2 (native port), which typescript-eslint doesn't support yet (ADR-0008) |
| fast-xml-parser                                     | 5.11.2          | MIT         | test-report import (P6)                                                                     |
| commander                                           | 15.0.0          | MIT         | CLI (P5)                                                                                    |

### Testing and tooling

| Package                                       | Version checked | License |
| --------------------------------------------- | --------------- | ------- |
| vitest                                        | 5.0.5           | MIT     |
| @testing-library/react                        | 16.3.3          | MIT     |
| jsdom                                         | 30.1.3          | MIT     |
| msw                                           | 3.0.3           | MIT     |
| supertest                                     | 7.3.1           | MIT     |
| tsx                                           | 4.23.15         | MIT     |
| prettier                                      | 3.9.10          | MIT     |
| concurrently                                  | 10.0.6          | MIT     |
| @types/node (match the Node 24 line: 24.19.x) | 24.19.2         | MIT     |
| @types/express                                | 5.0.6           | MIT     |
| eslint-plugin-react-hooks                     | 7.1.1           | MIT     |

### Considered, not selected

| Package                      | License | Why not (yet)                                                                                             |
| ---------------------------- | ------- | --------------------------------------------------------------------------------------------------------- |
| bullmq 6.5.0 + ioredis 6.0.0 | MIT     | Needs a Redis-protocol server. On Windows that meant proprietary Memurai. Replaced by pg-boss (ADR-0012). |

## 4. Services that are free but carry conditions

- **GitHub Actions:** free for public repositories, with included minutes for
  private ones. CI is a convenience. Everything can be run locally.
- **Lighthouse/Playwright browser downloads** come from Google/Microsoft CDNs.
  They're free but need internet access once.
- **No paid API, paid AI, or hosted database is used anywhere.**

## 5. Reviewed exceptions

| Package                           | License   | Path                                                           | Decision                                                                                                                                                                                                                                                                                            |
| --------------------------------- | --------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| elkjs 0.11.1                      | EPL-2.0   | `@prisma/client` → peer `prisma` (CLI) → `@prisma/studio-core` | **Accepted.** pnpm installs the Prisma CLI as a peer of the client. elkjs is part of Prisma Studio and isn't imported by SYNAPSE. EPL-2.0 obligations only apply to _modified_ EPL code that is _distributed_, and SYNAPSE does neither. Re-review if SYNAPSE ever bundles or ships `node_modules`. |
| postgres 3.4.7, robust-predicates | Unlicense | Prisma CLI internals                                           | Accepted (public domain dedication).                                                                                                                                                                                                                                                                |
