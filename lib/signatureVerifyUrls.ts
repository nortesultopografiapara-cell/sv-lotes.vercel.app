/**
 * URLs públicas de validação de assinatura eletrônica.
 */

export function resolvePublicBaseUrl(): string {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const vercel = String(process.env.VERCEL_URL || '').trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'https://www.svlotes.com.br';
}

export function buildSignatureVerifyUrl(token: string): string {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return `${resolvePublicBaseUrl()}/verify/${encodeURIComponent(trimmed)}`;
}

export function buildSignatureVerifyApiUrl(token: string): string {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return `${resolvePublicBaseUrl()}/api/verify/${encodeURIComponent(trimmed)}`;
}
