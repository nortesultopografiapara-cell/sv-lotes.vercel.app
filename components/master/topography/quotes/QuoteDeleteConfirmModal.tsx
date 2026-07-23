'use client';

import { useEffect, useState } from 'react';
import {
  CORPORATE_SECURE_DELETE_CONFIRM_WORD,
  normalizeSecureDeleteConfirmWord,
} from '@/lib/master/corporateFinance/secureDeletePolicy';
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

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  if (!open) return null;

  const matchesCode = typed.trim() === code.trim();
  const matchesWord =
    normalizeSecureDeleteConfirmWord(typed) === CORPORATE_SECURE_DELETE_CONFIRM_WORD;
  const matches = matchesCode || matchesWord;

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
          Digite o código <strong style={{ color: '#0f172a' }}>{code}</strong> ou a palavra{' '}
          <strong style={{ color: '#0f172a' }}>{CORPORATE_SECURE_DELETE_CONFIRM_WORD}</strong> para
          confirmar:
        </p>
        <div className={styles.field} style={{ marginTop: '0.5rem' }}>
          <label htmlFor="quote-delete-code">Código do orçamento ou {CORPORATE_SECURE_DELETE_CONFIRM_WORD}</label>
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
