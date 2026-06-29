import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { resolveCompanyAsaasPaymentLink } from '@/lib/finance/companyAsaasChargeWorkflow';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import {
  buildSignatureShareWhatsAppUrl,
  normalizeWhatsAppPhone,
} from '@/lib/saasContractSignatureShare';

/** Boleto/fatura Asaas — sem fallback para paymentLink genérico. */
export function resolveChargeWhatsAppBoletoOrInvoiceUrl(
  charge: CompanyAsaasChargeResponse,
): string {
  return String(charge.bankSlipUrl || charge.invoiceUrl || '').trim();
}

/**
 * Link principal do WhatsApp: boleto/fatura primeiro; senão link de pagamento Asaas.
 */
export function resolveChargeWhatsAppPrimaryPaymentUrl(
  charge: CompanyAsaasChargeResponse,
): string {
  const boletoOrInvoice = resolveChargeWhatsAppBoletoOrInvoiceUrl(charge);
  if (boletoOrInvoice) return boletoOrInvoice;
  return resolveCompanyAsaasPaymentLink(charge).trim();
}

/** Qualquer URL enviável na mensagem (boleto, fatura ou link de pagamento). */
export function resolveChargeWhatsAppShareableUrl(
  charge: CompanyAsaasChargeResponse,
): string {
  return String(
    charge.bankSlipUrl || charge.invoiceUrl || charge.paymentLink || '',
  ).trim();
}

/**
 * Preserva URLs/PIX após sync de status — Asaas pode omitir campos em cobranças PAID.
 */
export function withCompanyAsaasChargeShareFieldsPreserved(
  previous: CompanyAsaasChargeResponse | undefined,
  next: CompanyAsaasChargeResponse,
): CompanyAsaasChargeResponse {
  if (!previous) return next;

  const invoiceUrl = next.invoiceUrl || previous.invoiceUrl;
  const bankSlipUrl = next.bankSlipUrl || previous.bankSlipUrl;
  const pixCopyPaste = next.pixCopyPaste || previous.pixCopyPaste;
  const pixQrCode = next.pixQrCode || previous.pixQrCode;
  const paymentLink =
    invoiceUrl || bankSlipUrl || next.paymentLink || previous.paymentLink;

  return {
    ...next,
    invoiceUrl,
    bankSlipUrl,
    pixCopyPaste,
    pixQrCode,
    paymentLink,
  };
}

export function canShowChargeWhatsAppButton(input: {
  ownerReadOnly: boolean;
  charge: CompanyAsaasChargeResponse | null | undefined;
  customerPhone?: string | null;
}): boolean {
  if (input.ownerReadOnly) return false;
  if (!input.charge) return false;
  if (input.charge.status === 'CANCELLED') return false;
  if (!normalizeWhatsAppPhone(input.customerPhone)) return false;
  return Boolean(resolveChargeWhatsAppShareableUrl(input.charge));
}

export type BuildChargeWhatsAppMessageInput = {
  clientName: string;
  parcelLabel: string;
  contractNumber: string;
  projectName: string;
  lotLabel: string;
  amount: number;
  dueDateLabel: string;
  charge: CompanyAsaasChargeResponse;
};

export function buildChargeWhatsAppMessage(input: BuildChargeWhatsAppMessageInput): string {
  const primaryUrl = resolveChargeWhatsAppPrimaryPaymentUrl(input.charge);
  const pixCopy = String(input.charge.pixCopyPaste || '').trim();
  const hasBoletoOrInvoice = Boolean(resolveChargeWhatsAppBoletoOrInvoiceUrl(input.charge));
  const clientName = input.clientName.trim() || 'Cliente';
  const contractNumber = input.contractNumber.trim() || 'S/N';
  const valor = formatCurrencyBRL(Number(input.amount) || Number(input.charge.value) || 0);

  const lines: string[] = [
    `Olá, ${clientName}! Segue sua cobrança referente a ${input.parcelLabel} do contrato ${contractNumber}.`,
    '',
    `Empreendimento: ${input.projectName}`,
    `Lote: ${input.lotLabel}`,
    `Valor: ${valor}`,
    `Vencimento: ${input.dueDateLabel}`,
    '',
  ];

  if (primaryUrl) {
    lines.push(
      hasBoletoOrInvoice
        ? 'Acesse o boleto/fatura para pagar:'
        : 'Acesse o link para pagar:',
      primaryUrl,
      '',
      'Nesta página você também poderá pagar via PIX/QR Code, quando disponível.',
      '',
    );
  }

  if (pixCopy) {
    lines.push('PIX copia e cola:', pixCopy, '');
  }

  lines.push('SV LOTES');
  return lines.join('\n');
}

export function buildChargeWhatsAppShareUrl(
  phone: string | null | undefined,
  message: string,
): string | null {
  return buildSignatureShareWhatsAppUrl(phone, message);
}

export function canShareChargeViaWhatsApp(input: {
  phone?: string | null;
  charge: CompanyAsaasChargeResponse;
}): boolean {
  return canShowChargeWhatsAppButton({
    ownerReadOnly: false,
    charge: input.charge,
    customerPhone: input.phone,
  });
}

export function resolveChargeContractNumber(row: Record<string, unknown>): string {
  const sales = row.sales as
    | {
        contracts?:
          | Array<{ contract_number?: string }>
          | { contract_number?: string };
      }
    | undefined;
  const contracts = sales?.contracts;
  const first = Array.isArray(contracts) ? contracts[0] : contracts;
  return String(first?.contract_number || '').trim() || 'S/N';
}
