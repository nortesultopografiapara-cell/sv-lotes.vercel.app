'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  corporateAsaasBillingTypeLabel,
  corporateAsaasLocalStatusLabel,
  isCorporateAsaasActiveStatus,
  isCorporateAsaasPaidStatus,
  type MasterCorporateAsaasCharge,
} from '@/lib/master/corporateFinance/asaas/types';
import { maskCpfCnpj } from '@/lib/master/corporateFinance/asaas/domain';
import { semanticToneForAsaasStatus } from '@/lib/master/corporateFinance/semantic';
import type { MasterCorporateReceivable } from '@/lib/master/corporateFinance/arApTypes';
import type { MasterCorporateFinancialAccount } from '@/lib/master/corporateFinance/types';
import { CorporateFinanceSemanticBadge } from './CorporateFinanceSemantic';
import { useCorporateFinanceAuthParams } from './CorporateFinanceGuard';
import { formatCurrency, formatDate, todayISO } from './format';
import styles from './corporateFinance.module.css';

type Props = {
  receivable: MasterCorporateReceivable;
  accounts: MasterCorporateFinancialAccount[];
  onSettled?: () => void;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <CorporateFinanceSemanticBadge tone={semanticToneForAsaasStatus(status)}>
      {corporateAsaasLocalStatusLabel(status)}
    </CorporateFinanceSemanticBadge>
  );
}

export default function CorporateAsaasChargeSection({
  receivable,
  accounts,
  onSettled,
}: Props) {
  const { userId, qs, bodyAuth } = useCorporateFinanceAuthParams();
  const [charges, setCharges] = useState<MasterCorporateAsaasCharge[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [billingType, setBillingType] = useState<'PIX' | 'BOLETO'>('PIX');
  const [financialAccountId, setFinancialAccountId] = useState(
    receivable.financial_account_id || '',
  );
  const [customerName, setCustomerName] = useState(receivable.customer_name || '');
  const [cpfCnpj, setCpfCnpj] = useState(receivable.customer_document || '');
  const [email, setEmail] = useState(receivable.customer_email || '');
  const [dueDate, setDueDate] = useState(receivable.due_date?.slice(0, 10) || todayISO());
  const [value, setValue] = useState(String(receivable.remaining_amount || ''));

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/master/corporate-finance/asaas/charges?receivableId=${encodeURIComponent(receivable.id)}&limit=50&${qs()}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao listar cobranças Asaas.');
      setCharges(data.charges || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar Asaas.');
    } finally {
      setLoading(false);
    }
  }, [qs, userId, receivable.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setFinancialAccountId(receivable.financial_account_id || '');
    setCustomerName(receivable.customer_name || '');
    setCpfCnpj(receivable.customer_document || '');
    setEmail(receivable.customer_email || '');
    setDueDate(receivable.due_date?.slice(0, 10) || todayISO());
    setValue(String(receivable.remaining_amount || ''));
  }, [receivable]);

  const activeCharge = charges.find((c) => isCorporateAsaasActiveStatus(c.local_status));
  const canCreate =
    !receivable.canceled_at &&
    !receivable.is_archived &&
    Number(receivable.remaining_amount) > 0 &&
    !activeCharge;

  async function createCharge() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch('/api/master/corporate-finance/asaas/charges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...bodyAuth(),
          receivable_id: receivable.id,
          billing_type: billingType,
          financial_account_id: financialAccountId,
          customer_name: customerName,
          cpf_cnpj: cpfCnpj,
          email: email || null,
          due_date: dueDate,
          value: Number(value),
          description: receivable.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Falha ao criar cobrança.');
      setCreateOpen(false);
      setInfo(
        `Cobrança ${billingType} criada. Isso não registra recebimento no caixa até o pagamento confirmado.`,
      );
      await load();
      onSettled?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar cobrança.');
    } finally {
      setBusy(false);
    }
  }

  async function runAction(
    chargeId: string,
    action: 'sync' | 'cancel' | 'reprocess' | 'pix',
  ) {
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
      if (action === 'pix' && data.charge) {
        setCharges((prev) =>
          prev.map((c) => (c.id === chargeId ? (data.charge as MasterCorporateAsaasCharge) : c)),
        );
        setExpandedId(chargeId);
        setInfo('PIX atualizado.');
      } else {
        setInfo(
          action === 'cancel'
            ? 'Cobrança Asaas cancelada. A Conta a Receber permanece aberta.'
            : action === 'reprocess'
              ? 'Reprocessamento concluído (idempotente).'
              : 'Sincronização concluída.',
        );
        await load();
        onSettled?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na ação Asaas.');
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setInfo(`${label} copiado.`);
    } catch {
      setError(`Não foi possível copiar ${label}.`);
    }
  }

  return (
    <div className={styles.panel} style={{ marginBottom: '1.5rem' }}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>Cobrança Asaas</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link href="/master/corporate-finance/asaas" className={styles.muted}>
            Ver todas
          </Link>
          {canCreate ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              disabled={busy}
              onClick={() => setCreateOpen(true)}
            >
              Gerar cobrança
            </button>
          ) : null}
        </div>
      </div>

      <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>
        PIX e boleto via conta Asaas da SV Topografia. Criar cobrança não gera recebimento nem
        movimento de caixa — somente pagamento confirmado liquida a Conta a Receber.
      </p>

      {receivable.asaas_integration_status ? (
        <p className={styles.muted} style={{ marginBottom: '0.5rem' }}>
          Integração: {corporateAsaasLocalStatusLabel(receivable.asaas_integration_status)}
          {receivable.asaas_last_error ? ` · ${receivable.asaas_last_error}` : ''}
        </p>
      ) : null}

      {error ? <p className={styles.error}>{error}</p> : null}
      {info ? <p className={styles.muted}>{info}</p> : null}

      {loading ? (
        <p className={styles.muted}>Carregando cobranças…</p>
      ) : charges.length === 0 ? (
        <p className={styles.muted}>Nenhuma cobrança Asaas para este título.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Status</th>
                <th>Valor</th>
                <th>Vencimento</th>
                <th>Asaas ID</th>
                <th>Links</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id}>
                  <td>{corporateAsaasBillingTypeLabel(c.billing_type)}</td>
                  <td>
                    <StatusBadge status={c.local_status} />
                  </td>
                  <td>{formatCurrency(c.original_value)}</td>
                  <td>{formatDate(c.due_date)}</td>
                  <td>
                    <code style={{ fontSize: '0.75rem' }}>{c.asaas_payment_id}</code>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {c.invoice_url ? (
                        <a href={c.invoice_url} target="_blank" rel="noreferrer">
                          Fatura / pagamento
                        </a>
                      ) : null}
                      {c.bank_slip_url ? (
                        <a href={c.bank_slip_url} target="_blank" rel="noreferrer">
                          Boleto PDF
                        </a>
                      ) : null}
                      {c.transaction_receipt_url ? (
                        <a href={c.transaction_receipt_url} target="_blank" rel="noreferrer">
                          Comprovante
                        </a>
                      ) : null}
                      {c.billing_type === 'PIX' ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost}`}
                          style={{ padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}
                          onClick={() =>
                            setExpandedId((id) => (id === c.id ? null : c.id))
                          }
                        >
                          {expandedId === c.id ? 'Ocultar PIX' : 'Ver PIX'}
                        </button>
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
                      {c.billing_type === 'PIX' && !isCorporateAsaasPaidStatus(c.local_status) ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnGhost}`}
                          disabled={busy}
                          onClick={() => void runAction(c.id, 'pix')}
                        >
                          Atualizar PIX
                        </button>
                      ) : null}
                      {isCorporateAsaasActiveStatus(c.local_status) ? (
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnDanger}`}
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Cancelar cobrança no Asaas? A Conta a Receber NÃO será cancelada.',
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
                    {expandedId === c.id && c.billing_type === 'PIX' ? (
                      <div style={{ marginTop: 8, maxWidth: 280 }}>
                        {c.pix_qr_code ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.pix_qr_code}
                            alt="QR Code PIX"
                            style={{ width: 160, height: 160, background: '#fff' }}
                          />
                        ) : (
                          <p className={styles.muted}>QR Code indisponível — use Atualizar PIX.</p>
                        )}
                        {c.pix_payload ? (
                          <button
                            type="button"
                            className={`${styles.btn} ${styles.btnGhost}`}
                            style={{ marginTop: 6 }}
                            onClick={() => void copyText(c.pix_payload!, 'Copia e cola PIX')}
                          >
                            Copiar PIX
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Nova cobrança Asaas</h3>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setCreateOpen(false)}
              >
                Fechar
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.muted}>
                Documento mascarado na listagem: {maskCpfCnpj(cpfCnpj)}. Criar cobrança não
                registra caixa.
              </p>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Tipo *</label>
                  <select
                    className={styles.select}
                    value={billingType}
                    onChange={(e) => setBillingType(e.target.value as 'PIX' | 'BOLETO')}
                  >
                    <option value="PIX">PIX</option>
                    <option value="BOLETO">Boleto</option>
                  </select>
                </div>
                <div>
                  <label className={styles.label}>Conta financeira *</label>
                  <select
                    className={styles.select}
                    value={financialAccountId}
                    onChange={(e) => setFinancialAccountId(e.target.value)}
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
                <label className={styles.label}>Cliente *</label>
                <input
                  className={styles.input}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>CPF/CNPJ *</label>
                  <input
                    className={styles.input}
                    value={cpfCnpj}
                    onChange={(e) => setCpfCnpj(e.target.value)}
                  />
                </div>
                <div>
                  <label className={styles.label}>E-mail</label>
                  <input
                    className={styles.input}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className={styles.grid2}>
                <div>
                  <label className={styles.label}>Valor *</label>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    min="0"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                  />
                </div>
                <div>
                  <label className={styles.label}>Vencimento *</label>
                  <input
                    className={styles.input}
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={() => setCreateOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                disabled={busy}
                onClick={() => void createCharge()}
              >
                {busy ? 'Gerando…' : 'Gerar cobrança'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
