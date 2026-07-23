'use client';

import { useEffect, useState } from 'react';
import {
  CORPORATE_SECURE_DELETE_CONFIRM_WORD,
  CORPORATE_SECURE_DELETE_SCOPE_NOTICE,
  normalizeSecureDeleteConfirmWord,
} from '@/lib/master/corporateFinance/secureDeletePolicy';
import styles from '@/components/master/corporateFinance/corporateFinance.module.css';

export type MasterSecureDeleteModalProps = {
  open: boolean;
  title: string;
  recordLabel: string;
  amountLabel?: string | null;
  linksWarning?: string | null;
  cascadeOption?: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  } | null;
  localOnlyOption?: {
    label: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  } | null;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (confirmWord: string) => void;
};

export function MasterSecureDeleteModal({
  open,
  title,
  recordLabel,
  amountLabel,
  linksWarning,
  cascadeOption,
  localOnlyOption,
  busy,
  error,
  onClose,
  onConfirm,
}: MasterSecureDeleteModalProps) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  if (!open) return null;

  const matches =
    normalizeSecureDeleteConfirmWord(typed) === CORPORATE_SECURE_DELETE_CONFIRM_WORD;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.modalHead}>
          <h3 className={styles.modalTitle}>{title}</h3>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            disabled={busy}
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
        <div className={styles.modalBody}>
          <p className={styles.subtitle} style={{ marginBottom: '0.75rem' }}>
            {CORPORATE_SECURE_DELETE_SCOPE_NOTICE}
          </p>
          <p style={{ margin: '0 0 0.5rem', color: '#0f172a', fontWeight: 600 }}>
            Registro: {recordLabel}
          </p>
          {amountLabel ? (
            <p style={{ margin: '0 0 0.75rem', color: '#334155' }}>Valor: {amountLabel}</p>
          ) : null}
          {linksWarning ? (
            <p
              style={{
                margin: '0 0 0.75rem',
                padding: '0.65rem 0.75rem',
                borderRadius: 8,
                background: '#fff7ed',
                border: '1px solid #fed7aa',
                color: '#9a3412',
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {linksWarning}
            </p>
          ) : null}
          {cascadeOption ? (
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                marginBottom: '0.75rem',
                fontSize: 13,
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={cascadeOption.checked}
                disabled={busy}
                onChange={(e) => cascadeOption.onChange(e.target.checked)}
              />
              <span>{cascadeOption.label}</span>
            </label>
          ) : null}
          {localOnlyOption ? (
            <label
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'flex-start',
                marginBottom: '0.75rem',
                fontSize: 13,
                color: '#334155',
              }}
            >
              <input
                type="checkbox"
                checked={localOnlyOption.checked}
                disabled={busy}
                onChange={(e) => localOnlyOption.onChange(e.target.checked)}
              />
              <span>{localOnlyOption.label}</span>
            </label>
          ) : null}
          <label className={styles.label} htmlFor="master-secure-delete-word">
            Digite <strong>{CORPORATE_SECURE_DELETE_CONFIRM_WORD}</strong> para confirmar
          </label>
          <input
            id="master-secure-delete-word"
            className={styles.input}
            autoComplete="off"
            value={typed}
            disabled={busy}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={CORPORATE_SECURE_DELETE_CONFIRM_WORD}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
        </div>
        <div className={styles.modalFoot}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            disabled={busy || !matches}
            onClick={() => onConfirm(typed.trim())}
          >
            {busy ? 'Excluindo…' : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}
