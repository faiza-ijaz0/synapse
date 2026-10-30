import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findWorkspaceRoot } from '@synapse/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Starts the real server.ts in a child process. The child runs from an empty
// temporary directory with an explicit environment, so it never reads the
// workspace .env or inherits this process's variables.
const apiDir = join(import.meta.dirname, '..');
const serverEntry = join(apiDir, 'src', 'server.ts');
const tsxLoader = pathToFileURL(join(apiDir, 'node_modules', 'tsx', 'dist', 'loader.mjs')).href;
// Unreachable on purpose: nothing in these tests connects to it.
const DATABASE_URL = 'postgresql://synapse:not-a-real-password@127.0.0.1:1/synapse';

let cwd: string;

beforeAll(() => {
  cwd = mkdtempSync(join(tmpdir(), 'synapse-api-start-'));
  // If a workspace marker sat above the temp dir, the child would load its .env.
  expect(findWorkspaceRoot(cwd)).toBeUndefined();
});

afterAll(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function startApi(env: Record<string, string>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const inherited = ['PATH', 'Path', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE'];
  const base = Object.fromEntries(
    inherited.flatMap((key) => (process.env[key] === undefined ? [] : [[key, process.env[key]]])),
  );
  const result = spawnSync(process.execPath, ['--import', tsxLoader, serverEntry], {
    cwd,
    env: { ...base, NODE_ENV: 'test', LOG_LEVEL: 'info', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A throwaway key that exists only for the duration of this test file. */
const validSecret = randomBytes(32).toString('base64');

describe('API startup with invalid configuration', () => {
  it.each([
    ['a missing session secret', {}, 'SYNAPSE_SESSION_SECRET is required'],
    [
      'a malformed session secret',
      { SYNAPSE_SESSION_SECRET: 'CHANGE_ME' },
      'SYNAPSE_SESSION_SECRET must be standard base64',
    ],
    [
      'a localhost web origin',
      { SYNAPSE_SESSION_SECRET: validSecret, SYNAPSE_WEB_ORIGIN: 'http://localhost:5173' },
      'SYNAPSE_WEB_ORIGIN must be an exact loopback origin',
    ],
    [
      'a non-loopback bind address',
      { SYNAPSE_SESSION_SECRET: validSecret, SYNAPSE_API_HOST: '0.0.0.0' },
      'SYNAPSE_API_HOST must be 127.0.0.1',
    ],
  ])('exits with code 1 before listening (%s)', (_label, env, expected) => {
    const result = startApi({ DATABASE_URL, SYNAPSE_API_PORT: '1', ...env });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid environment configuration:');
    expect(result.stderr).toContain(expected);
    // Config failed before the logger existed, so nothing listened or logged.
    expect(result.stdout).not.toContain('api listening');
    // No values are echoed.
    expect(result.stderr).not.toContain(validSecret);
    expect(result.stderr).not.toContain('not-a-real-password');
    expect(result.stderr).not.toContain('CHANGE_ME');
  });
});

describe('API startup on an occupied port', () => {
  let blocker: Server;
  let port: number;

  beforeAll(async () => {
    // Hold an OS-assigned port ourselves, so no other application is affected.
    blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const address = blocker.address();
    if (address === null || typeof address === 'string') throw new Error('no port');
    port = address.port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      blocker.close(() => {
        resolve();
      });
    });
  });

  it('exits with code 1 and a one-line message, without a stack trace', () => {
    const result = startApi({
      DATABASE_URL,
      SYNAPSE_SESSION_SECRET: validSecret,
      SYNAPSE_API_PORT: String(port),
    });
    expect(result.status).toBe(1);
    expect(result.stderr.trim()).toBe(
      `Cannot listen on 127.0.0.1:${port}: the port is already in use by another process. ` +
        'Set SYNAPSE_API_PORT to a free port (docs/09 §7).',
    );
    expect(result.stdout).not.toContain('api listening');
    expect(`${result.stdout}${result.stderr}`).not.toContain(validSecret);
  });
});
