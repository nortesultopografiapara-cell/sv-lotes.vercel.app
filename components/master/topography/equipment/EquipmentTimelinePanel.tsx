'use client';

import type { EquipmentTimelineEvent } from '@/lib/master/topography/equipmentTimelineService';
import styles from './equipment.module.css';

type Props = {
  events: EquipmentTimelineEvent[];
};

export function EquipmentTimelinePanel({ events }: Props) {
  return (
    <div className={styles.card}>
      <h3>Timeline</h3>
      {events.length === 0 ? (
        <p className={styles.muted}>Nenhum evento registrado.</p>
      ) : (
        <ol className={styles.timeline}>
          {events.map((ev) => (
            <li key={ev.id} className={styles.timelineItem}>
              <span className={styles.timelineDot} />
              <div>
                <p className={styles.timelineTitle}>{ev.title}</p>
                <p className={styles.timelineMeta}>
                  {ev.at ? new Date(ev.at).toLocaleString('pt-BR') : '—'} · {ev.source}
                </p>
                {ev.details ? (
                  <p className={styles.timelineDetails}>{ev.details}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
