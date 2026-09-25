export function logAssistantAsk(event: {
  userId: string;
  tenantId: string | null;
  role: string;
  pathname: string;
  kbIds: string[];
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
    provider: event.provider,
    latencyMs: event.latencyMs,
    outcome: event.outcome,
  });
}
