// lib/prisma.ts

import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: [
      { emit: 'event', level: 'query' },
      { emit: 'stdout', level: 'error' },
      { emit: 'stdout', level: 'info' },
      { emit: 'stdout', level: 'warn' },
    ],
  });
};

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton>;
} & typeof global;

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton();

// Log slow queries (> 100ms)
prisma.$on('query' as any, (e: any) => {
  if (e.duration >= 100) {
    console.warn(`[Prisma:SlowQuery] ${e.duration}ms: ${e.query}`);
  }
});

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma;

/**
 * Helper for robust database transactions with retry logic for serialization anomalies
 */
export async function withTransaction<T>(
  operation: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await prisma.$transaction(operation, {
        maxWait: 5000, // 5s timeout to acquire the transaction lock
        timeout: 10000, // 10s timeout for the entire transaction
      });
    } catch (error: any) {
      attempts++;
      // Postgres error P2034 is a serialization failure / transaction conflict
      if (error.code === 'P2034' && attempts < maxRetries) {
        console.warn(`[DB Transaction] Conflict detected, retrying attempt ${attempts}...`);
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 500));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Transaction failed after maximum retries');
}
