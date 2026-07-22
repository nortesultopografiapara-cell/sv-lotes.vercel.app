'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Download, Plus, X } from 'lucide-react';
import {
  CORPORATE_PAYMENT_METHODS,
  CORPORATE_PAYABLE_STATUSES,
  corporatePayableStatusLabel,
  corporatePaymentMethodLabel,
  type MasterCorporatePayable,
  type MasterCorporatePayableKpis,
} from '@/lib/master/corporateFinance/arApTypes';
import type {
  MasterCorporateCostCenter,
  MasterCorporateFinancialAccount,
  MasterCorporateFinancialCategory,
} from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import {
  CorporateFinanceSemanticBadge,
  CorporateFinanceSemanticKpi,
} from './CorporateFinanceSemantic';
import { computeLiveNet, formatCurrency, formatDate, todayISO } from './format';
import { semanticToneForPayableStatus } from '@/lib/master/corporateFinance/semantic';
import styles from './corporateFinance.module.css';

type LookupProject = { id: string; code: string; title: string };

type FormState = {
  description: string;
  supplier_name: string;
  supplier_document: string;
  supplier_phone: string;
  supplier_email: string;
  category_id: string;
  project_id: string;
  cost_center_id: string;
  financial_account_id: string;
  issue_date: string;
  competence_date: string;
  due_date: string;
  original_amount: string;
  discount_amount: string;
  interest_amount: string;
  fine_amount: string;
  payment_method: string;
  notes: string;
  status: 'DRAFT' | 'OPEN';
};

type SettleForm = {
  financial_account_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string;
  notes: string;
};

const EMPTY_FORM = (): FormState => {
  const t = todayISO();
  return {
    description: '',
    supplier_name: '',
    supplier_document: '',
    supplier_phone: '',
    supplier_email: '',
    category_id: '',
    project_id: '',
    cost_center_id: '',
    financial_account_id: '',
    issue_date: t,
    competence_date: t,
    due_date: t,
    original_amount: '0',
    discount_amount: '0',
    interest_amount: '0',
    fine_amount: '0',
    payment_method: '',
    notes: '',
    status: 'OPEN',
  };
};

const EMPTY_KPIS: MasterCorporatePayableKpis = {
  totalOpen: 0,
  dueThisMonth: 0,
  paidThisMonth: 0,
  overdue: 0,
  openCount: 0,
  partialCount: 0,
  paidCount: 0,
};

function fromPayable(r: MasterCorporatePayable): FormState {
  return {
    description: r.description || '',
    supplier_name: r.supplier_name || '',
    supplier_document: r.supplier_document || '',
    supplier_phone: r.supplier_phone || '',
    supplier_email: r.supplier_email || '',
    category_id: r.category_id || '',
    project_id: r.project_id || '',
    cost_center_id: r.cost_center_id || '',
    financial_account_id: r.financial_account_id || '',
    issue_date: r.issue_date?.slice(0, 10) || todayISO(),
    competence_date: r.competence_date?.slice(0, 10) || todayISO(),
    due_date: r.due_date?.slice(0, 10) || todayISO(),
    original_amount: String(r.original_amount ?? 0),
    discount_amount: String(r.discount_amount ?? 0),
    interest_amount: String(r.interest_amount ?? 0),
    fine_amount: String(r.fine_amount ?? 0),
    payment_method: r.payment_method || '',
    notes: r.notes || '',
    status: r.status === 'DRAFT' ? 'DRAFT' : 'OPEN',
  };
}

function StatusBadge({ status }: { status: string }) {
  return (
    <CorporateFinanceSemanticBadge tone={semanticToneForPayableStatus(status)}>
      {corporatePayableStatusLabel(status)}
    </CorporateFinanceSemanticBadge>
  );
}

function canSettle(r: MasterCorporatePayable) {
  return (
    !r.is_archived &&
    !r.canceled_at &&
    Number(r.remaining_amount) > 0 &&
    ['OPEN', 'PARTIAL', 'OVERDUE', 'DRAFT'].includes(r.status)
  );
}

function canEdit(r: MasterCorporatePayable) {
  return !r.is_archived && !r.canceled_at && r.status !== 'PAID';
}

function PayablesInner() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<MasterCorporatePayable[]>([]);
  const [kpis, setKpis] = useState<MasterCorporatePayableKpis>(EMPTY_KPIS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [categories, setCategories] = useState<MasterCorporateFinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<MasterCorporateFinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<MasterCorporateCostCenter[]>([]);
  const [projects, setProjects] = useState<LookupProject[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MasterCorporatePayable | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState<MasterCorporatePayable | null>(null);
  const [settleForm, setSettleForm] = useState<SettleForm>({
    financial_account_id: '',
    payment_date: todayISO(),
    amount: '',
    payment_method: 'PIX',
    reference: '',
    notes: '',
  });
  const [settleSaving, setSettleSaving] = useState(false);

  const liveNet = useMemo(
    () =>
      computeLiveNet({
        original: form.original_amount,
        discount: form.discount_amount,
        interest: form.interest_amount,
        fine: form.fine_amount,
      }),
    [form.original_amount, form.discount_amount, form.interest_amount, form.fine_amount],
  );

  const settleRemainingBefore = settling ? Number(settling.remaining_amount) || 0 : 0;
  const settleAmount = Number(settleForm.amount) || 0;
  const settleRemainingAfter = Math.max(
    0,
    Math.round((settleRemainingBefore - settleAmount + Number.EPSILON) * 100) / 100,
  );

  const loadLookups = useCallback(async () => {
    if (!userId) return;
    const authQs = qs();
    try {
      const [catRes, accRes, ccRes, projRes] = await Promise.all([
        fetch(`/api/master/corporate-finance/categories?${authQs}&includeInactive=0&type=EXPENSE`),
        fetch(`/api/master/corporate-finance/accounts?${authQs}`),
        fetch(`/api/master/corporate-finance/cost-centers?${authQs}`),
        fetch(`/api/master/topography/projects?${authQs}&limit=100`),
      ]);
      const [catData, accData, ccData, projData] = await Promise.all([
        catRes.json(),
        accRes.json(),
        ccRes.json(),
        projRes.json(),
      ]);
      if (catRes.ok) setCategories(catData.categories || []);
      if (accRes.ok) {
        setAccounts((accData.accounts || []).filter((a: MasterCorporateFinancialAccount) => a.is_active));
      }
      if (ccRes.ok) {
        setCostCenters(
          (ccData.costCenters || []).filter((c: MasterCorporateCostCenter) => c.is_active),
        );
      }
      if (projRes.ok) setProjects(projData.projects || []);
    } catch {
      /* lookups opcionais */
    }
  }, [userId, qs]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const p = new URLSearchParams(qs());
      if (q.trim()) p.set('q', q.trim());
      if (status) p.set('status', status);
      if (projectId) p.set('projectId', projectId);
      if (fromDate) p.set('fromDate', fromDate);
      if (toDate) p.set('toDate', toDate);
      if (overdueOnly) p.set('overdueOnly', '1');
      if (includeArchived) p.set('includeArchived', '1');
      p.set('page', String(page));
      p.set('limit', String(limit));

      const res = await fetch(`/api/master/corporate-finance/payables?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar pagáveis.');
      setRows(data.payables || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs, q, status, projectId, fromDate, toDate, overdueOnly, includeArchived, page, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM());
    setModalOpen(true);
  }

  function openEdit(r: MasterCorporatePayable) {
    setEditing(r);
    setForm(fromPayable(r));
    setModalOpen(true);
  }

  function openSettle(r: MasterCorporatePayable) {
    setSettling(r);
    const defaultAccount =
      r.financial_account_id || accounts.find((a) => a.is_default)?.id || accounts[0]?.id || '';
    setSettleForm({
      financial_account_id: defaultAccount,
      payment_date: todayISO(),
      amount: String(r.remaining_amount ?? 0),
      payment_method: r.payment_method || 'PIX',
      reference: '',
      notes: '',
    });
    setSettleOpen(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...bodyAuth(),
        description: form.description,
        supplier_name: form.supplier_name,
        supplier_document: form.supplier_document || null,
        supplier_phone: form.supplier_phone || null,
        supplier_email: form.supplier_email || null,
        category_id: form.category_id,
        project_id: form.project_id || null,
        cost_center_id: form.cost_center_id || null,
        financial_account_id: form.financial_account_id || null,
        issue_date: form.issue_date,
        competence_date: form.competence_date,
        due_date: form.due_date,
        original_amount: Number(form.original_amount || 0),
        discount_amount: Number(form.discount_amount || 0),
        interest_amount: Number(form.interest_amount || 0),
        fine_amount: Number(form.fine_amount || 0),
        payment_method: form.payment_method || null,
        notes: form.notes || null,
        status: editing ? undefined : form.status,
      };
      const url = editing
        ? `/api/master/corporate-finance/payables/${editing.id}`
        : '/api/master/corporate-finance/payables';
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

  async function submitSettle() {
    if (!settling) return;
    setSettleSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${settling.id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          financial_account_id: settleForm.financial_account_id,
          payment_date: settleForm.payment_date,
          amount: Number(settleForm.amount || 0),
          payment_method: settleForm.payment_method,
          reference: settleForm.reference || null,
          notes: settleForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao pagar.');
      setSettleOpen(false);
      setSettling(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pagar.');
    } finally {
      setSettleSaving(false);
    }
  }

  async function cancelPayable(r: MasterCorporatePayable) {
    const reason = window.prompt('Motivo do cancelamento:');
    if (reason == null) return;
    if (!reason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${r.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao cancelar.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cancelar.');
    }
  }

  async function archiveOrRestore(r: MasterCorporatePayable) {
    const action = r.is_archived ? 'restore' : 'archive';
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${r.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyAuth()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Falha ao ${r.is_archived ? 'restaurar' : 'arquivar'}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na operação.');
    }
  }

  function exportCsv() {
    const p = new URLSearchParams(qs());
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (fromDate) p.set('fromDate', fromDate);
    if (toDate) p.set('toDate', toDate);
    if (overdueOnly) p.set('overdueOnly', '1');
    if (includeArchived) p.set('includeArchived', '1');
    p.set('export', 'csv');
    window.open(`/api/master/corporate-finance/payables?${p.toString()}`, '_blank');
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function renderActions(r: MasterCorporatePayable) {
    return (
      <div className={styles.rowActions}>
        <Link
          href={`/master/corporate-finance/payables/${r.id}`}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          Detalhe
        </Link>
        {canEdit(r) ? (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => openEdit(r)}>
            Editar
          </button>
        ) : null}
        {canSettle(r) ? (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => openSettle(r)}>
            Pagar
          </button>
        ) : null}
        {!r.canceled_at && !r.is_archived && r.status !== 'PAID' ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => void cancelPayable(r)}
          >
            Cancelar
          </button>
        ) : null}
        {!r.canceled_at ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => void archiveOrRestore(r)}
          >
            {r.is_archived ? 'Restaurar' : 'Arquivar'}
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>Contas a pagar</h1>
            <p className={styles.subtitle}>
              Títulos a pagar do Master — liquidações, filtros e exportação CSV.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/master/topography/finance" className={`${styles.btn} ${styles.btnGhost}`}>
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
            <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={exportCsv}>
              <Download className="w-4 h-4" />
              CSV
            </button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Novo título
            </button>
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <div className={styles.kpisWide}>
          <CorporateFinanceSemanticKpi
            label="Em aberto"
            value={formatCurrency(kpis.totalOpen)}
            tone="open"
          />
          <CorporateFinanceSemanticKpi
            label="Vence no mês"
            value={formatCurrency(kpis.dueThisMonth)}
            tone="dueMonth"
          />
          <CorporateFinanceSemanticKpi
            label="Pago no mês"
            value={formatCurrency(kpis.paidThisMonth)}
            hint="Saída de caixa"
            tone="expense"
          />
          <CorporateFinanceSemanticKpi
            label="Vencido"
            value={formatCurrency(kpis.overdue)}
            tone="overdue"
          />
          <CorporateFinanceSemanticKpi label="Qtd. abertos" value={kpis.openCount} tone="open" />
          <CorporateFinanceSemanticKpi
            label="Qtd. parciais"
            value={kpis.partialCount}
            tone="partial"
          />
          <CorporateFinanceSemanticKpi label="Qtd. pagos" value={kpis.paidCount} tone="received" />
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Pagáveis</h2>
            <span className={styles.muted} style={{ padding: 0 }}>
              {total} registro{total === 1 ? '' : 's'}
            </span>
          </div>

          <div className={styles.filters}>
            <div className={styles.filtersRow}>
              <div>
                <label className={styles.label}>Busca</label>
                <input
                  className={styles.input}
                  placeholder="Código, fornecedor, descrição…"
                  value={q}
                  onChange={(e) => {
                    setPage(1);
                    setQ(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className={styles.label}>Status</label>
                <select
                  className={styles.select}
                  value={status}
                  onChange={(e) => {
                    setPage(1);
                    setStatus(e.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  {CORPORATE_PAYABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {corporatePayableStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Projeto</label>
                <select
                  className={styles.select}
                  value={projectId}
                  onChange={(e) => {
                    setPage(1);
                    setProjectId(e.target.value);
                  }}
                >
                  <option value="">Todos</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>De</label>
                <input
                  className={styles.input}
                  type="date"
                  value={fromDate}
                  onChange={(e) => {
                    setPage(1);
                    setFromDate(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className={styles.label}>Até</label>
                <input
                  className={styles.input}
                  type="date"
                  value={toDate}
                  onChange={(e) => {
                    setPage(1);
                    setToDate(e.target.value);
                  }}
                />
              </div>
            </div>
            <div className={styles.filtersChecks}>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={overdueOnly}
                  onChange={(e) => {
                    setPage(1);
                    setOverdueOnly(e.target.checked);
                  }}
                />
                Somente vencidos
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => {
                    setPage(1);
                    setIncludeArchived(e.target.checked);
                  }}
                />
                Incluir arquivados
              </label>
            </div>
          </div>

          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhum pagável encontrado.</p>
          ) : (
            <>
              <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Fornecedor</th>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Líquido</th>
                      <th>Pago</th>
                      <th>Saldo</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.code}</td>
                        <td>{r.supplier_name}</td>
                        <td>{r.description}</td>
                        <td>{formatDate(r.due_date)}</td>
                        <td>{formatCurrency(r.net_amount)}</td>
                        <td>{formatCurrency(r.paid_amount)}</td>
                        <td>{formatCurrency(r.remaining_amount)}</td>
                        <td>
                          <StatusBadge status={r.status} />
                        </td>
                        <td>{renderActions(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className={`${styles.cards} ${styles.mobileOnly}`}>
                {rows.map((r) => (
                  <div key={r.id} className={styles.card}>
                    <div className={styles.cardRow}>
                      <p className={styles.cardTitle}>{r.code}</p>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className={styles.cardMeta}>
                      {r.supplier_name} — {r.description}
                    </p>
                    <div className={styles.cardRow}>
                      <span>Venc. {formatDate(r.due_date)}</span>
                      <span>{formatCurrency(r.remaining_amount)}</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span>Líq. {formatCurrency(r.net_amount)}</span>
                      <span>Pago {formatCurrency(r.paid_amount)}</span>
                    </div>
                    {renderActions(r)}
                  </div>
                ))}
              </div>
            </>
          )}

          <div className={styles.pagination}>
            <span className={styles.muted} style={{ padding: 0 }}>
              Página {page} de {totalPages}
            </span>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={`${styles.modal} ${styles.modalLg}`}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>
                {editing ? `Editar ${editing.code}` : 'Novo pagável'}
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
                <label className={styles.label}>Descrição *</label>
                <input
                  className={styles.input}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Fornecedor *</label>
                  <input
                    className={styles.input}
                    value={form.supplier_name}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Documento</label>
                  <input
                    className={styles.input}
                    value={form.supplier_document}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_document: e.target.value }))}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Telefone</label>
                  <input
                    className={styles.input}
                    value={form.supplier_phone}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>E-mail</label>
                  <input
                    className={styles.input}
                    type="email"
                    value={form.supplier_email}
                    onChange={(e) => setForm((f) => ({ ...f, supplier_email: e.target.value }))}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Categoria *</label>
                  <select
                    className={styles.select}
                    value={form.category_id}
                    onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                  >
                    <option value="">Selecione…</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Projeto</label>
                  <select
                    className={styles.select}
                    value={form.project_id}
                    onChange={(e) => setForm((f) => ({ ...f, project_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} — {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Centro de resultado</label>
                  <select
                    className={styles.select}
                    value={form.cost_center_id}
                    onChange={(e) => setForm((f) => ({ ...f, cost_center_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {costCenters.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Conta financeira</label>
                  <select
                    className={styles.select}
                    value={form.financial_account_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, financial_account_id: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className={styles.label}>Forma de pagamento</label>
                <select
                  className={styles.select}
                  value={form.payment_method}
                  onChange={(e) => setForm((f) => ({ ...f, payment_method: e.target.value }))}
                >
                  <option value="">—</option>
                  {CORPORATE_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {corporatePaymentMethodLabel(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Emissão</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={form.issue_date}
                    onChange={(e) => setForm((f) => ({ ...f, issue_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Competência</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={form.competence_date}
                    onChange={(e) => setForm((f) => ({ ...f, competence_date: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Vencimento *</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Valor original *</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.original_amount}
                    onChange={(e) => setForm((f) => ({ ...f, original_amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Desconto</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.discount_amount}
                    onChange={(e) => setForm((f) => ({ ...f, discount_amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Juros</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.interest_amount}
                    onChange={(e) => setForm((f) => ({ ...f, interest_amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={styles.label}>Multa</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.fine_amount}
                    onChange={(e) => setForm((f) => ({ ...f, fine_amount: e.target.value }))}
                  />
                </div>
              </div>
              <p className={styles.netHint}>Valor líquido: {formatCurrency(liveNet)}</p>
              {!editing ? (
                <div>
                  <label className={styles.label}>Status inicial</label>
                  <select
                    className={styles.select}
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        status: e.target.value === 'DRAFT' ? 'DRAFT' : 'OPEN',
                      }))
                    }
                  >
                    <option value="OPEN">Em aberto</option>
                    <option value="DRAFT">Rascunho</option>
                  </select>
                </div>
              ) : null}
              <div>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setModalOpen(false)}
              >
                Fechar
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

      {settleOpen && settling ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Pagar {settling.code}</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setSettleOpen(false)}
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.netHint}>
                Saldo antes: {formatCurrency(settleRemainingBefore)} → depois:{' '}
                {formatCurrency(settleRemainingAfter)}
              </p>
              <div>
                <label className={styles.label}>Conta *</label>
                <select
                  className={styles.select}
                  value={settleForm.financial_account_id}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, financial_account_id: e.target.value }))
                  }
                >
                  <option value="">Selecione…</option>
                  {accounts.map((a) => (
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
                    className={styles.input}
                    type="date"
                    value={settleForm.payment_date}
                    onChange={(e) =>
                      setSettleForm((f) => ({ ...f, payment_date: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label}>Valor *</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={settleForm.amount}
                    onChange={(e) => setSettleForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Forma *</label>
                <select
                  className={styles.select}
                  value={settleForm.payment_method}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, payment_method: e.target.value }))
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
                  value={settleForm.reference}
                  onChange={(e) => setSettleForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </div>
              <div>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={settleForm.notes}
                  onChange={(e) => setSettleForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setSettleOpen(false)}
              >
                Fechar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={settleSaving}
                onClick={() => void submitSettle()}
              >
                {settleSaving ? 'Salvando…' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CorporatePayablesPage() {
  return (
    <CorporateFinanceGuard>
      <PayablesInner />
    </CorporateFinanceGuard>
  );
}
