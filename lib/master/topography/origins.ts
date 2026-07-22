/** Origem comercial e situação financeira — preparação futura (Master). */

export const TOPOGRAPHY_ORIGINS = [
  { code: 'SITE', label: 'Site' },
  { code: 'WHATSAPP', label: 'WhatsApp' },
  { code: 'INSTAGRAM', label: 'Instagram' },
  { code: 'FACEBOOK', label: 'Facebook' },
  { code: 'INDICACAO', label: 'Indicação' },
  { code: 'CLIENTE_ANTIGO', label: 'Cliente antigo' },
  { code: 'COMERCIAL', label: 'Comercial' },
  { code: 'OUTRO', label: 'Outro' },
] as const;

export type TopographyOriginCode = (typeof TOPOGRAPHY_ORIGINS)[number]['code'];

export function isTopographyOrigin(value: string): value is TopographyOriginCode {
  return TOPOGRAPHY_ORIGINS.some((o) => o.code === value);
}

export function topographyOriginLabel(code: string): string {
  return TOPOGRAPHY_ORIGINS.find((o) => o.code === code)?.label ?? code;
}

export const TOPOGRAPHY_FINANCIAL_SITUATIONS = [
  { code: 'NAO_FATURADO', label: 'Não faturado' },
  { code: 'PARCIAL', label: 'Parcial' },
  { code: 'FATURADO', label: 'Faturado' },
  { code: 'RECEBIDO', label: 'Recebido' },
] as const;

export type TopographyFinancialSituationCode =
  (typeof TOPOGRAPHY_FINANCIAL_SITUATIONS)[number]['code'];

export function isTopographyFinancialSituation(
  value: string,
): value is TopographyFinancialSituationCode {
  return TOPOGRAPHY_FINANCIAL_SITUATIONS.some((f) => f.code === value);
}

export function topographyFinancialSituationLabel(code: string): string {
  return TOPOGRAPHY_FINANCIAL_SITUATIONS.find((f) => f.code === code)?.label ?? code;
}
