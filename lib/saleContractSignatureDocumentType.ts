/**
 * Discriminador do documento assinado no mesmo motor (contract_signatures).
 * TERMO reutiliza tokens/parties/página pública sem ser o contrato de venda.
 */

export const SALE_CONTRACT_SIGNED_DOCUMENT_TYPE = 'CONTRATO_VENDA';
export const TERMINATION_SIGNED_DOCUMENT_TYPE = 'TERMO';

export function isTerminationSaleSignature(row: {
  signed_document_type?: string | null;
} | null | undefined): boolean {
  const t = String(row?.signed_document_type || '')
    .trim()
    .toUpperCase();
  return t === 'TERMO' || t === 'DESISTENCIA' || t === 'TERMINATION';
}

export function excludeTerminationSignatures<
  T extends { signed_document_type?: string | null },
>(rows: T[]): T[] {
  return rows.filter((row) => !isTerminationSaleSignature(row));
}

export function pickLatestNonTerminationSignature<
  T extends { signed_document_type?: string | null },
>(rows: T[] | null | undefined): T | null {
  return excludeTerminationSignatures(rows || [])[0] || null;
}

export function isCanceledSaleContractStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'cancelado' || st === 'cancelled' || st === 'canceled';
}

export function isSignedSaleContractStatus(status?: string | null): boolean {
  const st = String(status || '')
    .trim()
    .toLowerCase();
  return st === 'assinado' || st === 'signed';
}

/**
 * Vigência comercial do contrato original.
 * CONTRACT (e legado sem tipo): cancelado bloqueia a assinatura.
 * TERMO: o contrato original costuma estar cancelado após a desistência — não bloqueia.
 */
export function canceledOriginalContractBlocksSignature(input: {
  signedDocumentType?: string | null;
  contractStatus?: string | null;
}): boolean {
  if (
    isTerminationSaleSignature({
      signed_document_type: input.signedDocumentType,
    })
  ) {
    return false;
  }
  return isCanceledSaleContractStatus(input.contractStatus);
}
