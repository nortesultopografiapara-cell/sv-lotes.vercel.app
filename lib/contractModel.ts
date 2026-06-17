/**
 * Seleção do modelo de contrato de compra e venda por empresa.
 */

export const SALE_CONTRACT_MODELS = [
  'PADRAO',
  'RECANTO_PRIMAVERA',
  'CUSTOM',
] as const;

export type SaleContractModel = (typeof SALE_CONTRACT_MODELS)[number];

export const SALE_CONTRACT_MODEL_LABELS: Record<SaleContractModel, string> = {
  PADRAO: 'Padrão SV LOTES',
  RECANTO_PRIMAVERA: 'Recanto Primavera',
  CUSTOM: 'Personalizado (futuro)',
};

export function normalizeSaleContractModel(
  raw: unknown,
): SaleContractModel {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
  if (value === 'RECANTO_PRIMAVERA' || value === 'RECANTO PRIMAVERA') {
    return 'RECANTO_PRIMAVERA';
  }
  if (value === 'CUSTOM' || value === 'PERSONALIZADO') {
    return 'CUSTOM';
  }
  return 'PADRAO';
}

export function resolveSaleContractModel(
  company: Record<string, unknown> | null | undefined,
): SaleContractModel {
  return normalizeSaleContractModel(company?.contract_model);
}

export function isRecantoPrimaveraContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleContractModel(company) === 'RECANTO_PRIMAVERA';
}
