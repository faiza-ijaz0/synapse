import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, REDACTED } from './index.js';

function memoryLogger() {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return { logger: createLogger({ name: 'test', level: 'debug', destination }), lines };
}

describe('createLogger', () => {
  it('writes structured JSON with name, level label, and ISO time', () => {
    const { logger, lines } = memoryLogger();
    logger.info({ runId: 'r1' }, 'hello');
    expect(lines[0]).toMatchObject({ name: 'test', level: 'info', runId: 'r1', msg: 'hello' });
    expect(typeof lines[0]!.time).toBe('string');
  });

  it('redacts secrets at the top level and one level deep', () => {
    const { logger, lines } = memoryLogger();
    logger.info({
      password: 'pw-1',
      token: 'tok-1',
      user: { password: 'pw-2', name: 'kept' },
      db: { connectionString: 'postgresql://u:pw-3@h/d' },
    });
    const line = JSON.stringify(lines[0]);
    for (const secret of ['pw-1', 'tok-1', 'pw-2', 'pw-3']) expect(line).not.toContain(secret);
    expect(lines[0]).toMatchObject({ password: REDACTED, user: { name: 'kept' } });
  });

  it('redacts credential headers on requests and responses', () => {
    const { logger, lines } = memoryLogger();
    logger.info({
      req: {
        headers: {
          authorization: 'Bearer abc',
          cookie: 'sid=xyz',
          'x-api-key': 'k',
          host: 'localhost',
        },
      },
      res: { headers: { 'set-cookie': 'sid=xyz' } },
    });
    const line = JSON.stringify(lines[0]);
    for (const secret of ['Bearer abc', 'sid=xyz', '"k"']) expect(line).not.toContain(secret);
    expect(line).toContain('localhost');
  });
});
