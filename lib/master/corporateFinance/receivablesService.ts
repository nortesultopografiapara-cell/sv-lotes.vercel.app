import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeNetAmount,
  computeReceivableStatus,
  isLinkableQuoteStatus,
  roundMoney,
} from './arApMath';
import type {
  MasterCorporateArApListFilters,
  MasterCorporateReceivable,
  MasterCorporateReceivableInput,
  MasterCorporateReceivableKpis,
  MasterCorporateReceivablePayment,
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

async function nextReceivableCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_corporate_receivable_code');
  if (error) throw new Error(error.message);
  return String(data);
}

async function assertCategoryIncome(supabase: SupabaseClient, categoryId: string) {
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .select('id, type, is_active')
    .eq('id', categoryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Categoria não encontrada.');
  if (!data.is_active) throw new Error('Categoria inativa.');
  if (data.type !== 'INCOME') throw new Error('Categoria deve ser de receita (INCOME).');
}

async function assertOptionalRefs(
  supabase: SupabaseClient,
  input: MasterCorporateReceivableInput,
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
  if (input.quote_id) {
    const { data, error } = await supabase
      .from('master_topography_quotes')
      .select('id, status, converted_project_id')
      .eq('id', input.quote_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error('Orçamento não encontrado.');
    if (!isLinkableQuoteStatus(String(data.status))) {
      throw new Error('Somente orçamento aprovado ou convertido pode ser vinculado.');
    }
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

function mapReceivable(row: Record<string, unknown>): MasterCorporateReceivable {
  return {
    id: String(row.id),
    code: String(row.code),
    description: String(row.description),
    customer_name: String(row.customer_name),
    customer_document: row.customer_document ? String(row.customer_document) : null,
    customer_phone: row.customer_phone ? String(row.customer_phone) : null,
    customer_email: row.customer_email ? String(row.customer_email) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    quote_id: row.quote_id ? String(row.quote_id) : null,
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
    received_amount: Number(row.received_amount),
    remaining_amount: Number(row.remaining_amount),
    status: row.status as MasterCorporateReceivable['status'],
    payment_method: (row.payment_method as MasterCorporateReceivable['payment_method']) || null,
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

async function sumValidPayments(
  supabase: SupabaseClient,
  receivableId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('master_corporate_receivable_payments')
    .select('amount')
    .eq('receivable_id', receivableId)
    .eq('is_reversed', false);
  if (error) throw new Error(error.message);
  return roundMoney((data || []).reduce((s, r) => s + Number(r.amount || 0), 0));
}

async function persistReceivableTotals(
  supabase: SupabaseClient,
  receivable: MasterCorporateReceivable,
  preferDraft = false,
): Promise<MasterCorporateReceivable> {
  const received_amount = await sumValidPayments(supabase, receivable.id);
  const remaining_amount = roundMoney(receivable.net_amount - received_amount);
  if (remaining_amount < 0) {
    throw new Error('Recebido não pode ultrapassar o valor líquido.');
  }
  const status = computeReceivableStatus({
    net_amount: receivable.net_amount,
    received_amount,
    due_date: receivable.due_date,
    is_archived: receivable.is_archived,
    canceled_at: receivable.canceled_at,
    preferDraft: preferDraft && received_amount === 0,
  });

  const { data, error } = await supabase
    .from('master_corporate_receivables')
    .update({
      received_amount,
      remaining_amount,
      status,
      updated_at: nowIso(),
    })
    .eq('id', receivable.id)
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return mapReceivable(data as Record<string, unknown>);
}

export async function getReceivable(
  supabase: SupabaseClient,
  id: string,
): Promise<MasterCorporateReceivable | null> {
  const { data, error } = await supabase
    .from('master_corporate_receivables')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapReceivable(data as Record<string, unknown>) : null;
}

export async function listReceivablePayments(
  supabase: SupabaseClient,
  receivableId: string,
): Promise<MasterCorporateReceivablePayment[]> {
  const { data, error } = await supabase
    .from('master_corporate_receivable_payments')
    .select('*')
    .eq('receivable_id', receivableId)
    .order('payment_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as MasterCorporateReceivablePayment[];
}

function applyReceivableFilters(query: any, filters: MasterCorporateArApListFilters) {
  const dateField = filters.dateField || 'due_date';
  if (!filters.includeArchived) query = query.eq('is_archived', false);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.projectId) query = query.eq('project_id', filters.projectId);
  if (filters.quoteId) query = query.eq('quote_id', filters.quoteId);
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
      .neq('status', 'RECEIVED')
      .neq('status', 'CANCELED')
      .neq('status', 'ARCHIVED');
  }
  if (filters.q) {
    const q = `%${filters.q.replace(/%/g, '')}%`;
    query = query.or(
      `code.ilike.${q},description.ilike.${q},customer_name.ilike.${q},customer_document.ilike.${q}`,
    );
  }
  return query;
}

export async function listReceivables(
  supabase: SupabaseClient,
  filters: MasterCorporateArApListFilters = {},
): Promise<{
  receivables: MasterCorporateReceivable[];
  total: number;
  page: number;
  limit: number;
  kpis: MasterCorporateReceivableKpis;
}> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('master_corporate_receivables')
    .select('*', { count: 'exact' });
  query = applyReceivableFilters(query, filters);
  query = query.order('due_date', { ascending: true }).range(from, to);

  const [{ data, error, count }, kpis] = await Promise.all([
    query,
    computeReceivableKpis(supabase),
  ]);
  if (error) throw new Error(error.message);

  return {
    receivables: (data || []).map((r) => mapReceivable(r as Record<string, unknown>)),
    total: count ?? 0,
    page,
    limit,
    kpis,
  };
}

export async function computeReceivableKpis(
  supabase: SupabaseClient,
): Promise<MasterCorporateReceivableKpis> {
  const { from, to } = monthBounds();
  const today = new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('master_corporate_receivables')
    .select('status, remaining_amount, due_date, received_amount, is_archived, canceled_at')
    .eq('is_archived', false)
    .is('canceled_at', null);
  if (error) throw new Error(error.message);

  const rows = data || [];
  let totalOpen = 0;
  let dueThisMonth = 0;
  let overdue = 0;
  let openCount = 0;
  let partialCount = 0;
  let receivedCount = 0;

  for (const r of rows) {
    const remaining = Number(r.remaining_amount || 0);
    const status = String(r.status);
    if (status === 'OPEN') openCount += 1;
    if (status === 'PARTIAL') partialCount += 1;
    if (status === 'RECEIVED') receivedCount += 1;
    if (remaining > 0) {
      totalOpen = roundMoney(totalOpen + remaining);
      const due = String(r.due_date).slice(0, 10);
      if (due >= from && due <= to) dueThisMonth = roundMoney(dueThisMonth + remaining);
      if (due < today && status !== 'RECEIVED') overdue = roundMoney(overdue + remaining);
    }
  }

  const { data: pays, error: pErr } = await supabase
    .from('master_corporate_receivable_payments')
    .select('amount, payment_date, is_reversed')
    .eq('is_reversed', false)
    .gte('payment_date', from)
    .lte('payment_date', to);
  if (pErr) throw new Error(pErr.message);
  const receivedThisMonth = roundMoney(
    (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0),
  );

  return {
    totalOpen,
    dueThisMonth,
    receivedThisMonth,
    overdue,
    openCount,
    partialCount,
    receivedCount,
  };
}

export async function createReceivable(
  supabase: SupabaseClient,
  input: MasterCorporateReceivableInput,
  userId: string | null,
): Promise<MasterCorporateReceivable> {
  await assertCategoryIncome(supabase, input.category_id);
  await assertOptionalRefs(supabase, input);

  const net_amount = computeNetAmount(input);
  const code = await nextReceivableCode(supabase);
  const preferDraft = input.status === 'DRAFT';
  const status = computeReceivableStatus({
    net_amount,
    received_amount: 0,
    due_date: input.due_date,
    is_archived: false,
    canceled_at: null,
    preferDraft,
  });

  const { data, error } = await supabase
    .from('master_corporate_receivables')
    .insert({
      code,
      description: input.description,
      customer_name: input.customer_name,
      customer_document: input.customer_document,
      customer_phone: input.customer_phone,
      customer_email: input.customer_email,
      project_id: input.project_id,
      quote_id: input.quote_id,
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
      received_amount: 0,
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
  return mapReceivable(data as Record<string, unknown>);
}

export async function updateReceivable(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateReceivableInput,
  userId: string | null,
): Promise<MasterCorporateReceivable> {
  const existing = await getReceivable(supabase, id);
  if (!existing) throw new Error('Recebível não encontrado.');
  if (existing.canceled_at) throw new Error('Recebível cancelado não pode ser editado.');
  if (existing.is_archived) throw new Error('Recebível arquivado não pode ser editado.');
  if (existing.remaining_amount <= 0 && existing.received_amount > 0) {
    throw new Error('Recebível liquidado não pode ser editado.');
  }

  await assertCategoryIncome(supabase, input.category_id);
  await assertOptionalRefs(supabase, input);

  const net_amount = computeNetAmount(input);
  if (existing.received_amount > net_amount) {
    throw new Error('Novo valor líquido menor que o já recebido.');
  }

  const remaining_amount = roundMoney(net_amount - existing.received_amount);
  const status = computeReceivableStatus({
    net_amount,
    received_amount: existing.received_amount,
    due_date: input.due_date,
    is_archived: false,
    canceled_at: null,
    preferDraft: input.status === 'DRAFT' && existing.received_amount === 0,
  });

  const { data, error } = await supabase
    .from('master_corporate_receivables')
    .update({
      description: input.description,
      customer_name: input.customer_name,
      customer_document: input.customer_document,
      customer_phone: input.customer_phone,
      customer_email: input.customer_email,
      project_id: input.project_id,
      quote_id: input.quote_id,
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
  return mapReceivable(data as Record<string, unknown>);
}

export async function receiveReceivable(
  supabase: SupabaseClient,
  id: string,
  input: MasterCorporateSettlementInput,
  userId: string | null,
): Promise<{ receivable: MasterCorporateReceivable; payment: MasterCorporateReceivablePayment }> {
  const existing = await getReceivable(supabase, id);
  if (!existing) throw new Error('Recebível não encontrado.');
  if (existing.canceled_at) throw new Error('Recebível cancelado.');
  if (existing.is_archived) throw new Error('Recebível arquivado.');
  if (existing.remaining_amount <= 0) throw new Error('Recebível já liquidado.');
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
      .from('master_corporate_receivable_payments')
      .select('id')
      .eq('idempotency_key', input.idempotency_key)
      .maybeSingle();
    if (dup) throw new Error('Recebimento duplicado (idempotência).');
  }

  const { data: paymentRow, error: pErr } = await supabase
    .from('master_corporate_receivable_payments')
    .insert({
      receivable_id: id,
      financial_account_id: input.financial_account_id,
      payment_date: input.payment_date,
      amount: input.amount,
      payment_method: input.payment_method,
      reference: input.reference,
      notes: input.notes,
      origin: input.origin || 'MANUAL',
      idempotency_key: input.idempotency_key || null,
      created_by: userId,
    })
    .select('*')
    .single();

  if (pErr) {
    if (pErr.code === '23505') throw new Error('Recebimento duplicado (idempotência).');
    throw new Error(pErr.message);
  }

  const receivable = await persistReceivableTotals(supabase, existing);
  const payment = paymentRow as MasterCorporateReceivablePayment;

  await logCorporateFinanceAudit(supabase, {
    userId,
    action:
      receivable.status === 'RECEIVED'
        ? 'CORPORATE_RECEIVABLE_RECEIVED_FULL'
        : 'CORPORATE_RECEIVABLE_RECEIVED_PARTIAL',
    entityId: id,
    description: `Recebimento ${receivable.status === 'RECEIVED' ? 'total' : 'parcial'} ${receivable.code}: ${input.amount}`,
    newData: { paymentId: payment.id, amount: input.amount, status: receivable.status },
  });

  return { receivable, payment };
}

export async function reverseReceivablePayment(
  supabase: SupabaseClient,
  receivableId: string,
  paymentId: string,
  reason: string,
  userId: string | null,
): Promise<{ receivable: MasterCorporateReceivable; payment: MasterCorporateReceivablePayment }> {
  const existing = await getReceivable(supabase, receivableId);
  if (!existing) throw new Error('Recebível não encontrado.');

  const { data: payment, error } = await supabase
    .from('master_corporate_receivable_payments')
    .select('*')
    .eq('id', paymentId)
    .eq('receivable_id', receivableId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!payment) throw new Error('Pagamento não encontrado.');
  if (payment.is_reversed) throw new Error('Pagamento já estornado.');

  const reasonClean = String(reason || '').trim();
  if (!reasonClean) throw new Error('Motivo do estorno é obrigatório.');

  const { data: updatedPay, error: uErr } = await supabase
    .from('master_corporate_receivable_payments')
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

  const receivable = await persistReceivableTotals(supabase, {
    ...existing,
    is_archived: false,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_RECEIVABLE_PAYMENT_REVERSED',
    entityId: receivableId,
    description: `Estorno de recebimento ${existing.code}: ${payment.amount}`,
    oldData: { paymentId, amount: payment.amount },
    newData: { status: receivable.status, reason: reasonClean },
  });

  return {
    receivable,
    payment: updatedPay as MasterCorporateReceivablePayment,
  };
}

export async function cancelReceivable(
  supabase: SupabaseClient,
  id: string,
  reason: string,
  userId: string | null,
): Promise<MasterCorporateReceivable> {
  const existing = await getReceivable(supabase, id);
  if (!existing) throw new Error('Recebível não encontrado.');
  if (existing.canceled_at) throw new Error('Recebível já cancelado.');
  if (existing.received_amount > 0) {
    throw new Error('Estorne os recebimentos antes de cancelar.');
  }
  const reasonClean = String(reason || '').trim();
  if (!reasonClean) throw new Error('Motivo do cancelamento é obrigatório.');

  const { data, error } = await supabase
    .from('master_corporate_receivables')
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
    action: 'CORPORATE_RECEIVABLE_CANCELED',
    entityId: id,
    description: `Recebível cancelado ${existing.code}`,
    newData: { reason: reasonClean },
  });

  return mapReceivable(data as Record<string, unknown>);
}

export async function archiveReceivable(
  supabase: SupabaseClient,
  id: string,
  userId: string | null,
): Promise<MasterCorporateReceivable> {
  const existing = await getReceivable(supabase, id);
  if (!existing) throw new Error('Recebível não encontrado.');
  if (existing.is_archived) throw new Error('Já arquivado.');

  const { data, error } = await supabase
    .from('master_corporate_receivables')
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
    action: 'CORPORATE_RECEIVABLE_ARCHIVED',
    entityId: id,
    description: `Recebível arquivado ${existing.code}`,
  });

  return mapReceivable(data as Record<string, unknown>);
}

export async function restoreReceivable(
  supabase: SupabaseClient,
  id: string,
  userId: string | null,
): Promise<MasterCorporateReceivable> {
  const existing = await getReceivable(supabase, id);
  if (!existing) throw new Error('Recebível não encontrado.');
  if (!existing.is_archived) throw new Error('Recebível não está arquivado.');
  if (existing.canceled_at) throw new Error('Recebível cancelado não pode ser restaurado.');

  const { error } = await supabase
    .from('master_corporate_receivables')
    .update({
      is_archived: false,
      updated_by: userId,
      updated_at: nowIso(),
    })
    .eq('id', id);
  if (error) throw new Error(error.message);

  const refreshed = await getReceivable(supabase, id);
  if (!refreshed) throw new Error('Recebível não encontrado.');
  const receivable = await persistReceivableTotals(supabase, refreshed);

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_RECEIVABLE_RESTORED',
    entityId: id,
    description: `Recebível restaurado ${existing.code}`,
    newData: { status: receivable.status },
  });

  return receivable;
}

export function receivablesToCsv(rows: MasterCorporateReceivable[]): string {
  const header = [
    'code',
    'customer_name',
    'description',
    'issue_date',
    'due_date',
    'net_amount',
    'received_amount',
    'remaining_amount',
    'status',
  ];
  const lines = [header.join(';')];
  for (const r of rows) {
    lines.push(
      [
        r.code,
        JSON.stringify(r.customer_name),
        JSON.stringify(r.description),
        r.issue_date,
        r.due_date,
        String(r.net_amount).replace('.', ','),
        String(r.received_amount).replace('.', ','),
        String(r.remaining_amount).replace('.', ','),
        r.status,
      ].join(';'),
    );
  }
  return lines.join('\n');
}
