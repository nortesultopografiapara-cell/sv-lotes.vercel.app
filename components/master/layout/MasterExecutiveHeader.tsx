'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarDays, CircleHelp, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { MasterUserMenu } from './MasterUserMenu';
import styles from './masterExecutiveLayout.module.css';

type MasterExecutiveHeaderProps = {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileMenu: () => void;
  onLogout: () => void;
  mobile?: boolean;
};

function formatDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

export function MasterExecutiveHeader({
  user,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileMenu,
  onLogout,
  mobile = false,
}: MasterExecutiveHeaderProps) {
  const today = useMemo(() => formatDateInput(new Date()), []);
  const [periodStart, setPeriodStart] = useState(today);
  const [periodEnd, setPeriodEnd] = useState(today);

  if (mobile) {
    return (
      <div className={styles.mobileHeader}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu"
          >
            <Menu width={18} height={18} aria-hidden />
          </button>
          <div className={styles.headerTitles}>
            <h1 className={styles.headerTitle}>Painel Master</h1>
            <p className={styles.headerSubtitle}>Visão geral executiva</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <MasterUserMenu user={user} onLogout={onLogout} compact />
        </div>
      </div>
    );
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen width={18} height={18} aria-hidden />
          ) : (
            <PanelLeftClose width={18} height={18} aria-hidden />
          )}
        </button>
        <div className={styles.headerTitles}>
          <h1 className={styles.headerTitle}>Painel Master</h1>
          <p className={styles.headerSubtitle}>Visão geral executiva</p>
        </div>
      </div>

      <div className={styles.headerRight}>
        <div
          className={styles.periodPicker}
          title="Seletor visual de período (sem alterar consultas nesta fase)"
        >
          <CalendarDays width={14} height={14} aria-hidden />
          <label className={styles.srOnly} htmlFor="master-period-start">
            Data inicial
          </label>
          <input
            id="master-period-start"
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            aria-label="Data inicial do período"
          />
          <span aria-hidden>—</span>
          <label className={styles.srOnly} htmlFor="master-period-end">
            Data final
          </label>
          <input
            id="master-period-end"
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            aria-label="Data final do período"
          />
          <span className={styles.srOnly}>
            Período {formatDisplayDate(periodStart)} até {formatDisplayDate(periodEnd)}
          </span>
        </div>

        <div className={styles.notifWrap}>
          <button
            type="button"
            className={styles.iconBtn}
            aria-label="Notificações"
            title="Notificações (em breve)"
          >
            <Bell width={16} height={16} aria-hidden />
          </button>
        </div>

        <Link
          href="/manual"
          className={styles.iconBtn}
          aria-label="Ajuda"
          title="Central de Ajuda"
        >
          <CircleHelp width={16} height={16} aria-hidden />
        </Link>

        <MasterUserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
