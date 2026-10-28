import { purgeExpiredSessions, type PrismaClient } from '@synapse/db';
import type { Logger } from '@synapse/logger';

/** Every 15 minutes. pg-boss cron runs in UTC. */
export const MAINTENANCE_CRON = '*/15 * * * *';

export interface MaintenanceResult {
  expiredSessionsDeleted: number;
}

/** Housekeeping that keeps the database tidy. Idempotent, so retries are safe. */
export async function runMaintenance(
  prisma: PrismaClient,
  logger: Logger,
  now: Date = new Date(),
): Promise<MaintenanceResult> {
  const expiredSessionsDeleted = await purgeExpiredSessions(prisma, now);
  logger.info({ expiredSessionsDeleted }, 'maintenance complete');
  return { expiredSessionsDeleted };
}
