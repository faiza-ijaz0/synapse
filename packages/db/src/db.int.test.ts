import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  checkDatabase,
  createPrismaClient,
  purgeExpiredSessions,
  type PrismaClient,
} from './index.js';
import { assertTestDatabaseUrl, truncateAll } from './testing.js';

const url = process.env.DATABASE_URL_TEST;

describe.skipIf(url === undefined || url === '')('database (integration)', () => {
  // Created in beforeAll: describe bodies run during collection even when skipped.
  let prisma: PrismaClient;

  beforeAll(() => {
    assertTestDatabaseUrl(url!);
    prisma = createPrismaClient({ connectionString: url!, maxConnections: 2 });
  });

  beforeEach(async () => {
    await truncateAll(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reports the database as up', async () => {
    await expect(checkDatabase(prisma)).resolves.toMatchObject({ status: 'up' });
  });

  it('allows exactly one user (unique singleton + CHECK constraint)', async () => {
    await prisma.user.create({ data: { passwordHash: 'x' } });
    await expect(prisma.user.create({ data: { passwordHash: 'y' } })).rejects.toThrow();
    // Bypassing the unique column with singleton=false is blocked by the CHECK.
    await expect(
      prisma.user.create({ data: { passwordHash: 'z', singleton: false } }),
    ).rejects.toThrow();
    expect(await prisma.user.count()).toBe(1);
  });

  it('rejects a session that expires before it was created', async () => {
    const user = await prisma.user.create({ data: { passwordHash: 'x' } });
    const createdAt = new Date('2026-01-02T00:00:00Z');
    await expect(
      prisma.session.create({
        data: {
          id: 'a'.repeat(64),
          userId: user.id,
          createdAt,
          expiresAt: new Date('2026-01-01T00:00:00Z'),
        },
      }),
    ).rejects.toThrow();
  });

  it('purges only expired sessions', async () => {
    const user = await prisma.user.create({ data: { passwordHash: 'x' } });
    const now = new Date('2026-06-01T12:00:00Z');
    const createdAt = new Date('2026-05-01T00:00:00Z');
    await prisma.session.createMany({
      data: [
        {
          id: 'e'.repeat(64),
          userId: user.id,
          createdAt,
          expiresAt: new Date('2026-06-01T11:59:59Z'),
        },
        { id: 'b'.repeat(64), userId: user.id, createdAt, expiresAt: now },
        {
          id: 'f'.repeat(64),
          userId: user.id,
          createdAt,
          expiresAt: new Date('2026-06-01T12:00:01Z'),
        },
      ],
    });
    expect(await purgeExpiredSessions(prisma, now)).toBe(2);
    const remaining = await prisma.session.findMany({ select: { id: true } });
    expect(remaining).toEqual([{ id: 'f'.repeat(64) }]);
  });

  it('cascades runs when a project is deleted', async () => {
    const project = await prisma.project.create({ data: { name: 'Demo', slug: 'demo' } });
    await prisma.run.create({
      data: { projectId: project.id, kind: 'CODE_ANALYSIS', trigger: 'CLI' },
    });
    await prisma.project.delete({ where: { id: project.id } });
    expect(await prisma.run.count()).toBe(0);
  });

  it('stores run enums using their snake_case database values', async () => {
    const project = await prisma.project.create({ data: { name: 'Demo', slug: 'demo' } });
    await prisma.run.create({ data: { projectId: project.id, kind: 'API_TEST', trigger: 'UI' } });
    const rows = await prisma.$queryRaw<{ kind: string; status: string }[]>`
      SELECT kind::text, status::text FROM runs`;
    expect(rows).toEqual([{ kind: 'api_test', status: 'queued' }]);
  });
});
