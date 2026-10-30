import { describe, expect, it } from 'vitest';
import {
  assertTestDatabaseUrl,
  findUnexecutedIntegrationTests,
  IntegrationTestsRequiredError,
  isIntegrationRequired,
  REQUIRE_INTEGRATION_ENV,
  resolveTestDatabaseUrl,
  UnsafeTestDatabaseError,
} from './testing.js';

describe('assertTestDatabaseUrl', () => {
  it('accepts databases whose name ends in _test', () => {
    expect(() => {
      assertTestDatabaseUrl('postgresql://u:p@127.0.0.1:5432/synapse_test');
    }).not.toThrow();
  });

  it.each(['synapse', 'postgres', 'synapse_test_backup', 'test'])('refuses %s', (name) => {
    expect(() => {
      assertTestDatabaseUrl(`postgresql://u:p@127.0.0.1:5432/${name}`);
    }).toThrow(UnsafeTestDatabaseError);
  });

  it('does not include the password in the error', () => {
    try {
      assertTestDatabaseUrl('postgresql://u:hunter2@127.0.0.1:5432/synapse');
    } catch (error) {
      expect(String(error)).not.toContain('hunter2');
    }
  });
});

describe('isIntegrationRequired', () => {
  it.each([undefined, '', '0', 'false'])('is false for %j', (value) => {
    expect(isIntegrationRequired({ [REQUIRE_INTEGRATION_ENV]: value })).toBe(false);
  });

  it.each(['1', 'true'])('is true for %j', (value) => {
    expect(isIntegrationRequired({ [REQUIRE_INTEGRATION_ENV]: value })).toBe(true);
  });

  it.each(['yes', 'TRUE', '2', ' 1'])('rejects the unrecognised value %j', (value) => {
    expect(() => isIntegrationRequired({ [REQUIRE_INTEGRATION_ENV]: value })).toThrow(
      IntegrationTestsRequiredError,
    );
  });
});

describe('resolveTestDatabaseUrl', () => {
  const testUrl = 'postgresql://u:p@127.0.0.1:5432/synapse_test';

  it('returns undefined (skip) when not required and unset', () => {
    expect(resolveTestDatabaseUrl({})).toBeUndefined();
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: '' })).toBeUndefined();
  });

  it.each([{}, { DATABASE_URL_TEST: '' }])('throws when required and unset (%j)', (env) => {
    expect(() => resolveTestDatabaseUrl({ ...env, [REQUIRE_INTEGRATION_ENV]: '1' })).toThrow(
      IntegrationTestsRequiredError,
    );
  });

  it('returns the URL of a _test database, required or not', () => {
    expect(resolveTestDatabaseUrl({ DATABASE_URL_TEST: testUrl })).toBe(testUrl);
    expect(
      resolveTestDatabaseUrl({ DATABASE_URL_TEST: testUrl, [REQUIRE_INTEGRATION_ENV]: '1' }),
    ).toBe(testUrl);
  });

  it.each(['0', '1'])('refuses a non-_test database (required=%s)', (flag) => {
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL_TEST: 'postgresql://u:hunter2@127.0.0.1:5432/synapse',
        [REQUIRE_INTEGRATION_ENV]: flag,
      }),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it('does not include the password in the error', () => {
    let message = '';
    try {
      resolveTestDatabaseUrl({ DATABASE_URL_TEST: 'postgresql://u:hunter2@127.0.0.1:5432/x' });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain('Refusing');
    expect(message).not.toContain('hunter2');
  });
});

describe('findUnexecutedIntegrationTests', () => {
  const unit = {
    moduleId: '/r/packages/a/src/a.test.ts',
    tests: [{ fullName: 'u', state: 'skipped' }],
  };
  const passed = (moduleId: string) => ({ moduleId, tests: [{ fullName: 'ok', state: 'passed' }] });

  it('accepts a run where every integration test passed, ignoring unit files', () => {
    expect(
      findUnexecutedIntegrationTests([unit, passed('/r/packages/db/src/db.int.test.ts')]),
    ).toEqual([]);
  });

  it('reports when no integration files ran', () => {
    expect(findUnexecutedIntegrationTests([unit])).toEqual([
      'no integration test files (*.int.test.ts) were run',
    ]);
    expect(findUnexecutedIntegrationTests([])).toHaveLength(1);
  });

  it('reports an integration file with no tests', () => {
    expect(findUnexecutedIntegrationTests([{ moduleId: '/r/x.int.test.ts', tests: [] }])).toEqual([
      '/r/x.int.test.ts: no tests collected',
    ]);
  });

  it.each(['skipped', 'pending', 'failed'])('reports a %s integration test', (state) => {
    expect(
      findUnexecutedIntegrationTests([
        passed('/r/a.int.test.ts'),
        {
          moduleId: '/r/b.int.test.ts',
          tests: [
            { fullName: 'fine', state: 'passed' },
            { fullName: 'suite > case', state },
          ],
        },
      ]),
    ).toEqual([`/r/b.int.test.ts > suite > case: ${state}`]);
  });
});
