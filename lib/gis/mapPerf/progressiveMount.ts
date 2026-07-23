/**
 * Montagem progressiva via requestAnimationFrame.
 * 40–60 itens por frame; cancelável via AbortSignal.
 */

export const GIS_PROGRESSIVE_BATCH_SIZE = 50;

export type ProgressiveMountOptions<T> = {
  items: T[];
  batchSize?: number;
  signal?: AbortSignal;
  /** Prioriza estes IDs no início da fila (ex.: viewport). */
  prioritizeIds?: Set<string>;
  getId?: (item: T) => string;
  onBatch: (batch: T[], mountedCount: number, total: number) => void;
  onComplete?: () => void;
};

export function scheduleProgressiveMount<T>(
  options: ProgressiveMountOptions<T>,
): { cancel: () => void } {
  const batchSize = Math.max(1, options.batchSize ?? GIS_PROGRESSIVE_BATCH_SIZE);
  const getId = options.getId || ((item: T) => String((item as { id?: string }).id || ''));
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown as number;
  const caf =
    typeof cancelAnimationFrame === 'function'
      ? cancelAnimationFrame
      : (id: number) => clearTimeout(id);

  let cancelled = false;
  let rafId = 0;

  const onAbort = () => {
    cancelled = true;
    if (rafId) caf(rafId);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let queue = options.items.slice();
  if (options.prioritizeIds && options.prioritizeIds.size > 0) {
    const first: T[] = [];
    const rest: T[] = [];
    for (const item of queue) {
      if (options.prioritizeIds.has(getId(item))) first.push(item);
      else rest.push(item);
    }
    queue = first.concat(rest);
  }

  let index = 0;
  const total = queue.length;

  const tick = () => {
    if (cancelled || options.signal?.aborted) {
      options.signal?.removeEventListener('abort', onAbort);
      return;
    }
    if (index >= total) {
      options.onComplete?.();
      options.signal?.removeEventListener('abort', onAbort);
      return;
    }
    const end = Math.min(index + batchSize, total);
    const batch = queue.slice(index, end);
    index = end;
    options.onBatch(batch, index, total);
    rafId = raf(tick) as unknown as number;
  };

  rafId = raf(tick) as unknown as number;

  return {
    cancel: () => {
      cancelled = true;
      if (rafId) caf(rafId);
      options.signal?.removeEventListener('abort', onAbort);
    },
  };
}
