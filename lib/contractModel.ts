/**
 * Seleção do modelo de contrato de compra e venda por empresa.
 */

export const SALE_CONTRACT_MODELS = [
  'PADRAO',
  'SV_LOTES_2',
  'RECANTO_PRIMAVERA',
  'MENESES',
  'CUSTOM',
] as const;

export type SaleContractModel = (typeof SALE_CONTRACT_MODELS)[number];

export const SALE_CONTRACT_MODEL_LABELS: Record<SaleContractModel, string> = {
  PADRAO: 'Padrão SV LOTES',
  SV_LOTES_2: 'SV LOTES 2.0 (RECOMENDADO)',
  RECANTO_PRIMAVERA: 'Recanto Primavera',
  MENESES: 'Meneses',
  CUSTOM: 'Personalizado (futuro)',
};

export function normalizeSaleContractModel(
  raw: unknown,
): SaleContractModel {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');

  if (
    value === 'SV_LOTES_2' ||
    value === 'SV_LOTES_20' ||
    value.includes('SV_LOTES_2') ||
    value.includes('2_0')
  ) {
    return 'SV_LOTES_2';
  }
  if (value === 'RECANTO_PRIMAVERA' || value === 'RECANTO PRIMAVERA') {
    return 'RECANTO_PRIMAVERA';
  }
  if (value === 'MENESES') {
    return 'MENESES';
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

export function isSvLotes2ContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  return resolveSaleContractModel(company) === 'SV_LOTES_2';
}

/** Modelos que usam o template clássico (Meneses / Padrão SV LOTES). */
export function isClassicSaleContractModel(
  company: Record<string, unknown> | null | undefined,
): boolean {
  const model = resolveSaleContractModel(company);
  return model === 'PADRAO' || model === 'MENESES';
}

export {
  SALE_CONTRACT_SIGNATURE_CERTIFICATE_TITLE,
  SV_LOTES_2_CERTIFICATE_TITLE,
  resolveSaleContractCertificatePublicUrl,
  resolveSaleContractCertificateQrUrl,
} from '@/lib/saleContractSignatureVerify';
