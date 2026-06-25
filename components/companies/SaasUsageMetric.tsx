'use client';

import {
  formatSaasUsageLabel,
  resolveSaasLimitUsageLevel,
  type SaasLimitUsageLevel,
} from '@/lib/saasPlans';

const USAGE_STYLES: Record<SaasLimitUsageLevel, string> = {
  ok: 'text-white',
  warning: 'text-amber-400',
  danger: 'text-red-400',
  unlimited: 'text-white',
};

const USAGE_BORDER: Record<SaasLimitUsageLevel, string> = {
  ok: 'border-white/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  danger: 'border-red-500/40 bg-red-500/5',
  unlimited: 'border-white/5',
};

export function SaasUsageMetric({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number | null | undefined;
}) {
  const level = resolveSaasLimitUsageLevel(used, limit);
  return (
    <div
      className={`rounded-lg bg-[var(--color-background)]/60 border px-3 py-2.5 ${USAGE_BORDER[level]}`}
    >
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
        {label}
        {level === 'warning' ? (
          <span className="ml-1 text-amber-400">· perto do limite</span>
        ) : null}
        {level === 'danger' ? (
          <span className="ml-1 text-red-400">· limite atingido</span>
        ) : null}
      </p>
      <p className={`text-sm font-semibold flex items-center gap-1.5 ${USAGE_STYLES[level]}`}>
        {formatSaasUsageLabel(used, limit)}
      </p>
    </div>
  );
}
