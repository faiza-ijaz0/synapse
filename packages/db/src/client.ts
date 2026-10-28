import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface CreatePrismaClientOptions {
  connectionString: string;
  /** Upper bound on pooled connections for this process. */
  maxConnections?: number;
}

export function createPrismaClient({
  connectionString,
  maxConnections = 10,
}: CreatePrismaClientOptions): PrismaClient {
  const adapter = new PrismaPg({
    connectionString,
    max: maxConnections,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}
