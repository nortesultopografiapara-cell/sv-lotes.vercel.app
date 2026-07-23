/**
 * URLs públicas de validação / assinatura eletrônica.
 *
 * Resolução centralizada:
 * - Preview/dev: host do deploy atual (VERCEL_URL), depois env explícita
 * - Production: NEXT_PUBLIC_PUBLIC_APP_URL / APP / SITE, senão www.svlotes.com.br
 * - Nunca hardcodar URL de um Preview antigo no código
 */

const PRODUCTION_PUBLIC_APP_URL_DEFAULT = 'https://www.svlotes.com.br';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function normalizeHostToHttpsBase(hostOrUrl: string): string {
  const raw = String(hostOrUrl || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return stripTrailingSlash(raw);
  return `https://${stripTrailingSlash(raw.replace(/^\/\//, ''))}`;
}

/** Hosts que não devem ser tratados como domínio público de produção. */
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

function resolvePreviewOrDevBaseUrl(): string {
  const vercelHost = String(process.env.VERCEL_URL || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/$/, '');
  if (vercelHost) return `https://${vercelHost}`;

  const explicitPublic = stripTrailingSlash(
    String(process.env.NEXT_PUBLIC_PUBLIC_APP_URL || '').trim(),
  );
  if (explicitPublic) return explicitPublic;

  const appUrl = stripTrailingSlash(String(process.env.NEXT_PUBLIC_APP_URL || '').trim());
  if (appUrl) return appUrl;

  const siteUrl = stripTrailingSlash(String(process.env.NEXT_PUBLIC_SITE_URL || '').trim());
  if (siteUrl) return siteUrl.startsWith('http') ? siteUrl : normalizeHostToHttpsBase(siteUrl);

  return 'http://localhost:3000';
}

/**
 * Base URL para links públicos (assinatura, validação, WhatsApp, e-mail, QR).
 *
 * Prioridade:
 * 1) Preview/development → VERCEL_URL (deploy atual), depois envs
 * 2) Production → NEXT_PUBLIC_PUBLIC_APP_URL → APP/SITE (se produção) → padrão
 */
export function resolvePublicBaseUrl(): string {
  const vercelEnv = String(process.env.VERCEL_ENV || '').trim().toLowerCase();

  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    return resolvePreviewOrDevBaseUrl();
  }

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
