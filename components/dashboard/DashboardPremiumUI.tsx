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
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-20 blur-3xl transition-opacity group-hover:opacity-35"
        style={{ backgroundColor: color }}
      />
      <div className="relative flex items-start justify-between gap-3 h-full">
        <div className="flex flex-col justify-center min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">
            {title}
          </p>
          <h3 className="text-2xl xl:text-[1.65rem] font-bold text-[var(--text-primary)] tabular-nums tracking-tight">
            {loading ? (
              <span className="dash-skeleton inline-block h-8 w-24" />
            ) : isCurrency ? (
              formatDashboardKpiPrimaryValue(safeValue, true)
            ) : (
              <CountUp end={safeValue} duration={1.2} separator="." decimals={0} />
            )}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-1 truncate">
            {safeSubtitle ||
              (percent ? (
                <span style={{ color }}>
                  {percent}% <span className="text-[var(--text-muted)]">do total</span>
                </span>
              ) : null)}
          </p>
        </div>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--border-subtle)]"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.75} />
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
      <div className="flex items-center gap-3 h-full">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)]"
          style={{ backgroundColor: `${color}14`, color }}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
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
    <div className="flex gap-3 items-start p-2.5 rounded-lg hover:bg-white/[0.03] border border-transparent hover:border-[var(--border-subtle)] transition-all duration-200">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border-subtle)] ${iconColor}`}
      >
        <Icon className="h-4 w-4" />
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
    <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-center px-4 py-8">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-[var(--border-subtle)] flex items-center justify-center mb-3">
        <span className="text-2xl opacity-60">📋</span>
      </div>
      <p className="text-sm font-medium text-[var(--text-secondary)]">Nenhuma atividade recente</p>
      <p className="text-xs text-[var(--text-muted)] mt-1">
        Vendas, reservas e contratos aparecerão aqui
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
    <div className="flex h-full items-center gap-2">
      <div className="relative h-[180px] w-[48%] min-w-[120px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={72}
              paddingAngle={4}
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
          <span className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">Total</span>
          <span className="text-xl font-bold text-[var(--text-primary)]">{totalLotes}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2.5 pr-1">
        {pieData.map((d) => (
          <div key={d.name}>
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-xs text-[var(--text-secondary)]">{d.name}</span>
            </div>
            <span className="text-[10px] text-[var(--text-muted)] pl-4 block">
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
  data: { name: string; recebimentos: number; despesas: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barSize={28}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#64748b"
          fontSize={10}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={CHART_TOOLTIP} />
        <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', color: '#94a3b8' }} />
        <Bar dataKey="recebimentos" name="Recebimentos" fill="#10b981" radius={[6, 6, 0, 0]} />
        <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[6, 6, 0, 0]} />
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

  return (
    <div className="dash-chart-body flex flex-col justify-between gap-3 py-1">
      <div className="space-y-2">
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)]">Entradas</span>
          <span className="font-semibold text-emerald-400 tabular-nums">
            {loading ? '—' : formatCurrency(entradas)}
          </span>
        </div>
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--text-muted)]">Saídas</span>
          <span className="font-semibold text-rose-400 tabular-nums">
            {loading ? '—' : formatCurrency(saidas)}
          </span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t border-[var(--border-subtle)] text-sm">
          <span className="text-[var(--text-secondary)] font-medium">Saldo</span>
          <span
            className={`font-bold tabular-nums flex items-center gap-1 ${positive ? 'text-blue-400' : 'text-rose-400'}`}
          >
            {positive ? (
              <ArrowUpRight className="h-3.5 w-3.5" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5" />
            )}
            {loading ? '—' : formatCurrency(saldo)}
          </span>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-[var(--text-muted)] uppercase tracking-wider font-semibold">Margem</span>
          <span className="text-[var(--text-primary)] font-bold">
            {loading
              ? '—'
              : `${margemPercent.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/5 overflow-hidden">
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
