import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineConfig } from 'prisma/config';

// Load the workspace-root .env (never overriding variables already set).
// Self-contained on purpose: Prisma loads this file with its own TS loader.
for (let dir = process.cwd(); ; dir = dirname(dir)) {
  if (existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const envFile = join(dir, '.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    break;
  }
  if (dirname(dir) === dir) break;
}

const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `generate` needs no database; migrate commands fail clearly without a URL.
  ...(url === undefined || url === '' ? {} : { datasource: { url } }),
});
