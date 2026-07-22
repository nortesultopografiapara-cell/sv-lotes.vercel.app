/** Status de orçamento — SV Topografia & Projetos (Master). */

export const TOPOGRAPHY_QUOTE_STATUSES = [
  { code: 'RASCUNHO', label: 'Rascunho', color: '#94a3b8', order: 1, isFinal: false },
  { code: 'ENVIADO', label: 'Enviado', color: '#0284c7', order: 2, isFinal: false },
  { code: 'EM_NEGOCIACAO', label: 'Em negociação', color: '#d97706', order: 3, isFinal: false },
  { code: 'APROVADO', label: 'Aprovado', color: '#059669', order: 4, isFinal: false },
  { code: 'RECUSADO', label: 'Recusado', color: '#e11d48', order: 5, isFinal: true },
  { code: 'CANCELADO', label: 'Cancelado', color: '#64748b', order: 6, isFinal: true },
  { code: 'EXPIRADO', label: 'Expirado', color: '#b45309', order: 7, isFinal: true },
  { code: 'CONVERTIDO', label: 'Convertido em Projeto', color: '#1d4ed8', order: 8, isFinal: true },
] as const;

export type TopographyQuoteStatusCode = (typeof TOPOGRAPHY_QUOTE_STATUSES)[number]['code'];

export const TOPOGRAPHY_QUOTE_ACTIVE_STATUS_CODES: TopographyQuoteStatusCode[] =
  TOPOGRAPHY_QUOTE_STATUSES.filter((s) => !s.isFinal).map((s) => s.code);

export function isTopographyQuoteStatus(value: string): value is TopographyQuoteStatusCode {
  return TOPOGRAPHY_QUOTE_STATUSES.some((s) => s.code === value);
}

export function topographyQuoteStatusMeta(code: string) {
  return TOPOGRAPHY_QUOTE_STATUSES.find((s) => s.code === code) ?? null;
}

export function topographyQuoteStatusLabel(code: string): string {
  return topographyQuoteStatusMeta(code)?.label ?? code;
}
