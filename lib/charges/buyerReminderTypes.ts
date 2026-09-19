/**
 * Lembretes automáticos ao comprador — tipos e configuração por empresa.
 * Timezone de negócio: America/Sao_Paulo (mesmo dos lembretes SaaS).
 */

import { addDaysToIsoDate } from '@/lib/companySubscriptionDates';

export const BUYER_REMINDER_TIMEZONE = 'America/Sao_Paulo';

export const BUYER_REMINDER_EVENT_TYPES = [
  'due_soon',
  'due_today',
  'overdue_friendly',
] as const;
export type BuyerReminderEventType = (typeof BUYER_REMINDER_EVENT_TYPES)[number];

export const BUYER_REMINDER_CHANNELS = ['whatsapp', 'email'] as const;
export type BuyerReminderChannel = (typeof BUYER_REMINDER_CHANNELS)[number];

export const BUYER_REMINDER_LOG_STATUSES = ['queued', 'sent', 'skipped', 'failed'] as const;
export type BuyerReminderLogStatus = (typeof BUYER_REMINDER_LOG_STATUSES)[number];

export const BUYER_REMINDER_SKIP_REASONS = [
  'already_paid',
  'canceled',
  'sale_canceled',
  'not_due',
  'invalid_phone',
  'missing_email',
  'missing_payment_method',
  'already_sent',
  'automation_disabled',
  'channel_disabled',
  'event_disabled',
  'missing_customer',
  'other_tenant',
] as const;
export type BuyerReminderSkipReason = (typeof BUYER_REMINDER_SKIP_REASONS)[number];

export type BuyerReminderSettings = {
  companyId: string;
  enabled: boolean;
  whatsappEnabled: boolean;
  emailEnabled: boolean;
  dueSoonEnabled: boolean;
  dueSoonDays: number;
  dueTodayEnabled: boolean;
  overdueEnabled: boolean;
  overdueDays: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
};

export const DEFAULT_BUYER_REMINDER_SETTINGS: Omit<BuyerReminderSettings, 'companyId'> = {
  enabled: false,
  whatsappEnabled: true,
  emailEnabled: false,
  dueSoonEnabled: true,
  dueSoonDays: 3,
  dueTodayEnabled: true,
  overdueEnabled: true,
  overdueDays: 3,
};

/** Teto de WhatsApp por execução completa do runner (todas as empresas). E-mail não usa este limite. */
export const BUYER_REMINDER_MAX_WHATSAPP_PER_RUN = 20;
/** Intervalo entre WhatsApp para não monopolizar a instância Z-API compartilhada com OTP/SaaS. */
export const BUYER_REMINDER_SEND_GAP_MS = 300;
export const BUYER_REMINDER_TEMPLATE_KEY = 'buyer_reminder_v1';

export function clampReminderDays(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(1, Math.round(n)));
}

export function normalizeBuyerReminderSettings(
  companyId: string,
  raw?: Partial<BuyerReminderSettings> | Record<string, unknown> | null,
): BuyerReminderSettings {
  const src = raw || {};
  const pick = (key: string, alt?: string) =>
    (src as Record<string, unknown>)[key] ?? (alt ? (src as Record<string, unknown>)[alt] : undefined);
  return {
    companyId,
    enabled: Boolean(pick('enabled')),
    whatsappEnabled: pick('whatsappEnabled', 'whatsapp_enabled') !== false,
    emailEnabled: Boolean(pick('emailEnabled', 'email_enabled')),
    dueSoonEnabled: pick('dueSoonEnabled', 'due_soon_enabled') !== false,
    dueSoonDays: clampReminderDays(pick('dueSoonDays', 'due_soon_days'), 3),
    dueTodayEnabled: pick('dueTodayEnabled', 'due_today_enabled') !== false,
    overdueEnabled: pick('overdueEnabled', 'overdue_enabled') !== false,
    overdueDays: clampReminderDays(pick('overdueDays', 'overdue_days'), 3),
    updatedAt: (pick('updatedAt', 'updated_at') as string | null) || null,
    updatedBy: (pick('updatedBy', 'updated_by') as string | null) || null,
  };
}

export function eventEnabled(settings: BuyerReminderSettings, event: BuyerReminderEventType): boolean {
  if (!settings.enabled) return false;
  if (event === 'due_soon') return settings.dueSoonEnabled;
  if (event === 'due_today') return settings.dueTodayEnabled;
  return settings.overdueEnabled;
}

export function channelEnabled(settings: BuyerReminderSettings, channel: BuyerReminderChannel): boolean {
  if (!settings.enabled) return false;
  if (channel === 'whatsapp') return settings.whatsappEnabled;
  return settings.emailEnabled;
}

export function resolveBuyerReminderTargetDueDate(
  event: BuyerReminderEventType,
  runDate: string,
  settings: BuyerReminderSettings,
): string {
  if (event === 'due_soon') return addDaysToIsoDate(runDate, settings.dueSoonDays);
  if (event === 'due_today') return runDate;
  return addDaysToIsoDate(runDate, -settings.overdueDays);
}
