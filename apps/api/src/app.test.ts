import { Writable } from 'node:stream';
import { ErrorEnvelope, ReadinessResponse } from '@synapse/contracts';
import { createLogger } from '@synapse/logger';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { buildAllowedHosts } from './middleware/guards.js';
import type { ReadinessProbe } from './routes/health.js';

const HOST = 'localhost:4000';
const WEB_ORIGIN = 'http://localhost:5173';
const up = { status: 'up', latencyMs: 1 } as const;

function makeApp(readiness: ReadinessProbe = () => Promise.resolve({ database: up, queue: up })) {
  const logs: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logs.push(chunk.toString());
      callback();
    },
  });
  const app = createApp({
    logger: createLogger({ name: 'test', level: 'debug', destination }),
    allowedHosts: buildAllowedHosts(4000, WEB_ORIGIN),
    allowedOrigins: new Set([WEB_ORIGIN]),
    readiness,
  });
  return { app, logs };
}

describe('GET /api/v1/health/live', () => {
  it('returns ok with a request id and security headers', async () => {
    const res = await request(makeApp().app).get('/api/v1/health/live').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('ignores a client-supplied request id', async () => {
    const res = await request(makeApp().app)
      .get('/api/v1/health/live')
      .set('Host', HOST)
      .set('X-Request-Id', 'spoofed');
    expect(res.headers['x-request-id']).not.toBe('spoofed');
  });
});

describe('GET /api/v1/health/ready', () => {
  it('returns 200 when every dependency is up', async () => {
    const res = await request(makeApp().app).get('/api/v1/health/ready').set('Host', HOST);
    expect(res.status).toBe(200);
    expect(ReadinessResponse.parse(res.body)).toEqual({
      status: 'ready',
      checks: { database: up, queue: up },
    });
  });

  it('returns 503 when a dependency is down', async () => {
    const { app } = makeApp(() =>
      Promise.resolve({
        database: up,
        queue: { status: 'down', latencyMs: 2, reason: 'queue schema not installed' },
      }),
    );
    const res = await request(app).get('/api/v1/health/ready').set('Host', HOST);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'not_ready' });
  });

  it('returns an INTERNAL envelope without leaking the error when the probe throws', async () => {
    const { app, logs } = makeApp(() => Promise.reject(new Error('password=hunter2 leaked')));
    const res = await request(app).get('/api/v1/health/ready').set('Host', HOST);
    expect(res.status).toBe(500);
    const body = ErrorEnvelope.parse(res.body);
    expect(body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
    expect(logs.join('')).toContain('unhandled error');
  });
});

describe('host guard (DNS rebinding defense)', () => {
  it.each(['evil.example:4000', 'localhost:4001', '192.168.1.10:4000'])(
    'rejects Host %s',
    async (host) => {
      const res = await request(makeApp().app).get('/api/v1/health/live').set('Host', host);
      expect(res.status).toBe(403);
      expect(ErrorEnvelope.parse(res.body).error.code).toBe('HOST_NOT_ALLOWED');
    },
  );

  it.each(['localhost:4000', '127.0.0.1:4000', '[::1]:4000', 'localhost:5173', 'LOCALHOST:4000'])(
    'accepts Host %s',
    async (host) => {
      const res = await request(makeApp().app).get('/api/v1/health/live').set('Host', host);
      expect(res.status).toBe(200);
    },
  );
});

describe('origin guard (CSRF defense)', () => {
  it('rejects a POST from a foreign origin before reaching any route', async () => {
    const res = await request(makeApp().app)
      .post('/api/v1/health/live')
      .set('Host', HOST)
      .set('Origin', 'https://evil.example')
      .send({});
    expect(res.status).toBe(403);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('lets a same-origin POST through to routing (404 here: no POST route exists yet)', async () => {
    const res = await request(makeApp().app)
      .post('/api/v1/health/live')
      .set('Host', HOST)
      .set('Origin', WEB_ORIGIN)
      .send({});
    expect(res.status).toBe(404);
  });

  it('lets a POST without Origin (CLI) through to routing', async () => {
    const res = await request(makeApp().app).post('/api/v1/nothing').set('Host', HOST).send({});
    expect(res.status).toBe(404);
  });
});

describe('error envelope', () => {
  it('returns NOT_FOUND for unknown routes', async () => {
    const res = await request(makeApp().app).get('/api/v1/nope').set('Host', HOST);
    expect(res.status).toBe(404);
    expect(ErrorEnvelope.parse(res.body).error).toMatchObject({
      code: 'NOT_FOUND',
      requestId: res.headers['x-request-id'],
    });
  });

  it('returns MALFORMED_JSON for an unparseable body', async () => {
    const res = await request(makeApp().app)
      .post('/api/v1/nothing')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('MALFORMED_JSON');
  });

  it('returns PAYLOAD_TOO_LARGE for bodies over 1 MiB', async () => {
    const res = await request(makeApp().app)
      .post('/api/v1/nothing')
      .set('Host', HOST)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 1) }));
    expect(res.status).toBe(413);
    expect(ErrorEnvelope.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
