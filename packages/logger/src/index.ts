import { pino, type DestinationStream, type Logger } from 'pino';

export type { Logger } from 'pino';

/**
 * Paths whose values are always replaced before a log line is written.
 * `*` matches one level of nesting, so `*.password` covers `{ user: { password } }`.
 */
export const REDACT_PATHS: readonly string[] = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'password',
  'passwordHash',
  'token',
  'secret',
  'apiKey',
  'connectionString',
  'databaseUrl',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.secret',
  '*.apiKey',
  '*.connectionString',
  '*.databaseUrl',
];

export const REDACTED = '[REDACTED]';

export interface CreateLoggerOptions {
  name: string;
  level?: string;
  /** Defaults to stdout. Tests pass an in-memory stream. */
  destination?: DestinationStream;
}

export function createLogger({ name, level = 'info', destination }: CreateLoggerOptions): Logger {
  const options = {
    name,
    level,
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
