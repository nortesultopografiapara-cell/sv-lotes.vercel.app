'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  CORPORATE_ASAAS_LOCAL_STATUSES,
  corporateAsaasBillingTypeLabel,
  corporateAsaasLocalStatusLabel,
  isCorporateAsaasActiveStatus,
  type MasterCorporateAsaasCharge,
} from '@/lib/master/corporateFinance/asaas/types';
import { semanticToneForAsaasStatus } from '@/lib/master/corporateFinance/semantic';
import {
  CorporateFinanceGuard,
  useCorporateFinanceAuthParams,
} from './CorporateFinanceGuard';
import { CorporateFinanceSemanticBadge } from './CorporateFinanceSemantic';
import { formatCurrency, formatDate } from './format';
import styles from './corporateFinance.module.css';

function StatusBadge({ status }: { status: string }) {
  return (
    <CorporateFinanceSemanticBadge tone={semanticToneForAsaasStatus(status)}>
      {corporateAsaasLocalStatusLabel(status)}
    </CorporateFinanceSemanticBadge>
  );
}

function AsaasChargesInner() {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [rows, setRows] = useState<MasterCorporateAsaasCharge[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [billingType, setBillingType] = useState('');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(qs());
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (q.trim()) params.set('q', q.trim());
      if (status) params.set('status', status);
      if (billingType) params.set('billingType', billingType);
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges?${params.toString()}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar cobranças.');
      setRows(data.charges || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao listar.');
    } finally {
      setLoading(false);
    }
  }, [userId, qs, page, limit, q, status, billingType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(chargeId: string, action: 'sync' | 'cancel' | 'reprocess') {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges/${chargeId}/${action}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyAuth()),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Falha em ${action}.`);
      setInfo(
        action === 'cancel'
          ? 'Cobrança cancelada no Asaas (AR intacta).'
          : 'Ação concluída (idempotente).',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na ação.');
    } finally {
      setBusy(false);
    }
  }

  async function runReconcile() {
    if (
      !window.confirm(
        'Conciliar cobranças sem pagamento local? Sincroniza o Asaas e materializa recebimento/caixa somente se estiver paga (idempotente).',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/master/corporate-finance/asaas/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...bodyAuth(), limit: 50 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha na conciliação.');
      const r = data.result;
      setInfo(
        `Conciliação: ${r.scanned} analisada(s), ${r.settled} liquidada(s), ${r.alreadySettled} já ok, ${r.failed} falha(s).`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na conciliação.');
    } finally {
      setBusy(false);
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className={styles.page}>
      <div className={styles.wrapWide}>
        <div className={styles.headerRow}>
          <div>
            <p className={styles.eyebrow}>Financeiro Corporativo</p>
            <h1 className={styles.title}>Cobranças Asaas</h1>
            <p className={styles.subtitle}>
              PIX e boleto do Financeiro Corporativo SV Topografia — isolado de SaaS e imobiliárias.
            </p>
          </div>
          <div className={styles.actions}>
            <Link
              href="/master/corporate-finance"
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              <ArrowLeft className="w-4 h-4" />
              Hub
            </Link>
          </div>
        </div>

        <div className={styles.filters}>
          <input
            className={styles.input}
            placeholder="Buscar descrição, ID Asaas, MCF…"
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
          />
          <select
            className={styles.select}
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">Todos os status</option>
            {CORPORATE_ASAAS_LOCAL_STATUSES.map((s) => (
              <option key={s} value={s}>
                {corporateAsaasLocalStatusLabel(s)}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={billingType}
            onChange={(e) => {
              setPage(1);
              setBillingType(e.target.value);
            }}
          >
            <option value="">PIX + Boleto</option>
            <option value="PIX">PIX</option>
            <option value="BOLETO">Boleto</option>
          </select>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnGhost}`}
            onClick={() => void load()}
          >
            Atualizar
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={busy}
            onClick={() => void runReconcile()}
          >
            Conciliar pagas
          </button>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.muted}>{info}</p> : null}

        <div className={styles.panel}>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : rows.length === 0 ? (
            <p className={styles.muted}>Nenhuma cobrança encontrada.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Criada</th>
                    <th>Tipo</th>
                    <th>Status</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Descrição</th>
                    <th>AR</th>
                    <th>Links</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td>{formatDate(c.created_at)}</td>
                      <td>{corporateAsaasBillingTypeLabel(c.billing_type)}</td>
                      <td>
                        <StatusBadge status={c.local_status} />
                      </td>
                      <td>{formatCurrency(c.original_value)}</td>
                      <td>{formatDate(c.due_date)}</td>
                      <td>{c.description || '—'}</td>
                      <td>
                        <Link href={`/master/corporate-finance/receivables/${c.receivable_id}`}>
                          Abrir título
                        </Link>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {c.invoice_url ? (
                            <a href={c.invoice_url} target="_blank" rel="noreferrer">
                              Pagamento
                            </a>
                          ) : null}
                          {c.bank_slip_url ? (
                            <a href={c.bank_slip_url} target="_blank" rel="noreferrer">
                              Boleto
                            </a>
                          ) : null}
                          {c.transaction_receipt_url ? (
                            <a href={c.transaction_receipt_url} target="_blank" rel="noreferrer">
                              Comprovante
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            disabled={busy}
                            onClick={() => void runAction(c.id, 'sync')}
                          >
                            Sync
                          </button>
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            disabled={busy}
                            onClick={() => void runAction(c.id, 'reprocess')}
                          >
                            Reprocessar
                          </button>
                          {isCorporateAsaasActiveStatus(c.local_status) ? (
                            <button
                              type="button"
                              className={`${styles.btn} ${styles.btnDanger}`}
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancelar no Asaas? A Conta a Receber permanece aberta.',
                                  )
                                ) {
                                  void runAction(c.id, 'cancel');
                                }
                              }}
                            >
                              Cancelar
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className={styles.pagination}>
            <span className={styles.muted}>
              {total} cobrança(s) · página {page}/{pages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
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
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CorporateAsaasChargesPage() {
  return (
    <CorporateFinanceGuard>
      <AsaasChargesInner />
    </CorporateFinanceGuard>
  );
}
