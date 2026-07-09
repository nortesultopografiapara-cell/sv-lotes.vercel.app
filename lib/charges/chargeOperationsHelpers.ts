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

export const CHARGES_WHATSAPP_TOOLTIP = 'Enviar cobrança por WhatsApp';

export const BOLETO_UNAVAILABLE_WARNING =
  'Boleto ainda não disponível. Verifique se a cobrança foi criada com billingType BOLETO ou suporte a boleto habilitado no Asaas.';

export type ChargeActionVisibility = {
  showGenerate: boolean;
  showOpenCharge: boolean;
  showOpenBoleto: boolean;
  showCopyBarcodeLine: boolean;
  showCopyPix: boolean;
  showWhatsApp: boolean;
  showBoletoUnavailableWarning: boolean;
  showRefreshStatus: boolean;
  showCancel: boolean;
  showRegenerate: boolean;
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
): string {
  if (!charge) return 'Não gerada';
  if (charge.status === 'FAILED') return 'Erro';
  if (charge.status === 'PAID') return 'Recebida/Paga';
  return formatCompanyAsaasChargeStatusLabel(charge.status);
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
}): boolean {
  if (params.installmentsDataReady === false) return false;
  if (params.installmentId !== undefined && !params.installmentId.trim()) return false;
  if (!canPerformMutableAsaasActions(params)) return false;
  if (params.installmentPaid) return false;
  if (!params.charge) return true;
  return false;
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
}): ChargeActionVisibility {
  const paymentLink = params.charge ? resolveCompanyAsaasPaymentLink(params.charge) : '';
  const boletoUrl = params.charge ? resolveCompanyAsaasBoletoUrl(params.charge) : '';
  const pixCopy = params.charge?.pixCopyPaste?.trim() || '';
  const barcodeLine = params.charge?.bankSlipIdentification?.trim() || '';
  const hasCharge = Boolean(params.charge);
  const mutable = canPerformMutableAsaasActions(params);
  const expectsBoleto = params.charge ? chargeSupportsBoleto(params.charge.billingType) : false;
  const hasBoletoArtifact = Boolean(boletoUrl || barcodeLine);
  const showBoletoUnavailableWarning =
    Boolean(params.charge) &&
    expectsBoleto &&
    !hasBoletoArtifact &&
    !params.installmentPaid;

  return {
    showGenerate: canGenerateAsaasCharge(params),
    showOpenCharge: Boolean(paymentLink),
    showOpenBoleto: Boolean(boletoUrl),
    showCopyBarcodeLine: Boolean(barcodeLine),
    showCopyPix: Boolean(pixCopy),
    showWhatsApp: canShowChargeWhatsAppButton({
      ownerReadOnly: params.ownerReadOnly,
      charge: params.charge,
      customerPhone: params.customerPhone,
    }),
    showBoletoUnavailableWarning,
    showRefreshStatus: mutable && hasCharge && !params.installmentPaid,
    showCancel: canCancelAsaasCharge(params),
    showRegenerate: canRegenerateAsaasCharge(params),
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

    if (charge && isActiveCompanyAsaasChargeStatus(charge.status)) {
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
