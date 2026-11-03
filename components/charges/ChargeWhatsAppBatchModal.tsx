'use client';

import { useMemo, useState } from 'react';
import { Loader2, MessageCircle, X } from 'lucide-react';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  CHARGE_WHATSAPP_SKIP_REASON_LABELS,
  type ChargeWhatsAppBatchPreview,
  type ChargeWhatsAppSkipReason,
} from '@/lib/charges/chargeWhatsAppBatch';

export type ChargeWhatsAppBatchItemView = {
  id?: string | null;
  customerId: string;
  customerName: string;
  phone: string | null;
  status: string;
  skipReason?: string | null;
  error?: string | null;
  providerMessageId?: string | null;
  financeReceiptIds?: string[];
  message?: string | null;
};

export type ChargeWhatsAppBatchSendResult = {
  batchId: string | null;
  status: string;
  replayed?: boolean;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  items: ChargeWhatsAppBatchItemView[];
};

type Props = {
  open: boolean;
  loading: boolean;
  sending: boolean;
  error: string | null;
  preview: ChargeWhatsAppBatchPreview | null;
  result: ChargeWhatsAppBatchSendResult | null;
  onClose: () => void;
  onConfirm: () => void;
  onRetryFailed: () => void;
};

function skipLabel(reason?: string | null): string {
  if (!reason) return 'Não elegível';
  return (
    CHARGE_WHATSAPP_SKIP_REASON_LABELS[reason as ChargeWhatsAppSkipReason] || reason
  );
}

function money(value: number): string {
  return formatCurrencyBRL(value) || 'R$ 0,00';
}

export function ChargeWhatsAppBatchModal({
  open,
  loading,
  sending,
  error,
  preview,
  result,
  onClose,
  onConfirm,
  onRetryFailed,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const confirmDisabled = useMemo(() => {
    if (!preview || sending || loading) return true;
    if (preview.sendBlockedReason) return true;
    return preview.readyCustomerCount <= 0;
  }, [preview, sending, loading]);

  if (!open) return null;

  const showResult = Boolean(result);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="charge-wa-batch-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-card)] shadow-none">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-color)] px-5 py-4">
          <div>
            <h2 id="charge-wa-batch-title" className="text-base font-semibold text-[var(--text-primary)]">
              {showResult ? 'Cobrança concluída' : 'Cobrança em massa via WhatsApp'}
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Mensagem enviada pelo SV Lotes, identificando a loteadora e o empreendimento.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
            aria-label="Fechar"
            disabled={sending}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Validando parcelas no servidor…
            </div>
          ) : null}

          {error ? (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          {showResult && result ? (
            <div className="space-y-3 text-sm">
              {result.replayed ? (
                <p className="text-xs text-amber-200">
                  Este lote já havia sido processado. Nada foi reenviado aos clientes com sucesso.
                </p>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Processados" value={String(result.processed)} />
                <Stat label="Enviadas" value={String(result.sent)} />
                <Stat label="Falharam" value={String(result.failed)} />
                <Stat label="Ignoradas" value={String(result.skipped)} />
              </div>
              {result.failed > 0 ? (
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Falhas
                  </p>
                  <ul className="space-y-2">
                    {result.items
                      .filter((item) => item.status === 'failed')
                      .map((item) => (
                        <li key={item.customerId} className="text-xs text-[var(--text-secondary)]">
                          <span className="font-medium text-[var(--text-primary)]">
                            {item.customerName}
                          </span>
                          {' — '}
                          {item.error || 'Falha no envio'}
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {!showResult && preview ? (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="Clientes" value={String(preview.customerCount)} />
                <Stat label="Parcelas" value={String(preview.installmentCount)} />
                <Stat label="Total selecionado" value={money(preview.selectedAmount)} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <Stat label="Prontos para envio" value={String(preview.readyCustomerCount)} />
                <Stat label="Sem telefone" value={String(preview.missingPhoneCount)} />
                <Stat label="Telefone inválido" value={String(preview.invalidPhoneCount)} />
                <Stat label="Sem meio de pagamento" value={String(preview.noPaymentMethodCount)} />
              </div>
              {preview.sendBlockedReason ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                  {preview.sendBlockedReason}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-secondary)]">
                  Teto desta homologação: {preview.readyCustomerCount} cliente(s) prontos, no máximo 20
                  por lote. Envio sequencial pela Central SV Lotes.
                </p>
              )}

              {preview.skippedParcels.length > 0 ? (
                <details className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-medium">
                    Parcelas que não serão cobradas ({preview.skippedParcels.length})
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--text-secondary)]">
                    {preview.skippedParcels.map((parcel) => (
                      <li key={parcel.installmentId}>
                        {parcel.customerName} — {parcel.parcelLabel}: {skipLabel(parcel.skipReason)}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <button
                type="button"
                onClick={() => setPreviewOpen((open) => !open)}
                className="text-xs font-medium text-violet-300 hover:underline"
              >
                {previewOpen ? 'Ocultar prévia das mensagens' : 'Visualizar prévia das mensagens'}
              </button>
              {previewOpen ? (
                <div className="max-h-56 space-y-3 overflow-y-auto">
                  {preview.customers
                    .filter((group) => group.sendable && group.message)
                    .map((group) => (
                      <pre
                        key={group.customerId}
                        className="whitespace-pre-wrap rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] p-3 text-[11px] leading-relaxed text-[var(--text-secondary)]"
                      >
                        {group.message}
                      </pre>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-elevated)] disabled:opacity-50"
          >
            {showResult ? 'Fechar' : 'Cancelar'}
          </button>
          {showResult && result && result.failed > 0 ? (
            <button
              type="button"
              onClick={onRetryFailed}
              disabled={sending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
              Reenviar somente falhas
            </button>
          ) : null}
          {!showResult ? (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirmDisabled}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-600/90 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
              Confirmar envio
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">{value}</div>
    </div>
  );
}
