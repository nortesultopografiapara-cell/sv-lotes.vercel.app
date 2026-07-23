'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, X } from 'lucide-react';
import {
  CORPORATE_CATEGORY_TYPES,
  corporateCategoryTypeLabel,
  type MasterCorporateFinancialCategory,
} from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import styles from './corporateFinance.module.css';

type FormState = {
  name: string;
  type: string;
  parent_id: string;
  sort_order: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: '',
  type: 'EXPENSE',
  parent_id: '',
  sort_order: '0',
  is_active: true,
};

function CategoriesInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<MasterCorporateFinancialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterCorporateFinancialCategory | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/categories?${qs()}&includeInactive=1`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar categorias.');
      setRows(data.categories || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial / refresh
    void load();
  }, [load]);

  const parentOptions = useMemo(
    () =>
      rows.filter(
        (c) =>
          c.type === form.type &&
          c.is_active &&
          (!editing || c.id !== editing.id) &&
          !c.parent_id,
      ),
    [rows, form.type, editing],
  );

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [rows]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(c: MasterCorporateFinancialCategory) {
    setEditing(c);
    setForm({
      name: c.name,
      type: c.type,
      parent_id: c.parent_id || '',
      sort_order: String(c.sort_order ?? 0),
      is_active: c.is_active,
    });
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...bodyAuth(),
        name: form.name,
        type: form.type,
        parent_id: form.parent_id || null,
        sort_order: Number(form.sort_order || 0),
        is_active: form.is_active,
      };
      const url = editing
        ? `/api/master/corporate-finance/categories/${editing.id}`
        : '/api/master/corporate-finance/categories';
      const res = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao salvar.');
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: MasterCorporateFinancialCategory) {
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/categories/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), is_active: !c.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao atualizar status.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar.');
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>Categorias</h1>
            <p className={styles.subtitle}>
              Receitas e despesas com hierarquia opcional. Prefira desativar em vez de excluir
              quando a categoria já for utilizada.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/master/topography/finance" className={`${styles.btn} ${styles.btnGhost}`}>
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nova categoria
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Categorias cadastradas</h2>
          </div>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhuma categoria.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Pai</th>
                    <th>Ordem</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            c.type === 'INCOME' ? styles.badgeIncome : styles.badgeExpense
                          }`}
                        >
                          {corporateCategoryTypeLabel(c.type)}
                        </span>
                      </td>
                      <td>{c.parent_id ? nameById.get(c.parent_id) || '—' : '—'}</td>
                      <td>{c.sort_order}</td>
                      <td>
                        <span
                          className={`${styles.badge} ${c.is_active ? styles.badgeOn : styles.badgeOff}`}
                        >
                          {c.is_active ? 'Ativa' : 'Inativa'}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => openEdit(c)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => void toggleActive(c)}
                          >
                            {c.is_active ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className={styles.note}>
          Exclusão física fica bloqueada quando houver subcategorias (e, nas fases futuras, quando
          houver lançamentos vinculados).
        </p>
      </div>

      {modalOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>
                {editing ? 'Editar categoria' : 'Nova categoria'}
              </h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setModalOpen(false)}
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.label}>Nome *</label>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Tipo *</label>
                  <select
                    className={styles.select}
                    value={form.type}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, type: e.target.value, parent_id: '' }))
                    }
                  >
                    {CORPORATE_CATEGORY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {corporateCategoryTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Ordem</label>
                  <input
                    className={styles.input}
                    type="number"
                    value={form.sort_order}
                    onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Categoria pai (opcional)</label>
                <select
                  className={styles.select}
                  value={form.parent_id}
                  onChange={(e) => setForm((f) => ({ ...f, parent_id: e.target.value }))}
                >
                  <option value="">— Nenhuma —</option>
                  {parentOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Ativa
              </label>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CorporateCategoriesPage() {
  return (
    <CorporateFinanceGuard>
      <CategoriesInner />
    </CorporateFinanceGuard>
  );
}
