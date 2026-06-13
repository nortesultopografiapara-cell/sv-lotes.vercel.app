'use client';

import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MasterEmptyState } from '@/components/master/MasterEmptyState';
import { augmentCompanyBilling } from '@/lib/masterBilling';
import {
  formatSaasCurrency,
  isBillableCompany,
  resolveCompanyPricing,
  type CompanyPricingSource,
} from '@/lib/companyPricing';
import { CustomPriceBadge } from '@/components/companies/CustomPriceBadge';
import { SaasContractPanel } from '@/components/saas/SaasContractPanel';
import type { CompanyContractRow } from '@/lib/saasContractService';
import { formatSaasContractApiError } from '@/lib/saasContractErrors';
import { useAuth } from '@/hooks/useAuth';
import { MasterSuperAdminGuard } from '@/components/admin/MasterSuperAdminGuard';
import { mapAuditLogRow } from '@/lib/masterAudit';
import {
  resolveFirstPaymentDate,
  resolveNextDueDate,
} from '@/lib/companySubscriptionDates';
import {
  saasContractOptionalFieldsWarning,
  validateSaasContractGeneration,
} from '@/lib/saasContractValidation';
import {
  formatDateBr,
  hasSaasContractReady,
  isRealSaasCompany,
  type CompanySubscription,
} from '@/lib/saasSubscription';
import {
  Wallet,
  TrendingUp,
  Users,
  AlertCircle,
  Search,
  Download,
  RefreshCw,
  FileText,
  DollarSign,
  Plus,
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  buildReceivedRevenueByMonth,
  formatReferenceMonthLabel,
  paymentMethodLabel,
  sumReceivedRevenue,
  type MasterSaasPayment,
} from '@/lib/masterSaasPayments';
import { RegisterSaasPaymentModal } from '@/components/master/RegisterSaasPaymentModal';

const PLAN_COLORS: Record<string, string> = {
  BÁSICO: '#22c55e',
  BUSINESS: '#3b82f6',
  PROFISSIONAL: '#a855f7',
};

type EnrichedCompany = ReturnType<typeof augmentCompanyBilling>;

function enrichCompany(
  raw: CompanyPricingSource,
  subscription?: CompanySubscription | null,
): EnrichedCompany {
  return augmentCompanyBilling(raw, subscription);
}

export default function SaaSFinancePage() {
  return (
    <MasterSuperAdminGuard>
      <SaaSFinancePageContent />
    </MasterSuperAdminGuard>
  );
}

function SaaSFinancePageContent() {
  const { user, loading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<EnrichedCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPayment, setFilterPayment] = useState('all');
  const [mainTab, setMainTab] = useState<'assinaturas' | 'contrato'>('assinaturas');
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [contractHistory, setContractHistory] = useState<CompanyContractRow[]>([]);
  const [loadingContractId, setLoadingContractId] = useState<string | null>(null);
  const [contractToast, setContractToast] = useState<{
    type: 'error' | 'warning';
    message: string;
  } | null>(null);
  const [billingHistory, setBillingHistory] = useState<
    ReturnType<typeof mapAuditLogRow>[]
  >([]);
  const [saasPayments, setSaasPayments] = useState<MasterSaasPayment[]>([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentInitialCompanyId, setPaymentInitialCompanyId] = useState<string | undefined>();

  const loadData = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('SAAS_FINANCE_LOAD_ERROR', error);
        setCompanies([]);
        return;
      }

      const rows = (data || []) as CompanyPricingSource[];

      let subscriptions: CompanySubscription[] = [];
      const syncRes = await fetch('/api/saas/subscriptions/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      if (syncRes.ok) {
        const syncJson = await syncRes.json();
        subscriptions = (syncJson.subscriptions || []) as CompanySubscription[];
        if (syncJson.created > 0) {
          console.log('SAAS_SUBSCRIPTIONS_SYNC_CREATED', syncJson.created);
        }
      } else {
        const syncErr = await syncRes.json().catch(() => ({}));
        console.warn('SAAS_SUBSCRIPTIONS_SYNC_FAILED', syncErr.error || syncRes.status);
      }

      const subMap = new Map(subscriptions.map((s) => [s.company_id, s]));

      rows.forEach((company) => {
        if (!isRealSaasCompany(company)) return;
        const subscription = subMap.get(company.id) ?? null;
        console.log('SAAS_SUBSCRIPTION_DYNAMIC', {
          company: { id: company.id, name: company.name },
          subscription,
          next_due_date: subscription?.next_due_date ?? null,
          payment_status: subscription?.payment_status ?? 'pending',
        });
      });

      setCompanies(rows.map((c) => enrichCompany(c, subMap.get(c.id))));

      const payRes = await fetch(
        `/api/master/saas-payments?userId=${encodeURIComponent(user.id)}`,
      );
      const payJson = await payRes.json().catch(() => ({}));
      const payments = (payRes.ok ? payJson.payments : []) as MasterSaasPayment[];
      setSaasPayments(payments);

      const { data: billingLogs } = await supabase
        .from('audit_logs')
        .select('id, action, module, description, created_at, tenant_id, user_id')
        .eq('module', 'SUBSCRIPTIONS')
        .order('created_at', { ascending: false })
        .limit(50);

      const companyNameMap = Object.fromEntries(rows.map((c) => [c.id, c.name || '—']));
      const { data: platformUsers } = await supabase
        .from('users')
        .select('id, name, full_name, email');
      const userNameMap = Object.fromEntries(
        (platformUsers || []).map((u) => [
          u.id,
          u.name || u.full_name || u.email || 'Usuário',
        ]),
      );
      const auditRows = (billingLogs || []).map((row) =>
        mapAuditLogRow(row, companyNameMap, userNameMap),
      );
      const paymentRows = payments.map((payment) => ({
        id: `payment-${payment.id}`,
        created_at: payment.paid_at,
        user_name: 'Master',
        action: 'Pagamento registrado',
        company_name: payment.company_name || companyNameMap[payment.company_id] || '—',
        details: `${formatSaasCurrency(Number(payment.amount))} · ${formatReferenceMonthLabel(payment.reference_month)} · ${paymentMethodLabel(payment.payment_method)}${payment.notes ? ` · ${payment.notes}` : ''}`,
      }));
      setBillingHistory(
        [...paymentRows, ...auditRows].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        }),
      );
    } catch (err) {
      console.error('SAAS_FINANCE_LOAD_ERROR', err);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [loadData, authLoading]);

  const stats = useMemo(() => {
    let mrr = 0;
    let activeClients = 0;
    let delayedAmount = 0;
    let outstandingCount = 0;
    let receivedRevenue = 0;

    companies.forEach((c) => {
      const pricing = resolveCompanyPricing(c);
      const applied = pricing.appliedPrice;

      if (isBillableCompany(c)) {
        activeClients++;
        mrr += applied;
      }

      if (c.subscription_status === 'Inadimplente') {
        delayedAmount += applied;
        outstandingCount++;
      }
    });

    receivedRevenue = sumReceivedRevenue(saasPayments);

    return {
      mrr,
      arr: mrr * 12,
      projectedRevenue: mrr,
      receivedRevenue,
      activeClients,
      delayedAmount,
      outstandingCount,
    };
  }, [companies, saasPayments]);

  const revenueByMonth = useMemo(
    () => buildReceivedRevenueByMonth(saasPayments),
    [saasPayments],
  );

  const paymentCompanyOptions = useMemo(
    () =>
      companies.map((c) => {
        const id = (c as { id?: string }).id || '';
        const sub = c.saas_subscription as CompanySubscription | null;
        return {
          id,
          name: c.name || '—',
          defaultAmount: resolveCompanyPricing(c).appliedPrice,
          subscriptionId: sub?.id ?? null,
        };
      }),
    [companies],
  );

  const openPaymentModal = useCallback((company?: EnrichedCompany) => {
    setPaymentInitialCompanyId((company as { id?: string } | undefined)?.id);
    setPaymentModalOpen(true);
  }, []);

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      const matchSearch =
        (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(search.toLowerCase());
      const matchPlan = filterPlan === 'all' || c.ui_plan === filterPlan;
      const matchStatus =
        filterStatus === 'all' ||
        c.subscription_status.toLowerCase() === filterStatus.toLowerCase();
      const matchPayment =
        filterPayment === 'all' ||
        c.payment_status.toLowerCase() === filterPayment.toLowerCase();

      return matchSearch && matchPlan && matchStatus && matchPayment;
    });
  }, [companies, search, filterPlan, filterStatus, filterPayment]);

  const delinquentCompanies = useMemo(
    () => filteredCompanies.filter((c) => c.subscription_status === 'Inadimplente'),
    [filteredCompanies],
  );

  const planDistData = useMemo(() => {
    const sums: Record<string, number> = {
      BÁSICO: 0,
      BUSINESS: 0,
      PROFISSIONAL: 0,
    };

    companies.forEach((c) => {
      if (!isBillableCompany(c)) return;
      const key = c.ui_plan || 'BÁSICO';
      sums[key] = (sums[key] || 0) + resolveCompanyPricing(c).appliedPrice;
    });

    return [
      { name: 'Básico', key: 'BÁSICO', value: sums['BÁSICO'], fill: PLAN_COLORS['BÁSICO'] },
      { name: 'Business', key: 'BUSINESS', value: sums['BUSINESS'], fill: PLAN_COLORS['BUSINESS'] },
      {
        name: 'Profissional',
        key: 'PROFISSIONAL',
        value: sums['PROFISSIONAL'],
        fill: PLAN_COLORS['PROFISSIONAL'],
      },
    ].filter((d) => d.value > 0);
  }, [companies]);

  const mrrTrendData = revenueByMonth.map((m) => ({ name: m.label, value: m.value }));

  const selectedCompany = useMemo(
    () => companies.find((c) => (c as { id?: string }).id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );

  const selectedSubscription = useMemo(
    () =>
      (selectedCompany?.saas_subscription as CompanySubscription | null) ?? null,
    [selectedCompany],
  );

  const loadCompanyContracts = useCallback(
    async (companyId: string): Promise<CompanyContractRow[]> => {
      if (!user?.id) return [];
      try {
        const res = await fetch(
          `/api/companies/${companyId}/contracts?userId=${encodeURIComponent(user.id)}`,
        );
        const json = await res.json().catch(() => ({}));
        const list = (json.contracts || []) as CompanyContractRow[];
        if (res.ok) {
          setContractHistory(list);
          return list;
        }
      } catch (err) {
        console.error('LOAD_COMPANY_CONTRACTS_ERROR', err);
      }
      setContractHistory([]);
      return [];
    },
    [user?.id],
  );

  const handleGenerateSaasContract = useCallback(
    async (
      company: EnrichedCompany,
      subscription: CompanySubscription | null,
      options?: { regenerate?: boolean },
    ) => {
      const companyId = (company as { id?: string }).id;
      if (!companyId) {
        alert('Não foi possível gerar o contrato');
        return;
      }
      if (!user?.id) {
        alert('Não foi possível gerar o contrato');
        return;
      }

      const loadingKey = subscription?.id || companyId;
      if (loadingContractId === loadingKey) return;

      console.log('SAAS_CONTRACT_GENERATE_START');
      console.log('SAAS_CONTRACT_COMPANY_DATA', company);
      console.log('SAAS_CONTRACT_SUBSCRIPTION_DATA', subscription);
      setLoadingContractId(loadingKey);
      setContractToast(null);

      const validation = validateSaasContractGeneration(company, subscription);
      if (!validation.ok) {
        const msg = validation.error || 'Não foi possível gerar o contrato';
        setContractToast({ type: 'error', message: msg });
        alert(msg);
        setLoadingContractId(null);
        return;
      }

      const optionalWarn = saasContractOptionalFieldsWarning(validation.warnings);
      if (optionalWarn) {
        setContractToast({ type: 'warning', message: optionalWarn });
      } else {
        setContractToast(null);
      }

      const pricing = resolveCompanyPricing(company);
      const regenerate =
        options?.regenerate === true || hasSaasContractReady(subscription);

      try {
        const res = await fetch(`/api/companies/${companyId}/contract/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.id,
            subscription_id: subscription?.id ?? null,
            company_id: companyId,
            regenerate,
            plan_type: subscription?.plan_type || company.plan_type || company.plan,
            monthly_price: subscription?.monthly_price ?? pricing.appliedPrice,
          }),
        });

        const result = await res.json().catch(() => ({}));
        console.log('SAAS_CONTRACT_API_RESPONSE', result);

        if (!res.ok || result.success === false) {
          throw new Error(formatSaasContractApiError(result));
        }

        console.log('SAAS_CONTRACT_PDF_URL', result.contract_pdf_url);
        console.log('SAAS_CONTRACT_GENERATED_SUCCESS', result);

        const updatedSub: CompanySubscription | null =
          (result.subscription as CompanySubscription | undefined) ??
          (subscription
            ? {
                ...subscription,
                contract_status: 'active',
                contract_number:
                  result.contract_number ?? subscription.contract_number ?? null,
                contract_pdf_url:
                  result.contract_pdf_url ?? subscription.contract_pdf_url ?? null,
              }
            : null);

        const enrichedRow = enrichCompany(
          company as CompanyPricingSource,
          updatedSub,
        );

        setCompanies((prev) =>
          prev.map((row) => {
            const rowId = (row as { id?: string }).id;
            if (rowId !== companyId) return row;
            return enrichedRow;
          }),
        );

        setSelectedCompanyId(companyId);

        const contracts = Array.isArray(result.contracts)
          ? (result.contracts as CompanyContractRow[])
          : await loadCompanyContracts(companyId);
        if (Array.isArray(result.contracts)) {
          setContractHistory(result.contracts as CompanyContractRow[]);
        }

        console.log('CONTRACT_GENERATE_SUCCESS_SELECTED', {
          company: enrichedRow,
          subscription: updatedSub,
          contracts,
        });

        setMainTab('contrato');
        setContractToast(null);
      } catch (err) {
        console.error('GENERATE_SAAS_CONTRACT_ERROR', err);
        const msg =
          err instanceof Error ? err.message : 'Não foi possível gerar o contrato';
        setContractToast({ type: 'error', message: msg });
        alert(msg);
        throw err;
      } finally {
        setLoadingContractId(null);
      }
    },
    [user?.id, loadingContractId, loadCompanyContracts],
  );

  const openContractTab = useCallback(
    async (companyId: string) => {
      setSelectedCompanyId(companyId);
      setMainTab('contrato');
      await loadCompanyContracts(companyId);
    },
    [loadCompanyContracts],
  );

  const handleExport = () => {
    const lines = [
      'Empresa,Plano,Status,Preço Padrão,Preço Aplicado,Custom,MRR',
      ...companies.map((c) => {
        const p = resolveCompanyPricing(c);
        return [
          c.name,
          c.ui_plan,
          c.subscription_status,
          p.standardPrice.toFixed(2),
          p.appliedPrice.toFixed(2),
          p.customEnabled ? 'sim' : 'nao',
          isBillableCompany(c) ? p.appliedPrice.toFixed(2) : '0',
        ].join(',');
      }),
      '',
      `MRR Total,${stats.mrr.toFixed(2)}`,
      `ARR Total,${stats.arr.toFixed(2)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saas-finance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatCurrency = (val: number) => formatSaasCurrency(val);

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 bg-[#070b14] min-h-full font-sans text-gray-200 selection:bg-blue-500/30">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">
            Financeiro SaaS
          </h1>
          <p className="text-gray-400 mt-1 text-[14px]">
            MRR/ARR com preço aplicado (inclui negociações personalizadas).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <Link
            href="/companies?new=1"
            className="bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          >
            + Nova Empresa
          </Link>
          <Link
            href="/plans"
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all"
          >
            + Nova Assinatura
          </Link>
          <button
            type="button"
            onClick={loadData}
            className="bg-[#11161d] border border-white/10 hover:bg-white/5 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 min-w-0">
        <StatCard
          title="Receita prevista (MRR)"
          value={formatCurrency(stats.projectedRevenue)}
          description="Valor mensal esperado das assinaturas ativas"
          icon={<DollarSign className="w-5 h-5 text-green-400" />}
          border="border-green-500/20"
        />
        <StatCard
          title="Receita recebida"
          value={formatCurrency(stats.receivedRevenue)}
          description="Soma dos pagamentos SaaS registrados"
          icon={<Wallet className="w-5 h-5 text-emerald-400" />}
          border="border-emerald-500/20"
        />
        <StatCard
          title="Receita Mensal (MRR)"
          value={formatCurrency(stats.mrr)}
          description="Soma dos preços aplicados por tenant"
          icon={<DollarSign className="w-5 h-5 text-green-400" />}
          border="border-green-500/20"
        />
        <StatCard
          title="Receita Anual (ARR)"
          value={formatCurrency(stats.arr)}
          description="Projeção anual com base no MRR"
          icon={<TrendingUp className="w-5 h-5 text-blue-400" />}
          border="border-blue-500/20"
        />
        <StatCard
          title="Inadimplência"
          value={formatCurrency(stats.delayedAmount)}
          description={`${stats.outstandingCount} empresa(s) inadimplente(s)`}
          icon={<AlertCircle className="w-5 h-5 text-rose-400" />}
          border="border-rose-500/20"
        />
        <StatCard
          title="Clientes Ativos"
          value={String(stats.activeClients)}
          description="Tenants com assinatura faturável"
          icon={<Users className="w-5 h-5 text-purple-400" />}
          border="border-purple-500/20"
        />
      </div>

      {delinquentCompanies.length > 0 ? (
        <div className="mb-8 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
          <h3 className="text-sm font-bold text-white mb-3">Empresas inadimplentes</h3>
          <div className="space-y-2">
            {delinquentCompanies.map((c) => (
              <div
                key={(c as { id?: string }).id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-white/5 bg-[#11161d] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.payment_status}</p>
                </div>
                <p className="text-sm font-bold text-rose-400 tabular-nums">
                  {formatCurrency(resolveCompanyPricing(c).appliedPrice)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {billingHistory.length > 0 ? (
        <div className="mb-8 rounded-2xl border border-white/5 bg-[#11161d] p-5">
          <h3 className="text-sm font-bold text-white mb-3">Histórico de cobranças</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[640px]">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-2">Data</th>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Ação</th>
                  <th className="p-2">Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {billingHistory.map((row) => (
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="p-2 text-gray-400 whitespace-nowrap">
                      {row.created_at
                        ? new Date(row.created_at).toLocaleString('pt-BR')
                        : '—'}
                    </td>
                    <td className="p-2 text-gray-200">{row.company_name}</td>
                    <td className="p-2 text-gray-300">{row.action}</td>
                    <td className="p-2 text-gray-500 truncate max-w-[280px]">{row.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <ChartCard title="Receita recebida — últimos 6 meses">
          {mrrTrendData.some((m) => m.value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mrrTrendData}>
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Recebido']} />
                <Line type="monotone" dataKey="value" stroke="#22c55e" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhum pagamento registrado no período" />
          )}
        </ChartCard>

        <ChartCard title="Receita por Plano (preço aplicado)">
          {planDistData.length > 0 ? (
            <div className="flex items-center h-[200px]">
              <ResponsiveContainer width="50%" height="100%">
                <PieChart>
                  <Pie data={planDistData} innerRadius={50} outerRadius={70} dataKey="value" stroke="none">
                    {planDistData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="w-1/2 pl-3 space-y-3">
                {planDistData.map((d) => (
                  <div key={d.key}>
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.fill }} />
                      <span className="text-xs text-gray-300">{d.name}</span>
                    </div>
                    <p className="text-sm font-bold text-white pl-4">{formatCurrency(d.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyChart message="Sem assinaturas ativas" />
          )}
        </ChartCard>

        <ChartCard title="Receita recebida por mês (barras)">
          {mrrTrendData.some((m) => m.value > 0) ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={mrrTrendData}>
                <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), 'Recebido']} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Nenhum pagamento registrado" />
          )}
        </ChartCard>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMainTab('assinaturas')}
          className={`px-4 py-2 rounded-lg text-[13px] font-medium ${
            mainTab === 'assinaturas'
              ? 'bg-blue-600 text-white'
              : 'bg-[#11161d] border border-white/10 text-gray-400'
          }`}
        >
          Assinaturas
        </button>
        <button
          type="button"
          onClick={() => setMainTab('contrato')}
          className={`px-4 py-2 rounded-lg text-[13px] font-medium flex items-center gap-2 ${
            mainTab === 'contrato'
              ? 'bg-blue-600 text-white'
              : 'bg-[#11161d] border border-white/10 text-gray-400'
          }`}
        >
          <FileText className="w-4 h-4" /> Contrato
        </button>
      </div>

      {mainTab === 'contrato' && (
        <div className="mb-8">
          <SaasContractPanel
            company={selectedCompany}
            subscription={selectedSubscription}
            contracts={contractHistory}
            generating={
              !!selectedCompanyId &&
              loadingContractId ===
                (selectedSubscription?.id || selectedCompanyId)
            }
            onRefresh={loadData}
            onContractsReload={
              selectedCompanyId
                ? () => loadCompanyContracts(selectedCompanyId)
                : undefined
            }
            onGenerateContract={async (opts) => {
              if (!selectedCompany) return;
              console.log('SAAS_CONTRACT_CLICK_FROM_TAB', opts);
              await handleGenerateSaasContract(
                selectedCompany,
                selectedSubscription,
                opts,
              );
            }}
          />
        </div>
      )}

      <div className={`flex flex-col lg:flex-row gap-6 mb-8 min-w-0 ${mainTab === 'contrato' ? 'hidden' : ''}`}>
        <div className="flex-1 min-w-0 bg-[#11161d] border border-white/5 rounded-2xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-[16px] font-bold text-white">Assinaturas das Empresas</h3>
              <p className="text-[12px] text-gray-400">
                Vencimento e pagamento vêm da assinatura SaaS (company_subscriptions).
              </p>
            </div>
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-[250px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  type="text"
                  placeholder="Buscar empresa..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-[#0B0E14] border border-white/10 text-white pl-9 pr-4 py-2 rounded-lg text-[13px]"
                />
              </div>
              <button
                type="button"
                onClick={() => openPaymentModal()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[13px] font-semibold"
              >
                <Plus className="w-4 h-4" /> Registrar pagamento
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 text-gray-300 text-[13px] hover:bg-white/5"
              >
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>
          </div>

          {contractToast && (
            <div
              className={`mx-5 mt-4 p-3 rounded-lg text-sm whitespace-pre-line ${
                contractToast.type === 'warning'
                  ? 'bg-amber-500/10 border border-amber-500/25 text-amber-100'
                  : 'bg-red-500/10 border border-red-500/20 text-red-300'
              }`}
            >
              {contractToast.message}
            </div>
          )}

          <div className="sv-table-scroll">
            <table className="w-full text-left min-w-[880px]">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Empresa</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Plano</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Status</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Valor (R$)</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Ciclo</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Data de início</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Primeira cobrança</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Próximo vencimento</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Pagamento</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Contrato</th>
                  <th className="p-4 text-[12px] text-gray-400 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map((c) => {
                  const pricing = resolveCompanyPricing(c);
                  const planColor = PLAN_COLORS[c.ui_plan] || PLAN_COLORS['BÁSICO'];
                  const companyId = (c as { id?: string }).id;
                  const sub = c.saas_subscription as CompanySubscription | null;
                  const startDate = c.subscription_start_date || sub?.start_date;
                  const firstPaymentDate = c.first_payment_date || resolveFirstPaymentDate(c, sub);
                  const nextDueDate = c.next_payment_date || resolveNextDueDate(c, sub);
                  const contractValidation = validateSaasContractGeneration(c, sub);
                  const canGenerateContract = contractValidation.ok;
                  const contractWarn = saasContractOptionalFieldsWarning(
                    contractValidation.warnings,
                  );
                  const contractReady = hasSaasContractReady(sub);
                  const contractViewUrl = sub?.contract_pdf_url?.startsWith('http')
                    ? sub.contract_pdf_url
                    : `/api/companies/${companyId}/contract?download=1`;
                  const contractLoadingKey = sub?.id || companyId || '';
                  const isGeneratingContract = loadingContractId === contractLoadingKey;

                  return (
                    <tr key={companyId || c.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded flex items-center justify-center font-bold text-white text-[12px]"
                            style={{ backgroundColor: planColor }}
                          >
                            {c.name?.charAt(0)?.toUpperCase() || 'E'}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[13px] font-medium text-white">{c.name}</p>
                              <CustomPriceBadge company={c} />
                            </div>
                            <p className="text-[11px] text-gray-500">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
                          style={{
                            color: planColor,
                            borderColor: `${planColor}33`,
                            backgroundColor: `${planColor}11`,
                          }}
                        >
                          {c.ui_plan}
                        </span>
                      </td>
                      <td className="p-4 text-[12px]">{c.subscription_status}</td>
                      <td className="p-4">
                        {pricing.hasCustomPrice ? (
                          <div>
                            <span className="text-emerald-400 font-semibold text-[13px] block">
                              {formatSaasCurrency(pricing.appliedPrice)}
                            </span>
                            <span className="line-through text-gray-500 text-[11px]">
                              {formatSaasCurrency(pricing.standardPrice)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[13px] text-gray-300">
                            {formatSaasCurrency(pricing.appliedPrice)}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-[13px] text-gray-400">Mensal</td>
                      <td className="p-4 text-[12px] text-gray-300">
                        {formatDateBr(startDate)}
                      </td>
                      <td className="p-4 text-[12px] text-gray-300">
                        {formatDateBr(firstPaymentDate)}
                      </td>
                      <td className="p-4 text-[12px] text-gray-300">
                        {formatDateBr(nextDueDate)}
                      </td>
                      <td className="p-4 text-[12px]">
                        <span
                          className={
                            c.payment_status === 'Vencido'
                              ? 'text-red-400'
                              : c.payment_status === 'Pago'
                                ? 'text-emerald-400'
                                : 'text-gray-300'
                          }
                        >
                          {c.payment_status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-1.5">
                          {contractReady ? (
                            <>
                              <a
                                href={contractViewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-blue-300 hover:bg-white/5"
                              >
                                Ver contrato
                              </a>
                              <a
                                href={contractViewUrl}
                                download
                                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-gray-300 hover:bg-white/5"
                              >
                                Baixar PDF
                              </a>
                              <button
                                type="button"
                                onClick={() => void openContractTab(companyId!)}
                                className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[11px] text-gray-400 hover:bg-white/5"
                              >
                                Detalhes
                              </button>
                            </>
                          ) : isRealSaasCompany(c) ? (
                            <button
                              type="button"
                              disabled={isGeneratingContract || !companyId || !canGenerateContract}
                              title={
                                !canGenerateContract
                                  ? contractValidation.error ||
                                    'Preencha nome, CNPJ, plano, valor e datas de assinatura'
                                  : contractWarn || undefined
                              }
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleGenerateSaasContract(c, sub);
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-200 text-[12px] hover:bg-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {isGeneratingContract ? 'Gerando…' : 'Gerar'}
                            </button>
                          ) : (
                            <span className="text-[11px] text-gray-500">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => openPaymentModal(c)}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-500/30 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10"
                        >
                          Registrar pagamento
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredCompanies.length === 0 && !loading && (
                  <tr>
                    <td colSpan={11} className="p-6">
                      <MasterEmptyState
                        title="Nenhuma assinatura cadastrada"
                        description="Cadastre empresas em /companies para ver faturamento SaaS."
                      />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="w-full lg:w-[300px] lg:max-w-[300px] shrink-0 min-w-0 bg-[#11161d] border border-white/5 rounded-2xl p-5">
          <h3 className="font-bold text-white text-[15px] mb-4">Filtros</h3>
          <div className="space-y-4">
            <FilterSelect label="Plano" value={filterPlan} onChange={setFilterPlan}>
              <option value="all">Todos</option>
              <option value="BÁSICO">Básico</option>
              <option value="BUSINESS">Business</option>
              <option value="PROFISSIONAL">Profissional</option>
            </FilterSelect>
            <FilterSelect label="Status" value={filterStatus} onChange={setFilterStatus}>
              <option value="all">Todos</option>
              <option value="ativa">Ativa</option>
              <option value="inadimplente">Inadimplente</option>
            </FilterSelect>
            <FilterSelect label="Pagamento" value={filterPayment} onChange={setFilterPayment}>
              <option value="all">Todos</option>
              <option value="aguardando cobrança">Aguardando cobrança</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </FilterSelect>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterPlan('all');
              setFilterStatus('all');
              setFilterPayment('all');
              setSearch('');
            }}
            className="w-full mt-4 py-2.5 rounded-lg border border-white/10 text-gray-300 text-sm"
          >
            Limpar filtros
          </button>
        </div>
      </div>

      {user?.id ? (
        <RegisterSaasPaymentModal
          open={paymentModalOpen}
          onClose={() => setPaymentModalOpen(false)}
          userId={user.id}
          companies={paymentCompanyOptions}
          initialCompanyId={paymentInitialCompanyId}
          onSuccess={loadData}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  title,
  value,
  description,
  icon,
  border,
}: {
  title: string;
  value: string;
  description: string;
  icon: ReactNode;
  border: string;
}) {
  return (
    <div
      className={`bg-[#11161d] border ${border} rounded-xl p-5 min-w-0 overflow-visible flex flex-col gap-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12px] text-gray-400 font-medium leading-snug">{title}</p>
        <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>
      <p className="text-[clamp(16px,2.5vw,24px)] font-bold text-white whitespace-nowrap tabular-nums leading-tight">
        {value}
      </p>
      <p className="text-[11px] text-gray-500 leading-snug">{description}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-[#11161d] border border-white/5 rounded-2xl p-5">
      <h3 className="text-[14px] font-bold text-white mb-4">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[200px] flex items-center justify-center text-gray-500 text-sm">{message}</div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-gray-400 mb-1 uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[#070b14] border border-white/10 rounded-lg p-2.5 text-[13px] text-white"
      >
        {children}
      </select>
    </div>
  );
}
