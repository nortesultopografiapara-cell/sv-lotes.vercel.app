/**
 * Mapeamento aditivo Desistência ↔ Distrato ↔ Inadimplência.
 * Não altera o discriminador de assinatura (TERMO) nem o template da Desistência.
 */

import {
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
  TERMINATION_DOCUMENT_PREFIX_DISTRATO,
  TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA,
} from '@/lib/termination-documents/numbering';
import {
  isDistratoTerminationOperation,
  isInadimplenciaTerminationOperation,
} from '@/lib/termination-documents/titles';
import {
  SALE_DOCUMENT_TYPE_DESISTENCIA,
  SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO,
  SALE_DOCUMENT_TYPE_DISTRATO,
  SALE_DOCUMENT_TYPE_DISTRATO_ASSINADO,
  SALE_DOCUMENT_TYPE_INADIMPLENCIA,
  SALE_DOCUMENT_TYPE_INADIMPLENCIA_ASSINADO,
} from '@/lib/termination-documents/types';

export function terminationDocumentPrefixForType(operationType?: string | null): string {
  if (isInadimplenciaTerminationOperation(operationType)) {
    return TERMINATION_DOCUMENT_PREFIX_INADIMPLENCIA;
  }
  if (isDistratoTerminationOperation(operationType)) {
    return TERMINATION_DOCUMENT_PREFIX_DISTRATO;
  }
  return TERMINATION_DOCUMENT_PREFIX_DESISTENCIA;
}

export function terminationOriginalSaleDocumentType(
  operationType?: string | null,
): string {
  if (isInadimplenciaTerminationOperation(operationType)) {
    return SALE_DOCUMENT_TYPE_INADIMPLENCIA;
  }
  if (isDistratoTerminationOperation(operationType)) {
    return SALE_DOCUMENT_TYPE_DISTRATO;
  }
  return SALE_DOCUMENT_TYPE_DESISTENCIA;
}

export function terminationSignedSaleDocumentType(
  operationType?: string | null,
): string {
  if (isInadimplenciaTerminationOperation(operationType)) {
    return SALE_DOCUMENT_TYPE_INADIMPLENCIA_ASSINADO;
  }
  if (isDistratoTerminationOperation(operationType)) {
    return SALE_DOCUMENT_TYPE_DISTRATO_ASSINADO;
  }
  return SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO;
}

export function terminationDocumentFileSlug(operationType?: string | null): string {
  if (isInadimplenciaTerminationOperation(operationType)) return 'termo-inadimplencia';
  if (isDistratoTerminationOperation(operationType)) return 'termo-distrato';
  return 'termo-desistencia';
}
