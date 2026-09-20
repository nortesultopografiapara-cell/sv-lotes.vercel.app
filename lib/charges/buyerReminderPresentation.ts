/**
 * Rótulos e mascaramento da homologação dos lembretes ao comprador.
 * Não altera elegibilidade nem envio.
 */

import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  resolveChargeWhatsAppBoletoOrInvoiceUrl,
} from '@/lib/charges/chargeWhatsAppMessage';
import { maskEmailPublic, maskPhonePublic } from '@/lib/signaturePrivacy';
import type {
  BuyerReminderChannel,
  BuyerReminderEventType,
  BuyerReminderSettings,
  BuyerReminderSkipReason,
} from '@/lib/charges/buyerReminderTypes';

export const BUYER_REMINDER_SKIP_REASON_LABELS: Record<BuyerReminderSkipReason, string> = {
  already_paid: 'Parcela já paga',
  canceled: 'Parcela cancelada',
  sale_canceled: 'Parcela cancelada',
  not_due: 'Fora da data do evento',
  invalid_phone: 'Telefone inválido',
  missing_email: 'E-mail não cadastrado',
  missing_payment_method: 'Sem meio de pagamento',
  already_sent: 'Evento já enviado',
  automation_disabled: 'Automação desligada',
  channel_disabled: 'Canal desativado',
  event_disabled: 'Evento desativado',
  missing_customer: 'Cliente não vinculado',
  other_tenant: 'Parcela de outra empresa',
  retry_exhausted: 'Limite de tentativas',
};

export function formatBuyerReminderEventLabel(
  event: BuyerReminderEventType,
  settings?: Pick<BuyerReminderSettings, 'dueSoonDays' | 'overdueDays'>,
): string {
  if (event === 'due_soon') return `D-${settings?.dueSoonDays ?? 3}`;
  if (event === 'due_today') return 'D0';
  return `D+${settings?.overdueDays ?? 3}`;
}

export function formatBuyerReminderRunDateLabel(iso?: string | null): string {
  const raw = String(iso || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw || '—';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function describeBuyerReminderPaymentMethod(
  charge?: CompanyAsaasChargeResponse | null,
): string | null {
  if (!charge) return null;
  const parts: string[] = [];
  if (resolveChargeWhatsAppBoletoOrInvoiceUrl(charge)) parts.push('Boleto/Fatura');
  if (String(charge.pixCopyPaste || '').trim()) parts.push('PIX');
  if (String(charge.bankSlipIdentification || '').trim()) parts.push('Linha digitável');
  if (!parts.length && String(charge.paymentLink || '').trim()) parts.push('Link de pagamento');
  return parts.length ? parts.join(' + ') : null;
}

export function maskBuyerReminderRecipient(
  channel: BuyerReminderChannel,
  recipient?: string | null,
): string | null {
  const raw = String(recipient || '').trim();
  if (!raw) return null;
  return channel === 'email' ? maskEmailPublic(raw) : maskPhonePublic(raw);
}

export function buyerReminderSkipReasonLabel(
  reason?: BuyerReminderSkipReason | string | null,
): string | null {
  if (!reason) return null;
  return BUYER_REMINDER_SKIP_REASON_LABELS[reason as BuyerReminderSkipReason] || reason;
}
