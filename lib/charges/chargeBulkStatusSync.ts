import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import type { BulkUpdateCompanyChargeStatusResult } from '@/lib/finance/companyAsaasBulkStatusUpdate';

export type ChargeBulkStatusSyncResponse = BulkUpdateCompanyChargeStatusResult;

export async function requestChargeBulkStatusSync(
  installmentIds: string[],
): Promise<ChargeBulkStatusSyncResponse> {
  const res = await fetch('/api/finance/asaas/update-charge-status-bulk', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ installmentIds }),
  });
  const json = (await res.json().catch(() => ({}))) as ChargeBulkStatusSyncResponse & {
    error?: string;
  };
  if (!res.ok) {
    throw new Error(json.error || `Erro ${res.status}`);
  }
  return json;
}

export function applyBulkChargeStatusToMap(
  current: Record<string, CompanyAsaasChargeResponse>,
  result: ChargeBulkStatusSyncResponse,
): Record<string, CompanyAsaasChargeResponse> {
  const next = { ...current };
  for (const item of result.items) {
    if (item.charge) {
      next[item.installmentId] = item.charge;
    }
  }
  return next;
}

export function formatChargeBulkStatusSummary(result: ChargeBulkStatusSyncResponse): string {
  const parts: string[] = [];
  if (result.paid > 0) {
    parts.push(`${result.paid} paga(s)`);
  }
  if (result.pending > 0) {
    parts.push(`${result.pending} pendente(s)`);
  }
  if (result.receiptUpdatedCount > 0) {
    parts.push(`${result.receiptUpdatedCount} parcela(s) baixada(s)`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} ignorada(s)`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} falha(s)`);
  }
  if (parts.length === 0) {
    return 'Nenhuma cobrança Asaas para atualizar.';
  }
  return `Status atualizado: ${parts.join(', ')}.`;
}
