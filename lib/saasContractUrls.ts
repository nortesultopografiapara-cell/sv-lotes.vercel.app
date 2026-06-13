/**
 * URLs oficiais do contrato SaaS — sempre via API (nunca storage URL direto).
 */

export type SaasContractPdfMode = 'inline' | 'download';

export function buildSaasContractPdfUrl(
  companyId: string,
  userId: string,
  mode: SaasContractPdfMode = 'inline',
  contractRecordId?: string | null,
): string {
  const params = new URLSearchParams({ userId });
  if (mode === 'download') {
    params.set('download', '1');
  } else {
    params.set('inline', '1');
  }
  if (contractRecordId) {
    params.set('contractId', contractRecordId);
  }
  return `/api/companies/${companyId}/contract?${params.toString()}`;
}
