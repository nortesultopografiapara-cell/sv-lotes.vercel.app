/**
 * Bancos de preços — arquitetura preparada para integração futura.
 * Nesta fase não há sincronização com SINAPI/SICRO/etc.
 */

export const TOPOGRAPHY_PRICE_BANKS = [
  { code: 'PROPRIO', label: 'Próprio', integrated: false },
  { code: 'SINAPI', label: 'SINAPI', integrated: false },
  { code: 'SICRO', label: 'SICRO', integrated: false },
  { code: 'ORSE', label: 'ORSE', integrated: false },
  { code: 'SEDOP', label: 'SEDOP', integrated: false },
  { code: 'SEINFRA', label: 'SEINFRA', integrated: false },
  { code: 'OUTRO', label: 'Outro', integrated: false },
] as const;

export type TopographyPriceBankCode = (typeof TOPOGRAPHY_PRICE_BANKS)[number]['code'];

export function isTopographyPriceBank(value: string): value is TopographyPriceBankCode {
  return TOPOGRAPHY_PRICE_BANKS.some((b) => b.code === value);
}

export function topographyPriceBankLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return TOPOGRAPHY_PRICE_BANKS.find((b) => b.code === code)?.label ?? code;
}
