// app/api/v1/clips/route.ts

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@clerk/nextjs/server';

export async function GET(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: 'Missing Authentication' } }, { status: 401 });

    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId');
    const cursor = url.searchParams.get('cursor');
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);

    // Enforce authorization: ensure the user actually owns the jobs these clips belong to
    const whereClause: any = {
      job: { userId } // Prisma nested relation filter
    };
    
    if (jobId) {
      whereClause.jobId = jobId;
    }

    const clips = await prisma.generatedClip.findMany({
      where: whereClause,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        jobId: true,
        duration: true,
        aspectRatio: true,
        resolution: true,
        storageUrl: true,
        thumbnail: true,
        status: true,
        createdAt: true,
      }
    });

    let nextCursor = null;
    if (clips.length > limit) {
      const nextItem = clips.pop();
      nextCursor = nextItem!.id;
    }

    return NextResponse.json({
      data: clips,
      meta: {
        pagination: {
          nextCursor,
          limit
        }
      }
    });
  } catch (error: any) {
    console.error(`[API:Clips] Failed to list clips:`, error);
    return NextResponse.json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to retrieve clips' } }, { status: 500 });
  }
}
