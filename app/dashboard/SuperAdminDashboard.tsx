'use client';

import {
  Building2,
  Map as MapIcon,
  Users,
  Calendar,
  Tag,
  DollarSign,
  ExternalLink,
  Crosshair,
  FileText,
  Wallet,
  UserPlus,
  Loader2,
  AlertTriangle,
  Lock,
  CheckCircle,
  Eye,
  Edit2,
  MoreHorizontal,
  Banknote,
  ScrollText,
  Mail,
  Minus,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo, useCallback, type ReactNode, type ComponentType } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useRouter } from 'next/navigation';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import {
  exportMasterDashboardCsv,
  loadMasterDashboardData,
  type MasterDashboardAlert,
  type MasterDashboardData,
} from '@/lib/masterDashboardData';

function pct(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${((part / total) * 100).toFixed(1)}% do total`;
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function todayLabel() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function alertIcon(alert: MasterDashboardAlert) {
  switch (alert.id) {
    case 'no-email':
      return <Mail className="w-4 h-4" />;
    case 'inadimplente':
    case 'expired-subscription':
      return <Lock className="w-4 h-4" />;
    case 'no-projects':
      return <MapIcon className="w-4 h-4" />;
    case 'no-users':
      return <Users className="w-4 h-4" />;
    default:
      return <AlertTriangle className="w-4 h-4" />;
  }
}

function alertStyles(severity: MasterDashboardAlert['severity']) {
  if (severity === 'danger') return { color: 'text-red-400', bg: 'bg-red-500/10' };
  if (severity === 'warning') return { color: 'text-orange-400', bg: 'bg-orange-500/10' };
  return { color: 'text-cyan-400', bg: 'bg-cyan-500/10' };
}

function DashboardSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0b1111] animate-pulse">
      <div className="h-4 w-48 bg-white/5 rounded mb-8" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4 min-w-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 bg-[#151a23] border border-[#1f232b] rounded-2xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 min-w-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-[#151a23] border border-[#1f232b] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-80 bg-[#151a23] border border-[#1f232b] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function SuperAdminDashboard({ user }: { user: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MasterDashboardData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadMasterDashboardData(supabase);
      console.log('MASTER_DASHBOARD_REAL_DATA', data);
      setDashboard(data);
      if (data.errors.length > 0) {
        setLoadError(data.errors.join(' · '));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao carregar dashboard';
      setLoadError(msg);
      setDashboard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN') {
      router.push('/dashboard/operational');
      return;
    }
    loadData();
  }, [user, router, loadData]);

  const stats = dashboard?.stats;
  const hasRevenue = useMemo(
    () => (dashboard?.revenueByMonth.some((m) => m.value > 0) ?? false),
    [dashboard],
  );

  const handleExport = () => {
    if (!dashboard) return;
    const csv = exportMasterDashboardCsv(dashboard);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <DashboardSkeleton />;

  if (!dashboard && loadError) {
    return (
      <div className="flex-1 p-8 flex flex-col items-center justify-center gap-4 bg-[#0b1111]">
        <AlertTriangle className="w-10 h-10 text-red-400" />
        <p className="text-red-300 text-sm text-center max-w-md">{loadError}</p>
        <button
          type="button"
          onClick={loadData}
          className="px-4 py-2 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!dashboard || !stats) return null;

  const planChartData = dashboard.planDistribution
    .filter((p) => p.count > 0)
    .map((p) => ({ name: p.tier, value: p.count, color: p.color }));

  const dateLabel = todayLabel();

  return (
    <div className="sv-page sv-page--scroll-y p-4 md:p-8 bg-[#0b1111]">
      <div className="md:hidden flex justify-between items-start mb-6 pt-2 gap-3">
        <div className="min-w-0 flex-1">
          <SvLotesLogo size={36} showText subtitle="Painel Master SaaS" className="mb-3" />
          <h1 className="text-lg font-medium text-white">
            <span className="text-[var(--color-text-muted)]">Olá,</span>{' '}
            <strong>{user?.name || 'Super Admin'}</strong>
          </h1>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Painel SaaS · dados Supabase</p>
        </div>
        <div className="text-xs font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] py-1.5 px-3 rounded-lg border border-[var(--color-border)]">
          {dateLabel}
        </div>
      </div>

      <div className="hidden md:flex justify-between items-center mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <SvLotesLogo size={44} showText subtitle="Painel Master SaaS" />
          <p className="text-xs font-mono text-emerald-400/90 hidden xl:block">MASTER_DASHBOARD_REAL_DATA</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-300 bg-[#151a23] py-2 px-4 rounded-xl border border-[#1f232b]">
            <Calendar className="w-4 h-4 text-gray-400" />
            {dateLabel}
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 text-xs font-semibold text-gray-300 bg-[#151a23] hover:bg-[#1a1f29] transition-colors py-2 px-4 rounded-xl border border-[#1f232b]"
          >
            <ExternalLink className="w-4 h-4" /> Exportar relatório
          </button>
          <button
            type="button"
            onClick={loadData}
            className="flex items-center gap-2 text-xs font-semibold text-gray-300 bg-[#151a23] hover:bg-[#1a1f29] py-2 px-4 rounded-xl border border-[#1f232b]"
          >
            <Loader2 className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Algumas fontes retornaram aviso: {loadError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 mb-6 min-w-0">
        <KpiCard
          title="Empresas Ativas"
          value={stats.activeCompanies}
          sub={pct(stats.activeCompanies, stats.totalCompanies)}
          icon={<CheckCircle className="w-5 h-5" />}
          iconClass="bg-green-500/10 text-green-400"
        />
        <KpiCard
          title="Empresas Suspensas"
          value={stats.suspendedCompanies}
          sub={pct(stats.suspendedCompanies, stats.totalCompanies)}
          icon={<AlertTriangle className="w-5 h-5" />}
          iconClass="bg-orange-500/10 text-orange-400"
          borderClass="border-orange-500/20"
        />
        <KpiCard
          title="Assinaturas Ativas"
          value={stats.activeSubscriptions}
          sub="Tenants faturáveis"
          icon={<Tag className="w-5 h-5" />}
          iconClass="bg-cyan-500/10 text-cyan-400"
        />
        <KpiCard
          title="Receita Mensal (MRR)"
          value={formatCurrency(stats.mrr)}
          sub={stats.mrr === 0 ? 'Sem assinaturas ativas' : 'Recorrente mensal'}
          icon={<DollarSign className="w-5 h-5" />}
          iconClass="bg-purple-500/10 text-purple-400"
          isCurrency
        />
        <KpiCard
          title="Receita Recebida"
          value={formatCurrency(stats.receivedRevenue)}
          sub="Pagamentos confirmados"
          icon={<Banknote className="w-5 h-5" />}
          iconClass="bg-emerald-500/10 text-emerald-400"
          isCurrency
        />
        <KpiCard
          title="Receita a Receber"
          value={formatCurrency(stats.revenueToReceive)}
          sub="Dentro do prazo"
          icon={<Wallet className="w-5 h-5" />}
          iconClass="bg-blue-500/10 text-blue-400"
          isCurrency
        />
        <KpiCard
          title="Inadimplência"
          value={formatCurrency(stats.delinquencyAmount)}
          sub="Valores vencidos"
          icon={<Lock className="w-5 h-5" />}
          iconClass="bg-rose-500/10 text-rose-400"
          isCurrency
          borderClass="border-rose-500/20"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg">
          <h3 className="text-[15px] font-semibold text-gray-200 mb-6">Receita dos Últimos 6 Meses</h3>
          <div className="h-64 w-full relative">
            {hasRevenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dashboard.revenueByMonth}
                  margin={{ top: 5, right: 20, bottom: 5, left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2d3340" vertical={false} />
                  <XAxis dataKey="label" stroke="#6b7280" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1a1f29',
                      borderColor: '#2d3340',
                      borderRadius: '8px',
                      color: '#fff',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Recebido']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#3b82f6', stroke: '#151a23', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <Wallet className="w-10 h-10 text-gray-600 mb-3" />
                <p className="text-gray-400 text-sm font-medium">Sem recebimentos pagos nos últimos 6 meses</p>
                <p className="text-gray-500 text-xs mt-1">Fonte: finance_receipts (status pago)</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg flex flex-col">
          <h3 className="text-[15px] font-semibold text-gray-200 mb-6">Distribuição de Planos</h3>
          {planChartData.length > 0 ? (
            <div className="flex-1 flex items-center justify-between gap-4">
              <div className="relative w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={75}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {planChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-white">{stats.totalCompanies}</span>
                  <span className="text-[10px] text-gray-400 uppercase tracking-widest">Total</span>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                {dashboard.planDistribution.map((plan) => (
                  <div key={plan.tier} className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: plan.color }} />
                      <span className="text-sm font-medium text-gray-200">{plan.tier}</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-5">
                      {plan.count} {plan.count === 1 ? 'empresa' : 'empresas'}{' '}
                      {stats.totalCompanies > 0 && `(${plan.percent.toFixed(1)}%)`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
              <Tag className="w-10 h-10 text-gray-600 mb-2" />
              <p className="text-gray-400 text-sm">Nenhuma empresa cadastrada</p>
            </div>
          )}
        </div>

        <div className="bg-[#151a23] border border-[#1f232b] p-6 rounded-2xl shadow-lg flex flex-col">
          <h3 className="text-[15px] font-semibold text-gray-200 mb-6">Alertas Inteligentes</h3>
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-72">
            {dashboard.alerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
                <CheckCircle className="w-10 h-10 text-gray-600 mb-2" />
                <p className="text-gray-400 text-sm font-medium">Nenhum alerta no momento.</p>
              </div>
            ) : (
              dashboard.alerts.map((a) => {
                const st = alertStyles(a.severity);
                return (
                  <div key={a.id} className="flex items-start gap-4">
                    <div className={`p-2 rounded-full shrink-0 ${st.bg} ${st.color}`}>{alertIcon(a)}</div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[13px] font-medium ${st.color}`}>{a.title}</p>
                      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{a.description}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8 min-w-0">
        <div className="xl:col-span-3 bg-[#151a23] border border-[#1f232b] rounded-2xl shadow-lg flex flex-col overflow-hidden min-w-0">
          <div className="p-6 border-b border-[#1f232b] flex justify-between items-center">
            <h3 className="text-[15px] font-semibold text-gray-200">Empresas Recentes</h3>
            <Link href="/companies" className="text-xs font-semibold text-blue-500 hover:text-blue-400">
              Ver todas
            </Link>
          </div>
          <div className="sv-table-scroll">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead>
                <tr className="border-b border-[#1f232b] text-[10px] font-bold text-gray-500 tracking-wider uppercase">
                  <th className="p-4 pl-6">Empresa</th>
                  <th className="p-4">Plano</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Projetos</th>
                  <th className="p-4 text-center">Usuários</th>
                  <th className="p-4 text-center">Corretores</th>
                  <th className="p-4">MRR</th>
                  <th className="p-4 pr-6 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {dashboard.recentCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-gray-500 font-medium">
                      Nenhuma empresa cadastrada.
                    </td>
                  </tr>
                ) : (
                  dashboard.recentCompanies.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b border-[#1f232b]/50 hover:bg-[#1a1f29] transition-colors group"
                    >
                      <td className="p-4 pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-gray-800 text-gray-300 flex items-center justify-center font-bold text-xs border border-gray-700">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-200 text-[13px]">{c.name}</span>
                            <span className="block text-[11px] text-gray-500">{c.slug || '—'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2 py-1 rounded text-[10px] font-bold border ${
                            c.planLabel === 'PROFESSIONAL'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : c.planLabel === 'ENTERPRISE'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                : 'bg-green-500/10 text-green-400 border-green-500/20'
                          }`}
                        >
                          {c.planLabel}
                        </span>
                      </td>
                      <td className="p-4">
                        <div>
                          <span
                            className={`text-[11px] font-bold block ${
                              c.status === 'Ativa' ? 'text-green-500' : 'text-red-400'
                            }`}
                          >
                            {c.status}
                          </span>
                          <span className="text-[10px] text-gray-500">{c.financialSituation}</span>
                        </div>
                      </td>
                      <td className="p-4 text-center text-gray-300 text-[12px]">
                        {c.projectsUsed} / {c.projectsLimit}
                      </td>
                      <td className="p-4 text-center text-gray-300 text-[12px]">
                        {c.usersUsed} / {c.usersLimit}
                      </td>
                      <td className="p-4 text-center text-gray-300 text-[12px]">
                        {c.brokersUsed} / {c.brokersLimit}
                      </td>
                      <td className="p-4 text-gray-200 font-medium text-[13px]">
                        {formatCurrency(c.mrr)}
                      </td>
                      <td className="p-4 pr-6 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link
                          href="/companies"
                          className="inline-flex p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                          title="Ver empresas"
                        >
                          <Eye className="w-4 h-4" />
                        </Link>
                        <Link
                          href="/companies"
                          className="inline-flex p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                          title="Gerenciar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Link>
                        <Link
                          href="/plans"
                          className="inline-flex p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <h3 className="text-[15px] font-semibold text-gray-200 px-1">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-4">
            <QuickAction href="/companies?new=1" icon={Building2} label="Nova empresa" color="blue" />
            <QuickAction href="/plans" icon={Banknote} label="Nova assinatura" color="purple" />
            <QuickAction href="/saas-finance" icon={Wallet} label="Financeiro SaaS" color="green" />
            <QuickAction
              onClick={handleExport}
              icon={ExternalLink}
              label="Exportar relatório"
              color="yellow"
            />
            <QuickAction href="/master/audit" icon={ScrollText} label="Auditoria" color="blue" />
            <QuickAction href="/companies" icon={Plus} label="Ver empresas" color="gray" />
          </div>
        </div>
      </div>

      <footer className="mt-8 pt-6 border-t border-[#1f232b] flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
        <span className="font-semibold text-gray-400">© 2026 SV_LOTES — Painel Master SaaS</span>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500/70" />
          <span>Dados em tempo real do Supabase</span>
        </div>
      </footer>
    </div>
  );
}

function KpiCard({
  title,
  value,
  sub,
  icon,
  iconClass,
  borderClass = 'border-[#1f232b]',
  isCurrency,
}: {
  title: string;
  value: number | string;
  sub: string;
  icon: ReactNode;
  iconClass: string;
  borderClass?: string;
  isCurrency?: boolean;
}) {
  return (
    <div
      className={`bg-[#151a23] border ${borderClass} p-5 rounded-2xl flex flex-col justify-between min-w-0 overflow-visible`}
    >
      <div className="flex justify-between items-start">
        <p className="text-[13px] text-gray-400 font-medium">{title}</p>
        <div className={`p-2 rounded-xl ${iconClass}`}>{icon}</div>
      </div>
      <div className="mt-2">
        <h3
          className={`font-bold text-white tracking-tight whitespace-nowrap tabular-nums ${
            isCurrency ? 'text-[clamp(14px,2.2vw,20px)]' : 'text-2xl'
          }`}
        >
          {value}
        </h3>
        <p className="text-[11px] font-medium text-gray-500 mt-1">{sub}</p>
      </div>
    </div>
  );
}

function OpCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className="bg-[#151a23] border border-[#1f232b] p-4 rounded-xl flex items-center justify-between">
      <div>
        <p className="text-[12px] text-gray-500 mb-1 font-medium">{label}</p>
        <p className="text-xl font-bold text-gray-200">{value}</p>
      </div>
      <Icon className={`w-6 h-6 ${color}`} />
    </div>
  );
}

function QuickAction({
  href,
  onClick,
  icon: Icon,
  label,
  color,
}: {
  href?: string;
  onClick?: () => void;
  icon: ComponentType<{ className?: string }>;
  label: string;
  color: 'blue' | 'purple' | 'green' | 'yellow' | 'gray';
}) {
  const palette: Record<string, { icon: string; border: string }> = {
    blue: { icon: 'bg-blue-500/10 text-blue-400', border: 'hover:border-blue-500/50' },
    purple: { icon: 'bg-purple-500/10 text-purple-400', border: 'hover:border-purple-500/50' },
    green: { icon: 'bg-green-500/10 text-green-400', border: 'hover:border-green-500/50' },
    yellow: { icon: 'bg-yellow-500/10 text-yellow-500', border: 'hover:border-yellow-500/50' },
    gray: { icon: 'bg-gray-500/10 text-gray-400', border: 'hover:border-gray-400/50' },
  };
  const p = palette[color];
  const inner = (
    <>
      <div className={`p-3 rounded-full ${p.icon} group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6" />
      </div>
      <span className="text-gray-300 font-medium text-[13px] text-center leading-tight">{label}</span>
    </>
  );
  const cls = `bg-[#151a23] border border-[#1f232b] ${p.border} hover:bg-[#1a2130] transition-all p-5 rounded-2xl flex flex-col items-center justify-center gap-3 group text-center shadow-sm`;

  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
