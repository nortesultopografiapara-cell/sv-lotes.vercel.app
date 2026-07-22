/**
 * Mapeamento Topografia category → nome sugerido de categoria financeira INCOME.
 * Resolução por nome (ilike) nas categorias Master; se não achar, fica manual.
 */
export const TOPOGRAPHY_TO_INCOME_CATEGORY_HINTS: Record<string, string[]> = {
  TOPOGRAFIA: ['Serviços de Topografia', 'Topografia'],
  GEORREFERENCIAMENTO: ['Georreferenciamento'],
  DRONE: ['Drone'],
  LIDAR: ['LiDAR', 'Lidar'],
  PROJETOS: ['Projetos'],
  REGULARIZACAO: ['Consultoria', 'Outros Recebimentos'],
  OBRAS: ['Projetos', 'Outros Recebimentos'],
  CONSULTORIA: ['Consultoria'],
};

export function incomeCategoryHintsForTopography(category: string): string[] {
  return TOPOGRAPHY_TO_INCOME_CATEGORY_HINTS[category] || ['Outros Recebimentos'];
}

/** Tenta mapear payment_terms / payment_method texto → enum corporativo. */
export function mapProjectPaymentMethod(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase();
  if (!s) return null;
  if (s.includes('PIX')) return 'PIX';
  if (s.includes('TED')) return 'TED';
  if (s.includes('DOC')) return 'DOC';
  if (s.includes('BOLETO')) return 'BOLETO';
  if (s.includes('DINHEIRO') || s.includes('CASH') || s.includes('ESPÉCIE') || s.includes('ESPECIE')) {
    return 'CASH';
  }
  if (s.includes('CARTÃO') || s.includes('CARTAO') || s.includes('CARD')) return 'CARD';
  if (s.includes('TRANSFER')) return 'TRANSFER';
  if (s.includes('CHEQUE') || s.includes('CHECK')) return 'CHECK';
  const exact = ['PIX', 'TED', 'DOC', 'BOLETO', 'CASH', 'CARD', 'TRANSFER', 'CHECK', 'OTHER'];
  if (exact.includes(s)) return s;
  return null;
}
