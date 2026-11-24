'use client';

import {
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
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
  formatCancelledChargeHistoryLabel,
  isLocallyCancelledChargeStatus,
  canOfferChargeGenerateInUi,
  chargeProviderRequiresBankStatusConsult,
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
import { resolveC6ChargeActions } from '@/lib/charges/c6ChargeActions';

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
  chargeProvider?: 'ASAAS_COMPANY' | 'INTER' | 'C6';
  c6Notice?: { uncertain: boolean; message: string } | null;
  ownerReadOnly: boolean;
  busy: boolean;
  installmentsDataReady?: boolean;
  /** Falso enquanto Asaas/Inter ainda não foram lidos por Atualizar lista. */
  bankStatusConsulted?: boolean;
  /** Falso até a leitura local das cobranças C6. Enquanto isso, Gerar fica oculto. */
  c6ChargesLoaded?: boolean;
  /** Verdadeiro somente quando o servidor autorizou o POST desta parcela. */
  c6EmitAuthorized?: boolean;
  customerPhone?: string | null;
  customerEmail?: string | null;
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
  onViewPdf?: () => void;
  onSendEmail?: () => void;
  /** Homologação Develop: não oferece emissão, cancelamento nem envio. */
  outboundBlocked?: boolean;
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
    | 'onSendEmail'
  >,
): ChargeActionVisibility {
  const st = String(params.view.installmentStatus || '').toLowerCase();
  const installmentCanceled =
    st === 'cancelado' || st === 'canceled' || st === 'cancelled';
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
    installmentCanceled,
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
  bankStatusConsulted = true,
  c6ChargesLoaded = false,
  c6EmitAuthorized = false,
  customerPhone,
  customerEmail,
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
  onViewPdf,
  onSendEmail,
  outboundBlocked = false,
  c6Notice = null,
}: ChargeInstallmentActionsProps) {
  if (outboundBlocked) {
    return (
      <span className="text-[10px] text-[var(--text-muted)]">
        Emissão bloqueada na homologação
      </span>
    );
  }
  const isC6 = chargeProvider === 'C6' || view.chargeProvider === 'C6';
  const isInter = !isC6 && (chargeProvider === 'INTER' || view.chargeProvider === 'INTER');
  const providerReady = isInter ? true : companyAsaasEnabled && integrationActive;
  const st = String(view.installmentStatus || '').toLowerCase();
  const installmentCanceled =
    st === 'cancelado' || st === 'canceled' || st === 'cancelled';

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
    installmentCanceled,
  });

  const paymentLink = !isInter && charge ? resolveCompanyAsaasPaymentLink(charge) : '';
  const boletoUrl = !isInter && charge ? resolveCompanyAsaasBoletoUrl(charge) : '';
  const receiptUrl = !isInter ? resolveCompanyAsaasReceiptUrl(charge) : null;
  const detailsUrl = !isInter ? resolveCompanyAsaasDetailsUrl(charge) : null;
  const regenerateBillingType =
    charge?.billingType === 'PIX' ? 'PIX' : ('BOLETO' as const);
  const interActions = isInter
    ? resolveInterIssuedChargeActions({
        charge,
        installmentPaid: installmentPaid || installmentCanceled,
        customerEmail,
        customerPhone,
      })
    : null;
  const emitProvider = isInter ? 'INTER' : 'ASAAS_COMPANY';
  const awaitsBankStatus =
    chargeProviderRequiresBankStatusConsult(emitProvider) && !bankStatusConsulted;
  const showGenerate = canOfferChargeGenerateInUi({
    provider: emitProvider,
    bankStatusConsulted,
    otherwiseEligible: Boolean(
      actions.showGenerate &&
        providerReady &&
        !interActions?.hideGenerate &&
        !installmentCanceled,
    ),
  });
  const showConsultBeforeGenerate =
    awaitsBankStatus && !installmentPaid && !installmentCanceled && !ownerReadOnly;
  const showCopyBarcodeLine =
    !installmentCanceled &&
    (isInter ? Boolean(interActions?.showCopyLinha) : actions.showCopyBarcodeLine);
  const showCopyPix =
    !installmentCanceled &&
    (isInter ? Boolean(interActions?.showCopyPix) : actions.showCopyPix);

  if (isC6 && !installmentCanceled && !isLocallyCancelledChargeStatus(charge?.status)) {
    if (!c6ChargesLoaded) {
      return (
        <div className="flex flex-col items-end gap-1.5" data-installment-id={view.id}>
          <span className="text-[10px] text-[var(--text-muted)]">Consultando cobrança C6…</span>
        </div>
      );
    }
    const bolepix = charge?.c6Bolepix?.api === 'v2' ? charge.c6Bolepix : null;
    const c6 = resolveC6ChargeActions({
      externalId: charge?.asaasPaymentId,
      status: installmentPaid ? 'PAID' : charge?.status,
      digitableLine: charge?.bankSlipIdentification,
      barCode: charge?.barCode,
      installmentPaid,
      ownerReadOnly,
      uncertain:
        Boolean(c6Notice?.uncertain) ||
        charge?.c6Attempt?.kind === 'uncertain' ||
        charge?.c6Attempt?.kind === 'timeout' ||
        charge?.c6Attempt?.kind === 'waiting',
      rejectionMessage: c6Notice?.message || charge?.c6Attempt?.message,
      bolepix,
    });
    const qrMime = bolepix?.pixMimeType === 'image/png' || bolepix?.pixMimeType === 'image/jpeg'
      ? bolepix.pixMimeType
      : null;
    const qrImage = qrMime && charge?.pixQrCode && /^[A-Za-z0-9+/=\s]+$/.test(charge.pixQrCode)
      ? charge.pixQrCode
      : null;
    return (
      <div className="flex flex-col items-end gap-1.5" data-installment-id={view.id}>
        <div className="flex flex-wrap justify-end gap-1.5">
          {c6.showGenerate && c6EmitAuthorized ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onGenerate('BOLETO')}
              className={btnPrimaryClass}
              title="Emitir o boleto desta parcela no Banco C6"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5" />}
              Gerar boleto C6
            </button>
          ) : null}
          {c6.showView && onViewPdf ? (
            <button
              type="button"
              disabled={busy}
              onClick={onViewPdf}
              className={btnClass}
              title="Abrir o PDF devolvido pelo C6. Este arquivo não confirma que o boleto já pode ser pago na rede bancária."
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visualizar boleto
            </button>
          ) : null}
          {c6.showDownload && onDownloadPdf ? (
            <button
              type="button"
              disabled={busy}
              onClick={onDownloadPdf}
              className={btnClass}
              title="Baixar o PDF devolvido pelo C6. Este arquivo não confirma que o boleto já pode ser pago na rede bancária."
            >
              <FileText className="h-3.5 w-3.5" />
              Baixar PDF
            </button>
          ) : null}
          {c6.showCopyLine ? (
            <button type="button" className={btnClass} onClick={onCopyBarcodeLine} title="Copiar linha digitável">
              <Copy className="h-3.5 w-3.5" />
              Copiar linha digitável
            </button>
          ) : null}
          {c6.showCopyPix ? (
            <button type="button" className={btnClass} onClick={onCopyPix} title="Copiar o Pix Copia e Cola devolvido pelo C6">
              <Copy className="h-3.5 w-3.5" />
              Copiar Pix
            </button>
          ) : null}
          {c6.showWhatsApp ? (
            <button
              type="button"
              className={btnClass}
              disabled={busy}
              onClick={onWhatsApp}
              title="Enviar os dados bancários já confirmados pelo C6"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          ) : null}
          {c6.showPaid ? <span className="text-[10px] text-[var(--text-muted)]">Parcela paga</span> : null}
        </div>
        {c6.showQr && qrImage ? (
          <img
            src={`data:${qrMime};base64,${qrImage}`}
            alt="QR Code Pix devolvido pelo C6"
            className="h-24 w-24 rounded bg-white p-1"
          />
        ) : c6.showQr ? (
          <p className="max-w-md text-right text-[10px] text-[var(--text-muted)]">
            O C6 não devolveu a imagem do QR Code.
          </p>
        ) : null}
        {bolepix && charge?.nossoNumero ? (
          <p className="max-w-md text-right text-[10px] text-[var(--text-muted)]">
            Nosso Número: {charge.nossoNumero}
          </p>
        ) : null}
        {bolepix && charge?.barCode ? (
          <p className="max-w-md break-all text-right text-[10px] text-[var(--text-muted)]">
            Código de barras: {charge.barCode}
          </p>
        ) : null}
        {bolepix && !c6.showView ? (
          <p className="max-w-md text-right text-[10px] text-[var(--text-muted)]">
            O C6 ainda não devolveu o PDF oficial desta cobrança.
          </p>
        ) : null}
        {c6.bankStatusLabel ? (
          <p className="max-w-md text-right text-[10px] text-[var(--text-muted)]">
            Status bancário: {c6.bankStatusLabel}
          </p>
        ) : null}
        {c6.showGenerate && !c6EmitAuthorized ? (
          <p className="max-w-md text-right text-[10px] leading-snug text-[var(--text-muted)]">
            Emissão bloqueada nesta homologação.
          </p>
        ) : null}
        {c6.notice ? (
          <p
            className={`max-w-md text-right text-[10px] leading-snug ${
              c6.noticeTone === 'error'
                ? 'text-red-700'
                : c6.noticeTone === 'warning'
                  ? 'text-amber-700'
                  : 'text-[var(--text-muted)]'
            }`}
          >
            {c6.notice}
          </p>
        ) : null}
      </div>
    );
  }

  if (installmentCanceled || isLocallyCancelledChargeStatus(charge?.status)) {
    const confirmed = formatCancelledChargeHistoryLabel({
      charge,
      provider: chargeProvider,
    });
    return (
      <span className="text-[10px] text-[var(--text-muted)]">
        {confirmed || (installmentCanceled ? 'Parcela cancelada' : 'Cobrança sem confirmação remota de cancelamento')}
      </span>
    );
  }

  if (!isInter && !companyAsaasEnabled) {
    return (
      <span className="text-[10px] text-[var(--text-muted)]">Asaas indisponível</span>
    );
  }

  if (!isInter && !integrationActive && !awaitsBankStatus) {
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
        {showConsultBeforeGenerate ? (
          <span
            className="text-[10px] text-[var(--text-muted)]"
            title="A geração fica disponível depois que o status bancário for consultado."
          >
            Consulte o status em Atualizar lista
          </span>
        ) : null}
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
            Baixar boleto
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

        {(isInter ? Boolean(interActions?.showWhatsApp) : actions.showWhatsApp) ? (
          whatsappShareUrl ? (
            <a
              href={whatsappShareUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={btnClass}
              title={
                isInter
                  ? 'Enviar cobrança Inter por WhatsApp (Pix e/ou linha digitável)'
                  : CHARGES_WHATSAPP_TOOLTIP
              }
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
          ) : (
            <button
              type="button"
              className={btnClass}
              onClick={onWhatsApp}
              title={
                isInter
                  ? 'Enviar cobrança Inter por WhatsApp (Pix e/ou linha digitável)'
                  : CHARGES_WHATSAPP_TOOLTIP
              }
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          )
        ) : null}

        {isInter && interActions?.showEmail && onSendEmail ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSendEmail}
            className={btnClass}
            title="Enviar cobrança Inter por e-mail (Pix/linha e PDF oficial quando disponível)"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
            E-mail
          </button>
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

      {isInter && interActions?.artifactsPending ? (
        <p className="max-w-md text-right text-[10px] leading-snug text-amber-400/95">
          Cobrança emitida. Boleto/Pix ainda estão sendo processados pelo Banco Inter.
        </p>
      ) : null}

      {isInter && interActions?.showRefresh && !interActions.showOfficialPdf && !interActions.artifactsPending ? (
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
