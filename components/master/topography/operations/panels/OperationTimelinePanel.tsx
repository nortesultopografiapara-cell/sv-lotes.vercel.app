'use client';

import { useCallback, useEffect, useState } from 'react';
import type { OperationTimelineEvent } from '@/lib/master/topography/operationTimelineService';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onError: (msg: string | null) => void;
};

export function OperationTimelinePanel({ operationId, userId, active, onError }: Props) {
  const [events, setEvents] = useState<OperationTimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    onError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/timeline?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar timeline.');
      setEvents(data.timeline || []);
    } catch (err) {
      setEvents([]);
      const msg = err instanceof Error ? err.message : 'Falha ao carregar timeline.';
      setError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Timeline</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando eventos…</p> : null}

      {!loading && events.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Sem eventos</h2>
          <p>Alterações na OS, equipe, equipamentos e documentos aparecerão aqui.</p>
        </div>
      ) : null}

      {events.length > 0 ? (
        <ol className={styles.timeline}>
          {events.map((ev) => (
            <li key={ev.id} className={styles.timelineItem}>
              <span className={styles.timelineDot} />
              <div>
                <p className={styles.timelineTitle}>{ev.title}</p>
                <p className={styles.timelineMeta}>
                  {ev.at ? new Date(ev.at).toLocaleString('pt-BR') : '—'}
                  {ev.kind ? ` · ${ev.kind}` : ''}
                </p>
                {ev.detail ? <p className={styles.timelineDetails}>{ev.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
