/**
 * Mensagens HTTP — validação de Contratos Antigos.
 */

import { LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE } from '@/lib/imports/modules/legacy-contracts/uploadLimits';

export function getLegacyContractValidationHttpErrorMessage(
  status: number,
  payload: Record<string, unknown>,
): string {
  const apiError =
    (typeof payload.error === 'string' && payload.error) ||
    (typeof payload.message === 'string' && payload.message);

  if (apiError) return apiError;

  if (status === 413) {
    return LEGACY_CONTRACT_PAYLOAD_TOO_LARGE_MESSAGE;
  }

  return `Falha na validação dos arquivos (${status}).`;
}
