'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  OPERATION_PRIORITIES,
  OPERATION_REOPEN_TARGETS,
  OPERATION_STATUS_TRANSITIONS,
  OPERATION_STATUSES,
  canTransitionOperationStatus,
  operationStatusLabel,
  type OperationStatusCode,
} from '@/lib/master/topography/operationStatuses';
import type { MasterTopographyOperation } from '@/lib/master/topography/operationTypes';
import styles from './operation.module.css';

type Props = {
  open: boolean;
  operation: MasterTopographyOperation | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    status: OperationStatusCode;
    actual_end?: string | null;
    reopenConfirmed?: boolean;
  }) => Promise<void> | void;
};

export function OperationStatusModal({
  open,
  operation,
  saving,
  error,
  onClose,
  onSubmit,
}: Props) {
  const [nextStatus, setNextStatus] = useState('');
  const [actualEnd, setActualEnd] = useState('');
  const [reopenConfirmed, setReopenConfirmed] = useState(false);

  useEffect(() => {
    if (!open || !operation) return;
    setNextStatus('');
    setActualEnd(
      operation.actual_end
        ? new Date(operation.actual_end).toISOString().slice(0, 16)
        : '',
    );
    setReopenConfirmed(false);
  }, [open, operation]);

  const options = useMemo(() => {
    if (!operation) return [] as OperationStatusCode[];
    const from = operation.status;
    const common = [...(OPERATION_STATUS_TRANSITIONS[from] || [])];
    const reopen =
      from === 'COMPLETED' || from === 'CANCELED'
        ? [...OPERATION_REOPEN_TARGETS]
        : [];
    return Array.from(new Set([...common, ...reopen])) as OperationStatusCode[];
  }, [operation]);

  if (!open || !operation) return null;

  const isReopen =
    (operation.status === 'COMPLETED' || operation.status === 'CANCELED') &&
    (OPERATION_REOPEN_TARGETS as readonly string[]).includes(nextStatus);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nextStatus) return;
    const to = nextStatus as OperationStatusCode;
    const check = canTransitionOperationStatus(operation.status, to, {
      allowReopen: true,
    });
    if (!check.ok) return;
    if (isReopen && !reopenConfirmed) return;

    let actual_end: string | null | undefined;
    if (to === 'COMPLETED') {
      if (!actualEnd) return;
      actual_end = new Date(actualEnd).toISOString();
    }

    await onSubmit({
      status: to,
      actual_end,
      reopenConfirmed: isReopen ? reopenConfirmed : undefined,
    });
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true">
      <div className={styles.modal} style={{ width: 'min(480px, 100%)' }}>
        <div className={styles.modalHeader}>
          <div>
            <h2>Alterar status</h2>
            <p>
              {operation.code} · atual: {operationStatusLabel(operation.status)}
            </p>
          </div>
          <button type="button" className={styles.btnGhost} onClick={onClose} disabled={saving}>
            Fechar
          </button>
        </div>
        <form className={styles.modalBody} onSubmit={(e) => void handleSubmit(e)}>
          {error ? <div className={styles.formError}>{error}</div> : null}

          {options.length === 0 ? (
            <p className={styles.muted}>
              Estado final sem transição comum. SUPER_ADMIN pode reabrir para Rascunho ou
              Planejada.
            </p>
          ) : null}

          <div className={styles.field}>
            <label htmlFor="op-next-status">Novo status</label>
            <select
              id="op-next-status"
              className={styles.select}
              value={nextStatus}
              onChange={(e) => setNextStatus(e.target.value)}
              required
            >
              <option value="">Selecione…</option>
              {options.map((code) => (
                <option key={code} value={code}>
                  {operationStatusLabel(code)}
                  {(OPERATION_REOPEN_TARGETS as readonly string[]).includes(code) &&
                  (operation.status === 'COMPLETED' || operation.status === 'CANCELED')
                    ? ' (reabertura SUPER_ADMIN)'
                    : ''}
                </option>
              ))}
            </select>
          </div>

          {nextStatus === 'COMPLETED' ? (
            <div className={styles.field}>
              <label htmlFor="op-actual-end">Fim real (obrigatório)</label>
              <input
                id="op-actual-end"
                className={styles.input}
                type="datetime-local"
                value={actualEnd}
                onChange={(e) => setActualEnd(e.target.value)}
                required
              />
            </div>
          ) : null}

          {isReopen ? (
            <label className={styles.checkboxLabel} style={{ whiteSpace: 'normal' }}>
              <input
                type="checkbox"
                checked={reopenConfirmed}
                onChange={(e) => setReopenConfirmed(e.target.checked)}
              />
              Confirmo reabertura explícita como SUPER_ADMIN (ação auditável).
            </label>
          ) : null}

          <div className={styles.modalFooter}>
            <button type="button" className={styles.btnSecondary} onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.btnPrimary}
              disabled={
                saving ||
                !nextStatus ||
                (nextStatus === 'COMPLETED' && !actualEnd) ||
                (isReopen && !reopenConfirmed)
              }
            >
              {saving ? 'Salvando…' : 'Confirmar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Exposto para testes / referência de labels estáveis. */
export const OPERATION_STATUS_UI_LABELS = OPERATION_STATUSES.map((s) => s.label);
