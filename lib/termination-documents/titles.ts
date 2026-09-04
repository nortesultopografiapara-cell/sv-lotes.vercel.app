import {
  DESISTENCIA_DOCUMENT_TITLE,
  DISTRATO_DOCUMENT_TITLE,
  type TerminationDocumentOperationType,
} from '@/lib/termination-documents/types';

const TITLES: Partial<Record<TerminationDocumentOperationType, string>> = {
  desistencia: DESISTENCIA_DOCUMENT_TITLE,
  distrato: DISTRATO_DOCUMENT_TITLE,
  inadimplencia: 'TERMO DE RESCISÃO CONTRATUAL POR INADIMPLEMENTO',
  erro_cadastro: 'TERMO ADMINISTRATIVO DE CANCELAMENTO POR ERRO DE CADASTRO',
  cancelamento_administrativo: 'TERMO DE CANCELAMENTO ADMINISTRATIVO',
};

/** Desistência e Distrato geram termo nesta fase. Demais cards permanecem sem documento. */
export function shouldGenerateTerminationDocument(
  operationType?: string | null,
): boolean {
  const key = String(operationType || '').trim();
  return key === 'desistencia' || key === 'distrato';
}

export function isDistratoTerminationOperation(operationType?: string | null): boolean {
  return String(operationType || '').trim() === 'distrato';
}

export function terminationDocumentTitleForType(
  operationType?: string | null,
): string {
  const key = String(operationType || '').trim() as TerminationDocumentOperationType;
  return TITLES[key] || 'TERMO DE OPERAÇÃO CONTRATUAL';
}
