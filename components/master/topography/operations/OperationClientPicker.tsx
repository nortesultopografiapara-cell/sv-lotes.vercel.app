'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MasterTopographyClient } from '@/lib/master/topography/clientTypes';
import styles from './operation.module.css';

type Props = {
  userId: string;
  selected: MasterTopographyClient | null;
  clientNameSnapshot: string;
  onSelect: (client: MasterTopographyClient | null) => void;
  onRequestCreate: () => void;
};

export function OperationClientPicker({
  userId,
  selected,
  clientNameSnapshot,
  onSelect,
  onRequestCreate,
}: Props) {
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [results, setResults] = useState<MasterTopographyClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 280);
    return () => clearTimeout(t);
  }, [q]);

  const search = useCallback(async () => {
    if (!userId || qDebounced.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        userId,
        q: qDebounced,
        limit: '15',
      });
      const res = await fetch(`/api/master/topography/clients?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao buscar clientes.');
      setResults(data.clients || []);
      setOpen(true);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : 'Falha na busca.');
    } finally {
      setLoading(false);
    }
  }, [userId, qDebounced]);

  useEffect(() => {
    void search();
  }, [search]);

  return (
    <div className={`${styles.field} ${styles.fieldFull}`}>
      <label>Cliente</label>
      <p className={styles.hint}>
        Busque por nome, CPF/CNPJ, telefone ou e-mail. Não digite apenas o nome livremente.
      </p>

      {selected ? (
        <div className={styles.comingSoonBox} style={{ borderStyle: 'solid' }}>
          <strong>{selected.name}</strong>
          {selected.is_archived ? (
            <span className={styles.archivedTag}>Arquivado</span>
          ) : null}
          <div className={styles.muted} style={{ marginTop: 4 }}>
            {[selected.document, selected.phone, selected.email].filter(Boolean).join(' · ') ||
              'Sem documento/contato'}
          </div>
          <div className={styles.headerActions} style={{ marginTop: 8 }}>
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => {
                onSelect(null);
                setQ('');
              }}
            >
              Trocar cliente
            </button>
          </div>
        </div>
      ) : (
        <>
          {!selected && clientNameSnapshot ? (
            <p className={styles.hint} style={{ color: '#92400e' }}>
              Snapshot atual (sem vínculo): {clientNameSnapshot}. Selecione um cliente cadastrado.
            </p>
          ) : null}
          <div className={styles.toolbar} style={{ marginBottom: 0 }}>
            <input
              className={styles.searchInput}
              placeholder="Buscar cliente existente…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setOpen(true)}
            />
            <button type="button" className={styles.btnSecondary} onClick={onRequestCreate}>
              Cadastrar novo cliente
            </button>
          </div>
          {loading ? <p className={styles.muted}>Buscando…</p> : null}
          {error ? <p className={styles.formError}>{error}</p> : null}
          {open && qDebounced.length >= 2 && !loading ? (
            <div
              className={styles.panel}
              style={{ marginTop: 8, maxHeight: 220, overflowY: 'auto' }}
            >
              {results.length === 0 ? (
                <div className={styles.emptyState} style={{ padding: '1rem' }}>
                  <p>Nenhum cliente encontrado. Cadastre um novo.</p>
                </div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {results.map((c) => (
                    <li key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <button
                        type="button"
                        className={styles.btnGhost}
                        style={{
                          width: '100%',
                          justifyContent: 'flex-start',
                          textAlign: 'left',
                          padding: '0.65rem 0.85rem',
                          minHeight: 'auto',
                        }}
                        onClick={() => {
                          onSelect(c);
                          setOpen(false);
                          setQ('');
                        }}
                      >
                        <span>
                          <strong>{c.name}</strong>
                          <br />
                          <span className={styles.muted}>
                            {[c.document, c.phone, c.email].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
