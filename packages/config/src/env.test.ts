import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiEnvSchema,
  ConfigError,
  databaseNameFromUrl,
  findWorkspaceRoot,
  loadDotEnv,
  parseEnv,
  redactConnectionUrl,
  SecretValue,
  workerEnvSchema,
} from './index.js';

const SECRET = 'sup3r-s3cret-pw';
const validUrl = `postgresql://synapse:${SECRET}@127.0.0.1:5432/synapse?schema=public`;
// A throwaway key generated per test run; it is never written anywhere.
const sessionKey = randomBytes(32);
const validSecret = sessionKey.toString('base64');
const required = { DATABASE_URL: validUrl, SYNAPSE_SESSION_SECRET: validSecret };

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
    const env = parseEnv(apiEnvSchema, required);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      LOG_LEVEL: 'info',
      SYNAPSE_API_HOST: '127.0.0.1',
      SYNAPSE_API_PORT: 4000,
      SYNAPSE_WEB_ORIGIN: 'http://127.0.0.1:4000',
      SYNAPSE_QUEUE_SCHEMA: 'pgboss',
    });
  });

  it('coerces numeric variables', () => {
    const env = parseEnv(apiEnvSchema, { ...required, SYNAPSE_API_PORT: '4100' });
    expect(env.SYNAPSE_API_PORT).toBe(4100);
  });

  it('reports missing required variables by name', () => {
    const error = captureError(() => parseEnv(apiEnvSchema, {}));
    expect(error.issues).toEqual([
      'DATABASE_URL is required',
      'SYNAPSE_SESSION_SECRET is required',
    ]);
  });

  it('treats empty strings as unset', () => {
    const error = captureError(() =>
      parseEnv(apiEnvSchema, { DATABASE_URL: '', SYNAPSE_SESSION_SECRET: validSecret }),
    );
    expect(error.issues).toEqual(['DATABASE_URL is required']);
  });

  it('never includes secret values in errors', () => {
    const badUrl = `mysql://root:${SECRET}@localhost/db`;
    const error = captureError(() =>
      parseEnv(apiEnvSchema, {
        DATABASE_URL: badUrl,
        SYNAPSE_API_PORT: SECRET,
        SYNAPSE_SESSION_SECRET: validSecret,
      }),
    );
    expect(error.issues.map((i) => i.split(' ')[0])).toEqual(['DATABASE_URL', 'SYNAPSE_API_PORT']);
    expect(error.message).not.toContain(SECRET);
    expect(JSON.stringify(error.issues)).not.toContain(SECRET);
  });

  it.each(['0.0.0.0', 'localhost', '::1', '192.168.1.10', '127.0.0.2'])(
    'rejects the bind address %s (only 127.0.0.1)',
    (host) => {
      const error = captureError(() =>
        parseEnv(apiEnvSchema, { ...required, SYNAPSE_API_HOST: host }),
      );
      expect(error.issues).toEqual([
        'SYNAPSE_API_HOST must be 127.0.0.1; other addresses are unsupported (ADR-0014)',
      ]);
    },
  );

  it.each(['postgresql://127.0.0.1:5432/', 'not a url', 'http://127.0.0.1/synapse'])(
    'rejects invalid DATABASE_URL %s',
    (value) => {
      expect(() => parseEnv(apiEnvSchema, { ...required, DATABASE_URL: value })).toThrow(
        ConfigError,
      );
    },
  );

  it('rejects a queue schema that is not a safe identifier', () => {
    expect(() =>
      parseEnv(apiEnvSchema, { ...required, SYNAPSE_QUEUE_SCHEMA: 'pg"boss; drop' }),
    ).toThrow(ConfigError);
  });
});

describe('SYNAPSE_WEB_ORIGIN', () => {
  const origin = (value?: string, port?: string) =>
    parseEnv(apiEnvSchema, {
      ...required,
      ...(value === undefined ? {} : { SYNAPSE_WEB_ORIGIN: value }),
      ...(port === undefined ? {} : { SYNAPSE_API_PORT: port }),
    }).SYNAPSE_WEB_ORIGIN;

  it('defaults to the API origin derived from SYNAPSE_API_PORT', () => {
    expect(origin()).toBe('http://127.0.0.1:4000');
    expect(origin(undefined, '4100')).toBe('http://127.0.0.1:4100');
    expect(origin('', '4100')).toBe('http://127.0.0.1:4100');
  });

  it.each([
    ['http://127.0.0.1:5180', 'http://127.0.0.1:5180'],
    ['http://127.0.0.1:5180/', 'http://127.0.0.1:5180'],
    ['https://127.0.0.1:8443', 'https://127.0.0.1:8443'],
    ['http://[::1]:5180', 'http://[::1]:5180'],
    ['HTTP://127.0.0.1:5180', 'http://127.0.0.1:5180'],
  ])('accepts %s and normalizes it to %s', (value, expected) => {
    expect(origin(value)).toBe(expected);
  });

  it.each([
    'http://localhost:5173',
    'http://localhost:4100',
    'http://example.com:5180',
    'http://192.168.1.10:5180',
    'http://0.0.0.0:5180',
    'http://127.0.0.1',
    'http://127.0.0.1:80',
    'http://127.0.0.1:0',
    'http://127.0.0.1:5180/app',
    'http://127.0.0.1:5180?x=1',
    'http://127.0.0.1:5180/#top',
    'http://user:pw@127.0.0.1:5180',
    'ftp://127.0.0.1:21',
    'ws://127.0.0.1:5180',
    'http://127.000.000.001:5180',
    '*',
    'null',
    'not a url',
  ])('rejects %s without echoing it', (value) => {
    const error = captureError(() => origin(value));
    // An exact, fixed message proves the input is never echoed.
    expect(error.issues).toEqual([
      'SYNAPSE_WEB_ORIGIN must be an exact loopback origin such as http://127.0.0.1:5180 ' +
        '(http or https, host 127.0.0.1 or [::1], an explicit port, no path); localhost is not allowed',
    ]);
  });
});

describe('SYNAPSE_SESSION_SECRET', () => {
  const parseSecret = (value: string) =>
    parseEnv(apiEnvSchema, { DATABASE_URL: validUrl, SYNAPSE_SESSION_SECRET: value });

  /** Asserts one fixed message, and that neither the value nor its bytes leak. */
  function expectRejected(value: string, message: string): void {
    const error = captureError(() => parseSecret(value));
    expect(error.issues).toEqual([`SYNAPSE_SESSION_SECRET ${message}`]);
    const decoded = Buffer.from(value, 'base64');
    for (const text of [error.message, JSON.stringify(error.issues), String(error)]) {
      if (value.trim().length >= 8) expect(text).not.toContain(value.trim());
      if (decoded.length >= 8) {
        expect(text).not.toContain(decoded.toString('hex'));
        expect(text).not.toContain(decoded.toString('base64url'));
      }
    }
  }

  it('is required for the API', () => {
    const missing = captureError(() => parseEnv(apiEnvSchema, { DATABASE_URL: validUrl }));
    expect(missing.issues).toEqual(['SYNAPSE_SESSION_SECRET is required']);
    const empty = captureError(() => parseSecret(''));
    expect(empty.issues).toEqual(['SYNAPSE_SESSION_SECRET is required']);
  });

  it('accepts a random 32-byte key as a SecretValue holding the decoded bytes', () => {
    const secret = parseSecret(validSecret).SYNAPSE_SESSION_SECRET;
    expect(secret).toBeInstanceOf(SecretValue);
    expect(secret.bytes().equals(sessionKey)).toBe(true);
    expect(secret.byteLength).toBe(32);
  });

  it('accepts the 1024-byte maximum', () => {
    const secret = parseSecret(randomBytes(1024).toString('base64')).SYNAPSE_SESSION_SECRET;
    expect(secret.byteLength).toBe(1024);
  });

  it.each([
    ['a leading space', ` ${validSecret}`],
    ['a trailing newline', `${validSecret}\n`],
    ['an inner space', `${validSecret.slice(0, 20)} ${validSecret.slice(20)}`],
  ])('rejects whitespace (%s)', (_label, value) => {
    expectRejected(value, 'must be base64 without whitespace');
  });

  it.each([
    ['the placeholder', 'CHANGE_ME'],
    ['punctuation', `${validSecret.slice(0, -4)}!!!!`],
    ['base64url characters', `${randomBytes(30).toString('base64').slice(0, 38)}-_AA`],
    ['missing padding', validSecret.replace(/=+$/, '')],
    ['too much padding', `${validSecret.replace(/=+$/, '')}===`],
  ])('rejects non-standard base64 (%s)', (_label, value) => {
    expectRejected(
      value,
      'must be standard base64 (generate it with the no-echo snippet in docs/09 §4)',
    );
  });

  it('rejects non-canonical padding bits', () => {
    // 32 bytes encode to 43 characters plus "="; the last character carries
    // 2 unused bits. Setting one makes decode-then-encode differ.
    const canonical = randomBytes(32).toString('base64');
    const last = canonical.charAt(42);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const tampered = `${canonical.slice(0, 42)}${alphabet.charAt(alphabet.indexOf(last) | 1)}=`;
    expect(Buffer.from(tampered, 'base64').toString('base64')).not.toBe(tampered);
    expectRejected(tampered, 'must be canonical base64 (check the padding)');
  });

  it('rejects a 31-byte key', () => {
    expectRejected(randomBytes(31).toString('base64'), 'must decode to at least 32 bytes');
  });

  it('rejects a key over 1024 bytes', () => {
    expectRejected(randomBytes(1025).toString('base64'), 'must decode to at most 1024 bytes');
  });

  it.each([
    ['all zero bytes', Buffer.alloc(32, 0)],
    ['one repeated byte', Buffer.alloc(64, 0x41)],
    ['a repeated 4-byte pattern', Buffer.from('abcd'.repeat(16))],
    ['15 distinct values', Buffer.from(Array.from({ length: 48 }, (_, i) => i % 15))],
  ])('rejects a low-randomness key (%s)', (_label, bytes) => {
    expectRejected(
      bytes.toString('base64'),
      'looks non-random; generate it with the no-echo snippet in docs/09 §4',
    );
  });

  it('accepts exactly 16 distinct byte values', () => {
    const bytes = Buffer.from(Array.from({ length: 32 }, (_, i) => (i % 16) * 7));
    expect(parseSecret(bytes.toString('base64')).SYNAPSE_SESSION_SECRET.byteLength).toBe(32);
  });

  it('never appears when the parsed config is logged or serialized', () => {
    const env = parseSecret(validSecret);
    const keyHex = sessionKey.toString('hex');
    for (const text of [
      JSON.stringify(env),
      inspect(env, { depth: 5 }),
      String(env.SYNAPSE_SESSION_SECRET),
    ]) {
      expect(text).not.toContain(validSecret);
      expect(text).not.toContain(keyHex);
      expect(text).toContain('[REDACTED]');
    }
  });
});

describe('parseEnv(workerEnvSchema)', () => {
  it('does not need SYNAPSE_SESSION_SECRET', () => {
    const env = parseEnv(workerEnvSchema, { DATABASE_URL: validUrl });
    expect(env).not.toHaveProperty('SYNAPSE_SESSION_SECRET');
  });

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
