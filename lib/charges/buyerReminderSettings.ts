/**
 * Persistência da configuração de lembretes automáticos ao comprador.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_BUYER_REMINDER_SETTINGS,
  normalizeBuyerReminderSettings,
  type BuyerReminderSettings,
} from '@/lib/charges/buyerReminderTypes';

export async function loadBuyerReminderSettings(
  admin: SupabaseClient,
  companyId: string,
): Promise<BuyerReminderSettings> {
  const { data, error } = await admin
    .from('company_buyer_reminder_settings')
    .select('*')
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { companyId, ...DEFAULT_BUYER_REMINDER_SETTINGS };
  }
  return normalizeBuyerReminderSettings(companyId, data as Record<string, unknown>);
}

export async function listEnabledBuyerReminderSettings(
  admin: SupabaseClient,
): Promise<BuyerReminderSettings[]> {
  const { data, error } = await admin
    .from('company_buyer_reminder_settings')
    .select('*')
    .eq('enabled', true);
  if (error) throw new Error(error.message);
  return (data || []).map((row) =>
    normalizeBuyerReminderSettings(String(row.company_id), row as Record<string, unknown>),
  );
}

export async function saveBuyerReminderSettings(
  admin: SupabaseClient,
  input: BuyerReminderSettings & { updatedBy: string },
): Promise<BuyerReminderSettings> {
  const normalized = normalizeBuyerReminderSettings(input.companyId, input);
  const row = {
    company_id: normalized.companyId,
    enabled: normalized.enabled,
    whatsapp_enabled: normalized.whatsappEnabled,
    email_enabled: normalized.emailEnabled,
    due_soon_enabled: normalized.dueSoonEnabled,
    due_soon_days: normalized.dueSoonDays,
    due_today_enabled: normalized.dueTodayEnabled,
    overdue_enabled: normalized.overdueEnabled,
    overdue_days: normalized.overdueDays,
    updated_by: input.updatedBy,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await admin
    .from('company_buyer_reminder_settings')
    .upsert(row, { onConflict: 'company_id' })
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return normalizeBuyerReminderSettings(normalized.companyId, data as Record<string, unknown>);
}
