import {
  DESISTENCIA_DOCUMENT_TITLE,
  DISTRATO_DOCUMENT_TITLE,
  INADIMPLENCIA_DOCUMENT_TITLE,
  type TerminationDocumentOperationType,
} from '@/lib/termination-documents/types';

const TITLES: Partial<Record<TerminationDocumentOperationType, string>> = {
  desistencia: DESISTENCIA_DOCUMENT_TITLE,
  distrato: DISTRATO_DOCUMENT_TITLE,
  inadimplencia: INADIMPLENCIA_DOCUMENT_TITLE,
  erro_cadastro: 'TERMO ADMINISTRATIVO DE CANCELAMENTO POR ERRO DE CADASTRO',
  cancelamento_administrativo: 'TERMO DE CANCELAMENTO ADMINISTRATIVO',
};

/** Desistência, Distrato e Inadimplência geram termo nesta fase. */
export function shouldGenerateTerminationDocument(
  operationType?: string | null,
): boolean {
  const key = String(operationType || '').trim();
  return key === 'desistencia' || key === 'distrato' || key === 'inadimplencia';
}

export function isDistratoTerminationOperation(operationType?: string | null): boolean {
  return String(operationType || '').trim() === 'distrato';
}

export function isInadimplenciaTerminationOperation(operationType?: string | null): boolean {
  return String(operationType || '').trim() === 'inadimplencia';
}

export function terminationDocumentTitleForType(
  operationType?: string | null,
): string {
  const key = String(operationType || '').trim() as TerminationDocumentOperationType;
  return TITLES[key] || 'TERMO DE OPERAÇÃO CONTRATUAL';
}
