// server/workers/download.worker.ts

import { Worker, Job } from 'bullmq';
import { queueNames } from '../queues/config';
import { EventBus } from '../events/bus';
import { lockIdempotencyKey, markIdempotentDone, unlockIdempotencyKey } from '@/lib/idempotency';
import { AssetManager } from '../services/AssetManager';
import { prisma, withTransaction } from '@/lib/prisma';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export const downloadWorker = new Worker(
  queueNames.download,
  async (job: Job) => {
    const { jobId, url } = job.data;
    const stepKey = `download:${jobId}`;

    // 1. Idempotency Check & Lease Lock
    const isAlreadyHandled = await lockIdempotencyKey(stepKey);
    if (isAlreadyHandled) {
      console.log(`[Worker:Download] Job ${jobId} already handled. Skipping.`);
      return { status: 'skipped', reason: 'idempotent' };
    }

    try {
      console.log(`[Worker:Download] Processing job ${jobId} for URL ${url}`);
      
      // 2. DB Update (Atomic, no explicit transaction needed)
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING', stage: 'DOWNLOAD' }
      });

      // 3. Asset Manager Check (Cache)
      let assetUrl = await AssetManager.getAssetIfCached(url);
      
      if (!assetUrl) {
        // 4. yt-dlp execution
        console.log(`[Worker:Download] Executing yt-dlp for 1080p limit...`);
        const videoPath = `temp/${jobId}.mp4`;
        const audioPath = `temp/${jobId}_audio.wav`;
        
        // Use Node's child_process.exec (simulated here for clarity)
        // const ytDlpCmd = `yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${videoPath}" "${url}"`;
        // await execPromise(ytDlpCmd);
        
        // Extract 16kHz mono audio for Whisper to save API token compute time
        // const ffmpegAudioCmd = `ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}"`;
        // await execPromise(ffmpegAudioCmd);
        
        // 5. Upload to Object Storage
        assetUrl = await AssetManager.uploadAsset('raw-videos', `${jobId}.mp4`, videoPath);
        // Note: The audio extraction path would also be uploaded or passed to the transcript queue.
      }

      // 6. DB Update Success (Atomic)
      await prisma.videoJob.update({
        where: { id: jobId },
        data: { sourceUrl: assetUrl } // update to canonical R2 URL
      });

      // 7. Enqueue Next Step
      await EventBus.publishDownloadComplete(jobId, assetUrl);
      
      // 8. Finalize Idempotency
      await markIdempotentDone(stepKey);
      
      return { status: 'success', assetUrl };
    } catch (error: any) {
      console.error(`[Worker:Download] Failed job ${jobId}:`, error);
      await unlockIdempotencyKey(stepKey);
      throw error; // Let BullMQ handle retries and exponential backoff
    } finally {
      console.log(`[Worker:Download] Cleaning up temp download files for job ${jobId}`);
      await AssetManager.cleanupLocalFile(`temp/${jobId}.mp4`);
      await AssetManager.cleanupLocalFile(`temp/${jobId}_audio.wav`);
    }
  },
  { 
    connection,
    concurrency: 5, // Limit concurrent downloads to prevent network starvation
  }
);

// Graceful Shutdown Hook
process.on('SIGTERM', async () => {
  console.log('[Worker:Download] Shutting down gracefully...');
  await downloadWorker.close();
});
