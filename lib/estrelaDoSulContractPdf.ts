/**
 * Chrome PDF isolado — Chacreamento Estrela do Sul.
 */

import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import { formatCpfCnpj } from '@/lib/inputMasks';
import { formatCompanyAddressForHeader } from '@/lib/contractCompanyDisplay';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';

export function buildEstrelaDoSulPdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const { addressLine, cityUfLine } = formatCompanyAddressForHeader(tenant);
  return {
    tenantName: getCompanyDisplayName(tenant),
    tenantCnpj: formatCpfCnpj(String(tenant.cnpj || tenant.document || '')),
    tenantDocumentLabel: 'CNPJ',
    addressLine,
    cityUfLine,
    contractNumber,
    logoBase64,
  };
}
