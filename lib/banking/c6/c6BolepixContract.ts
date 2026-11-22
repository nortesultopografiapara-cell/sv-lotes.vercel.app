/**
 * Bolepix é outra API (/v2/bank_slips). O OpenAPI dela não está neste repositório.
 * A emissão implementada usa somente o boleto oficial 1.7.2 em /v1/bank_slips/.
 * Nenhum campo Pix é inventado no corpo nem lido de uma chave não documentada.
 */

export const C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO = false as const;
export const C6_BOLEPIX_OFFICIAL_PATH = '/v2/bank_slips' as const;
export const C6_BOLETO_V1_PATH = '/v1/bank_slips/' as const;

export const C6_BOLEPIX_UNAVAILABLE_MESSAGE =
  'Boleto Pix C6 exige o OpenAPI /v2/bank_slips, ausente neste repositório. A emissão usa o boleto /v1/bank_slips/ e não envia QR Pix.';

/** O contrato 1.7.2 do boleto não traz payload Pix. O retorno permanece nulo. */
export function c6PixCopyPasteFromBankSlip(_body: unknown): null {
  return null;
}
