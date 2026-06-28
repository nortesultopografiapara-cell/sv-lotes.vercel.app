import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  formatCompanyAsaasChargeStatusLabel,
  isActiveCompanyAsaasChargeStatus,
  isRegeneratableCompanyAsaasChargeStatus,
  resolveCompanyAsaasBoletoUrl,
  resolveCompanyAsaasPaymentLink,
} from '@/lib/finance/companyAsaasChargeWorkflow';
import { computeInstallmentStatus, type FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';

export const CHARGES_WHATSAPP_STUB_MESSAGE =
  'Envio WhatsApp desta cobrança será habilitado na próxima etapa.';

export type ChargeActionVisibility = {
  showGenerate: boolean;
  showOpenLink: boolean;
  showOpenBoleto: boolean;
  showCopyPix: boolean;
  showCopyLink: boolean;
  showRefreshStatus: boolean;
  showCancel: boolean;
  showRegenerate: boolean;
  showWhatsApp: boolean;
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
}): boolean {
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
}): ChargeActionVisibility {
  const paymentLink = params.charge ? resolveCompanyAsaasPaymentLink(params.charge) : '';
  const boletoUrl = params.charge ? resolveCompanyAsaasBoletoUrl(params.charge) : '';
  const pixCopy = params.charge?.pixCopyPaste?.trim() || '';
  const hasCharge = Boolean(params.charge);
  const mutable = canPerformMutableAsaasActions(params);

  return {
    showGenerate: canGenerateAsaasCharge(params),
    showOpenLink: Boolean(paymentLink),
    showOpenBoleto: Boolean(boletoUrl),
    showCopyPix: Boolean(pixCopy),
    showCopyLink: Boolean(paymentLink),
    showRefreshStatus: mutable && hasCharge && !params.installmentPaid,
    showCancel: canCancelAsaasCharge(params),
    showRegenerate: canRegenerateAsaasCharge(params),
    showWhatsApp: hasCharge && Boolean(paymentLink || pixCopy || boletoUrl),
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
