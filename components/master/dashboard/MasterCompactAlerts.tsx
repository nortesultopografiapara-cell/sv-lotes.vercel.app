'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle, Lock, Mail, Map as MapIcon, Users } from 'lucide-react';
import type { MasterDashboardAlert } from '@/lib/masterDashboardData';
import styles from './masterExecutiveDashboard.module.css';

function alertIcon(alert: MasterDashboardAlert) {
  switch (alert.id) {
    case 'no-email':
      return <Mail width={14} height={14} aria-hidden />;
    case 'inadimplente':
    case 'expired-subscription':
      return <Lock width={14} height={14} aria-hidden />;
    case 'no-projects':
      return <MapIcon width={14} height={14} aria-hidden />;
    case 'no-users':
      return <Users width={14} height={14} aria-hidden />;
    default:
      return <AlertTriangle width={14} height={14} aria-hidden />;
  }
}

function alertClass(severity: MasterDashboardAlert['severity']) {
  if (severity === 'danger') return styles.alertDanger;
  if (severity === 'warning') return styles.alertWarning;
  return styles.alertInfo;
}

type MasterCompactAlertsProps = {
  alerts: MasterDashboardAlert[];
  /** Limite de alertas visíveis (padrão 3). */
  maxVisible?: number;
  detailsHref?: string;
};

const SEVERITY_RANK: Record<MasterDashboardAlert['severity'], number> = {
  danger: 0,
  warning: 1,
  info: 2,
};

/**
 * Faixa compacta de alertas — não ocupa coluna inteira dos gráficos.
 * Prioriza danger (ex.: assinatura vencida / inadimplência) nos slots visíveis.
 */
export function MasterCompactAlerts({
  alerts,
  maxVisible = 3,
  detailsHref,
}: MasterCompactAlertsProps) {
  const visible = [...alerts]
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, maxVisible);

  if (visible.length === 0) {
    return (
      <div className={styles.compactAlerts} role="status">
        <span className={`${styles.compactAlertIcon} ${styles.alertInfo}`}>
          <CheckCircle width={14} height={14} aria-hidden />
        </span>
        <p className={styles.compactAlertsEmpty}>Nenhum alerta crítico no momento.</p>
      </div>
    );
  }

  return (
    <div className={styles.compactAlerts} role="status" aria-label="Alertas">
      <ul className={styles.compactAlertsList}>
        {visible.map((alert) => (
          <li key={alert.id} className={styles.compactAlertItem}>
            <span className={`${styles.compactAlertIcon} ${alertClass(alert.severity)}`}>
              {alertIcon(alert)}
            </span>
            <span className={styles.compactAlertText}>{alert.title}</span>
          </li>
        ))}
      </ul>
      {detailsHref ? (
        <Link href={detailsHref} className={styles.linkAll}>
          Ver detalhes
        </Link>
      ) : null}
    </div>
  );
}
