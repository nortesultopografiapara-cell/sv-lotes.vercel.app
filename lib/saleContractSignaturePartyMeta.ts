/**
 * Helpers leves de party (sem node:crypto) — seguros para import em módulos
 * que podem entrar em bundles compartilhados.
 */

export function readPartySignatureEventId(
  party: {
    id?: string | null;
    signature_data?: Record<string, unknown> | null;
  } | null | undefined,
): string | null {
  if (!party) return null;
  const data =
    party.signature_data && typeof party.signature_data === 'object'
      ? party.signature_data
      : {};
  const fromData = String(
    data.signature_event_id || data.signature_id || '',
  ).trim();
  if (fromData) return fromData;
  const partyId = String(party.id || '').trim();
  return partyId || null;
}
