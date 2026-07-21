/**
 * Chrome PDF — modelo SV LOTES 2.0 (visual moderno).
 */

import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';
import { buildSvLotes2SellerFromCompany } from '@/lib/svLotes2ContractFormat';
import { toContractTitleCase } from '@/lib/contractTitleCase';

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text && text.toLowerCase() !== 'não informado') return text;
  }
  return '';
}

function toTitleCase(str: string): string {
  return toContractTitleCase(str);
}

export function buildSvLotes2PdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const seller = buildSvLotes2SellerFromCompany(tenant);
  const legalName = toTitleCase(
    pickString(tenant.razao_social, tenant.name, seller.displayName),
  );
  const cityUfLine =
    seller.city && seller.state
      ? `${seller.city} - ${seller.state}`
      : seller.city || seller.state || '';

  return {
    tenantName: legalName,
    tenantCnpj: seller.documentFmt,
    tenantDocumentLabel: seller.documentLabel,
    addressLine: seller.addressLine,
    cityUfLine,
    tenantCep: seller.cepFmt,
    tenantPhone: seller.phone,
    tenantEmail: seller.email,
    contractNumber,
    logoBase64,
    printStyle: 'sv-lotes-2',
  };
}
