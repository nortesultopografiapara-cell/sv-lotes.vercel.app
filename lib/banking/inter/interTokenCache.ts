/**
 * Cache em memória do access_token Inter (nunca persistir no banco).
 * Chave: companyId + environment. Sem logs do token.
 */

export type InterCachedToken = {
  accessToken: string;
  expiresAtMs: number;
  tokenType: string;
  scope?: string;
};

const cache = new Map<string, InterCachedToken>();

function cacheKey(companyId: string, environment: string): string {
  return `${companyId}::${environment}`;
}

export function getCachedInterToken(
  companyId: string,
  environment: string,
  skewMs = 30_000,
): InterCachedToken | null {
  const entry = cache.get(cacheKey(companyId, environment));
  if (!entry) return null;
  if (Date.now() + skewMs >= entry.expiresAtMs) {
    cache.delete(cacheKey(companyId, environment));
    return null;
  }
  return entry;
}

export function setCachedInterToken(
  companyId: string,
  environment: string,
  token: InterCachedToken,
): void {
  cache.set(cacheKey(companyId, environment), token);
}

export function clearCachedInterToken(companyId: string, environment?: string): void {
  if (environment) {
    cache.delete(cacheKey(companyId, environment));
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${companyId}::`)) cache.delete(key);
  }
}

/** Somente testes. */
export function clearAllInterTokenCacheForTests(): void {
  cache.clear();
}
