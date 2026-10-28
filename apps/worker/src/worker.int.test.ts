import { Writable } from 'node:stream';
import { checkQueueSchema, createPrismaClient, type PrismaClient } from '@synapse/db';
import { assertTestDatabaseUrl, truncateAll } from '@synapse/db/testing';
import { createLogger } from '@synapse/logger';
import { createBoss, ensureQueues, QUEUES, type PgBoss } from '@synapse/queue';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMaintenance } from './jobs/maintenance.js';

const url = process.env.DATABASE_URL_TEST;
const SCHEMA = 'pgboss';

describe.skipIf(url === undefined || url === '')('worker (integration)', () => {
  const logger = createLogger({
    name: 'worker-test',
    level: 'silent',
    destination: new Writable({
      write: (_c, _e, cb) => {
        cb();
      },
    }),
  });
  // Created in beforeAll: describe bodies run during collection even when skipped.
  let prisma: PrismaClient;
  let boss: PgBoss;

  beforeAll(async () => {
    assertTestDatabaseUrl(url!);
    prisma = createPrismaClient({ connectionString: url!, maxConnections: 2 });
    boss = createBoss({ connectionString: url!, schema: SCHEMA, logger, maxConnections: 2 });
    await truncateAll(prisma);
    await boss.start();
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
    await prisma.$disconnect();
  });

  it('installs the queue schema that the API readiness probe checks for', async () => {
    await expect(checkQueueSchema(prisma, SCHEMA)).resolves.toMatchObject({ status: 'up' });
    await expect(checkQueueSchema(prisma, 'no_such_schema')).resolves.toMatchObject({
      status: 'down',
      reason: 'queue schema not installed',
    });
  });

  it('ensureQueues is idempotent', async () => {
    await ensureQueues(boss);
    await ensureQueues(boss);
    expect(await boss.getQueue(QUEUES.maintenance)).toMatchObject({ name: QUEUES.maintenance });
  });

  it('delivers a sent job to a worker', async () => {
    let resolveJob!: (id: string) => void;
    const received = new Promise<string>((resolve) => {
      resolveJob = resolve;
    });
    await boss.work(QUEUES.maintenance, { pollingIntervalSeconds: 0.5 }, async ([job]) => {
      if (job !== undefined) resolveJob(job.id);
      return Promise.resolve();
    });
    const sentId = await boss.send(QUEUES.maintenance, {});
    expect(sentId).not.toBeNull();
    await expect(received).resolves.toBe(sentId);
  });

  it('maintenance purges expired sessions', async () => {
    const user = await prisma.user.create({ data: { passwordHash: 'x' } });
    const createdAt = new Date('2026-01-01T00:00:00Z');
    await prisma.session.create({
      data: {
        id: 'c'.repeat(64),
        userId: user.id,
        createdAt,
        expiresAt: new Date('2026-01-02T00:00:00Z'),
      },
    });
    const result = await runMaintenance(prisma, logger, new Date('2026-02-01T00:00:00Z'));
    expect(result).toEqual({ expiredSessionsDeleted: 1 });
  });
});
