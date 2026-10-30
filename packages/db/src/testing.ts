import { databaseNameFromUrl } from '@synapse/config';
import type { PrismaClient } from './generated/prisma/client.js';

export class UnsafeTestDatabaseError extends Error {
  constructor(databaseName: string) {
    super(
      `Refusing to run destructive test helpers against database "${databaseName}": ` +
        'the database name must end in "_test".',
    );
    this.name = 'UnsafeTestDatabaseError';
  }
}

/** Throws unless the URL points at a database whose name ends in `_test`. */
export function assertTestDatabaseUrl(connectionString: string): void {
  const name = databaseNameFromUrl(connectionString);
  if (!name.endsWith('_test')) throw new UnsafeTestDatabaseError(name);
}

/**
 * Set to `1` in CI jobs that provide PostgreSQL. Integration tests must then
 * run: a missing `DATABASE_URL_TEST`, or any skipped integration test, fails
 * the run instead of being reported as skipped.
 */
export const REQUIRE_INTEGRATION_ENV = 'SYNAPSE_REQUIRE_INTEGRATION_TESTS';

/** Integration test files are named `*.int.test.ts`. */
export const INTEGRATION_TEST_FILE = /\.int\.test\.ts$/;

export class IntegrationTestsRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationTestsRequiredError';
  }
}

/**
 * Reads the requirement flag. Unrecognised values throw, so a typo can't
 * silently turn the requirement off.
 */
export function isIntegrationRequired(env: NodeJS.ProcessEnv): boolean {
  const value = env[REQUIRE_INTEGRATION_ENV];
  if (value === undefined || value === '' || value === '0' || value === 'false') return false;
  if (value === '1' || value === 'true') return true;
  throw new IntegrationTestsRequiredError(
    `${REQUIRE_INTEGRATION_ENV} must be "1", "true", "0", "false", or unset.`,
  );
}

/**
 * Returns the integration test database URL, or `undefined` when integration
 * tests should be skipped. Throws if they are required but no URL is set, or
 * if the URL names a database that doesn't end in `_test`.
 */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const required = isIntegrationRequired(env);
  const url = env.DATABASE_URL_TEST;
  if (url === undefined || url === '') {
    if (required) {
      throw new IntegrationTestsRequiredError(
        `${REQUIRE_INTEGRATION_ENV} is set but DATABASE_URL_TEST is not.`,
      );
    }
    return undefined;
  }
  assertTestDatabaseUrl(url);
  return url;
}

export interface IntegrationModuleResult {
  moduleId: string;
  tests: readonly { fullName: string; state: string }[];
}

/**
 * Lists why the required integration tests did not all run: no integration
 * files collected, a file with no tests, or any test that didn't pass (skipped,
 * todo, pending, or failed). An empty array means every one ran and passed.
 */
export function findUnexecutedIntegrationTests(
  modules: readonly IntegrationModuleResult[],
): string[] {
  const integration = modules.filter((m) => INTEGRATION_TEST_FILE.test(m.moduleId));
  if (integration.length === 0) return ['no integration test files (*.int.test.ts) were run'];
  const problems: string[] = [];
  for (const m of integration) {
    if (m.tests.length === 0) problems.push(`${m.moduleId}: no tests collected`);
    for (const t of m.tests) {
      if (t.state !== 'passed') problems.push(`${m.moduleId} > ${t.fullName}: ${t.state}`);
    }
  }
  return problems;
}

/**
 * Empties every application table in `public`. Only for test databases:
 * re-checks the connected database name server-side before truncating.
 */
export async function truncateAll(prisma: PrismaClient): Promise<void> {
  const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  if (row === undefined || !row.db.endsWith('_test')) {
    throw new UnsafeTestDatabaseError(row?.db ?? '(unknown)');
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
