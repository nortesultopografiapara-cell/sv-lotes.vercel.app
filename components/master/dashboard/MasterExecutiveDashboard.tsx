'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  FolderKanban,
  Lock,
  Mail,
  Map as MapIcon,
  Plug,
  RefreshCw,
  ScrollText,
  Settings,
  Share2,
  Tag,
  Users,
  Wallet,
  Wrench,
  Truck,
  Car,
  Briefcase,
  Globe,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '@/lib/supabase';
import {
  exportMasterDashboardCsv,
  loadMasterDashboardData,
  type MasterDashboardAlert,
  type MasterDashboardData,
} from '@/lib/masterDashboardData';
import { SaasFinanceStartAtBanner } from '@/components/master/saas/SaasPanelUi';
import { isPlatformAdmin } from '@/lib/rls';
import styles from './masterExecutiveDashboard.module.css';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function pct(part: number, total: number): string {
  if (total <= 0) return '—';
  return `${((part / total) * 100).toFixed(1)}% do total`;
}

function firstName(full?: string | null): string {
  const part = String(full || '').trim().split(/\s+/)[0];
  return part || 'Administrador';
}

function greetingPrefix(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function alertIcon(alert: MasterDashboardAlert) {
  switch (alert.id) {
    case 'no-email':
      return <Mail />;
    case 'inadimplente':
    case 'expired-subscription':
      return <Lock />;
    case 'no-projects':
      return <MapIcon />;
    case 'no-users':
      return <Users />;
    default:
      return <AlertTriangle />;
  }
}

function alertClass(severity: MasterDashboardAlert['severity']) {
  if (severity === 'danger') return styles.alertDanger;
  if (severity === 'warning') return styles.alertWarning;
  return styles.alertInfo;
}

function planBadgeStyle(plan: string): { background: string; color: string; borderColor: string } {
  if (plan === 'PROFISSIONAL') {
    return { background: '#f5f3ff', color: '#7c3aed', borderColor: '#ddd6fe' };
  }
  if (plan === 'BUSINESS') {
    return { background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' };
  }
  if (plan === 'PERSONALIZADO') {
    return { background: '#fffbeb', color: '#d97706', borderColor: '#fde68a' };
  }
  return { background: '#ecfdf5', color: '#059669', borderColor: '#a7f3d0' };
}

function DashboardSkeleton() {
  return (
    <div className={styles.skeletonPage} aria-busy="true" aria-label="Carregando dashboard">
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`a-${i}`} className={styles.skeletonCard} />
        ))}
      </div>
      <div className={styles.skeletonGrid}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`b-${i}`} className={styles.skeletonCard} />
        ))}
      </div>
      <div className={styles.skeletonWide} />
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  icon,
  iconClass,
  currency,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  iconClass: string;
  currency?: boolean;
}) {
  return (
    <article className={styles.kpiCard}>
      <div className={styles.kpiTop}>
        <p className={styles.kpiTitle}>{title}</p>
        <span className={`${styles.kpiIcon} ${iconClass}`}>{icon}</span>
      </div>
      <div>
        <p className={`${styles.kpiValue} ${currency ? styles.kpiValueCurrency : ''}`}>{value}</p>
        <p className={styles.kpiHint}>{hint}</p>
      </div>
    </article>
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link href={href} className={styles.quickBtn}>
      <span className={styles.quickIcon}>
        <Icon />
      </span>
      {label}
    </Link>
  );
}

const TOPOGRAPHY_LINKS = [
  { href: '/master/topography/projects', label: 'Projetos', icon: FolderKanban },
  { href: '/master/topography/budgets', label: 'Orçamentos', icon: FileSpreadsheet },
  { href: '/master/topography/finance', label: 'Financeiro', icon: Briefcase },
  { href: '/master/topography/operations', label: 'Operação', icon: Wrench },
  { href: '/master/topography/equipment', label: 'Equipamentos', icon: Truck },
  { href: '/master/topography/vehicles', label: 'Veículos', icon: Car },
] as const;

const COMMERCIAL_LINKS = [
  { href: '/master/crm', label: 'CRM', icon: Users },
  { href: '/master/landing-pages', label: 'Landing Pages', icon: Globe },
  { href: '/master/affiliates', label: 'Afiliados', icon: Share2 },
] as const;

/**
 * Dashboard Executivo V2 — somente Master + feature flag.
 * Reutiliza loadMasterDashboardData (sem novas APIs).
 */
export default function MasterExecutiveDashboard({ user }: { user: any }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<MasterDashboardData | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await loadMasterDashboardData(supabase);
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
    if (!isPlatformAdmin(user?.role)) {
      router.push('/dashboard/operational');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const data = await loadMasterDashboardData(supabase);
        if (cancelled) return;
        setDashboard(data);
        setLoadError(data.errors.length > 0 ? data.errors.join(' · ') : null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Falha ao carregar dashboard';
        setLoadError(msg);
        setDashboard(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, router]);

  const stats = dashboard?.stats;
  const hasRevenue = useMemo(
    () => dashboard?.revenueByMonth.some((m) => m.value > 0) ?? false,
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
      <div className={styles.page}>
        <div className={styles.errorPanel}>
          <AlertTriangle width={36} height={36} />
          <p>{loadError}</p>
          <button type="button" className={styles.toolBtn} onClick={() => void loadData()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard || !stats) return null;

  const planChartData = dashboard.planDistribution
    .filter((p) => p.count > 0)
    .map((p) => ({ name: p.tier, value: p.count, color: p.color }));

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <div className={styles.welcome}>
          <p className={styles.welcomeEyebrow}>Painel Executivo · SV Topografia &amp; Projetos</p>
          <h2 className={styles.welcomeTitle}>
            {greetingPrefix()}, {firstName(user?.name)}!
          </h2>
          <p className={styles.welcomeSub}>
            Resumo do SaaS SV LOTES e visão institucional da SV Topografia &amp; Projetos.
          </p>
        </div>
        <div className={styles.toolbarActions}>
          <button type="button" className={styles.toolBtn} onClick={handleExport}>
            <ExternalLink width={14} height={14} aria-hidden />
            Exportar
          </button>
          <button type="button" className={styles.toolBtn} onClick={() => void loadData()}>
            <RefreshCw width={14} height={14} aria-hidden />
            Atualizar
          </button>
        </div>
      </div>

      {loadError ? <div className={styles.banner}>Algumas fontes retornaram aviso: {loadError}</div> : null}

      <SaasFinanceStartAtBanner cashStartAt={dashboard.cashStartAt} />

      <section className={styles.kpiRow} aria-label="Indicadores principais">
        <KpiCard
          title="Empresas Ativas"
          value={stats.activeCompanies}
          hint={pct(stats.activeCompanies, stats.totalCompanies)}
          icon={<CheckCircle />}
          iconClass={styles.iconGreen}
        />
        <KpiCard
          title="Assinaturas"
          value={stats.activeSubscriptions}
          hint="Tenants faturáveis"
          icon={<Tag />}
          iconClass={styles.iconCyan}
        />
        <KpiCard
          title="Receita Mensal (MRR)"
          value={formatCurrency(stats.mrr)}
          hint={stats.mrr === 0 ? 'Sem assinaturas ativas' : 'Recorrente mensal'}
          icon={<DollarSign />}
          iconClass={styles.iconPurple}
          currency
        />
        <KpiCard
          title="Receita Recebida"
          value={formatCurrency(stats.receivedRevenue)}
          hint={
            dashboard.cashStartAt && stats.receivedRevenueHiddenCount > 0
              ? `${stats.receivedRevenueHiddenCount} oculta(s) pelo marco`
              : 'Caixa SaaS'
          }
          icon={<Banknote />}
          iconClass={styles.iconGreen}
          currency
        />
        <KpiCard
          title="Receita a Receber"
          value={formatCurrency(stats.revenueToReceive)}
          hint="Dentro do prazo"
          icon={<Wallet />}
          iconClass={styles.iconSky}
          currency
        />
      </section>

      <section className={styles.kpiRow} aria-label="Indicadores operacionais">
        <KpiCard
          title="Inadimplência"
          value={formatCurrency(stats.delinquencyAmount)}
          hint="Valores vencidos"
          icon={<Lock />}
          iconClass={styles.iconRose}
          currency
        />
        <KpiCard
          title="Empresas Suspensas"
          value={stats.suspendedCompanies}
          hint={pct(stats.suspendedCompanies, stats.totalCompanies)}
          icon={<AlertTriangle />}
          iconClass={styles.iconOrange}
        />
        <KpiCard
          title="Alertas"
          value={dashboard.alerts.length}
          hint={dashboard.alerts.length === 0 ? 'Nenhum alerta' : 'Requer atenção'}
          icon={<AlertTriangle />}
          iconClass={styles.iconAmber}
        />
        <KpiCard
          title="Empresas em teste"
          value={stats.trialCompanies}
          hint="Status operacional Teste"
          icon={<Plug />}
          iconClass={styles.iconSlate}
        />
        <KpiCard
          title="Novos clientes"
          value={stats.newCompaniesThisMonth}
          hint="Cadastrados neste mês"
          icon={<Building2 />}
          iconClass={styles.iconBlue}
        />
      </section>

      <section className={styles.chartsRow} aria-label="Gráficos e alertas">
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Receita dos últimos 6 meses</h3>
          <div className={styles.chartBox}>
            {hasRevenue ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dashboard.revenueByMonth}
                  margin={{ top: 5, right: 12, bottom: 5, left: -8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : `R$ ${v}`)}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#fff',
                      borderColor: '#e2e8f0',
                      borderRadius: 8,
                      color: '#0f172a',
                    }}
                    formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Recebido']}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#1d4ed8"
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: '#1d4ed8', stroke: '#fff', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.emptyChart}>
                <Wallet width={28} height={28} />
                <p>Sem recebimentos nos últimos 6 meses</p>
              </div>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Distribuição de planos</h3>
          {planChartData.length > 0 ? (
            <div className={styles.planLayout}>
              <div className={styles.chartBox} style={{ height: 160, maxWidth: 160 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={planChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={42}
                      outerRadius={68}
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {planChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.planLegend}>
                {dashboard.planDistribution.map((plan) => (
                  <div key={plan.tier} className={styles.planLegendItem}>
                    <div className={styles.planLegendRow}>
                      <span className={styles.planDot} style={{ backgroundColor: plan.color }} />
                      <span className={styles.planName}>{plan.tier}</span>
                    </div>
                    <span className={styles.planMeta}>
                      {plan.count} {plan.count === 1 ? 'empresa' : 'empresas'}
                      {stats.totalCompanies > 0 ? ` (${plan.percent.toFixed(1)}%)` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.emptyChart}>
              <Tag width={28} height={28} />
              <p>Nenhuma empresa cadastrada</p>
            </div>
          )}
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Alertas inteligentes</h3>
          <div className={styles.alertsList}>
            {dashboard.alerts.length === 0 ? (
              <div className={styles.emptyChart}>
                <CheckCircle width={28} height={28} />
                <p>Nenhum alerta no momento</p>
              </div>
            ) : (
              dashboard.alerts.map((a) => (
                <div key={a.id} className={styles.alertItem}>
                  <span className={`${styles.alertIconWrap} ${alertClass(a.severity)}`}>
                    {alertIcon(a)}
                  </span>
                  <div>
                    <p className={styles.alertTitle} style={{ color: 'inherit' }}>
                      {a.title}
                    </p>
                    <p className={styles.alertDesc}>{a.description}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className={styles.bottomRow} aria-label="Empresas, ações e resumo">
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h3 className={styles.cardTitle} style={{ margin: 0 }}>
              Empresas recentes
            </h3>
            <Link href="/companies" className={styles.linkAll}>
              Ver todas
            </Link>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>Plano</th>
                  <th>Status</th>
                  <th>MRR</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.recentCompanies.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8' }}>
                      Nenhuma empresa cadastrada.
                    </td>
                  </tr>
                ) : (
                  dashboard.recentCompanies.map((c) => {
                    const badge = planBadgeStyle(c.planLabel);
                    return (
                      <tr key={c.id}>
                        <td>
                          <div className={styles.companyCell}>
                            <span className={styles.companyAvatar}>{c.name.charAt(0)}</span>
                            <span>
                              <span className={styles.companyName}>{c.name}</span>
                              <span className={styles.companySlug}>{c.slug || '—'}</span>
                            </span>
                          </div>
                        </td>
                        <td>
                          <span
                            className={styles.badge}
                            style={{
                              background: badge.background,
                              color: badge.color,
                              borderColor: badge.borderColor,
                            }}
                          >
                            {c.planLabel}
                          </span>
                        </td>
                        <td>
                          <strong
                            style={{
                              color: c.status === 'Ativa' ? '#059669' : '#e11d48',
                              fontSize: '0.75rem',
                            }}
                          >
                            {c.status}
                          </strong>
                          <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>
                            {c.financialSituation}
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(c.mrr)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Ações rápidas</h3>
          <div className={styles.quickGrid}>
            <QuickLink href="/companies?new=1" icon={Building2} label="Nova Empresa" />
            <QuickLink href="/plans" icon={CreditCard} label="Nova Assinatura" />
            <QuickLink href="/saas-finance" icon={Wallet} label="Financeiro SaaS" />
            <QuickLink href="/master/reports" icon={ExternalLink} label="Relatórios" />
            <QuickLink href="/master/audit" icon={ScrollText} label="Auditoria" />
            <QuickLink href="/users" icon={Users} label="Usuários" />
            <QuickLink href="/master/settings" icon={Settings} label="Configurações" />
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Resumo financeiro</h3>
          <div className={styles.summaryList}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>MRR</span>
              <span className={styles.summaryValue}>{formatCurrency(stats.mrr)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Recebido</span>
              <span className={styles.summaryValue}>{formatCurrency(stats.receivedRevenue)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>A receber</span>
              <span className={styles.summaryValue}>{formatCurrency(stats.revenueToReceive)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Inadimplência</span>
              <span className={styles.summaryValue}>{formatCurrency(stats.delinquencyAmount)}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Empresas ativas</span>
              <span className={styles.summaryValue}>
                {stats.activeCompanies}/{stats.totalCompanies}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.modulesRow} aria-label="Módulos futuros">
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>SV Topografia &amp; Projetos</h3>
          <p className={styles.welcomeSub} style={{ marginBottom: '0.85rem' }}>
            Módulos operacionais em preparação — atalhos para as páginas placeholder do Master.
          </p>
          <div className={styles.moduleGrid}>
            {TOPOGRAPHY_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className={styles.moduleItem}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <item.icon width={14} height={14} aria-hidden />
                  {item.label}
                </span>
                <span className={styles.soon}>Em breve</span>
              </Link>
            ))}
          </div>
        </div>

        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Comercial</h3>
          <p className={styles.welcomeSub} style={{ marginBottom: '0.85rem' }}>
            Pipeline comercial institucional — sem backend nesta fase.
          </p>
          <div className={styles.moduleGrid} style={{ gridTemplateColumns: '1fr' }}>
            {COMMERCIAL_LINKS.map((item) => (
              <Link key={item.href} href={item.href} className={styles.moduleItem}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
                  <item.icon width={14} height={14} aria-hidden />
                  {item.label}
                </span>
                <span className={styles.soon}>Em breve</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
