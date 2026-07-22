'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChevronLeft, PanelLeftOpen, X } from 'lucide-react';
import {
  MASTER_EXECUTIVE_NAV,
  isMasterExecutiveNavActive,
} from '@/lib/master/executiveNav';
import { MasterBrandLogo } from './MasterBrandLogo';
import { MasterNavItem } from './MasterNavItem';
import styles from './masterExecutiveLayout.module.css';

type MasterExecutiveSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
};

function NavSections({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav className={styles.navScroll} aria-label="Menu Master">
      {MASTER_EXECUTIVE_NAV.map((section) => (
        <div key={section.label} className={styles.navSection}>
          {!collapsed ? <p className={styles.navSectionLabel}>{section.label}</p> : null}
          <ul className={styles.navList}>
            {section.items.map((item) => (
              <MasterNavItem
                key={`${section.label}-${item.href}-${item.name}`}
                name={item.name}
                href={item.href}
                icon={item.icon}
                active={isMasterExecutiveNavActive(pathname, item.href)}
                collapsed={collapsed}
                comingSoon={item.comingSoon}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function MasterExecutiveSidebar({
  collapsed,
  onToggleCollapsed,
  mobileOpen,
  onMobileClose,
}: MasterExecutiveSidebarProps) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, onMobileClose]);

  return (
    <>
      <aside
        className={[
          styles.sidebar,
          collapsed ? styles.sidebarCollapsed : styles.sidebarExpanded,
        ].join(' ')}
        aria-label="Navegação Master"
      >
        <div className={[styles.brandArea, collapsed ? styles.brandAreaCollapsed : ''].join(' ')}>
          <MasterBrandLogo collapsed={collapsed} />
        </div>
        <NavSections collapsed={collapsed} />
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={[styles.collapseBtn, collapsed ? styles.collapseBtnCollapsed : ''].join(' ')}
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
          >
            {collapsed ? (
              <PanelLeftOpen className={styles.navIcon} aria-hidden />
            ) : (
              <>
                <ChevronLeft className={styles.navIcon} aria-hidden />
                <span>Recolher menu</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className={styles.overlay}
          onClick={onMobileClose}
          aria-hidden
        />
      ) : null}

      <aside
        className={[styles.drawer, mobileOpen ? styles.drawerOpen : ''].join(' ')}
        aria-hidden={!mobileOpen}
        aria-label="Menu Master mobile"
      >
        <div className={styles.drawerBrand}>
          <MasterBrandLogo onNavigate={onMobileClose} />
          <button
            type="button"
            className={styles.drawerClose}
            onClick={onMobileClose}
            aria-label="Fechar menu"
          >
            <X className={styles.navIcon} aria-hidden />
          </button>
        </div>
        <NavSections collapsed={false} onNavigate={onMobileClose} />
      </aside>
    </>
  );
}
