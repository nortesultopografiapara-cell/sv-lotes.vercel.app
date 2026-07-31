'use client';

import { useState } from 'react';
import {
  EQUIPMENT_MAINTENANCE_STATUSES,
  EQUIPMENT_MAINTENANCE_TYPES,
  type MasterTopographyEquipmentMaintenance,
} from '@/lib/master/topography/equipmentMaintenanceTypes';
import styles from './equipment.module.css';

function formatCurrency(val: number | null | undefined) {
  if (val == null || !Number.isFinite(val)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
}

type Props = {
  equipmentId: string;
  userId: string;
  rows: MasterTopographyEquipmentMaintenance[];
  busy: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
  onToast: (msg: string) => void;
};

const emptyForm = {
  tipo: 'PREVENTIVE',
  status: 'PLANNED',
  description: '',
  supplier: '',
  scheduled_at: '',
  performed_at: '',
  cost: '',
  next_review_at: '',
  parts: '',
  notes: '',
};

export function EquipmentMaintenancePanel({
  equipmentId,
  userId,
  rows,
  busy,
  onChanged,
  onError,
  onToast,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MasterTopographyEquipmentMaintenance | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError(null);
    setOpen(true);
  };

  const openEdit = (row: MasterTopographyEquipmentMaintenance) => {
    setEditing(row);
    setForm({
      tipo: row.tipo,
      status: row.status,
      description: row.description,
      supplier: row.supplier || '',
      scheduled_at: row.scheduled_at || '',
      performed_at: row.performed_at || '',
      cost: row.cost == null ? '' : String(row.cost),
      next_review_at: row.next_review_at || '',
      parts: row.parts || '',
      notes: row.notes || '',
    });
    setFormError(null);
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        userId,
        tipo: form.tipo,
        status: form.status,
        description: form.description,
        supplier: form.supplier || null,
        scheduled_at: form.scheduled_at || null,
        performed_at: form.performed_at || null,
        cost: form.cost === '' ? null : Number(form.cost),
        next_review_at: form.next_review_at || null,
        parts: form.parts || null,
        notes: form.notes || null,
      };

      const url = editing
        ? `/api/master/topography/equipment/${equipmentId}/maintenance/${editing.id}`
        : `/api/master/topography/equipment/${equipmentId}/maintenance`;
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar manutenção.');
      setOpen(false);
      onToast(editing ? 'Manutenção atualizada.' : 'Manutenção registrada.');
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Manutenções e calibrações</h3>
        <button
          type="button"
          className={styles.btnPrimary}
          disabled={busy || saving}
          onClick={openCreate}
        >
          Nova
        </button>
      </div>

      {rows.length === 0 ? (
        <p className={styles.muted}>Nenhuma manutenção registrada.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Status</th>
                <th>Descrição</th>
                <th>Custo</th>
                <th>Próx. revisão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.tipo}</td>
                  <td>{r.status}</td>
                  <td>{r.description}</td>
                  <td>{formatCurrency(r.cost)}</td>
                  <td>{formatDate(r.next_review_at)}</td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnGhost}
                      onClick={() => openEdit(r)}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.hintBlock}>
        Integração com Contas a Pagar: opcional em fase futura (não gera despesa automaticamente).
      </p>

      {open ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h3>{editing ? 'Editar manutenção' : 'Nova manutenção'}</h3>
            {formError ? <div className={styles.formError}>{formError}</div> : null}
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Tipo</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                >
                  {EQUIPMENT_MAINTENANCE_TYPES.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  {EQUIPMENT_MAINTENANCE_STATUSES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Descrição</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label>Fornecedor</label>
                <input
                  value={form.supplier}
                  onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label>Custo</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label>Data prevista</label>
                <input
                  type="date"
                  value={form.scheduled_at}
                  onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label>Data realizada</label>
                <input
                  type="date"
                  value={form.performed_at}
                  onChange={(e) => setForm((f) => ({ ...f, performed_at: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label>Próxima revisão</label>
                <input
                  type="date"
                  value={form.next_review_at}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, next_review_at: e.target.value }))
                  }
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Peças</label>
                <input
                  value={form.parts}
                  onChange={(e) => setForm((f) => ({ ...f, parts: e.target.value }))}
                />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
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
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
