/**
 * URLs oficiais do contrato SaaS — sempre via API (nunca storage URL direto).
 */

import { resolvePublicBaseUrl } from '@/lib/signatureVerifyUrls';

export type SaasContractPdfMode = 'inline' | 'download';

export function buildSaasContractPdfUrl(
  companyId: string,
  userId: string,
  mode: SaasContractPdfMode = 'inline',
  contractRecordId?: string | null,
  options?: { signed?: boolean },
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
  if (options?.signed) {
    params.set('signed', '1');
  }
  return `/api/companies/${companyId}/contract?${params.toString()}`;
}

export function buildSignUrl(token: string): string {
  const trimmed = String(token || '').trim();
  if (!trimmed) return '';
  return `${resolvePublicBaseUrl()}/sign/${encodeURIComponent(trimmed)}`;
}

export function buildSignApiUrl(token: string): string {
  return `/api/sign/${encodeURIComponent(token)}`;
}
