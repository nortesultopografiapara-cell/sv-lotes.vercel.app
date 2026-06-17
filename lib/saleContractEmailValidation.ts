/**
 * Validação de e-mail do signatário em contratos de venda.
 */

export function normalizeSignerEmail(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export function isValidSignerEmail(raw: unknown): boolean {
  const email = normalizeSignerEmail(raw);
  if (!email || email.length > 254) return false;
  if (/\s/.test(email)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
