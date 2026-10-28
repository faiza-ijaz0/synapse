import { z } from 'zod';

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'] as const;

const postgresUrl = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'postgresql:' || url.protocol === 'postgres:') &&
        url.hostname !== '' &&
        url.pathname.length > 1
      );
    } catch {
      return false;
    }
  },
  // Never echo the value: it contains a password.
  { message: 'must be a postgresql:// URL with a host and database name' },
);

const sqlIdentifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_]{0,62}$/, 'must be a lowercase SQL identifier (a-z, 0-9, _)');

const port = z.coerce.number().int().min(1).max(65535);

const positiveInt = z.coerce.number().int().positive();

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  SYNAPSE_QUEUE_SCHEMA: sqlIdentifier.default('pgboss'),
});

export const apiEnvSchema = baseEnvSchema.extend(databaseEnvSchema.shape).extend({
  SYNAPSE_API_HOST: z
    .enum(LOOPBACK_HOSTS, {
      message: `must be a loopback address (${LOOPBACK_HOSTS.join(', ')}); network exposure is unsupported`,
    })
    .default('127.0.0.1'),
  SYNAPSE_API_PORT: port.default(4000),
  SYNAPSE_WEB_ORIGIN: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
});

export const workerEnvSchema = baseEnvSchema.extend(databaseEnvSchema.shape).extend({
  SYNAPSE_WORKER_CONCURRENCY: positiveInt.max(16).default(2),
  SYNAPSE_JOB_TIMEOUT_MS: positiveInt.default(300_000),
});

export const testDatabaseEnvSchema = z.object({
  DATABASE_URL_TEST: postgresUrl,
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
