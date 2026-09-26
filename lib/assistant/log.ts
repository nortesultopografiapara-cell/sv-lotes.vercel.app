export function logAssistantAsk(event: {
  userId: string;
  tenantId: string | null;
  role: string;
  pathname: string;
  kbIds: string[];
  capIds?: string[];
  packedChars?: number;
  provider: string;
  latencyMs: number;
  outcome: 'success' | 'fallback' | 'unknown' | 'forbidden' | 'error' | 'rate_limit';
}) {
  console.info('[assistant.ask]', {
    userId: event.userId,
    tenantId: event.tenantId,
    role: event.role,
    pathname: event.pathname,
    kbIds: event.kbIds,
    capIds: event.capIds || [],
    packedChars: event.packedChars || 0,
    provider: event.provider,
    latencyMs: event.latencyMs,
    outcome: event.outcome,
  });
}
