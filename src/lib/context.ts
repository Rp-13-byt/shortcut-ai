// lib/context.ts

import { AsyncLocalStorage } from 'async_hooks';

export interface TraceContext {
  traceId: string;
  requestId?: string;
  jobId?: string;
  workerId?: string;
  userId?: string;
}

export const contextStorage = new AsyncLocalStorage<TraceContext>();

export function getTraceContext(): TraceContext | undefined {
  return contextStorage.getStore();
}

export function runWithContext<T>(context: TraceContext, fn: () => T): T {
  return contextStorage.run(context, fn);
}
