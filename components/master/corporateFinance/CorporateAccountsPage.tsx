'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, X } from 'lucide-react';
import {
  CORPORATE_ACCOUNT_TYPES,
  corporateAccountTypeLabel,
  type MasterCorporateFinancialAccount,
} from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import {
  CorporateFinanceSemanticBadge,
  corporateFinanceValueClass,
} from './CorporateFinanceSemantic';
import styles from './corporateFinance.module.css';
import { semanticToneForSignedAmount } from '@/lib/master/corporateFinance/semantic';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

type FormState = {
  name: string;
  account_type: string;
  institution_name: string;
  branch: string;
  account_number: string;
  pix_key: string;
  opening_balance: string;
  opening_balance_date: string;
  is_default: boolean;
  is_active: boolean;
  notes: string;
};

const EMPTY: FormState = {
  name: '',
  account_type: 'CHECKING',
  institution_name: '',
  branch: '',
  account_number: '',
  pix_key: '',
  opening_balance: '0',
  opening_balance_date: '',
  is_default: false,
  is_active: true,
  notes: '',
};

function fromAccount(a: MasterCorporateFinancialAccount): FormState {
  return {
    name: a.name,
    account_type: a.account_type,
    institution_name: a.institution_name || '',
    branch: a.branch || '',
    account_number: a.account_number || '',
    pix_key: a.pix_key || '',
    opening_balance: String(a.opening_balance ?? 0),
    opening_balance_date: a.opening_balance_date?.slice(0, 10) || '',
    is_default: a.is_default,
    is_active: a.is_active,
    notes: a.notes || '',
  };
}

function AccountsInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  type AccountWithBalance = MasterCorporateFinancialAccount & {
    balance?: {
      openingBalance: number;
      income: number;
      expense: number;
      transferIn: number;
      transferOut: number;
      currentBalance: number;
      lastMovementAt: string | null;
    };
  };
  const [rows, setRows] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterCorporateFinancialAccount | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/accounts/balances?${qs()}&includeInactive=1`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar contas.');
      setRows(data.accounts || []);
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

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(a: MasterCorporateFinancialAccount) {
    setEditing(a);
    setForm(fromAccount(a));
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...bodyAuth(),
        ...form,
        opening_balance: Number(form.opening_balance || 0),
        opening_balance_date: form.opening_balance_date || null,
      };
      const url = editing
        ? `/api/master/corporate-finance/accounts/${editing.id}`
        : '/api/master/corporate-finance/accounts';
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

  async function toggleActive(a: MasterCorporateFinancialAccount) {
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/accounts/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), is_active: !a.is_active }),
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
            <h1 className={styles.title}>Contas financeiras</h1>
            <p className={styles.subtitle}>
              Cadastro de contas. O saldo inicial vale a partir da data de referência — saldo atual
              não é armazenado nesta fase.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/master/topography/finance" className={`${styles.btn} ${styles.btnGhost}`}>
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nova conta
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Contas cadastradas</h2>
          </div>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhuma conta cadastrada.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Saldo inicial</th>
                    <th>Entradas</th>
                    <th>Saídas</th>
                    <th>Saldo atual</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {a.name}
                        {a.is_default ? (
                          <span
                            className={`${styles.badge} ${styles.badgeIncome}`}
                            style={{ marginLeft: 6 }}
                          >
                            Padrão
                          </span>
                        ) : null}
                      </td>
                      <td>{corporateAccountTypeLabel(a.account_type)}</td>
                      <td>{formatCurrency(Number(a.balance?.openingBalance ?? a.opening_balance))}</td>
                      <td className={corporateFinanceValueClass('income')}>
                        {formatCurrency(Number(a.balance?.income || 0))}
                      </td>
                      <td className={corporateFinanceValueClass('expense')}>
                        {formatCurrency(Number(a.balance?.expense || 0))}
                      </td>
                      <td
                        className={corporateFinanceValueClass(
                          semanticToneForSignedAmount(Number(a.balance?.currentBalance || 0)),
                        )}
                      >
                        {formatCurrency(Number(a.balance?.currentBalance || 0))}
                      </td>
                      <td>
                        <CorporateFinanceSemanticBadge tone={a.is_active ? 'received' : 'neutral'}>
                          {a.is_active ? 'Ativa' : 'Inativa'}
                        </CorporateFinanceSemanticBadge>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => openEdit(a)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            onClick={() => void toggleActive(a)}
                          >
                            {a.is_active ? 'Desativar' : 'Ativar'}
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
      </div>

      {modalOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>{editing ? 'Editar conta' : 'Nova conta'}</h3>
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
                  <label className={styles.label}>Tipo</label>
                  <select
                    className={styles.select}
                    value={form.account_type}
                    onChange={(e) => setForm((f) => ({ ...f, account_type: e.target.value }))}
                  >
                    {CORPORATE_ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {corporateAccountTypeLabel(t)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Instituição</label>
                  <input
                    className={styles.input}
                    value={form.institution_name}
                    onChange={(e) => setForm((f) => ({ ...f, institution_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Agência</label>
                  <input
                    className={styles.input}
                    value={form.branch}
                    onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Número da conta</label>
                  <input
                    className={styles.input}
                    value={form.account_number}
                    onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Chave Pix</label>
                <input
                  className={styles.input}
                  value={form.pix_key}
                  onChange={(e) => setForm((f) => ({ ...f, pix_key: e.target.value }))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Saldo inicial</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.opening_balance}
                    onChange={(e) => setForm((f) => ({ ...f, opening_balance: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Data do saldo inicial</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={form.opening_balance_date}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, opening_balance_date: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                />
                Conta padrão
              </label>
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

export default function CorporateAccountsPage() {
  return (
    <CorporateFinanceGuard>
      <AccountsInner />
    </CorporateFinanceGuard>
  );
}
