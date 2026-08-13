'use client';

import {
  Copy,
  ExternalLink,
  FileText,
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
  BOLETO_UNAVAILABLE_WARNING,
  CHARGES_WHATSAPP_TOOLTIP,
  resolveChargeActionVisibility,
  resolveCompanyAsaasDetailsUrl,
  resolveCompanyAsaasReceiptUrl,
  type ChargeActionVisibility,
} from '@/lib/charges/chargeOperationsHelpers';
import {
  INTER_PDF_NOT_MATERIALIZED_HINT,
  resolveInterIssuedChargeActions,
} from '@/lib/charges/interChargeActions';
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
  /** Provider da conta financeira da parcela. */
  chargeProvider?: 'ASAAS_COMPANY' | 'INTER';
  ownerReadOnly: boolean;
  busy: boolean;
  installmentsDataReady?: boolean;
  customerPhone?: string | null;
  whatsappShareUrl?: string | null;
  hasPaidChargeHistory?: boolean;
  onGenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onRefreshStatus: () => void;
  onCancel: () => void;
  onRegenerate: (billingType: 'PIX' | 'BOLETO') => void;
  onCopyPix: () => void;
  onCopyBarcodeLine: () => void;
  onWhatsApp: () => void;
  onDownloadPdf?: () => void;
};

export function resolveChargeInstallmentActionsProps(
  params: Omit<
    ChargeInstallmentActionsProps,
    | 'onGenerate'
    | 'onRefreshStatus'
    | 'onCancel'
    | 'onRegenerate'
    | 'onCopyPix'
    | 'onCopyBarcodeLine'
    | 'onWhatsApp'
    | 'onDownloadPdf'
  >,
): ChargeActionVisibility {
  return resolveChargeActionVisibility({
    charge: params.charge,
    installmentPaid: params.installmentPaid,
    integrationActive: params.integrationActive,
    companyAsaasEnabled: params.companyAsaasEnabled,
    ownerReadOnly: params.ownerReadOnly,
    installmentsDataReady: params.installmentsDataReady,
    installmentId: params.view.id,
    customerPhone: params.customerPhone,
    hasPaidChargeHistory: params.hasPaidChargeHistory,
  });
}

export function ChargeInstallmentActions({
  view,
  charge,
  installmentPaid,
  integrationActive,
  companyAsaasEnabled,
  chargeProvider = 'ASAAS_COMPANY',
  ownerReadOnly,
  busy,
  installmentsDataReady = true,
  customerPhone,
  whatsappShareUrl,
  hasPaidChargeHistory = false,
  onGenerate,
  onRefreshStatus,
  onCancel,
  onRegenerate,
  onCopyPix,
  onCopyBarcodeLine,
  onWhatsApp,
  onDownloadPdf,
}: ChargeInstallmentActionsProps) {
  const isInter = chargeProvider === 'INTER' || view.chargeProvider === 'INTER';
  const providerReady = isInter ? true : companyAsaasEnabled && integrationActive;

  const actions = resolveChargeActionVisibility({
    charge,
    installmentPaid,
    integrationActive: isInter ? true : integrationActive,
    companyAsaasEnabled: isInter ? true : companyAsaasEnabled,
    ownerReadOnly,
    installmentsDataReady,
    installmentId: view.id,
    customerPhone,
    hasPaidChargeHistory,
  });

  const paymentLink = !isInter && charge ? resolveCompanyAsaasPaymentLink(charge) : '';
  const boletoUrl = !isInter && charge ? resolveCompanyAsaasBoletoUrl(charge) : '';
  const receiptUrl = !isInter ? resolveCompanyAsaasReceiptUrl(charge) : null;
  const detailsUrl = !isInter ? resolveCompanyAsaasDetailsUrl(charge) : null;
  const regenerateBillingType =
    charge?.billingType === 'PIX' ? 'PIX' : ('BOLETO' as const);
  const interActions = isInter
    ? resolveInterIssuedChargeActions({ charge, installmentPaid })
    : null;
  const showGenerate = Boolean(
    actions.showGenerate && providerReady && !interActions?.hideGenerate,
  );
  const showCopyBarcodeLine = isInter
    ? Boolean(interActions?.showCopyLinha)
    : actions.showCopyBarcodeLine;
  const showCopyPix = isInter ? Boolean(interActions?.showCopyPix) : actions.showCopyPix;

  if (!isInter && !companyAsaasEnabled) {
    return (
      <span className="text-[10px] text-[var(--text-muted)]">Asaas indisponível</span>
    );
  }

  if (!isInter && !integrationActive) {
    return (
      <span className="text-[10px] text-amber-400/90" title="Integração Asaas não está ativa.">
        Integração inativa
      </span>
    );
  }

  if (!installmentsDataReady) {
    return (
      <span className="text-[10px] text-rose-400/90" title="Parcelas não carregadas corretamente.">
        Dados indisponíveis
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5" data-installment-id={view.id}>
      <div className="flex flex-wrap justify-end gap-1.5">
        {showGenerate ? (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate('BOLETO')}
              className={btnPrimaryClass}
              title={
                isInter
                  ? 'Gerar cobrança via Banco Inter (Cobrança V3 — boleto/Pix)'
                  : 'Gerar cobrança com boleto e Pix no Asaas'
              }
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Gerar cobrança
            </button>
            {!isInter ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => onGenerate('BOLETO')}
                className={btnClass}
                title="Gerar boleto bancário com Pix como alternativa"
              >
                Boleto
              </button>
            ) : null}
          </>
        ) : null}

        {actions.showOpenCharge && paymentLink ? (
          <a
            href={paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            title="Abrir página da cobrança no Asaas"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir cobrança
          </a>
        ) : null}

        {actions.showOpenBoleto && boletoUrl ? (
          <a
            href={boletoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            title="Abrir PDF do boleto"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver boleto
          </a>
        ) : null}

        {actions.showOpenReceipt && receiptUrl ? (
          <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            title="Abrir comprovante oficial do Asaas"
          >
            <FileText className="h-3.5 w-3.5" />
            Ver comprovante
          </a>
        ) : null}

        {actions.showViewDetails && detailsUrl && detailsUrl !== paymentLink ? (
          <a
            href={detailsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            title="Ver detalhes da cobrança Asaas"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver detalhes
          </a>
        ) : null}

        {actions.showViewDetails && detailsUrl && detailsUrl === paymentLink && !actions.showOpenCharge ? (
          <a
            href={detailsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={btnClass}
            title="Ver detalhes da cobrança Asaas"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver detalhes
          </a>
        ) : null}

        {showCopyBarcodeLine ? (
          <button
            type="button"
            className={btnClass}
            onClick={onCopyBarcodeLine}
            title="Copiar linha digitável do boleto"
          >
            <Copy className="h-3.5 w-3.5" />
            Copiar linha digitável
          </button>
        ) : null}

        {showCopyPix ? (
          <button type="button" className={btnClass} onClick={onCopyPix} title="Copiar Pix copia e cola">
            <Copy className="h-3.5 w-3.5" />
            Copiar Pix
          </button>
        ) : null}

        {isInter && interActions?.showOfficialPdf && onDownloadPdf ? (
          <button
            type="button"
            disabled={busy}
            onClick={onDownloadPdf}
            className={btnClass}
            title="Baixar PDF oficial do boleto Inter (Cobrança V3)"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Baixar PDF
          </button>
        ) : null}

        {actions.showRefreshStatus && !isInter ? (
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

        {isInter && interActions?.showRefresh ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRefreshStatus}
            className={btnVioletClass}
            title="Consultar Cobrança V3 e materializar linha/Pix/nosso número (não emite)"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Atualizar dados
          </button>
        ) : null}

        {actions.showCancel && !isInter ? (
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

        {actions.showRegenerate && !isInter ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onRegenerate(regenerateBillingType)}
            className={btnClass}
            title="Regenerar cobrança Asaas"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Regenerar
          </button>
        ) : null}

        {actions.showWhatsApp ? (
          whatsappShareUrl ? (
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={btnClass}
              title={CHARGES_WHATSAPP_TOOLTIP}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          ) : (
            <button
              type="button"
              className={btnClass}
              onClick={onWhatsApp}
              title={CHARGES_WHATSAPP_TOOLTIP}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          )
        ) : null}

        {actions.showPaidIndicator ? (
          <span className="text-[10px] text-[var(--text-muted)]">Parcela paga</span>
        ) : null}

        {!charge && hasPaidChargeHistory && !isInter ? (
          <span
            className="text-[10px] text-amber-400/90"
            title="Há histórico de cobrança Asaas. Atualize a lista se os links não aparecerem."
          >
            Histórico Asaas
          </span>
        ) : null}

        {isInter && charge?.asaasPaymentId ? (
          <span
            className="text-[10px] text-emerald-400/90"
            title={`Cobrança Inter ${charge.asaasPaymentId}`}
          >
            Inter emitida
          </span>
        ) : null}
      </div>

      {isInter && interActions?.showRefresh && !interActions.showOfficialPdf ? (
        <p className="max-w-md text-right text-[10px] leading-snug text-amber-400/95">
          {INTER_PDF_NOT_MATERIALIZED_HINT}
        </p>
      ) : null}

      {actions.showBoletoUnavailableWarning && !isInter ? (
        <p className="max-w-md text-right text-[10px] leading-snug text-amber-400/95">
          {BOLETO_UNAVAILABLE_WARNING}
        </p>
      ) : null}

      {actions.showReceiptUnavailableHint && !isInter ? (
        <p className="max-w-md text-right text-[10px] leading-snug text-[var(--text-muted)]">
          Comprovante ainda não disponível no Asaas. Os demais links da cobrança permanecem ativos.
        </p>
      ) : null}
    </div>
  );
}
