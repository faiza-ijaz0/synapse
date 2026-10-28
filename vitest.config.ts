import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'apps/*/src/**/*.test.ts'],
    environment: 'node',
    // Loads the workspace .env so integration tests can find DATABASE_URL_TEST.
    setupFiles: ['./vitest.setup.ts'],
    // Applies committed migrations to the _test database (when configured).
    globalSetup: ['./vitest.global-setup.ts'],
    // Integration tests share one test database, so files run one at a time.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
