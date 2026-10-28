import { databaseNameFromUrl } from '@synapse/config';
import type { PrismaClient } from './generated/prisma/client.js';

export class UnsafeTestDatabaseError extends Error {
  constructor(databaseName: string) {
    super(
      `Refusing to run destructive test helpers against database "${databaseName}": ` +
        'the database name must end in "_test".',
    );
    this.name = 'UnsafeTestDatabaseError';
  }
}

/** Throws unless the URL points at a database whose name ends in `_test`. */
export function assertTestDatabaseUrl(connectionString: string): void {
  const name = databaseNameFromUrl(connectionString);
  if (!name.endsWith('_test')) throw new UnsafeTestDatabaseError(name);
}

/**
 * Empties every application table in `public`. Only for test databases:
 * re-checks the connected database name server-side before truncating.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (row === undefined || !row.db.endsWith('_test')) {
    throw new UnsafeTestDatabaseError(row?.db ?? '(unknown)');
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
