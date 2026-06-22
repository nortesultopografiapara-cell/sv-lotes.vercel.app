/**
 * Chrome PDF isolado para contratos Recanto Primavera.
 */

import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import {
  formatRecantoVendorAddressForPdfHeader,
  normalizeRecantoPrimaveraCompanyProfile,
} from '@/lib/recantoPrimaveraCompanyProfile';

export function buildRecantoPrimaveraPdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const profile = normalizeRecantoPrimaveraCompanyProfile(tenant);
  const { addressLine, cityUfLine } =
    formatRecantoVendorAddressForPdfHeader(profile);

  return {
    tenantName: profile.vendorName || getCompanyDisplayName(tenant),
    tenantCnpj: profile.documentFmt,
    tenantDocumentLabel: profile.documentLabel,
    addressLine,
    cityUfLine,
    contractNumber,
    logoBase64,
  };
}
