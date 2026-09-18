/**
 * Wiring server-side da baixa manual autorizada.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logLotAuditEvent } from '@/lib/lotAudit';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';
import {
  MANUAL_PAYMENT_AUDIT_MODULE,
  MANUAL_PAYMENT_AUTHORIZED_ACTION,
  MANUAL_PAYMENT_FAILED_ACTION,
  buildManualPaymentAuditDescription,
  receiptTenantId,
  type ManualPaymentDeps,
  type ManualPaymentExecuteResult,
  type ManualReceiptRow,
} from '@/lib/finance/manualReceiptPayment';
import type { PrimaryAdminReauthDeps, PrimaryAdminVerifyResult } from '@/lib/primaryAdminReauth';

export async function loadManualReceiptRow(
  admin: SupabaseClient,
  receiptId: string,
): Promise<ManualReceiptRow | null> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(
      'id, tenant_id, company_id, status, amount, paid_amount, paid_at, due_date, installment_number, sale_id, customer_id, project_id, block_id, customers(name, full_name), sales(id, installments_count, project_id, contracts(id, contract_number))',
    )
    .eq('id', receiptId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const customers = row.customers as { name?: string | null; full_name?: string | null } | null;
  const sales = row.sales as {
    installments_count?: number | null;
    project_id?: string | null;
    contracts?: Array<{ id?: string | null; contract_number?: string | null }> | null;
  } | null;
  const contract = Array.isArray(sales?.contracts) ? sales?.contracts[0] : null;
  return {
    id: String(row.id),
    tenant_id: (row.tenant_id as string | null) || null,
    company_id: (row.company_id as string | null) || null,
    status: (row.status as string | null) || null,
    amount: row.amount as number | null,
    paid_amount: row.paid_amount as number | null,
    paid_at: (row.paid_at as string | null) || null,
    due_date: (row.due_date as string | null) || null,
    installment_number: row.installment_number as number | string | null,
    sale_id: (row.sale_id as string | null) || null,
    customer_id: (row.customer_id as string | null) || null,
    project_id: (row.project_id as string | null) || (sales?.project_id as string | null) || null,
    block_id: (row.block_id as string | null) || null,
    customer_name: String(customers?.name || customers?.full_name || '').trim() || null,
    contract_id: (contract?.id as string | null) || null,
    contract_number: (contract?.contract_number as string | null) || null,
    installments_count: sales?.installments_count ?? null,
  };
}

export function createManualPaymentDeps(
  admin: SupabaseClient,
  authEnv: { url: string; anonKey: string },
  rateLimitStore?: PrimaryAdminReauthDeps['rateLimitStore'],
): ManualPaymentDeps {
  const reauth = createPrimaryAdminReauthDeps(admin, authEnv, rateLimitStore);
  return {
    ...reauth,
    loadReceipt: (receiptId) => loadManualReceiptRow(admin, receiptId),
    persistAuthorizedPayment: async ({ receipt, operatorId, paidAt, amount }) => {
      const { data, error } = await admin.rpc('execute_authorized_manual_receipt_payment', {
        p_receipt_id: receipt.id,
        p_operator_id: operatorId,
        p_paid_at: paidAt,
        p_amount: amount,
      });
      if (error) {
        console.warn('[manual-receipt-payment] RPC falhou', error.message);
        return { ok: false };
      }
      const payload = (data || {}) as Record<string, unknown>;
      if (payload.code === 'already_paid' || payload.alreadyPaid === true) {
        return {
          ok: false,
          code: 'already_paid',
          receiptId: String(payload.receiptId || receipt.id),
          cashMovementId: payload.cashMovementId ? String(payload.cashMovementId) : null,
        };
      }
      if (payload.ok !== true) {
        return { ok: false, code: payload.code === 'not_found' ? 'not_found' : undefined };
      }
      return {
        ok: true,
        receiptId: String(payload.receiptId || receipt.id),
        cashMovementId: payload.cashMovementId ? String(payload.cashMovementId) : null,
      };
    },
  };
}

export async function persistManualPaymentAudit(
  admin: SupabaseClient,
  input: {
    result: ManualPaymentExecuteResult;
    verify?: PrimaryAdminVerifyResult;
    receipt?: ManualReceiptRow | null;
  },
): Promise<void> {
  const tenantId =
    (input.result.ok ? input.result.tenantId : input.result.tenantId) ||
    input.verify?.tenantId ||
    receiptTenantId(input.receipt || undefined) ||
    null;
  const requestedBy = input.result.ok
    ? input.result.requestedBy
    : input.result.requestedBy || input.verify?.requestedBy;
  if (!tenantId || !requestedBy) return;

  const authorizedBy = input.result.ok ? input.result.authorizedBy : undefined;
  const cashMovementId = input.result.ok ? input.result.cashMovementId : null;
  const receiptId = input.result.ok
    ? input.result.receiptId
    : input.result.receiptId || input.receipt?.id || '';
  if (!receiptId) return;

  try {
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      company_id: tenantId,
      user_id: requestedBy,
      action: input.result.ok ? MANUAL_PAYMENT_AUTHORIZED_ACTION : MANUAL_PAYMENT_FAILED_ACTION,
      module: MANUAL_PAYMENT_AUDIT_MODULE,
      reference_id: receiptId,
      description: buildManualPaymentAuditDescription({
        result: input.result.ok ? 'authorized' : 'failed',
        receiptId,
        saleId: input.receipt?.sale_id,
        contractId: input.receipt?.contract_id,
        contractNumber: input.receipt?.contract_number,
        installmentNumber: input.receipt?.installment_number,
        amount: Number(input.receipt?.amount) || undefined,
        requestedBy,
        authorizedBy,
        cashMovementId,
      }),
    });
  } catch (err) {
    console.warn(
      '[manual-receipt-payment] audit_logs falhou',
      err instanceof Error ? err.message : err,
    );
  }
}

export async function persistManualPaymentLotAudit(
  admin: SupabaseClient,
  receipt: ManualReceiptRow,
  operatorId: string,
): Promise<void> {
  if (!receipt.block_id) return;
  const amount = Number(receipt.amount) || 0;
  await logLotAuditEvent(admin, {
    companyId: receiptTenantId(receipt),
    projectId: receipt.project_id ?? null,
    blockId: receipt.block_id,
    lotId: receipt.block_id,
    saleId: receipt.sale_id ?? null,
    contractId: receipt.contract_id ?? null,
    userId: operatorId,
    action: 'payment_received',
    title: 'Pagamento registrado',
    description: `Parcela ${receipt.installment_number || '1'} — ${formatCurrencyBRL(amount)}`,
    newData: {
      receipt_id: receipt.id,
      installment_number: receipt.installment_number,
      amount: receipt.amount,
    },
    source: 'finance_flow',
  });
}

export { persistPrimaryAdminVerifyAudit };
