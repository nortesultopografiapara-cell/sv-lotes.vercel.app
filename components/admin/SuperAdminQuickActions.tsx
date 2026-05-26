'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Plus, Zap } from 'lucide-react';
import { SUPER_ADMIN_QUICK_ACTIONS } from '@/lib/superAdminNav';

export function SuperAdminQuickActions() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/25 text-sm font-semibold transition-colors"
      >
        <Zap className="w-4 h-4" />
        <span className="hidden sm:inline">Ações rápidas</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="sa-quick-menu absolute right-0 mt-2 w-64 rounded-xl overflow-hidden z-[200] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="px-3 py-2.5 border-b border-white/5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
              Atalhos do painel
            </p>
          </div>
          <div className="p-1.5">
            {SUPER_ADMIN_QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href + action.label}
                href={action.href}
                onClick={() => setOpen(false)}
                className="flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors group"
              >
                <span className="mt-0.5 w-7 h-7 rounded-md bg-white/5 flex items-center justify-center shrink-0 group-hover:bg-[var(--color-primary)]/15">
                  <Plus className="w-3.5 h-3.5 text-slate-400 group-hover:text-[var(--color-primary)]" />
                </span>
                <span>
                  <span className="block text-sm font-medium text-slate-200">{action.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
