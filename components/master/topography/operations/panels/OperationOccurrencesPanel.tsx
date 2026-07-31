'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OPERATION_OCCURRENCE_SEVERITIES,
  OPERATION_OCCURRENCE_STATUSES,
  OPERATION_OCCURRENCE_TYPES,
  type MasterTopographyOperationOccurrence,
} from '@/lib/master/topography/operationOccurrenceTypes';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
};

function formatDt(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export function OperationOccurrencesPanel({
  operationId,
  userId,
  active,
  onToast,
  onError,
}: Props) {
  const [items, setItems] = useState<MasterTopographyOperationOccurrence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState('OTHER');
  const [severity, setSeverity] = useState('MEDIUM');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/occurrences?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar ocorrências.');
      setItems(data.occurrences || []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar ocorrências.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const create = async () => {
    if (!title.trim()) {
      setFormError('Título é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operationId}/occurrences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          type,
          severity,
          title: title.trim(),
          description: description.trim() || null,
          status: 'OPEN',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar ocorrência.');
      setTitle('');
      setDescription('');
      onToast('Ocorrência registrada.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (occurrenceId: string, status: string) => {
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/occurrences/${occurrenceId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar ocorrência.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar.');
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Ocorrências</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando…</p> : null}

      <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
        {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
        <div className={styles.field}>
          <label htmlFor="occ-type">Tipo</label>
          <select id="occ-type" className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
            {OPERATION_OCCURRENCE_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="occ-sev">Severidade</label>
          <select
            id="occ-sev"
            className={styles.select}
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
          >
            {OPERATION_OCCURRENCE_SEVERITIES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="occ-title">Título *</label>
          <input
            id="occ-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="occ-desc">Descrição</label>
          <textarea
            id="occ-desc"
            className={styles.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.fieldFull}>
          <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void create()}>
            {saving ? 'Salvando…' : 'Registrar ocorrência'}
          </button>
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Nenhuma ocorrência</h2>
          <p>Registre eventos de campo, segurança ou cliente.</p>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Título</th>
                <th>Tipo</th>
                <th>Severidade</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id}>
                  <td>{formatDt(o.occurred_at)}</td>
                  <td className={styles.nameCell}>{o.title}</td>
                  <td>{OPERATION_OCCURRENCE_TYPES.find((t) => t.code === o.type)?.label || o.type}</td>
                  <td>
                    {OPERATION_OCCURRENCE_SEVERITIES.find((s) => s.code === o.severity)?.label || o.severity}
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={o.status}
                      onChange={(e) => void patchStatus(o.id, e.target.value)}
                    >
                      {OPERATION_OCCURRENCE_STATUSES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
