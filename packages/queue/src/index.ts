import type { Logger } from '@synapse/logger';
import { PgBoss } from 'pg-boss';

export { PgBoss } from 'pg-boss';

/** Every queue SYNAPSE uses. Queues are added here as capabilities land. */
export const QUEUES = {
  maintenance: 'maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface CreateBossOptions {
  connectionString: string;
  /** Postgres schema pg-boss installs into and migrates (ADR-0012). */
  schema: string;
  logger: Logger;
  maxConnections?: number;
}

export function createBoss({
  connectionString,
  schema,
  logger,
  maxConnections = 4,
}: CreateBossOptions): PgBoss {
  const boss = new PgBoss({
    connectionString,
    schema,
    max: maxConnections,
    application_name: 'synapse',
  });
  // pg-boss emits background maintenance errors as events; unhandled, they would crash the process.
  boss.on('error', (error: unknown) => {
    logger.error({ err: error }, 'pg-boss background error');
  });
  return boss;
}

const QUEUE_POLICIES = {
  [QUEUES.maintenance]: {
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
  },
} satisfies Record<QueueName, object>;

/** Creates missing queues and updates existing ones to the current policy. Safe on every start. */
export async function ensureQueues(boss: PgBoss): Promise<void> {
  for (const [name, policy] of Object.entries(QUEUE_POLICIES)) {
    if ((await boss.getQueue(name)) === null) {
      await boss.createQueue(name, policy);
    } else {
      await boss.updateQueue(name, policy);
    }
  }
}
