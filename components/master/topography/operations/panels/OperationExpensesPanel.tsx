'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  OPERATION_EXPENSE_CATEGORIES,
  operationExpenseCategoryLabel,
  type MasterTopographyOperationExpense,
} from '@/lib/master/topography/operationExpenseTypes';
import styles from '../operation.module.css';

type Props = {
  operationId: string;
  userId: string;
  active: boolean;
  onToast: (msg: string) => void;
  onError: (msg: string | null) => void;
};

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

export function OperationExpensesPanel({ operationId, userId, active, onToast, onError }: Props) {
  const [expenses, setExpenses] = useState<MasterTopographyOperationExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('OUTROS');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId || !operationId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `userId=${encodeURIComponent(userId)}`;
      const res = await fetch(`/api/master/topography/operations/${operationId}/expenses?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar despesas.');
      setExpenses(data.expenses || []);
    } catch (err) {
      setExpenses([]);
      setError(err instanceof Error ? err.message : 'Falha ao carregar despesas.');
    } finally {
      setLoading(false);
    }
  }, [operationId, userId]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  const total = expenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);

  const create = async () => {
    const amt = Number(String(amount).replace(',', '.'));
    if (!description.trim()) {
      setFormError('Descrição é obrigatória.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Informe um valor positivo.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/master/topography/operations/${operationId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          category,
          description: description.trim(),
          amount: amt,
          expense_date: expenseDate,
          supplier: supplier.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao registrar despesa.');
      setDescription('');
      setAmount('');
      setSupplier('');
      onToast('Despesa registrada.');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao registrar.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async (expenseId: string) => {
    if (!window.confirm('Arquivar esta despesa?')) return;
    onError(null);
    try {
      const res = await fetch(
        `/api/master/topography/operations/${operationId}/expenses/${expenseId}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao arquivar.');
      onToast('Despesa arquivada.');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Falha ao arquivar.');
    }
  };

  if (!active) return null;

  return (
    <div className={styles.card}>
      <div className={styles.panelHeader}>
        <h3>Despesas</h3>
        <button type="button" className={styles.btnSecondary} onClick={() => void load()} disabled={loading}>
          Atualizar
        </button>
      </div>

      <p className={styles.muted} style={{ marginTop: 0 }}>
        Total listado: <strong>{formatCurrency(total)}</strong>
      </p>

      {error ? <div className={styles.formError}>{error}</div> : null}
      {loading ? <p className={styles.muted}>Carregando…</p> : null}

      <div className={styles.formGrid} style={{ marginBottom: '0.85rem' }}>
        {formError ? <div className={`${styles.formError} ${styles.fieldFull}`}>{formError}</div> : null}
        <div className={styles.field}>
          <label htmlFor="exp-cat">Categoria</label>
          <select
            id="exp-cat"
            className={styles.select}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {OPERATION_EXPENSE_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label htmlFor="exp-date">Data</label>
          <input
            id="exp-date"
            type="date"
            className={styles.input}
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="exp-amt">Valor (R$)</label>
          <input
            id="exp-amt"
            className={styles.input}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <div className={`${styles.field} ${styles.fieldFull}`}>
          <label htmlFor="exp-desc">Descrição *</label>
          <input
            id="exp-desc"
            className={styles.input}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="exp-sup">Fornecedor</label>
          <input
            id="exp-sup"
            className={styles.input}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </div>
        <div className={styles.fieldFull}>
          <button type="button" className={styles.btnPrimary} disabled={saving} onClick={() => void create()}>
            {saving ? 'Salvando…' : 'Registrar despesa'}
          </button>
        </div>
      </div>

      {!loading && expenses.length === 0 ? (
        <div className={styles.emptyState}>
          <h2>Nenhuma despesa</h2>
          <p>Lance custos de campo vinculados à operação.</p>
        </div>
      ) : null}

      {expenses.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Categoria</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td>{e.expense_date}</td>
                  <td>{operationExpenseCategoryLabel(e.category)}</td>
                  <td>{e.description}</td>
                  <td>{formatCurrency(Number(e.amount))}</td>
                  <td>
                    <button type="button" className={styles.btnDanger} onClick={() => void archive(e.id)}>
                      Arquivar
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
