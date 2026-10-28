import {
  apiEnvSchema,
  ConfigError,
  loadDotEnv,
  parseEnv,
  redactConnectionUrl,
  type ApiEnv,
} from '@synapse/config';
import { checkDatabase, checkQueueSchema, createPrismaClient } from '@synapse/db';
import { createLogger } from '@synapse/logger';
import { createApp } from './app.js';
import { buildAllowedHosts } from './middleware/guards.js';

function loadEnv(): ApiEnv {
  loadDotEnv();
  try {
    return parseEnv(apiEnvSchema);
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\nSee docs/07-environment-variables.md\n`);
      process.exit(1);
    }
    throw error;
  }
}

const env = loadEnv();
const logger = createLogger({ name: 'api', level: env.LOG_LEVEL });
const prisma = createPrismaClient({ connectionString: env.DATABASE_URL });

const app = createApp({
  logger,
  allowedHosts: buildAllowedHosts(env.SYNAPSE_API_PORT, env.SYNAPSE_WEB_ORIGIN),
  allowedOrigins: new Set([env.SYNAPSE_WEB_ORIGIN]),
  readiness: async () => {
    const [database, queue] = await Promise.all([
      checkDatabase(prisma),
      checkQueueSchema(prisma, env.SYNAPSE_QUEUE_SCHEMA),
    ]);
    return { database, queue };
  },
});

const server = app.listen(env.SYNAPSE_API_PORT, env.SYNAPSE_API_HOST, () => {
  logger.info(
    {
      host: env.SYNAPSE_API_HOST,
      port: env.SYNAPSE_API_PORT,
      database: redactConnectionUrl(env.DATABASE_URL),
    },
    'api listening',
  );
});

function shutdown(signal: string): void {
  logger.info({ signal }, 'shutting down');
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once('SIGINT', () => {
  shutdown('SIGINT');
});
process.once('SIGTERM', () => {
  shutdown('SIGTERM');
});
