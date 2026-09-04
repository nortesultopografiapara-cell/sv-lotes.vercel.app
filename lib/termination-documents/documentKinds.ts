/**
 * Mapeamento aditivo Desistência ↔ Distrato.
 * Não altera o discriminador de assinatura (TERMO) nem o template da Desistência.
 */

import {
  TERMINATION_DOCUMENT_PREFIX_DESISTENCIA,
  TERMINATION_DOCUMENT_PREFIX_DISTRATO,
} from '@/lib/termination-documents/numbering';
import { isDistratoTerminationOperation } from '@/lib/termination-documents/titles';
import {
  SALE_DOCUMENT_TYPE_DESISTENCIA,
  SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO,
  SALE_DOCUMENT_TYPE_DISTRATO,
  SALE_DOCUMENT_TYPE_DISTRATO_ASSINADO,
} from '@/lib/termination-documents/types';

export function terminationDocumentPrefixForType(operationType?: string | null): string {
  return isDistratoTerminationOperation(operationType)
    ? TERMINATION_DOCUMENT_PREFIX_DISTRATO
    : TERMINATION_DOCUMENT_PREFIX_DESISTENCIA;
}

export function terminationOriginalSaleDocumentType(
  operationType?: string | null,
): string {
  return isDistratoTerminationOperation(operationType)
    ? SALE_DOCUMENT_TYPE_DISTRATO
    : SALE_DOCUMENT_TYPE_DESISTENCIA;
}

export function terminationSignedSaleDocumentType(
  operationType?: string | null,
): string {
  return isDistratoTerminationOperation(operationType)
    ? SALE_DOCUMENT_TYPE_DISTRATO_ASSINADO
    : SALE_DOCUMENT_TYPE_DESISTENCIA_ASSINADO;
}

export function terminationDocumentFileSlug(operationType?: string | null): string {
  return isDistratoTerminationOperation(operationType) ? 'termo-distrato' : 'termo-desistencia';
}
