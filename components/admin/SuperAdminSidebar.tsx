'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import { SUPER_ADMIN_NAV, isSuperAdminNavActive } from '@/lib/superAdminNav';
import './admin-shell.css';

type SuperAdminSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  isMobile?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onLogout?: () => void;
};

export function SuperAdminSidebar({
  collapsed,
  onToggleCollapsed,
  isMobile,
  isOpen,
  onClose,
  onLogout,
}: SuperAdminSidebarProps) {
  const pathname = usePathname();
  const showLabels = isMobile || !collapsed;

  const content = (
    <>
      <div
        className={`flex items-center shrink-0 border-b border-white/5 ${
          showLabels ? 'h-16 px-4 justify-between' : 'h-16 justify-center'
        }`}
      >
        <SvLotesLogo
          href="/dashboard"
          size={showLabels ? 36 : 32}
          showText={showLabels}
          subtitle="Master Console"
          onClick={onClose}
        />
        {isMobile && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-1.5">
        {SUPER_ADMIN_NAV.map((section) => (
          <div key={section.label} className="mb-5 last:mb-0">
            {showLabels && <p className="sa-nav-section-label">{section.label}</p>}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isSuperAdminNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      title={!showLabels ? item.name : undefined}
                      className={`sa-nav-link ${active ? 'is-active' : ''} ${
                        !showLabels ? 'is-collapsed-only' : ''
                      }`}
                    >
                      <Icon
                        className={`w-4 h-4 shrink-0 ${active ? 'text-[var(--color-primary)]' : 'text-slate-400'}`}
                        strokeWidth={1.75}
                      />
                      {showLabels && <span className="truncate">{item.name}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div
        className={`shrink-0 border-t border-white/5 p-2 flex ${
          showLabels ? 'flex-col gap-1' : 'flex-col items-center gap-2'
        }`}
      >
        {!isMobile && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className={`sa-nav-link w-full text-slate-500 hover:text-slate-300 ${
              !showLabels ? 'is-collapsed-only' : ''
            }`}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <>
                <PanelLeftClose className="w-4 h-4" />
                <span>Recolher</span>
              </>
            )}
          </button>
        )}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className={`sa-nav-link w-full text-slate-500 hover:text-red-400 hover:bg-red-500/10 ${
              !showLabels ? 'is-collapsed-only' : ''
            }`}
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
            {showLabels && <span>Sair</span>}
          </button>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <aside
        className={`sa-mobile-drawer fixed top-0 left-0 h-full w-[min(17rem,88vw)] z-[400] flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {content}
      </aside>
    );
  }

  return (
    <aside
      className={`sa-shell-sidebar flex flex-col flex-shrink-0 z-[200] transition-[width] duration-200 ease-out ${
        collapsed ? 'is-collapsed' : 'is-expanded'
      }`}
    >
      {content}
    </aside>
  );
}
