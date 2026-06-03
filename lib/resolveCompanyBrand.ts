import {
  type BrandTheme,
  DEFAULT_BRAND,
  getStoredBrand,
  isBrandTheme,
} from '@/lib/brandTheme';

/**
 * Resolve a cor institucional ativa.
 * Futuro: `company.brand_theme` do Supabase (multi-tenant).
 * Hoje: preferência salva no navegador (`svlotes-brand`).
 */
export function resolveActiveBrandTheme(
  company?: { brand_theme?: string | null } | null,
): BrandTheme {
  const fromCompany = company?.brand_theme;
  if (isBrandTheme(fromCompany ?? undefined)) {
    return fromCompany;
  }
  return getStoredBrand();
}

/** Persistência local até existir coluna `companies.brand_theme`. */
export function getEffectiveBrandTheme(
  company?: { brand_theme?: string | null } | null,
): BrandTheme {
  return resolveActiveBrandTheme(company) ?? DEFAULT_BRAND;
}
