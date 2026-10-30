import { z } from 'zod';
import { SecretValue } from './secret.js';

/** The only address the API binds to (ADR-0014). */
const API_HOST = '127.0.0.1';

/** Hosts allowed in SYNAPSE_WEB_ORIGIN. `localhost` is excluded (ADR-0014). */
const ORIGIN_HOSTS = new Set(['127.0.0.1', '[::1]']);

const GENERATE_HINT = 'generate it with the no-echo snippet in docs/09 §4';

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

/**
 * An exact loopback origin: http(s), host 127.0.0.1 or [::1], an explicit port,
 * and nothing else. Normalized to `URL.origin`. Never echoes the input.
 */
const loopbackOrigin = z.string().transform((value, ctx) => {
  let url: URL | undefined;
  try {
    url = new URL(value);
  } catch {
    url = undefined;
  }
  const exact =
    url !== undefined &&
    (url.protocol === 'http:' || url.protocol === 'https:') &&
    ORIGIN_HOSTS.has(url.hostname) &&
    // An explicit port from 1 to 65535: '' (a default port) and '0' both fail.
    Number(url.port) >= 1 &&
    url.username === '' &&
    url.password === '' &&
    [url.origin, `${url.origin}/`].includes(value.toLowerCase());
  if (url === undefined || !exact) {
    ctx.addIssue({
      code: 'custom',
      message:
        'must be an exact loopback origin such as http://127.0.0.1:5180 ' +
        '(http or https, host 127.0.0.1 or [::1], an explicit port, no path); localhost is not allowed',
    });
    return z.NEVER;
  }
  return url.origin;
});

/**
 * SYNAPSE_SESSION_SECRET: canonical standard base64 of 32-1024 random bytes.
 * Every message is fixed, so neither the value nor anything derived from it
 * can reach an error or a log.
 */
const sessionSecret = z.string().transform((value, ctx) => {
  const fail = (message: string): typeof z.NEVER => {
    ctx.addIssue({ code: 'custom', message });
    return z.NEVER;
  };
  if (/\s/.test(value)) return fail('must be base64 without whitespace');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return fail(`must be standard base64 (${GENERATE_HINT})`);
  }
  const bytes = Buffer.from(value, 'base64');
  try {
    if (bytes.toString('base64') !== value)
      return fail('must be canonical base64 (check the padding)');
    if (bytes.length < 32) return fail('must decode to at least 32 bytes');
    if (bytes.length > 1024) return fail('must decode to at most 1024 bytes');
    if (new Set(bytes).size < 16) return fail(`looks non-random; ${GENERATE_HINT}`);
    return new SecretValue(bytes);
  } finally {
    bytes.fill(0);
  }
});

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const databaseEnvSchema = z.object({
  DATABASE_URL: postgresUrl,
  SYNAPSE_QUEUE_SCHEMA: sqlIdentifier.default('pgboss'),
});

export const apiEnvSchema = baseEnvSchema
  .extend(databaseEnvSchema.shape)
  .extend({
    SYNAPSE_API_HOST: z
      .literal(API_HOST, {
        message: `must be ${API_HOST}; other addresses are unsupported (ADR-0014)`,
      })
      .default(API_HOST),
    SYNAPSE_API_PORT: port.default(4000),
    // Unset means the API's own origin (derived below from the port).
    SYNAPSE_WEB_ORIGIN: loopbackOrigin.optional(),
    SYNAPSE_SESSION_SECRET: sessionSecret,
  })
  .transform((env) => ({
    ...env,
    SYNAPSE_WEB_ORIGIN: env.SYNAPSE_WEB_ORIGIN ?? `http://${API_HOST}:${env.SYNAPSE_API_PORT}`,
  }));

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
