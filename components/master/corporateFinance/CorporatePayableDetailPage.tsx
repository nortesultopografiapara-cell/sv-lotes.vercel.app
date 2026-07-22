'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, X } from 'lucide-react';
import {
  CORPORATE_PAYMENT_METHODS,
  corporatePayableStatusColor,
  corporatePayableStatusLabel,
  corporatePaymentMethodLabel,
  type MasterCorporatePayable,
  type MasterCorporatePayablePayment,
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
import { computeLiveNet, formatCurrency, formatDate, todayISO } from './format';
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
};

type SettleForm = {
  financial_account_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string;
  notes: string;
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
  };
}

function DetailInner() {
  const params = useParams();
  const id = String(params?.id || '');
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();

  const [row, setRow] = useState<MasterCorporatePayable | null>(null);
  const [payments, setPayments] = useState<MasterCorporatePayablePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [categories, setCategories] = useState<MasterCorporateFinancialCategory[]>([]);
  const [accounts, setAccounts] = useState<MasterCorporateFinancialAccount[]>([]);
  const [costCenters, setCostCenters] = useState<MasterCorporateCostCenter[]>([]);
  const [projects, setProjects] = useState<LookupProject[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const [settleOpen, setSettleOpen] = useState(false);
  const [settleForm, setSettleForm] = useState<SettleForm>({
    financial_account_id: '',
    payment_date: todayISO(),
    amount: '',
    payment_method: 'PIX',
    reference: '',
    notes: '',
  });
  const [settleSaving, setSettleSaving] = useState(false);

  const liveNet = useMemo(() => {
    if (!form) return 0;
    return computeLiveNet({
      original: form.original_amount,
      discount: form.discount_amount,
      interest: form.interest_amount,
      fine: form.fine_amount,
    });
  }, [form]);

  const load = useCallback(async () => {
    if (!userId || !id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${id}?${qs()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao carregar pagável.');
      setRow(data.payable);
      setPayments(data.payments || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, id, qs]);

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
      /* ignore */
    }
  }, [userId, qs]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void loadLookups();
  }, [loadLookups]);

  function openEdit() {
    if (!row) return;
    setForm(fromPayable(row));
    setModalOpen(true);
  }

  function openSettle() {
    if (!row) return;
    const defaultAccount =
      row.financial_account_id || accounts.find((a) => a.is_default)?.id || accounts[0]?.id || '';
    setSettleForm({
      financial_account_id: defaultAccount,
      payment_date: todayISO(),
      amount: String(row.remaining_amount ?? 0),
      payment_method: row.payment_method || 'PIX',
      reference: '',
      notes: '',
    });
    setSettleOpen(true);
  }

  async function save() {
    if (!form || !row) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        }),
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
    if (!row) return;
    setSettleSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${row.id}/pay`, {
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
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao pagar.');
    } finally {
      setSettleSaving(false);
    }
  }

  async function cancelPayable() {
    if (!row) return;
    const reason = window.prompt('Motivo do cancelamento:');
    if (reason == null) return;
    if (!reason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${row.id}/cancel`, {
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

  async function archiveOrRestore() {
    if (!row) return;
    const action = row.is_archived ? 'restore' : 'archive';
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${row.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyAuth()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na operação.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na operação.');
    }
  }

  async function reversePayment(payment: MasterCorporatePayablePayment) {
    if (!row || payment.is_reversed) return;
    const reason = window.prompt('Motivo do estorno:');
    if (reason == null) return;
    if (!reason.trim()) {
      setError('Informe o motivo do estorno.');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/payables/${row.id}/reverse-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          paymentId: payment.id,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao estornar.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao estornar.');
    }
  }

  const canSettle =
    row &&
    !row.is_archived &&
    !row.canceled_at &&
    Number(row.remaining_amount) > 0 &&
    ['OPEN', 'PARTIAL', 'OVERDUE', 'DRAFT'].includes(row.status);

  const canEdit = row && !row.is_archived && !row.canceled_at && row.status !== 'PAID';

  const settleRemainingBefore = row ? Number(row.remaining_amount) || 0 : 0;
  const settleAmount = Number(settleForm.amount) || 0;
  const settleRemainingAfter = Math.max(
    0,
    Math.round((settleRemainingBefore - settleAmount + Number.EPSILON) * 100) / 100,
  );

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>{row ? `Pagável ${row.code}` : 'Pagável'}</h1>
            <p className={styles.subtitle}>Detalhe do título, liquidações e estornos.</p>
          </div>
          <div className={styles.actions}>
            <Link
              href="/master/corporate-finance/payables"
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              <ArrowLeft className="w-4 h-4" />
              Lista
            </Link>
            {canEdit ? (
              <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={openEdit}>
                Editar
              </button>
            ) : null}
            {canSettle ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={openSettle}
              >
                Pagar
              </button>
            ) : null}
            {row && !row.canceled_at && !row.is_archived && row.status !== 'PAID' ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnDanger}`}
                onClick={() => void cancelPayable()}
              >
                Cancelar
              </button>
            ) : null}
            {row && !row.canceled_at ? (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => void archiveOrRestore()}
              >
                {row.is_archived ? 'Restaurar' : 'Arquivar'}
              </button>
            ) : null}
          </div>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {loading ? (
          <p className={styles.muted}>Carregando…</p>
        ) : !row ? (
          <p className={styles.muted}>Pagável não encontrado.</p>
        ) : (
          <>
            <div className={styles.panel} style={{ marginBottom: '1.5rem' }}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Dados do título</h2>
                <span
                  className={styles.statusBadge}
                  style={{ background: corporatePayableStatusColor(row.status) }}
                >
                  {corporatePayableStatusLabel(row.status)}
                </span>
              </div>
              <div className={styles.detailGrid}>
                <div className={styles.detailItem}>
                  <label>Fornecedor</label>
                  <p>{row.supplier_name}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Descrição</label>
                  <p>{row.description}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Documento</label>
                  <p>{row.supplier_document || '—'}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Contato</label>
                  <p>
                    {[row.supplier_phone, row.supplier_email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className={styles.detailItem}>
                  <label>Emissão</label>
                  <p>{formatDate(row.issue_date)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Competência</label>
                  <p>{formatDate(row.competence_date)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Vencimento</label>
                  <p>{formatDate(row.due_date)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Forma</label>
                  <p>{corporatePaymentMethodLabel(row.payment_method)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Original</label>
                  <p>{formatCurrency(row.original_amount)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Desconto / Juros / Multa</label>
                  <p>
                    {formatCurrency(row.discount_amount)} / {formatCurrency(row.interest_amount)} /{' '}
                    {formatCurrency(row.fine_amount)}
                  </p>
                </div>
                <div className={styles.detailItem}>
                  <label>Líquido</label>
                  <p>{formatCurrency(row.net_amount)}</p>
                </div>
                <div className={styles.detailItem}>
                  <label>Pago / Saldo</label>
                  <p>
                    {formatCurrency(row.paid_amount)} / {formatCurrency(row.remaining_amount)}
                  </p>
                </div>
                {row.cancellation_reason ? (
                  <div className={styles.detailItem}>
                    <label>Cancelamento</label>
                    <p>
                      {row.cancellation_reason} ({formatDate(row.canceled_at)})
                    </p>
                  </div>
                ) : null}
                {row.notes ? (
                  <div className={styles.detailItem}>
                    <label>Observações</label>
                    <p>{row.notes}</p>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={styles.panel}>
              <div className={styles.panelHead}>
                <h2 className={styles.panelTitle}>Histórico de pagamentos</h2>
              </div>
              {payments.length === 0 ? (
                <p className={styles.muted}>Nenhum pagamento registrado.</p>
              ) : (
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Valor</th>
                        <th>Forma</th>
                        <th>Referência</th>
                        <th>Status</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.map((p) => (
                        <tr key={p.id}>
                          <td>{formatDate(p.payment_date)}</td>
                          <td>{formatCurrency(p.amount)}</td>
                          <td>{corporatePaymentMethodLabel(p.payment_method)}</td>
                          <td>{p.reference || '—'}</td>
                          <td>
                            {p.is_reversed ? (
                              <span className={`${styles.badge} ${styles.badgeOff}`}>
                                Estornado
                              </span>
                            ) : (
                              <span className={`${styles.badge} ${styles.badgeOn}`}>Ativo</span>
                            )}
                          </td>
                          <td>
                            {!p.is_reversed ? (
                              <button
                                type="button"
                                className={`${styles.btn} ${styles.btnDanger}`}
                                onClick={() => void reversePayment(p)}
                              >
                                Estornar
                              </button>
                            ) : (
                              <span className={styles.muted} style={{ padding: 0 }}>
                                {p.reversal_reason || '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {modalOpen && form ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={`${styles.modal} ${styles.modalLg}`}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Editar pagável</h3>
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
                  onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Fornecedor *</label>
                  <input
                    className={styles.input}
                    value={form.supplier_name}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, supplier_name: e.target.value } : f))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label}>Documento</label>
                  <input
                    className={styles.input}
                    value={form.supplier_document}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, supplier_document: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Telefone</label>
                  <input
                    className={styles.input}
                    value={form.supplier_phone}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, supplier_phone: e.target.value } : f))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label}>E-mail</label>
                  <input
                    className={styles.input}
                    value={form.supplier_email}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, supplier_email: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Categoria *</label>
                  <select
                    className={styles.select}
                    value={form.category_id}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, category_id: e.target.value } : f))
                    }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, project_id: e.target.value } : f))
                    }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, cost_center_id: e.target.value } : f))
                    }
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
                      setForm((f) => (f ? { ...f, financial_account_id: e.target.value } : f))
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
                  onChange={(e) =>
                    setForm((f) => (f ? { ...f, payment_method: e.target.value } : f))
                  }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, issue_date: e.target.value } : f))
                    }
                  />
                </div>
                <div>
                  <label className={styles.label}>Competência</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={form.competence_date}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, competence_date: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <div>
                <label className={styles.label}>Vencimento *</label>
                <input
                  className={styles.input}
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => (f ? { ...f, due_date: e.target.value } : f))}
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, original_amount: e.target.value } : f))
                    }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, discount_amount: e.target.value } : f))
                    }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, interest_amount: e.target.value } : f))
                    }
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
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, fine_amount: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <p className={styles.netHint}>Valor líquido: {formatCurrency(liveNet)}</p>
              <div>
                <label className={styles.label}>Observações</label>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => setForm((f) => (f ? { ...f, notes: e.target.value } : f))}
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

      {settleOpen && row ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Pagar {row.code}</h3>
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

export default function CorporatePayableDetailPage() {
  return (
    <CorporateFinanceGuard>
      <DetailInner />
    </CorporateFinanceGuard>
  );
}
