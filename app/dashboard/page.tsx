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
  FileSpreadsheet,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import {
  canViewEnterpriseValues,
  canExportLotReport,
  isBrokerRole,
  isMasterConsoleRole,
  isOwnerRole,
} from '@/lib/rolePermissions';
import {
  filterProjectsForUser,
  filterRowsByOwnerProjects,
  getOwnerAllowedProjectIdsForModule,
  loadOwnerAccessContext,
  resolveCashMovementProjectId,
  resolveCommissionProjectId,
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
import { fetchAllEnterpriseLotRows } from '@/lib/enterpriseValueFetch';
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
import { LotReportExportModal } from '@/components/dashboard/LotReportExportModal';
import {
  buildLotReportFilename,
  downloadLotReportExcel,
  downloadLotReportPdf,
} from '@/lib/lotReportExport';
import { FinancialIntegrationDashboardCard } from '@/components/finance/FinancialIntegrationPanel';
import { isBankingModuleEnabledForUi } from '@/lib/banking/config';
import type { AsaasIntegrationConfigResponse } from '@/lib/finance/asaasIntegrationConfig';
import {
  assertOwnerProjectExportAllowed,
  fetchLotReportForExport,
} from '@/lib/lotReportExport/fetchLotReportData';
import type { LotReportFormat, LotReportOptions } from '@/lib/lotReportExport/types';

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
  
  if (isMasterConsoleRole(user?.role)) {
    // /dashboard permanece como Painel SaaS legado (empresas, assinaturas, cobranças SaaS).
    // O Painel Executivo SV Topografia vive em /master.
    return <SuperAdminDashboard user={user} />;
  }
  
  return <OperationalDashboard user={user} />;
}

function OperationalDashboard({ user }: { user: any }) {
  const router = useRouter();
  const { setGisSelectedProject, clearGisSelectedProject } = useGisSelectedProject();
  const showEnterpriseValues =
    canViewEnterpriseValues(user?.role) || isOwnerRole(user?.role);
  const canExportLots = canExportLotReport(user?.role);
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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportInitialFormat, setExportInitialFormat] =
    useState<LotReportFormat>('excel');
  const [exportLoading, setExportLoading] = useState(false);
  const [tenantCompany, setTenantCompany] = useState<{
    name?: string;
    fantasy_name?: string;
    logo_url?: string | null;
  } | null>(null);
  const bankingUiEnabled = isBankingModuleEnabledForUi();
  const [asaasAccessAvailable, setAsaasAccessAvailable] = useState(false);
  const [asaasIntegration, setAsaasIntegration] = useState<AsaasIntegrationConfigResponse | null>(null);
  const [asaasLoading, setAsaasLoading] = useState(false);

  useEffect(() => {
    if (isBrokerRole(user?.role)) {
      router.replace('/map');
    }
  }, [user?.role, router]);

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
    async function loadCompany() {
      if (!user?.tenant_id) return;
      const { data } = await supabase
        .from('companies')
        .select('name, fantasy_name, logo_url')
        .eq('id', user.tenant_id)
        .maybeSingle();
      if (data) setTenantCompany(data);
    }
    if (canExportLots) void loadCompany();
  }, [user?.tenant_id, canExportLots]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadAsaasIntegration() {
      if (!bankingUiEnabled || !user?.tenant_id) return;
      setAsaasLoading(true);
      try {
        const res = await fetch('/api/finance/asaas/integration', { credentials: 'include' });
        if (res.status === 403 || res.status === 404) {
          setAsaasAccessAvailable(false);
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          setAsaasAccessAvailable(true);
          setAsaasIntegration(json.integration as AsaasIntegrationConfigResponse);
        }
      } catch {
        /* dashboard card opcional */
      } finally {
        setAsaasLoading(false);
      }
    }
    void loadAsaasIntegration();
  }, [bankingUiEnabled, user?.tenant_id]);

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

        let projectsQuery = supabase.from('projects').select('id, name');
        projectsQuery = applyTenantFilter(projectsQuery, rlsCtx, 'projects');

        const [{ data: projectsData }, lotFetch] = await Promise.all([
          projectsQuery,
          fetchAllEnterpriseLotRows(supabase, rlsCtx),
        ]);

        const ownerCtx = await loadOwnerAccessContext(supabase, user, resolvedTenantId);
        const ownerDashboardProjectIds = ownerCtx.isOwner
          ? getOwnerAllowedProjectIdsForModule(ownerCtx.rows, 'dashboard')
          : ownerCtx.allowedProjectIds;
        const visibleProjects = filterProjectsForUser(
          user,
          projectsData || [],
          ownerDashboardProjectIds,
        );

        if (visibleProjects.length > 0) {
          setProjects(visibleProjects);
        } else {
          setProjects([]);
        }

        const allLots = lotFetch.rows;
        if (lotFetch.wouldTruncateWithoutPagination) {
          console.info('[DASHBOARD] enterprise lots paginated', {
            rowsFetched: lotFetch.rowsFetched,
            exactCount: lotFetch.exactCount,
            pagesFetched: lotFetch.pagesFetched,
          });
        }

        const ownerScopedLots = filterRowsByOwnerProjects(
          allLots,
          ownerDashboardProjectIds,
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
              ownerDashboardProjectIds,
              resolveReceiptProjectId,
            ).filter((r) =>
              selectedProjectId
                ? receiptMatchesProject(r, selectedProjectId, selectedProjectName)
                : true,
            );
            const scopedCash = filterRowsByOwnerProjects(
              cashData || [],
              ownerDashboardProjectIds,
              resolveCashMovementProjectId,
            ).filter((c) => {
              if (!selectedProjectId) return true;
              const name =
                c.projects?.name ||
                c.sales?.projects?.name ||
                c.contracts?.projects?.name ||
                '';
              return name === selectedProjectName;
            });
            const scopedComms = filterRowsByOwnerProjects(
              commsData || [],
              ownerDashboardProjectIds,
              resolveCommissionProjectId,
            ).filter((c) => {
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

  const selectedProjectLabel = selectedProjectId
    ? projects.find((p) => p.id === selectedProjectId)?.name || 'Empreendimento'
    : 'Todos os empreendimentos';

  const openExportModal = (format: LotReportFormat) => {
    setExportInitialFormat(format);
    setExportModalOpen(true);
  };

  const handleGenerateLotReport = async (options: LotReportOptions) => {
    if (!user) return;
    setExportLoading(true);
    try {
      const rlsCtx = await resolveRlsContext(user);
      const { result, projectLabel, allowedProjectIds } = await fetchLotReportForExport(
        supabase,
        user,
        rlsCtx,
        {
          selectedProjectId: selectedProjectId || undefined,
          options: {
            groupBy: options.groupBy,
            sortBy: options.sortBy,
            filters: options.filters,
          },
        },
      );

      assertOwnerProjectExportAllowed(selectedProjectId || undefined, allowedProjectIds);

      if (result.rows.length === 0) {
        alert('Nenhum lote encontrado com os filtros selecionados.');
        return;
      }

      const issuedAt = new Date();
      const meta = {
        companyName:
          tenantCompany?.fantasy_name ||
          tenantCompany?.name ||
          'Empresa',
        companyLogoUrl: tenantCompany?.logo_url,
        projectLabel,
        issuedAt,
        groupBy: options.groupBy,
        sortBy: options.sortBy,
      };
      const filename = buildLotReportFilename(projectLabel, options.format, issuedAt);

      if (options.format === 'excel') {
        await downloadLotReportExcel(result, meta, filename);
      } else {
        await downloadLotReportPdf(result, meta, filename);
      }

      setExportModalOpen(false);
    } catch (err) {
      console.error('LOT_REPORT_EXPORT_ERROR', err);
      alert(
        err instanceof Error
          ? err.message
          : 'Erro ao gerar relatório de lotes.',
      );
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="dashboard-premium dashboard-premium--compact sv-page sv-page--scroll-y relative flex flex-col min-h-0">
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
            {canExportLots ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openExportModal('excel')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 text-xs font-semibold hover:bg-emerald-500/20 transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Exportar Excel
                </button>
                <button
                  type="button"
                  onClick={() => openExportModal('pdf')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 text-xs font-semibold hover:bg-red-500/20 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Exportar PDF
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <LotReportExportModal
          open={exportModalOpen}
          initialFormat={exportInitialFormat}
          projectLabel={selectedProjectLabel}
          loading={exportLoading}
          onClose={() => {
            if (!exportLoading) setExportModalOpen(false);
          }}
          onGenerate={handleGenerateLotReport}
        />

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
                isCurrency
                subtitle="Mês corrente"
              />
              <DashboardMetricKpi
                title="A receber"
                value={stats.a_receber}
                icon={FileText}
                color="#3b82f6"
                loading={loading}
                isCurrency
                subtitle="Parcelas pendentes"
              />
              <DashboardMetricKpi
                title="Inadimplência"
                value={stats.inadimplencia}
                icon={AlertCircle}
                color="#ef4444"
                loading={loading}
                isCurrency
                subtitle="Valor em atraso"
              />
            </div>
          </>
        ) : null}

        <div className="dash-bottom-grid">
          {bankingUiEnabled && asaasAccessAvailable ? (
            <FinancialIntegrationDashboardCard
              loading={asaasLoading}
              connectionStatus={asaasIntegration?.connectionStatus ?? 'DISCONNECTED'}
              webhookActive={Boolean(asaasIntegration?.webhookActive)}
              lastSyncAt={asaasIntegration?.sync.lastAt ?? null}
              chargesCount={asaasIntegration?.sync.chargesCount ?? 0}
            />
          ) : null}
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
            <div className="dash-compact-scroll sv-scrollbar sv-scrollbar-dark">
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
