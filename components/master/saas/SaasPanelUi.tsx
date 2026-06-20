'use client';

import type { ReactNode } from 'react';
import type { SaasPanelView } from '@/lib/masterSaasPanel';
import { formatSaasCashStartAtLabel } from '@/lib/saasFinanceSettings';
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
