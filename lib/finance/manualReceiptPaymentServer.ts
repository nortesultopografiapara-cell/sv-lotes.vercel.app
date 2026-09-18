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

/** Select plano — sem embed PostgREST (customers/sales/contracts são ambíguos neste schema). */
export const MANUAL_RECEIPT_BASE_SELECT =
  'id, tenant_id, company_id, status, amount, paid_amount, paid_at, due_date, installment_number, sale_id, customer_id, project_id, block_id';

function textOrNull(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

export async function loadManualReceiptRow(
  admin: SupabaseClient,
  receiptId: string,
): Promise<ManualReceiptRow | null> {
  const { data, error } = await admin
    .from('finance_receipts')
    .select(MANUAL_RECEIPT_BASE_SELECT)
    .eq('id', receiptId)
    .maybeSingle();
  if (error) {
    console.warn('[manual-receipt-payment] load receipt falhou', error.code, error.message);
    return null;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const customerId = textOrNull(row.customer_id);
  const saleId = textOrNull(row.sale_id);
  let customerName: string | null = null;
  let installmentsCount: number | string | null = null;
  let saleProjectId: string | null = null;
  let contractId: string | null = null;
  let contractNumber: string | null = null;

  if (customerId) {
    const { data: customer, error: customerError } = await admin
      .from('customers')
      .select('name, full_name')
      .eq('id', customerId)
      .maybeSingle();
    if (customerError) {
      console.warn('[manual-receipt-payment] load customer falhou', customerError.message);
    } else {
      customerName =
        textOrNull((customer as { name?: string | null; full_name?: string | null } | null)?.name) ||
        textOrNull((customer as { name?: string | null; full_name?: string | null } | null)?.full_name);
    }
  }

  if (saleId) {
    const { data: sale, error: saleError } = await admin
      .from('sales')
      .select('id, installments_count, project_id')
      .eq('id', saleId)
      .maybeSingle();
    if (saleError) {
      console.warn('[manual-receipt-payment] load sale falhou', saleError.message);
    } else if (sale) {
      const saleRow = sale as {
        installments_count?: number | string | null;
        project_id?: string | null;
      };
      installmentsCount = saleRow.installments_count ?? null;
      saleProjectId = textOrNull(saleRow.project_id);
    }

    const { data: contracts, error: contractError } = await admin
      .from('contracts')
      .select('id, contract_number')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
      .limit(1);
    if (contractError) {
      console.warn('[manual-receipt-payment] load contract falhou', contractError.message);
    } else {
      const contract = Array.isArray(contracts) ? contracts[0] : contracts;
      contractId = textOrNull((contract as { id?: string | null } | null)?.id);
      contractNumber = textOrNull(
        (contract as { contract_number?: string | null } | null)?.contract_number,
      );
    }
  }

  return {
    id: String(row.id),
    tenant_id: textOrNull(row.tenant_id),
    company_id: textOrNull(row.company_id),
    status: textOrNull(row.status),
    amount: row.amount as number | null,
    paid_amount: row.paid_amount as number | null,
    paid_at: textOrNull(row.paid_at),
    due_date: textOrNull(row.due_date),
    installment_number: row.installment_number as number | string | null,
    sale_id: saleId,
    customer_id: customerId,
    project_id: textOrNull(row.project_id) || saleProjectId,
    block_id: textOrNull(row.block_id),
    customer_name: customerName,
    contract_id: contractId,
    contract_number: contractNumber,
    installments_count: installmentsCount,
  };
}

/** Preview do GET: só admin client. Não exige env de senha efêmera. */
export function createManualPaymentPreviewDeps(
  admin: SupabaseClient,
): Pick<
  ManualPaymentDeps,
  'loadOperator' | 'loadCompanyPrimaryAdminUserId' | 'loadUser' | 'loadReceipt'
> {
  const reauth = createPrimaryAdminReauthDeps(admin, { url: 'http://127.0.0.1', anonKey: 'preview-only' });
  return {
    loadOperator: reauth.loadOperator,
    loadCompanyPrimaryAdminUserId: reauth.loadCompanyPrimaryAdminUserId,
    loadUser: reauth.loadUser,
    loadReceipt: (id) => loadManualReceiptRow(admin, id),
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
