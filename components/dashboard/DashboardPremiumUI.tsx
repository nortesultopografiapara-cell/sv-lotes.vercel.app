'use client';

import { memo, type ComponentType, type ReactNode } from 'react';
import CountUp from 'react-countup';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import {
  coerceDashboardKpiNumber,
  formatDashboardKpiPrimaryValue,
  formatDashboardKpiSubtitle,
} from '@/lib/dashboardKpiFormat';

const CHART_TOOLTIP = {
  backgroundColor: 'rgba(15, 20, 28, 0.95)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '10px',
  color: '#f8fafc',
  fontSize: '12px',
  padding: '8px 12px',
};

export function DashboardTopKpi({
  title,
  value,
  total,
  icon: Icon,
  color,
  loading,
  isCurrency,
  subtitle,
}: {
  title: string;
  value: unknown;
  total?: unknown;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  loading?: boolean;
  isCurrency?: boolean;
  subtitle?: unknown;
}) {
  const safeValue = coerceDashboardKpiNumber(value);
  const safeTotal = coerceDashboardKpiNumber(total);
  const safeSubtitle = formatDashboardKpiSubtitle(subtitle);
  const percent =
    safeTotal > 0 && !isCurrency
      ? ((safeValue / safeTotal) * 100).toFixed(1)
      : null;

  return (
    <div className="dash-kpi-top group">
      <div
        className="absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-16 blur-2xl transition-opacity group-hover:opacity-28"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between gap-3 h-full">
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {title}
          </p>
          <h3 className="text-xl xl:text-[1.35rem] font-bold text-[var(--text-primary)] tabular-nums tracking-tight leading-tight">
            {loading ? (
              <span className="dash-skeleton inline-block h-7 w-20" />
            ) : isCurrency ? (
              formatDashboardKpiPrimaryValue(safeValue, true)
            ) : (
              <CountUp end={safeValue} duration={1.2} separator="." decimals={0} />
            )}
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] mt-0.5 truncate">
            {safeSubtitle ||
              (percent ? (
                <span style={{ color }}>
                  {percent}% <span className="text-[var(--text-muted)]">do total</span>
                </span>
              ) : null)}
          </p>
        </div>
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)]"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
    </div>
  );
}

export function DashboardMetricKpi({
  title,
  value,
  icon: Icon,
  color,
  loading,
  trend,
  subtitle,
  isCurrency = false,
}: {
  title: string;
  value: unknown;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  color: string;
  loading?: boolean;
  trend?: unknown;
  subtitle?: unknown;
  /** Quando true, value é exibido como moeda; quando false, como quantidade inteira. */
  isCurrency?: boolean;
}) {
  const safeValue = coerceDashboardKpiNumber(value);
  const safeSubtitle = formatDashboardKpiSubtitle(subtitle);
  const safeTrend =
    trend == null || trend === ''
      ? ''
      : typeof trend === 'string'
        ? trend.trim()
        : String(trend);
  return (
    <div className="dash-kpi-metric relative overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-card)]/80">
          <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
        </div>
      )}
      <div className="flex items-center gap-2.5 h-full">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)]"
          style={{ backgroundColor: `${color}14`, color }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-wider text-[var(--text-muted)] truncate">
            {title}
          </p>
          <p
            className={`tabular-nums truncate mt-0.5 ${
              isCurrency
                ? 'text-base font-bold text-[var(--text-primary)]'
                : 'text-xl font-bold text-[var(--text-primary)]'
            }`}
            style={isCurrency ? undefined : { fontWeight: 700 }}
          >
            {loading ? (
              <span className="dash-skeleton inline-block h-6 w-12" />
            ) : isCurrency ? (
              formatDashboardKpiPrimaryValue(safeValue, true)
            ) : (
              <CountUp end={safeValue} duration={1.2} separator="." decimals={0} />
            )}
          </p>
          {(safeSubtitle || safeTrend) && (
            <p
              className={`truncate flex items-center gap-0.5 ${
                isCurrency
                  ? 'text-[10px] text-[var(--text-muted)]'
                  : 'text-[11px] text-[var(--text-muted)] opacity-75 font-medium tabular-nums'
              }`}
            >
              {safeTrend && <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />}
              {safeSubtitle || safeTrend}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardActivityItem({
  time,
  title,
  subtitle,
  dotColor,
  icon: Icon,
  iconColor,
}: {
  time: string;
  title: string;
  subtitle: string;
  dotColor: string;
  icon: ComponentType<{ className?: string }>;
  iconColor: string;
}) {
  return (
    <div className="flex gap-2.5 items-start px-2 py-1.5 rounded-lg hover:bg-white/[0.03] border border-transparent hover:border-[var(--border-subtle)] transition-all duration-200">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border-subtle)] ${iconColor}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium text-[var(--text-primary)] truncate">{title}</p>
          <span
            className="h-2 w-2 rounded-full shrink-0 mt-1.5"
            style={{ backgroundColor: dotColor }}
            title={dotColor}
          />
        </div>
        <p className="text-[10px] text-[var(--text-muted)] truncate">{subtitle}</p>
        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{time}</p>
      </div>
    </div>
  );
}

export function DashboardEmptyActivities() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[96px] text-center px-3 py-3">
      <div className="w-11 h-11 rounded-xl bg-white/5 border border-[var(--border-subtle)] flex items-center justify-center mb-2.5">
        <span className="text-xl opacity-60">📋</span>
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhuma atividade recente</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        Vendas, reservas e contratos aparecerão aqui
      </p>
    </div>
  );
}

export function DashboardActivitiesError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[96px] text-center px-3 py-3">
      <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-2.5">
        <span className="text-xl opacity-80">!</span>
      </div>
      <p className="text-sm font-medium text-rose-300">Não foi possível carregar as atividades</p>
      <p className="text-xs text-[var(--text-muted)] mt-1 max-w-[240px]">
        {message || 'Erro ao consultar o histórico operacional.'}
      </p>
    </div>
  );
}

export function MapLoadingSkeleton() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg-main)] gap-3">
      <div className="w-full h-full max-w-md dash-skeleton opacity-30" />
      <Loader2 className="h-7 w-7 animate-spin text-blue-400 relative z-10 -mt-32" />
      <p className="text-xs text-[var(--text-muted)] relative z-10">Carregando mapa…</p>
    </div>
  );
}

export const SalesAreaChart = memo(function SalesAreaChart({
  data,
}: {
  data: { name: string; vgv: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="dashColorVgv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#64748b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => (v >= 1000 ? `R$${(v / 1000).toFixed(0)}k` : `R$${v}`)}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP}
          formatter={(value: number) => [
            `R$ ${Number(value).toLocaleString('pt-BR')}`,
            'VGV',
          ]}
        />
        <Area
          type="monotone"
          dataKey="vgv"
          stroke="#10b981"
          strokeWidth={2.5}
          fill="url(#dashColorVgv)"
          activeDot={{ r: 5, fill: '#10b981', stroke: '#0a0d14', strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
});

export const LotsDonutChart = memo(function LotsDonutChart({
  pieData,
  totalLotes,
}: {
  pieData: { name: string; value: number; color: string }[];
  totalLotes: number;
}) {
  return (
    <div className="dash-donut">
      <div className="dash-donut-chart">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={34}
              outerRadius={50}
              paddingAngle={3}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[8px] text-[var(--text-muted)] uppercase tracking-wider">Total</span>
          <span className="text-lg font-bold text-[var(--text-primary)] leading-tight">{totalLotes}</span>
        </div>
      </div>
      <div className="dash-donut-legend">
        {pieData.map((d) => (
          <div key={d.name} className="dash-donut-legend-item">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-[11px] text-[var(--text-secondary)] truncate">{d.name}</span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] pl-[14px] block leading-tight">
              {d.value} ({totalLotes > 0 ? ((d.value / totalLotes) * 100).toFixed(1) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

export const CashFlowBarChartPanel = memo(function CashFlowBarChartPanel({
  data,
}: {
  data: { name: string; entradas: number; saidas: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barSize={22} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#64748b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) =>
            Number(v) >= 1000 ? `R$${(Number(v) / 1000).toFixed(0)}k` : `R$${Number(v)}`
          }
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={CHART_TOOLTIP}
          formatter={(value, name) => [
            `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            String(name),
          ]}
        />
        <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
        <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[6, 6, 0, 0]} />
        <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
});

export function FinancialSummaryCard({
  loading,
  entradas,
  saidas,
  saldo,
  margemPercent,
  formatCurrency,
}: {
  loading: boolean;
  entradas: number;
  saidas: number;
  saldo: number;
  margemPercent: number;
  formatCurrency: (n: number) => string;
}) {
  const positive = saldo >= 0;
  const margemClamped = Math.min(100, Math.max(0, margemPercent));
  const margemLabel = loading
    ? '—'
    : `${margemPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

  return (
    <div className="dash-finance-summary-body">
      <div className="dash-finance-metrics">
        <div className="dash-finance-metric">
          <span className="dash-finance-metric-label">Entradas</span>
          <span className="dash-finance-metric-value text-emerald-400">
            {loading ? '—' : formatCurrency(entradas)}
          </span>
        </div>
        <div className="dash-finance-metric">
          <span className="dash-finance-metric-label">Saídas</span>
          <span className="dash-finance-metric-value text-rose-400">
            {loading ? '—' : formatCurrency(saidas)}
          </span>
        </div>
        <div className="dash-finance-metric">
          <span className="dash-finance-metric-label">Saldo</span>
          <span
            className={`dash-finance-metric-value flex items-center gap-0.5 ${positive ? 'text-blue-400' : 'text-rose-400'}`}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />
            )}
            {loading ? '—' : formatCurrency(saldo)}
          </span>
        </div>
        <div className="dash-finance-metric">
          <span className="dash-finance-metric-label">Margem</span>
          <span className="dash-finance-metric-value text-[var(--text-primary)]">{margemLabel}</span>
        </div>
      </div>
      <div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${positive ? 'bg-gradient-to-r from-blue-600 to-blue-400' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
            style={{ width: `${margemClamped}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function ChartCardShell({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="dash-chart-card">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">{title}</h3>
        {action}
      </div>
      <div className="dash-chart-body">{children}</div>
    </div>
  );
}
