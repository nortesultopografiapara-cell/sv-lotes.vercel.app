'use client';

import {
  TrendingUp,
  Calendar,
  Tag,
  DollarSign,
  FileText,
  Wallet,
  UserPlus,
  Loader2,
  AlertCircle,
  Building2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  canViewEnterpriseValues,
  isBrokerRole,
  isOwnerRole,
} from '@/lib/rolePermissions';
import {
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  loadOwnerAccessContext,
  resolveReceiptProjectId,
} from '@/lib/ownerProjectAccess';
import { supabase } from '@/lib/supabase';
import { applyTenantFilter, resolveRlsContext } from '@/lib/rls';
import { useGisSelectedProject } from '@/contexts/GisSelectedProjectContext';
import { calculateFinancialTotals } from '@/lib/financeCashFlow';
import {
  calculateEnterpriseValueSummary,
  filterEnterpriseLotsByProject,
  formatEnterpriseCurrency,
} from '@/lib/enterpriseValueSummary';
import SuperAdminDashboard from './SuperAdminDashboard';
import { motion } from 'motion/react';
import './dashboard-premium.css';
import {
  DashboardTopKpi,
  DashboardMetricKpi,
  DashboardActivityItem,
  DashboardEmptyActivities,
  FinancialSummaryCard,
} from '@/components/dashboard/DashboardPremiumUI';

function receiptMatchesProject(
  receipt: {
    project_id?: string | null;
    projects?: { name?: string | null } | null;
    sales?: { project_id?: string | null; projects?: { name?: string | null } | null } | null;
    blocks?: { project_id?: string | null; projects?: { name?: string | null } | null } | null;
  },
  projectId: string,
  projectName: string,
): boolean {
  if (!projectId) return true;
  const directId =
    receipt.project_id ||
    receipt.sales?.project_id ||
    receipt.blocks?.project_id ||
    null;
  if (directId === projectId) return true;
  const name =
    receipt.projects?.name ||
    receipt.sales?.projects?.name ||
    receipt.blocks?.projects?.name ||
    '';
  return name === projectName;
}

export default function DashboardPage() {
  const { user } = useAuth();
  
  if (user?.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard user={user} />;
  }
  
  return <OperationalDashboard user={user} />;
}

function OperationalDashboard({ user }: { user: any }) {
  const router = useRouter();
  const { setGisSelectedProject, clearGisSelectedProject } = useGisSelectedProject();
  const showEnterpriseValues =
    canViewEnterpriseValues(user?.role) || isOwnerRole(user?.role);
  const [stats, setStats] = useState({
    globalEnterpriseTotal: 0,
    enterpriseTotal: 0,
    availableValue: 0,
    reservedValue: 0,
    soldValue: 0,
    available: 0,
    reserved: 0,
    sold: 0,
    paid: 0,
    recebimentos_mes: 0,
    a_receber: 0,
    inadimplencia: 0,
    total_entradas: 0,
    total_saidas: 0,
    saldo_atual: 0,
    margem_percent: 0,
  });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  useEffect(() => {
    if (isBrokerRole(user?.role)) {
      router.replace('/map');
    }
  }, [user?.role, router]);

  useEffect(() => {
    if (!user || !isOwnerRole(user.role)) return;
    void (async () => {
      const rlsCtx = await resolveRlsContext(user);
      const tenantId =
        rlsCtx.tenantId || user.tenant_id || (user as { company_id?: string })?.company_id || null;
      const ownerCtx = await loadOwnerAccessContext(supabase, user, tenantId);
      if (!ownerCtx.permissions.can_view_dashboard) {
        if (ownerCtx.permissions.can_view_map) router.replace('/map');
        else if (ownerCtx.permissions.can_view_finance) router.replace('/finance');
        else if (ownerCtx.permissions.can_view_contracts) router.replace('/contracts');
      }
    })();
  }, [user, router]);

  useEffect(() => {
    const p = projects.find((x) => x.id === selectedProjectId);
    if (selectedProjectId && p?.name) {
      setGisSelectedProject({ id: p.id, name: p.name });
    } else if (!selectedProjectId) {
      clearGisSelectedProject();
    }
  }, [selectedProjectId, projects, setGisSelectedProject, clearGisSelectedProject]);

  useEffect(() => {
    return () => clearGisSelectedProject();
  }, [clearGisSelectedProject]);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  useEffect(() => {
    async function loadDashboardStats() {
      if (!user) return;
      
      try {
        const rlsCtx = await resolveRlsContext(user);
        const resolvedTenantId =
          rlsCtx.tenantId || user.tenant_id || (user as { company_id?: string })?.company_id || null;

        if (!rlsCtx.isSuperAdmin && !resolvedTenantId) {
          setLoading(false);
          return;
        }

        let query = supabase.from('blocks').select('project_id, status, price', { count: 'exact' });
        let projectsQuery = supabase.from('projects').select('id, name');
        query = applyTenantFilter(query, rlsCtx, 'blocks');
        projectsQuery = applyTenantFilter(projectsQuery, rlsCtx, 'projects');

        const { data, error } = await query;
        const { data: projectsData } = await projectsQuery;

        const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
        const visibleProjects = filterProjectsForUser(
          user,
          projectsData || [],
          ownerCtx.allowedProjectIds,
        );

        if (visibleProjects.length > 0) {
          setProjects(visibleProjects);
        } else {
          setProjects([]);
        }

        if (error) throw error;

        const allLots = data || [];
        const ownerScopedLots = filterRowsByOwnerProjects(
          allLots,
          ownerCtx.allowedProjectIds,
          (lot) => lot.project_id as string | null | undefined,
        );
        const tenantScopedLots = ownerCtx.isOwner ? ownerScopedLots : allLots;
        const globalEnterprise = calculateEnterpriseValueSummary(tenantScopedLots);
        const scopedLots = selectedProjectId
          ? filterEnterpriseLotsByProject(tenantScopedLots, selectedProjectId)
          : tenantScopedLots;
        const enterprise = calculateEnterpriseValueSummary(scopedLots);
        const selectedProjectName =
          visibleProjects.find((p) => p.id === selectedProjectId)?.name || '';

        let recebimentosMes = 0;
        let aReceber = 0;
        let inadimplenciaVal = 0;
        let totalEntradas = 0;
        let totalSaidas = 0;
        let saldoAtual = 0;
        let margemPercent = 0;

        try {
            const startOfMonth = new Date(
              currentTime.getFullYear(),
              currentTime.getMonth(),
              1,
            );
            const startOfMonthStr = startOfMonth.toISOString().split('T')[0];

            let recQuery = supabase.from('finance_receipts').select('*');
            recQuery = applyTenantFilter(recQuery, rlsCtx, 'finance_receipts');
            const { data: receiptsData } = await recQuery;

            let cashQuery = supabase.from('cash_movements').select('*');
            cashQuery = applyTenantFilter(cashQuery, rlsCtx, 'cash_movements');
            const { data: cashData } = await cashQuery;

            let commQuery = supabase.from('broker_commissions').select('*');
            commQuery = applyTenantFilter(commQuery, rlsCtx, 'broker_commissions');
            const { data: commsData } = await commQuery;

            const scopedReceipts = filterRowsByOwnerProjects(
              receiptsData || [],
              ownerCtx.allowedProjectIds,
              resolveReceiptProjectId,
            ).filter((r) =>
              selectedProjectId
                ? receiptMatchesProject(r, selectedProjectId, selectedProjectName)
                : true,
            );
            const scopedCash = (cashData || []).filter((c) => {
              if (ownerCtx.allowedProjectIds) {
                const projectId =
                  c.project_id ||
                  c.projects?.id ||
                  c.sales?.project_id ||
                  c.sales?.projects?.id ||
                  c.contracts?.project_id ||
                  c.contracts?.projects?.id;
                if (!projectId || !ownerCtx.allowedProjectIds.includes(projectId)) {
                  return false;
                }
              }
              if (!selectedProjectId) return true;
              const name =
                c.projects?.name ||
                c.sales?.projects?.name ||
                c.contracts?.projects?.name ||
                '';
              return name === selectedProjectName;
            });
            const scopedComms = (commsData || []).filter((c) => {
              if (ownerCtx.allowedProjectIds) {
                const projectId =
                  c.project_id ||
                  c.sales?.project_id ||
                  c.sales?.projects?.id ||
                  c.contracts?.project_id;
                if (!projectId || !ownerCtx.allowedProjectIds.includes(projectId)) {
                  return false;
                }
              }
              if (!selectedProjectId) return true;
              const name =
                c.sales?.projects?.name || c.contracts?.projects?.name || '';
              return name === selectedProjectName;
            });

            const totals = calculateFinancialTotals(
              scopedReceipts,
              scopedCash,
              scopedComms,
            );
            totalEntradas = totals.totalEntradas;
            totalSaidas = totals.totalSaidas;
            saldoAtual = totals.saldoFinal;
            margemPercent =
              totalEntradas > 0 ? (saldoAtual / totalEntradas) * 100 : 0;

            scopedReceipts.forEach((r) => {
              const st = String(r.status || '').toLowerCase();
              const amt = Number(r.paid_amount) || Number(r.amount) || 0;
              const paidAt = r.paid_at ? new Date(r.paid_at) : null;
              if (
                (st === 'pago' || st === 'paid') &&
                paidAt &&
                paidAt >= startOfMonth
              ) {
                recebimentosMes += amt;
              }
              if (st === 'pendente' || st === 'pending') {
                aReceber += Number(r.amount) || 0;
              }
              if (st === 'atrasado' || st === 'overdue') {
                inadimplenciaVal += Number(r.amount) || 0;
              }
            });
        } catch (e) {
            console.error('[DASHBOARD] erro financeiro', e);
        }

        // Load Activities / Logs
        let logsQuery = supabase
          .from('logs')
          .select('*, users(full_name)')
          .order('created_at', { ascending: false })
          .limit(5);
        if (!rlsCtx.isSuperAdmin && resolvedTenantId) {
          logsQuery = logsQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
        }
        
        const { data: logsData } = await logsQuery;
        setActivities(logsData || []);
        
        setStats({
          globalEnterpriseTotal: globalEnterprise.totalValue,
          enterpriseTotal: enterprise.totalValue,
          availableValue: enterprise.availableValue,
          reservedValue: enterprise.reservedValue,
          soldValue: enterprise.soldValue,
          available: enterprise.availableCount,
          reserved: enterprise.reservedCount,
          sold: enterprise.soldCount,
          paid: enterprise.paidCount,
          recebimentos_mes: recebimentosMes,
          a_receber: aReceber,
          inadimplencia: inadimplenciaVal,
          total_entradas: totalEntradas,
          total_saidas: totalSaidas,
          saldo_atual: saldoAtual,
          margem_percent: margemPercent,
        });
      } catch (err) {
        console.error("Dashboard stats error:", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboardStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedProjectId]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };
  
  const formatDateBR = (date: Date) => {
      const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      const str = date.toLocaleDateString('pt-BR', options);
      return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = new Date().getTime() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Há ${minutes === 0 ? 'poucos' : minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Há ${hours} h`;
    const days = Math.floor(hours / 24);
    return `Há ${days} ${days === 1 ? 'dia' : 'dias'}`;
  };

  const getActionIcon = (action: string) => {
    const act = String(action).toUpperCase();
    if (act.includes('CANCEL')) {
      return {
        icon: AlertCircle,
        color: 'bg-rose-500/10 text-rose-400',
        dotColor: '#ef4444',
      };
    }
    if (act.includes('RESERV')) {
      return {
        icon: Calendar,
        color: 'bg-amber-500/10 text-amber-300',
        dotColor: '#f59e0b',
      };
    }
    if (act.includes('VEND')) {
      return {
        icon: Tag,
        color: 'bg-emerald-500/10 text-emerald-400',
        dotColor: '#22c55e',
      };
    }
    if (act.includes('CONTRACT') || act.includes('CONTRATO')) {
      return {
        icon: FileText,
        color: 'bg-blue-500/10 text-blue-400',
        dotColor: '#3b82f6',
      };
    }
    if (act.includes('CLIENT')) {
      return {
        icon: UserPlus,
        color: 'bg-purple-500/10 text-purple-400',
        dotColor: '#a855f7',
      };
    }
    if (act.includes('PAG') || act.includes('COMMISSION')) {
      return {
        icon: Wallet,
        color: 'bg-violet-500/10 text-violet-400',
        dotColor: '#8b5cf6',
      };
    }
    return {
      icon: FileText,
      color: 'bg-[var(--bg-card-alt)] text-[var(--text-secondary)]',
      dotColor: '#64748b',
    };
  };

  const totalLotes =
    stats.available + stats.reserved + stats.sold + stats.paid;

  return (
    <div className="dashboard-premium dashboard-premium--compact sv-page relative flex flex-col overflow-hidden">
      <div className="dash-page-inner p-3 md:p-4 lg:p-5 flex-1 max-w-full w-full mx-auto min-w-0">
        <header className="dash-header">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl md:text-2xl font-semibold text-[var(--text-primary)] tracking-tight"
            >
              {getGreeting()}, {user?.name?.split(' ')[0] || 'Admin'}{' '}
              <span className="inline-block">👋</span>
            </motion.h1>
            <p className="text-[var(--text-muted)] text-sm mt-0.5">
              Bem-vindo ao painel de gestão da sua loteadora
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-[var(--text-primary)] font-mono text-lg font-semibold tabular-nums">
                {currentTime.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
              <p className="text-[11px] text-[var(--text-muted)] capitalize max-w-[220px]">
                {formatDateBR(currentTime)}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-card)]/90 px-2 py-1.5">
              <label
                htmlFor="project-select"
                className="text-[var(--text-muted)] text-[10px] font-semibold uppercase tracking-wide pl-1"
              >
                Empreendimento
              </label>
              <select
                id="project-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-[var(--bg-input)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm py-1 px-2 rounded-md focus:outline-none focus:border-blue-500 min-w-[160px] max-w-[220px]"
              >
                <option value="">Todos os empreendimentos</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {showEnterpriseValues ? (
          <>
            <div className="dash-kpi-primary">
              <DashboardTopKpi
                title="Valor global"
                value={stats.globalEnterpriseTotal}
                icon={Building2}
                color="#6366f1"
                loading={loading}
                isCurrency
                subtitle="Todos os empreendimentos permitidos"
              />
              {selectedProjectId ? (
                <DashboardTopKpi
                  title="Valor do empreendimento"
                  value={stats.enterpriseTotal}
                  icon={Building2}
                  color="#3b82f6"
                  loading={loading}
                  isCurrency
                  subtitle={
                    projects.find((p) => p.id === selectedProjectId)?.name ||
                    `${totalLotes} lotes`
                  }
                />
              ) : null}
              <DashboardTopKpi
                title="Valor disponível"
                value={stats.availableValue}
                icon={DollarSign}
                color="#10b981"
                loading={loading}
                isCurrency
                subtitle={`${stats.available} lotes disponíveis`}
              />
              <DashboardTopKpi
                title="Valor reservado"
                value={stats.reservedValue}
                icon={Calendar}
                color="#f59e0b"
                loading={loading}
                isCurrency
                subtitle={`${stats.reserved} lotes reservados`}
              />
              <DashboardTopKpi
                title="Valor vendido"
                value={stats.soldValue}
                icon={Tag}
                color="#ef4444"
                loading={loading}
                isCurrency
                subtitle={`${stats.sold + stats.paid} lotes vendidos/quitados`}
              />
            </div>

            <div className="dash-kpi-secondary">
              <DashboardMetricKpi
                title="Lotes disponíveis"
                value={stats.available}
                icon={DollarSign}
                color="#10b981"
                loading={loading}
                subtitle={formatEnterpriseCurrency(stats.availableValue)}
              />
              <DashboardMetricKpi
                title="Lotes reservados"
                value={stats.reserved}
                icon={Calendar}
                color="#f59e0b"
                loading={loading}
                subtitle={formatEnterpriseCurrency(stats.reservedValue)}
              />
              <DashboardMetricKpi
                title="Lotes vendidos"
                value={stats.sold + stats.paid}
                icon={Tag}
                color="#ef4444"
                loading={loading}
                subtitle={formatEnterpriseCurrency(stats.soldValue)}
              />
              <DashboardMetricKpi
                title="Recebido no mês"
                value={stats.recebimentos_mes}
                icon={TrendingUp}
                color="#10b981"
                loading={loading}
                subtitle="Mês corrente"
              />
              <DashboardMetricKpi
                title="A receber"
                value={stats.a_receber}
                icon={FileText}
                color="#3b82f6"
                loading={loading}
                subtitle="Parcelas pendentes"
              />
              <DashboardMetricKpi
                title="Inadimplência"
                value={stats.inadimplencia}
                icon={AlertCircle}
                color="#ef4444"
                loading={loading}
                subtitle="Valor em atraso"
              />
            </div>
          </>
        ) : null}

        <div className="dash-bottom-grid">
          <div className="dash-compact-panel">
            <div className="px-4 py-2.5 border-b border-[var(--border-subtle)] shrink-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Resumo financeiro</h2>
            </div>
            <div className="dash-compact-scroll p-3">
              <FinancialSummaryCard
                loading={loading}
                entradas={stats.total_entradas}
                saidas={stats.total_saidas}
                saldo={stats.saldo_atual}
                margemPercent={stats.margem_percent}
                formatCurrency={formatCurrency}
              />
            </div>
          </div>

          <div className="dash-compact-panel">
            <div className="px-4 py-2.5 flex items-center justify-between border-b border-[var(--border-subtle)] shrink-0">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">Atividades recentes</h2>
              <Link
                href="/logs"
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                Ver todas
              </Link>
            </div>
            <div className="dash-compact-scroll custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-24">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                </div>
              ) : activities.length > 0 ? (
                activities.slice(0, 4).map((activity, idx) => {
                  const { icon, color, dotColor } = getActionIcon(activity.action);
                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <DashboardActivityItem
                        time={formatTimeAgo(activity.created_at)}
                        title={activity.details?.title || activity.action}
                        subtitle={
                          activity.details?.subtitle ||
                          `Por ${activity.users?.full_name || 'Usuário'}`
                        }
                        icon={icon}
                        iconColor={color}
                        dotColor={dotColor}
                      />
                    </motion.div>
                  );
                })
              ) : (
                <DashboardEmptyActivities />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
