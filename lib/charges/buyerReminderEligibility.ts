/**
 * Elegibilidade pura dos lembretes automáticos ao comprador.
 * Usa computeInstallmentStatus — sem segunda interpretação de vencido.
 *
 * Comportamento sem meio de pagamento: SKIP (missing_payment_method).
 * Não envia mensagem sem boleto/PIX/link e não emite cobrança nova.
 */

import { computeInstallmentStatus, type FinanceReceiptRow } from '@/lib/charges/chargeInstallmentHelpers';
import { chargeHasSendablePaymentArtifact } from '@/lib/charges/chargeWhatsAppBatch';
import { toIsoDateOnly } from '@/lib/companySubscriptionDates';
import { isCanceledSaleStatus } from '@/lib/finance/releaseLotShared';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import { normalizeWhatsAppPhone } from '@/lib/whatsapp/clickToChat';
import {
  channelEnabled,
  eventEnabled,
  resolveBuyerReminderTargetDueDate,
  type BuyerReminderChannel,
  type BuyerReminderEventType,
  type BuyerReminderSettings,
  type BuyerReminderSkipReason,
} from '@/lib/charges/buyerReminderTypes';

export type BuyerReminderCandidateInput = {
  installmentId: string;
  companyId: string | null;
  tenantId: string | null;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  email: string | null;
  dueDateIso: string;
  rawStatus: string;
  saleStatus?: string | null;
  charge: CompanyAsaasChargeResponse | null;
};

export type BuyerReminderEvaluation = {
  sendable: boolean;
  skipReason: BuyerReminderSkipReason | null;
  computedStatus: string;
  normalizedPhone: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidReminderEmail(email?: string | null): boolean {
  return EMAIL_RE.test(String(email || '').trim());
}

export function receiptRowSaleStatus(row: FinanceReceiptRow): string | null {
  const sales = row.sales as { status?: string } | { status?: string }[] | undefined;
  if (Array.isArray(sales)) return sales[0]?.status ? String(sales[0].status) : null;
  if (sales && typeof sales === 'object') return sales.status ? String(sales.status) : null;
  return null;
}

export function evaluateBuyerReminderEligibility(
  input: BuyerReminderCandidateInput,
  options: {
    tenantId: string;
    event: BuyerReminderEventType;
    channel: BuyerReminderChannel;
    settings: BuyerReminderSettings;
    runDate: string;
    todayStr?: string;
    alreadySent?: boolean;
  },
): BuyerReminderEvaluation {
  const todayStr = options.todayStr || options.runDate;
  const computedStatus = computeInstallmentStatus(
    {
      status: input.rawStatus,
      due_date: input.dueDateIso,
    },
    todayStr,
  );
  const normalizedPhone = normalizeWhatsAppPhone(input.phone);
  const dueIso = toIsoDateOnly(input.dueDateIso) || '';
  const targetDue = resolveBuyerReminderTargetDueDate(options.event, options.runDate, options.settings);

  let skipReason: BuyerReminderSkipReason | null = null;
  if (!options.settings.enabled) {
    skipReason = 'automation_disabled';
  } else if (!eventEnabled(options.settings, options.event)) {
    skipReason = 'event_disabled';
  } else if (!channelEnabled(options.settings, options.channel)) {
    skipReason = 'channel_disabled';
  } else if (
    String(input.companyId || '') !== options.tenantId &&
    String(input.tenantId || '') !== options.tenantId
  ) {
    skipReason = 'other_tenant';
  } else if (options.alreadySent) {
    skipReason = 'already_sent';
  } else if (computedStatus === 'pago' || computedStatus === 'paid') {
    skipReason = 'already_paid';
  } else if (
    computedStatus === 'cancelado' ||
    computedStatus === 'canceled' ||
    computedStatus === 'cancelled'
  ) {
    skipReason = 'canceled';
  } else if (
    isCanceledSaleStatus(input.saleStatus) ||
    /distrato/i.test(String(input.saleStatus || ''))
  ) {
    skipReason = 'sale_canceled';
  } else if (!input.customerId) {
    skipReason = 'missing_customer';
  } else if (dueIso !== targetDue) {
    skipReason = 'not_due';
  } else if (options.event === 'due_soon' || options.event === 'due_today') {
    if (computedStatus !== 'pendente' && computedStatus !== 'pending') {
      skipReason = 'not_due';
    }
  } else if (options.event === 'overdue_friendly') {
    if (computedStatus !== 'atrasado' && computedStatus !== 'overdue') {
      skipReason = 'not_due';
    }
  }

  if (!skipReason && options.channel === 'whatsapp' && !normalizedPhone) {
    skipReason = String(input.phone || '').trim() ? 'invalid_phone' : 'invalid_phone';
  }
  if (!skipReason && options.channel === 'email' && !isValidReminderEmail(input.email)) {
    skipReason = 'missing_email';
  }
  if (!skipReason && !chargeHasSendablePaymentArtifact(input.charge)) {
    skipReason = 'missing_payment_method';
  }

  return {
    sendable: skipReason === null,
    skipReason,
    computedStatus,
    normalizedPhone,
  };
}

export function enabledBuyerReminderEvents(
  settings: BuyerReminderSettings,
): BuyerReminderEventType[] {
  const events: BuyerReminderEventType[] = [];
  if (!settings.enabled) return events;
  if (settings.dueSoonEnabled) events.push('due_soon');
  if (settings.dueTodayEnabled) events.push('due_today');
  if (settings.overdueEnabled) events.push('overdue_friendly');
  return events;
}

export function enabledBuyerReminderChannels(
  settings: BuyerReminderSettings,
): BuyerReminderChannel[] {
  const channels: BuyerReminderChannel[] = [];
  if (!settings.enabled) return channels;
  if (settings.whatsappEnabled) channels.push('whatsapp');
  if (settings.emailEnabled) channels.push('email');
  return channels;
}
