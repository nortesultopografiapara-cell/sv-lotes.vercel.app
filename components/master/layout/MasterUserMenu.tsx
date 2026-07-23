'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { HelpCenterProfileMenuLink } from '@/components/ui/HelpCenterProfileMenuLink';
import { normalizeUserRole } from '@/lib/rolePermissions';
import styles from './masterExecutiveLayout.module.css';

type MasterUserMenuProps = {
  user: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  } | null;
  onLogout: () => void;
  compact?: boolean;
};

function resolveInitials(name?: string | null, email?: string | null): string {
  const source = String(name || email || 'U').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || 'U';
}

function resolveMasterRoleLabel(role?: string | null): string {
  const normalized = normalizeUserRole(role);
  if (normalized === 'SUPER_ADMIN') return 'SUPER ADMIN';
  if (normalized === 'MASTER_ADMIN' || normalized === 'MASTER-ADMIN') return 'MASTER ADMIN';
  return 'PAINEL MASTER';
}

export function MasterUserMenu({ user, onLogout, compact = false }: MasterUserMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = resolveInitials(user?.name, user?.email);
  const displayName = user?.name || user?.email || 'Usuário';

  return (
    <div className={styles.userMenuWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.userTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu do usuário"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden>
          {initials}
        </span>
        {!compact ? (
          <span className={styles.userMeta}>
            <span className={styles.userName}>{displayName}</span>
            <span className={styles.userRole}>{resolveMasterRoleLabel(user?.role)}</span>
          </span>
        ) : null}
        <ChevronDown className={styles.navIcon} aria-hidden style={{ width: 14, height: 14, color: '#94a3b8' }} />
      </button>

      {open ? (
        <div className={styles.userMenu} role="menu">
          <div className={styles.userMenuHeader}>
            <p className={styles.userMenuHeaderName}>{displayName}</p>
            {user?.email ? <p className={styles.userMenuHeaderEmail}>{user.email}</p> : null}
          </div>
          <div className={styles.userMenuBody}>
            <Link
              href="/super-admin/profile"
              className={styles.userMenuLink}
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              <User className={styles.navIcon} aria-hidden />
              Meu Perfil Master
            </Link>
            <HelpCenterProfileMenuLink className={styles.userMenuLink} />
            <div className={styles.userMenuDivider} />
            <button
              type="button"
              className={`${styles.userMenuLink} ${styles.userMenuLinkDanger}`}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className={styles.navIcon} aria-hidden />
              Sair do Sistema
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
