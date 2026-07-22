import type { SupabaseClient } from '@supabase/supabase-js';
import { roundMoney } from './arApMath';
import {
  aggregateCorporateCashMonthlyRevenueExpense,
  computeAccountBalance,
  computeAllAccountsCurrentBalance,
  findMovementByIdempotency,
  insertCashMovement,
  mapCashMovementRow,
  pnlCashEffect,
  signedCashEffect,
} from './cashMath';
import type {
  MasterCorporateCashKpis,
  MasterCorporateCashListFilters,
  MasterCorporateCashMovement,
  MasterCorporateCashMovementInput,
  MasterCorporateTransferInput,
} from './cashTypes';
import { logCorporateFinanceAudit } from './service';

function nowIso() {
  return new Date().toISOString();
}

async function assertActiveAccount(supabase: SupabaseClient, accountId: string) {
  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id, is_active, name')
    .eq('id', accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Conta financeira não encontrada.');
  if (!data.is_active) throw new Error('Conta financeira inativa.');
  return data;
}

async function assertCategoryType(
  supabase: SupabaseClient,
  categoryId: string,
  expected: 'INCOME' | 'EXPENSE',
) {
  const { data, error } = await supabase
    .from('master_corporate_financial_categories')
    .select('id, type, is_active, name')
    .eq('id', categoryId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || !data.is_active) throw new Error('Categoria inválida.');
  if (data.type !== expected) {
    throw new Error(
      expected === 'INCOME'
        ? 'Categoria deve ser de receita (INCOME).'
        : 'Categoria deve ser de despesa (EXPENSE).',
    );
  }
  return data;
}

export async function createMovementFromReceivablePayment(
  supabase: SupabaseClient,
  params: {
    receivable: {
      id: string;
      code: string;
      category_id: string;
      cost_center_id: string | null;
      project_id: string | null;
      quote_id: string | null;
      competence_date: string;
      customer_name?: string;
    };
    payment: {
      id: string;
      amount: number;
      payment_date: string;
      financial_account_id: string;
      payment_method: string;
      reference: string | null;
      notes: string | null;
    };
    userId: string | null;
    origin?: 'RECEIVABLE_PAYMENT' | 'BACKFILL_RECEIVABLE';
  },
): Promise<MasterCorporateCashMovement> {
  const key = `RECEIVABLE_PAYMENT:${params.payment.id}`;
  const existing = await findMovementByIdempotency(supabase, key);
  if (existing) return existing;

  const origin = params.origin || 'RECEIVABLE_PAYMENT';
  const description = `Recebimento ${params.receivable.code}${
    params.receivable.customer_name ? ` — ${params.receivable.customer_name}` : ''
  }`;

  const movement = await insertCashMovement(supabase, {
    movement_date: params.payment.payment_date,
    competence_date: params.receivable.competence_date || params.payment.payment_date,
    type: 'INCOME',
    amount: params.payment.amount,
    description,
    financial_account_id: params.payment.financial_account_id,
    category_id: params.receivable.category_id,
    cost_center_id: params.receivable.cost_center_id,
    project_id: params.receivable.project_id,
    quote_id: params.receivable.quote_id,
    receivable_id: params.receivable.id,
    receivable_payment_id: params.payment.id,
    origin,
    payment_method: params.payment.payment_method,
    reference: params.payment.reference,
    notes: params.payment.notes,
    idempotency_key: key,
    created_by: params.userId,
  });

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_CASH_INCOME_FROM_RECEIVABLE',
    entityId: movement.id,
    description: `Entrada automática ${movement.code} de ${params.receivable.code}`,
    newData: { amount: movement.amount, origin },
  });

  return movement;
}

export async function createMovementFromPayablePayment(
  supabase: SupabaseClient,
  params: {
    payable: {
      id: string;
      code: string;
      category_id: string;
      cost_center_id: string | null;
      project_id: string | null;
      competence_date: string;
      supplier_name?: string;
    };
    payment: {
      id: string;
      amount: number;
      payment_date: string;
      financial_account_id: string;
      payment_method: string;
      reference: string | null;
      notes: string | null;
    };
    userId: string | null;
    origin?: 'PAYABLE_PAYMENT' | 'BACKFILL_PAYABLE';
  },
): Promise<MasterCorporateCashMovement> {
  const key = `PAYABLE_PAYMENT:${params.payment.id}`;
  const existing = await findMovementByIdempotency(supabase, key);
  if (existing) return existing;

  const origin = params.origin || 'PAYABLE_PAYMENT';
  const description = `Pagamento ${params.payable.code}${
    params.payable.supplier_name ? ` — ${params.payable.supplier_name}` : ''
  }`;

  const movement = await insertCashMovement(supabase, {
    movement_date: params.payment.payment_date,
    competence_date: params.payable.competence_date || params.payment.payment_date,
    type: 'EXPENSE',
    amount: params.payment.amount,
    description,
    financial_account_id: params.payment.financial_account_id,
    category_id: params.payable.category_id,
    cost_center_id: params.payable.cost_center_id,
    project_id: params.payable.project_id,
    payable_id: params.payable.id,
    payable_payment_id: params.payment.id,
    origin,
    payment_method: params.payment.payment_method,
    reference: params.payment.reference,
    notes: params.payment.notes,
    idempotency_key: key,
    created_by: params.userId,
  });

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_CASH_EXPENSE_FROM_PAYABLE',
    entityId: movement.id,
    description: `Saída automática ${movement.code} de ${params.payable.code}`,
    newData: { amount: movement.amount, origin },
  });

  return movement;
}

export async function reverseCashMovementForPayment(
  supabase: SupabaseClient,
  params: {
    kind: 'RECEIVABLE' | 'PAYABLE';
    paymentId: string;
    reason: string;
    userId: string | null;
  },
): Promise<MasterCorporateCashMovement | null> {
  const col =
    params.kind === 'RECEIVABLE' ? 'receivable_payment_id' : 'payable_payment_id';
  const { data: original, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('*')
    .eq(col, params.paymentId)
    .eq('is_reversed', false)
    .neq('origin', 'REVERSAL')
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!original) return null;

  const mapped = mapCashMovementRow(original as Record<string, unknown>);
  if (mapped.is_reversed) throw new Error('Movimento já estornado.');

  const revKey = `REVERSAL:${mapped.id}`;
  const existingRev = await findMovementByIdempotency(supabase, revKey);
  if (existingRev) return existingRev;

  const revTag =
    mapped.type === 'INCOME'
      ? '[REV:INCOME]'
      : mapped.type === 'EXPENSE'
        ? '[REV:EXPENSE]'
        : mapped.type === 'TRANSFER_IN'
          ? '[REV:TRANSFER_IN]'
          : mapped.type === 'TRANSFER_OUT'
            ? '[REV:TRANSFER_OUT]'
            : '[REV:OTHER]';

  const reversal = await insertCashMovement(supabase, {
    movement_date: new Date().toISOString().slice(0, 10),
    competence_date: mapped.competence_date,
    type: 'REVERSAL',
    amount: mapped.amount,
    description: `Estorno de ${mapped.code} — ${mapped.description}`,
    financial_account_id: mapped.financial_account_id,
    category_id: mapped.category_id,
    cost_center_id: mapped.cost_center_id,
    project_id: mapped.project_id,
    quote_id: mapped.quote_id,
    receivable_id: mapped.receivable_id,
    receivable_payment_id: mapped.receivable_payment_id,
    payable_id: mapped.payable_id,
    payable_payment_id: mapped.payable_payment_id,
    transfer_group_id: mapped.transfer_group_id,
    origin: 'REVERSAL',
    payment_method: mapped.payment_method,
    reference: mapped.reference,
    notes: `${revTag} ${params.reason}`.slice(0, 2000),
    idempotency_key: revKey,
    created_by: params.userId,
  });

  const { error: uErr } = await supabase
    .from('master_corporate_cash_movements')
    .update({
      is_reversed: true,
      reversed_at: nowIso(),
      reversed_by: params.userId,
      reversal_reason: params.reason.slice(0, 500),
      reversal_movement_id: reversal.id,
      updated_at: nowIso(),
    })
    .eq('id', mapped.id);
  if (uErr) throw new Error(uErr.message);

  await logCorporateFinanceAudit(supabase, {
    userId: params.userId,
    action: 'CORPORATE_CASH_MOVEMENT_REVERSED',
    entityId: mapped.id,
    description: `Estorno do movimento ${mapped.code}`,
    newData: { reversalId: reversal.id, reason: params.reason },
  });

  return reversal;
}

export async function createManualCashMovement(
  supabase: SupabaseClient,
  input: MasterCorporateCashMovementInput,
  userId: string | null,
): Promise<MasterCorporateCashMovement> {
  await assertActiveAccount(supabase, input.financial_account_id);
  await assertCategoryType(
    supabase,
    input.category_id,
    input.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
  );
  if (input.amount <= 0) throw new Error('Valor deve ser maior que zero.');

  const movement = await insertCashMovement(supabase, {
    movement_date: input.movement_date,
    competence_date: input.competence_date,
    type: input.type,
    amount: input.amount,
    description: input.description,
    financial_account_id: input.financial_account_id,
    category_id: input.category_id,
    cost_center_id: input.cost_center_id,
    project_id: input.project_id,
    origin: input.type === 'INCOME' ? 'MANUAL_INCOME' : 'MANUAL_EXPENSE',
    payment_method: input.payment_method,
    reference: input.reference,
    notes: input.notes,
    created_by: userId,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action:
      input.type === 'INCOME'
        ? 'CORPORATE_CASH_MANUAL_INCOME'
        : 'CORPORATE_CASH_MANUAL_EXPENSE',
    entityId: movement.id,
    description: `Lançamento manual ${movement.code}`,
    newData: { type: input.type, amount: input.amount },
  });

  return movement;
}

export async function createAccountTransfer(
  supabase: SupabaseClient,
  input: MasterCorporateTransferInput,
  userId: string | null,
): Promise<{ out: MasterCorporateCashMovement; inn: MasterCorporateCashMovement }> {
  if (input.from_account_id === input.to_account_id) {
    throw new Error('Conta de origem e destino devem ser distintas.');
  }
  if (input.amount <= 0) throw new Error('Valor deve ser maior que zero.');
  await assertActiveAccount(supabase, input.from_account_id);
  await assertActiveAccount(supabase, input.to_account_id);

  const groupId = crypto.randomUUID();
  const desc = `Transferência entre contas`;

  const out = await insertCashMovement(supabase, {
    movement_date: input.movement_date,
    competence_date: input.movement_date,
    type: 'TRANSFER_OUT',
    amount: input.amount,
    description: desc,
    financial_account_id: input.from_account_id,
    transfer_group_id: groupId,
    origin: 'ACCOUNT_TRANSFER',
    notes: input.notes,
    idempotency_key: `TRANSFER_OUT:${groupId}`,
    created_by: userId,
  });

  const inn = await insertCashMovement(supabase, {
    movement_date: input.movement_date,
    competence_date: input.movement_date,
    type: 'TRANSFER_IN',
    amount: input.amount,
    description: desc,
    financial_account_id: input.to_account_id,
    transfer_group_id: groupId,
    origin: 'ACCOUNT_TRANSFER',
    notes: input.notes,
    idempotency_key: `TRANSFER_IN:${groupId}`,
    created_by: userId,
  });

  await logCorporateFinanceAudit(supabase, {
    userId,
    action: 'CORPORATE_CASH_TRANSFER',
    entityId: groupId,
    description: `Transferência ${out.code} → ${inn.code}`,
    newData: {
      amount: input.amount,
      from: input.from_account_id,
      to: input.to_account_id,
    },
  });

  return { out, inn };
}

async function dayBeforeIso(dateIso: string): Promise<string> {
  const d = new Date(`${dateIso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function consolidatedOpeningAsOf(
  supabase: SupabaseClient,
  asOfDate?: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id');
  if (error) throw new Error(error.message);
  let total = 0;
  for (const a of data || []) {
    const bal = await computeAccountBalance(supabase, String(a.id), asOfDate);
    total = roundMoney(total + bal.currentBalance);
  }
  return total;
}

export async function listCashMovementsWithRunningBalance(
  supabase: SupabaseClient,
  filters: MasterCorporateCashListFilters = {},
): Promise<{
  movements: Array<MasterCorporateCashMovement & { running_balance: number | null }>;
  total: number;
  page: number;
  limit: number;
  kpis: MasterCorporateCashKpis;
}> {
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(5000, Math.max(1, filters.limit || 50));

  let q = supabase
    .from('master_corporate_cash_movements')
    .select('*', { count: 'exact' })
    .order('movement_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (!filters.includeReversed) q = q.eq('is_reversed', false);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.origin) q = q.eq('origin', filters.origin);
  if (filters.financialAccountId) {
    q = q.eq('financial_account_id', filters.financialAccountId);
  }
  if (filters.categoryId) q = q.eq('category_id', filters.categoryId);
  if (filters.costCenterId) q = q.eq('cost_center_id', filters.costCenterId);
  if (filters.projectId) q = q.eq('project_id', filters.projectId);
  if (filters.paymentMethod) q = q.eq('payment_method', filters.paymentMethod);
  if (filters.fromDate) q = q.gte('movement_date', filters.fromDate);
  if (filters.toDate) q = q.lte('movement_date', filters.toDate);
  if (filters.q) {
    const raw = filters.q.replace(/%/g, '').replace(/,/g, ' ').trim();
    if (raw) {
      const pat = `%${raw}%`;
      q = q.or(`code.ilike.${pat},description.ilike.${pat},reference.ilike.${pat}`);
    }
  }

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);

  const all = (data || []).map((r) => mapCashMovementRow(r as Record<string, unknown>));

  let running = 0;
  if (filters.fromDate) {
    const asOf = await dayBeforeIso(filters.fromDate);
    running = filters.financialAccountId
      ? (await computeAccountBalance(supabase, filters.financialAccountId, asOf)).currentBalance
      : await consolidatedOpeningAsOf(supabase, asOf);
  } else if (filters.financialAccountId) {
    const acc = await supabase
      .from('master_corporate_financial_accounts')
      .select('opening_balance, opening_balance_date')
      .eq('id', filters.financialAccountId)
      .maybeSingle();
    const openingDate = acc.data?.opening_balance_date
      ? String(acc.data.opening_balance_date).slice(0, 10)
      : null;
    const openingBal = roundMoney(Number(acc.data?.opening_balance || 0));
    // Sem fromDate: saldo inicial entra se a data de abertura já passou (sempre, se null).
    running = openingDate ? openingBal : openingBal;
  } else {
    running = await consolidatedOpeningAsOf(supabase, '1900-01-01');
    // Sem período: soma saldos iniciais (contribuição na data de abertura).
    const { data: accounts } = await supabase
      .from('master_corporate_financial_accounts')
      .select('opening_balance');
    running = roundMoney(
      (accounts || []).reduce((s, a) => s + Number(a.opening_balance || 0), 0),
    );
  }

  const openingBalanceInPeriod = running;
  let periodIncome = 0;
  let periodExpense = 0;

  const withRunning = all.map((m) => {
    const pnl = pnlCashEffect(m);
    if (filters.financialAccountId) {
      running = roundMoney(running + signedCashEffect(m));
    } else {
      running = roundMoney(running + pnl.income - pnl.expense);
    }
    return { ...m, running_balance: running };
  });

  for (const m of all) {
    const pnl = pnlCashEffect(m);
    periodIncome = roundMoney(periodIncome + pnl.income);
    periodExpense = roundMoney(periodExpense + pnl.expense);
  }

  const from = (page - 1) * limit;
  const pageRows = withRunning.slice(from, from + limit);

  const currentBalance = filters.financialAccountId
    ? (await computeAccountBalance(supabase, filters.financialAccountId)).currentBalance
    : await computeAllAccountsCurrentBalance(supabase);

  return {
    movements: pageRows,
    total: count ?? all.length,
    page,
    limit,
    kpis: {
      currentBalance,
      periodIncome,
      periodExpense,
      periodNet: roundMoney(periodIncome - periodExpense),
      openingBalanceInPeriod,
      closingBalance: withRunning.length
        ? withRunning[withRunning.length - 1]!.running_balance || 0
        : openingBalanceInPeriod,
      movementsCount: all.length,
    },
  };
}

export async function findMovementsByPaymentIds(
  supabase: SupabaseClient,
  opts: { receivablePaymentIds?: string[]; payablePaymentIds?: string[] },
): Promise<Record<string, MasterCorporateCashMovement>> {
  const out: Record<string, MasterCorporateCashMovement> = {};
  const recvIds = opts.receivablePaymentIds || [];
  const payIds = opts.payablePaymentIds || [];

  if (recvIds.length) {
    const { data, error } = await supabase
      .from('master_corporate_cash_movements')
      .select('*')
      .in('receivable_payment_id', recvIds)
      .neq('origin', 'REVERSAL');
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const m = mapCashMovementRow(row as Record<string, unknown>);
      if (m.receivable_payment_id) out[m.receivable_payment_id] = m;
    }
  }
  if (payIds.length) {
    const { data, error } = await supabase
      .from('master_corporate_cash_movements')
      .select('*')
      .in('payable_payment_id', payIds)
      .neq('origin', 'REVERSAL');
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const m = mapCashMovementRow(row as Record<string, unknown>);
      if (m.payable_payment_id) out[m.payable_payment_id] = m;
    }
  }
  return out;
}

export type BackfillReport = {
  dryRun: boolean;
  receivablePaymentsFound: number;
  payablePaymentsFound: number;
  created: number;
  skipped: number;
  errors: Array<{ paymentId: string; error: string }>;
};

export async function backfillCashMovements(
  supabase: SupabaseClient,
  opts: { dryRun: boolean; userId: string | null },
): Promise<BackfillReport> {
  const report: BackfillReport = {
    dryRun: opts.dryRun,
    receivablePaymentsFound: 0,
    payablePaymentsFound: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  const { data: recvPays, error: rErr } = await supabase
    .from('master_corporate_receivable_payments')
    .select('*, receivable:master_corporate_receivables(*)')
    .eq('is_reversed', false);
  if (rErr) throw new Error(rErr.message);

  const { data: payPays, error: pErr } = await supabase
    .from('master_corporate_payable_payments')
    .select('*, payable:master_corporate_payables(*)')
    .eq('is_reversed', false);
  if (pErr) throw new Error(pErr.message);

  report.receivablePaymentsFound = (recvPays || []).length;
  report.payablePaymentsFound = (payPays || []).length;

  for (const pay of recvPays || []) {
    const key = `RECEIVABLE_PAYMENT:${pay.id}`;
    const existing = await findMovementByIdempotency(supabase, key);
    if (existing) {
      report.skipped += 1;
      continue;
    }
    const receivable = pay.receivable as Record<string, unknown> | null;
    if (!receivable) {
      report.errors.push({ paymentId: String(pay.id), error: 'Recebível ausente' });
      continue;
    }
    if (opts.dryRun) {
      report.created += 1;
      continue;
    }
    try {
      await createMovementFromReceivablePayment(supabase, {
        receivable: {
          id: String(receivable.id),
          code: String(receivable.code),
          category_id: String(receivable.category_id),
          cost_center_id: receivable.cost_center_id
            ? String(receivable.cost_center_id)
            : null,
          project_id: receivable.project_id ? String(receivable.project_id) : null,
          quote_id: receivable.quote_id ? String(receivable.quote_id) : null,
          competence_date: String(receivable.competence_date).slice(0, 10),
          customer_name: receivable.customer_name
            ? String(receivable.customer_name)
            : undefined,
        },
        payment: {
          id: String(pay.id),
          amount: Number(pay.amount),
          payment_date: String(pay.payment_date).slice(0, 10),
          financial_account_id: String(pay.financial_account_id),
          payment_method: String(pay.payment_method),
          reference: pay.reference ? String(pay.reference) : null,
          notes: pay.notes ? String(pay.notes) : null,
        },
        userId: opts.userId,
        origin: 'BACKFILL_RECEIVABLE',
      });
      report.created += 1;
    } catch (err) {
      report.errors.push({
        paymentId: String(pay.id),
        error: err instanceof Error ? err.message : 'erro',
      });
    }
  }

  for (const pay of payPays || []) {
    const key = `PAYABLE_PAYMENT:${pay.id}`;
    const existing = await findMovementByIdempotency(supabase, key);
    if (existing) {
      report.skipped += 1;
      continue;
    }
    const payable = pay.payable as Record<string, unknown> | null;
    if (!payable) {
      report.errors.push({ paymentId: String(pay.id), error: 'Pagável ausente' });
      continue;
    }
    if (opts.dryRun) {
      report.created += 1;
      continue;
    }
    try {
      await createMovementFromPayablePayment(supabase, {
        payable: {
          id: String(payable.id),
          code: String(payable.code),
          category_id: String(payable.category_id),
          cost_center_id: payable.cost_center_id ? String(payable.cost_center_id) : null,
          project_id: payable.project_id ? String(payable.project_id) : null,
          competence_date: String(payable.competence_date).slice(0, 10),
          supplier_name: payable.supplier_name ? String(payable.supplier_name) : undefined,
        },
        payment: {
          id: String(pay.id),
          amount: Number(pay.amount),
          payment_date: String(pay.payment_date).slice(0, 10),
          financial_account_id: String(pay.financial_account_id),
          payment_method: String(pay.payment_method),
          reference: pay.reference ? String(pay.reference) : null,
          notes: pay.notes ? String(pay.notes) : null,
        },
        userId: opts.userId,
        origin: 'BACKFILL_PAYABLE',
      });
      report.created += 1;
    } catch (err) {
      report.errors.push({
        paymentId: String(pay.id),
        error: err instanceof Error ? err.message : 'erro',
      });
    }
  }

  await logCorporateFinanceAudit(supabase, {
    userId: opts.userId,
    action: opts.dryRun
      ? 'CORPORATE_CASH_BACKFILL_DRY_RUN'
      : 'CORPORATE_CASH_BACKFILL_EXECUTED',
    entityId: 'cash-backfill',
    description: `Backfill caixa dryRun=${opts.dryRun} created=${report.created} skipped=${report.skipped}`,
    newData: report,
  });

  return report;
}

export async function getCashHubKpis(supabase: SupabaseClient) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);

  const list = await listCashMovementsWithRunningBalance(supabase, {
    fromDate: from,
    toDate: to,
    includeReversed: false,
    limit: 5000,
  });

  return {
    currentBalance: list.kpis.currentBalance,
    monthIncome: list.kpis.periodIncome,
    monthExpense: list.kpis.periodExpense,
    monthNet: list.kpis.periodNet,
  };
}

export function cashMovementsToCsv(
  rows: Array<MasterCorporateCashMovement & { running_balance?: number | null }>,
): string {
  const header = [
    'date',
    'code',
    'description',
    'type',
    'origin',
    'income',
    'expense',
    'running_balance',
  ];
  const lines = [header.join(';')];
  for (const r of rows) {
    const income =
      r.type === 'INCOME' || (r.type === 'REVERSAL' && String(r.notes || '').includes('[REV:EXPENSE]'))
        ? r.amount
        : 0;
    const expense =
      r.type === 'EXPENSE' || (r.type === 'REVERSAL' && String(r.notes || '').includes('[REV:INCOME]'))
        ? r.amount
        : 0;
    lines.push(
      [
        r.movement_date,
        r.code,
        JSON.stringify(r.description),
        r.type,
        r.origin,
        String(income).replace('.', ','),
        String(expense).replace('.', ','),
        r.running_balance != null ? String(r.running_balance).replace('.', ',') : '',
      ].join(';'),
    );
  }
  return lines.join('\n');
}

export { aggregateCorporateCashMonthlyRevenueExpense, computeAccountBalance };
