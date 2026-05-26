'use client';

import {
  Map as MapIcon,
  TrendingUp,
  Calendar,
  Tag,
  DollarSign,
  ExternalLink,
  Crosshair,
  FileText,
  Wallet,
  UserPlus,
  Loader2,
  Maximize2,
  Minimize2,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { calculateFinancialTotals } from '@/lib/financeCashFlow';
import dynamic from 'next/dynamic';
import SuperAdminDashboard from './SuperAdminDashboard';
import { motion } from 'motion/react';
import './dashboard-premium.css';
import {
  DashboardTopKpi,
  DashboardMetricKpi,
  DashboardActivityItem,
  DashboardEmptyActivities,
  MapLoadingSkeleton,
  SalesAreaChart,
  LotsDonutChart,
  CashFlowBarChartPanel,
  FinancialSummaryCard,
  ChartCardShell,
} from '@/components/dashboard/DashboardPremiumUI';

const GISMap = dynamic(() => import('@/components/map/GISMap'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton />,
});

export default function DashboardPage() {
  const { user } = useAuth();
  
  if (user?.role === 'SUPER_ADMIN') {
    return <SuperAdminDashboard user={user} />;
  }
  
  return <OperationalDashboard user={user} />;
}

function OperationalDashboard({ user }: { user: any }) {
  const [stats, setStats] = useState({
    available: 0,
    reserved: 0,
    sold: 0,
    vgv: 0,
    recebimentos_mes: 0,
    a_receber: 0,
    comissoes_pagas: 0,
    comissoes_pendentes: 0,
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
  
  const [mapExpanded, setMapExpanded] = useState(false);
  const [mapRefreshKey, setMapRefreshKey] = useState(0);
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
        const resolvedTenantId = user.tenant_id || (user as any)?.company_id;
        
        let query = supabase.from('blocks').select('project_id, status, price', { count: 'exact' });
        let projectsQuery = supabase.from('projects').select('id, name');
        
        if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
          query = query.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
          projectsQuery = projectsQuery.or(`tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`);
        } else if (user.role !== 'SUPER_ADMIN' && !resolvedTenantId) {
          setLoading(false);
          return;
        }

        const { data, error } = await query;
        const { data: projectsData } = await projectsQuery;

        if (projectsData) {
          setProjects(projectsData);
          if (projectsData.length > 0 && !selectedProjectId) {
             setSelectedProjectId(projectsData[0].id);
          }
        }
        
        if (error) throw error;

        let available = 0;
        let reserved = 0;
        let sold = 0;
        let vgv = 0;

        if (data) {
          data.forEach(lot => {
            if (selectedProjectId && lot.project_id !== selectedProjectId) return;
            
            if (lot.status === 'Disponível') available++;
            if (lot.status === 'Reservado') reserved++;
            if (lot.status === 'Vendido') {
              sold++;
              vgv += Number(lot.price || 0);
            }
          });
        }
        
        let recebimentosMes = 0;
        let comissoesPagas = 0;
        let comissoesPendentes = 0;
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
            if (resolvedTenantId) {
              recQuery = recQuery.or(
                `tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`,
              );
            }
            const { data: receiptsData } = await recQuery;

            let cashQuery = supabase.from('cash_movements').select('*');
            if (resolvedTenantId) {
              cashQuery = cashQuery.or(
                `tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`,
              );
            }
            const { data: cashData } = await cashQuery;

            let commQuery = supabase.from('broker_commissions').select('*');
            if (resolvedTenantId) {
              commQuery = commQuery.or(
                `tenant_id.eq.${resolvedTenantId},company_id.eq.${resolvedTenantId}`,
              );
            }
            const { data: commsData } = await commQuery;

            const totals = calculateFinancialTotals(
              receiptsData || [],
              cashData || [],
              commsData || [],
            );
            totalEntradas = totals.totalEntradas;
            totalSaidas = totals.totalSaidas;
            saldoAtual = totals.saldoFinal;
            margemPercent =
              totalEntradas > 0 ? (saldoAtual / totalEntradas) * 100 : 0;

            console.log('[DASHBOARD] resumo financeiro real', totals);
            console.log('[DASHBOARD] entradas', totalEntradas);
            console.log('[DASHBOARD] saídas', totalSaidas);
            console.log('[DASHBOARD] saldo', saldoAtual);

            (receiptsData || []).forEach((r) => {
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

            (commsData || []).forEach((c) => {
              const st = String(c.status || '').toLowerCase();
              const amt = Number(c.amount) || 0;
              if (['pago', 'paga', 'paid', 'aprovado', 'aprovada'].includes(st)) {
                comissoesPagas += amt;
              } else if (['pendente', 'pending'].includes(st)) {
                comissoesPendentes += amt;
              }
            });
        } catch (e) {
            console.error('[DASHBOARD] erro financeiro', e);
        }

        // Load Activities / Logs
        let logsQuery = supabase.from('logs').select('*, users(full_name)').order('created_at', { ascending: false }).limit(5);
        if (user.role !== 'SUPER_ADMIN' && resolvedTenantId) {
          logsQuery = logsQuery.eq('tenant_id', resolvedTenantId);
        }
        
        const { data: logsData } = await logsQuery;
        setActivities(logsData || []);
        
        setStats({
          available,
          reserved,
          sold,
          vgv,
          recebimentos_mes: recebimentosMes,
          a_receber: aReceber,
          comissoes_pagas: comissoesPagas,
          comissoes_pendentes: comissoesPendentes,
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
      color: 'bg-slate-500/10 text-slate-400',
      dotColor: '#64748b',
    };
  };

  const totalLotes = stats.available + stats.reserved + stats.sold;

  const pieData = useMemo(
    () => [
      { name: 'Disponíveis', value: stats.available, color: '#10b981' },
      { name: 'Reservados', value: stats.reserved, color: '#f59e0b' },
      { name: 'Vendidos', value: stats.sold, color: '#ef4444' },
    ],
    [stats.available, stats.reserved, stats.sold],
  );

  const salesChartData = useMemo(
    () => [
      { name: 'Jan', vgv: stats.vgv * 0.1 },
      { name: 'Fev', vgv: stats.vgv * 0.15 },
      { name: 'Mar', vgv: stats.vgv * 0.2 },
      { name: 'Abr', vgv: stats.vgv * 0.12 },
      { name: 'Mai', vgv: stats.vgv * 0.35 },
      { name: 'Jun', vgv: stats.vgv * 0.08 },
    ],
    [stats.vgv],
  );

  const cashFlowBarData = useMemo(
    () => [
      {
        name: 'Caixa',
        recebimentos: stats.total_entradas,
        despesas: stats.total_saidas,
      },
    ],
    [stats.total_entradas, stats.total_saidas],
  );

  return (
    <div className="dashboard-premium flex-1 overflow-y-auto bg-[#0a0d14] relative flex flex-col">
      <div className="p-4 md:p-6 lg:p-8 flex-1 max-w-[1800px] w-full mx-auto">
        <header className="dash-header">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl md:text-2xl font-semibold text-white tracking-tight"
            >
              {getGreeting()}, {user?.name?.split(' ')[0] || 'Admin'}{' '}
              <span className="inline-block">👋</span>
            </motion.h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Bem-vindo ao painel de gestão da sua loteadora
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <p className="text-white font-mono text-lg font-semibold tabular-nums">
                {currentTime.toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </p>
              <p className="text-[11px] text-slate-500 capitalize max-w-[220px]">
                {formatDateBR(currentTime)}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-[#121820]/90 px-2 py-1.5">
              <label
                htmlFor="project-select"
                className="text-slate-500 text-[10px] font-semibold uppercase tracking-wide pl-1"
              >
                Empreendimento
              </label>
              <select
                id="project-select"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-[#1a232f] border border-white/10 text-white text-sm py-1 px-2 rounded-md focus:outline-none focus:border-blue-500 min-w-[160px] max-w-[220px]"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <div className="dash-kpi-primary">
          <DashboardTopKpi
            title="Lotes disponíveis"
            value={stats.available}
            total={totalLotes}
            icon={MapIcon}
            color="#10b981"
            loading={loading}
          />
          <DashboardTopKpi
            title="Reservados"
            value={stats.reserved}
            total={totalLotes}
            icon={Calendar}
            color="#f59e0b"
            loading={loading}
          />
          <DashboardTopKpi
            title="Vendidos"
            value={stats.sold}
            total={totalLotes}
            icon={Tag}
            color="#ef4444"
            loading={loading}
          />
          <DashboardTopKpi
            title="VGV total"
            value={stats.vgv}
            icon={DollarSign}
            color="#3b82f6"
            loading={loading}
            isCurrency
            subtitle="Valor geral de vendas"
          />
        </div>

        <div className="dash-kpi-secondary">
          <DashboardMetricKpi
            title="Recebimentos do mês"
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
            title="Comissões pagas"
            value={stats.comissoes_pagas}
            icon={Wallet}
            color="#a352ff"
            loading={loading}
            subtitle="Este mês"
          />
          <DashboardMetricKpi
            title="Comissões pendentes"
            value={stats.comissoes_pendentes}
            icon={DollarSign}
            color="#f59e0b"
            loading={loading}
            subtitle="Aguardando pagamento"
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

        <div className={`dash-map-grid ${mapExpanded ? 'relative z-[9998]' : ''}`}>
          <div
            className={`dash-map-panel transition-all duration-300 ${
              mapExpanded ? 'fixed inset-4 z-[9999]' : ''
            }`}
          >
            <div className="px-4 py-2.5 flex justify-between items-center border-b border-white/5 bg-[#12161f]/90 shrink-0">
              <h2 className="text-sm font-semibold text-white">Mapa do empreendimento</h2>
            </div>
            <div className="dash-map-body group">
              {selectedProjectId ? (
                <GISMap
                  projectId={selectedProjectId}
                  activeLayer="satellite"
                  refreshKey={mapRefreshKey}
                  labelsMinZoom={17}
                />
              ) : (
                <MapLoadingSkeleton />
              )}

              <div className="dash-map-toolbar">
                <Link href="/map" className="dash-map-btn">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ver no mapa
                </Link>
                <button
                  type="button"
                  onClick={() => setMapRefreshKey((k) => k + 1)}
                  className="dash-map-btn"
                  title="Centralizar mapa"
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  Centralizar
                </button>
                <button
                  type="button"
                  onClick={() => setMapExpanded(!mapExpanded)}
                  className="dash-map-btn hidden sm:inline-flex"
                  title={mapExpanded ? 'Sair da tela cheia' : 'Tela cheia'}
                >
                  {mapExpanded ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              <div className="dash-map-legend">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Legenda
                </p>
                <div className="space-y-2 text-xs text-slate-300">
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Disponível
                    </span>
                    <span className="font-mono text-white">{loading ? '—' : stats.available}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Reservado
                    </span>
                    <span className="font-mono text-white">{loading ? '—' : stats.reserved}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      Vendido
                    </span>
                    <span className="font-mono text-white">{loading ? '—' : stats.sold}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="dash-activity-panel">
            <div className="px-4 py-3 flex items-center justify-between border-b border-white/5 shrink-0">
              <h2 className="text-sm font-semibold text-white">Atividades recentes</h2>
              <Link
                href="/"
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                Ver todas
              </Link>
            </div>
            <div className="dash-activity-scroll custom-scrollbar">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                </div>
              ) : activities.length > 0 ? (
                activities.map((activity, idx) => {
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

        <div className="dash-charts-grid">
          <ChartCardShell
            title="Vendas por mês"
            action={
              <select className="text-[10px] text-slate-500 bg-transparent border border-white/10 rounded px-1 py-0.5 outline-none">
                <option>Este ano</option>
              </select>
            }
          >
            <SalesAreaChart data={salesChartData} />
          </ChartCardShell>

          <ChartCardShell title="Distribuição de lotes">
            <LotsDonutChart pieData={pieData} totalLotes={totalLotes} />
          </ChartCardShell>

          <ChartCardShell title="Recebimentos x despesas">
            <CashFlowBarChartPanel data={cashFlowBarData} />
          </ChartCardShell>

          <ChartCardShell title="Resumo financeiro">
            <FinancialSummaryCard
              loading={loading}
              entradas={stats.total_entradas}
              saidas={stats.total_saidas}
              saldo={stats.saldo_atual}
              margemPercent={stats.margem_percent}
              formatCurrency={formatCurrency}
            />
          </ChartCardShell>
        </div>
      </div>

      {/* Footer Profissional */}
      <footer className="w-full mt-auto bg-[#11161d]/80 backdrop-blur-md border-t border-white/5 py-5 px-6">
         <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
            <div>
               <p className="text-[#60a5fa] text-[13px] font-semibold tracking-wide">SV LOTES <span className="text-gray-500 font-normal ml-1">- Gestão Imobiliária Inteligente</span></p>
               <p className="text-gray-500 text-[11px] mt-0.5">NORTE E SUL TOPOGRAFIA E SERVIÇOS LTDA-ME - CNPJ: 32.123.456/0001-00</p>
            </div>
            <div className="text-gray-600 text-[11px] font-mono">
               Versão 2.1.0
            </div>
         </div>
      </footer>
    </div>
  );
}
