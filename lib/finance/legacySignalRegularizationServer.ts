/**
 * Carga e conferência no servidor. A gravação só ocorre na RPC transacional.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  LEGACY_SIGNAL_RPC,
  previewLegacySignalRegularization,
  type LegacySignalActor,
  type LegacySignalReceipt,
  type LegacySignalRequest,
  type LegacySignalResult,
  type LegacySignalState,
} from '@/lib/finance/legacySignalRegularization';

type Row = Record<string, unknown>;

function textOrNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function cents(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(number * 100);
}

function requiredCents(value: unknown): number {
  return cents(value) ?? 0;
}

export class LegacySignalAccessError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function loadLegacySignalActor(
  admin: SupabaseClient,
  userId: string,
): Promise<LegacySignalActor> {
  const { data, error } = await admin
    .from('users')
    .select('id, role, status, tenant_id')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) {
    throw new LegacySignalAccessError(403, 'forbidden', 'Somente um administrador da empresa pode regularizar o sinal.');
  }
  const row = data as Row;
  return {
    id: String(row.id),
    tenantId: textOrNull(row.tenant_id) || '',
    role: textOrNull(row.role) || '',
    status: textOrNull(row.status),
  };
}

function mapReceipt(row: Row): LegacySignalReceipt {
  return {
    id: String(row.id),
    saleId: String(row.sale_id),
    tenantId: textOrNull(row.tenant_id) || '',
    companyId: textOrNull(row.company_id),
    customerId: textOrNull(row.customer_id) || '',
    projectId: textOrNull(row.project_id),
    blockId: textOrNull(row.block_id),
    brokerId: textOrNull(row.broker_id),
    contractId: textOrNull(row.contract_id),
    installmentNumber: Number(row.installment_number),
    dueDate: String(row.due_date || '').slice(0, 10),
    amountCents: requiredCents(row.amount),
    paidAmountCents: cents(row.paid_amount),
    paidAt: textOrNull(row.paid_at),
    status: textOrNull(row.status) || '',
    scheduleGroup: textOrNull(row.schedule_group),
    financialAccountId: textOrNull(row.financial_account_id),
  };
}

async function rowsOf(
  query: PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new LegacySignalAccessError(503, 'read_failed', 'Não foi possível ler a situação financeira.');
  return (Array.isArray(data) ? data : []) as Row[];
}

async function optionalAuditRows(admin: SupabaseClient, saleId: string): Promise<Row[]> {
  const { data, error } = await admin
    .from('legacy_signal_regularizations')
    .select('id, tenant_id, company_id, sale_id, receipt_id, request_key, actor_user_id, reason, fingerprint, before_state, after_state, created_at')
    .eq('sale_id', saleId);
  if (error) {
    if (/does not exist|schema cache|legacy_signal_regularizations/i.test(error.message || '')) return [];
    throw new LegacySignalAccessError(503, 'read_failed', 'Não foi possível ler a auditoria da regularização.');
  }
  return (Array.isArray(data) ? data : []) as Row[];
}

export async function loadLegacySignalState(
  admin: SupabaseClient,
  saleId: string,
  actor: LegacySignalActor,
): Promise<LegacySignalState> {
  const { data: sale, error: saleError } = await admin
    .from('sales')
    .select('id, tenant_id, company_id, status, signal_schedule_mode, total_value, down_payment, signal_contract_value, signal_paid_at_sale, signal_remaining_value')
    .eq('id', saleId)
    .maybeSingle();
  if (saleError) throw new LegacySignalAccessError(503, 'read_failed', 'Não foi possível ler a venda.');
  if (!sale) throw new LegacySignalAccessError(404, 'not_found', 'Venda não encontrada.');
  const saleRow = sale as Row;
  const saleTenant = textOrNull(saleRow.tenant_id) || '';
  if (!actor.tenantId || actor.tenantId !== saleTenant) {
    throw new LegacySignalAccessError(403, 'wrong_company', 'A venda não pertence a esta empresa.');
  }

  const receipts = await rowsOf(
    admin
      .from('finance_receipts')
      .select('id, sale_id, tenant_id, company_id, customer_id, project_id, block_id, broker_id, contract_id, installment_number, due_date, amount, paid_amount, paid_at, status, schedule_group, financial_account_id')
      .eq('sale_id', saleId),
  );
  const original = receipts.find((row) => Number(row.installment_number) === 0);
  const originalId = original ? String(original.id) : '';
  const cashColumns = 'id, sale_id, contract_id, status, metadata, receipt_number, receipt_url, validation_code';
  const contractId = original ? textOrNull(original.contract_id) : '';
  const [cashBySale, cashByInstallment, cashByReceipt, cashByFinanceReceipt, cashByContract, bankCharges, asaasCharges, settlements, commissions, contracts] = await Promise.all([
    rowsOf(admin.from('cash_movements').select(cashColumns).eq('sale_id', saleId)),
    originalId
      ? rowsOf(admin.from('cash_movements').select(cashColumns).contains('metadata', { installment_id: originalId }))
      : Promise.resolve([]),
    originalId
      ? rowsOf(admin.from('cash_movements').select(cashColumns).contains('metadata', { receipt_id: originalId }))
      : Promise.resolve([]),
    originalId
      ? rowsOf(admin.from('cash_movements').select(cashColumns).contains('metadata', { finance_receipt_id: originalId }))
      : Promise.resolve([]),
    contractId
      ? rowsOf(admin.from('cash_movements').select(cashColumns).eq('contract_id', contractId))
      : Promise.resolve([]),
    originalId
      ? rowsOf(admin.from('bank_charges').select('id, finance_receipt_id, status').eq('finance_receipt_id', originalId))
      : Promise.resolve([]),
    originalId
      ? rowsOf(admin.from('company_asaas_charges').select('id, installment_id, status').eq('installment_id', originalId))
      : Promise.resolve([]),
    rowsOf(admin.from('sale_release_settlements').select('id, sale_id, status').eq('sale_id', saleId)),
    rowsOf(admin.from('broker_commissions').select('id, sale_id, status').eq('sale_id', saleId)),
    rowsOf(admin.from('contracts').select('id, sale_id, version').eq('sale_id', saleId)),
  ]);
  const audits = await optionalAuditRows(admin, saleId);

  const cash = [...cashBySale, ...cashByInstallment, ...cashByReceipt, ...cashByFinanceReceipt, ...cashByContract].filter((row, index, list) => (
    list.findIndex((item) => item.id === row.id) === index
  ));

  return {
    sale: {
      id: String(saleRow.id),
      tenantId: saleTenant,
      companyId: textOrNull(saleRow.company_id),
      status: textOrNull(saleRow.status) || '',
      signalScheduleMode: textOrNull(saleRow.signal_schedule_mode),
      totalCents: requiredCents(saleRow.total_value),
      signalContractCents: cents(saleRow.signal_contract_value) ?? cents(saleRow.down_payment),
      signalPaidAtSaleCents: cents(saleRow.signal_paid_at_sale),
      signalRemainingCents: cents(saleRow.signal_remaining_value),
    },
    receipts: receipts.map(mapReceipt),
    cash: cash.map((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
      return {
        id: String(row.id),
        saleId: textOrNull(row.sale_id),
        receiptId: textOrNull(metadata.installment_id) || textOrNull(metadata.receipt_id) || textOrNull(metadata.finance_receipt_id),
        contractId: textOrNull(row.contract_id),
        status: textOrNull(row.status),
        provider: textOrNull(metadata.provider),
        hasReceiptDocument: Boolean(textOrNull(row.receipt_number) || textOrNull(row.receipt_url) || textOrNull(row.validation_code)),
      };
    }),
    bankCharges: bankCharges.map((row) => ({
      id: String(row.id),
      receiptId: textOrNull(row.finance_receipt_id),
      status: textOrNull(row.status),
    })),
    asaasCharges: asaasCharges.map((row) => ({
      id: String(row.id),
      receiptId: textOrNull(row.installment_id),
      status: textOrNull(row.status),
    })),
    settlements: settlements.map((row) => ({
      id: String(row.id),
      saleId: textOrNull(row.sale_id),
      status: textOrNull(row.status),
    })),
    commissions: commissions.map((row) => ({
      id: String(row.id),
      saleId: textOrNull(row.sale_id),
      status: textOrNull(row.status),
    })),
    contracts: contracts.map((row) => ({
      id: String(row.id),
      saleId: String(row.sale_id),
      version: row.version == null ? null : Number(row.version),
    })),
    audits: audits.map((row) => ({
      id: String(row.id),
      tenantId: textOrNull(row.tenant_id) || '',
      companyId: textOrNull(row.company_id) || '',
      saleId: String(row.sale_id),
      receiptId: String(row.receipt_id),
      requestKey: String(row.request_key),
      actorUserId: textOrNull(row.actor_user_id) || '',
      reason: textOrNull(row.reason) || '',
      fingerprint: textOrNull(row.fingerprint) || '',
      before: (row.before_state || {}) as LegacySignalState['audits'][number]['before'],
      after: (row.after_state || {}) as LegacySignalState['audits'][number]['after'],
      createdAt: textOrNull(row.created_at) || '',
    })),
  };
}

export function readLegacySignalRequest(body: Row): LegacySignalRequest | { error: string } {
  const installments = Array.isArray(body.installments) ? body.installments : [];
  const parsed = installments.map((item) => {
    const row = item && typeof item === 'object' ? item as Row : {};
    return {
      dueDate: String(row.dueDate || '').slice(0, 10),
      amountCents: Number(row.amountCents),
    };
  });
  const request: LegacySignalRequest = {
    receivedCents: Number(body.receivedCents),
    installments: parsed,
    reason: String(body.reason || ''),
    requestKey: String(body.requestKey || ''),
    confirm: body.confirm === true,
  };
  if (!request.requestKey) return { error: 'A confirmação não possui uma chave válida.' };
  return request;
}

export async function previewLegacySignalForActor(
  admin: SupabaseClient,
  actor: LegacySignalActor,
  saleId: string,
  request: LegacySignalRequest,
): Promise<LegacySignalResult> {
  const state = await loadLegacySignalState(admin, saleId, actor);
  return previewLegacySignalRegularization(state, actor, request);
}

export async function executeLegacySignalForActor(
  admin: SupabaseClient,
  actor: LegacySignalActor,
  saleId: string,
  request: LegacySignalRequest,
): Promise<LegacySignalResult> {
  const preview = await previewLegacySignalForActor(admin, actor, saleId, request);
  if (!request.confirm) {
    return {
      ...preview,
      ok: false,
      code: 'confirmation_required',
      message: 'A regularização exige confirmação explícita.',
      replayed: false,
    };
  }
  if (!preview.ok && preview.code !== 'preview') {
    return preview;
  }
  const { data, error } = await admin.rpc(LEGACY_SIGNAL_RPC, {
    p_sale_id: saleId,
    p_actor_id: actor.id,
    p_tenant_id: actor.tenantId,
    p_received_cents: request.receivedCents,
    p_installments: request.installments,
    p_reason: request.reason.trim(),
    p_request_key: request.requestKey,
    p_confirm: true,
  });
  if (error) {
    const missing = /could not find the function|schema cache|PGRST202/i.test(error.message || '');
    throw new LegacySignalAccessError(
      missing ? 503 : 409,
      missing ? 'migration_required' : 'rpc_failure',
      missing
        ? 'A rotina ainda não está disponível neste banco.'
        : 'A regularização não foi concluída. Nenhum valor foi alterado.',
    );
  }
  const payload = (data || {}) as Row;
  if (payload.ok !== true) {
    return {
      ok: false,
      code: String(payload.code || 'rpc_failure'),
      message: String(payload.message || 'A regularização não foi concluída.'),
      replayed: false,
      blockers: Array.isArray(payload.blockers) ? payload.blockers.map(String) : [],
      receiptId: textOrNull(payload.receiptId),
      createdInstallmentCount: 0,
      before: preview.before,
      after: null,
      auditId: null,
    };
  }
  return {
    ok: true,
    code: String(payload.code || 'applied'),
    message: String(payload.message || 'Sinal regularizado sem lançamento de caixa.'),
    replayed: payload.replayed === true,
    blockers: [],
    receiptId: textOrNull(payload.receiptId),
    createdInstallmentCount: Number(payload.createdInstallmentCount || 0),
    before: preview.before,
    after: preview.after,
    auditId: textOrNull(payload.auditId),
  };
}
