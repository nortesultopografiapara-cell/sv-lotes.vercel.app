/**
 * Google Consent Mode V2 — defaults e update para CMP futuro.
 * Defaults "granted" preservam validação Ads/remarketing até haver banner de cookies.
 * Troque os defaults via NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT=denied quando o CMP estiver ativo.
 */

export type ConsentStatus = 'granted' | 'denied';

export type GoogleConsentState = {
  ad_storage: ConsentStatus;
  ad_user_data: ConsentStatus;
  ad_personalization: ConsentStatus;
  analytics_storage: ConsentStatus;
  functionality_storage: ConsentStatus;
  personalization_storage: ConsentStatus;
  security_storage: ConsentStatus;
};

const CONSENT_KEYS: (keyof GoogleConsentState)[] = [
  'ad_storage',
  'ad_user_data',
  'ad_personalization',
  'analytics_storage',
  'functionality_storage',
  'personalization_storage',
  'security_storage',
];

export function getDefaultConsentStatus(): ConsentStatus {
  const raw =
    typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_GOOGLE_CONSENT_DEFAULT?.trim().toLowerCase()
      : undefined;
  return raw === 'denied' ? 'denied' : 'granted';
}

export function buildDefaultConsentState(
  status: ConsentStatus = getDefaultConsentStatus()
): GoogleConsentState {
  return {
    ad_storage: status,
    ad_user_data: status,
    ad_personalization: status,
    analytics_storage: status,
    functionality_storage: status,
    personalization_storage: status,
    security_storage: 'granted',
  };
}

/** Inline script para <head> — deve rodar ANTES do gtag('config'). */
export function buildConsentDefaultInlineScript(): string {
  const state = buildDefaultConsentState();
  const payload = JSON.stringify({
    ...state,
    wait_for_update: 500,
  });

  return `
window.dataLayer = window.dataLayer || [];
function gtag(){window.dataLayer.push(arguments);}
gtag('consent', 'default', ${payload});
`.trim();
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Atualiza consentimento após interação do usuário (CMP / banner). */
export function updateGoogleConsent(
  partial: Partial<GoogleConsentState>
): void {
  if (typeof window === 'undefined') return;

  const next: Partial<GoogleConsentState> = {};
  for (const key of CONSENT_KEYS) {
    if (partial[key] !== undefined) {
      next[key] = partial[key];
    }
  }
  if (Object.keys(next).length === 0) return;

  if (typeof window.gtag === 'function') {
    window.gtag('consent', 'update', next);
    return;
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(['consent', 'update', next]);
}

/** Atalho: conceder todos os storages de ads/analytics. */
export function grantAllGoogleConsent(): void {
  updateGoogleConsent(buildDefaultConsentState('granted'));
}

/** Atalho: negar ads/analytics (mantém security_storage). */
export function denyAdsAndAnalyticsConsent(): void {
  updateGoogleConsent({
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
  });
}
