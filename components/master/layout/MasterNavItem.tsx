'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import styles from './masterExecutiveLayout.module.css';

type MasterNavItemProps = {
  name: string;
  href: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  comingSoon?: boolean;
  onNavigate?: () => void;
};

export function MasterNavItem({
  name,
  href,
  icon: Icon,
  active,
  collapsed,
  comingSoon,
  onNavigate,
}: MasterNavItemProps) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        title={collapsed ? (comingSoon ? `${name} (Em breve)` : name) : undefined}
        aria-current={active ? 'page' : undefined}
        className={[
          styles.navLink,
          active ? styles.navLinkActive : '',
          collapsed ? styles.navLinkCollapsed : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Icon className={styles.navIcon} strokeWidth={1.75} aria-hidden />
        {!collapsed && (
          <>
            <span className={styles.navLabel}>{name}</span>
            {comingSoon ? <span className={styles.soonBadge}>Em breve</span> : null}
          </>
        )}
      </Link>
    </li>
  );
}
