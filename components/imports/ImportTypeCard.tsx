'use client';

import {
  Users,
  UserSquare2,
  ShoppingCart,
  CalendarClock,
  FileText,
  Paperclip,
  type LucideIcon,
} from 'lucide-react';
import type { ImportModuleDefinition, ImportModuleId } from '@/lib/imports/types';

const MODULE_ICONS: Record<ImportModuleId, LucideIcon> = {
  customers: Users,
  brokers: UserSquare2,
  sales: ShoppingCart,
  installments: CalendarClock,
  legacy_contracts: FileText,
  attachments: Paperclip,
};

type ImportTypeCardProps = {
  module: ImportModuleDefinition;
  selected?: boolean;
  onSelect: (id: ImportModuleId) => void;
};

export function ImportTypeCard({ module, selected, onSelect }: ImportTypeCardProps) {
  const Icon = MODULE_ICONS[module.id];
  const isDevelopment = module.status === 'in_development';
  const isAvailable = module.status === 'available';

  return (
    <button
      type="button"
      data-testid={`import-type-card-${module.id}`}
      onClick={() => onSelect(module.id)}
      className={`text-left rounded-xl border p-4 transition-all hover:border-[var(--color-primary)]/40 ${
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]/30'
          : 'border-[var(--border-color)] bg-[var(--bg-card)]'
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            isDevelopment
              ? 'bg-slate-500/10 text-slate-400'
              : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
          }`}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-[var(--text-primary)]">{module.title}</h3>
            <span
              className={`text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full shrink-0 ${
                isAvailable
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : isDevelopment
                    ? 'bg-slate-500/15 text-slate-400'
                    : 'bg-amber-500/15 text-amber-400'
              }`}
            >
              {module.statusLabel}
            </span>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1 leading-relaxed">
            {module.description}
          </p>
        </div>
      </div>
    </button>
  );
}
