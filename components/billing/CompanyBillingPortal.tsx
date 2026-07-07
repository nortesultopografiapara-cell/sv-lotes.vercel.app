'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Loader2,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import type { SaasCharge } from '@/lib/saasCharges';
import type { SaasInvoiceChargeRow } from '@/lib/saasInvoiceChargeView';
import { truncatePaymentId } from '@/lib/saasInvoiceChargeView';
import { formatReferenceMonthLabel } from '@/lib/masterSaasPayments';
import {
  MOBILE_CONTENT_PAD_BOTTOM_CLASS,
  SV_SCROLLBAR_DARK_CLASS,
} from '@/lib/mobileLayout';

type BillingPayload = {
  company?: {
    id: string;
    name?: string;
    plan?: string;
    status_operacional?: string;
    active?: boolean;
  };
  subscription?: {
    plan_type?: string;
    next_due_date?: string;
    payment_status?: string;
    contract_status?: string;
  };
  financial?: {
    situation?: string;
    daysLate?: number;
    lastPaymentDate?: string | null;
    lastPaymentReferenceLabel?: string | null;
  };
  pricing?: {
    appliedPrice?: number;
    standardPrice?: number;
    planDisplayName?: string;
    planLabel?: string;
  };
  currentCharge?: SaasCharge | null;
  rows?: SaasInvoiceChargeRow[];
  payments?: Array<{
    id: string;
    amount: number;
    paid_at: string;
    reference_month: string;
    payment_method?: string;
    status?: string;
  }>;
  lastPayment?: {
    amount: number;
    paid_at: string;
    reference_month?: string;
    payment_method?: string;
  } | null;
  gateway?: { configured?: boolean };
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value || 0,
  );
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function statusTone(status?: string) {
  const key = String(status || '').toUpperCase();
  if (key === 'PAID' || key === 'PAGO' || key === 'EM DIA') {
    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  }
  if (key === 'PENDING' || key === 'PENDENTE' || key === 'VENCE EM BREVE') {
    return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  }
  if (key === 'OVERDUE' || key === 'VENCIDO' || key === 'SUSPENSO') {
    return 'text-red-400 bg-red-500/10 border-red-500/20';
  }
  return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
}

function billingTypeLabel(type?: string | null) {
  return String(type || '').toUpperCase() === 'BOLETO' ? 'Boleto' : 'PIX';
}

export function CompanyBillingPortal() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingPayload | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 12000);
      const res = await fetch('/api/billing', {
        credentials: 'include',
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeout));
      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar assinatura');
      setData(json);
    } catch (e: unknown) {
      const message =
        e instanceof DOMException && e.name === 'AbortError'
          ? 'Tempo excedido ao carregar sua assinatura. Clique em Atualizar.'
          : e instanceof Error
            ? e.message
            : 'Erro desconhecido';
      console.warn('[minhas-assinaturas] loadBilling failed', {
        ms: Date.now() - startedAt,
        error: message,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const copyText = async (key: string, text: string) => {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const syncStatus = async (chargeId?: string | null) => {
    if (!chargeId) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_status', chargeId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao atualizar status');
      await loadBilling();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Erro ao atualizar status');
    } finally {
      setSyncing(false);
    }
  };

  const charge = data?.currentCharge;
  const currentRow = data?.rows?.find((row) => row.chargeId === charge?.id);
  const pixCode = charge?.pix_copy_paste || '';
  const paymentUrl = charge?.payment_url || charge?.invoice_url || '';
  const planName =
    data?.pricing?.planDisplayName ||
    data?.company?.plan ||
    data?.subscription?.plan_type ||
    '—';

  return (
    <div
      className={`flex-1 flex flex-col min-h-0 min-w-0 h-full max-w-full overflow-x-hidden overflow-y-auto ${SV_SCROLLBAR_DARK_CLASS} sv-page--mobile-pad`}
    >
      <div className={`max-w-6xl mx-auto w-full p-4 md:p-8 pb-10 space-y-6 ${MOBILE_CONTENT_PAD_BOTTOM_CLASS}`}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Minha Assinatura</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Plano, faturas, pagamentos PIX/Boleto e histórico da sua empresa no SV LOTES.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadBilling()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-color)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[var(--text-muted)] py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando…
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 flex gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Plano atual
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)]">{planName}</div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Valor mensal
              </div>
              <div className="text-lg font-bold text-emerald-400">
                {formatCurrency(data?.pricing?.appliedPrice || 0)}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Próximo vencimento
              </div>
              <div className="text-lg font-bold text-[var(--text-primary)]">
                {formatDate(data?.subscription?.next_due_date)}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Status financeiro
              </div>
              <span
                className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${statusTone(data?.financial?.situation)}`}
              >
                {data?.financial?.situation || '—'}
              </span>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
              <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">
                Último pagamento
              </div>
              <div className="text-sm font-semibold text-[var(--text-primary)]">
                {data?.lastPayment
                  ? formatCurrency(Number(data.lastPayment.amount))
                  : '—'}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">
                {data?.lastPayment?.paid_at
                  ? formatDate(data.lastPayment.paid_at)
                  : 'Nenhum pagamento'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[var(--brand-primary)]" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Fatura atual</h2>
              </div>
              {charge?.id && (
                <button
                  type="button"
                  disabled={syncing || !data?.gateway?.configured}
                  onClick={() => void syncStatus(charge.id)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Atualizando…' : 'Atualizar status'}
                </button>
              )}
            </div>

            {!charge ? (
              <p className="text-sm text-[var(--text-muted)]">
                Nenhuma cobrança aberta no momento.
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Competência</span>
                    <span>
                      {currentRow?.referenceMonth
                        ? formatReferenceMonthLabel(currentRow.referenceMonth)
                        : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Valor</span>
                    <span className="font-bold text-emerald-400">
                      {formatCurrency(charge.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Vencimento</span>
                    <span>{formatDate(charge.due_date)}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Status</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold border ${statusTone(charge.status)}`}
                    >
                      {charge.status}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-[var(--text-muted)]">Forma</span>
                    <span>{billingTypeLabel(charge.billing_type)}</span>
                  </div>
                  {charge.payment_id && (
                    <div className="flex justify-between gap-4">
                      <span className="text-[var(--text-muted)]">ID Asaas</span>
                      <span className="font-mono text-xs">{truncatePaymentId(charge.payment_id)}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    {paymentUrl && (
                      <>
                        <a
                          href={paymentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-500/15 text-blue-400 text-xs font-semibold hover:bg-blue-500/25"
                        >
                          Abrir link <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void copyText('link', paymentUrl)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-color)] text-xs font-semibold text-[var(--text-secondary)]"
                        >
                          {copiedKey === 'link' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          Copiar link
                        </button>
                      </>
                    )}
                    {pixCode && (
                      <button
                        type="button"
                        onClick={() => void copyText('pix', pixCode)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--brand-primary)]/20 text-[var(--brand-primary)] text-xs font-semibold"
                      >
                        {copiedKey === 'pix' ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Copiar PIX
                      </button>
                    )}
                    {charge.bank_slip_url && (
                      <a
                        href={charge.bank_slip_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 text-amber-400 text-xs font-semibold hover:bg-amber-500/25"
                      >
                        <FileText className="w-3.5 h-3.5" /> Baixar boleto
                      </a>
                    )}
                  </div>
                </div>

                {charge.pix_qr_code && (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <QrCode className="w-5 h-5 text-[var(--text-muted)]" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={charge.pix_qr_code}
                      alt="QR Code PIX"
                      className="w-44 h-44 rounded-lg border border-[var(--border-color)] bg-white object-contain"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)]">
              <h2 className="font-bold text-[var(--text-primary)]">
                Histórico de cobranças
              </h2>
            </div>
            <div className="overflow-x-auto sv-scrollbar">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-color)]">
                    <th className="p-3">Competência</th>
                    <th className="p-3">Valor</th>
                    <th className="p-3">Vencimento</th>
                    <th className="p-3">Pagamento</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Forma</th>
                    <th className="p-3">Asaas</th>
                    <th className="p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-[var(--text-muted)]">
                        Nenhuma cobrança registrada.
                      </td>
                    </tr>
                  ) : (
                    (data?.rows || []).map((row) => (
                      <tr
                        key={row.invoiceId}
                        className="border-b border-[var(--border-color)]/50"
                      >
                        <td className="p-3">
                          {formatReferenceMonthLabel(row.referenceMonth)}
                        </td>
                        <td className="p-3 text-emerald-400">{formatCurrency(row.amount)}</td>
                        <td className="p-3">{formatDate(row.dueDate)}</td>
                        <td className="p-3">
                          {(data?.payments || [])
                            .filter((p) => p.reference_month === row.referenceMonth)
                            .map((p) => formatDate(p.paid_at))[0] || '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusTone(row.chargeStatus || row.invoiceStatus)}`}
                          >
                            {row.chargeStatus || row.invoiceStatus}
                          </span>
                        </td>
                        <td className="p-3">{billingTypeLabel(row.billingType)}</td>
                        <td className="p-3 font-mono text-xs">
                          {truncatePaymentId(row.paymentId)}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {row.paymentUrl && (
                              <a
                                href={row.paymentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:underline text-xs"
                              >
                                Link
                              </a>
                            )}
                            {row.pixCopyPaste && (
                              <button
                                type="button"
                                onClick={() => void copyText(`pix-${row.invoiceId}`, row.pixCopyPaste || '')}
                                className="text-[var(--brand-primary)] text-xs hover:underline"
                              >
                                {copiedKey === `pix-${row.invoiceId}` ? 'Copiado' : 'PIX'}
                              </button>
                            )}
                            {row.bankSlipUrl && (
                              <a
                                href={row.bankSlipUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-amber-400 text-xs hover:underline"
                              >
                                Boleto
                              </a>
                            )}
                            {row.chargeId && (
                              <button
                                type="button"
                                disabled={syncing}
                                onClick={() => void syncStatus(row.chargeId)}
                                className="text-[var(--text-muted)] text-xs hover:text-[var(--text-primary)]"
                              >
                                Sync
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
            <div className="p-4 border-b border-[var(--border-color)]">
              <h2 className="font-bold text-[var(--text-primary)]">Histórico de pagamentos</h2>
            </div>
            <div className="overflow-x-auto sv-scrollbar">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-color)]">
                    <th className="p-3">Competência</th>
                    <th className="p-3">Valor</th>
                    <th className="p-3">Pago em</th>
                    <th className="p-3">Forma</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.payments || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-[var(--text-muted)]">
                        Nenhum pagamento registrado.
                      </td>
                    </tr>
                  ) : (
                    (data?.payments || []).map((p) => (
                      <tr key={p.id} className="border-b border-[var(--border-color)]/50">
                        <td className="p-3">
                          {formatReferenceMonthLabel(p.reference_month)}
                        </td>
                        <td className="p-3 text-emerald-400">{formatCurrency(Number(p.amount))}</td>
                        <td className="p-3">{formatDate(p.paid_at)}</td>
                        <td className="p-3 uppercase text-xs">{p.payment_method || '—'}</td>
                        <td className="p-3 uppercase text-xs">{p.status || 'paid'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      </div>
    </div>
  );
}
