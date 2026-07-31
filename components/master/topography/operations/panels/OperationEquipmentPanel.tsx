'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MasterTopographyEquipment } from '@/lib/master/topography/equipmentTypes';
import type { MasterTopographyOperationEquipmentLink } from '@/lib/master/topography/operationEquipmentTypes';
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

export function OperationEquipmentPanel({ operationId, userId, active, onToast, onError }: Props) {
  const [links, setLinks] = useState<MasterTopographyOperationEquipmentLink[]>([]);
  const [catalog, setCatalog] = useState<MasterTopographyEquipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [equipmentId, setEquipmentId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const [linkRes, catRes] = await Promise.all([
        fetch(`/api/master/topography/operations/${operationId}/equipment?${qs}`),
        fetch(
          `/api/master/topography/equipment?${qs}&includeArchived=0&limit=100`,
        ),
      ]);
      const linkData = await linkRes.json();
      const catData = await catRes.json();
      if (!linkRes.ok) throw new Error(linkData.error || 'Falha ao carregar vínculos.');
      if (!catRes.ok) throw new Error(catData.error || 'Falha ao carregar equipamentos.');
      setLinks(linkData.equipment || []);
      setCatalog(catData.equipment || []);
    } catch (err) {
      setLinks([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar equipamentos.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const reserve = async () => {
    if (!equipmentId) {
      setFormError('Selecione um equipamento.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operationId}/equipment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          equipment_id: equipmentId,
          notes: notes.trim() || null,
          reserve: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao reservar.');
      setEquipmentId('');
      setNotes('');
      onToast('Equipamento vinculado.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao reservar.');
    } finally {
      setSaving(false);
    }
  };

  const patchLink = async (
    linkId: string,
    action: 'checkout' | 'return',
    extra?: { condition_out?: string; condition_return?: string },
  ) => {
    setActionBusy(linkId);
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/equipment/${linkId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, action, ...extra }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      onToast(action === 'checkout' ? 'Retirada registrada.' : 'Devolução registrada.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar vínculo.');
    } finally {
      setActionBusy(null);
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Equipamentos</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando…</p> : null}

      <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
        {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
        <div className={styles.field}>
          <label htmlFor="eq-pick">Reservar equipamento</label>
          <select
            id="eq-pick"
            className={styles.select}
            value={equipmentId}
            onChange={(e) => setEquipmentId(e.target.value)}
          >
            <option value="">Selecione…</option>
            {catalog.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {eq.code} — {eq.name} ({eq.status})
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="eq-notes">Observações</label>
          <input
            id="eq-notes"
            className={styles.input}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className={styles.fieldFull}>
          <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void reserve()}>
            {saving ? 'Reservando…' : 'Reservar / vincular'}
          </button>
        </div>
      </div>

      {!loading && links.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Nenhum equipamento vinculado</h2>
          <p>Reserve equipamentos disponíveis para esta ordem de serviço.</p>
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Reservado</th>
                <th>Retirada</th>
                <th>Devolução</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {links.map((link) => (
                <tr key={link.id}>
                  <td className={styles.codeCell}>{link.equipment_code || link.equipment_id.slice(0, 8)}</td>
                  <td className={styles.nameCell}>{link.equipment_name || '—'}</td>
                  <td>{formatDt(link.reserved_at)}</td>
                  <td>{formatDt(link.checked_out_at)}</td>
                  <td>{formatDt(link.returned_at)}</td>
                  <td>
                    <div className={styles.rowActions}>
                      {!link.checked_out_at ? (
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          disabled={actionBusy === link.id}
                          onClick={() => {
                            const condition = window.prompt('Condição na saída (opcional):') || '';
                            void patchLink(link.id, 'checkout', {
                              condition_out: condition || undefined,
                            });
                          }}
                        >
                          Retirar
                        </button>
                      ) : null}
                      {link.checked_out_at && !link.returned_at ? (
                        <button
                          type="button"
                          className={styles.btnSecondary}
                          disabled={actionBusy === link.id}
                          onClick={() => {
                            const condition = window.prompt('Condição na devolução (opcional):') || '';
                            void patchLink(link.id, 'return', {
                              condition_return: condition || undefined,
                            });
                          }}
                        >
                          Devolver
                        </button>
                      ) : null}
                    </div>
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
