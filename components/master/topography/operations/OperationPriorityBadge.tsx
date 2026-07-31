'use client';

import { operationPriorityLabel } from '@/lib/master/topography/operationStatuses';
import styles from './operation.module.css';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: '#64748b',
  NORMAL: '#0284c7',
  HIGH: '#d97706',
  URGENT: '#e11d48',
};

export function OperationPriorityBadge({ priority }: { priority: string }) {
  const color = PRIORITY_COLORS[priority] || '#64748b';
  return (
    <span
      className={styles.badge}
      style={{
        background: `${color}18`,
        color,
        borderColor: `${color}44`,
      }}
    >
      {operationPriorityLabel(priority)}
    </span>
  );
}
