'use client';

import Link from 'next/link';
import { Building2, CreditCard, Plus } from 'lucide-react';

type MasterEmptyStateProps = {
  title: string;
  description: string;
  showNewCompany?: boolean;
  showNewSubscription?: boolean;
};

export function MasterEmptyState({
  title,
  description,
  showNewCompany = true,
  showNewSubscription = true,
}: MasterEmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-[var(--color-surface)]/40 px-6 py-14 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 flex items-center justify-center mx-auto mb-5">
        <Building2 className="w-7 h-7 text-[var(--color-primary)]" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {showNewCompany && (
          <Link
            href="/companies?new=1"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[var(--color-primary)] hover:bg-[var(--color-primary-hover)] text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Empresa
          </Link>
        )}
        {showNewSubscription && (
          <Link
            href="/plans"
            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border border-white/15 text-slate-200 hover:bg-white/5 text-sm font-semibold transition-colors"
          >
            <CreditCard className="w-4 h-4" />
            Nova Assinatura
          </Link>
        )}
      </div>
    </div>
  );
}
