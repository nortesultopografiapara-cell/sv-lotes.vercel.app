import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  formatCompanyAsaasChargeStatusLabel,
  isActiveCompanyAsaasChargeStatus,
  isRegeneratableCompanyAsaasChargeStatus,
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasPaymentLink,
} from '@/lib/finance/companyAsaasChargeWorkflow';
import { chargeSupportsBoleto } from '@/lib/finance/asaasCompanyLateFees';
import { computeInstallmentStatus, type FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';
import { canShowChargeWhatsAppButton } from '@/lib/charges/chargeWhatsAppMessage';
import { canGenerateAsaasChargeWithHistory } from '@/lib/finance/companyAsaasChargeLinkGuards';

export const CHARGES_WHATSAPP_TOOLTIP = 'Enviar cobrança por WhatsApp';

export const BOLETO_UNAVAILABLE_WARNING =
  'Boleto ainda não disponível. Verifique se a cobrança foi criada com billingType BOLETO ou suporte a boleto habilitado no Asaas.';

export type ChargeActionVisibility = {
  showGenerate: boolean;
  showOpenCharge: boolean;
  showOpenBoleto: boolean;
  showOpenReceipt: boolean;
  showViewDetails: boolean;
  showCopyBarcodeLine: boolean;
  showCopyPix: boolean;
  showWhatsApp: boolean;
  showBoletoUnavailableWarning: boolean;
  showReceiptUnavailableHint: boolean;
  showRefreshStatus: boolean;
  showCancel: boolean;
  showRegenerate: boolean;
  showPaidIndicator: boolean;
  /** @deprecated use showOpenCharge */
  showOpenLink: boolean;
  /** @deprecated use showCopyBarcodeLine */
  showCopyLink: boolean;
};

export type AsaasOperationalKpiSummary = {
  aguardandoGeracao: number;
  qtyAguardandoGeracao: number;
  cobrancasEmitidas: number;
  qtyCobrancasEmitidas: number;
};

export function isInstallmentPaidForCharges(row: FinanceReceiptRow, todayStr?: string): boolean {
  const status = computeInstallmentStatus(row, todayStr);
  return status === 'pago' || status === 'paid';
}

export function resolveAsaasStatusDisplayLabel(
  charge: CompanyAsaasChargeResponse | null | undefined,
  options?: {
    hasChargeHistory?: boolean;
    environmentMismatch?: boolean;
    legacySandbox?: boolean;
  },
): string {
  if (options?.environmentMismatch) return 'Cobrança de outro ambiente';
  if (options?.legacySandbox) return 'Sandbox';

  if (!charge) {
    // Nunca "Não gerada" quando há histórico local de cobrança.
    if (options?.hasChargeHistory) return 'Histórico disponível';
    return 'Não gerada';
  }

  const remote = String(charge.asaasRemoteStatus || '').toUpperCase();
  if (remote === 'RECEIVED' || remote === 'RECEIVED_IN_CASH' || remote === 'RECEBIDO' || remote === 'PAGO') {
    return 'Pago';
  }
  if (remote === 'A_RECEBER') return 'A receber';
  if (remote === 'EM_PROCESSAMENTO') return 'Em processamento';
  if (remote === 'CONFIRMED') return 'Confirmada';
  if (remote === 'PENDING') return 'Aguardando pagamento';
  if (remote === 'OVERDUE') return 'Vencida';
  if (remote === 'REFUNDED') return 'Estornada';
  if (remote === 'DELETED' || remote === 'CANCELED' || remote === 'CANCELLED') return 'Cancelada';

  if (charge.status === 'FAILED') return 'Erro';
  if (charge.status === 'PAID') return 'Pago';
  return formatCompanyAsaasChargeStatusLabel(charge.status);
}

/** Mescla resposta do GET charges no mapa local (chunked, sem apagar histórico não pedido). */
export const CHARGE_MAP_FETCH_CHUNK_SIZE = 40;

export function mergeFetchedChargesIntoMap(
  previous: Record<string, CompanyAsaasChargeResponse>,
  requestedIds: string[],
  fetched: CompanyAsaasChargeResponse[],
): Record<string, CompanyAsaasChargeResponse> {
  const next: Record<string, CompanyAsaasChargeResponse> = { ...previous };
  const found = new Set(fetched.map((c) => String(c.installmentId)));
  for (const charge of fetched) {
    next[String(charge.installmentId)] = charge;
  }
  for (const id of requestedIds) {
    const key = String(id);
    if (!found.has(key)) {
      // Nunca apagar vínculo com asaas_payment_id (pago/histórico) se o lote omitiu o id.
      const prev = next[key];
      if (prev?.asaasPaymentId) continue;
      delete next[key];
    }
  }
  return next;
}

export function chunkInstallmentIdsForChargeFetch(
  installmentIds: string[],
  chunkSize = CHARGE_MAP_FETCH_CHUNK_SIZE,
): string[][] {
  const ids = installmentIds.map((id) => String(id).trim()).filter(Boolean);
  if (ids.length === 0) return [];
  const size = Math.max(1, chunkSize);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export function resolveCompanyAsaasReceiptUrl(
  charge: CompanyAsaasChargeResponse | null | undefined,
): string {
  return String(charge?.transactionReceiptUrl || '').trim();
}

export function resolveCompanyAsaasDetailsUrl(
  charge: CompanyAsaasChargeResponse | null | undefined,
): string {
  if (!charge) return '';
  return (
    resolveCompanyAsaasPaymentLink(charge) ||
    resolveCompanyAsaasReceiptUrl(charge) ||
    ''
  );
}

export function canPerformMutableAsaasActions(params: {
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
}): boolean {
  return (
    params.companyAsaasEnabled &&
    params.integrationActive &&
    !params.ownerReadOnly
  );
}

export function canGenerateAsaasCharge(params: {
  installmentPaid: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  charge: CompanyAsaasChargeResponse | null | undefined;
  installmentsDataReady?: boolean;
  installmentId?: string;
  hasPaidChargeHistory?: boolean;
  hasUnresolvedChargeLink?: boolean;
}): boolean {
  return canGenerateAsaasChargeWithHistory(params);
}

export function canCancelAsaasCharge(params: {
  charge: CompanyAsaasChargeResponse | null | undefined;
  ownerReadOnly: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
}): boolean {
  if (!canPerformMutableAsaasActions(params)) return false;
  if (!params.charge) return false;
  if (params.charge.status === 'PAID') return false;
  return isActiveCompanyAsaasChargeStatus(params.charge.status);
}

export function canRegenerateAsaasCharge(params: {
  charge: CompanyAsaasChargeResponse | null | undefined;
  installmentPaid: boolean;
  ownerReadOnly: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
}): boolean {
  if (!canPerformMutableAsaasActions(params)) return false;
  if (params.installmentPaid) return false;
  if (!params.charge) return false;
  if (params.charge.status === 'PAID') return false;
  return (
    isRegeneratableCompanyAsaasChargeStatus(params.charge.status) ||
    isActiveCompanyAsaasChargeStatus(params.charge.status)
  );
}

export function resolveChargeActionVisibility(params: {
  charge: CompanyAsaasChargeResponse | null | undefined;
  installmentPaid: boolean;
  integrationActive: boolean;
  companyAsaasEnabled: boolean;
  ownerReadOnly: boolean;
  installmentsDataReady?: boolean;
  installmentId?: string;
  customerPhone?: string | null;
  hasPaidChargeHistory?: boolean;
}): ChargeActionVisibility {
  const paymentLink = params.charge ? resolveCompanyAsaasPaymentLink(params.charge) : '';
  const boletoUrl = params.charge ? resolveCompanyAsaasBoletoUrl(params.charge) : '';
  const receiptUrl = resolveCompanyAsaasReceiptUrl(params.charge);
  const detailsUrl = resolveCompanyAsaasDetailsUrl(params.charge);
  const pixCopy = params.charge?.pixCopyPaste?.trim() || '';
  const barcodeLine = params.charge?.bankSlipIdentification?.trim() || '';
  const hasCharge = Boolean(params.charge?.asaasPaymentId);
  const mutable = canPerformMutableAsaasActions(params);
  const expectsBoleto = params.charge ? chargeSupportsBoleto(params.charge.billingType) : false;
  const hasBoletoArtifact = Boolean(boletoUrl || barcodeLine);
  const showBoletoUnavailableWarning =
    Boolean(params.charge) &&
    expectsBoleto &&
    !hasBoletoArtifact &&
    !params.installmentPaid;
  const chargePaid = params.charge?.status === 'PAID';

  return {
    showGenerate: canGenerateAsaasCharge({
      ...params,
      hasPaidChargeHistory: params.hasPaidChargeHistory || chargePaid,
    }),
    // Links de consulta permanecem após pagamento (não substituir por "Parcela paga").
    showOpenCharge: Boolean(paymentLink),
    showOpenBoleto: Boolean(boletoUrl),
    showOpenReceipt: Boolean(receiptUrl),
    showViewDetails: Boolean(detailsUrl),
    showCopyBarcodeLine: Boolean(barcodeLine) && !params.installmentPaid && !chargePaid,
    showCopyPix: Boolean(pixCopy) && !params.installmentPaid && !chargePaid,
    showWhatsApp: canShowChargeWhatsAppButton({
      ownerReadOnly: params.ownerReadOnly,
      charge: params.charge,
      customerPhone: params.customerPhone,
    }),
    showBoletoUnavailableWarning,
    showReceiptUnavailableHint: hasCharge && chargePaid && !receiptUrl,
    showRefreshStatus: mutable && hasCharge && !params.installmentPaid && !chargePaid,
    showCancel: canCancelAsaasCharge(params),
    showRegenerate: canRegenerateAsaasCharge(params),
    showPaidIndicator: params.installmentPaid,
    showOpenLink: Boolean(paymentLink),
    showCopyLink: Boolean(paymentLink),
  };
}

export function computeAsaasOperationalKpis(
  rows: FinanceReceiptRow[],
  chargesByInstallment: Record<string, CompanyAsaasChargeResponse>,
  todayStr?: string,
): AsaasOperationalKpiSummary {
  let aguardandoGeracao = 0;
  let qtyAguardandoGeracao = 0;
  let cobrancasEmitidas = 0;
  let qtyCobrancasEmitidas = 0;

  for (const row of rows) {
    const status = computeInstallmentStatus(row, todayStr);
    if (
      status === 'pago' ||
      status === 'paid' ||
      status === 'cancelado' ||
      status === 'canceled'
    ) {
      continue;
    }

    const id = String(row.id);
    const charge = chargesByInstallment[id];
    const amt = Number(row.amount) || 0;

    // Cobrança já paga/encerrada no Asaas não entra em aguardando nem emitidas abertas.
    if (charge?.status === 'PAID') {
      continue;
    }

    // Só conta como emitida com id + identificador externo persistido (evita falso positivo).
    if (
      charge &&
      isActiveCompanyAsaasChargeStatus(charge.status) &&
      String(charge.asaasPaymentId || '').trim()
    ) {
      cobrancasEmitidas += amt;
      qtyCobrancasEmitidas += 1;
      continue;
    }

    if (!charge || isRegeneratableCompanyAsaasChargeStatus(charge.status)) {
      aguardandoGeracao += amt;
      qtyAguardandoGeracao += 1;
    }
  }

  return {
    aguardandoGeracao,
    qtyAguardandoGeracao,
    cobrancasEmitidas,
    qtyCobrancasEmitidas,
  };
}

export function mapCreateChargeApiError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('já foi paga') || normalized.includes('ja foi paga')) {
    return 'Não é possível gerar cobrança para parcela paga.';
  }
  if (normalized.includes('integração') || normalized.includes('integracao') || normalized.includes('inactive')) {
    return 'Integração Asaas não está ativa.';
  }
  if (normalized.includes('já existe') || normalized.includes('ja existe')) {
    return 'Cobrança já existe para esta parcela.';
  }
  return message;
}
