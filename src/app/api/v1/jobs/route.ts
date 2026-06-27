// app/api/v1/jobs/route.ts

import { NextResponse } from 'next/server';
import { EventBus } from '@/server/events/bus';
import { generateJobHash, lockIdempotencyKey, unlockIdempotencyKey, markIdempotentDone } from '@/lib/idempotency';
import { prisma, withTransaction } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';
import { runWithContext } from '@/lib/context';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { z } from 'zod';

const createJobSchema = z.object({
  videoUrl: z.string().url().refine(url => {
    try {
      const parsed = new URL(url);
      const allowedDomains = ['youtube.com', 'www.youtube.com', 'youtu.be'];
      if (!allowedDomains.includes(parsed.hostname.toLowerCase())) return false;
      return true;
    } catch {
      return false;
    }
  }, { message: "URL domain not explicitly whitelisted for video extraction." })
});

export async function POST(req: Request) {
  const traceId = crypto.randomUUID();
  
  return runWithContext({ traceId, requestId: traceId }, async () => {
    logger.info('Incoming POST request to /api/v1/jobs');
    
    try {
      const body = await req.json();
      const result = createJobSchema.safeParse(body);
      
      if (!result.success) {
        logger.warn('Request validation failed', { errors: result.error.format() });
        return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid URL', details: result.error.format() } }, { status: 400 });
      }

      const { videoUrl } = result.data;
      
      // Auth & Rate Limiting
      const { userId } = await auth();
      if (!userId) {
        logger.warn('Unauthorized request attempt');
        return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing Authentication' } }, { status: 401 });
      }
    
    // const { success } = await ratelimit.limit(userId);
    // if (!success) return NextResponse.json({ error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests' } }, { status: 429 });

    const jobHash = generateJobHash(videoUrl, { user: userId });
    const stepKey = `api:job:${jobHash}`;

    if (await lockIdempotencyKey(stepKey, 60)) {
      return NextResponse.json({ error: { code: 'CONFLICT', message: 'Duplicate request in progress' } }, { status: 409 });
    }

    try {
      const job = await withTransaction(async (tx) => {
        const existingJob = await tx.videoJob.findUnique({ where: { jobHash } });
        if (existingJob) return existingJob;

        return await tx.videoJob.create({
          data: {
            userId,
            sourceUrl: videoUrl,
            jobHash,
            status: 'QUEUED',
            stage: 'DOWNLOAD'
          }
        });
      });

      if (job.status === 'QUEUED') {
        await EventBus.publishJobCreated(job.id, { url: videoUrl, userId });
      }

      await markIdempotentDone(stepKey, 60);

      logger.info('Job successfully enqueued', { jobId: job.id, status: job.status });
      return NextResponse.json({ data: { id: job.id, status: job.status, stage: job.stage } }, { status: 202 });
    } catch (dbError) {
      await unlockIdempotencyKey(stepKey);
      throw dbError;
    }
  } catch (error: any) {
    logger.error('Failed to process job request', error);
    return NextResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to process job request' } }, { status: 500 });
  }
  }); // End runWithContext
}

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing Authentication' } }, { status: 401 });

    const url = new URL(req.url);
    const cursor = url.searchParams.get('cursor');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    const jobs = await prisma.videoJob.findMany({
      where: { userId },
      take: limit + 1, // Fetch one extra to determine if there's a next page
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        sourceUrl: true,
        title: true,
        thumbnail: true,
        status: true,
        stage: true,
        createdAt: true,
      }
    });

    let nextCursor = null;
    if (jobs.length > limit) {
      const nextItem = jobs.pop(); // Remove the extra item
      nextCursor = nextItem!.id;
    }

    return NextResponse.json({
      data: jobs,
      meta: {
        pagination: {
          nextCursor,
          limit
        }
      }
    });
  } catch (error: any) {
    console.error(`[API:Jobs] Failed to list jobs:`, error);
    return NextResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve jobs' } }, { status: 500 });
  }
}
