// lib/idempotency.ts

import crypto from 'crypto';
import { redis, withRedisTimeout } from './redis';

/**
 * Checks if a given idempotency key has already been processed successfully.
 * Uses atomic SETNX (Set if Not eXists) to prevent race conditions during concurrent requests.
 * Returns true if the key ALREADY exists (meaning another process handled it).
 * Returns false if the key is NEW and this process should handle it.
 */
export async function lockIdempotencyKey(key: string, ttlSeconds = 86400): Promise<boolean> {
  try {
    const fullKey = `idempotency:${key}`;
    const acquired = await withRedisTimeout(
      redis.set(fullKey, 'processing', 'EX', ttlSeconds, 'NX')
    );
    // If acquired is 'OK', the key was set successfully (it's new).
    // If acquired is null, the key already exists (it's being processed or completed).
    return acquired !== 'OK';
  } catch (err) {
    console.error(`[Idempotency] Failed to check key ${key}:`, err);
    // On Redis failure, fail open or fail closed depending on risk.
    // For payments, fail closed (return true).
    return true; 
  }
}

/**
 * Marks a given idempotency key as processed successfully.
 */
export async function markIdempotentDone(key: string, ttlSeconds = 86400): Promise<void> {
  try {
    await withRedisTimeout(redis.setex(`idempotency:${key}`, ttlSeconds, 'completed'));
  } catch (err) {
    console.error(`[Idempotency] Failed to mark key done ${key}:`, err);
  }
}

/**
 * Unlocks an idempotency key if the process failed, allowing a retry to process it.
 */
export async function unlockIdempotencyKey(key: string): Promise<void> {
  try {
    await withRedisTimeout(redis.del(`idempotency:${key}`));
  } catch (err) {
    console.error(`[Idempotency] Failed to unlock key ${key}:`, err);
  }
}

/**
 * Generates a deterministic hash for a video job to prevent duplicate processing.
 */
export function generateJobHash(url: string, params: Record<string, any> = {}): string {
  const dataString = `${url}-${JSON.stringify(params)}`;
  return crypto.createHash('sha256').update(dataString).digest('hex');
}
