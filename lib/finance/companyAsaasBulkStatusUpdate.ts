import type { SupabaseClient } from '@supabase/supabase-js';
import { getLatestCompanyAsaasChargeForInstallment } from './companyAsaasChargeRepository';
import type { CompanyAsaasChargeResponse } from './companyAsaasChargeTypes';
import { getCompanyChargeStatusByInstallment } from './asaasCompanyChargeService';
import {
  isReceiptPaidStatus,
  loadFinanceReceiptForReconciliation,
} from './companyAsaasPaymentReconciliation';

export const COMPANY_ASAAS_BULK_STATUS_MAX_IDS = 250;

export type BulkCompanyChargeStatusItem = {
  installmentId: string;
  chargeId?: string;
  charge?: CompanyAsaasChargeResponse | null;
  receiptUpdated?: boolean;
  status: 'paid' | 'pending' | 'skipped' | 'failed';
  error?: string;
};

export type BulkUpdateCompanyChargeStatusResult = {
  updated: number;
  paid: number;
  pending: number;
  failed: number;
  skipped: number;
  receiptUpdatedCount: number;
  items: BulkCompanyChargeStatusItem[];
};

function normalizeInstallmentIds(installmentIds: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of installmentIds) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }
  return normalized;
}

/**
 * Consulta Asaas e reconcilia parcelas em lote — idempotente; falha em uma não interrompe as demais.
 */
export async function bulkUpdateCompanyChargeStatuses(
  admin: SupabaseClient,
  companyId: string,
  installmentIds: string[],
): Promise<BulkUpdateCompanyChargeStatusResult> {
  const ids = normalizeInstallmentIds(installmentIds).slice(0, COMPANY_ASAAS_BULK_STATUS_MAX_IDS);

  const result: BulkUpdateCompanyChargeStatusResult = {
    updated: 0,
    paid: 0,
    pending: 0,
    failed: 0,
    skipped: 0,
    receiptUpdatedCount: 0,
    items: [],
  };

  for (const installmentId of ids) {
    try {
      const existing = await getLatestCompanyAsaasChargeForInstallment(
        admin,
        companyId,
        installmentId,
      );

      if (!existing) {
        result.skipped += 1;
        result.items.push({
          installmentId,
          status: 'skipped',
          error: 'Cobrança Asaas não gerada para esta parcela.',
        });
        continue;
      }

      if (existing.status === 'CANCELLED') {
        result.skipped += 1;
        result.items.push({
          installmentId,
          chargeId: existing.id,
          charge: existing,
          status: 'skipped',
          error: 'Cobrança cancelada.',
        });
        continue;
      }

      const receiptBefore = await loadFinanceReceiptForReconciliation(admin, installmentId);
      const wasReceiptPaid = isReceiptPaidStatus(receiptBefore?.status);

      const refreshed = await getCompanyChargeStatusByInstallment(
        admin,
        companyId,
        installmentId,
      );

      if (!refreshed) {
        result.skipped += 1;
        result.items.push({
          installmentId,
          status: 'skipped',
          error: 'Cobrança não encontrada após sincronização.',
        });
        continue;
      }

      const receiptAfter = await loadFinanceReceiptForReconciliation(admin, installmentId);
      const receiptUpdated =
        !wasReceiptPaid && isReceiptPaidStatus(receiptAfter?.status);
      if (receiptUpdated) {
        result.receiptUpdatedCount += 1;
      }

      result.updated += 1;

      if (refreshed.status === 'PAID') {
        result.paid += 1;
        result.items.push({
          installmentId,
          chargeId: refreshed.id,
          charge: refreshed,
          receiptUpdated,
          status: 'paid',
        });
      } else {
        result.pending += 1;
        result.items.push({
          installmentId,
          chargeId: refreshed.id,
          charge: refreshed,
          receiptUpdated,
          status: 'pending',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const existing =
        (await getLatestCompanyAsaasChargeForInstallment(admin, companyId, installmentId).catch(
          () => null,
        )) ?? null;
      result.failed += 1;
      result.items.push({
        installmentId,
        chargeId: existing?.id,
        charge: existing,
        status: 'failed',
        error: message,
      });
    }
  }

  return result;
}
