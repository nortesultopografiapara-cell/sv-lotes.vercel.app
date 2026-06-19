'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

type MenuCoords = {
  top: number;
  left: number;
  minWidth: number;
};

export function SaasActionsDropdown({ items, label = 'Ações' }: Props) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<MenuCoords>({ top: 0, left: 0, minWidth: 200 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updatePosition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = menuRef.current?.offsetHeight ?? items.length * 36 + 16;
    let left = rect.right - menuWidth;
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight - 8) {
      top = Math.max(8, rect.top - menuHeight - 4);
    }

    setCoords({ top, left, minWidth: menuWidth });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', close);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);

    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, items.length]);

  const menu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="fixed z-[9999] rounded-xl border border-white/10 bg-[#11161d] py-1 shadow-2xl"
            style={{
              top: coords.top,
              left: coords.left,
              minWidth: coords.minWidth,
            }}
          >
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
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-[12px] text-gray-200 hover:bg-white/5"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </>
  );
}
