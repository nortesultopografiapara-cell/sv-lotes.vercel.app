/**
 * Bancos de preços — códigos estáticos de bootstrap.
 * Fonte da verdade em runtime: master_topography_price_databases (extensível sem código).
 */

export const TOPOGRAPHY_PRICE_BANK_SEED = [
  { code: 'SINAPI', label: 'SINAPI' },
  { code: 'SICRO', label: 'SICRO' },
  { code: 'SBC', label: 'SBC' },
  { code: 'ORSE', label: 'ORSE' },
  { code: 'SEDOP', label: 'SEDOP' },
  { code: 'SEINFRA', label: 'SEINFRA' },
  { code: 'SETOP', label: 'SETOP' },
  { code: 'IOPES', label: 'IOPES' },
  { code: 'SIURB', label: 'SIURB' },
  { code: 'SIURB_INFRA', label: 'SIURB INFRA' },
  { code: 'SUDECAP', label: 'SUDECAP' },
  { code: 'CPOS_CDHU', label: 'CPOS/CDHU' },
  { code: 'FDE', label: 'FDE' },
  { code: 'AGESUL', label: 'AGESUL' },
  { code: 'AGETOP_CIVIL', label: 'AGETOP CIVIL' },
  { code: 'AGETOP_RODOVIARIA', label: 'AGETOP RODOVIÁRIA' },
  { code: 'CAEMA', label: 'CAEMA' },
  { code: 'EMBASA', label: 'EMBASA' },
  { code: 'CAERN', label: 'CAERN' },
  { code: 'COMPESA', label: 'COMPESA' },
  { code: 'EMOP', label: 'EMOP' },
  { code: 'DERPR', label: 'DERPR' },
  { code: 'SCO', label: 'SCO' },
  { code: 'PROPRIO', label: 'PRÓPRIO' },
  /** legado Fase 5.1 */
  { code: 'OUTRO', label: 'Outro' },
] as const;

/** @deprecated use TOPOGRAPHY_PRICE_BANK_SEED — mantido para compat */
export const TOPOGRAPHY_PRICE_BANKS = TOPOGRAPHY_PRICE_BANK_SEED.map((b) => ({
  ...b,
  integrated: false as const,
}));

export type TopographyPriceBankCode = string;

export type MasterTopographyPriceDatabase = {
  id: string;
  code: string;
  label: string;
  is_active: boolean;
  sort_order: number;
};

const SEED_CODES = new Set(TOPOGRAPHY_PRICE_BANK_SEED.map((b) => b.code));

export function isTopographyPriceBank(value: string): boolean {
  return Boolean(value && value.trim().length > 0 && value.trim().length <= 40);
}

export function topographyPriceBankLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return TOPOGRAPHY_PRICE_BANK_SEED.find((b) => b.code === code)?.label ?? code;
}

export function isKnownSeedBank(code: string): boolean {
  return SEED_CODES.has(code as (typeof TOPOGRAPHY_PRICE_BANK_SEED)[number]['code']);
}
