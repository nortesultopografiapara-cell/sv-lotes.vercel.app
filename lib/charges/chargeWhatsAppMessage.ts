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
  return Boolean(
    resolveChargeWhatsAppShareableUrl(input.charge) ||
      String(input.charge.pixCopyPaste || '').trim() ||
      String(input.charge.bankSlipIdentification || '').trim(),
  );
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

export function buildInterChargeWhatsAppMessage(input: BuildChargeWhatsAppMessageInput): string {
  const clientName = input.clientName.trim() || 'Cliente';
  const emp = input.projectName.trim();
  const lote = input.lotLabel.trim();
  const ref = [emp, lote].filter(Boolean).join(' — ') || 'sua parcela';
  const valor = formatCurrencyBRL(Number(input.amount) || Number(input.charge.value) || 0);
  const pixCopy = String(input.charge.pixCopyPaste || '').trim();
  const linha = String(input.charge.bankSlipIdentification || '').trim();

  const lines: string[] = [
    `Olá, ${clientName}. Segue sua cobrança referente a ${ref}.`,
    '',
    `Vencimento: ${input.dueDateLabel}`,
    `Valor: ${valor}`,
  ];
  if (pixCopy) {
    lines.push('', 'Pix copia e cola:', pixCopy);
  }
  if (linha) {
    lines.push('', 'Linha digitável:', linha);
  }
  lines.push('', 'SV LOTES');
  return lines.join('\n');
}

export function chargeHasInterWhatsAppPayload(charge: CompanyAsaasChargeResponse): boolean {
  return Boolean(
    String(charge.pixCopyPaste || '').trim() ||
      String(charge.bankSlipIdentification || '').trim(),
  );
}

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

/** Telefone do cliente na parcela (embed Supabase objeto ou array). */
export function resolveChargeCustomerPhone(row: Record<string, unknown>): string | null {
  const customers = row.customers;
  if (Array.isArray(customers)) {
    const first = customers[0] as { phone?: string | null } | undefined;
    const phone = String(first?.phone || '').trim();
    return phone || null;
  }
  if (customers && typeof customers === 'object') {
    const phone = String((customers as { phone?: string | null }).phone || '').trim();
    return phone || null;
  }
  return null;
}

export function resolveChargeCustomerEmail(row: Record<string, unknown>): string | null {
  const customers = row.customers;
  const pick = (value: unknown) => {
    const email = String(value || '').trim();
    return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  };
  if (Array.isArray(customers)) {
    return pick((customers[0] as { email?: string | null } | undefined)?.email);
  }
  if (customers && typeof customers === 'object') {
    return pick((customers as { email?: string | null }).email);
  }
  return null;
}

export type ChargeWhatsAppShareResult =
  | { ok: true; url: string; installmentId: string }
  | { ok: false; error: string; installmentId: string };

export function executeChargeWhatsAppShare(input: {
  installmentId: string;
  customerPhone?: string | null;
  charge: CompanyAsaasChargeResponse;
  messageInput: Omit<BuildChargeWhatsAppMessageInput, 'charge'>;
  preferInterMessage?: boolean;
}): ChargeWhatsAppShareResult {
  const installmentId = String(input.installmentId || '').trim();
  const phone = input.customerPhone;

  if (!normalizeWhatsAppPhone(phone)) {
    return {
      ok: false,
      error: 'Cliente sem telefone válido cadastrado.',
      installmentId,
    };
  }

  const hasAsaasUrl = Boolean(resolveChargeWhatsAppShareableUrl(input.charge));
  const useInterMessage =
    Boolean(input.preferInterMessage) ||
    (!hasAsaasUrl && chargeHasInterWhatsAppPayload(input.charge));
  if (!hasAsaasUrl && !chargeHasInterWhatsAppPayload(input.charge)) {
    return {
      ok: false,
      error: input.preferInterMessage
        ? 'Pix ou linha digitável indisponível para esta cobrança.'
        : 'Link da cobrança indisponível para envio por WhatsApp.',
      installmentId,
    };
  }

  const message = useInterMessage
    ? buildInterChargeWhatsAppMessage({
        ...input.messageInput,
        charge: input.charge,
      })
    : buildChargeWhatsAppMessage({
        ...input.messageInput,
        charge: input.charge,
      });
  const url = buildChargeWhatsAppShareUrl(phone, message);
  if (!url) {
    return {
      ok: false,
      error: 'Não foi possível montar o link do WhatsApp.',
      installmentId,
    };
  }

  return { ok: true, url, installmentId };
}

/** Abre wa.me no clique do usuário; fallback via âncora se pop-up for bloqueado. */
export function openChargeWhatsAppShareUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed.startsWith('https://wa.me/')) return false;

  try {
    const opened = window.open(trimmed, '_blank');
    if (opened) return true;
  } catch {
    // segue para fallback
  }

  try {
    const anchor = document.createElement('a');
    anchor.href = trimmed;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}
