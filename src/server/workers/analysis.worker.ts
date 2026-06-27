// server/workers/analysis.worker.ts

import { Worker, Job } from 'bullmq';
import { queueNames } from '../queues/config';
import { EventBus } from '../events/bus';
import { lockIdempotencyKey, markIdempotentDone, unlockIdempotencyKey } from '@/lib/idempotency';
import { prisma, withTransaction } from '@/lib/prisma';
import crypto from 'crypto';
import { runWithContext } from '@/lib/context';
import { logger } from '@/lib/logger';

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
};

export const analysisWorker = new Worker(
  queueNames.analysis,
  async (job: Job) => {
    const traceId = crypto.randomUUID();
    return runWithContext({ traceId, jobId: job.data.jobId, workerId: 'worker-analysis-1' }, async () => {
      const { jobId, transcriptId } = job.data;
      const stepKey = `worker:analyze:${jobId}`;

      logger.info('Starting analysis job execution');
      if (await lockIdempotencyKey(stepKey)) {
        return { status: 'skipped', reason: 'idempotent' };
      }

      try {
        console.log(`[Worker:Analysis] Processing job ${jobId}`);

        await withTransaction(async (tx) => {
          await tx.videoJob.update({
            where: { id: jobId },
            data: { stage: 'ANALYZE' }
          });
        });

        const transcript = await prisma.transcript.findUnique({ where: { id: transcriptId } });
        if (!transcript) throw new Error(`Transcript ${transcriptId} not found`);

        // AI Cache Check
        const promptVersion = 'v1.0';
        const analysisHash = crypto.createHash('sha256').update(`${promptVersion}-${transcript.rawText}`).digest('hex');
        
        let suggestions = await prisma.clipSuggestion.findMany({ where: { analysisHash } });

        if (suggestions.length === 0) {
          console.log(`[Worker:Analysis] Cache miss for ${analysisHash}. Calling Gemini API...`);
          
          const startTime = Date.now();
          // Simulated Gemini Call with Structured Output (JSON Schema)
          // const aiRes = await ai.generateContent({
          //   model: 'gemini-1.5-pro',
          //   contents: prompt,
          //   generationConfig: {
          //     responseMimeType: "application/json",
          //     responseSchema: {
          //       type: "ARRAY",
          //       items: {
          //         type: "OBJECT",
          //         properties: {
          //           title: { type: "STRING" },
          //           startTime: { type: "NUMBER" },
          //           endTime: { type: "NUMBER" },
          //           confidence: { type: "NUMBER" },
          //           score: { type: "NUMBER" },
          //           reasoning: { type: "STRING" }
          //         }
          //       }
          //     }
          //   }
          // });
          const durationMs = Date.now() - startTime;
          
          const generatedSuggestions = [
            { title: 'Hook 1', startTime: 0, endTime: 15, confidence: 0.95, score: 95, reasoning: 'Strong emotional open' }
          ];

          // Insert atomic
          await prisma.clipSuggestion.createMany({
            data: generatedSuggestions.map(s => ({ ...s, jobId, analysisHash }))
          });
          suggestions = await prisma.clipSuggestion.findMany({ where: { jobId } });

          // Track Metrics (Mocking 15k input tokens, 500 output tokens)
          await prisma.processingMetrics.upsert({
             where: { jobId },
             create: { jobId, analysisTime: durationMs },
             update: { analysisTime: durationMs }
             // Add token metrics to schema later if needed
          });
        } else {
          console.log(`[Worker:Analysis] AI Cache Hit! Reusing suggestions for hash ${analysisHash}.`);
          // Duplicate records for relational integrity
          const clonedSuggestions = suggestions.map(s => ({
            jobId,
            analysisHash: `${analysisHash}-dup-${jobId}`,
            title: s.title,
            startTime: s.startTime,
            endTime: s.endTime,
            confidence: s.confidence,
            score: s.score,
            reasoning: s.reasoning,
            approvalState: s.approvalState
          }));
          await prisma.clipSuggestion.createMany({ data: clonedSuggestions });
          suggestions = await prisma.clipSuggestion.findMany({ where: { jobId } });
        }

        // Check if enterprise approval is needed
        // If user requires approval, we would NOT publish to render immediately, we'd update job status to PENDING_APPROVAL.
        // For now, assume auto-render:
        await EventBus.publishAnalysisReady(jobId, suggestions.map(s => s.id));
        await markIdempotentDone(stepKey);

        return { status: 'success' };
      } catch (error: any) {
        console.error(`[Worker:Analysis] Failed job ${jobId}:`, error);
        await unlockIdempotencyKey(stepKey);
        throw error;
      }
    });
  },
  { 
    connection, 
    concurrency: 5,
    lockDuration: 300000,
  }
);

process.on('SIGTERM', async () => {
  console.log('[Worker:Analysis] Shutting down gracefully...');
  await analysisWorker.close();
});
