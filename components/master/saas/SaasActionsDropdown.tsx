'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export type SaasActionItem = {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
};

type Props = {
  items: SaasActionItem[];
  label?: string;
};

export function SaasActionsDropdown({ items, label = 'Ações' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-gray-200 hover:bg-white/5"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div className="absolute right-0 z-50 mt-1 min-w-[180px] rounded-xl border border-white/10 bg-[#11161d] py-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`w-full text-left px-3 py-2 text-[12px] hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed ${
                item.tone === 'danger' ? 'text-rose-300' : 'text-gray-200'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
