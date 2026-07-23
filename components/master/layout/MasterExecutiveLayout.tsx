'use client';

import { useEffect, useState } from 'react';
import { MasterExecutiveHeader } from './MasterExecutiveHeader';
import { MasterExecutiveSidebar } from './MasterExecutiveSidebar';
import { MASTER_EXECUTIVE_BUILD_MARKER } from '@/lib/master/config';
import styles from './masterExecutiveLayout.module.css';

const COLLAPSE_STORAGE_KEY = 'master_executive_sidebar_collapsed';
const MASTER_ROOT_CLASS = 'master-executive-root';

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
 * Estratégia: rolagem vertical SOMENTE no #master-executive-scroll-container.
 * Não compartilha chrome com layouts de empresa / SaaS legado.
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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.classList.add(MASTER_ROOT_CLASS);
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.classList.remove(MASTER_ROOT_CLASS);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
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
    <div
      className={styles.shell}
      data-master-scroll-strategy="main"
      data-master-build={MASTER_EXECUTIVE_BUILD_MARKER}
      data-testid="master-executive-shell"
    >
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

        <main
          id="master-executive-scroll-container"
          className={styles.content}
          data-testid="master-executive-main"
        >
          <div className={styles.contentInner}>{children}</div>
          <footer className={styles.footerBar}>
            <span>
              © {new Date().getFullYear()} SV Topografia &amp; Projetos / SV LOTES. Todos os direitos
              reservados.
            </span>
            <span data-master-build-label={MASTER_EXECUTIVE_BUILD_MARKER}>
              Master build: {MASTER_EXECUTIVE_BUILD_MARKER}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
