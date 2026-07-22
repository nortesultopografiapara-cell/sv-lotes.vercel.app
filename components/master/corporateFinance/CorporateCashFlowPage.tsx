'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  CORPORATE_PAYMENT_METHODS,
  corporatePaymentMethodLabel,
} from '@/lib/master/corporateFinance/arApTypes';
import {
  CORPORATE_CASH_MOVEMENT_ORIGINS,
  CORPORATE_CASH_MOVEMENT_TYPES,
  corporateCashOriginLabel,
  corporateCashTypeLabel,
  type MasterCorporateCashKpis,
  type MasterCorporateCashMovement,
} from '@/lib/master/corporateFinance/cashTypes';
import type {
  MasterCorporateCostCenter,
  MasterCorporateFinancialAccount,
  MasterCorporateFinancialCategory,
} from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceSemanticKpi,
} from './CorporateFinanceSemantic';
import { semanticToneForResult } from '@/lib/master/corporateFinance/semantic';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import { formatCurrency, formatDate, todayISO } from './format';
import styles from './corporateFinance.module.css';

type Row = MasterCorporateCashMovement & { running_balance: number | null };

type ManualForm = {
  type: 'INCOME' | 'EXPENSE';
  movement_date: string;
  competence_date: string;
  description: string;
  amount: string;
  financial_account_id: string;
  category_id: string;
  cost_center_id: string;
  project_id: string;
  payment_method: string;
  reference: string;
  notes: string;
};

type TransferForm = {
  from_account_id: string;
  to_account_id: string;
  movement_date: string;
  amount: string;
  notes: string;
};

function incomeExpense(m: MasterCorporateCashMovement): { income: number; expense: number } {
  if (m.is_reversed) return { income: 0, expense: 0 };
  if (m.type === 'INCOME') return { income: m.amount, expense: 0 };
  if (m.type === 'EXPENSE') return { income: 0, expense: m.amount };
  if (m.type === 'REVERSAL') {
    const n = String(m.notes || '');
    if (n.includes('[REV:INCOME]')) return { income: 0, expense: m.amount };
    if (n.includes('[REV:EXPENSE]')) return { income: m.amount, expense: 0 };
  }
  return { income: 0, expense: 0 };
}

function CashFlowInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [kpis, setKpis] = useState<MasterCorporateCashKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [origin, setOrigin] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [includeReversed, setIncludeReversed] = useState(false);

  const [accounts, setAccounts] = useState<MasterCorporateFinancialAccount[]>([]);
  const [categories, setCategories] = useState<MasterCorporateFinancialCategory[]>([]);
  const [costCenters, setCostCenters] = useState<MasterCorporateCostCenter[]>([]);

  const [manualOpen, setManualOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const [manual, setManual] = useState<ManualForm>({
    type: 'INCOME',
    movement_date: todayISO(),
    competence_date: todayISO(),
    description: '',
    amount: '',
    financial_account_id: '',
    category_id: '',
    cost_center_id: '',
    project_id: '',
    payment_method: 'PIX',
    reference: '',
    notes: '',
  });

  const [transfer, setTransfer] = useState<TransferForm>({
    from_account_id: '',
    to_account_id: '',
    movement_date: todayISO(),
    amount: '',
    notes: '',
  });

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => map.get(id) || id.slice(0, 8);
  }, [accounts]);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? map.get(id) || '—' : '—');
  }, [categories]);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === manual.type && c.is_active),
    [categories, manual.type],
  );

  const loadLookups = useCallback(async () => {
    if (!userId) return;
    const [aRes, cRes, ccRes] = await Promise.all([
      fetch(`/api/master/corporate-finance/accounts?${qs()}&includeInactive=1`),
      fetch(`/api/master/corporate-finance/categories?${qs()}&includeInactive=1`),
      fetch(`/api/master/corporate-finance/cost-centers?${qs()}&includeInactive=1`),
    ]);
    const aData = await aRes.json();
    const cData = await cRes.json();
    const ccData = await ccRes.json();
    if (aRes.ok) setAccounts(aData.accounts || []);
    if (cRes.ok) setCategories(cData.categories || []);
    if (ccRes.ok) setCostCenters(ccData.costCenters || []);
  }, [userId, qs]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams(qs());
      if (q.trim()) p.set('q', q.trim());
      if (type) p.set('type', type);
      if (origin) p.set('origin', origin);
      if (accountId) p.set('financialAccountId', accountId);
      if (categoryId) p.set('categoryId', categoryId);
      if (costCenterId) p.set('costCenterId', costCenterId);
      if (paymentMethod) p.set('paymentMethod', paymentMethod);
      if (fromDate) p.set('fromDate', fromDate);
      if (toDate) p.set('toDate', toDate);
      if (includeReversed) p.set('includeReversed', '1');
      p.set('page', '1');
      p.set('limit', '500');

      const res = await fetch(`/api/master/corporate-finance/cash-movements?${p}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar fluxo.');
      setRows(data.movements || []);
      setKpis(data.kpis || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [
    userId,
    qs,
    q,
    type,
    origin,
    accountId,
    categoryId,
    costCenterId,
    paymentMethod,
    fromDate,
    toDate,
    includeReversed,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga filtrada
    void load();
  }, [load]);

  function openManual(kind: 'INCOME' | 'EXPENSE') {
    const defAccount = accounts.find((a) => a.is_default && a.is_active) || accounts.find((a) => a.is_active);
    setManual({
      type: kind,
      movement_date: todayISO(),
      competence_date: todayISO(),
      description: '',
      amount: '',
      financial_account_id: defAccount?.id || '',
      category_id: '',
      cost_center_id: '',
      project_id: '',
      payment_method: 'PIX',
      reference: '',
      notes: '',
    });
    setManualOpen(true);
  }

  async function saveManual() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/master/corporate-finance/cash-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          ...manual,
          amount: Number(manual.amount || 0),
          cost_center_id: manual.cost_center_id || null,
          project_id: manual.project_id || null,
          payment_method: manual.payment_method || null,
          reference: manual.reference || null,
          notes: manual.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar lançamento.');
      setManualOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function saveTransfer() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/master/corporate-finance/cash-movements/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          ...transfer,
          amount: Number(transfer.amount || 0),
          notes: transfer.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na transferência.');
      setTransferOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao transferir.');
    } finally {
      setSaving(false);
    }
  }

  async function runBackfill(dryRun: boolean) {
    setSaving(true);
    setBackfillMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/master/corporate-finance/cash-movements/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha no backfill.');
      const r = data.report;
      setBackfillMsg(
        `${dryRun ? 'Dry-run' : 'Backfill'}: encontrados AR ${r.receivablePaymentsFound} / AP ${r.payablePaymentsFound}; criados ${r.created}; ignorados ${r.skipped}; erros ${r.errors?.length || 0}.`,
      );
      if (!dryRun) await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro no backfill.');
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const p = new URLSearchParams(qs());
    if (q.trim()) p.set('q', q.trim());
    if (type) p.set('type', type);
    if (origin) p.set('origin', origin);
    if (accountId) p.set('financialAccountId', accountId);
    if (categoryId) p.set('categoryId', categoryId);
    if (costCenterId) p.set('costCenterId', costCenterId);
    if (paymentMethod) p.set('paymentMethod', paymentMethod);
    if (fromDate) p.set('fromDate', fromDate);
    if (toDate) p.set('toDate', toDate);
    if (includeReversed) p.set('includeReversed', '1');
    p.set('export', 'csv');
    window.open(`/api/master/corporate-finance/cash-movements?${p}`, '_blank');
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <div className={styles.headerRow}>
          <div>
            <Link href="/master/topography/finance" className={styles.btn + ' ' + styles.btnGhost}>
              <ArrowLeft className="w-4 h-4" />
              Hub Financeiro
            </Link>
            <p className={styles.eyebrow} style={{ marginTop: '0.75rem' }}>
              SV Topografia & Projetos · Master
            </p>
            <h1 className={styles.title}>Fluxo de Caixa Corporativo</h1>
            <p className={styles.subtitle}>
              Movimentações reais do caixa corporativo — entradas, saídas, transferências e
              estornos.
            </p>
          </div>
          <div className={styles.actions}>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => void load()}>
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={exportCsv}>
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => openManual('INCOME')}
            >
              <Plus className="w-4 h-4" />
              Nova Entrada
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => openManual('EXPENSE')}
            >
              <Plus className="w-4 h-4" />
              Nova Despesa
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={() => {
                const active = accounts.filter((a) => a.is_active);
                setTransfer({
                  from_account_id: active[0]?.id || '',
                  to_account_id: active[1]?.id || '',
                  movement_date: todayISO(),
                  amount: '',
                  notes: '',
                });
                setTransferOpen(true);
              }}
            >
              Transferir
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {backfillMsg ? <p className={styles.muted}>{backfillMsg}</p> : null}

        <div className={styles.kpisWide}>
          <CorporateFinanceSemanticKpi
            label="Saldo atual"
            value={loading || !kpis ? '—' : formatCurrency(kpis.currentBalance)}
            tone="balance"
          />
          <CorporateFinanceSemanticKpi
            label="Entradas no período"
            value={loading || !kpis ? '—' : formatCurrency(kpis.periodIncome)}
            tone="income"
          />
          <CorporateFinanceSemanticKpi
            label="Saídas no período"
            value={loading || !kpis ? '—' : formatCurrency(kpis.periodExpense)}
            tone="expense"
          />
          <CorporateFinanceSemanticKpi
            label="Resultado líquido"
            value={loading || !kpis ? '—' : formatCurrency(kpis.periodNet)}
            tone={semanticToneForResult(kpis?.periodNet || 0)}
          />
          <CorporateFinanceSemanticKpi
            label="Saldo inicial período"
            value={loading || !kpis ? '—' : formatCurrency(kpis.openingBalanceInPeriod)}
            tone="neutral"
          />
          <CorporateFinanceSemanticKpi
            label="Saldo final"
            value={loading || !kpis ? '—' : formatCurrency(kpis.closingBalance)}
            tone="balance"
          />
          <CorporateFinanceSemanticKpi
            label="Movimentos"
            value={loading || !kpis ? '—' : kpis.movementsCount}
            tone="neutral"
          />
        </div>

        <div className={styles.panel} style={{ marginBottom: '1rem' }}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Filtros</h2>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.mobileOnly}`}
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <div className={`${styles.filters} ${filtersOpen ? '' : styles.desktopOnly}`}>
            <div className={styles.filtersRow}>
              <div>
                <label className={styles.label}>Busca</label>
                <input className={styles.input} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div>
                <label className={styles.label}>De</label>
                <input
                  type="date"
                  className={styles.input}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.label}>Até</label>
                <input
                  type="date"
                  className={styles.input}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
              <div>
                <label className={styles.label}>Conta</label>
                <select
                  className={styles.select}
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  <option value="">Todas</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Tipo</label>
                <select className={styles.select} value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="">Todos</option>
                  {CORPORATE_CASH_MOVEMENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {corporateCashTypeLabel(t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Origem</label>
                <select
                  className={styles.select}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                >
                  <option value="">Todas</option>
                  {CORPORATE_CASH_MOVEMENT_ORIGINS.map((o) => (
                    <option key={o} value={o}>
                      {corporateCashOriginLabel(o)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Categoria</label>
                <select
                  className={styles.select}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Centro</label>
                <select
                  className={styles.select}
                  value={costCenterId}
                  onChange={(e) => setCostCenterId(e.target.value)}
                >
                  <option value="">Todos</option>
                  {costCenters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Forma</label>
                <select
                  className={styles.select}
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">Todas</option>
                  {CORPORATE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {corporatePaymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.filtersChecks}>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={includeReversed}
                  onChange={(e) => setIncludeReversed(e.target.checked)}
                />
                Incluir estornados
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={saving}
                onClick={() => void runBackfill(true)}
              >
                Backfill dry-run
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={saving}
                onClick={() => {
                  if (
                    window.confirm(
                      'Executar backfill real dos recebimentos/pagamentos sem movimento?',
                    )
                  ) {
                    void runBackfill(false);
                  }
                }}
              >
                Executar backfill
              </button>
            </div>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Movimentações</h2>
          </div>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhum movimento no filtro atual.</p>
          ) : (
            <>
              <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th>Tipo</th>
                      <th>Categoria</th>
                      <th>Conta</th>
                      <th>Origem</th>
                      <th>Entrada</th>
                      <th>Saída</th>
                      <th>Saldo acum.</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => {
                      const ie = incomeExpense(m);
                      return (
                        <tr key={m.id}>
                          <td>{formatDate(m.movement_date)}</td>
                          <td>{m.code}</td>
                          <td>{m.description}</td>
                          <td>{corporateCashTypeLabel(m.type)}</td>
                          <td>{categoryName(m.category_id)}</td>
                          <td>{accountName(m.financial_account_id)}</td>
                          <td>{corporateCashOriginLabel(m.origin)}</td>
                          <td>{ie.income ? formatCurrency(ie.income) : '—'}</td>
                          <td>{ie.expense ? formatCurrency(ie.expense) : '—'}</td>
                          <td>
                            {m.running_balance != null
                              ? formatCurrency(m.running_balance)
                              : '—'}
                          </td>
                          <td>
                            {m.is_reversed ? (
                              <span className={`${styles.badge} ${styles.badgeOff}`}>
                                Estornado
                              </span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeOn}`}>Ativo</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className={`${styles.cards} ${styles.mobileOnly}`}>
                {rows.map((m) => {
                  const ie = incomeExpense(m);
                  return (
                    <div key={m.id} className={styles.card}>
                      <p className={styles.cardTitle}>{m.code}</p>
                      <p className={styles.cardMeta}>{m.description}</p>
                      <div className={styles.cardRow}>
                        <span>{formatDate(m.movement_date)}</span>
                        <span>{corporateCashTypeLabel(m.type)}</span>
                      </div>
                      <div className={styles.cardRow}>
                        <span>Entrada {ie.income ? formatCurrency(ie.income) : '—'}</span>
                        <span>Saída {ie.expense ? formatCurrency(ie.expense) : '—'}</span>
                      </div>
                      <div className={styles.cardRow}>
                        <span>{accountName(m.financial_account_id)}</span>
                        <span>
                          {m.running_balance != null
                            ? formatCurrency(m.running_balance)
                            : '—'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {manualOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={`${styles.modal} ${styles.modalLg}`}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>
                {manual.type === 'INCOME' ? 'Nova entrada manual' : 'Nova despesa manual'}
              </h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setManualOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.label}>Descrição *</label>
                <input
                  className={styles.input}
                  value={manual.description}
                  onChange={(e) => setManual((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Data *</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={manual.movement_date}
                    onChange={(e) => setManual((f) => ({ ...f, movement_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Competência *</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={manual.competence_date}
                    onChange={(e) =>
                      setManual((f) => ({ ...f, competence_date: e.target.value }))
                    }
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Valor *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={styles.input}
                    value={manual.amount}
                    onChange={(e) => setManual((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Conta *</label>
                  <select
                    className={styles.select}
                    value={manual.financial_account_id}
                    onChange={(e) =>
                      setManual((f) => ({ ...f, financial_account_id: e.target.value }))
                    }
                  >
                    <option value="">Selecione</option>
                    {accounts
                      .filter((a) => a.is_active)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Categoria *</label>
                  <select
                    className={styles.select}
                    value={manual.category_id}
                    onChange={(e) => setManual((f) => ({ ...f, category_id: e.target.value }))}
                  >
                    <option value="">Selecione</option>
                    {filteredCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Centro</label>
                  <select
                    className={styles.select}
                    value={manual.cost_center_id}
                    onChange={(e) => setManual((f) => ({ ...f, cost_center_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {costCenters
                      .filter((c) => c.is_active)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Forma</label>
                  <select
                    className={styles.select}
                    value={manual.payment_method}
                    onChange={(e) =>
                      setManual((f) => ({ ...f, payment_method: e.target.value }))
                    }
                  >
                    {CORPORATE_PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {corporatePaymentMethodLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Referência</label>
                  <input
                    className={styles.input}
                    value={manual.reference}
                    onChange={(e) => setManual((f) => ({ ...f, reference: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.input}
                  rows={3}
                  value={manual.notes}
                  onChange={(e) => setManual((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setManualOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving}
                onClick={() => void saveManual()}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {transferOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Transferência entre contas</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setTransferOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <div>
                <label className={styles.label}>Origem *</label>
                <select
                  className={styles.select}
                  value={transfer.from_account_id}
                  onChange={(e) =>
                    setTransfer((f) => ({ ...f, from_account_id: e.target.value }))
                  }
                >
                  {accounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Destino *</label>
                <select
                  className={styles.select}
                  value={transfer.to_account_id}
                  onChange={(e) => setTransfer((f) => ({ ...f, to_account_id: e.target.value }))}
                >
                  {accounts
                    .filter((a) => a.is_active)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Data *</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={transfer.movement_date}
                    onChange={(e) =>
                      setTransfer((f) => ({ ...f, movement_date: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label}>Valor *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={styles.input}
                    value={transfer.amount}
                    onChange={(e) => setTransfer((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Observação</label>
                <textarea
                  className={styles.input}
                  rows={2}
                  value={transfer.notes}
                  onChange={(e) => setTransfer((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setTransferOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={saving}
                onClick={() => void saveTransfer()}
              >
                Transferir
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CorporateCashFlowPage() {
  return (
    <CorporateFinanceGuard>
      <CashFlowInner />
    </CorporateFinanceGuard>
  );
}
