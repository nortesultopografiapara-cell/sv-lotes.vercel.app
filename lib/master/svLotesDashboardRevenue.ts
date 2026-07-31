/**
 * Receita consolidada SV LOTES (Dashboard Executivo).
 *
 * Fontes de leitura (sem cópia física AR → saas_cash_movements):
 *   A) saas_cash_movements — income válido (mensalidades, extraordinárias, etc.); transfer fora
 *   B) master_corporate_cash_movements — RECEIVABLE_PAYMENT em contas business_unit=SV_LOTES
 *
 * Anti-duplicidade: se o mesmo evento já está no Caixa SaaS (asaas_payment_id / referência /
 * external_reference), a liquidação corporativa NÃO é somada de novo.
 *
 * Data efetiva da liquidação AR: payment_date → movement_date do caixa corporativo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aggregateSaasCashMonthlyRevenueExpense,
  buildEmptyMonthlyRevenueExpense,
  sumSaasCashReceivedIncome,
  type MonthlyRevenueExpense,
  type SaasCashReceivedIncomeSummary,
} from '@/lib/saasCashMovements';
import { listCorporateAccountIdsForUnit } from '@/lib/master/corporateFinance/businessUnitScope';

export const SV_LOTES_RECEIVED_REVENUE_SOURCE =
  'saas_cash_movements+corporate_receivable_payment_sv_lotes' as const;

export type SaasIncomeDedupRow = {
  amount?: number;
  movement_date?: string | null;
  created_at?: string | null;
  asaas_payment_id?: string | null;
  saas_charge_id?: string | null;
  metadata?: Record<string, unknown> | null;
  type?: string | null;
};

export type CorporateReceivableIncomeRow = {
  amount: number | string;
  movement_date: string;
  type: string;
  origin: string;
  reference?: string | null;
  idempotency_key?: string | null;
  receivable_payment_id?: string | null;
  is_reversed?: boolean;
  notes?: string | null;
};

/** Chaves determinísticas do Caixa SaaS usadas para deduplicar AR SV_LOTES. */
export function collectSaasDedupKeys(rows: SaasIncomeDedupRow[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const asaas = String(row.asaas_payment_id || '').trim();
    if (asaas) {
      keys.add(`asaas:${asaas}`);
      keys.add(`ref:${asaas}`);
    }
    const charge = String(row.saas_charge_id || '').trim();
    if (charge) keys.add(`charge:${charge}`);

    const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const ext = String(
      meta.external_reference || meta.asaas_payment_id || meta.asaasPaymentId || '',
    ).trim();
    if (ext) {
      keys.add(`ref:${ext}`);
      keys.add(`asaas:${ext}`);
    }
    const asaasMov = String(meta.asaas_movement_id || meta.asaasMovementId || '').trim();
    if (asaasMov) keys.add(`asaas_mov:${asaasMov}`);
  }
  return keys;
}

/** Chaves candidatas de um movimento corporativo RECEIVABLE_PAYMENT. */
export function corporateReceivableDedupKeys(row: CorporateReceivableIncomeRow): string[] {
  const out: string[] = [];
  const ref = String(row.reference || '').trim();
  if (ref) {
    out.push(`asaas:${ref}`);
    out.push(`ref:${ref}`);
  }
  const idem = String(row.idempotency_key || '').trim();
  if (idem.startsWith('ASAAS_PAY:')) {
    const id = idem.slice('ASAAS_PAY:'.length).trim();
    if (id) {
      out.push(`asaas:${id}`);
      out.push(`ref:${id}`);
    }
  }
  if (idem.startsWith('RECEIVABLE_PAYMENT:')) {
    // chave só do ledger corporativo — não cruza com SaaS
  }
  const payId = String(row.receivable_payment_id || '').trim();
  if (payId) out.push(`recv_pay:${payId}`);
  return out;
}

export function isCorporateReceivableAlreadyInSaas(
  row: CorporateReceivableIncomeRow,
  saasKeys: Set<string>,
): boolean {
  for (const key of corporateReceivableDedupKeys(row)) {
    if (key.startsWith('recv_pay:')) continue;
    if (saasKeys.has(key)) return true;
  }
  return false;
}

export function isEligibleSvLotesCorporateReceivableIncome(
  row: CorporateReceivableIncomeRow,
): boolean {
  if (row.is_reversed) return false;
  if (String(row.type).toUpperCase() !== 'INCOME') return false;
  if (String(row.origin).toUpperCase() !== 'RECEIVABLE_PAYMENT') return false;
  const amount = Number(row.amount);
  return Number.isFinite(amount) && amount > 0;
}

export type ConsolidatedIncomeResult = {
  total: number;
  saasPart: number;
  corporatePart: number;
  skippedDuplicate: number;
  skippedIneligible: number;
};

/**
 * Consolida income SaaS + RECEIVABLE_PAYMENT SV_LOTES sem duplicar.
 * `saasPart` já deve estar filtrado (marco / período); `saasRowsForDedup` alimenta as chaves.
 */
export function consolidateSvLotesReceivedIncome(params: {
  saasPart: number;
  saasRowsForDedup: SaasIncomeDedupRow[];
  corporateRows: CorporateReceivableIncomeRow[];
}): ConsolidatedIncomeResult {
  const saasKeys = collectSaasDedupKeys(params.saasRowsForDedup);
  let corporatePart = 0;
  let skippedDuplicate = 0;
  let skippedIneligible = 0;

  for (const row of params.corporateRows) {
    if (!isEligibleSvLotesCorporateReceivableIncome(row)) {
      skippedIneligible += 1;
      continue;
    }
    if (isCorporateReceivableAlreadyInSaas(row, saasKeys)) {
      skippedDuplicate += 1;
      continue;
    }
    corporatePart += Number(row.amount);
  }

  const saasPart = Number(params.saasPart) || 0;
  return {
    total: saasPart + corporatePart,
    saasPart,
    corporatePart,
    skippedDuplicate,
    skippedIneligible,
  };
}

async function listSvLotesReceivablePaymentMovements(
  supabase: SupabaseClient,
  opts: { fromDate?: string; toDate?: string },
): Promise<CorporateReceivableIncomeRow[]> {
  const accountIds = await listCorporateAccountIdsForUnit(supabase, 'SV_LOTES');
  if (!accountIds || accountIds.length === 0) return [];

  let query = supabase
    .from('master_corporate_cash_movements')
    .select(
      'amount, movement_date, type, origin, reference, idempotency_key, receivable_payment_id, is_reversed, notes',
    )
    .in('financial_account_id', accountIds)
    .eq('type', 'INCOME')
    .eq('origin', 'RECEIVABLE_PAYMENT')
    .eq('is_reversed', false);

  if (opts.fromDate) query = query.gte('movement_date', opts.fromDate);
  if (opts.toDate) query = query.lte('movement_date', opts.toDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar RECEIVABLE_PAYMENT SV_LOTES');
  return (data || []) as CorporateReceivableIncomeRow[];
}

async function listSaasIncomeRowsForDedup(
  supabase: SupabaseClient,
  opts: { fromDate?: string; toDate?: string },
): Promise<SaasIncomeDedupRow[]> {
  let query = supabase
    .from('saas_cash_movements')
    .select('amount, movement_date, created_at, asaas_payment_id, saas_charge_id, metadata, type')
    .eq('type', 'income');
  if (opts.fromDate) query = query.gte('movement_date', opts.fromDate);
  if (opts.toDate) query = query.lte('movement_date', opts.toDate);
  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Falha ao listar income SaaS para dedup');
  return (data || []) as SaasIncomeDedupRow[];
}

/** Card Receita Recebida — mês (ou intervalo) consolidado SV LOTES. */
export async function sumSvLotesConsolidatedReceivedIncome(
  supabase: SupabaseClient,
  cashStartAt: string | null,
  options: { fromDate?: string; toDate?: string } = {},
): Promise<
  SaasCashReceivedIncomeSummary & {
    corporatePart: number;
    skippedDuplicate: number;
    source: typeof SV_LOTES_RECEIVED_REVENUE_SOURCE;
  }
> {
  const saas = await sumSaasCashReceivedIncome(supabase, cashStartAt, options);
  const [saasRowsForDedup, corporateRows] = await Promise.all([
    listSaasIncomeRowsForDedup(supabase, options),
    listSvLotesReceivablePaymentMovements(supabase, options),
  ]);

  const consolidated = consolidateSvLotesReceivedIncome({
    saasPart: saas.visibleTotal,
    saasRowsForDedup,
    corporateRows,
  });

  return {
    visibleTotal: consolidated.total,
    hiddenTotal: saas.hiddenTotal,
    hiddenCount: saas.hiddenCount,
    corporatePart: consolidated.corporatePart,
    skippedDuplicate: consolidated.skippedDuplicate,
    source: SV_LOTES_RECEIVED_REVENUE_SOURCE,
  };
}

/**
 * Gráfico anual SV LOTES: mesma consolidação econômica do card.
 * Despesas permanecem só do Caixa SaaS (transfer fora).
 */
export async function aggregateSvLotesMonthlyRevenueExpense(
  supabase: SupabaseClient,
  year: number,
  cashStartAt?: string | null,
): Promise<MonthlyRevenueExpense[]> {
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const base = await aggregateSaasCashMonthlyRevenueExpense(supabase, year, cashStartAt);
  const months = base.map((m) => ({ ...m }));

  // Dedup contra todos os incomes SaaS do ano (visíveis ou não — evita duplicar se marco ocultar).
  const saasRowsForDedup = await listSaasIncomeRowsForDedup(supabase, { fromDate, toDate });
  // Também incluir linhas listadas via listSaasCashMovements (marco) não é necessário para chaves.
  const saasKeys = collectSaasDedupKeys(saasRowsForDedup);

  const corporateRows = await listSvLotesReceivablePaymentMovements(supabase, {
    fromDate,
    toDate,
  });

  for (const row of corporateRows) {
    if (!isEligibleSvLotesCorporateReceivableIncome(row)) continue;
    if (isCorporateReceivableAlreadyInSaas(row, saasKeys)) continue;

    const day = String(row.movement_date || '').split('T')[0] || '';
    if (!day.startsWith(String(year))) continue;
    const monthNum = Number(day.slice(5, 7));
    if (!Number.isInteger(monthNum) || monthNum < 1 || monthNum > 12) continue;
    const bucket = months[monthNum - 1];
    if (!bucket) continue;
    bucket.revenue += Number(row.amount) || 0;
  }

  return months;
}

/** Helper de teste / documentação do caso REC-2026-0005. */
export function expectedJulyReceivedFromFixture(params: {
  saasJulyIncome: number;
  arSvLotesSettled: number;
  alreadyInSaas: boolean;
}): number {
  if (params.alreadyInSaas) return params.saasJulyIncome;
  return params.saasJulyIncome + params.arSvLotesSettled;
}

export { buildEmptyMonthlyRevenueExpense };
