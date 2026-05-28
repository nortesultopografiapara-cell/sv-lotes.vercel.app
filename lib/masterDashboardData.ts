import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateMrrFromCompanies, getCompanyMonthlyPrice } from '@/lib/companyPricing';
import { getCompanySaasPlan, type CompanySaasSource } from '@/lib/saasPlans';

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
};

export type MasterDashboardData = {
  stats: {
    totalCompanies: number;
    activeCompanies: number;
    suspendedCompanies: number;
    inactiveCompanies: number;
    mrr: number;
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
  vencimento_plano?: string | null;
  due_date?: string | null;
  active?: boolean | null;
}): boolean {
  const raw = company.vencimento_plano || company.due_date;
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

  const [
    companiesRes,
    usersRes,
    brokersRes,
    projectsRes,
    contractsRes,
    lotsRes,
    blocksRes,
    receiptsRes,
    projectsListRes,
    usersListRes,
    brokersListRes,
  ] = await Promise.all([
    supabase.from('companies').select('*'),
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase.from('brokers').select('*', { count: 'exact', head: true }),
    supabase.from('projects').select('*', { count: 'exact', head: true }),
    supabase.from('contracts').select('*', { count: 'exact', head: true }),
    supabase.from('lots').select('*', { count: 'exact', head: true }),
    supabase.from('blocks').select('*', { count: 'exact', head: true }),
    supabase
      .from('finance_receipts')
      .select('amount, status, paid_at, due_date, paid_amount')
      .order('due_date', { ascending: false })
      .limit(5000),
    supabase.from('projects').select('tenant_id, company_id'),
    supabase.from('users').select('tenant_id, company_id'),
    supabase.from('brokers').select('tenant_id, company_id'),
  ]);

  if (companiesRes.error) errors.push(`companies: ${companiesRes.error.message}`);
  if (usersRes.error) errors.push(`users: ${usersRes.error.message}`);
  if (brokersRes.error) errors.push(`brokers: ${brokersRes.error.message}`);
  if (projectsRes.error) errors.push(`projects: ${projectsRes.error.message}`);
  if (contractsRes.error) errors.push(`contracts: ${contractsRes.error.message}`);
  if (receiptsRes.error) errors.push(`finance_receipts: ${receiptsRes.error.message}`);

  const companies = companiesRes.data ?? [];

  const activeCompanies = companies.filter((c) => c.active === true).length;
  const suspendedCompanies = companies.filter(
    (c) => (c.status_operacional || '').trim() === 'Suspensa',
  ).length;
  const inactiveCompanies = companies.filter((c) => c.active === false).length;

  const mrr = calculateMrrFromCompanies(companies);

  let totalLots = lotsRes.count ?? 0;
  if (lotsRes.error && blocksRes.count != null) {
    totalLots = blocksRes.count;
    errors.push(`lots: ${lotsRes.error.message} (usando contagem de blocks)`);
  } else if (lotsRes.error) {
    errors.push(`lots: ${lotsRes.error.message}`);
  }

  if (receiptsRes.data) {
    for (const row of receiptsRes.data) {
      if (!isPaidReceipt(row.status)) continue;
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

  const userCounts: Record<string, number> = {};
  for (const u of usersListRes.data ?? []) {
    const id = u.tenant_id || u.company_id;
    if (id) userCounts[id] = (userCounts[id] || 0) + 1;
  }

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

  const inadimplentes = companies.filter(
    (c) => (c.status_operacional || '').trim() === 'Inadimplente',
  );
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
    return {
      id: c.id,
      name: c.name || 'Sem nome',
      slug: c.slug ?? null,
      planLabel: mapPlanToMasterTier(c),
      status: c.status_operacional || (c.active === false ? 'Inativa' : 'Ativa'),
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
      mrr,
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
