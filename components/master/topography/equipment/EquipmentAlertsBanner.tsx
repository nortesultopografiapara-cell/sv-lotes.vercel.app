'use client';

import type { EquipmentAlert } from '@/lib/master/topography/equipmentAlertsService';
import styles from './equipment.module.css';

type Props = {
  alerts: EquipmentAlert[];
};

export function EquipmentAlertsBanner({ alerts }: Props) {
  if (!alerts.length) return null;

  return (
    <section className={styles.alertsBanner} aria-label="Alertas do equipamento">
      {alerts.map((a, idx) => (
        <div
          key={`${a.code}-${a.refId || a.date || idx}`}
          className={
            a.severity === 'danger'
              ? styles.alertDanger
              : a.severity === 'warning'
                ? styles.alertWarning
                : styles.alertInfo
          }
        >
          <strong>{a.title}</strong>
          <span>{a.details}</span>
        </div>
      ))}
    </section>
  );
}
