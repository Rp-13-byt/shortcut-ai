// app/api/v1/health/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { queues } from '@/server/queues/config';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const dbStartTime = performance.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = performance.now() - dbStartTime;

    const queueMetrics: Record<string, any> = {};
    for (const [name, queue] of Object.entries(queues)) {
      const counts = await queue.getJobCounts('wait', 'active', 'failed', 'delayed', 'completed');
      queueMetrics[name] = counts;
    }

    const healthStatus = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      dependencies: {
        database: {
          status: dbLatency < 500 ? 'OK' : 'DEGRADED',
          latencyMs: dbLatency
        },
        redis: {
          status: 'OK', // Assumed OK if queue counts succeed
        }
      },
      queues: queueMetrics
    };

    logger.info('Health check executed', { healthStatus });

    return NextResponse.json({ data: healthStatus });
  } catch (error: any) {
    logger.error('Health check failed', error);
    return NextResponse.json({ 
      error: { code: 'SERVICE_UNAVAILABLE', message: 'System degraded' } 
    }, { status: 503 });
  }
}
