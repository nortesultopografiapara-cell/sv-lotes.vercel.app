/**
 * Configurações do Financeiro SaaS Master.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const SAAS_CASH_START_AT_KEY = 'saas_cash_start_at';

export type SaasCashStartAtValue = {
  at: string;
};

function parseSettingRow(row: Record<string, unknown> | null): string | null {
  if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
    return null;
  }
  const at = String((row.value as SaasCashStartAtValue).at || '').trim();
  return at || null;
}

export async function getSaasCashStartAt(
  supabaseAdmin: SupabaseClient,
): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('saas_finance_settings')
    .select('value')
    .eq('key', SAAS_CASH_START_AT_KEY)
    .maybeSingle();

  if (error) {
    console.warn('[saas-finance-settings] falha ao ler marco inicial:', error.message);
    return null;
  }

  return parseSettingRow(data as Record<string, unknown> | null);
}

export async function setSaasCashStartAt(
  supabaseAdmin: SupabaseClient,
  input: { at?: string; userId?: string | null },
): Promise<string> {
  const at = input.at?.trim() || new Date().toISOString();
  const now = new Date().toISOString();
  const value: SaasCashStartAtValue = { at };

  const { data: existing } = await supabaseAdmin
    .from('saas_finance_settings')
    .select('id')
    .eq('key', SAAS_CASH_START_AT_KEY)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('saas_finance_settings')
      .update({
        value,
        updated_at: now,
        updated_by: input.userId ?? null,
      })
      .eq('key', SAAS_CASH_START_AT_KEY);

    if (error) {
      throw new Error(error.message || 'Falha ao atualizar marco inicial do caixa');
    }
  } else {
    const { error } = await supabaseAdmin.from('saas_finance_settings').insert({
      key: SAAS_CASH_START_AT_KEY,
      value,
      updated_at: now,
      updated_by: input.userId ?? null,
    });

    if (error) {
      throw new Error(error.message || 'Falha ao salvar marco inicial do caixa');
    }
  }

  return at;
}

export function formatSaasCashStartAtLabel(iso: string | null | undefined): string | null {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Alias semântico — marco financeiro SaaS (Caixa + dashboards). */
export const getSaasFinanceStartAt = getSaasCashStartAt;

export type SaasFinancialRecord = {
  created_at?: string | null;
  paid_at?: string | null;
  due_date?: string | null;
  reference_month?: string | null;
  issued_at?: string | null;
  movement_date?: string | null;
};

function parseFinancialInstant(raw: string): number | null {
  const normalized = String(raw || '').trim();
  if (!normalized) return null;
  const iso = normalized.includes('T')
    ? normalized
    : `${normalized.split('T')[0]}T12:00:00`;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Data financeira principal do registro (pagamento, fatura, receita). */
export function resolveSaasFinancialRecordDate(
  record: SaasFinancialRecord,
): string | null {
  if (record.paid_at) return record.paid_at;
  if (record.due_date) return record.due_date;
  if (record.movement_date) return record.movement_date;
  if (record.issued_at) return record.issued_at;
  if (record.reference_month) {
    const [year, month] = record.reference_month.split('-');
    if (year && month) {
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      return `${year}-${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999`;
    }
  }
  if (record.created_at) return record.created_at;
  return null;
}

/** Registro entra nos KPIs financeiros SaaS somente se a data financeira >= marco. */
export function isSaasFinancialRecordAfterStartAt(
  record: SaasFinancialRecord,
  startAt?: string | null,
): boolean {
  if (!startAt) return true;
  const startMs = parseFinancialInstant(startAt);
  if (startMs == null) return true;

  const recordDate = resolveSaasFinancialRecordDate(record);
  if (!recordDate) return false;
  const recordMs = parseFinancialInstant(recordDate);
  if (recordMs == null) return false;
  return recordMs >= startMs;
}

/** Filtra registros financeiros anteriores ao marco (não apaga dados). */
export function applySaasFinanceStartAtFilter<T extends SaasFinancialRecord>(
  records: T[],
  startAt?: string | null,
): T[] {
  if (!startAt) return records;
  return records.filter((record) => isSaasFinancialRecordAfterStartAt(record, startAt));
}

/** Filtra movimentações anteriores ao marco inicial (não apaga dados). */
export function filterMovementsByCashStartAt<T extends {
  created_at?: string | null;
  movement_date: string;
}>(
  movements: T[],
  cashStartAt?: string | null,
): T[] {
  if (!cashStartAt) return movements;
  const startMs = new Date(cashStartAt).getTime();
  if (Number.isNaN(startMs)) return movements;

  return movements.filter((movement) => {
    if (movement.created_at) {
      return new Date(movement.created_at).getTime() >= startMs;
    }
    const dayEnd = new Date(`${movement.movement_date}T23:59:59.999`);
    return dayEnd.getTime() >= startMs;
  });
}

export function effectiveSaasCashFromDate(
  fromDate: string | undefined,
  cashStartAt: string | null | undefined,
): string | undefined {
  if (!fromDate && !cashStartAt) return fromDate;
  const from = fromDate || '1970-01-01';
  if (!cashStartAt) return from;
  const startDay = cashStartAt.split('T')[0];
  return from > startDay ? from : startDay;
}
