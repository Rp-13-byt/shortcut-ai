// server/workers/transcript.worker.ts

import { Worker, Job } from 'bullmq';
import { queueNames } from '../queues/config';
import { EventBus } from '../events/bus';
import { lockIdempotencyKey, markIdempotentDone, unlockIdempotencyKey } from '@/lib/idempotency';
import { prisma, withTransaction } from '@/lib/prisma';
import crypto from 'crypto';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export const transcriptWorker = new Worker(
  queueNames.transcript,
  async (job: Job) => {
    const { jobId, assetUrl } = job.data;
    const stepKey = `transcript:${jobId}`;

    // 1. Idempotency Check
    if (await lockIdempotencyKey(stepKey)) {
      console.log(`[Worker:Transcript] Job ${jobId} already handled.`);
      return { status: 'skipped', reason: 'idempotent' };
    }

    try {
      console.log(`[Worker:Transcript] Processing job ${jobId}`);

      await withTransaction(async (tx) => {
        await tx.videoJob.update({
          where: { id: jobId },
          data: { stage: 'TRANSCRIBE' }
        });
      });

      // 2. Audio Hash for Caching (Deterministic identifier for the raw media)
      const audioHash = crypto.createHash('sha256').update(assetUrl).digest('hex');

      // 3. Transcript Cache Check (Avoid Whisper API spend entirely)
      let transcript = await prisma.transcript.findUnique({
        where: { audioHash }
      });

      if (!transcript) {
        console.log(`[Worker:Transcript] Cache miss for ${audioHash}. Calling Whisper API...`);
        
        const startTime = Date.now();
        // 4. API Call with retry logic (simulated Whisper call)
        // const response = await fetchWithRetry('whisper-api');
        const durationMs = Date.now() - startTime;
        
        // 5. DB Persistence (Atomic, no explicit transaction needed)
        transcript = await prisma.transcript.create({
          data: {
            jobId,
            provider: 'whisper',
            language: 'en',
            audioHash,
            rawText: 'Mock transcribed text demonstrating the flow.',
            segments: [], // Mock JSON
            cached: false
          }
        });

        // Track metrics
        await prisma.processingMetrics.upsert({
          where: { jobId },
          create: { jobId, transcriptionTime: durationMs },
          update: { transcriptionTime: durationMs }
        });
      } else {
        console.log(`[Worker:Transcript] Cache hit! Reusing transcript ${transcript.id}`);
        // Link this existing transcript to the new job via a duplicate record to maintain relational integrity
        // while avoiding the API cost.
        transcript = await prisma.transcript.create({
           data: {
             jobId,
             provider: transcript.provider,
             language: transcript.language,
             audioHash: `${audioHash}-dup-${jobId}`, // Avoid unique constraint on dupes, or change schema to allow M:N
             rawText: transcript.rawText,
             segments: transcript.segments as any,
             cached: true
           }
        });
      }

      // 6. Enqueue next stage
      await EventBus.publishTranscriptReady(jobId, transcript.id);
      await markIdempotentDone(stepKey);

      return { status: 'success', transcriptId: transcript.id };
    } catch (error: any) {
      console.error(`[Worker:Transcript] Failed job ${jobId}:`, error);
      // Let BullMQ exponential backoff catch API 5xx errors
      await unlockIdempotencyKey(stepKey);
      throw error; 
    }
  },
  { connection, concurrency: 10 }
);

process.on('SIGTERM', async () => {
  console.log('[Worker:Transcript] Shutting down gracefully...');
  await transcriptWorker.close();
});
