'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SaasPanelView } from '@/lib/masterSaasPanel';
import { formatSaasCashStartAtLabel } from '@/lib/saasFinanceSettings';
import type { SaasCashHiddenByMarcoSummary } from '@/lib/saasCashMovements';
import {
  readSaasCashHiddenAlertExpanded,
  writeSaasCashHiddenAlertExpanded,
} from '@/lib/saasCashHiddenAlertPrefs';
import { formatSaasCurrency } from '@/lib/companyPricing';
import {
  LayoutDashboard,
  Building2,
  Receipt,
  Zap,
  Wallet,
} from 'lucide-react';

const NAV: { id: SaasPanelView; label: string; icon: ReactNode; superAdminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'empresas', label: 'Empresas', icon: <Building2 className="w-4 h-4" /> },
  { id: 'cobrancas', label: 'Cobranças', icon: <Receipt className="w-4 h-4" /> },
  { id: 'caixa', label: 'Caixa', icon: <Wallet className="w-4 h-4" />, superAdminOnly: true },
  { id: 'automacoes', label: 'Automações', icon: <Zap className="w-4 h-4" /> },
];

type Props = {
  active: SaasPanelView;
  onChange: (view: SaasPanelView) => void;
  isSuperAdmin?: boolean;
};

export function SaasMainNav({ active, onChange, isSuperAdmin = false }: Props) {
  const items = NAV.filter((item) => !item.superAdminOnly || isSuperAdmin);
  return (
    <nav className="flex flex-wrap gap-2 mb-6 p-1 rounded-xl bg-[#11161d] border border-white/5 w-fit">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
            active === item.id
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </nav>
  );
}

export type FinanceMetricTone = 'green' | 'blue' | 'red' | 'amber' | 'teal' | 'purple';

const TONE: Record<
  FinanceMetricTone,
  { bar: string; border: string; iconBg: string; icon: string; value: string }
> = {
  green: {
    bar: 'bg-emerald-500',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/15',
    icon: 'text-emerald-400',
    value: 'text-emerald-50',
  },
  blue: {
    bar: 'bg-blue-500',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/15',
    icon: 'text-blue-400',
    value: 'text-blue-50',
  },
  red: {
    bar: 'bg-rose-500',
    border: 'border-rose-500/30',
    iconBg: 'bg-rose-500/15',
    icon: 'text-rose-400',
    value: 'text-rose-50',
  },
  amber: {
    bar: 'bg-amber-500',
    border: 'border-amber-500/30',
    iconBg: 'bg-amber-500/15',
    icon: 'text-amber-400',
    value: 'text-amber-50',
  },
  teal: {
    bar: 'bg-teal-500',
    border: 'border-teal-500/30',
    iconBg: 'bg-teal-500/15',
    icon: 'text-teal-400',
    value: 'text-teal-50',
  },
  purple: {
    bar: 'bg-purple-500',
    border: 'border-purple-500/30',
    iconBg: 'bg-purple-500/15',
    icon: 'text-purple-400',
    value: 'text-purple-50',
  },
};

export function SaasMetricCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string;
  value: string;
  description?: string;
  icon: ReactNode;
  tone: FinanceMetricTone;
}) {
  const s = TONE[tone];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${s.border} bg-[#11161d] p-5 min-w-0`}
    >
      <div className={`absolute top-0 left-0 right-0 h-1 ${s.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] uppercase tracking-wide text-gray-500 font-semibold">{title}</p>
          <p className={`text-2xl font-bold mt-1 tabular-nums ${s.value}`}>{value}</p>
          {description ? <p className="text-[11px] text-gray-500 mt-1">{description}</p> : null}
        </div>
        <div className={`p-2.5 rounded-xl ${s.iconBg} ${s.icon} shrink-0`}>{icon}</div>
      </div>
    </div>
  );
}

export function SaasFinanceStartAtBanner({ cashStartAt }: { cashStartAt?: string | null }) {
  const label = formatSaasCashStartAtLabel(cashStartAt);
  if (!label) return null;
  return (
    <div className="mb-6 p-3 rounded-lg border border-amber-500/20 bg-amber-500/5 text-amber-100/90 text-sm">
      Financeiro contabilizado a partir de {label}
    </div>
  );
}

function formatHiddenInstant(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type SaasCashHiddenByMarcoAlertProps = {
  cashStartAt?: string | null;
  hiddenByMarco?: SaasCashHiddenByMarcoSummary | null;
  onAdjustMarco?: () => void;
  userId?: string | null;
};

export function SaasCashHiddenByMarcoAlert({
  cashStartAt,
  hiddenByMarco,
  onAdjustMarco,
  userId,
}: SaasCashHiddenByMarcoAlertProps) {
  const marcoLabel = formatSaasCashStartAtLabel(cashStartAt);
  const hiddenCount = hiddenByMarco?.hiddenCount ?? 0;
  const [expanded, setExpanded] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setExpanded(readSaasCashHiddenAlertExpanded(window.localStorage, userId));
    setHydrated(true);
  }, [userId]);

  const setExpandedPersisted = useCallback(
    (next: boolean) => {
      setExpanded(next);
      writeSaasCashHiddenAlertExpanded(window.localStorage, userId, next);
    },
    [userId],
  );

  if (!marcoLabel || hiddenCount <= 0) return null;

  const countLabel =
    hiddenCount === 1
      ? '1 movimentação oculta pelo marco financeiro'
      : `${hiddenCount} movimentação(ões) ocultas pelo marco financeiro`;

  return (
    <div className="rounded-lg border border-amber-500/25 bg-amber-500/8 text-amber-50 text-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-3 py-2.5">
        <p className="text-amber-100/95 text-xs sm:text-sm leading-snug min-w-0">
          <span aria-hidden="true" className="mr-1">
            ⚠️
          </span>
          {countLabel}
          {!expanded ? (
            <>
              {' '}
              <button
                type="button"
                onClick={() => setExpandedPersisted(true)}
                className="text-amber-200 underline underline-offset-2 hover:text-white font-medium whitespace-nowrap"
              >
                Ver detalhes
              </button>
            </>
          ) : null}
        </p>
        {expanded ? (
          <button
            type="button"
            onClick={() => setExpandedPersisted(false)}
            className="shrink-0 self-start sm:self-auto text-xs font-medium text-amber-200/90 hover:text-white underline underline-offset-2"
          >
            Ocultar detalhes
          </button>
        ) : null}
      </div>

      {expanded && hydrated ? (
        <div className="border-t border-amber-500/20 px-3 py-3 space-y-3 text-xs sm:text-sm text-amber-100/90">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <dt className="text-amber-200/70">Valor ignorado no período</dt>
              <dd className="font-semibold text-amber-50 tabular-nums">
                {formatSaasCurrency(hiddenByMarco!.hiddenNet)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-200/70">Entradas ocultas</dt>
              <dd className="font-medium tabular-nums">
                {formatSaasCurrency(hiddenByMarco!.hiddenIncome)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-200/70">Saídas ocultas</dt>
              <dd className="font-medium tabular-nums">
                {formatSaasCurrency(hiddenByMarco!.hiddenExpense)}
              </dd>
            </div>
            <div>
              <dt className="text-amber-200/70">Maior data/hora ignorada</dt>
              <dd>{formatHiddenInstant(hiddenByMarco!.latestHiddenAt)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-amber-200/70">Marco atual</dt>
              <dd>{marcoLabel}</dd>
            </div>
          </dl>
          <p className="text-[11px] sm:text-xs text-amber-100/75 leading-relaxed">
            Os dados não foram apagados — ficam fora do Caixa e da Receita Recebida enquanto forem
            anteriores ao marco. Retroceda o marco e reprocessar cobranças pagas para incluí-los.
          </p>
          {onAdjustMarco ? (
            <button
              type="button"
              onClick={onAdjustMarco}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-3 py-2 rounded-lg border border-amber-400/40 bg-amber-500/15 text-xs font-semibold text-amber-50 hover:bg-amber-500/25"
            >
              Ajustar marco financeiro
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
