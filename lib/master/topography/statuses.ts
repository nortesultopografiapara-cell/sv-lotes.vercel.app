/** Status de projeto corporativo — SV Topografia & Projetos (Master). */

export const TOPOGRAPHY_STATUSES = [
  { code: 'RASCUNHO', label: 'Rascunho', color: '#94a3b8', order: 1, isFinal: false },
  { code: 'PROPOSTA', label: 'Proposta', color: '#64748b', order: 2, isFinal: false },
  { code: 'AGUARDANDO_APROVACAO', label: 'Aguardando aprovação', color: '#d97706', order: 3, isFinal: false },
  { code: 'APROVADO', label: 'Aprovado', color: '#059669', order: 4, isFinal: false },
  { code: 'PLANEJAMENTO', label: 'Planejamento', color: '#0284c7', order: 5, isFinal: false },
  { code: 'EM_MOBILIZACAO', label: 'Em mobilização', color: '#0891b2', order: 6, isFinal: false },
  { code: 'EM_CAMPO', label: 'Em campo', color: '#1d4ed8', order: 7, isFinal: false },
  { code: 'EM_PROCESSAMENTO', label: 'Em processamento', color: '#7c3aed', order: 8, isFinal: false },
  { code: 'EM_ANALISE', label: 'Em análise', color: '#6d28d9', order: 9, isFinal: false },
  { code: 'AGUARDANDO_CLIENTE', label: 'Aguardando cliente', color: '#ea580c', order: 10, isFinal: false },
  { code: 'AGUARDANDO_DOCUMENTACAO', label: 'Aguardando documentação', color: '#c2410c', order: 11, isFinal: false },
  { code: 'EM_EXECUCAO', label: 'Em execução', color: '#2563eb', order: 12, isFinal: false },
  { code: 'PAUSADO', label: 'Pausado', color: '#b45309', order: 13, isFinal: false },
  { code: 'CONCLUIDO', label: 'Concluído', color: '#059669', order: 14, isFinal: true },
  { code: 'CANCELADO', label: 'Cancelado', color: '#e11d48', order: 15, isFinal: true },
  { code: 'ARQUIVADO', label: 'Arquivado', color: '#64748b', order: 16, isFinal: true },
] as const;

export type TopographyStatusCode = (typeof TOPOGRAPHY_STATUSES)[number]['code'];

/** Status considerados ativos para KPI (não finais e não rascunho puro de arquivo). */
export const TOPOGRAPHY_ACTIVE_STATUS_CODES: TopographyStatusCode[] = TOPOGRAPHY_STATUSES
  .filter((s) => !s.isFinal)
  .map((s) => s.code);

export function isTopographyStatus(value: string): value is TopographyStatusCode {
  return TOPOGRAPHY_STATUSES.some((s) => s.code === value);
}

export function topographyStatusMeta(code: string) {
  return TOPOGRAPHY_STATUSES.find((s) => s.code === code) ?? null;
}

export function topographyStatusLabel(code: string): string {
  return topographyStatusMeta(code)?.label ?? code;
}
