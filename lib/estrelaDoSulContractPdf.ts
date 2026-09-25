/**
 * Chrome PDF isolado — modelo ESTRELA_DO_SUL / LF Imóveis.
 */

import {
  cleanCompanyAddressLine,
  getCompanyDisplayName,
} from '@/lib/contractCompanyDisplay';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { toContractTitleCase } from '@/lib/contractTitleCase';
import { formatCpfCnpj } from '@/lib/inputMasks';
import type { ContractPdfChromeInput } from '@/lib/contractPdfPostProcess';

/** Número predial explícito (N 99, Nº 10, , 100). Não usa o 24 de "Rua 24 de Março". */
export function lfCompanyAddressHasStreetNumber(address: string): boolean {
  const raw = String(address || '').trim();
  if (!raw) return false;
  const withoutSn = raw.replace(/,?\s*S\s*\/\s*N\b/gi, '').trim();
  if (!withoutSn) return false;
  if (/\bN[º°o.]?\s*\d+/i.test(withoutSn)) return true;
  if (/\bn[úu]mero\s*\d+/i.test(withoutSn)) return true;
  const withoutQuadraLote = withoutSn
    .replace(/\bquadra\s+\d+/gi, ' ')
    .replace(/\blote\s+\d+/gi, ' ');
  return /,\s*\d+\b/.test(withoutQuadraLote);
}

export function normalizeLfCompanyAddressLine(address: string): string {
  const s = cleanCompanyAddressLine(address);
  if (!s) return '';
  if (lfCompanyAddressHasStreetNumber(s)) {
    return s.replace(/,?\s*S\s*\/\s*N\s*$/i, '').replace(/,\s*$/g, '').trim();
  }
  if (/S\/N/i.test(s)) return s;
  return `${s}, S/N`;
}

function formatLfHeaderAddressTitle(address: string): string {
  return toContractTitleCase(address).replace(/\b(D[aeo]s?)\b/g, (token) =>
    token.toLowerCase(),
  );
}

export function formatLfCompanyAddressForHeader(
  company: Record<string, unknown> | null | undefined,
): { addressLine: string; cityUfLine: string } {
  const seller = normalizeSellerFromCompany(company);
  const addressLine =
    seller.address !== 'Não informado'
      ? formatLfHeaderAddressTitle(normalizeLfCompanyAddressLine(seller.address))
      : '';
  const city =
    seller.city !== 'Não informado' ? toContractTitleCase(seller.city) : '';
  const state =
    seller.state !== 'Não informado' ? seller.state.toUpperCase() : '';
  const cityUfLine = city && state ? `${city} - ${state}` : city || state || '';
  return { addressLine, cityUfLine };
}

export function buildEstrelaDoSulPdfChrome(
  tenant: Record<string, unknown>,
  contractNumber: string,
  logoBase64: string | null = null,
): ContractPdfChromeInput {
  const { addressLine, cityUfLine } = formatLfCompanyAddressForHeader(tenant);
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
