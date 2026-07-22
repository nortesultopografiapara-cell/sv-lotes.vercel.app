import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNetAmount,
  computePayableStatus,
  roundMoney,
} from './arApMath';
import type {
  MasterCorporateArApListFilters,
  MasterCorporatePayable,
  MasterCorporatePayableInput,
  MasterCorporatePayableKpis,
  MasterCorporatePayablePayment,
  MasterCorporateSettlementInput,
} from './arApTypes';
import { logCorporateFinanceAudit } from './service';

function nowIso() {
  return new Date().toISOString();
}

function monthBounds(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  return { from, to };
}

async function nextPayableCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_corporate_payable_code');
  if (error) throw new Error(error.message);
  return String(data);
}

async function assertCategoryExpense(supabase: SupabaseClient, categoryId: string) {
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .select('id, type, is_active')
    .eq('id', categoryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Categoria não encontrada.');
  if (!data.is_active) throw new Error('Categoria inativa.');
  if (data.type !== 'EXPENSE') throw new Error('Categoria deve ser de despesa (EXPENSE).');
}

async function assertOptionalRefs(
  supabase: SupabaseClient,
  input: MasterCorporatePayableInput,
) {
  if (input.project_id) {
    const { data, error } = await supabase
      .from('master_topography_projects')
      .select('id')
      .eq('id', input.project_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Projeto Master não encontrado.');
  }
  if (input.cost_center_id) {
    const { data, error } = await supabase
      .from('master_corporate_cost_centers')
      .select('id, is_active')
      .eq('id', input.cost_center_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.is_active) throw new Error('Centro de resultado inválido.');
  }
  if (input.financial_account_id) {
    const { data, error } = await supabase
      .from('master_corporate_financial_accounts')
      .select('id, is_active')
      .eq('id', input.financial_account_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.is_active) throw new Error('Conta financeira inválida.');
  }
}

function mapPayable(row: Record<string, unknown>): MasterCorporatePayable {
  return {
    id: String(row.id),
    code: String(row.code),
    description: String(row.description),
    supplier_name: String(row.supplier_name),
    supplier_document: row.supplier_document ? String(row.supplier_document) : null,
    supplier_phone: row.supplier_phone ? String(row.supplier_phone) : null,
    supplier_email: row.supplier_email ? String(row.supplier_email) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    category_id: String(row.category_id),
    cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
    financial_account_id: row.financial_account_id ? String(row.financial_account_id) : null,
    issue_date: String(row.issue_date).slice(0, 10),
    competence_date: String(row.competence_date).slice(0, 10),
    due_date: String(row.due_date).slice(0, 10),
    original_amount: Number(row.original_amount),
    discount_amount: Number(row.discount_amount),
    interest_amount: Number(row.interest_amount),
    fine_amount: Number(row.fine_amount),
    net_amount: Number(row.net_amount),
    paid_amount: Number(row.paid_amount),
    remaining_amount: Number(row.remaining_amount),
    status: row.status as MasterCorporatePayable['status'],
    payment_method: (row.payment_method as MasterCorporatePayable['payment_method']) || null,
    installment_number: row.installment_number == null ? null : Number(row.installment_number),
    installment_total: row.installment_total == null ? null : Number(row.installment_total),
    notes: row.notes ? String(row.notes) : null,
    is_archived: Boolean(row.is_archived),
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    canceled_at: row.canceled_at ? String(row.canceled_at) : null,
    canceled_by: row.canceled_by ? String(row.canceled_by) : null,
    cancellation_reason: row.cancellation_reason ? String(row.cancellation_reason) : null,
  };
}

async function sumValidPayments(supabase: SupabaseClient, payableId: string): Promise<number> {
  const { data, error } = await supabase
    .from('master_corporate_payable_payments')
    .select('amount')
    .eq('payable_id', payableId)
    .eq('is_reversed', false);
  if (error) throw new Error(error.message);
  return roundMoney((data || []).reduce((s, r) => s + Number(r.amount || 0), 0));
}

async function persistPayableTotals(
  supabase: SupabaseClient,
  payable: MasterCorporatePayable,
  preferDraft = false,
): Promise<MasterCorporatePayable> {
  const paid_amount = await sumValidPayments(supabase, payable.id);
  const remaining_amount = roundMoney(payable.net_amount - paid_amount);
  if (remaining_amount < 0) {
    throw new Error('Pago não pode ultrapassar o valor líquido.');
  }
  const status = computePayableStatus({
    net_amount: payable.net_amount,
    paid_amount,
    due_date: payable.due_date,
    is_archived: payable.is_archived,
    canceled_at: payable.canceled_at,
    preferDraft: preferDraft && paid_amount === 0,
  });

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .update({
      paid_amount,
      remaining_amount,
      status,
      updated_at: nowIso(),
    })
    .eq('id', payable.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapPayable(data as Record<string, unknown>);
}

export async function getPayable(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporatePayable | null> {
  const { data, error } = await supabase
    .from('master_corporate_payables')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapPayable(data as Record<string, unknown>) : null;
}

export async function listPayablePayments(
  supabase: SupabaseClient,
  payableId: string,
): Promise<MasterCorporatePayablePayment[]> {
  const { data, error } = await supabase
    .from('master_corporate_payable_payments')
    .select('*')
    .eq('payable_id', payableId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as MasterCorporatePayablePayment[];
}

function applyPayableFilters(query: any, filters: MasterCorporateArApListFilters) {
  const dateField = filters.dateField || 'due_date';
  if (!filters.includeArchived) query = query.eq('is_archived', false);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.categoryId) query = query.eq('category_id', filters.categoryId);
  if (filters.costCenterId) query = query.eq('cost_center_id', filters.costCenterId);
  if (filters.financialAccountId) {
    query = query.eq('financial_account_id', filters.financialAccountId);
  }
  if (filters.fromDate) query = query.gte(dateField, filters.fromDate);
  if (filters.toDate) query = query.lte(dateField, filters.toDate);
  if (filters.overdueOnly) {
    const today = new Date().toISOString().slice(0, 10);
    query = query
      .lt('due_date', today)
      .gt('remaining_amount', 0)
      .is('canceled_at', null)
      .eq('is_archived', false)
      .neq('status', 'PAID')
      .neq('status', 'CANCELED')
      .neq('status', 'ARCHIVED');
  }
  if (filters.q) {
    const q = `%${filters.q.replace(/%/g, '')}%`;
    query = query.or(
      `code.ilike.${q},description.ilike.${q},supplier_name.ilike.${q},supplier_document.ilike.${q}`,
    );
  }
  return query;
}

export async function listPayables(
  supabase: SupabaseClient,
  filters: MasterCorporateArApListFilters = {},
): Promise<{
  payables: MasterCorporatePayable[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterCorporatePayableKpis;
}> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('master_corporate_payables').select('*', { count: 'exact' });
  query = applyPayableFilters(query, filters);
  query = query.order('due_date', { ascending: true }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computePayableKpis(supabase),
  ]);
  if (error) throw new Error(error.message);

  return {
    payables: (data || []).map((r) => mapPayable(r as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
    kpis,
  };
}

export async function computePayableKpis(
  supabase: SupabaseClient,
): Promise<MasterCorporatePayableKpis> {
  const { from, to } = monthBounds();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .select('status, remaining_amount, due_date, paid_amount, is_archived, canceled_at')
    .eq('is_archived', false)
    .is('canceled_at', null);
  if (error) throw new Error(error.message);

  const rows = data || [];
  let totalOpen = 0;
  let dueThisMonth = 0;
  let overdue = 0;
  let openCount = 0;
  let partialCount = 0;
  let paidCount = 0;

  for (const r of rows) {
    const remaining = Number(r.remaining_amount || 0);
    const status = String(r.status);
    if (status === 'OPEN') openCount += 1;
    if (status === 'PARTIAL') partialCount += 1;
    if (status === 'PAID') paidCount += 1;
    if (remaining > 0) {
      totalOpen = roundMoney(totalOpen + remaining);
      const due = String(r.due_date).slice(0, 10);
      if (due >= from && due <= to) dueThisMonth = roundMoney(dueThisMonth + remaining);
      if (due < today && status !== 'PAID') overdue = roundMoney(overdue + remaining);
    }
  }

  const { data: pays, error: pErr } = await supabase
    .from('master_corporate_payable_payments')
    .select('amount, payment_date, is_reversed')
    .eq('is_reversed', false)
    .gte('payment_date', from)
    .lte('payment_date', to);
  if (pErr) throw new Error(pErr.message);
  const paidThisMonth = roundMoney(
    (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0),
  );

  return {
    totalOpen,
    dueThisMonth,
    paidThisMonth,
    overdue,
    openCount,
    partialCount,
    paidCount,
  };
}

export async function createPayable(
  supabase: SupabaseClient,
  input: MasterCorporatePayableInput,
  userId: string | null,
): Promise<MasterCorporatePayable> {
  await assertCategoryExpense(supabase, input.category_id);
  await assertOptionalRefs(supabase, input);

  const net_amount = computeNetAmount(input);
  const code = await nextPayableCode(supabase);
  const preferDraft = input.status === 'DRAFT';
  const status = computePayableStatus({
    net_amount,
    paid_amount: 0,
    due_date: input.due_date,
    is_archived: false,
    canceled_at: null,
    preferDraft,
  });

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .insert({
      code,
      description: input.description,
      supplier_name: input.supplier_name,
      supplier_document: input.supplier_document,
      supplier_phone: input.supplier_phone,
      supplier_email: input.supplier_email,
      project_id: input.project_id,
      category_id: input.category_id,
      cost_center_id: input.cost_center_id,
      financial_account_id: input.financial_account_id,
      issue_date: input.issue_date,
      competence_date: input.competence_date,
      due_date: input.due_date,
      original_amount: input.original_amount,
      discount_amount: input.discount_amount,
      interest_amount: input.interest_amount,
      fine_amount: input.fine_amount,
      net_amount,
      paid_amount: 0,
      remaining_amount: net_amount,
      status,
      payment_method: input.payment_method,
      installment_number: input.installment_number,
      installment_total: input.installment_total,
      notes: input.notes,
      is_archived: false,
      created_by: userId,
      updated_by: userId,
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapPayable(data as Record<string, unknown>);
}

export async function updatePayable(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporatePayableInput,
  userId: string | null,
): Promise<MasterCorporatePayable> {
  const existing = await getPayable(supabase, id);
  if (!existing) throw new Error('Pagável não encontrado.');
  if (existing.canceled_at) throw new Error('Pagável cancelado não pode ser editado.');
  if (existing.is_archived) throw new Error('Pagável arquivado não pode ser editado.');
  if (existing.remaining_amount <= 0 && existing.paid_amount > 0) {
    throw new Error('Pagável liquidado não pode ser editado.');
  }

  await assertCategoryExpense(supabase, input.category_id);
  await assertOptionalRefs(supabase, input);

  const net_amount = computeNetAmount(input);
  if (existing.paid_amount > net_amount) {
    throw new Error('Novo valor líquido menor que o já pago.');
  }

  const remaining_amount = roundMoney(net_amount - existing.paid_amount);
  const status = computePayableStatus({
    net_amount,
    paid_amount: existing.paid_amount,
    due_date: input.due_date,
    is_archived: false,
    canceled_at: null,
    preferDraft: input.status === 'DRAFT' && existing.paid_amount === 0,
  });

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .update({
      description: input.description,
      supplier_name: input.supplier_name,
      supplier_document: input.supplier_document,
      supplier_phone: input.supplier_phone,
      supplier_email: input.supplier_email,
      project_id: input.project_id,
      category_id: input.category_id,
      cost_center_id: input.cost_center_id,
      financial_account_id: input.financial_account_id,
      issue_date: input.issue_date,
      competence_date: input.competence_date,
      due_date: input.due_date,
      original_amount: input.original_amount,
      discount_amount: input.discount_amount,
      interest_amount: input.interest_amount,
      fine_amount: input.fine_amount,
      net_amount,
      remaining_amount,
      status,
      payment_method: input.payment_method,
      installment_number: input.installment_number,
      installment_total: input.installment_total,
      notes: input.notes,
      updated_by: userId,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return mapPayable(data as Record<string, unknown>);
}

export async function payPayable(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateSettlementInput,
  userId: string | null,
): Promise<{ payable: MasterCorporatePayable; payment: MasterCorporatePayablePayment }> {
  const existing = await getPayable(supabase, id);
  if (!existing) throw new Error('Pagável não encontrado.');
  if (existing.canceled_at) throw new Error('Pagável cancelado.');
  if (existing.is_archived) throw new Error('Pagável arquivado.');
  if (existing.remaining_amount <= 0) throw new Error('Pagável já liquidado.');
  if (input.amount > existing.remaining_amount + 0.001) {
    throw new Error('Valor maior que o saldo pendente.');
  }

  const { data: account, error: aErr } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id, is_active')
    .eq('id', input.financial_account_id)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!account || !account.is_active) throw new Error('Conta financeira inválida.');

  if (input.idempotency_key) {
    const { data: dup } = await supabase
      .from('master_corporate_payable_payments')
      .select('id')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (dup) throw new Error('Pagamento duplicado (idempotência).');
  }

  const { data: paymentRow, error: pErr } = await supabase
    .from('master_corporate_payable_payments')
    .insert({
      payable_id: id,
      financial_account_id: input.financial_account_id,
      payment_date: input.payment_date,
      amount: input.amount,
      payment_method: input.payment_method,
      reference: input.reference,
      notes: input.notes,
      origin: input.origin === 'ASAAS' || input.origin === 'OTHER' ? input.origin : 'MANUAL',
      idempotency_key: input.idempotency_key || null,
      created_by: userId,
    })
    .select('*')
    .single();

  if (pErr) {
    if (pErr.code === '23505') throw new Error('Pagamento duplicado (idempotência).');
    throw new Error(pErr.message);
  }

  const payable = await persistPayableTotals(supabase, existing);
  const payment = paymentRow as MasterCorporatePayablePayment;

  await logCorporateFinanceAudit(supabase, {
    userId,
    action:
      payable.status === 'PAID'
        ? 'CORPORATE_PAYABLE_PAID_FULL'
        : 'CORPORATE_PAYABLE_PAID_PARTIAL',
    entityId: id,
    description: `Pagamento ${payable.status === 'PAID' ? 'total' : 'parcial'} ${payable.code}: ${input.amount}`,
    newData: { paymentId: payment.id, amount: input.amount, status: payable.status },
  });

  return { payable, payment };
}

export async function reversePayablePayment(
  supabase: SupabaseClient,
  payableId: string,
  paymentId: string,
  reason: string,
  userId: string | null,
): Promise<{ payable: MasterCorporatePayable; payment: MasterCorporatePayablePayment }> {
  const existing = await getPayable(supabase, payableId);
  if (!existing) throw new Error('Pagável não encontrado.');

  const { data: payment, error } = await supabase
    .from('master_corporate_payable_payments')
    .select('*')
    .eq('id', paymentId)
    .eq('payable_id', payableId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw new Error('Pagamento não encontrado.');
  if (payment.is_reversed) throw new Error('Pagamento já estornado.');

  const reasonClean = String(reason || '').trim();
  if (!reasonClean) throw new Error('Motivo do estorno é obrigatório.');

  const { data: updatedPay, error: uErr } = await supabase
    .from('master_corporate_payable_payments')
    .update({
      is_reversed: true,
      reversed_at: nowIso(),
      reversed_by: userId,
      reversal_reason: reasonClean.slice(0, 500),
    })
    .eq('id', paymentId)
    .select('*')
    .single();
  if (uErr) throw new Error(uErr.message);

  const payable = await persistPayableTotals(supabase, {
    ...existing,
    is_archived: false,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_PAYABLE_PAYMENT_REVERSED',
    entityId: payableId,
    description: `Estorno de pagamento ${existing.code}: ${payment.amount}`,
    oldData: { paymentId, amount: payment.amount },
    newData: { status: payable.status, reason: reasonClean },
  });

  return { payable, payment: updatedPay as MasterCorporatePayablePayment };
}

export async function cancelPayable(
  supabase: SupabaseClient,
  id: string,
  reason: string,
  userId: string | null,
): Promise<MasterCorporatePayable> {
  const existing = await getPayable(supabase, id);
  if (!existing) throw new Error('Pagável não encontrado.');
  if (existing.canceled_at) throw new Error('Pagável já cancelado.');
  if (existing.paid_amount > 0) {
    throw new Error('Estorne os pagamentos antes de cancelar.');
  }
  const reasonClean = String(reason || '').trim();
  if (!reasonClean) throw new Error('Motivo do cancelamento é obrigatório.');

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .update({
      status: 'CANCELED',
      canceled_at: nowIso(),
      canceled_by: userId,
      cancellation_reason: reasonClean.slice(0, 500),
      updated_by: userId,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_PAYABLE_CANCELED',
    entityId: id,
    description: `Pagável cancelado ${existing.code}`,
    newData: { reason: reasonClean },
  });

  return mapPayable(data as Record<string, unknown>);
}

export async function archivePayable(
  supabase: SupabaseClient,
  id: string,
  userId: string | null,
): Promise<MasterCorporatePayable> {
  const existing = await getPayable(supabase, id);
  if (!existing) throw new Error('Pagável não encontrado.');
  if (existing.is_archived) throw new Error('Já arquivado.');

  const { data, error } = await supabase
    .from('master_corporate_payables')
    .update({
      is_archived: true,
      status: 'ARCHIVED',
      updated_by: userId,
      updated_at: nowIso(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_PAYABLE_ARCHIVED',
    entityId: id,
    description: `Pagável arquivado ${existing.code}`,
  });

  return mapPayable(data as Record<string, unknown>);
}

export async function restorePayable(
  supabase: SupabaseClient,
  id: string,
  userId: string | null,
): Promise<MasterCorporatePayable> {
  const existing = await getPayable(supabase, id);
  if (!existing) throw new Error('Pagável não encontrado.');
  if (!existing.is_archived) throw new Error('Pagável não está arquivado.');
  if (existing.canceled_at) throw new Error('Pagável cancelado não pode ser restaurado.');

  const { error } = await supabase
    .from('master_corporate_payables')
    .update({
      is_archived: false,
      updated_by: userId,
      updated_at: nowIso(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const refreshed = await getPayable(supabase, id);
  if (!refreshed) throw new Error('Pagável não encontrado.');
  const payable = await persistPayableTotals(supabase, refreshed);

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_PAYABLE_RESTORED',
    entityId: id,
    description: `Pagável restaurado ${existing.code}`,
    newData: { status: payable.status },
  });

  return payable;
}

export function payablesToCsv(rows: MasterCorporatePayable[]): string {
  const header = [
    'code',
    'supplier_name',
    'description',
    'issue_date',
    'due_date',
    'net_amount',
    'paid_amount',
    'remaining_amount',
    'status',
  ];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        JSON.stringify(r.supplier_name),
        JSON.stringify(r.description),
        r.issue_date,
        r.due_date,
        String(r.net_amount).replace('.', ','),
        String(r.paid_amount).replace('.', ','),
        String(r.remaining_amount).replace('.', ','),
        r.status,
      ].join(';'),
    );
  }
  return lines.join('\n');
}
