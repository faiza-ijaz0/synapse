import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiEnvSchema,
  ConfigError,
  databaseNameFromUrl,
  findWorkspaceRoot,
  loadDotEnv,
  parseEnv,
  redactConnectionUrl,
  workerEnvSchema,
} from './index.js';

const SECRET = 'sup3r-s3cret-pw';
const validUrl = `postgresql://synapse:${SECRET}@127.0.0.1:5432/synapse?schema=public`;

function captureError(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected ConfigError');
}

describe('parseEnv(apiEnvSchema)', () => {
  it('applies defaults for optional variables', () => {
    const env = parseEnv(apiEnvSchema, { DATABASE_URL: validUrl });
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      SYNAPSE_API_HOST: '127.0.0.1',
      SYNAPSE_API_PORT: 4000,
      SYNAPSE_WEB_ORIGIN: 'http://localhost:5173',
      SYNAPSE_QUEUE_SCHEMA: 'pgboss',
    });
  });

  it('coerces numeric variables', () => {
    const env = parseEnv(apiEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_API_PORT: '4100' });
    expect(env.SYNAPSE_API_PORT).toBe(4100);
  });

  it('reports a missing required variable by name', () => {
    const error = captureError(() => parseEnv(apiEnvSchema, {}));
    expect(error.issues).toEqual(['DATABASE_URL is required']);
  });

  it('treats empty strings as unset', () => {
    const error = captureError(() => parseEnv(apiEnvSchema, { DATABASE_URL: '' }));
    expect(error.issues).toEqual(['DATABASE_URL is required']);
  });

  it('never includes secret values in errors', () => {
    const badUrl = `mysql://root:${SECRET}@localhost/db`;
    const error = captureError(() =>
      parseEnv(apiEnvSchema, { DATABASE_URL: badUrl, SYNAPSE_API_PORT: SECRET }),
    );
    expect(error.issues.map((i) => i.split(' ')[0])).toEqual(['DATABASE_URL', 'SYNAPSE_API_PORT']);
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error.issues)).not.toContain(SECRET);
  });

  it('rejects a non-loopback bind address', () => {
    const error = captureError(() =>
      parseEnv(apiEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_API_HOST: '0.0.0.0' }),
    );
    expect(error.issues[0]).toMatch(/^SYNAPSE_API_HOST must be a loopback address/);
  });

  it.each(['postgresql://127.0.0.1:5432/', 'not a url', 'http://127.0.0.1/synapse'])(
    'rejects invalid DATABASE_URL %s',
    (value) => {
      expect(() => parseEnv(apiEnvSchema, { DATABASE_URL: value })).toThrow(ConfigError);
    },
  );

  it('rejects a queue schema that is not a safe identifier', () => {
    expect(() =>
      parseEnv(apiEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_QUEUE_SCHEMA: 'pg"boss; drop' }),
    ).toThrow(ConfigError);
  });
});

describe('parseEnv(workerEnvSchema)', () => {
  it('bounds worker concurrency', () => {
    expect(() =>
      parseEnv(workerEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_WORKER_CONCURRENCY: '0' }),
    ).toThrow(ConfigError);
    expect(
      parseEnv(workerEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_WORKER_CONCURRENCY: '4' })
        .SYNAPSE_WORKER_CONCURRENCY,
    ).toBe(4);
  });
});

describe('redactConnectionUrl', () => {
  it('masks the password and drops query parameters', () => {
    const redacted = redactConnectionUrl(validUrl);
    expect(redacted).toBe('postgresql://synapse:*****@127.0.0.1:5432/synapse');
    expect(redacted).not.toContain(SECRET);
  });

  it('does not echo unparseable input', () => {
    expect(redactConnectionUrl(`::${SECRET}`)).toBe('[unparseable url]');
  });
});

describe('databaseNameFromUrl', () => {
  it('extracts the database name', () => {
    expect(databaseNameFromUrl(validUrl)).toBe('synapse');
    expect(databaseNameFromUrl('postgresql://u:p@h/synapse_test')).toBe('synapse_test');
  });
});

describe('loadDotEnv', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
    delete process.env.SYNAPSE_CONFIG_TEST_A;
    delete process.env.SYNAPSE_CONFIG_TEST_B;
  });

  it('loads the workspace .env without overriding existing variables', () => {
    dir = mkdtempSync(join(tmpdir(), 'synapse-config-'));
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(
      join(dir, '.env'),
      'SYNAPSE_CONFIG_TEST_A=from-file\nSYNAPSE_CONFIG_TEST_B=from-file\n',
    );
    process.env.SYNAPSE_CONFIG_TEST_A = 'from-env';

    expect(findWorkspaceRoot(join(dir))).toBe(dir);
    expect(loadDotEnv(dir)).toBe(true);
    expect(process.env.SYNAPSE_CONFIG_TEST_A).toBe('from-env');
    expect(process.env.SYNAPSE_CONFIG_TEST_B).toBe('from-file');
  });

  it('returns false when there is no .env', () => {
    dir = mkdtempSync(join(tmpdir(), 'synapse-config-'));
    writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');
    expect(loadDotEnv(dir)).toBe(false);
  });
});
