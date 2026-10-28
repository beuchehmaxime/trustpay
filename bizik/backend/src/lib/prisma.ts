import { PrismaClient } from '@prisma/client';

/**
 * Single shared Prisma client for the whole process. A global cache prevents
 * exhausting the connection pool when modules hot-reload in development.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ['warn', 'error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
