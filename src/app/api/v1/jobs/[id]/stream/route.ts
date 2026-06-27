// app/api/v1/jobs/[id]/stream/route.ts

import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const jobId = params.id;

  // Verify ownership
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job || job.userId !== userId) {
    return new Response('Not Found', { status: 404 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial state immediately
      controller.enqueue(`data: ${JSON.stringify({ status: job.status, stage: job.stage })}\n\n`);

      // Subscribe to Redis PubSub for updates to this specific job
      const subscriber = redis.duplicate();
      const channel = `job-updates:${jobId}`;

      await subscriber.subscribe(channel);

      subscriber.on('message', (chan, message) => {
        if (chan === channel) {
          controller.enqueue(`data: ${message}\n\n`);
          
          // Close connection if job is fully complete or failed
          const data = JSON.parse(message);
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            subscriber.unsubscribe();
            subscriber.quit();
            controller.close();
          }
        }
      });

      // Keep connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(`: heartbeat\n\n`);
      }, 15000);

      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        subscriber.unsubscribe();
        subscriber.quit();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
