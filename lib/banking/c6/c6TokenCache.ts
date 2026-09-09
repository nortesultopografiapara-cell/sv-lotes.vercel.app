/**
 * Cache em memória do access_token C6 (nunca persistir no banco).
 * Sem logs do token.
 */

export type C6CachedToken = {
  accessToken: string;
  expiresAtMs: number;
  tokenType: string;
  scope?: string;
};

const cache = new Map<string, C6CachedToken>();

function cacheKey(
  companyId: string,
  environment: string,
  integrationId?: string | null,
): string {
  const integ = String(integrationId || '').trim() || '_';
  return `${companyId}::${integ}::${environment}`;
}

export function getCachedC6Token(
  companyId: string,
  environment: string,
  skewMs = 30_000,
  integrationId?: string | null,
): C6CachedToken | null {
  const key = cacheKey(companyId, environment, integrationId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() + skewMs >= entry.expiresAtMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedC6Token(
  companyId: string,
  environment: string,
  token: C6CachedToken,
  integrationId?: string | null,
): void {
  cache.set(cacheKey(companyId, environment, integrationId), token);
}

export function clearCachedC6Token(
  companyId: string,
  environment?: string,
  integrationId?: string | null,
): void {
  if (environment) {
    cache.delete(cacheKey(companyId, environment, integrationId));
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${companyId}::`)) cache.delete(key);
  }
}

/** Somente testes. */
export function clearAllC6TokenCacheForTests(): void {
  cache.clear();
}
