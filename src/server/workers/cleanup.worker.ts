// server/workers/cleanup.worker.ts

import fs from 'fs/promises';
import path from 'path';
import { logger } from '@/lib/logger';

/**
 * Periodically sweeps the /temp directory to delete files older than 24 hours.
 * This prevents catastrophic disk leaks in the event that a worker node suffers
 * an OOM kill or severe hardware crash before its `finally` block executes.
 */
export async function sweepOrphanedTempFiles() {
  const tempDir = path.resolve(process.cwd(), 'temp');
  const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  logger.info('Starting scheduled sweep of orphaned temp files', { tempDir });

  try {
    const files = await fs.readdir(tempDir);
    let deletedCount = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;

      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      const now = Date.now();

      if (now - stats.mtimeMs > MAX_AGE_MS) {
        await fs.unlink(filePath);
        deletedCount++;
        logger.debug('Deleted orphaned file', { file, ageMs: now - stats.mtimeMs });
      }
    }

    logger.info('Completed sweep of orphaned temp files', { deletedCount });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logger.info('Temp directory does not exist, skipping sweep.');
    } else {
      logger.error('Failed to sweep orphaned temp files', error);
    }
  }
}

// In a real environment, this would be scheduled via BullMQ Repeatable Jobs or a simple setInterval
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    sweepOrphanedTempFiles().catch(console.error);
  }, 60 * 60 * 1000); // Run every hour
}
