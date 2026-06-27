// lib/redis.ts

import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Singleton instance to prevent multiple connections during hot reloads
const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

/**
 * Executes a Redis operation with timeout protection to prevent hanging.
 */
export async function withRedisTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number = 5000
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Redis operation timed out')), timeoutMs);
  });

  return Promise.race([operation, timeoutPromise]).finally(() => clearTimeout(timer));
}
