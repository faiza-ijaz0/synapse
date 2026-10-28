import type { PrismaClient } from './generated/prisma/client.js';

/** Deletes sessions that expired at or before `now`. Returns the count removed. */
export async function purgeExpiredSessions(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return count;
}
