/**
 * Helpers client-safe para localizar e expor contratos SaaS assinados.
 */

import { isFullySignedContract } from '@/lib/saasContractBilateralSignature';
import type { CompanyContractRow } from '@/lib/saasContractService';
import type { CompanyContractSignatureRow } from '@/lib/saasContractSignatureService';

function sanitizeContractFileName(contractNumber: string): string {
  return contractNumber.replace(/[^\w-]+/g, '_');
}

export function buildSignedPdfStoragePath(
  companyId: string,
  contractNumber: string,
  version?: number,
): string {
  const safeName = sanitizeContractFileName(contractNumber);
  const suffix = version && version > 1 ? `_v${version}` : '';
  return `contracts/saas/${companyId}/${safeName}${suffix}_signed.pdf`;
}

export function resolveSaasSignedContractRecord(
  contracts: CompanyContractRow[],
  signature: CompanyContractSignatureRow | null | undefined,
): CompanyContractRow | null {
  if (signature?.contract_id) {
    const linked = contracts.find((c) => c.id === signature.contract_id);
    if (linked) return linked;
  }
  const withSignedUrl = contracts.find((c) => Boolean(c.pdf_signed_url?.trim()));
  if (withSignedUrl) return withSignedUrl;
  return (
    contracts.find((c) => {
      const st = String(c.status || '').toLowerCase();
      return st === 'signed' || st === 'active';
    }) ?? null
  );
}

export function hasSaasSignedDocumentAccess(
  contract: CompanyContractRow | null | undefined,
  signature: CompanyContractSignatureRow | null | undefined,
): boolean {
  if (Boolean(contract?.pdf_signed_url?.trim())) return true;
  if (isFullySignedContract(signature?.signature_status)) return true;
  const st = String(contract?.status || '').toLowerCase();
  return st === 'signed' || st === 'active';
}
