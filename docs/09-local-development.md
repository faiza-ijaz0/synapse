# 09 — Local Development

Status: revised 2026-10-28 (pg-boss replaces Redis; Postgres hardening procedure added)

## 1. Prerequisites (Windows 11, native: no Docker, WSL, or Redis)

| Tool       | Version                                          | Free install                                                                    |
| ---------- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Node.js    | 24 LTS (`.nvmrc`)                                | nodejs.org installer, or `winget install OpenJS.NodeJS.LTS`                     |
| pnpm       | 11.x (pinned in `package.json` `packageManager`) | `corepack enable`, or `npm i -g pnpm`                                           |
| Git        | any recent                                       | `winget install Git.Git`                                                        |
| PostgreSQL | 13+ (17 recommended)                             | EDB installer from postgresql.org, or `winget install PostgreSQL.PostgreSQL.17` |

PostgreSQL is the **only** backing service. It stores both application data
and the job queue (pg-boss, `pgboss` schema).

## 2. One-time database setup (you run this, because it involves a password)

Connect as the `postgres` superuser. `psql` prompts for the password, so it
never appears on the command line or in shell history:

```powershell
& "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1
```

Then, replacing the placeholder with a strong password that you'll also put in `.env`:

```sql
CREATE ROLE synapse LOGIN PASSWORD '<strong-password>' CREATEDB;
CREATE DATABASE synapse OWNER synapse;
CREATE DATABASE synapse_test OWNER synapse;
\q
```

Why these privileges:

- **Not a superuser.** The role owns only its two databases.
- `CREATEDB` lets `prisma migrate dev` create and drop its temporary _shadow
  database_. If you'd rather not grant it, create a `synapse_shadow` database
  owned by `synapse` and set `SHADOW_DATABASE_URL` (Prisma's documented option).
- Owning the database lets pg-boss create its `pgboss` schema.

Tip: `psql`'s `\password synapse` sets the password interactively, without
echoing it.

## 3. Recommended: bind PostgreSQL to localhost only

The Phase 1 inspection found PostgreSQL listening on **all interfaces**
(`0.0.0.0:5432`, `[::]:5432`). SYNAPSE only needs loopback. **SYNAPSE never
changes this automatically.** It's a system-level change, so do it yourself
when convenient.

Run these in an **elevated** PowerShell (Run as Administrator).

1. **Find the active config file** (don't assume the path):
   ```powershell
   & "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -h 127.0.0.1 -c "SHOW config_file;" -c "SHOW listen_addresses;" -c "SHOW hba_file;"
   ```
2. **Back it up**, next to the original, with a timestamp:
   ```powershell
   $conf = "C:\Program Files\PostgreSQL\17\data\postgresql.conf"   # use the path from step 1
   Copy-Item $conf "$conf.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
   ```
3. **Edit** `postgresql.conf` in a text editor run as Administrator. Find the
   `listen_addresses` line and set:
   ```
   listen_addresses = 'localhost'
   ```
   (Remove a leading `#` if the line is commented out. Leave everything else unchanged.)
4. **Check `pg_hba.conf`** (path from step 1). `host` lines should allow only
   `127.0.0.1/32` and `::1/128`. Remove or comment out any broader lines, such as
   `0.0.0.0/0` or `all`, after backing up the file the same way.
5. **Restart the service.** This briefly interrupts anything else using this
   PostgreSQL instance:
   ```powershell
   Restart-Service postgresql-x64-17
   ```
6. **Verify:**
   ```powershell
   Get-NetTCPConnection -LocalPort 5432 -State Listen | Select-Object LocalAddress
   # Expected: only 127.0.0.1 and ::1, with no 0.0.0.0 or ::
   & "C:\Program Files\PostgreSQL\17\bin\pg_isready.exe" -h 127.0.0.1 -p 5432
   ```
7. **Roll back** if the service fails to start: copy the `.bak-*` file over
   `postgresql.conf`, run `Restart-Service postgresql-x64-17`, and check the
   logs in the `data\log` folder.

## 4. Configure the environment

```powershell
Copy-Item .env.example .env      # only if .env doesn't exist yet. Never overwrite an existing .env.
```

Edit `.env` and replace both `CHANGE_ME` placeholders in `DATABASE_URL` and
`DATABASE_URL_TEST` with the `synapse` role's password. If the password
contains URL-reserved characters (`@ : / ? # % &`), percent-encode them.

Then set up the API's own settings:

1. **Port.** If `4000` is already used by another app, set a free port, e.g.
   `SYNAPSE_API_PORT=4100` (the owner's machine uses `4100`). Don't stop the
   other app.
2. **Web origin.** Leave `SYNAPSE_WEB_ORIGIN` unset: the API then trusts only
   its own origin, `http://127.0.0.1:<SYNAPSE_API_PORT>`. If your `.env` was
   copied from an older template, delete its `SYNAPSE_WEB_ORIGIN=http://localhost:5173`
   line; the API refuses to start with a `localhost` origin (ADR-0014).
3. **Session secret** (required). Run this from the repo root. It generates 32
   random bytes with the OS's secure random generator and writes them into the
   empty `SYNAPSE_SESSION_SECRET=` line, **without displaying the value**. It
   changes nothing if the line already has a value:

   ```powershell
   $path = Join-Path (Get-Location) '.env'
   $text = [IO.File]::ReadAllText($path)
   if ($text -notmatch '(?m)^SYNAPSE_SESSION_SECRET=\r?$') {
     Write-Host 'No empty SYNAPSE_SESSION_SECRET= line in .env; nothing changed.'
   } else {
     $bytes = New-Object byte[] 32
     $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
     $rng.GetBytes($bytes); $rng.Dispose()
     $value = [Convert]::ToBase64String($bytes); [Array]::Clear($bytes, 0, $bytes.Length)
     $text = [regex]::Replace($text, '(?m)^SYNAPSE_SESSION_SECRET=(\r?)$',
       { param($m) "SYNAPSE_SESSION_SECRET=$value$($m.Groups[1].Value)" })
     [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding($false)))
     Remove-Variable value, text
     Write-Host 'SYNAPSE_SESSION_SECRET written to .env (value not shown).'
   }
   ```

The validation rules are in doc 07. `SYNAPSE_ENCRYPTION_KEY` isn't needed
until Phase 4.

## 5. Install, migrate, and verify

```powershell
pnpm install
pnpm db:migrate:deploy     # applies committed migrations to DATABASE_URL
pnpm db:status             # should report the database is up to date
pnpm typecheck; pnpm lint; pnpm test
```

`pnpm test` runs unit tests always. Integration tests run only when
`DATABASE_URL_TEST` is set, and are **reported as skipped** otherwise. To
check that none were skipped, as CI does, run
`$env:SYNAPSE_REQUIRE_INTEGRATION_TESTS='1'; pnpm test`.

## 6. Run

```powershell
pnpm dev     # api on 127.0.0.1:<SYNAPSE_API_PORT> + worker
```

Check it at `http://127.0.0.1:<SYNAPSE_API_PORT>/api/v1/health/ready`, e.g.
`http://127.0.0.1:4100/api/v1/health/ready` on the owner's machine. It returns
`200` with database and queue status, or `503` if PostgreSQL is unreachable.
The `api listening` log line shows the port and the trusted `webOrigin`.

## 7. Troubleshooting

| Symptom                                                                  | Check                                                                                                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ECONNREFUSED 127.0.0.1:5432`                                            | `Get-Service postgresql-x64-17`                                                                                                                              |
| `password authentication failed for user "synapse"`                      | The password in `.env` (and its percent-encoding)                                                                                                            |
| A startup error that names a variable                                    | That variable is missing or invalid in `.env` (doc 07). Values are never printed.                                                                            |
| `P3014` from Prisma (shadow database)                                    | The role lacks `CREATEDB`. See §2 for the alternative.                                                                                                       |
| `403 HOST_NOT_ALLOWED`                                                   | Use `127.0.0.1` (or `localhost`) with the API port, not a LAN IP or custom hostname                                                                          |
| `Cannot listen on 127.0.0.1:<port>: the port is already in use`          | Another app holds the port. See which one with `Get-NetTCPConnection -LocalPort <port> -State Listen`. Don't stop it; set `SYNAPSE_API_PORT` to a free port. |
| `Cannot listen on 127.0.0.1:<port>: permission denied`                   | The port is reserved on this machine. Choose another `SYNAPSE_API_PORT`.                                                                                     |
| `SYNAPSE_SESSION_SECRET is required`, `must be …`, or `looks non-random` | Generate it with the no-echo snippet in §4. Don't hand-edit it or reuse a typed value.                                                                       |
| `SYNAPSE_WEB_ORIGIN must be an exact loopback origin`                    | Usually an old `SYNAPSE_WEB_ORIGIN=http://localhost:5173` line. Delete it (§4).                                                                              |
