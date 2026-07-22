import type { SupabaseClient } from '@supabase/supabase-js';
import { roundMoney } from './arApMath';
import type {
  CorporateMonthlyRevenueExpense,
  MasterCorporateAccountBalance,
  MasterCorporateCashMovement,
} from './cashTypes';

function mapRow(row: Record<string, unknown>): MasterCorporateCashMovement {
  return {
    id: String(row.id),
    code: String(row.code),
    movement_date: String(row.movement_date).slice(0, 10),
    competence_date: String(row.competence_date).slice(0, 10),
    type: row.type as MasterCorporateCashMovement['type'],
    amount: Number(row.amount),
    description: String(row.description),
    financial_account_id: String(row.financial_account_id),
    category_id: row.category_id ? String(row.category_id) : null,
    cost_center_id: row.cost_center_id ? String(row.cost_center_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    quote_id: row.quote_id ? String(row.quote_id) : null,
    receivable_id: row.receivable_id ? String(row.receivable_id) : null,
    receivable_payment_id: row.receivable_payment_id
      ? String(row.receivable_payment_id)
      : null,
    payable_id: row.payable_id ? String(row.payable_id) : null,
    payable_payment_id: row.payable_payment_id ? String(row.payable_payment_id) : null,
    transfer_group_id: row.transfer_group_id ? String(row.transfer_group_id) : null,
    origin: row.origin as MasterCorporateCashMovement['origin'],
    payment_method: row.payment_method ? String(row.payment_method) : null,
    reference: row.reference ? String(row.reference) : null,
    notes: row.notes ? String(row.notes) : null,
    idempotency_key: row.idempotency_key ? String(row.idempotency_key) : null,
    is_reversed: Boolean(row.is_reversed),
    reversed_at: row.reversed_at ? String(row.reversed_at) : null,
    reversed_by: row.reversed_by ? String(row.reversed_by) : null,
    reversal_reason: row.reversal_reason ? String(row.reversal_reason) : null,
    reversal_movement_id: row.reversal_movement_id
      ? String(row.reversal_movement_id)
      : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/**
 * Efeito no saldo da conta.
 * REVERSAL: usa notes metadata `__reverses_effect:INCOME|EXPENSE` ou inferência via origin pairing.
 * Convenção: movimento REVERSAL tem `notes` começando com `[REV:INCOME]` ou `[REV:EXPENSE]`
 * onde INCOME significa que o original era entrada → estorno reduz saldo.
 */
export function signedCashEffect(m: {
  type: string;
  amount: number;
  is_reversed: boolean;
  notes?: string | null;
}): number {
  if (m.is_reversed) return 0;
  const amt = Number(m.amount) || 0;
  if (m.type === 'INCOME' || m.type === 'TRANSFER_IN') return amt;
  if (m.type === 'EXPENSE' || m.type === 'TRANSFER_OUT') return -amt;
  if (m.type === 'REVERSAL') {
    const n = String(m.notes || '');
    if (n.includes('[REV:INCOME]')) return -amt;
    if (n.includes('[REV:EXPENSE]')) return amt;
    if (n.includes('[REV:TRANSFER_IN]')) return -amt;
    if (n.includes('[REV:TRANSFER_OUT]')) return amt;
    return 0;
  }
  return 0;
}

/** Contribui para receita/despesa do período (exclui transferências). */
export function pnlCashEffect(m: {
  type: string;
  amount: number;
  is_reversed: boolean;
  notes?: string | null;
}): { income: number; expense: number } {
  if (m.is_reversed) return { income: 0, expense: 0 };
  const amt = Number(m.amount) || 0;
  if (m.type === 'INCOME') return { income: amt, expense: 0 };
  if (m.type === 'EXPENSE') return { income: 0, expense: amt };
  if (m.type === 'REVERSAL') {
    const n = String(m.notes || '');
    if (n.includes('[REV:INCOME]')) return { income: -amt, expense: 0 };
    if (n.includes('[REV:EXPENSE]')) return { income: 0, expense: -amt };
  }
  return { income: 0, expense: 0 };
}

export async function nextCashMovementCode(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('generate_next_corporate_cash_movement_code');
  if (error) throw new Error(error.message);
  return String(data);
}

export async function findMovementByIdempotency(
  supabase: SupabaseClient,
  key: string,
): Promise<MasterCorporateCashMovement | null> {
  const { data, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('*')
    .eq('idempotency_key', key)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function insertCashMovement(
  supabase: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<MasterCorporateCashMovement> {
  const code =
    payload.code != null
      ? String(payload.code)
      : await nextCashMovementCode(supabase);

  const { data, error } = await supabase
    .from('master_corporate_cash_movements')
    .insert({ ...payload, code })
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505' && payload.idempotency_key) {
      const existing = await findMovementByIdempotency(
        supabase,
        String(payload.idempotency_key),
      );
      if (existing) return existing;
    }
    throw new Error(error.message);
  }
  return mapRow(data as Record<string, unknown>);
}

export async function listCashMovementsRaw(
  supabase: SupabaseClient,
  opts: {
    accountId?: string;
    fromDate?: string;
    toDate?: string;
    includeReversed?: boolean;
  } = {},
): Promise<MasterCorporateCashMovement[]> {
  let q = supabase
    .from('master_corporate_cash_movements')
    .select('*')
    .order('movement_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (opts.accountId) q = q.eq('financial_account_id', opts.accountId);
  if (opts.fromDate) q = q.gte('movement_date', opts.fromDate);
  if (opts.toDate) q = q.lte('movement_date', opts.toDate);
  if (!opts.includeReversed) q = q.eq('is_reversed', false);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function computeAccountBalance(
  supabase: SupabaseClient,
  accountId: string,
  asOfDate?: string,
): Promise<MasterCorporateAccountBalance> {
  const { data: account, error: aErr } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id, opening_balance, opening_balance_date')
    .eq('id', accountId)
    .maybeSingle();
  if (aErr) throw new Error(aErr.message);
  if (!account) throw new Error('Conta financeira não encontrada.');

  const openingBalance = roundMoney(Number(account.opening_balance || 0));
  const openingDate = account.opening_balance_date
    ? String(account.opening_balance_date).slice(0, 10)
    : null;

  const movements = await listCashMovementsRaw(supabase, {
    accountId,
    toDate: asOfDate,
    includeReversed: true,
  });

  let income = 0;
  let expense = 0;
  let transferIn = 0;
  let transferOut = 0;
  let lastMovementAt: string | null = null;

  for (const m of movements) {
    if (m.is_reversed) continue;
    lastMovementAt = m.created_at;
    if (m.type === 'INCOME') income = roundMoney(income + m.amount);
    else if (m.type === 'EXPENSE') expense = roundMoney(expense + m.amount);
    else if (m.type === 'TRANSFER_IN') transferIn = roundMoney(transferIn + m.amount);
    else if (m.type === 'TRANSFER_OUT') transferOut = roundMoney(transferOut + m.amount);
    else if (m.type === 'REVERSAL') {
      const n = String(m.notes || '');
      if (n.includes('[REV:INCOME]')) income = roundMoney(income - m.amount);
      else if (n.includes('[REV:EXPENSE]')) expense = roundMoney(expense - m.amount);
      else if (n.includes('[REV:TRANSFER_IN]')) {
        transferIn = roundMoney(transferIn - m.amount);
      } else if (n.includes('[REV:TRANSFER_OUT]')) {
        transferOut = roundMoney(transferOut - m.amount);
      }
    }
  }

  let openingContribution = 0;
  if (openingDate) {
    if (!asOfDate || openingDate <= asOfDate) {
      openingContribution = openingBalance;
    }
  } else {
    openingContribution = openingBalance;
  }

  // Saldo inicial só entra a partir da data de referência (se asOf < openingDate, 0)
  if (openingDate && asOfDate && asOfDate < openingDate) {
    openingContribution = 0;
  }

  // Movimentos antes da opening_balance_date ainda contam; o saldo inicial aplica-se a partir dela.
  // Spec: "O saldo inicial só entra a partir de opening_balance_date"
  let movementEffect = 0;
  for (const m of movements) {
    if (openingDate && m.movement_date < openingDate) {
      // movimentos anteriores à data do saldo inicial não entram (saldo inicial já os “substitui”)
      continue;
    }
    movementEffect = roundMoney(movementEffect + signedCashEffect(m));
  }

  const currentBalance = roundMoney(openingContribution + movementEffect);

  return {
    accountId,
    openingBalance,
    openingBalanceDate: openingDate,
    income,
    expense,
    transferIn,
    transferOut,
    currentBalance,
    lastMovementAt,
  };
}

export async function computeAllAccountsCurrentBalance(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase
    .from('master_corporate_financial_accounts')
    .select('id')
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  let total = 0;
  for (const a of data || []) {
    const bal = await computeAccountBalance(supabase, String(a.id));
    total = roundMoney(total + bal.currentBalance);
  }
  return total;
}

export async function aggregateCorporateCashMonthlyRevenueExpense(
  supabase: SupabaseClient,
  year: number,
): Promise<CorporateMonthlyRevenueExpense> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const movements = await listCashMovementsRaw(supabase, {
    fromDate: from,
    toDate: to,
    includeReversed: true,
  });

  const months = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    net: 0,
  }));

  for (const m of movements) {
    const y = Number(m.movement_date.slice(0, 4));
    if (y !== year) continue;
    const month = Number(m.movement_date.slice(5, 7));
    const pnl = pnlCashEffect(m);
    const bucket = months[month - 1];
    if (!bucket) continue;
    bucket.income = roundMoney(bucket.income + pnl.income);
    bucket.expense = roundMoney(bucket.expense + pnl.expense);
  }

  for (const b of months) {
    b.net = roundMoney(b.income - b.expense);
  }

  const totals = months.reduce(
    (acc, m) => ({
      income: roundMoney(acc.income + m.income),
      expense: roundMoney(acc.expense + m.expense),
      net: 0,
    }),
    { income: 0, expense: 0, net: 0 },
  );
  totals.net = roundMoney(totals.income - totals.expense);

  return { year, months, totals };
}

export { mapRow as mapCashMovementRow };
