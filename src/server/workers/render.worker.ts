// server/workers/render.worker.ts

import { Worker, Job } from 'bullmq';
import { queueNames } from '../queues/config';
import { EventBus } from '../events/bus';
import { lockIdempotencyKey, markIdempotentDone, unlockIdempotencyKey } from '@/lib/idempotency';
import { prisma, withTransaction } from '@/lib/prisma';
import { AssetManager } from '../services/AssetManager';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export const renderWorker = new Worker(
  queueNames.render,
  async (job: Job) => {
    const { jobId, suggestionIds } = job.data;
    const stepKey = `render:${jobId}`;

    if (await lockIdempotencyKey(stepKey)) {
      return { status: 'skipped', reason: 'idempotent' };
    }

    try {
      console.log(`[Worker:Render] Processing job ${jobId}`);

      await withTransaction(async (tx) => {
        await tx.videoJob.update({
          where: { id: jobId },
          data: { stage: 'RENDER' }
        });
      });

      const generatedClipIds: string[] = [];

      // Process sequentially or in controlled parallel to avoid OOM
      for (const suggestionId of suggestionIds) {
        try {
          console.log(`[Worker:Render] Rendering clip for suggestion ${suggestionId}...`);
          
          // Simulated FFmpeg processing with hardware acceleration and 9:16 crop
          const videoInput = `temp/raw_${jobId}.mp4`; // Assumes downloaded and cached locally via AssetManager
          const videoOutput = `temp/output_${suggestionId}.mp4`;
          const subtitleFile = `temp/subs_${suggestionId}.ass`;
          
          // FFmpeg command to crop to 9:16 (center focus), burn ASS subtitles, encode with faststart and hwaccel
          // const ffmpegCmd = `ffmpeg -hwaccel auto -i "${videoInput}" -vf "crop=ih*(9/16):ih,ass=${subtitleFile}" -c:v libx264 -preset veryfast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${videoOutput}"`;
          // await execPromise(ffmpegCmd);
          
          // Extract thumbnail (1st frame of the clip)
          // const thumbCmd = `ffmpeg -i "${videoOutput}" -vframes 1 -q:v 2 "temp/thumb_${suggestionId}.jpg"`;
          // await execPromise(thumbCmd);

          const renderVersion = 1; // Can be incremented dynamically later
          const objectKey = `${jobId}/${suggestionId}/v${renderVersion}.mp4`;
          const assetUrl = await AssetManager.uploadAsset('final-clips', objectKey, videoOutput);
          // const thumbUrl = await AssetManager.uploadAsset('thumbnails', `${jobId}/${suggestionId}/v${renderVersion}.jpg`, `temp/thumb_${suggestionId}.jpg`);
          
          const clip = await withTransaction(async (tx) => {
            return await tx.generatedClip.create({
              data: {
                jobId,
                duration: 15.0,
                aspectRatio: '9:16',
                storageUrl: assetUrl,
                renderVersion,
                status: 'COMPLETED'
              }
            });
          });
          
          generatedClipIds.push(clip.id);
        } catch (clipError) {
          console.error(`[Worker:Render] Partial failure on clip ${suggestionId}:`, clipError);
          // Log partial failure but continue rendering other clips
        }
      }

      if (generatedClipIds.length === 0) {
        throw new Error('All clip renders failed. Aborting job.');
      }

      await EventBus.publishRenderComplete(jobId, generatedClipIds);
      await markIdempotentDone(stepKey);

      return { status: 'success', clips: generatedClipIds };
    } catch (error: any) {
      console.error(`[Worker:Render] Failed job ${jobId}:`, error);
      await unlockIdempotencyKey(stepKey);
      throw error;
    } finally {
      console.log(`[Worker:Render] Cleaning up temp render files for job ${jobId}`);
      await AssetManager.cleanupLocalFile(`temp/raw_${jobId}.mp4`);
      
      // We must loop through the suggestions to clean up their specific outputs
      for (const suggestionId of job.data.suggestionIds) {
        await AssetManager.cleanupLocalFile(`temp/output_${suggestionId}.mp4`);
        await AssetManager.cleanupLocalFile(`temp/subs_${suggestionId}.ass`);
        await AssetManager.cleanupLocalFile(`temp/thumb_${suggestionId}.jpg`);
      }
    }
  },
  { 
    connection, 
    concurrency: 2, // FFmpeg is heavily CPU bound, keep concurrency low per node
    lockDuration: 600000, // 10 minutes (FFmpeg takes a while, prevent false stalled events)
    stalledInterval: 300000, // Check for stalled jobs every 5 mins
  }
);

process.on('SIGTERM', async () => {
  console.log('[Worker:Render] Shutting down gracefully...');
  await renderWorker.close();
});
