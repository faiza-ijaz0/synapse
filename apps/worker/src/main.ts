import {
  ConfigError,
  loadDotEnv,
  parseEnv,
  redactConnectionUrl,
  workerEnvSchema,
  type WorkerEnv,
} from '@synapse/config';
import { createPrismaClient } from '@synapse/db';
import { createLogger } from '@synapse/logger';
import { createBoss, ensureQueues, QUEUES } from '@synapse/queue';
import { MAINTENANCE_CRON, runMaintenance } from './jobs/maintenance.js';

function loadEnv(): WorkerEnv {
  loadDotEnv();
  try {
    return parseEnv(workerEnvSchema);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\nSee docs/07-environment-variables.md\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnv();
const logger = createLogger({ name: 'worker', level: env.LOG_LEVEL });
const prisma = createPrismaClient({ connectionString: env.DATABASE_URL, maxConnections: 4 });
const boss = createBoss({
  connectionString: env.DATABASE_URL,
  schema: env.SYNAPSE_QUEUE_SCHEMA,
  logger,
});

try {
  // start() installs or migrates the pg-boss schema (ADR-0012).
  await boss.start();
  await ensureQueues(boss);
  await boss.schedule(QUEUES.maintenance, MAINTENANCE_CRON);
  // Maintenance is a singleton chore; capability queues will use SYNAPSE_WORKER_CONCURRENCY.
  await boss.work(QUEUES.maintenance, { localConcurrency: 1 }, async () =>
    runMaintenance(prisma, logger),
  );
} catch (error) {
  // pg errors carry a SQLSTATE `code` (e.g. 28P01 = bad password) and never the password itself.
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  logger.fatal(
    { code, message: error instanceof Error ? error.message : String(error) },
    'worker failed to start; check DATABASE_URL and that PostgreSQL is running',
  );
  await prisma.$disconnect();
  process.exit(1);
}

logger.info(
  {
    database: redactConnectionUrl(env.DATABASE_URL),
    queueSchema: env.SYNAPSE_QUEUE_SCHEMA,
    queues: Object.values(QUEUES),
  },
  'worker started',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  const timeout = Math.min(env.SYNAPSE_JOB_TIMEOUT_MS, 30_000);
  setTimeout(() => process.exit(1), timeout + 5_000).unref();
  await boss.stop({ graceful: true, timeout });
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
