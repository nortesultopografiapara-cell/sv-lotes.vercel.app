'use client';

import { useState } from 'react';
import type { MasterTopographyEquipmentAssignment } from '@/lib/master/topography/equipmentAssignmentTypes';
import styles from './equipment.module.css';

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('pt-BR');
}

type Props = {
  equipmentId: string;
  userId: string;
  rows: MasterTopographyEquipmentAssignment[];
  currentResponsible: string | null;
  currentLocation: string | null;
  busy: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string) => void;
};

export function EquipmentAssignmentsPanel({
  equipmentId,
  userId,
  rows,
  currentResponsible,
  currentLocation,
  busy,
  onChanged,
  onError,
  onToast,
}: Props) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toName, setToName] = useState(currentResponsible || '');
  const [toLocation, setToLocation] = useState(currentLocation || '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const openTransfer = () => {
    setToName(currentResponsible || '');
    setToLocation(currentLocation || '');
    setReason('');
    setNotes('');
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/master/topography/equipment/${equipmentId}/assignments`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            to_responsible_name: toName || null,
            to_location: toLocation || null,
            reason: reason || null,
            notes: notes || null,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na transferência.');
      setOpen(false);
      onToast('Movimentação registrada.');
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha na transferência.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Histórico de movimentações</h3>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={busy || saving}
          onClick={openTransfer}
        >
          Transferir
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={styles.muted}>Nenhuma movimentação registrada.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Responsável</th>
                <th>Localização</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{formatDateTime(r.moved_at)}</td>
                  <td>
                    {r.from_responsible_name || '—'} → {r.to_responsible_name || '—'}
                  </td>
                  <td>
                    {r.from_location || '—'} → {r.to_location || '—'}
                  </td>
                  <td>{r.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h3>Transferir responsável / localização</h3>
            {formError ? <div className={styles.formError}>{formError}</div> : null}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Novo responsável</label>
                <input value={toName} onChange={(e) => setToName(e.target.value)} />
              </div>
              <div className={styles.field}>
                <label>Nova localização</label>
                <input
                  value={toLocation}
                  onChange={(e) => setToLocation(e.target.value)}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Motivo</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.btnSecondary}
                disabled={saving}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
