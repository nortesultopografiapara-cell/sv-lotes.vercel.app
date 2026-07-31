'use client';

import { equipmentStatusLabel, equipmentStatusMeta } from '@/lib/master/topography/equipmentStatuses';
import styles from './equipment.module.css';

export function EquipmentStatusBadge({ status }: { status: string }) {
  const meta = equipmentStatusMeta(status);
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
      {equipmentStatusLabel(status)}
    </span>
  );
}
