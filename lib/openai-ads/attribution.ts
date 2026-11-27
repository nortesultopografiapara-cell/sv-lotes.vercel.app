export const OPENAI_ADS_ATTRIBUTION_STORAGE_KEY = 'svlotes.openai-ads.attribution';

export const OPENAI_ADS_ATTRIBUTION_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'oppref',
] as const;

export type OpenAiAdsAttributionParam = (typeof OPENAI_ADS_ATTRIBUTION_PARAMS)[number];
export type OpenAiAdsAttribution = Partial<Record<OpenAiAdsAttributionParam, string>>;

export type AttributionStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Aceita identificadores de campanha. Recusa e-mail, URL e texto livre. */
export function isSafeAttributionValue(value: string): boolean {
  if (value.length < 1 || value.length > 128) return false;
  if (value.includes('@') || value.includes(' ') || value.includes('://')) return false;
  return /^[A-Za-z0-9._~:+/-]+$/.test(value);
}

export function readOpenAiAdsAttribution(search: string): OpenAiAdsAttribution {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const result: OpenAiAdsAttribution = {};

  for (const key of OPENAI_ADS_ATTRIBUTION_PARAMS) {
    const raw = params.get(key);
    if (!raw) continue;
    const value = raw.trim();
    if (!isSafeAttributionValue(value)) continue;
    result[key] = value;
  }

  return result;
}

export function rememberOpenAiAdsAttribution(store: AttributionStore, search: string): OpenAiAdsAttribution {
  const attribution = readOpenAiAdsAttribution(search);
  if (Object.keys(attribution).length === 0) {
    store.removeItem(OPENAI_ADS_ATTRIBUTION_STORAGE_KEY);
    return attribution;
  }
  store.setItem(OPENAI_ADS_ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  return attribution;
}

export function clearOpenAiAdsAttribution(store: AttributionStore): void {
  store.removeItem(OPENAI_ADS_ATTRIBUTION_STORAGE_KEY);
}
