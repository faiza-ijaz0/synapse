import { findUnexecutedIntegrationTests, isIntegrationRequired } from '@synapse/db/testing';
import type { Reporter, TestModule } from 'vitest/node';

/**
 * When integration tests are required (SYNAPSE_REQUIRE_INTEGRATION_TESTS=1),
 * fails the run unless every `*.int.test.ts` test actually ran and passed.
 * Without the flag it does nothing, so local and Windows runs can still skip.
 */
export default class IntegrationGuardReporter implements Reporter {
  onTestRunEnd(testModules: readonly TestModule[]): void {
    if (!isIntegrationRequired(process.env)) return;
    const problems = findUnexecutedIntegrationTests(
      testModules.map((m) => ({
        moduleId: m.moduleId,
        tests: Array.from(m.children.allTests(), (t) => ({
          fullName: t.fullName,
          state: t.result().state,
        })),
      })),
    );
    if (problems.length === 0) return;
    process.stderr.write(
      '\n[integration] Integration tests are required but did not all run:\n' +
        problems.map((p) => `  - ${p}\n`).join(''),
    );
    process.exitCode = 1;
  }
}
