'use client';

import { useState } from 'react';
import styles from './topographyQuotesEditor.module.css';

type Props = {
  open: boolean;
  userId: string;
  onClose: () => void;
  onCreated: (item: {
    id: string;
    code: string;
    description: string;
    unit: string;
    price: number;
  }) => void;
};

export function QuoteCustomItemModal({ open, userId, onClose, onCreated }: Props) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('SERVICO');
  const [unit, setUnit] = useState('UN');
  const [price, setPrice] = useState('0');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/master/topography/price-catalog/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          code,
          description,
          category,
          unit,
          price: Number(price),
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      onCreated(data.item);
      setCode('');
      setDescription('');
      setPrice('0');
      setNotes('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal>
      <div className={styles.modalCard}>
        <h3 className={styles.collapseTitle}>Criar Item Próprio</h3>
        <p className={styles.muted}>Salva no catálogo próprio para reutilização em qualquer orçamento.</p>
        {error ? <div className={styles.errorBanner}>{error}</div> : null}
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label>Código interno</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Categoria</label>
            <input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
            <label>Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Unidade</label>
            <input value={unit} onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Preço</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
            <label>Observação</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className={styles.execActions} style={{ marginTop: '1rem' }}>
          <button type="button" className={styles.btnSecondary} disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void submit()}>
            {saving ? 'Salvando…' : 'Salvar no catálogo'}
          </button>
        </div>
      </div>
    </div>
  );
}
