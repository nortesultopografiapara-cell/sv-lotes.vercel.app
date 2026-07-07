/**
 * Instrumentação de performance para APIs Master SaaS.
 * Logs estruturados em Vercel/server para diagnóstico de timeouts.
 */

export type MasterApiPerfStep = {
  step: string;
  ms: number;
  recordCount?: number;
};

export type MasterApiPerfReport = {
  endpoint: string;
  method: string;
  totalMs: number;
  supabaseMs: number;
  processMs: number;
  recordCount?: number;
  steps: MasterApiPerfStep[];
};

const PERF_DISABLED = process.env.MASTER_API_PERF_LOG === '0';

export function logMasterApiStep(
  scope: string,
  step: string,
  startedAt: number,
  recordCount?: number,
): void {
  if (PERF_DISABLED) return;
  const ms = Math.round((performance.now() - startedAt) * 100) / 100;
  console.log(
    '[master-api-perf:step]',
    JSON.stringify({
      scope,
      step,
      ms,
      recordCount,
    }),
  );
}

export function createMasterApiPerfTracker(endpoint: string, method = 'GET') {
  const requestStartedAt = performance.now();
  let supabaseMs = 0;
  const steps: MasterApiPerfStep[] = [];

  const trackStep = (step: string, ms: number, recordCount?: number, isSupabase = false) => {
    const rounded = Math.round(ms * 100) / 100;
    if (isSupabase) supabaseMs += rounded;
    steps.push({ step, ms: rounded, recordCount });
  };

  return {
    async timeSupabase<T>(
      step: string,
      fn: () => Promise<T>,
      countFn?: (result: T) => number | undefined,
    ): Promise<T> {
      const t0 = performance.now();
      const result = await fn();
      trackStep(step, performance.now() - t0, countFn?.(result), true);
      return result;
    },

    timeProcess<T>(
      step: string,
      fn: () => T,
      countFn?: (result: T) => number | undefined,
    ): T {
      const t0 = performance.now();
      const result = fn();
      trackStep(step, performance.now() - t0, countFn?.(result), false);
      return result;
    },

    finish(recordCount?: number): MasterApiPerfReport {
      const totalMs = Math.round((performance.now() - requestStartedAt) * 100) / 100;
      const roundedSupabaseMs = Math.round(supabaseMs * 100) / 100;
      const processMs = Math.max(0, Math.round((totalMs - roundedSupabaseMs) * 100) / 100);
      const report: MasterApiPerfReport = {
        endpoint,
        method,
        totalMs,
        supabaseMs: roundedSupabaseMs,
        processMs,
        recordCount,
        steps,
      };
      if (!PERF_DISABLED) {
        console.log('[master-api-perf]', JSON.stringify(report));
      }
      return report;
    },
  };
}
