const buckets = new Map<string, number[]>();

export function consumeAssistantRateLimit(input: {
  key: string;
  now?: number;
  windowMs: number;
  max: number;
}): { ok: boolean; remaining: number } {
  const now = input.now ?? Date.now();
  const hits = (buckets.get(input.key) || []).filter((ts) => now - ts < input.windowMs);
  if (hits.length >= input.max) {
    buckets.set(input.key, hits);
    return { ok: false, remaining: 0 };
  }
  hits.push(now);
  buckets.set(input.key, hits);
  return { ok: true, remaining: Math.max(0, input.max - hits.length) };
}

export function resetAssistantRateLimitForTests() {
  buckets.clear();
}
