# @synapse/db

Prisma 7 schema, committed migrations, client factory, health checks, and
guarded test helpers. Prisma owns the `public` schema only. pg-boss owns
`pgboss` (ADR-0012).

## Commands (run from the repo root)

| Command                  | What it does                                                          |
| ------------------------ | --------------------------------------------------------------------- |
| `pnpm db:generate`       | Regenerates the client into `src/generated/` (also runs on install)   |
| `pnpm db:migrate:deploy` | Applies committed migrations to `DATABASE_URL`                        |
| `pnpm db:status`         | Shows applied and pending migrations                                  |
| `pnpm db:migrate:dev`    | Creates a new migration from schema changes (needs a shadow database) |

## Adding a migration

1. Edit `prisma/schema.prisma`.
2. Run `pnpm db:migrate:dev --name <change>` against your **development** database.
3. Review the generated SQL. Add any CHECK constraints by hand at the end,
   under the "Hand-written constraints" comment, as in `20261028000000_init`.
4. Commit the schema and the migration folder together.

## Known Prisma 7.10.1 quirk

`prisma migrate diff --from-empty --to-schema …` needs a datasource URL even
though it doesn't connect. Without one, it **prints nothing and exits 0**.
Pass a placeholder (`DATABASE_URL=postgresql://placeholder@127.0.0.1:1/placeholder`)
and always check that the output file is non-empty.

## Test helpers (`@synapse/db/testing`)

`assertTestDatabaseUrl` and `truncateAll` refuse to touch any database whose
name doesn't end in `_test`. `truncateAll` re-checks the name server-side with
`current_database()` before truncating.
