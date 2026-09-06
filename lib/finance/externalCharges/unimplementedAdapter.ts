/**
 * Adapter seguro para banco ainda não implementado (C6, Bradesco, Nubank…).
 * Não chama API. Não emite. Não cancela. Classifica qualquer cobrança
 * encontrada como non_cancelable para a Fase 5B revisar.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExternalChargeProvider,
  ExternalChargeRecord,
  ListExternalChargesInput,
} from '@/lib/finance/externalCharges/types';
import { rejectExternalChargeMutation } from '@/lib/finance/externalCharges/types';

function text(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function createUnimplementedExternalChargeProvider(
  code: string,
): ExternalChargeProvider {
  const providerCode = String(code || 'UNKNOWN').trim().toUpperCase() || 'UNKNOWN';
  return {
    code: providerCode,
    displayName: `${providerCode} (não implementado)`,
    supportsCancellation: false,
    supportsGeneration: false,
    classifyChargeStatus() {
      return 'non_cancelable';
    },
    async listChargesForReceipts(admin: SupabaseClient, input: ListExternalChargesInput) {
      const companyId = String(input.companyId || '').trim();
      if (!companyId) return [];
      const receiptIds = (input.receiptIds || [])
        .map((id) => String(id).trim())
        .filter(Boolean);
      const saleId = String(input.saleId || '').trim();
      const byId = new Map<string, ExternalChargeRecord>();
      const merge = (rows: Array<Record<string, unknown>> | null | undefined) => {
        for (const row of rows || []) {
          const chargeId = text(row.id);
          const rowCompany = text(row.company_id);
          if (!chargeId || (rowCompany && rowCompany !== companyId)) continue;
          const rowProvider = String(row.provider || '').trim().toUpperCase();
          if (rowProvider && rowProvider !== providerCode) continue;
          byId.set(chargeId, {
            provider: providerCode,
            companyId,
            chargeId,
            saleId: text(row.sale_id),
            receiptId: text(row.finance_receipt_id) || text(row.installment_id),
            status: text(row.status),
            externalId: text(row.external_id),
            classification: 'non_cancelable',
          });
        }
      };
      if (receiptIds.length) {
        const byReceipt = await admin
          .from('bank_charges')
          .select(
            'id, company_id, sale_id, finance_receipt_id, status, external_id, provider',
          )
          .eq('company_id', companyId)
          .eq('provider', providerCode)
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
          .eq('provider', providerCode)
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
}
