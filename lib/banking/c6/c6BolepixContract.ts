/**
 * Leitura histórica da v1 não inventa Pix.
 * Novas emissões não usam /v1/bank_slips/.
 */

export const C6_BOLEPIX_OFFICIAL_SPEC_IN_REPO = false as const;
export const C6_BOLEPIX_OFFICIAL_PATH = '/v2/bank_slips' as const;
export const C6_BOLETO_V1_PATH = '/v1/bank_slips/' as const;

export const C6_BOLEPIX_UNAVAILABLE_MESSAGE =
  'A emissão C6 v1 foi desativada. O Bolepix v2 ainda não está liberado para chamada real.';

/** O contrato 1.7.2 do boleto não traz payload Pix. O retorno permanece nulo. */
export function c6PixCopyPasteFromBankSlip(_body: unknown): null {
  return null;
}
