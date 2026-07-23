/**
 * Bridge definitiva valor_recebido (Fase 6.4).
 * Nunca soma legado + corporativo. Não migra nem apaga a coluna.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { roundMoney } from './arApMath';
import { pnlCashEffect } from './cashMath';
import { sumProjectProvisioned, computeUnprovisionedBalance } from './projectContextService';

export type ProjectReceivedSource = 'LEGACY' | 'CORPORATE_FINANCE';

export type ProjectReceivedBridge = {
  amount: number;
  source: ProjectReceivedSource;
  legacy_valor_recebido: number;
  corporate_income_total: number;
  corporate_movement_count: number;
};

export type ProjectCorporateFinancialSummary = {
  project_id: string;
  contract_value: number;
  received: number;
  received_source: ProjectReceivedSource;
  legacy_valor_recebido: number;
  open_receivable: number;
  open_payable: number;
  provisioned: number;
  provisioned_remaining: number;
  unprovisioned: number;
  expenses: number;
  result: number;
  margin_percent: number;
  financial_percent: number;
  last_receipt_at: string | null;
  last_payment_at: string | null;
  predicted_balance: number;
  realized_balance: number;
  receivables_count: number;
  payables_count: number;
};

const INCOME_ORIGINS = new Set([
  'RECEIVABLE_PAYMENT',
  'BACKFILL_RECEIVABLE',
  'LEGACY_PROJECT_RECEIVED',
]);

const EXPENSE_ORIGINS = new Set([
  'PAYABLE_PAYMENT',
  'BACKFILL_PAYABLE',
  'MANUAL_EXPENSE',
]);

async function loadProjectCashRows(
  supabase: SupabaseClient,
  projectId: string,
): Promise<
  Array<{
    type: string;
    amount: number;
    origin: string;
    is_reversed: boolean;
    notes: string | null;
    movement_date: string;
    created_at: string;
  }>
> {
  const { data, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('type, amount, origin, is_reversed, notes, movement_date, created_at')
    .eq('project_id', projectId)
    .order('movement_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((r) => ({
    type: String(r.type),
    amount: Number(r.amount || 0),
    origin: String(r.origin),
    is_reversed: Boolean(r.is_reversed),
    notes: r.notes ? String(r.notes) : null,
    movement_date: String(r.movement_date).slice(0, 10),
    created_at: String(r.created_at),
  }));
}

/**
 * Recebido efetivo do projeto.
 * Se houver qualquer entrada corporativa de recebimento (não estornada),
 * usa Σ entradas; caso contrário, usa valor_recebido legado.
 */
export async function resolveProjectReceivedBridge(
  supabase: SupabaseClient,
  projectId: string,
  legacyValorRecebido: number,
): Promise<ProjectReceivedBridge> {
  const rows = await loadProjectCashRows(supabase, projectId);
  let corporateIncome = 0;
  let count = 0;

  for (const m of rows) {
    if (m.is_reversed) continue;
    const isReceivableIncome =
      (m.type === 'INCOME' && INCOME_ORIGINS.has(m.origin)) ||
      (m.type === 'REVERSAL' &&
        String(m.notes || '').includes('[REV:INCOME]') &&
        // reversal of receivable income reduces corporate total via pnl
        true);
    if (m.type === 'INCOME' && INCOME_ORIGINS.has(m.origin)) {
      corporateIncome = roundMoney(corporateIncome + m.amount);
      count += 1;
    } else if (m.type === 'REVERSAL' && String(m.notes || '').includes('[REV:INCOME]')) {
      // Only count reversal if we already have corporate income movements context
      corporateIncome = roundMoney(corporateIncome - m.amount);
    }
    void isReceivableIncome;
  }

  const legacy = roundMoney(Number(legacyValorRecebido || 0));

  if (count > 0) {
    return {
      amount: Math.max(0, corporateIncome),
      source: 'CORPORATE_FINANCE',
      legacy_valor_recebido: legacy,
      corporate_income_total: Math.max(0, corporateIncome),
      corporate_movement_count: count,
    };
  }

  return {
    amount: legacy,
    source: 'LEGACY',
    legacy_valor_recebido: legacy,
    corporate_income_total: 0,
    corporate_movement_count: 0,
  };
}

export async function computeProjectCorporateFinancialSummary(
  supabase: SupabaseClient,
  params: {
    projectId: string;
    contractValue: number;
    legacyValorRecebido: number;
  },
): Promise<ProjectCorporateFinancialSummary> {
  const contract = roundMoney(Number(params.contractValue || 0));
  const bridge = await resolveProjectReceivedBridge(
    supabase,
    params.projectId,
    params.legacyValorRecebido,
  );

  const [provision, payableAgg, cashRows] = await Promise.all([
    sumProjectProvisioned(supabase, params.projectId),
    (async () => {
      const { data, error } = await supabase
        .from('master_corporate_payables')
        .select('id, remaining_amount, status, is_archived, canceled_at')
        .eq('project_id', params.projectId)
        .eq('is_archived', false)
        .is('canceled_at', null)
        .neq('status', 'CANCELED')
        .neq('status', 'ARCHIVED');
      if (error) throw new Error(error.message);
      let open = 0;
      for (const r of data || []) {
        open = roundMoney(open + Number(r.remaining_amount || 0));
      }
      return { open, count: (data || []).length };
    })(),
    loadProjectCashRows(supabase, params.projectId),
  ]);

  let expenses = 0;
  let lastReceipt: string | null = null;
  let lastPayment: string | null = null;

  for (const m of cashRows) {
    const pnl = pnlCashEffect(m);
    if (m.type === 'EXPENSE' && EXPENSE_ORIGINS.has(m.origin) && !m.is_reversed) {
      expenses = roundMoney(expenses + m.amount);
    } else if (m.type === 'REVERSAL' && !m.is_reversed && pnl.expense < 0) {
      expenses = roundMoney(expenses + pnl.expense);
    }

    if (!m.is_reversed && m.type === 'INCOME' && INCOME_ORIGINS.has(m.origin)) {
      if (!lastReceipt || m.movement_date > lastReceipt) lastReceipt = m.movement_date;
    }
    if (!m.is_reversed && m.type === 'EXPENSE' && EXPENSE_ORIGINS.has(m.origin)) {
      if (!lastPayment || m.movement_date > lastPayment) lastPayment = m.movement_date;
    }
  }

  const received = bridge.amount;
  const result = roundMoney(received - expenses);
  const financialPercent =
    contract <= 0 ? 0 : roundMoney((received / contract) * 100);
  const marginPercent = received <= 0 ? 0 : roundMoney((result / received) * 100);
  const realizedBalance = roundMoney(contract - received);
  const unprovisioned = computeUnprovisionedBalance({
    contractValue: contract,
    valorRecebido: received,
    provisionedTotal: provision.provisionedTotal,
  });
  // Saldo previsto: o que ainda se espera receber se títulos abertos forem liquidados
  const predictedBalance = roundMoney(realizedBalance);

  return {
    project_id: params.projectId,
    contract_value: contract,
    received,
    received_source: bridge.source,
    legacy_valor_recebido: bridge.legacy_valor_recebido,
    open_receivable: provision.provisionedRemaining,
    open_payable: payableAgg.open,
    provisioned: provision.provisionedTotal,
    provisioned_remaining: provision.provisionedRemaining,
    unprovisioned,
    expenses: Math.max(0, expenses),
    result,
    margin_percent: marginPercent,
    financial_percent: financialPercent,
    last_receipt_at: lastReceipt,
    last_payment_at: lastPayment,
    predicted_balance: predictedBalance,
    realized_balance: realizedBalance,
    receivables_count: provision.count,
    payables_count: payableAgg.count,
  };
}

/** Batch: mapa projectId → received bridge (para listagens). */
export async function batchResolveProjectReceived(
  supabase: SupabaseClient,
  projects: Array<{ id: string; valor_recebido: number }>,
): Promise<Map<string, ProjectReceivedBridge>> {
  const map = new Map<string, ProjectReceivedBridge>();
  if (projects.length === 0) return map;

  const ids = projects.map((p) => p.id);
  const { data, error } = await supabase
    .from('master_corporate_cash_movements')
    .select('project_id, type, amount, origin, is_reversed, notes')
    .in('project_id', ids)
    .eq('is_reversed', false);
  if (error) throw new Error(error.message);

  const incomeByProject = new Map<string, { total: number; count: number }>();
  for (const row of data || []) {
    const pid = row.project_id ? String(row.project_id) : '';
    if (!pid) continue;
    const type = String(row.type);
    const origin = String(row.origin);
    const amount = Number(row.amount || 0);
    const notes = row.notes ? String(row.notes) : '';
    const cur = incomeByProject.get(pid) || { total: 0, count: 0 };
    if (type === 'INCOME' && INCOME_ORIGINS.has(origin)) {
      cur.total = roundMoney(cur.total + amount);
      cur.count += 1;
    } else if (type === 'REVERSAL' && notes.includes('[REV:INCOME]')) {
      cur.total = roundMoney(cur.total - amount);
    }
    incomeByProject.set(pid, cur);
  }

  for (const p of projects) {
    const legacy = roundMoney(Number(p.valor_recebido || 0));
    const corp = incomeByProject.get(p.id);
    if (corp && corp.count > 0) {
      map.set(p.id, {
        amount: Math.max(0, corp.total),
        source: 'CORPORATE_FINANCE',
        legacy_valor_recebido: legacy,
        corporate_income_total: Math.max(0, corp.total),
        corporate_movement_count: corp.count,
      });
    } else {
      map.set(p.id, {
        amount: legacy,
        source: 'LEGACY',
        legacy_valor_recebido: legacy,
        corporate_income_total: 0,
        corporate_movement_count: 0,
      });
    }
  }
  return map;
}
