'use client';

import type { ReactNode } from 'react';

export function MasterCompactKpi({
  title,
  value,
  hint,
  icon,
  accent = 'border-white/10',
}: {
  title: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
}) {
  return (
    <div
      className={`rounded-xl border ${accent} bg-[#11161d] p-4 min-w-0 flex items-start justify-between gap-3`}
    >
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">{title}</p>
        <p className="text-xl font-bold text-white mt-1 tabular-nums truncate">{value}</p>
        {hint ? <p className="text-[11px] text-gray-500 mt-1">{hint}</p> : null}
      </div>
      {icon ? <div className="shrink-0 opacity-80">{icon}</div> : null}
    </div>
  );
}
