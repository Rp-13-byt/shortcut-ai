// lib/logger.ts

import pino from 'pino';
import { getTraceContext } from './context';

// Configure base pino logger
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// Create a proxy/wrapper that injects AsyncLocalStorage context into every log event
export const logger = {
  info: (msg: string, obj: object = {}) => {
    const ctx = getTraceContext();
    baseLogger.info({ ...ctx, ...obj }, msg);
  },
  warn: (msg: string, obj: object = {}) => {
    const ctx = getTraceContext();
    baseLogger.warn({ ...ctx, ...obj }, msg);
  },
  error: (msg: string, error?: any, obj: object = {}) => {
    const ctx = getTraceContext();
    const errPayload = error instanceof Error ? { err: error.message, stack: error.stack } : { err: error };
    baseLogger.error({ ...ctx, ...obj, ...errPayload }, msg);
  },
  debug: (msg: string, obj: object = {}) => {
    const ctx = getTraceContext();
    baseLogger.debug({ ...ctx, ...obj }, msg);
  }
};
