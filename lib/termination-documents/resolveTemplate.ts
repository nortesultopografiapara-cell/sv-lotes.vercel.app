/**
 * Resolução do HTML do termo.
 * Hoje: modelo padrão SV LOTES por tipo de operação.
 * Futuro: modelo específico de projeto/empresa → fallback no padrão abaixo.
 * Sem coluna/migration nesta etapa — contractModel é reservado para o gancho.
 */

import { buildDesistenciaTermHtml } from '@/lib/termination-documents/desistenciaTemplate';
import { buildDistratoTermHtml } from '@/lib/termination-documents/distratoTemplate';
import { buildInadimplenciaTermHtml } from '@/lib/termination-documents/inadimplenciaTemplate';
import {
  isDistratoTerminationOperation,
  isInadimplenciaTerminationOperation,
} from '@/lib/termination-documents/titles';
import type { TerminationDocumentSnapshot } from '@/lib/termination-documents/types';

export type TerminationDocumentHtmlBuilder = (
  snap: Omit<TerminationDocumentSnapshot, 'html' | 'contentHash'>,
) => string;

export function resolveTerminationDocumentHtmlBuilder(input: {
  operationType?: string | null;
  /** Reservado: modelo de contrato/projeto/empresa. Não ramifica nesta etapa. */
  contractModel?: string | null;
}): TerminationDocumentHtmlBuilder {
  void input.contractModel;
  if (isInadimplenciaTerminationOperation(input.operationType)) {
    return buildInadimplenciaTermHtml;
  }
  if (isDistratoTerminationOperation(input.operationType)) {
    return buildDistratoTermHtml;
  }
  return buildDesistenciaTermHtml;
}
