'use client';

import {
  Copy,
  ExternalLink,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasPaymentLink,
} from '@/lib/finance/companyAsaasChargeWorkflow';
import {
  CHARGES_WHATSAPP_STUB_MESSAGE,
  resolveChargeActionVisibility,
  type ChargeActionVisibility,
} from '@/lib/charges/chargeOperationsHelpers';
import type { ChargeInstallmentView } from '@/lib/charges/chargeInstallmentHelpers';

const btnClass =
  'inline-flex min-h-[32px] items-center gap-1 rounded-md border border-[var(--border-color)] px-2 py-1 text-[11px] font-medium hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-50';
const btnPrimaryClass =
  'inline-flex min-h-[32px] items-center gap-1 rounded-md border border-violet-500/40 bg-violet-600/90 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50';
const btnDangerClass =
  'inline-flex min-h-[32px] items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50';
const btnVioletClass =
  'inline-flex min-h-[32px] items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-50';

export type ChargeInstallmentActionsProps = {
  view: ChargeInstallmentView;
  charge: CompanyAsaasChargeResponse | null;
  installmentPaid: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  busy: boolean;
  onGenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onRefreshStatus: () => void;
  onCancel: () => void;
  onRegenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onCopyPix: () => void;
  onCopyLink: () => void;
  onWhatsApp: () => void;
};

export function resolveChargeInstallmentActionsProps(
  params: Omit<
    ChargeInstallmentActionsProps,
    | 'onGenerate'
    | 'onRefreshStatus'
    | 'onCancel'
    | 'onRegenerate'
    | 'onCopyPix'
    | 'onCopyLink'
    | 'onWhatsApp'
  >,
): ChargeActionVisibility {
  return resolveChargeActionVisibility({
    charge: params.charge,
    installmentPaid: params.installmentPaid,
    integrationActive: params.integrationActive,
    companyAsaasEnabled: params.companyAsaasEnabled,
    ownerReadOnly: params.ownerReadOnly,
  });
}

export function ChargeInstallmentActions({
  view,
  charge,
  installmentPaid,
  integrationActive,
  companyAsaasEnabled,
  ownerReadOnly,
  busy,
  onGenerate,
  onRefreshStatus,
  onCancel,
  onRegenerate,
  onCopyPix,
  onCopyLink,
  onWhatsApp,
}: ChargeInstallmentActionsProps) {
  const actions = resolveChargeActionVisibility({
    charge,
    installmentPaid,
    integrationActive,
    companyAsaasEnabled,
    ownerReadOnly,
  });

  const paymentLink = charge ? resolveCompanyAsaasPaymentLink(charge) : '';
  const boletoUrl = charge ? resolveCompanyAsaasBoletoUrl(charge) : '';
  const billingType = charge?.billingType === 'BOLETO' ? 'BOLETO' : 'PIX';

  if (!companyAsaasEnabled) {
    return (
      <span className="text-[10px] text-[var(--text-muted)]">Asaas indisponível</span>
    );
  }

  if (!integrationActive) {
    return (
      <span className="text-[10px] text-amber-400/90" title="Integração Asaas não está ativa.">
        Integração inativa
      </span>
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5" data-installment-id={view.id}>
      {actions.showGenerate ? (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerate('PIX')}
            className={btnPrimaryClass}
            title="Gerar cobrança PIX no Asaas"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
            Gerar cobrança
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onGenerate('BOLETO')}
            className={btnClass}
            title="Gerar cobrança boleto no Asaas"
          >
            Boleto
          </button>
        </>
      ) : null}

      {actions.showOpenLink && paymentLink ? (
        <a
          href={paymentLink}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
          title="Abrir link de pagamento"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Link
        </a>
      ) : null}

      {actions.showOpenBoleto && boletoUrl ? (
        <a
          href={boletoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={btnClass}
          title="Abrir boleto"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Boleto
        </a>
      ) : null}

      {actions.showCopyPix ? (
        <button type="button" className={btnClass} onClick={onCopyPix} title="Copiar PIX copia e cola">
          <Copy className="h-3.5 w-3.5" />
          PIX
        </button>
      ) : null}

      {actions.showCopyLink && paymentLink ? (
        <button type="button" className={btnClass} onClick={onCopyLink} title="Copiar link de pagamento">
          <Copy className="h-3.5 w-3.5" />
          Copiar link
        </button>
      ) : null}

      {actions.showRefreshStatus ? (
        <button
          type="button"
          disabled={busy}
          onClick={onRefreshStatus}
          className={btnVioletClass}
          title="Atualizar status Asaas"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Status
        </button>
      ) : null}

      {actions.showCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={btnDangerClass}
          title="Cancelar cobrança Asaas"
        >
          <XCircle className="h-3.5 w-3.5" />
          Cancelar
        </button>
      ) : null}

      {actions.showRegenerate ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onRegenerate(billingType)}
          className={btnClass}
          title="Regenerar cobrança Asaas"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Regenerar
        </button>
      ) : null}

      {actions.showWhatsApp ? (
        <button
          type="button"
          className={btnClass}
          onClick={onWhatsApp}
          title={CHARGES_WHATSAPP_STUB_MESSAGE}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </button>
      ) : null}

      {installmentPaid && !charge ? (
        <span className="text-[10px] text-[var(--text-muted)]">Parcela paga</span>
      ) : null}
    </div>
  );
}
