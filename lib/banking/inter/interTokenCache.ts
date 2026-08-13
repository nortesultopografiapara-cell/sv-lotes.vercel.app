/**
 * Cache em memória do access_token Inter (nunca persistir no banco).
 * Chave: integrationId (preferencial) ou companyId + environment.
 * Sem logs do token.
 */

export type InterCachedToken = {
  accessToken: string;
  expiresAtMs: number;
  tokenType: string;
  scope?: string;
};

const cache = new Map<string, InterCachedToken>();

function cacheKey(
  companyId: string,
  environment: string,
  integrationId?: string | null,
): string {
  const integ = String(integrationId || '').trim() || '_';
  return `${companyId}::${integ}::${environment}`;
}

export function getCachedInterToken(
  companyId: string,
  environment: string,
  skewMs = 30_000,
  integrationId?: string | null,
): InterCachedToken | null {
  const key = cacheKey(companyId, environment, integrationId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() + skewMs >= entry.expiresAtMs) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedInterToken(
  companyId: string,
  environment: string,
  token: InterCachedToken,
  integrationId?: string | null,
): void {
  cache.set(cacheKey(companyId, environment, integrationId), token);
}

export function clearCachedInterToken(
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
export function clearAllInterTokenCacheForTests(): void {
  cache.clear();
}
