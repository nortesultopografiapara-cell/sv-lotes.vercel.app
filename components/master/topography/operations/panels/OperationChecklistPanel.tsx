'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OPERATION_TASK_STATUSES,
  type MasterTopographyOperationTask,
  type ChecklistTemplateCode,
} from '@/lib/master/topography/operationTaskTypes';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
};

const TEMPLATES: { code: ChecklistTemplateCode; label: string }[] = [
  { code: 'AEROLEVANTAMENTO', label: 'Template — Aerolevantamento' },
  { code: 'LEVANTAMENTO_TOPOGRAFICO', label: 'Template — Levantamento topográfico' },
];

export function OperationChecklistPanel({ operationId, userId, active, onToast, onError }: Props) {
  const [tasks, setTasks] = useState<MasterTopographyOperationTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [critical, setCritical] = useState(false);
  const [required, setRequired] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/tasks?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar checklist.');
      setTasks(data.tasks || []);
    } catch (err) {
      setTasks([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar checklist.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const applyTemplate = async (template: ChecklistTemplateCode) => {
    if (!window.confirm('Aplicar template? Itens existentes permanecem; novos serão adicionados.')) {
      return;
    }
    setTemplateBusy(template);
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/tasks/apply-template`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, template }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao aplicar template.');
      onToast('Template aplicado.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha no template.');
    } finally {
      setTemplateBusy(null);
    }
  };

  const addTask = async () => {
    if (!title.trim()) {
      setFormError('Título é obrigatório.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operationId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          title: title.trim(),
          is_required: required,
          is_critical: critical,
          status: 'PENDING',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar item.');
      setTitle('');
      onToast('Item adicionado ao checklist.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao criar item.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (taskId: string, status: string) => {
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/tasks/${taskId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, status }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar item.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao atualizar item.');
    }
  };

  const removeTask = async (taskId: string) => {
    if (!window.confirm('Remover este item do checklist?')) return;
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/tasks/${taskId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao remover item.');
      onToast('Item removido.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao remover.');
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Checklist</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      <div className={styles.rowActions} style={{ marginBottom: '0.75rem' }}>
        {TEMPLATES.map((t) => (
          <button
            key={t.code}
            type="button"
            className={styles.btnSecondary}
            disabled={templateBusy === t.code}
            onClick={() => void applyTemplate(t.code)}
          >
            {templateBusy === t.code ? 'Aplicando…' : t.label}
          </button>
        ))}
      </div>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando checklist…</p> : null}

      <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
        {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="task-title">Novo item</label>
          <input
            id="task-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Descrição da tarefa"
          />
        </div>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Obrigatório
        </label>
        <label className={styles.checkboxLabel}>
          <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} />
          Crítico
        </label>
        <div className={styles.fieldFull}>
          <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void addTask()}>
            {saving ? 'Salvando…' : 'Adicionar item'}
          </button>
        </div>
      </div>

      {!loading && tasks.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Checklist vazio</h2>
          <p>Aplique um template ou adicione itens manualmente.</p>
        </div>
      ) : null}

      {tasks.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Flags</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.order_index + 1}</td>
                  <td className={styles.nameCell}>{task.title}</td>
                  <td>
                    {task.is_required ? 'Obrig.' : 'Opc.'}
                    {task.is_critical ? ' · Crítico' : ''}
                  </td>
                  <td>
                    <select
                      className={styles.select}
                      value={task.status}
                      onChange={(e) => void updateStatus(task.id, e.target.value)}
                    >
                      {OPERATION_TASK_STATUSES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.btnDanger}
                      onClick={() => void removeTask(task.id)}
                    >
                      Remover
                    </button>
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
