'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Plus, X } from 'lucide-react';
import {
  CORPORATE_PAYMENT_METHODS,
  CORPORATE_RECEIVABLE_STATUSES,
  corporatePaymentMethodLabel,
  corporateReceivableStatusLabel,
  type MasterCorporateReceivable,
  type MasterCorporateReceivableKpis,
} from '@/lib/master/corporateFinance/arApTypes';
import {
  corporateBusinessUnitLabel,
  type CorporateBusinessUnit,
} from '@/lib/master/corporateFinance/businessUnit';
import type {
  MasterCorporateCostCenter,
  MasterCorporateFinancialAccount,
  MasterCorporateFinancialCategory,
} from '@/lib/master/corporateFinance/types';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import CorporateFinanceExportMenu from './CorporateFinanceExportMenu';
import {
  CorporateFinanceSemanticBadge,
  CorporateFinanceSemanticKpi,
} from './CorporateFinanceSemantic';
import ReceivableFormModal from './ReceivableFormModal';
import CorporateAsaasGenerateModal from './CorporateAsaasGenerateModal';
import CorporateAsaasViewModal from './CorporateAsaasViewModal';
import { MasterSecureDeleteModal } from '@/components/master/MasterSecureDeleteModal';
import { formatCurrency, formatDate, todayISO } from './format';
import {
  semanticToneForReceivableStatus,
} from '@/lib/master/corporateFinance/semantic';
import {
  receivableCanGenerateCorporateAsaasCharge,
  receivableCanViewCorporateAsaasCharge,
} from '@/lib/master/corporateFinance/asaas/types';
import styles from './corporateFinance.module.css';

type LookupProject = {
  id: string;
  code: string;
  title: string;
  client_name?: string;
  contract_value?: number;
  valor_recebido?: number;
  saldo_receber?: number;
};

type SettleForm = {
  financial_account_id: string;
  payment_date: string;
  amount: string;
  payment_method: string;
  reference: string;
  asaas_payment_id: string;
  notes: string;
};

const EMPTY_KPIS: MasterCorporateReceivableKpis = {
  totalOpen: 0,
  dueThisMonth: 0,
  receivedThisMonth: 0,
  overdue: 0,
  openCount: 0,
  partialCount: 0,
  receivedCount: 0,
};

function StatusBadge({ status }: { status: string }) {
  return (
    <CorporateFinanceSemanticBadge tone={semanticToneForReceivableStatus(status)}>
      {corporateReceivableStatusLabel(status)}
    </CorporateFinanceSemanticBadge>
  );
}

function canSettle(r: MasterCorporateReceivable) {
  return (
    !r.is_archived &&
    !r.canceled_at &&
    Number(r.remaining_amount) > 0 &&
    ['OPEN', 'PARTIAL', 'OVERDUE', 'DRAFT'].includes(r.status)
  );
}

function canEdit(r: MasterCorporateReceivable) {
  return !r.is_archived && !r.canceled_at && r.status !== 'RECEIVED';
}

function ReceivablesInner() {
  const searchParams = useSearchParams();
  const initialProjectId = searchParams.get('projectId') || '';
  const openNewFromQuery = searchParams.get('new') === '1';
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<MasterCorporateReceivable[]>([]);
  const [kpis, setKpis] = useState<MasterCorporateReceivableKpis>(EMPTY_KPIS);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [businessUnitFilter, setBusinessUnitFilter] = useState('');
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
  const [editing, setEditing] = useState<MasterCorporateReceivable | null>(null);
  const [formInitialProjectId, setFormInitialProjectId] = useState<string | null>(
    initialProjectId || null,
  );

  const [settleOpen, setSettleOpen] = useState(false);
  const [settling, setSettling] = useState<MasterCorporateReceivable | null>(null);
  const [settleForm, setSettleForm] = useState<SettleForm>({
    financial_account_id: '',
    payment_date: todayISO(),
    amount: '',
    payment_method: 'PIX',
    reference: '',
    asaas_payment_id: '',
    notes: '',
  });
  const [settleSaving, setSettleSaving] = useState(false);

  const [asaasGenerateFor, setAsaasGenerateFor] = useState<MasterCorporateReceivable | null>(null);
  const [asaasViewChargeId, setAsaasViewChargeId] = useState<string | null>(null);
  const [asaasViewCode, setAsaasViewCode] = useState<string | undefined>(undefined);

  const [deleteTarget, setDeleteTarget] = useState<MasterCorporateReceivable | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteLocalOnly, setDeleteLocalOnly] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
        fetch(`/api/master/corporate-finance/categories?${authQs}&includeInactive=0&type=INCOME`),
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
        setAccounts(
          (accData.accounts || []).filter((a: MasterCorporateFinancialAccount) => a.is_active),
        );
      }
      if (ccRes.ok) {
        setCostCenters(
          (ccData.costCenters || ccData.cost_centers || []).filter(
            (c: MasterCorporateCostCenter) => c.is_active,
          ),
        );
      }
      if (projRes.ok) {
        const list = (projData.projects || []) as LookupProject[];
        setProjects(
          list.map((p) => ({
            id: p.id,
            code: p.code,
            title: p.title,
            client_name: p.client_name,
            contract_value: p.contract_value,
            valor_recebido: p.valor_recebido,
            saldo_receber: p.saldo_receber,
          })),
        );
      }
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
      if (businessUnitFilter) p.set('businessUnit', businessUnitFilter);
      if (projectId) p.set('projectId', projectId);
      if (fromDate) p.set('fromDate', fromDate);
      if (toDate) p.set('toDate', toDate);
      if (overdueOnly) p.set('overdueOnly', '1');
      if (includeArchived) p.set('includeArchived', '1');
      p.set('page', String(page));
      p.set('limit', String(limit));

      const res = await fetch(`/api/master/corporate-finance/receivables?${p.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar recebíveis.');
      setRows(data.receivables || []);
      setTotal(data.total || 0);
      setKpis(data.kpis || EMPTY_KPIS);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs, q, status, businessUnitFilter, projectId, fromDate, toDate, overdueOnly, includeArchived, page, limit]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void loadLookups();
  }, [loadLookups]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial
    void load();
  }, [load]);

  useEffect(() => {
    if (!openNewFromQuery) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open from ?new=1
    setEditing(null);
    setFormInitialProjectId(initialProjectId || null);
    setModalOpen(true);
  }, [openNewFromQuery, initialProjectId]);

  function openCreate() {
    setEditing(null);
    setFormInitialProjectId(initialProjectId || null);
    setModalOpen(true);
  }

  function openEdit(r: MasterCorporateReceivable) {
    setEditing(r);
    setFormInitialProjectId(null);
    setModalOpen(true);
  }

  function accountsForUnit(unit: CorporateBusinessUnit | string | undefined) {
    const u = unit || 'SV_TOPOGRAFIA';
    return accounts.filter((a) => (a.business_unit || 'SV_TOPOGRAFIA') === u);
  }

  function openSettle(r: MasterCorporateReceivable) {
    setSettling(r);
    const unitAccounts = accountsForUnit(r.business_unit);
    const defaultAccount =
      (r.financial_account_id &&
      unitAccounts.some((a) => a.id === r.financial_account_id)
        ? r.financial_account_id
        : '') ||
      unitAccounts.find((a) => a.is_default)?.id ||
      unitAccounts[0]?.id ||
      '';
    setSettleForm({
      financial_account_id: defaultAccount,
      payment_date: todayISO(),
      amount: String(r.remaining_amount ?? 0),
      payment_method: r.payment_method || 'PIX',
      reference: '',
      asaas_payment_id: '',
      notes: '',
    });
    setSettleOpen(true);
  }

  async function submitSettle() {
    if (!settling) return;
    setSettleSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/receivables/${settling.id}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          financial_account_id: settleForm.financial_account_id,
          payment_date: settleForm.payment_date,
          amount: Number(settleForm.amount || 0),
          payment_method: settleForm.payment_method,
          reference: settleForm.reference || null,
          asaas_payment_id: settleForm.asaas_payment_id || null,
          notes: settleForm.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao receber.');
      setSettleOpen(false);
      setSettling(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao receber.');
    } finally {
      setSettleSaving(false);
    }
  }

  async function cancelReceivable(r: MasterCorporateReceivable) {
    const reason = window.prompt('Motivo do cancelamento:');
    if (reason == null) return;
    if (!reason.trim()) {
      setError('Informe o motivo do cancelamento.');
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/receivables/${r.id}/cancel`, {
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

  async function archiveOrRestore(r: MasterCorporateReceivable) {
    const action = r.is_archived ? 'restore' : 'archive';
    setError(null);
    try {
      const res = await fetch(`/api/master/corporate-finance/receivables/${r.id}/${action}`, {
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

  async function confirmSecureDelete(confirmWord: string) {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/receivables/${deleteTarget.id}/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...bodyAuth(),
            confirmWord,
            localOnly: deleteLocalOnly,
            reason: 'Exclusão segura via Painel Executivo',
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (data.requiresLocalOnly) setDeleteLocalOnly(true);
        throw new Error(data.error || 'Falha ao excluir.');
      }
      setToast(data.message || `Conta ${deleteTarget.code} excluída.`);
      setDeleteTarget(null);
      setDeleteLocalOnly(false);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir.');
    } finally {
      setDeleteBusy(false);
    }
  }

  function buildExportQuery() {
    const p = new URLSearchParams(qs());
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    if (businessUnitFilter) p.set('businessUnit', businessUnitFilter);
    if (fromDate) p.set('fromDate', fromDate);
    if (toDate) p.set('toDate', toDate);
    if (overdueOnly) p.set('overdueOnly', '1');
    if (includeArchived) p.set('includeArchived', '1');
    return p;
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function renderActions(r: MasterCorporateReceivable) {
    return (
      <div className={styles.rowActions}>
        <Link
          href={`/master/corporate-finance/receivables/${r.id}`}
          className={`${styles.btn} ${styles.btnGhost}`}
        >
          Detalhe
        </Link>
        {canEdit(r) ? (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => openEdit(r)}>
            Editar
          </button>
        ) : null}
        {receivableCanGenerateCorporateAsaasCharge(r) ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setAsaasGenerateFor(r)}
          >
            Gerar Cobrança
          </button>
        ) : null}
        {receivableCanViewCorporateAsaasCharge(r) && r.asaas_active_charge_id ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => {
              setAsaasViewChargeId(r.asaas_active_charge_id);
              setAsaasViewCode(r.code);
            }}
          >
            Ver Cobrança
          </button>
        ) : null}
        {canSettle(r) ? (
          <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => openSettle(r)}>
            Receber
          </button>
        ) : null}
        {!r.canceled_at && !r.is_archived && r.status !== 'RECEIVED' ? (
          <button
            type="button"
            className={`${styles.btn} ${styles.btnDanger}`}
            onClick={() => void cancelReceivable(r)}
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
        <button
          type="button"
          className={`${styles.btn} ${styles.btnDanger}`}
          onClick={() => {
            setDeleteError(null);
            setDeleteLocalOnly(false);
            setDeleteTarget(r);
          }}
        >
          Excluir
        </button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>Contas a receber</h1>
            <p className={styles.subtitle}>
              Títulos a receber do Master — liquidações, filtros e exportações profissionais.
            </p>
          </div>
          <div className={styles.actions}>
            <Link href="/master/topography/finance" className={`${styles.btn} ${styles.btnGhost}`}>
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
            <CorporateFinanceExportMenu
              endpoint="/api/master/corporate-finance/receivables/export"
              buildQuery={buildExportQuery}
              onError={(msg) => setError(msg)}
            />
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={openCreate}>
              <Plus className="w-4 h-4" />
              Nova conta a receber
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
            label="Recebido no mês"
            value={formatCurrency(kpis.receivedThisMonth)}
            tone="received"
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
          <CorporateFinanceSemanticKpi
            label="Qtd. recebidos"
            value={kpis.receivedCount}
            tone="received"
          />
        </div>

        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Recebíveis</h2>
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
                  placeholder="Código, cliente, descrição…"
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
                  {CORPORATE_RECEIVABLE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {corporateReceivableStatusLabel(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={styles.label}>Unidade</label>
                <select
                  className={styles.select}
                  value={businessUnitFilter}
                  onChange={(e) => {
                    setPage(1);
                    setBusinessUnitFilter(e.target.value);
                  }}
                >
                  <option value="">Todas</option>
                  <option value="SV_LOTES">{corporateBusinessUnitLabel('SV_LOTES')}</option>
                  <option value="SV_TOPOGRAFIA">
                    {corporateBusinessUnitLabel('SV_TOPOGRAFIA')}
                  </option>
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
            <p className={styles.muted}>Nenhum recebível encontrado.</p>
          ) : (
            <>
              <div className={`${styles.tableWrap} ${styles.desktopOnly}`}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Unidade</th>
                      <th>Cliente</th>
                      <th>Descrição</th>
                      <th>Vencimento</th>
                      <th>Líquido</th>
                      <th>Recebido</th>
                      <th>Saldo</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.code}</td>
                        <td>
                          <span className={styles.muted} style={{ padding: 0, fontSize: '0.8rem' }}>
                            {corporateBusinessUnitLabel(r.business_unit || 'SV_TOPOGRAFIA')}
                          </span>
                        </td>
                        <td>{r.customer_name}</td>
                        <td>{r.description}</td>
                        <td>{formatDate(r.due_date)}</td>
                        <td>{formatCurrency(r.net_amount)}</td>
                        <td>{formatCurrency(r.received_amount)}</td>
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
                      {corporateBusinessUnitLabel(r.business_unit || 'SV_TOPOGRAFIA')} ·{' '}
                      {r.customer_name} — {r.description}
                    </p>
                    <div className={styles.cardRow}>
                      <span>Venc. {formatDate(r.due_date)}</span>
                      <span>{formatCurrency(r.remaining_amount)}</span>
                    </div>
                    <div className={styles.cardRow}>
                      <span>Líq. {formatCurrency(r.net_amount)}</span>
                      <span>Rec. {formatCurrency(r.received_amount)}</span>
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

      <ReceivableFormModal
        open={modalOpen}
        editing={editing}
        categories={categories}
        costCenters={costCenters}
        projects={projects}
        initialProjectId={formInitialProjectId}
        qs={qs}
        bodyAuth={bodyAuth}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          void load();
        }}
      />

      {settleOpen && settling ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Receber {settling.code}</h3>
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
              <p className={styles.muted}>
                Unidade:{' '}
                {corporateBusinessUnitLabel(settling.business_unit || 'SV_TOPOGRAFIA')}
              </p>
              <p className={styles.netHint}>
                Saldo antes: {formatCurrency(settleRemainingBefore)} → depois:{' '}
                {formatCurrency(settleRemainingAfter)}
              </p>
              <div>
                <label className={styles.label}>Conta financeira *</label>
                <select
                  className={styles.select}
                  value={settleForm.financial_account_id}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, financial_account_id: e.target.value }))
                  }
                >
                  <option value="">Selecione…</option>
                  {accountsForUnit(settling.business_unit).map((a) => (
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
                <label className={styles.label}>Referência externa</label>
                <input
                  className={styles.input}
                  value={settleForm.reference}
                  onChange={(e) => setSettleForm((f) => ({ ...f, reference: e.target.value }))}
                />
              </div>
              <div>
                <label className={styles.label}>ID Asaas</label>
                <input
                  className={styles.input}
                  value={settleForm.asaas_payment_id}
                  onChange={(e) =>
                    setSettleForm((f) => ({ ...f, asaas_payment_id: e.target.value }))
                  }
                  placeholder="pay_ (opcional)"
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
                {settleSaving ? 'Salvando…' : 'Confirmar recebimento'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {asaasGenerateFor ? (
        <CorporateAsaasGenerateModal
          receivable={asaasGenerateFor}
          accounts={accounts.filter(
            (a) =>
              (a.business_unit || 'SV_TOPOGRAFIA') ===
              (asaasGenerateFor.business_unit || 'SV_TOPOGRAFIA'),
          )}
          onClose={() => setAsaasGenerateFor(null)}
          onCreated={() => void load()}
        />
      ) : null}

      {asaasViewChargeId ? (
        <CorporateAsaasViewModal
          chargeId={asaasViewChargeId}
          receivableCode={asaasViewCode}
          onClose={() => {
            setAsaasViewChargeId(null);
            setAsaasViewCode(undefined);
          }}
          onChanged={() => void load()}
        />
      ) : null}

      <MasterSecureDeleteModal
        open={Boolean(deleteTarget)}
        title="Excluir conta a receber"
        recordLabel={
          deleteTarget
            ? `${deleteTarget.code} — ${deleteTarget.customer_name || deleteTarget.description || 'sem descrição'}`
            : ''
        }
        amountLabel={deleteTarget ? formatCurrency(deleteTarget.net_amount) : null}
        linksWarning={
          deleteTarget && Number(deleteTarget.received_amount) > 0
            ? 'Conta já recebida: o recebimento e a entrada correspondente no Caixa Corporativo serão removidos. Cobrança Asaas paga não será apagada remotamente.'
            : 'Conta em aberto: vínculos corporativos e cobrança Asaas local serão removidos. Nenhum lançamento de caixa será criado.'
        }
        localOnlyOption={{
          label:
            'Excluir somente registro local (se o cancelamento no Asaas falhar ou cobrança já estiver paga)',
          checked: deleteLocalOnly,
          onChange: setDeleteLocalOnly,
        }}
        busy={deleteBusy}
        error={deleteError}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={(word) => void confirmSecureDelete(word)}
      />

      {toast ? (
        <div
          role="status"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: 80,
            maxWidth: 420,
            padding: '0.85rem 1rem',
            borderRadius: 10,
            background: '#0f172a',
            color: '#f8fafc',
            fontSize: 13,
            boxShadow: '0 10px 30px rgba(15,23,42,0.35)',
          }}
        >
          {toast}
          <button
            type="button"
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: 'none',
              color: '#93c5fd',
              cursor: 'pointer',
            }}
            onClick={() => setToast(null)}
          >
            Fechar
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function CorporateReceivablesPage() {
  return (
    <CorporateFinanceGuard>
      <ReceivablesInner />
    </CorporateFinanceGuard>
  );
}
