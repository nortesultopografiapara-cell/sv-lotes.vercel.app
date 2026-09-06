/**
 * Adapter Banco Inter — fino sobre classifiers e bank_charges já homologados.
 * Fase 5A: só listagem local + classificação. Sem POST /cobrancas/{id}/cancelar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyInterBankChargeForRelease } from '@/lib/finance/releaseLotShared';
import type {
  ExternalChargeProvider,
  ExternalChargeRecord,
  ListExternalChargesInput,
} from '@/lib/finance/externalCharges/types';
import {
  EXTERNAL_CHARGE_PROVIDER_INTER,
  mapReleaseBucketToExternalClassification,
  rejectExternalChargeMutation,
} from '@/lib/finance/externalCharges/types';

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

function mapRow(
  row: Record<string, unknown>,
  companyId: string,
  classify: ExternalChargeProvider['classifyChargeStatus'],
): ExternalChargeRecord | null {
  const chargeId = text(row.id);
  if (!chargeId) return null;
  const rowCompany = text(row.company_id);
  if (rowCompany && rowCompany !== companyId) return null;
  const provider = String(row.provider || '').trim().toUpperCase();
  if (provider && provider !== EXTERNAL_CHARGE_PROVIDER_INTER) return null;
  return {
    provider: EXTERNAL_CHARGE_PROVIDER_INTER,
    companyId,
    chargeId,
    saleId: text(row.sale_id),
    receiptId: text(row.finance_receipt_id) || text(row.installment_id),
    status: text(row.status),
    externalId: text(row.external_id),
    classification: classify(text(row.status)),
  };
}

export const interExternalChargeProvider: ExternalChargeProvider = {
  code: EXTERNAL_CHARGE_PROVIDER_INTER,
  displayName: 'Banco Inter',
  supportsCancellation: true,
  supportsGeneration: true,
  classifyChargeStatus(status) {
    return mapReleaseBucketToExternalClassification(
      classifyInterBankChargeForRelease(status),
    );
  },
  async listChargesForReceipts(admin: SupabaseClient, input: ListExternalChargesInput) {
    const companyId = String(input.companyId || '').trim();
    if (!companyId) return [];
    const receiptIds = (input.receiptIds || []).map((id) => String(id).trim()).filter(Boolean);
    const saleId = String(input.saleId || '').trim();
    const byId = new Map<string, ExternalChargeRecord>();

    const merge = (rows: Array<Record<string, unknown>> | null | undefined) => {
      for (const row of rows || []) {
        const mapped = mapRow(row, companyId, interExternalChargeProvider.classifyChargeStatus);
        if (mapped) byId.set(mapped.chargeId, mapped);
      }
    };

    if (receiptIds.length) {
      const byReceipt = await admin
        .from('bank_charges')
        .select(
          'id, company_id, sale_id, finance_receipt_id, status, external_id, provider',
        )
        .eq('company_id', companyId)
        .eq('provider', 'INTER')
        .in('finance_receipt_id', receiptIds);
      if (!byReceipt.error) merge((byReceipt.data || []) as Array<Record<string, unknown>>);
    }
    if (saleId) {
      const bySale = await admin
        .from('bank_charges')
        .select(
          'id, company_id, sale_id, finance_receipt_id, status, external_id, provider',
        )
        .eq('company_id', companyId)
        .eq('provider', 'INTER')
        .eq('sale_id', saleId);
      if (!bySale.error) merge((bySale.data || []) as Array<Record<string, unknown>>);
    }
    return [...byId.values()];
  },
  cancelCancelableCharge() {
    return rejectExternalChargeMutation();
  },
  generateMissingCharges() {
    return rejectExternalChargeMutation();
  },
};
