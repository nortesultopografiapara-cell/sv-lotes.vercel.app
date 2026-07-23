'use client';

import { useState } from 'react';
import styles from './topographyQuotesEditor.module.css';

type Props = {
  open: boolean;
  code: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (typedCode: string) => void;
};

export function QuoteDeleteConfirmModal({
  open,
  code,
  busy,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [typed, setTyped] = useState('');

  if (!open) return null;

  const matches = typed.trim() === code.trim();

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal aria-labelledby="quote-delete-title">
      <div className={styles.modalCard}>
        <h3 id="quote-delete-title" className={styles.collapseTitle}>
          Excluir definitivamente
        </h3>
        <p className={styles.muted} style={{ marginTop: '0.5rem', lineHeight: 1.45 }}>
          Esta ação excluirá permanentemente o orçamento, suas etapas e seus itens. Não será possível
          desfazer.
        </p>
        <p className={styles.muted} style={{ marginTop: '0.75rem' }}>
          Digite o código <strong style={{ color: '#0f172a' }}>{code}</strong> para confirmar:
        </p>
        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
          <label htmlFor="quote-delete-code">Código do orçamento</label>
          <input
            id="quote-delete-code"
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={code}
          />
        </div>
        {error ? <div className={styles.errorBanner}>{error}</div> : null}
        <div className={styles.execActions} style={{ marginTop: '1rem' }}>
          <button
            type="button"
            className={styles.btnSecondary}
            disabled={busy}
            onClick={() => {
              setTyped('');
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={styles.btnDanger}
            disabled={busy || !matches}
            onClick={() => onConfirm(typed.trim())}
          >
            {busy ? 'Excluindo…' : 'Excluir permanentemente'}
          </button>
        </div>
      </div>
    </div>
  );
}
