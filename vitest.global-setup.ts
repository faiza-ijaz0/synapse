import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { loadDotEnv } from '@synapse/config';
import { assertTestDatabaseUrl } from '@synapse/db/testing';

/**
 * Brings the test database up to date with the committed migrations before
 * any integration test runs. Integration tests skip themselves when
 * DATABASE_URL_TEST is unset, so this is a no-op in that case.
 */
export default function setup(): void {
  loadDotEnv();
  const url = process.env.DATABASE_URL_TEST;
  if (url === undefined || url === '') {
    process.stdout.write(
      '[integration] DATABASE_URL_TEST is not set; integration tests will be skipped.\n',
    );
    return;
  }
  // Never migrate (or later truncate) anything but a *_test database.
  assertTestDatabaseUrl(url);

  const dbPackage = join(import.meta.dirname, 'packages', 'db');
  execFileSync(
    process.execPath,
    [join(dbPackage, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'],
    { cwd: dbPackage, env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' },
  );
}
