/**
 * Adapter Asaas Company — fino sobre classifiers e services oficiais.
 * Cancel/generate reutilizam cancelCompanyCharge e createCompanyInstallmentCharge.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelCompanyCharge, createCompanyInstallmentCharge } from '@/lib/finance/asaasCompanyChargeService';
import { classifyAsaasChargeForRelease } from '@/lib/finance/releaseLotShared';
import { getExternalChargeMutationFns } from '@/lib/finance/externalCharges/mutationDeps';
import type {
  ExternalChargeProvider,
  ExternalChargeRecord,
  ListExternalChargesInput,
} from '@/lib/finance/externalCharges/types';
import {
  EXTERNAL_CHARGE_PROVIDER_ASAAS,
  mapReleaseBucketToExternalClassification,
} from '@/lib/finance/externalCharges/types';
import type { ExternalChargeGenerateResult } from '@/lib/finance/externalCharges/mutationTypes';

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
  return {
    provider: EXTERNAL_CHARGE_PROVIDER_ASAAS,
    companyId,
    chargeId,
    saleId: text(row.sale_id),
    receiptId: text(row.installment_id),
    status: text(row.status),
    externalId: text(row.asaas_payment_id),
    classification: classify(text(row.status)),
  };
}

export const asaasExternalChargeProvider: ExternalChargeProvider = {
  code: EXTERNAL_CHARGE_PROVIDER_ASAAS,
  displayName: 'Asaas',
  supportsCancellation: true,
  supportsGeneration: true,
  classifyChargeStatus(status) {
    return mapReleaseBucketToExternalClassification(
      classifyAsaasChargeForRelease(status),
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
        const mapped = mapRow(row, companyId, asaasExternalChargeProvider.classifyChargeStatus);
        if (mapped) byId.set(mapped.chargeId, mapped);
      }
    };

    if (receiptIds.length) {
      const byReceipt = await admin
        .from('company_asaas_charges')
        .select('id, company_id, sale_id, installment_id, status, asaas_payment_id')
        .eq('company_id', companyId)
        .in('installment_id', receiptIds);
      if (!byReceipt.error) merge((byReceipt.data || []) as Array<Record<string, unknown>>);
    }
    if (saleId) {
      const bySale = await admin
        .from('company_asaas_charges')
        .select('id, company_id, sale_id, installment_id, status, asaas_payment_id')
        .eq('company_id', companyId)
        .eq('sale_id', saleId);
      if (!bySale.error) merge((bySale.data || []) as Array<Record<string, unknown>>);
    }
    return [...byId.values()];
  },
  async cancelCancelableCharge(admin, input) {
    const companyId = String(input.companyId || '').trim();
    const chargeId = String(input.chargeId || '').trim();
    if (!companyId || !chargeId) throw new Error('companyId e chargeId obrigatórios.');
    const injected = getExternalChargeMutationFns().cancelAsaasCharge;
    if (injected) return injected(admin, companyId, chargeId);

    const { data, error } = await admin
      .from('company_asaas_charges')
      .select('id, company_id, status')
      .eq('id', chargeId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Cobrança Asaas não encontrada nesta empresa.');
    const status = String((data as { status?: string }).status || '').toUpperCase();
    if (status === 'PAID') {
      throw new Error('Cobrança já paga — cancelamento não permitido.');
    }
    if (status === 'CANCELLED' || status === 'EXPIRED' || status === 'FAILED') {
      return { ok: true as const, reused: true, chargeId, status };
    }
    const updated = await cancelCompanyCharge(admin, companyId, chargeId);
    return {
      ok: true as const,
      reused: false,
      chargeId,
      status: String(updated.status || 'CANCELLED'),
    };
  },
  async generateMissingCharges(admin, input) {
    const companyId = String(input.companyId || '').trim();
    const saleId = String(input.saleId || '').trim();
    const receiptIds = (input.receiptIds || []).map((id) => String(id).trim()).filter(Boolean);
    if (!companyId) throw new Error('companyId obrigatório.');
    const injected = getExternalChargeMutationFns().generateAsaasCharges;
    if (injected) return injected(admin, { companyId, saleId, receiptIds });

    const result: ExternalChargeGenerateResult = {
      ok: true,
      created: 0,
      reused: 0,
      skipped: 0,
      errors: [],
    };
    for (const receiptId of receiptIds) {
      try {
        const before = await admin
          .from('company_asaas_charges')
          .select('id, asaas_payment_id, status')
          .eq('company_id', companyId)
          .eq('installment_id', receiptId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const charge = await createCompanyInstallmentCharge(admin, {
          companyId,
          installmentId: receiptId,
          billingType: 'BOLETO',
        });
        const prevId = before.data ? String((before.data as { id?: string }).id || '') : '';
        if (prevId && prevId === charge.id) result.reused += 1;
        else result.created += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/já foi paga|já está paga/i.test(message)) {
          result.skipped += 1;
          continue;
        }
        result.ok = false;
        result.errors.push({ receiptId, message });
      }
    }
    return result;
  },
};
