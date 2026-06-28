'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  formatCompanyAsaasChargeStatusLabel,
  isActiveCompanyAsaasChargeStatus,
  isRegeneratableCompanyAsaasChargeStatus,
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasChargeWorkflowState,
  resolveCompanyAsaasPaymentLink,
} from '@/lib/finance/companyAsaasChargeWorkflow';

type Props = {
  disabled?: boolean;
  charge: CompanyAsaasChargeResponse | null;
  loading?: boolean;
  error?: string | null;
  onGenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onRefreshStatus: () => void;
  onCancel: () => void;
  onRegenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onClearError?: () => void;
  formatCurrency: (value: number) => string;
};

async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.split('T')[0] || value;
  return date.toLocaleString('pt-BR');
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.split('T')[0].split('-').reverse().join('/');
}

function statusBadgeClass(status: CompanyAsaasChargeResponse['status']): string {
  if (status === 'PAID') return 'bg-emerald-500/15 text-emerald-400';
  if (status === 'CANCELLED' || status === 'FAILED') return 'bg-rose-500/15 text-rose-400';
  if (status === 'OVERDUE') return 'bg-amber-500/15 text-amber-400';
  return 'bg-violet-500/15 text-violet-300';
}

export function AsaasInstallmentChargePanel({
  disabled = false,
  charge,
  loading = false,
  error = null,
  onGenerate,
  onRefreshStatus,
  onCancel,
  onRegenerate,
  onClearError,
  formatCurrency,
}: Props) {
  const [billingType, setBillingType] = useState<'PIX' | 'BOLETO'>('PIX');
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const workflowState = resolveCompanyAsaasChargeWorkflowState(charge);
  const paymentLink = charge ? resolveCompanyAsaasPaymentLink(charge) : '';
  const boletoUrl = charge ? resolveCompanyAsaasBoletoUrl(charge) : '';
  const hasActiveCharge = charge ? isActiveCompanyAsaasChargeStatus(charge.status) : false;
  const canRegenerate = charge
    ? isRegeneratableCompanyAsaasChargeStatus(charge.status) || hasActiveCharge
    : false;

  const pixImageSrc = useMemo(() => {
    const raw = charge?.pixQrCode?.trim();
    if (!raw) return null;
    if (raw.startsWith('data:') || raw.startsWith('http')) return raw;
    return `data:image/png;base64,${raw}`;
  }, [charge?.pixQrCode]);

  const handleCopy = async (value: string, label: string) => {
    const ok = await copyText(value);
    setCopyFeedback(ok ? `${label} copiado.` : `Não foi possível copiar ${label.toLowerCase()}.`);
    window.setTimeout(() => setCopyFeedback(null), 2200);
  };

  const actionBtnClass =
    'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-card-alt)] disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:min-w-[132px]';

  return (
    <div className="asaas-charge-panel rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Banknote className="h-4 w-4 shrink-0 text-violet-400" />
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">Cobrança Asaas</h4>
        </div>
        {charge ? (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass(charge.status)}`}
          >
            {formatCompanyAsaasChargeStatusLabel(charge.status)}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
          <div className="flex items-start gap-2 text-sm text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p>{error}</p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold underline underline-offset-2"
                onClick={() => {
                  onClearError?.();
                  onGenerate(billingType);
                }}
                disabled={disabled || loading}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {copyFeedback ? (
        <p className="mb-2 text-xs text-emerald-400">{copyFeedback}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-4 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
          Criando cobrança no Asaas...
        </div>
      ) : null}

      {!loading && workflowState === 'none' ? (
        <div className="space-y-3">
          <p className="text-xs text-[var(--text-muted)]">
            Gere uma cobrança oficial no Asaas para esta parcela. PIX ou boleto conforme a forma escolhida.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['PIX', 'BOLETO'] as const).map((type) => (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => setBillingType(type)}
                className={`min-h-[40px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  billingType === type
                    ? 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40'
                    : 'border border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-secondary)]'
                }`}
              >
                {type === 'PIX' ? 'PIX' : 'Boleto'}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onGenerate(billingType)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-violet-500 disabled:opacity-50 sm:w-auto"
          >
            <QrCode className="h-4 w-4" />
            Gerar Cobrança
          </button>
        </div>
      ) : null}

      {!loading && charge && workflowState === 'paid' ? (
        <p className="text-sm text-emerald-400">Esta parcela já foi paga.</p>
      ) : null}

      {!loading && charge && workflowState !== 'none' && workflowState !== 'paid' ? (
        <div className="space-y-3">
          <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">Valor</p>
              <p className="font-semibold text-[var(--text-primary)]">{formatCurrency(charge.value)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">Vencimento</p>
              <p className="font-semibold text-[var(--text-primary)]">{formatDate(charge.dueDate)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">ID Asaas</p>
              <p className="truncate font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                {charge.asaasPaymentId}
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">Criada em</p>
              <p className="font-semibold text-[var(--text-primary)]">{formatDateTime(charge.createdAt)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">Última sincronização</p>
              <p className="font-semibold text-[var(--text-primary)]">{formatDateTime(charge.updatedAt)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] px-3 py-2">
              <p className="text-[var(--text-muted)]">Forma</p>
              <p className="font-semibold text-[var(--text-primary)]">
                {charge.billingType === 'BOLETO' ? 'Boleto' : 'PIX'}
              </p>
            </div>
          </div>

          {pixImageSrc ? (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">QR Code PIX</p>
              <img
                src={pixImageSrc}
                alt="QR Code PIX Asaas"
                className="mx-auto h-auto max-h-44 w-full max-w-[220px] rounded-md bg-white p-2"
              />
            </div>
          ) : null}

          {charge.pixCopyPaste ? (
            <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3">
              <p className="mb-1 text-xs font-medium text-[var(--text-muted)]">PIX copia e cola</p>
              <p className="break-all font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {charge.pixCopyPaste}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pb-1">
            {boletoUrl ? (
              <a
                href={boletoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={actionBtnClass}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir boleto
              </a>
            ) : null}
            {paymentLink ? (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className={actionBtnClass}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir link
              </a>
            ) : null}
            {charge.pixCopyPaste ? (
              <button
                type="button"
                className={actionBtnClass}
                onClick={() => void handleCopy(charge.pixCopyPaste || '', 'PIX')}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar PIX
              </button>
            ) : null}
            {paymentLink ? (
              <button
                type="button"
                className={actionBtnClass}
                onClick={() => void handleCopy(paymentLink, 'Link')}
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar link
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled || loading}
              className={actionBtnClass}
              onClick={onRefreshStatus}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar status
            </button>
            {hasActiveCharge ? (
              <button
                type="button"
                disabled={disabled || loading}
                className={`${actionBtnClass} !border-rose-500/30 !text-rose-300 hover:!bg-rose-500/10`}
                onClick={onCancel}
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancelar cobrança
              </button>
            ) : null}
            {canRegenerate ? (
              <button
                type="button"
                disabled={disabled || loading}
                className={actionBtnClass}
                onClick={() => onRegenerate(charge.billingType === 'BOLETO' ? 'BOLETO' : 'PIX')}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regenerar cobrança
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
