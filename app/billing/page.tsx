'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  QrCode,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import type { SaasCharge } from '@/lib/saasCharges';

type BillingPayload = {
  company?: { id: string; name?: string; plan?: string; status_operacional?: string; active?: boolean };
  subscription?: { plan_type?: string; next_due_date?: string; payment_status?: string; contract_status?: string };
  financial?: { situation?: string; daysLate?: number; lastPaymentDate?: string | null };
  pricing?: { appliedPrice?: number; standardPrice?: number };
  currentCharge?: SaasCharge | null;
  charges?: SaasCharge[];
  payments?: Array<{ id: string; amount: number; paid_at: string; reference_month: string; payment_method?: string }>;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function statusTone(status?: string) {
  const key = String(status || '').toUpperCase();
  if (key === 'PAID' || key === 'PAGO' || key === 'EM DIA') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
  if (key === 'PENDING' || key === 'PENDENTE' || key === 'VENCE EM BREVE') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  if (key === 'OVERDUE' || key === 'VENCIDO') return 'text-red-400 bg-red-500/10 border-red-500/20';
  return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
}

export default function BillingPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BillingPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/billing', { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar cobrança');
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && user) void loadBilling();
  }, [authLoading, user, loadBilling]);

  const charge = data?.currentCharge;
  const pixCode = charge?.pix_copy_paste || '';

  const copyPix = async () => {
    if (!pixCode) return;
    await navigator.clipboard.writeText(pixCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Assinatura SV LOTES</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Plano, vencimento, cobrança PIX e histórico de pagamentos da sua empresa.
          </p>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Plano</div>
                <div className="text-lg font-bold text-[var(--text-primary)]">
                  {data?.company?.plan || data?.subscription?.plan_type || '—'}
                </div>
                <div className="text-sm text-[var(--text-secondary)] mt-1">
                  {formatCurrency(data?.pricing?.appliedPrice || 0)}/mês
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Próximo vencimento</div>
                <div className="text-lg font-bold text-[var(--text-primary)]">
                  {formatDate(data?.subscription?.next_due_date)}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-5">
                <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-2">Status financeiro</div>
                <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold border ${statusTone(data?.financial?.situation)}`}>
                  {data?.financial?.situation || '—'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-6 space-y-5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-[var(--brand-primary)]" />
                <h2 className="text-lg font-bold text-[var(--text-primary)]">Cobrança atual</h2>
              </div>

              {!charge ? (
                <p className="text-sm text-[var(--text-muted)]">Nenhuma cobrança pendente no momento.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Valor</span>
                      <span className="font-bold text-emerald-400">{formatCurrency(charge.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Vencimento</span>
                      <span>{formatDate(charge.due_date)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[var(--text-muted)]">Status</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold border ${statusTone(charge.status)}`}>
                        {charge.status}
                      </span>
                    </div>
                    {charge.payment_url && (
                      <a
                        href={charge.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-blue-400 hover:underline"
                      >
                        Link de pagamento <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {pixCode && (
                      <button
                        type="button"
                        onClick={() => void copyPix()}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--brand-primary)]/20 text-[var(--brand-primary)] text-sm font-semibold hover:bg-[var(--brand-primary)]/30"
                      >
                        {copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copied ? 'Copiado!' : 'Copiar PIX'}
                      </button>
                    )}
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
                      <p className="text-[10px] text-[var(--text-muted)] text-center break-all max-w-xs">
                        {pixCode.slice(0, 48)}…
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] overflow-hidden">
              <div className="p-4 border-b border-[var(--border-color)]">
                <h2 className="font-bold text-[var(--text-primary)]">Histórico de pagamentos</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-color)]">
                      <th className="p-3">Referência</th>
                      <th className="p-3">Valor</th>
                      <th className="p-3">Pago em</th>
                      <th className="p-3">Forma</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.payments || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-6 text-center text-[var(--text-muted)]">
                          Nenhum pagamento registrado.
                        </td>
                      </tr>
                    ) : (
                      (data?.payments || []).map((p) => (
                        <tr key={p.id} className="border-b border-[var(--border-color)]/50">
                          <td className="p-3">{p.reference_month}</td>
                          <td className="p-3 text-emerald-400">{formatCurrency(Number(p.amount))}</td>
                          <td className="p-3">{formatDate(p.paid_at)}</td>
                          <td className="p-3 uppercase text-xs">{p.payment_method || '—'}</td>
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
  );
}
