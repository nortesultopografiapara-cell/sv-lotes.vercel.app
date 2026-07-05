/**
 * Cache em memória para idempotência de webhooks (MOCK / testes).
 * Em produção, a fonte de verdade é bank_webhook_events.idempotency_key.
 */
const processedKeys = new Set<string>();

export function buildWebhookIdempotencyKey(provider: string, externalEventId: string): string {
  return `${provider}:${externalEventId}`;
}

/** Retorna true se o evento é novo; false se já foi processado neste processo. */
export function claimWebhookEvent(idempotencyKey: string): boolean {
  if (processedKeys.has(idempotencyKey)) return false;
  processedKeys.add(idempotencyKey);
  return true;
}

export function clearWebhookEventCacheForTests(): void {
  processedKeys.clear();
}
