/**
 * Lembretes automáticos de cobrança SaaS via WhatsApp (Evolution API).
 */

import { normalizeWhatsAppPhone } from '@/lib/saasContractSignatureShare';
import {
  formatReminderAmountBr,
  formatReminderDueDateBr,
  type SaasBillingReminderType,
} from '@/lib/saasBillingReminderTypes';
import {
  isEvolutionApiConfigured,
  sendEvolutionTextMessage,
} from '@/lib/whatsapp/evolutionProvider';

export type SaasBillingReminderWhatsAppInput = {
  phone: string;
  companyName: string;
  amount: number;
  dueDate: string;
  paymentUrl: string;
  reminderType: SaasBillingReminderType;
};

export type SaasBillingReminderWhatsAppResult = {
  ok: boolean;
  normalizedPhone?: string | null;
  providerId?: string | null;
  error?: string;
};

export function isSaasBillingWhatsAppConfigured(): boolean {
  return isEvolutionApiConfigured();
}

export function normalizeBrazilianWhatsAppPhone(phone?: string | null): string | null {
  return normalizeWhatsAppPhone(phone);
}

export function buildSaasBillingReminderWhatsAppMessage(
  input: SaasBillingReminderWhatsAppInput,
): string {
  const company = String(input.companyName || 'Empresa').trim();
  const dueLabel = formatReminderDueDateBr(input.dueDate);
  const amountLabel = formatReminderAmountBr(input.amount);
  const link = String(input.paymentUrl || '').trim();

  switch (input.reminderType) {
    case 'reminder_7_days':
      return [
        `Olá, ${company}.`,
        `Sua assinatura SV LOTES vence em ${dueLabel}.`,
        `Valor: ${amountLabel}.`,
        'Para evitar bloqueio, realize o pagamento pelo link:',
        link,
      ].join('\n');
    case 'reminder_3_days':
      return [
        `Olá, ${company}.`,
        `Lembrete: sua assinatura SV LOTES vence em ${dueLabel}.`,
        `Valor: ${amountLabel}.`,
        'Link para pagamento:',
        link,
      ].join('\n');
    case 'due_today':
      return [
        `Olá, ${company}.`,
        'Sua assinatura SV LOTES vence hoje.',
        `Valor: ${amountLabel}.`,
        'Pague pelo link:',
        link,
      ].join('\n');
    case 'overdue_friendly':
      return [
        `Olá, ${company}.`,
        'Identificamos uma pendência na sua assinatura SV LOTES.',
        `Vencimento: ${dueLabel}`,
        `Valor: ${amountLabel}`,
        'Regularize pelo link:',
        link,
      ].join('\n');
    default:
      return [
        `Olá, ${company}.`,
        `Sua assinatura SV LOTES — vencimento ${dueLabel}.`,
        `Valor: ${amountLabel}.`,
        link,
      ].join('\n');
  }
}

export async function sendSaasBillingReminderWhatsApp(
  input: SaasBillingReminderWhatsAppInput,
): Promise<SaasBillingReminderWhatsAppResult> {
  if (!isSaasBillingWhatsAppConfigured()) {
    return { ok: false, error: 'Evolution API não configurada.' };
  }

  const normalizedPhone = normalizeBrazilianWhatsAppPhone(input.phone);
  if (!normalizedPhone) {
    return { ok: false, normalizedPhone: null, error: 'Telefone inválido para WhatsApp.' };
  }

  const paymentUrl = String(input.paymentUrl || '').trim();
  if (!paymentUrl) {
    return { ok: false, normalizedPhone, error: 'Cobrança sem link Asaas.' };
  }

  const text = buildSaasBillingReminderWhatsAppMessage({
    ...input,
    paymentUrl,
  });

  const result = await sendEvolutionTextMessage(normalizedPhone, text);
  if (!result.ok) {
    return {
      ok: false,
      normalizedPhone,
      error: result.error || 'Falha ao enviar WhatsApp.',
    };
  }

  return {
    ok: true,
    normalizedPhone,
    providerId: result.messageId ?? null,
  };
}
