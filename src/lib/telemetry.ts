// lib/telemetry.ts

export async function measure<T>(name: string, fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  try {
    const result = await fn();
    const durationMs = performance.now() - start;
    console.log(`[Telemetry] ${name} completed in ${durationMs.toFixed(2)}ms`);
    return { result, durationMs };
  } catch (error) {
    const durationMs = performance.now() - start;
    console.error(`[Telemetry] ${name} failed after ${durationMs.toFixed(2)}ms`);
    throw error;
  }
}
