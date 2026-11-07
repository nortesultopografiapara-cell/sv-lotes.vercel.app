/**
 * Rate limit em memória — proteção mínima contra tentativas repetidas.
 * Janela curta por chave. Em serverless o estado é por instância.
 */

export type MemoryRateLimitConfig = {
  windowMs: number;
  max: number;
};

export type MemoryRateLimitStore = Map<string, number[]>;

export function pruneRateLimitHits(hits: number[], cutoff: number): number[] {
  return hits.filter((ts) => ts > cutoff);
}

export function peekMemoryRateLimit(
  store: MemoryRateLimitStore,
  key: string,
  config: MemoryRateLimitConfig,
  now = Date.now(),
): { allowed: boolean; count: number; remaining: number } {
  const cutoff = now - config.windowMs;
  const count = pruneRateLimitHits(store.get(key) || [], cutoff).length;
  const remaining = Math.max(0, config.max - count);
  return { allowed: count < config.max, count, remaining };
}

export function recordMemoryRateLimitHit(
  store: MemoryRateLimitStore,
  key: string,
  config: MemoryRateLimitConfig,
  now = Date.now(),
): { allowed: boolean; count: number; remaining: number } {
  const cutoff = now - config.windowMs;
  const next = pruneRateLimitHits(store.get(key) || [], cutoff);
  next.push(now);
  store.set(key, next);
  const remaining = Math.max(0, config.max - next.length);
  return { allowed: next.length <= config.max, count: next.length, remaining };
}
