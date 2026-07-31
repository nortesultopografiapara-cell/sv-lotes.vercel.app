'use client';

import {
  operationStatusLabel,
  operationStatusMeta,
} from '@/lib/master/topography/operationStatuses';
import styles from './operation.module.css';

export function OperationStatusBadge({ status }: { status: string }) {
  const meta = operationStatusMeta(status);
  const color = meta?.color || '#64748b';
  return (
    <span
      className={styles.badge}
      style={{
        background: `${color}18`,
        color,
        borderColor: `${color}44`,
      }}
    >
      {operationStatusLabel(status)}
    </span>
  );
}
