import {
  DESISTENCIA_DOCUMENT_TITLE,
  type TerminationDocumentOperationType,
} from '@/lib/termination-documents/types';

const TITLES: Partial<Record<TerminationDocumentOperationType, string>> = {
  desistencia: DESISTENCIA_DOCUMENT_TITLE,
  distrato: 'INSTRUMENTO PARTICULAR DE DISTRATO E ACERTO FINANCEIRO',
  inadimplencia: 'TERMO DE RESCISÃO CONTRATUAL POR INADIMPLEMENTO',
  erro_cadastro: 'TERMO ADMINISTRATIVO DE CANCELAMENTO POR ERRO DE CADASTRO',
  cancelamento_administrativo: 'TERMO DE CANCELAMENTO ADMINISTRATIVO',
};

/** Apenas desistência gera termo nesta fase. */
export function shouldGenerateTerminationDocument(
  operationType?: string | null,
): boolean {
  return String(operationType || '').trim() === 'desistencia';
}

export function terminationDocumentTitleForType(
  operationType?: string | null,
): string {
  const key = String(operationType || '').trim() as TerminationDocumentOperationType;
  return TITLES[key] || 'TERMO DE OPERAÇÃO CONTRATUAL';
}
