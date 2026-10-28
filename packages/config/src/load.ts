import { existsSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import type { z } from 'zod';

export class ConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

/**
 * Validates `source` against `schema`. On failure, throws a ConfigError that
 * names each offending variable and why, but never includes its value.
 */
export function parseEnv<S extends z.ZodType>(
  schema: S,
  source: Record<string, string | undefined> = process.env,
): z.infer<S> {
  // Treat empty strings as unset, so `FOO=` in .env falls back to defaults or
  // reports "required" instead of failing on an empty value.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const result = schema.safeParse(cleaned);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || '(root)';
    const missing = issue.path.length === 1 && cleaned[String(issue.path[0])] === undefined;
    return `${name} ${missing ? 'is required' : issue.message}`;
  });
  throw new ConfigError(issues);
}

/** Walks up from `startDir` to the directory holding pnpm-workspace.yaml. */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | undefined {
  let dir = startDir;
  const { root } = parse(dir);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    if (dir === root) return undefined;
    dir = dirname(dir);
  }
}

/**
 * Loads the workspace-root `.env` into process.env if it exists. Variables
 * already set in the environment are not overridden. Returns whether a file
 * was loaded.
 */
export function loadDotEnv(startDir?: string): boolean {
  const root = findWorkspaceRoot(startDir);
  if (root === undefined) return false;
  const file = join(root, '.env');
  if (!existsSync(file)) return false;
  process.loadEnvFile(file);
  return true;
}
