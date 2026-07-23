import type { MasterTopographyQuote } from './quoteTypes';

/**
 * Exclusão definitiva permitida apenas para rascunho sem conversão/aprovação.
 * Função pura — segura para UI e API.
 */
export function canPermanentlyDeleteTopographyQuote(
  quote: Pick<
    MasterTopographyQuote,
    'status' | 'converted_project_id' | 'approved_at'
  >,
): { ok: true } | { ok: false; reason: string } {
  if (quote.converted_project_id) {
    return { ok: false, reason: 'Orçamento convertido em projeto não pode ser excluído.' };
  }
  if (quote.status === 'CONVERTIDO') {
    return { ok: false, reason: 'Orçamento convertido em projeto não pode ser excluído.' };
  }
  if (quote.status === 'APROVADO' || quote.approved_at) {
    return {
      ok: false,
      reason: 'Orçamento aprovado não pode ser excluído definitivamente. Use Arquivar.',
    };
  }
  if (quote.status !== 'RASCUNHO') {
    return {
      ok: false,
      reason:
        'Somente orçamentos em Rascunho podem ser excluídos definitivamente. Use Arquivar para os demais.',
    };
  }
  return { ok: true };
}
