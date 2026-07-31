/**
 * Unidade de negócio do Financeiro Corporativo Master.
 * Arquivo utilitário isolado (sem dependências internas) para evitar
 * imports quebrados / ciclos e garantir label estável no client.
 */

export const CORPORATE_BUSINESS_UNITS = ['SV_LOTES', 'SV_TOPOGRAFIA'] as const;

export type CorporateBusinessUnit = (typeof CORPORATE_BUSINESS_UNITS)[number];

export const CORPORATE_BUSINESS_UNIT_LABELS: Record<CorporateBusinessUnit, string> = {
  SV_LOTES: 'SV LOTES',
  SV_TOPOGRAFIA: 'SV Topografia e Projetos',
};

const DEFAULT_BUSINESS_UNIT_LABEL = CORPORATE_BUSINESS_UNIT_LABELS.SV_TOPOGRAFIA;

/**
 * Label amigável da unidade de negócio.
 * Valores vazios/desconhecidos → SV Topografia (compatível com registros históricos).
 */
export function corporateBusinessUnitLabel(unit?: string | null): string {
  const normalized = String(unit ?? '')
    .trim()
    .toUpperCase();
  if (normalized === 'SV_LOTES') return CORPORATE_BUSINESS_UNIT_LABELS.SV_LOTES;
  if (normalized === 'SV_TOPOGRAFIA') return CORPORATE_BUSINESS_UNIT_LABELS.SV_TOPOGRAFIA;
  return DEFAULT_BUSINESS_UNIT_LABEL;
}

export function isCorporateBusinessUnit(value: unknown): value is CorporateBusinessUnit {
  const s = String(value ?? '')
    .trim()
    .toUpperCase();
  return (CORPORATE_BUSINESS_UNITS as readonly string[]).includes(s);
}
