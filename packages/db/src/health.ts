import type { DependencyCheck } from '@synapse/contracts';
import type { PrismaClient } from './generated/prisma/client.js';

/** Runs a trivial query to confirm the database is reachable. */
export async function checkDatabase(prisma: PrismaClient): Promise<DependencyCheck> {
  const started = performance.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: 'up', latencyMs: elapsed(started) };
  } catch {
    // The driver error can include host and user details; keep the public reason generic.
    return { status: 'down', latencyMs: elapsed(started), reason: 'database unreachable' };
  }
}

/**
 * Confirms the pg-boss schema has been installed (the worker creates it on
 * start). Doesn't require a pg-boss instance in the calling process.
 */
export async function checkQueueSchema(
  prisma: PrismaClient,
  schema: string,
): Promise<DependencyCheck> {
  const started = performance.now();
  try {
    const rows = await prisma.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = ${schema} AND table_name = 'version'
      ) AS found`;
    return rows[0]?.found === true
      ? { status: 'up', latencyMs: elapsed(started) }
      : { status: 'down', latencyMs: elapsed(started), reason: 'queue schema not installed' };
  } catch {
    return { status: 'down', latencyMs: elapsed(started), reason: 'database unreachable' };
  }
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 100) / 100;
}
