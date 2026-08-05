/**
 * Google Tag / Google Ads — configuração central do SV LOTES.
 * Fonte única de IDs para evitar duplicidade de tags.
 */

/** Google Ads / Google Tag (gtag.js) — ID oficial da conta */
export const GOOGLE_ADS_ID = 'AW-18367509513' as const;

/**
 * GA4 opcional (G-XXXX). Quando definido, é configurado no mesmo gtag.js
 * (sem carregar um segundo script).
 */
export const GA_MEASUREMENT_ID =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()) ||
  '';

/** Override do ID Ads via env (mantém o ID oficial como fallback). */
export function getGoogleAdsId(): string {
  const fromEnv =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_GOOGLE_ADS_ID?.trim()
      : undefined;
  return fromEnv || GOOGLE_ADS_ID;
}

/**
 * Tag ativa somente em produção real.
 * - Dev/local: off
 * - Vercel Preview: off (evita poluir campanhas)
 * - Vercel Production: on
 * Override: NEXT_PUBLIC_GOOGLE_TAG_ENABLED=true|false
 */
export function isGoogleTagEnabled(): boolean {
  const override =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_GOOGLE_TAG_ENABLED?.trim().toLowerCase()
      : undefined;

  if (override === 'false' || override === '0') return false;
  if (override === 'true' || override === '1') return true;

  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'production') {
    return false;
  }

  const vercelEnv =
    process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? '';
  if (vercelEnv && vercelEnv !== 'production') {
    return false;
  }

  return Boolean(getGoogleAdsId());
}
