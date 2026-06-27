import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  // Fetch user's usage metrics for the current billing cycle
  const mockUsage = {
    month: new Date().toISOString(),
    videosProcessed: 2,
    minutesProcessed: 45.5,
    storageUsed: 1024 * 1024 * 500, // 500MB
    apiCalls: 12
  };
  return NextResponse.json({ usage: mockUsage }, { status: 200 });
}
