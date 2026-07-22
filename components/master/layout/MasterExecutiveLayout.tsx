'use client';

import { useEffect, useState } from 'react';
import { MasterExecutiveHeader } from './MasterExecutiveHeader';
import { MasterExecutiveSidebar } from './MasterExecutiveSidebar';
import styles from './masterExecutiveLayout.module.css';

const COLLAPSE_STORAGE_KEY = 'master_executive_sidebar_collapsed';

type MasterExecutiveLayoutProps = {
  children: React.ReactNode;
  user: {
    id?: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  onLogout: () => void;
};

function readCollapsedPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Shell exclusivo do Painel Master Executivo V2.
 * Não compartilhado com layouts de empresa.
 */
export function MasterExecutiveLayout({ children, user, onLogout }: MasterExecutiveLayoutProps) {
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className={styles.shell}>
      <MasterExecutiveSidebar
        collapsed={collapsed}
        onToggleCollapsed={toggleCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className={styles.mainColumn}>
        {isMobile ? (
          <MasterExecutiveHeader
            user={user}
            sidebarCollapsed={collapsed}
            onToggleSidebar={toggleCollapsed}
            onOpenMobileMenu={() => setMobileOpen(true)}
            onLogout={onLogout}
            mobile
          />
        ) : (
          <MasterExecutiveHeader
            user={user}
            sidebarCollapsed={collapsed}
            onToggleSidebar={toggleCollapsed}
            onOpenMobileMenu={() => setMobileOpen(true)}
            onLogout={onLogout}
          />
        )}

        <div className={styles.content}>
          <div className={styles.contentInner}>{children}</div>
        </div>

        <footer className={styles.footerBar}>
          <span>
            © {new Date().getFullYear()} SV Topografia &amp; Projetos / SV LOTES. Todos os direitos
            reservados.
          </span>
          <span>Versão 2.1.0 · Master Executivo</span>
        </footer>
      </div>
    </div>
  );
}
