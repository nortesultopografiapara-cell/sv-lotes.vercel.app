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

export const TERMINATION_SHARE_MODAL_HEADING = 'Termo enviado para assinatura';

export const DESISTENCIA_SHARE_MODAL_DESCRIPTION =
  'Termo de Desistência, Rescisão Contratual e Acerto Financeiro. Cada participante possui link e contatos próprios.';

export const INADIMPLENCIA_SHARE_MODAL_DESCRIPTION =
  'Termo de Rescisão Contratual por Inadimplência. Cada participante possui link e contatos próprios.';

/** Cópia do modal compartilhado de envio — não altera WhatsApp, e-mail, QR nem o fluxo de assinatura. */
export function terminationShareModalDescription(input?: {
  operationType?: string | null;
  documentType?: string | null;
  title?: string | null;
}): string {
  const type = String(input?.documentType || '')
    .trim()
    .toUpperCase();
  const title = String(input?.title || '')
    .trim()
    .toUpperCase();
  if (
    isInadimplenciaTerminationOperation(input?.operationType) ||
    type === 'INADIMPLENCIA' ||
    type === 'INADIMPLENCIA_ASSINADO' ||
    title.includes('POR INADIMPLÊNCIA') ||
    title.includes('POR INADIMPLENCIA')
  ) {
    return INADIMPLENCIA_SHARE_MODAL_DESCRIPTION;
  }
  return DESISTENCIA_SHARE_MODAL_DESCRIPTION;
}

export function terminationDocumentTitleForType(
  operationType?: string | null,
): string {
  const key = String(operationType || '').trim() as TerminationDocumentOperationType;
  return TITLES[key] || 'TERMO DE OPERAÇÃO CONTRATUAL';
}
