import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateMrrFromCompanies, getCompanyMonthlyPrice, isBillableCompany } from '@/lib/companyPricing';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import { buildCompanyUserCounts } from '@/lib/masterCompanyUsers';
import { buildPaidReferenceMonthsByCompany } from '@/lib/masterSaasPayments';
import type { MasterSaasPayment } from '@/lib/masterSaasPayments';
import type { CompanySubscription } from '@/lib/saasSubscription';
import { getCompanySaasPlan, type CompanySaasSource } from '@/lib/saasPlans';
import { computeSaasBillingMetrics } from '@/lib/saasBilling';
import {
  applySaasFinanceStartAtFilter,
  formatSaasCashStartAtLabel,
  getSaasCashStartAt,
  isSaasFinancialRecordAfterStartAt,
} from '@/lib/saasFinanceSettings';
import { sumSaasCashReceivedIncome } from '@/lib/saasCashMovements';

export type MasterPlanTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export type MasterDashboardAlert = {
  id: string;
  severity: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
};

export type MasterRecentCompany = {
  id: string;
  name: string;
  slug: string | null;
  planLabel: MasterPlanTier;
  status: string;
  projectsUsed: number;
  projectsLimit: number;
  usersUsed: number;
  usersLimit: number;
  brokersUsed: number;
  brokersLimit: number;
  mrr: number;
  financialSituation: string;
};

export type MasterDashboardData = {
  stats: {
    totalCompanies: number;
    activeCompanies: number;
    suspendedCompanies: number;
    inactiveCompanies: number;
    activeSubscriptions: number;
    mrr: number;
    receivedRevenue: number;
    receivedRevenueHiddenCount: number;
    receivedRevenueHiddenTotal: number;
    revenueToReceive: number;
    delinquencyAmount: number;
    totalUsers: number;
    totalBrokers: number;
    totalProjects: number;
    totalContracts: number;
    totalLots: number;
  };
  revenueByMonth: { month: string; label: string; value: number }[];
  planDistribution: {
    tier: MasterPlanTier;
    count: number;
    percent: number;
    color: string;
  }[];
  alerts: MasterDashboardAlert[];
  recentCompanies: MasterRecentCompany[];
  cashStartAt: string | null;
  receivedRevenueSource: 'saas_cash_movements';
  errors: string[];
};

const PLAN_TIER_COLORS: Record<MasterPlanTier, string> = {
  STARTER: '#22c55e',
  PROFESSIONAL: '#a855f7',
  ENTERPRISE: '#3b82f6',
};

export function mapPlanToMasterTier(company: CompanySaasSource): MasterPlanTier {
  const key = getCompanySaasPlan(company).planKey;
  if (key === 'profissional') return 'PROFESSIONAL';
  if (key === 'business') return 'ENTERPRISE';
  return 'STARTER';
}

function companyMrr(
  company: CompanySaasSource & {
    active?: boolean | null;
    status_operacional?: string | null;
    custom_monthly_price?: number | null;
    custom_price_enabled?: boolean | null;
  },
): number {
  if (company.active === false) return 0;
  const status = (company.status_operacional || '').toLowerCase();
  if (['inativo', 'inativa', 'suspensa', 'bloqueada'].includes(status)) return 0;
  return getCompanyMonthlyPrice(company);
}

function lastSixMonthKeys(): { key: string; label: string }[] {
  const months: { key: string; label: string }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    months.push({ key, label });
  }
  return months;
}

function isPaidReceipt(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase();
  return s === 'pago' || s === 'paid';
}

function receiptMonthKey(row: { paid_at?: string | null; due_date?: string | null }): string | null {
  const raw = row.paid_at || row.due_date;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function isSubscriptionExpired(company: {
  next_payment_date?: string | null;
  due_date?: string | null;
  active?: boolean | null;
}): boolean {
  const raw = company.next_payment_date || company.due_date;
  if (!raw || company.active === false) return false;
  const due = new Date(raw);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due < today;
}

export async function loadMasterDashboardData(
  supabase: SupabaseClient,
): Promise<MasterDashboardData> {
  const errors: string[] = [];
  const monthTemplate = lastSixMonthKeys();
  const revenueMap = new Map(monthTemplate.map((m) => [m.key, 0]));
  const cashStartAt = await getSaasCashStartAt(supabase);

  const [
    companiesRes,
    usersRes,
    brokersRes,
    projectsRes,
    contractsRes,
    blocksRes,
    lotsRes,
    receiptsRes,
    projectsListRes,
    usersListRes,
    brokersListRes,
    subscriptionsRes,
    paymentsRes,
    invoicesRes,
  ] = await Promise.all([
    supabase.from('companies').select('*'),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('brokers').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('blocks').select('id', { count: 'exact', head: true }),
    supabase.from('lots').select('id', { count: 'exact', head: true }),
    supabase
      .from('finance_receipts')
      .select('amount, status, paid_at, due_date, paid_amount')
      .order('due_date', { ascending: false })
      .limit(5000),
    supabase.from('projects').select('tenant_id, company_id'),
    supabase.from('users').select('tenant_id, role'),
    supabase.from('brokers').select('tenant_id, company_id'),
    supabase.from('company_subscriptions').select('*'),
    supabase
      .from('master_saas_payments')
      .select('company_id, reference_month, paid_at, amount, status, payment_method')
      .order('paid_at', { ascending: false })
      .limit(500),
    supabase.from('master_saas_invoices').select('final_amount, amount, due_date, status, paid_at'),
  ]);

  if (companiesRes.error) errors.push(`companies: ${companiesRes.error.message}`);
  if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);
  if (brokersRes.error) errors.push(`brokers: ${brokersRes.error.message}`);
  if (projectsRes.error) errors.push(`projects: ${projectsRes.error.message}`);
  if (contractsRes.error) errors.push(`contracts: ${contractsRes.error.message}`);
  if (blocksRes.error) errors.push(`blocks: ${blocksRes.error.message}`);
  if (lotsRes.error) errors.push(`lots: ${lotsRes.error.message}`);
  if (receiptsRes.error) errors.push(`finance_receipts: ${receiptsRes.error.message}`);
  if (usersListRes.error) errors.push(`users_list: ${usersListRes.error.message}`);
  if (subscriptionsRes.error) errors.push(`subscriptions: ${subscriptionsRes.error.message}`);
  if (paymentsRes.error) errors.push(`master_saas_payments: ${paymentsRes.error.message}`);
  if (invoicesRes.error) errors.push(`master_saas_invoices: ${invoicesRes.error.message}`);

  const companies = companiesRes.data ?? [];
  const subscriptions = (subscriptionsRes.data ?? []) as CompanySubscription[];
  const subMap = new Map(subscriptions.map((s) => [s.company_id, s]));
  const payments = applySaasFinanceStartAtFilter(
    (paymentsRes.data ?? []) as MasterSaasPayment[],
    cashStartAt,
  );
  const invoices = applySaasFinanceStartAtFilter(
    invoicesRes.data ?? [],
    cashStartAt,
  );
  const paidReferenceMonths = buildPaidReferenceMonthsByCompany(payments);

  const activeCompanies = companies.filter((c) => c.active === true).length;
  const suspendedCompanies = companies.filter(
    (c) => (c.status_operacional || '').trim() === 'Suspensa',
  ).length;
  const inactiveCompanies = companies.filter((c) => c.active === false).length;

  const mrr = calculateMrrFromCompanies(companies);
  let activeSubscriptions = 0;
  companies.forEach((c) => {
    if (isBillableCompany(c)) activeSubscriptions++;
  });
  const paymentsReceivedFromCash = await sumSaasCashReceivedIncome(supabase, cashStartAt);
  const billingMetrics = computeSaasBillingMetrics(
    invoices as Parameters<typeof computeSaasBillingMetrics>[0],
    mrr,
    paymentsReceivedFromCash.visibleTotal,
  );

  let totalLots = blocksRes.count ?? 0;
  if (blocksRes.error && lotsRes.count != null) {
    totalLots = lotsRes.count;
  } else if (totalLots === 0 && (lotsRes.count ?? 0) > 0) {
    totalLots = lotsRes.count ?? 0;
  }

  if (receiptsRes.data) {
    for (const row of receiptsRes.data) {
      if (!isPaidReceipt(row.status)) continue;
      if (
        cashStartAt &&
        !isSaasFinancialRecordAfterStartAt(
          { paid_at: row.paid_at, due_date: row.due_date },
          cashStartAt,
        )
      ) {
        continue;
      }
      const key = receiptMonthKey(row);
      if (!key || !revenueMap.has(key)) continue;
      const amount = Number(row.paid_amount ?? row.amount ?? 0);
      if (!Number.isFinite(amount)) continue;
      revenueMap.set(key, (revenueMap.get(key) ?? 0) + amount);
    }
  }

  const revenueByMonth = monthTemplate.map((m) => ({
    month: m.key,
    label: m.label,
    value: revenueMap.get(m.key) ?? 0,
  }));

  const tierCounts: Record<MasterPlanTier, number> = {
    STARTER: 0,
    PROFESSIONAL: 0,
    ENTERPRISE: 0,
  };
  for (const c of companies) {
    tierCounts[mapPlanToMasterTier(c)]++;
  }

  const totalCompanies = companies.length;
  const planDistribution = (['STARTER', 'PROFESSIONAL', 'ENTERPRISE'] as MasterPlanTier[]).map(
    (tier) => ({
      tier,
      count: tierCounts[tier],
      percent: totalCompanies > 0 ? (tierCounts[tier] / totalCompanies) * 100 : 0,
      color: PLAN_TIER_COLORS[tier],
    }),
  );

  const projectCounts: Record<string, number> = {};
  for (const p of projectsListRes.data ?? []) {
    const id = p.tenant_id || p.company_id;
    if (id) projectCounts[id] = (projectCounts[id] || 0) + 1;
  }

  const userCounts = buildCompanyUserCounts(usersListRes.data ?? []);

  const brokerCounts: Record<string, number> = {};
  for (const b of brokersListRes.data ?? []) {
    const id = b.tenant_id || b.company_id;
    if (id) brokerCounts[id] = (brokerCounts[id] || 0) + 1;
  }

  const alerts: MasterDashboardAlert[] = [];

  const noEmail = companies.filter((c) => !(c.email || '').trim());
  if (noEmail.length > 0) {
    alerts.push({
      id: 'no-email',
      severity: 'warning',
      title: `${noEmail.length} empresa(s) sem e-mail`,
      description: noEmail.map((c) => c.name || c.id).slice(0, 5).join(', '),
    });
  }

  const inadimplentes = companies.filter((c) => {
    const enriched = augmentCompanyBilling(c, subMap.get(c.id) ?? null, {
      paidReferenceMonths,
      payments,
    });
    return enriched.financial_situation === 'VENCIDO';
  });
  if (inadimplentes.length > 0) {
    alerts.push({
      id: 'inadimplente',
      severity: 'danger',
      title: `${inadimplentes.length} empresa(s) inadimplente(s)`,
      description: inadimplentes.map((c) => c.name || c.id).slice(0, 5).join(', '),
    });
  }

  const semProjetos = companies.filter((c) => (projectCounts[c.id] || 0) === 0);
  if (semProjetos.length > 0) {
    alerts.push({
      id: 'no-projects',
      severity: 'info',
      title: `${semProjetos.length} empresa(s) sem projetos`,
      description: semProjetos.map((c) => c.name || c.id).slice(0, 5).join(', '),
    });
  }

  const semUsuarios = companies.filter((c) => (userCounts[c.id] || 0) === 0);
  if (semUsuarios.length > 0) {
    alerts.push({
      id: 'no-users',
      severity: 'warning',
      title: `${semUsuarios.length} empresa(s) sem usuários`,
      description: semUsuarios.map((c) => c.name || c.id).slice(0, 5).join(', '),
    });
  }

  const vencidas = companies.filter((c) => isSubscriptionExpired(c));
  if (vencidas.length > 0) {
    alerts.push({
      id: 'expired-subscription',
      severity: 'danger',
      title: `${vencidas.length} assinatura(s) vencida(s)`,
      description: vencidas.map((c) => c.name || c.id).slice(0, 5).join(', '),
    });
  }

  const sorted = [...companies].sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  const recentCompanies: MasterRecentCompany[] = sorted.slice(0, 5).map((c) => {
    const saas = getCompanySaasPlan(c);
    const enriched = augmentCompanyBilling(c, subMap.get(c.id) ?? null, {
      paidReferenceMonths,
      payments,
    });
    return {
      id: c.id,
      name: c.name || 'Sem nome',
      slug: c.slug ?? null,
      planLabel: mapPlanToMasterTier(c),
      status: enriched.company_operational_status,
      financialSituation: enriched.financial_situation,
      projectsUsed: projectCounts[c.id] || 0,
      projectsLimit: saas.maxProjects,
      usersUsed: userCounts[c.id] || 0,
      usersLimit: saas.maxBrokers,
      brokersUsed: brokerCounts[c.id] || 0,
      brokersLimit: saas.maxBrokers,
      mrr: companyMrr(c),
    };
  });

  const dashboardData: MasterDashboardData = {
    stats: {
      totalCompanies: companies.length,
      activeCompanies,
      suspendedCompanies,
      inactiveCompanies,
      activeSubscriptions,
      mrr,
      receivedRevenue: paymentsReceivedFromCash.visibleTotal,
      receivedRevenueHiddenCount: paymentsReceivedFromCash.hiddenCount,
      receivedRevenueHiddenTotal: paymentsReceivedFromCash.hiddenTotal,
      revenueToReceive: billingMetrics.revenueToReceive,
      delinquencyAmount: billingMetrics.delinquencyAmount,
      totalUsers: usersRes.count ?? 0,
      totalBrokers: brokersRes.count ?? 0,
      totalProjects: projectsRes.count ?? 0,
      totalContracts: contractsRes.count ?? 0,
      totalLots,
    },
    revenueByMonth,
    planDistribution,
    alerts,
    recentCompanies,
    cashStartAt,
    receivedRevenueSource: 'saas_cash_movements',
    errors,
  };

  return dashboardData;
}

export function exportMasterDashboardCsv(data: MasterDashboardData): string {
  const lines = [
    'Métrica,Valor',
    `Total de Empresas,${data.stats.totalCompanies}`,
    `Empresas Ativas,${data.stats.activeCompanies}`,
    `Empresas Suspensas,${data.stats.suspendedCompanies}`,
    `Empresas Inativas,${data.stats.inactiveCompanies}`,
    `MRR,${data.stats.mrr.toFixed(2)}`,
    `Usuários,${data.stats.totalUsers}`,
    `Corretores,${data.stats.totalBrokers}`,
    `Projetos,${data.stats.totalProjects}`,
    `Contratos,${data.stats.totalContracts}`,
    `Lotes,${data.stats.totalLots}`,
    '',
    'Receita por mês,Valor',
    ...data.revenueByMonth.map((r) => `${r.label},${r.value.toFixed(2)}`),
    '',
    'Plano,Quantidade,Percentual',
    ...data.planDistribution.map((p) => `${p.tier},${p.count},${p.percent.toFixed(1)}%`),
  ];
  return lines.join('\n');
}
