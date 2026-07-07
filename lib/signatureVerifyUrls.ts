/**
 * URLs públicas de validação de assinatura eletrônica.
 * Links enviados a clientes usam sempre o domínio de produção — nunca preview Vercel.
 */

const PRODUCTION_PUBLIC_APP_URL_DEFAULT = 'https://www.svlotes.com.br';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Hosts que não devem aparecer em links compartilhados com clientes. */
export function isNonProductionPublicUrl(url: string): boolean {
  const lowered = String(url || '').trim().toLowerCase();
  if (!lowered) return true;
  return (
    lowered.includes('.vercel.app') ||
    lowered.includes('localhost') ||
    lowered.includes('127.0.0.1') ||
    lowered.includes('0.0.0.0')
  );
}

/**
 * Base URL fixa para links públicos (assinatura, validação, WhatsApp, e-mail).
 * Prioridade: NEXT_PUBLIC_PUBLIC_APP_URL → NEXT_PUBLIC_APP_URL (se produção) → NEXT_PUBLIC_SITE_URL (https) → padrão.
 * Nunca usa VERCEL_URL nem request host.
 */
export function resolvePublicBaseUrl(): string {
  const explicitPublic = stripTrailingSlash(
    String(process.env.NEXT_PUBLIC_PUBLIC_APP_URL || '').trim(),
  );
  if (explicitPublic) return explicitPublic;

  const appUrl = stripTrailingSlash(String(process.env.NEXT_PUBLIC_APP_URL || '').trim());
  if (appUrl && !isNonProductionPublicUrl(appUrl)) return appUrl;

  const siteUrl = stripTrailingSlash(String(process.env.NEXT_PUBLIC_SITE_URL || '').trim());
  if (siteUrl.startsWith('https://') && !isNonProductionPublicUrl(siteUrl)) {
    return siteUrl;
  }

  return PRODUCTION_PUBLIC_APP_URL_DEFAULT;
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
