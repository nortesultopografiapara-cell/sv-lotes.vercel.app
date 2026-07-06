'use client';

import { FileArchive, Link2, Sparkles, Unlink } from 'lucide-react';
import type { LegacyContractListSummary } from '@/lib/legacy-contracts/types';

type LegacyContractSummaryCardsProps = {
  summary: LegacyContractListSummary;
};

export function LegacyContractSummaryCards({ summary }: LegacyContractSummaryCardsProps) {
  const cards = [
    {
      label: 'Total de contratos',
      value: summary.total,
      icon: FileArchive,
      color: 'text-[var(--color-primary)]',
    },
    {
      label: 'Vínculo automático',
      value: summary.automatic,
      icon: Sparkles,
      color: 'text-emerald-400',
    },
    {
      label: 'Vínculo manual',
      value: summary.manual,
      icon: Link2,
      color: 'text-sky-400',
    },
    {
      label: 'Sem vínculo',
      value: summary.unlinked,
      icon: Unlink,
      color: 'text-amber-400',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" data-testid="legacy-contracts-summary">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--text-muted)]">{card.label}</p>
              <p className="text-2xl font-bold text-[var(--text-primary)] mt-1">{card.value}</p>
            </div>
            <card.icon className={`w-8 h-8 ${card.color} opacity-80`} />
          </div>
        </div>
      ))}
    </div>
  );
}
