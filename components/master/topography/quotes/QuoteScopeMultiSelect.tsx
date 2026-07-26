'use client';

import { useMemo, useState } from 'react';
import {
  findCatalogOptionByLabel,
  normalizeQuoteScopeLabelKey,
  newQuoteScopeCustomId,
  sanitizeQuoteScopeLabel,
  type QuoteScopeCatalogOption,
  type QuoteScopeSelectedItem,
} from '@/lib/master/topography/quoteScopeCatalog';
import styles from './topographyQuotesEditor.module.css';

type Props = {
  title: string;
  searchPlaceholder: string;
  catalog: readonly QuoteScopeCatalogOption[];
  selected: QuoteScopeSelectedItem[];
  maxItems: number;
  disabled?: boolean;
  onChange: (next: QuoteScopeSelectedItem[]) => void;
};

export default function QuoteScopeMultiSelect({
  title,
  searchPlaceholder,
  catalog,
  selected,
  maxItems,
  disabled,
  onChange,
}: Props) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedKeys = useMemo(
    () => new Set(selected.map((s) => normalizeQuoteScopeLabelKey(s.label))),
    [selected],
  );

  const filtered = useMemo(() => {
    const q = normalizeQuoteScopeLabelKey(query);
    if (!q) return catalog;
    return catalog.filter(
      (o) =>
        normalizeQuoteScopeLabelKey(o.label).includes(q) ||
        normalizeQuoteScopeLabelKey(o.category || '').includes(q),
    );
  }, [catalog, query]);

  const toggleCatalog = (opt: QuoteScopeCatalogOption) => {
    if (disabled) return;
    setError(null);
    const key = normalizeQuoteScopeLabelKey(opt.label);
    if (selectedKeys.has(key)) {
      onChange(selected.filter((s) => normalizeQuoteScopeLabelKey(s.label) !== key));
      return;
    }
    if (selected.length >= maxItems) {
      setError(`Máximo de ${maxItems} itens.`);
      return;
    }
    onChange([...selected, { id: opt.id, label: opt.label, source: 'catalog' }]);
  };

  const removeItem = (id: string) => {
    if (disabled) return;
    onChange(selected.filter((s) => s.id !== id));
  };

  const addCustom = () => {
    if (disabled) return;
    const label = sanitizeQuoteScopeLabel(customLabel);
    if (!label) {
      setError('Informe a descrição do item personalizado.');
      return;
    }
    const existing = findCatalogOptionByLabel(catalog, label);
    if (existing || selectedKeys.has(normalizeQuoteScopeLabelKey(label))) {
      setError('Este item já está selecionado.');
      return;
    }
    if (selected.length >= maxItems) {
      setError(`Máximo de ${maxItems} itens.`);
      return;
    }
    onChange([
      ...selected,
      { id: newQuoteScopeCustomId(), label, source: 'custom' },
    ]);
    setCustomLabel('');
    setCustomOpen(false);
    setError(null);
  };

  return (
    <div className={styles.scopeBlock}>
      <button
        type="button"
        className={styles.scopeToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          {title}{' '}
          <em className={styles.scopeCount}>({selected.length})</em>
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open ? (
        <div className={styles.scopeBody}>
          {selected.length > 0 ? (
            <div className={styles.scopeChips} aria-label="Itens selecionados">
              {selected.map((item) => (
                <span key={item.id} className={styles.scopeChip}>
                  {item.label}
                  {!disabled ? (
                    <button
                      type="button"
                      className={styles.scopeChipRemove}
                      aria-label={`Remover ${item.label}`}
                      onClick={() => removeItem(item.id)}
                    >
                      ×
                    </button>
                  ) : null}
                </span>
              ))}
            </div>
          ) : (
            <p className={styles.scopeEmpty}>Nenhum item selecionado.</p>
          )}

          <input
            className={styles.scopeSearch}
            type="search"
            value={query}
            disabled={disabled}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className={styles.scopeList} role="listbox" aria-multiselectable>
            {filtered.map((opt) => {
              const checked = selectedKeys.has(normalizeQuoteScopeLabelKey(opt.label));
              return (
                <label key={opt.id} className={styles.scopeOption}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleCatalog(opt)}
                  />
                  <span>
                    {opt.label}
                    {opt.category ? (
                      <small className={styles.scopeCategory}> · {opt.category}</small>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {filtered.length === 0 ? (
              <p className={styles.scopeEmpty}>Nenhuma opção encontrada.</p>
            ) : null}
          </div>

          {!customOpen ? (
            <button
              type="button"
              className={styles.scopeAddCustom}
              disabled={disabled}
              onClick={() => setCustomOpen(true)}
            >
              + Adicionar item personalizado
            </button>
          ) : (
            <div className={styles.scopeCustomRow}>
              <input
                value={customLabel}
                disabled={disabled}
                maxLength={150}
                placeholder="Descrição do item personalizado"
                onChange={(e) => setCustomLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <button type="button" className={styles.btnPrimary} disabled={disabled} onClick={addCustom}>
                Incluir
              </button>
              <button
                type="button"
                className={styles.btnGhost}
                disabled={disabled}
                onClick={() => {
                  setCustomOpen(false);
                  setCustomLabel('');
                  setError(null);
                }}
              >
                Cancelar
              </button>
            </div>
          )}

          {error ? <p className={styles.scopeError}>{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
