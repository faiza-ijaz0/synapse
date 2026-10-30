import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadDotEnv } from '@synapse/config';
import { resolveTestDatabaseUrl } from '@synapse/db/testing';

/**
 * Brings the test database up to date with the committed migrations before
 * any integration test runs. Integration tests skip themselves when
 * DATABASE_URL_TEST is unset, so this is a no-op in that case, unless
 * SYNAPSE_REQUIRE_INTEGRATION_TESTS=1, which makes a missing URL fatal.
 */
export default function setup(): void {
  loadDotEnv();
  let url: string | undefined;
  try {
    // Throws if required but unset, or if the database name doesn't end in _test.
    url = resolveTestDatabaseUrl(process.env);
  } catch (error) {
    // Vitest can lose global-setup error messages while mapping the stack, so
    // print the (password-free) message before failing the run.
    process.stderr.write(
      `[integration] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    throw error;
  }
  if (url === undefined) {
    process.stdout.write(
      '[integration] DATABASE_URL_TEST is not set; integration tests will be skipped.\n',
    );
    return;
  }

  const dbPackage = join(import.meta.dirname, 'packages', 'db');
  execFileSync(
    process.execPath,
    [join(dbPackage, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    { cwd: dbPackage, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
  );
}
