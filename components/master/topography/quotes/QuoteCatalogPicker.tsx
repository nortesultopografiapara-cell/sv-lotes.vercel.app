'use client';

import { useEffect, useRef, useState } from 'react';
import type { MasterTopographyPriceDatabase } from '@/lib/master/topography/priceBanks';
import type { MasterTopographyPriceItem } from '@/lib/master/topography/priceCatalogService';
import { topographyPriceBankLabel } from '@/lib/master/topography/priceBanks';
import styles from './topographyQuotesEditor.module.css';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

type Props = {
  userId: string;
  databases: MasterTopographyPriceDatabase[];
  onPick: (item: MasterTopographyPriceItem) => void;
  onCreateCustom: () => void;
  disabled?: boolean;
};

export function QuoteCatalogPicker({
  userId,
  databases,
  onPick,
  onCreateCustom,
  disabled,
}: Props) {
  const [bank, setBank] = useState('ALL');
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MasterTopographyPriceItem[]>([]);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 220);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          userId,
          q: qDebounced,
          limit: '25',
        });
        if (bank !== 'ALL') params.set('bank', bank);
        const res = await fetch(`/api/master/topography/price-catalog?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Falha na pesquisa.');
        if (!cancelled) {
          setItems(data.items || []);
          setElapsed(typeof data.elapsedMs === 'number' ? data.elapsedMs : null);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [open, userId, qDebounced, bank]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      className={`${styles.catalogPicker}${open ? ` ${styles.catalogPickerOpen}` : ''}`}
    >      <div className={styles.catalogRow}>
        <select
          value={bank}
          disabled={disabled}
          onChange={(e) => {
            setBank(e.target.value);
            setOpen(true);
          }}
          aria-label="Banco de preços"
        >
          <option value="ALL">Todos os bancos</option>
          {databases.map((d) => (
            <option key={d.code} value={d.code}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          disabled={disabled}
          placeholder="Pesquisar descrição ou código…"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
        />
        <button
          type="button"
          className={styles.btnSecondary}
          disabled={disabled}
          onClick={onCreateCustom}
        >
          Criar Item Próprio
        </button>
      </div>

      {open ? (
        <div className={styles.catalogDropdown} role="listbox">
          <div className={styles.catalogMeta}>
            {loading
              ? 'Pesquisando…'
              : `${items.length} resultado(s)${elapsed != null ? ` · ${elapsed} ms` : ''}`}
          </div>
          {items.length === 0 && !loading ? (
            <div className={styles.emptyStage}>Nenhuma composição encontrada no catálogo.</div>
          ) : (
            items.map((item) => (
              <button
                key={`${item.source}-${item.id}`}
                type="button"
                className={styles.catalogItem}
                onClick={() => {
                  onPick(item);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className={styles.catalogItemBank}>
                  {topographyPriceBankLabel(item.bank_code)}
                  {item.source === 'custom' ? ' · próprio' : ''}
                </span>
                <strong>
                  {item.code} — {item.description}
                </strong>
                <span className={styles.catalogItemMeta}>
                  {item.unit} · {item.competence || '—'} · {item.uf || '—'} ·{' '}
                  {formatCurrency(item.reference_price)}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
