export const OPENAI_ADS_CONSENT_STORAGE_KEY = 'svlotes.openai-ads.consent';

export type OpenAiAdsConsent = 'granted' | 'denied' | 'unknown';

export function parseOpenAiAdsConsent(value: string | null | undefined): OpenAiAdsConsent {
  if (value === 'granted' || value === 'denied') return value;
  return 'unknown';
}

export type ConsentStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function readOpenAiAdsConsent(store: ConsentStore): OpenAiAdsConsent {
  try {
    return parseOpenAiAdsConsent(store.getItem(OPENAI_ADS_CONSENT_STORAGE_KEY));
  } catch {
    return 'unknown';
  }
}

export function writeOpenAiAdsConsent(store: ConsentStore, consent: Exclude<OpenAiAdsConsent, 'unknown'>): void {
  store.setItem(OPENAI_ADS_CONSENT_STORAGE_KEY, consent);
}
