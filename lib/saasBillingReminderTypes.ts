/**
 * Tipos e mensagens dos lembretes automáticos de cobrança SaaS.
 */

import { addDaysToIsoDate, compareIsoDates, toIsoDateOnly } from '@/lib/companySubscriptionDates';
import {
  DEFAULT_FINE_PERCENT,
  DEFAULT_INTEREST_PERCENT,
} from '@/lib/saasLateFeeConfig';

export type SaasBillingReminderType =
  | 'reminder_7_days'
  | 'reminder_3_days'
  | 'due_today'
  | 'overdue_friendly';

export type SaasBillingReminderChannel = 'email' | 'whatsapp';

export type SaasBillingReminderDefinition = {
  type: SaasBillingReminderType;
  automationId: string;
  label: string;
  subject: string;
  intro: string;
  daysBeforeDue?: number;
};

export const SAAS_BILLING_REMINDER_DEFINITIONS: SaasBillingReminderDefinition[] = [
  {
    type: 'reminder_7_days',
    automationId: 'reminder_7d',
    label: 'Lembrete 7 dias antes',
    subject: 'Sua assinatura SV LOTES vence em 7 dias',
    intro:
      'Olá, sua assinatura SV LOTES vence em 7 dias. Segue o link para pagamento.',
    daysBeforeDue: 7,
  },
  {
    type: 'reminder_3_days',
    automationId: 'reminder_3d',
    label: 'Lembrete 3 dias antes',
    subject: 'Sua assinatura SV LOTES vence em 3 dias',
    intro:
      'Sua assinatura SV LOTES vence em 3 dias. Evite suspensão do acesso realizando o pagamento.',
    daysBeforeDue: 3,
  },
  {
    type: 'due_today',
    automationId: 'reminder_due',
    label: 'Aviso no vencimento',
    subject: 'Sua assinatura SV LOTES vence hoje',
    intro: 'Sua assinatura SV LOTES vence hoje.',
    daysBeforeDue: 0,
  },
  {
    type: 'overdue_friendly',
    automationId: 'friendly_overdue',
    label: 'Cobrança amigável',
    subject: 'Pendência na sua assinatura SV LOTES',
    intro:
      'Identificamos uma pendência financeira. Regularize para evitar suspensão do acesso.',
  },
];

export function getSaasBillingReminderDefinition(
  type: SaasBillingReminderType,
): SaasBillingReminderDefinition {
  const found = SAAS_BILLING_REMINDER_DEFINITIONS.find((item) => item.type === type);
  if (!found) throw new Error(`Tipo de lembrete desconhecido: ${type}`);
  return found;
}

export function isSaasChargeStatusEligibleForReminder(status: string | null | undefined): boolean {
  const key = String(status || '').toUpperCase();
  return key === 'PENDING' || key === 'OVERDUE';
}

export function isSaasChargeStatusBlockedForReminder(status: string | null | undefined): boolean {
  const key = String(status || '').toUpperCase();
  return ['PAID', 'RECEIVED', 'CONFIRMED', 'CANCELLED', 'CANCELED', 'REFUNDED', 'DELETED'].includes(
    key,
  );
}

/** Determina quais lembretes devem ser considerados hoje para uma cobrança. */
export function resolveReminderTypesForCharge(
  dueDate: string,
  status: string,
  today: string,
): SaasBillingReminderType[] {
  if (isSaasChargeStatusBlockedForReminder(status)) return [];
  if (!isSaasChargeStatusEligibleForReminder(status)) return [];

  const due = toIsoDateOnly(dueDate);
  const runDay = toIsoDateOnly(today);
  if (!due || !runDay) return [];

  const types: SaasBillingReminderType[] = [];

  if (due === addDaysToIsoDate(runDay, 7)) types.push('reminder_7_days');
  if (due === addDaysToIsoDate(runDay, 3)) types.push('reminder_3_days');
  if (due === runDay) types.push('due_today');
  if (compareIsoDates(due, runDay) < 0) types.push('overdue_friendly');

  return types;
}

export function formatReminderDueDateBr(isoDate: string): string {
  const base = toIsoDateOnly(isoDate);
  if (!base) return '—';
  const [year, month, day] = base.split('-');
  return `${day}/${month}/${year}`;
}

export function formatReminderAmountBr(amount: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(amount || 0));
}

export function buildSaasBillingReminderLateFeeLines(): string[] {
  return [
    `Multa por atraso: ${DEFAULT_FINE_PERCENT}%`,
    `Juros diário: ${DEFAULT_INTEREST_PERCENT}% ao dia`,
  ];
}
