/**
 * Chrome PDF — modelo SV LOTES 2.0 (visual moderno).
 */

import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import {
  formatSvLotes2CityUfLine,
} from '@/lib/svLotes2ContractFormat';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import { formatCpfCnpj } from '@/lib/inputMasks';

export function buildSvLotes2PdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const docRaw = String(tenant.representative_cpf || tenant.cnpj || tenant.document || '');
  const docDigits = docRaw.replace(/\D/g, '');
  const docLabel = docDigits.length === 11 ? 'CPF' : 'CNPJ';

  return {
    tenantName: getCompanyDisplayName(tenant),
    tenantCnpj: formatCpfCnpj(docRaw),
    tenantDocumentLabel: docLabel,
    addressLine: '',
    cityUfLine: formatSvLotes2CityUfLine(tenant),
    contractNumber,
    logoBase64,
    printStyle: 'sv-lotes-2',
  };
}
