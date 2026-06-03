/** Identidade visual institucional (branding) — SV LOTES */

export const BRAND_STORAGE_KEY = 'svlotes-brand';

export type BrandTheme = 'orange' | 'blue' | 'green' | 'purple';

export const BRAND_THEMES: BrandTheme[] = ['orange', 'blue', 'green', 'purple'];

export const DEFAULT_BRAND: BrandTheme = 'orange';

export function isBrandTheme(value: string | null | undefined): value is BrandTheme {
  return !!value && BRAND_THEMES.includes(value as BrandTheme);
}

export function getStoredBrand(): BrandTheme {
  if (typeof window === 'undefined') return DEFAULT_BRAND;
  try {
    const stored = localStorage.getItem(BRAND_STORAGE_KEY);
    return isBrandTheme(stored) ? stored : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

/** Cor primária por marca (meta theme-color, previews) */
export const BRAND_PRIMARY_HEX: Record<BrandTheme, string> = {
  orange: '#F97316',
  blue: '#2563EB',
  green: '#16A34A',
  purple: '#7C3AED',
};

export const BRAND_LABELS: Record<
  BrandTheme,
  { title: string; subtitle: string; emoji: string }
> = {
  orange: {
    emoji: '🟠',
    title: 'Laranja SV LOTES',
    subtitle: 'Identidade padrão da plataforma',
  },
  blue: {
    emoji: '🔵',
    title: 'Azul Corporativo',
    subtitle: 'Perfil corporativo (Salesforce / HubSpot)',
  },
  green: {
    emoji: '🟢',
    title: 'Verde Imobiliária',
    subtitle: 'Perfil imobiliário e financeiro',
  },
  purple: {
    emoji: '🟣',
    title: 'Roxo Premium',
    subtitle: 'Perfil executivo premium',
  },
};
