/**
 * Leituras do Financeiro SaaS Master via Supabase browser (mesmo padrão do Dashboard).
 * Evita timeouts das APIs server-side em GETs de listagem.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MasterSaasInvoice } from '@/lib/saasBilling';
import { mapMasterSaasInvoiceRow } from '@/lib/saasBilling';
import type { MasterSaasPayment } from '@/lib/masterSaasPayments';
import { mapSaasChargeRow, type SaasCharge } from '@/lib/saasCharges';
import {
  computeSaasCashHiddenByMarcoInPeriod,
  computeSaasCashSummaryFromRows,
  listSaasCashMovements,
  type ListSaasCashMovementsOptions,
  type SaasCashHiddenByMarcoSummary,
  type SaasCashMovement,
  type SaasCashSummary,
} from '@/lib/saasCashMovements';
import { getSaasCashStartAt } from '@/lib/saasFinanceSettings';

export type MasterSaasFinanceClientLoadResult = {
  payments: MasterSaasPayment[];
  invoices: MasterSaasInvoice[];
  charges: SaasCharge[];
  cashStartAt: string | null;
  errors: string[];
};

type CompanyMeta = { name: string; plan: string };

async function loadCompanyMetaMap(
  supabase: SupabaseClient,
  companyIds: string[],
): Promise<Record<string, CompanyMeta>> {
  if (!companyIds.length) return {};
  const { data } = await supabase
    .from('companies')
    .select('id, name, plan, plan_type')
    .in('id', companyIds);
  return Object.fromEntries(
    (data || []).map((c) => [
      c.id,
      { name: c.name || '—', plan: String(c.plan || c.plan_type || '—') },
    ]),
  );
}

export async function loadMasterSaasFinanceData(
  supabase: SupabaseClient,
): Promise<MasterSaasFinanceClientLoadResult> {
  const errors: string[] = [];

  const [paymentsRes, invoicesRes, chargesRes, cashStartAt] = await Promise.all([
    supabase
      .from('master_saas_payments')
      .select('*')
      .order('paid_at', { ascending: false })
      .limit(500),
    supabase
      .from('master_saas_invoices')
      .select('*')
      .order('due_date', { ascending: false })
      .limit(500),
    supabase
      .from('saas_charges')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(200),
    getSaasCashStartAt(supabase),
  ]);

  if (paymentsRes.error) errors.push(`Pagamentos: ${paymentsRes.error.message}`);
  if (invoicesRes.error) errors.push(`Faturas: ${invoicesRes.error.message}`);
  if (chargesRes.error) errors.push(`Cobranças: ${chargesRes.error.message}`);

  const paymentsRaw = paymentsRes.data || [];
  const invoicesRaw = invoicesRes.data || [];
  const chargesRaw = chargesRes.data || [];

  const companyIds = [
    ...new Set([
      ...paymentsRaw.map((p) => p.company_id),
      ...invoicesRaw.map((i) => i.company_id),
      ...chargesRaw.map((c) => c.company_id),
    ]),
  ].filter(Boolean) as string[];

  const companyMap = await loadCompanyMetaMap(supabase, companyIds);

  const payments: MasterSaasPayment[] = paymentsRaw.map((p) => ({
    ...(p as MasterSaasPayment),
    amount: Number(p.amount || 0),
    company_name: companyMap[p.company_id]?.name || '—',
  }));

  const invoices: MasterSaasInvoice[] = invoicesRaw.map((row) => {
    const inv = mapMasterSaasInvoiceRow(row as Record<string, unknown>);
    return {
      ...inv,
      company_name: companyMap[inv.company_id]?.name || '—',
      plan_label: companyMap[inv.company_id]?.plan || '—',
    };
  });

  const charges: SaasCharge[] = chargesRaw.map((row) => {
    const ch = mapSaasChargeRow(row as Record<string, unknown>);
    return {
      ...ch,
      company_name: companyMap[ch.company_id]?.name || '—',
      plan_label: companyMap[ch.company_id]?.plan || '—',
    };
  });

  return { payments, invoices, charges, cashStartAt, errors };
}

export async function loadSaasCashPanelView(
  supabase: SupabaseClient,
  options: Pick<ListSaasCashMovementsOptions, 'companyId' | 'fromDate' | 'toDate' | 'type'>,
): Promise<{
  movements: SaasCashMovement[];
  summary: SaasCashSummary;
  cashStartAt: string | null;
  hiddenByMarco: SaasCashHiddenByMarcoSummary;
  error: string | null;
}> {
  try {
    const cashStartAt = await getSaasCashStartAt(supabase);
    const queryOptions: ListSaasCashMovementsOptions = {
      ...options,
      cashStartAt,
      type: options.type || 'all',
    };
    const movements = await listSaasCashMovements(supabase, queryOptions);
    const summary = computeSaasCashSummaryFromRows(movements);
    const hiddenByMarco = await computeSaasCashHiddenByMarcoInPeriod(
      supabase,
      queryOptions,
    );
    return { movements, summary, cashStartAt, hiddenByMarco, error: null };
  } catch (err) {
    return {
      movements: [],
      summary: {
        periodIncome: 0,
        periodExpense: 0,
        netResult: 0,
        movementCount: 0,
      },
      cashStartAt: null,
      hiddenByMarco: { hiddenCount: 0, hiddenIncome: 0, hiddenExpense: 0, hiddenNet: 0, latestHiddenAt: null },
      error: err instanceof Error ? err.message : 'Falha ao carregar caixa SaaS',
    };
  }
}
